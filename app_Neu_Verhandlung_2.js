/* ============================================================
      GRUNDKONFIGURATION
   ============================================================ */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const UNACCEPTABLE_LIMIT = 2250;

/* ============================================================
      PREISLOGIK
   ============================================================ */

// Runde 1–3 → große Schritte (250–500 €), abhängig vom Gegenangebot
function calculateEarlyReduction(userOffer) {
  const MAX = 500;
  const MIN = 250;
  const THR = 3000;

  if (userOffer >= THR) return MAX;

  const ratio = userOffer / THR;
  return Math.round(MIN + ratio * (MAX - MIN));
}

// Runde 4+ → immer kleinere Schritte Richtung Schmerzgrenze
function calculateLateReduction(currentPrice, minPrice, round, totalRounds) {
  const remainingRounds = totalRounds - round + 1;
  const remainingDiff = currentPrice - minPrice;

  if (remainingDiff <= 0) return 0;

  const reduction = remainingDiff / remainingRounds;
  return Math.max(5, Math.round(reduction));
}

// Rundung auf 25 €
function round25(v) {
  return Math.round(v / 25) * 25;
}

/* ============================================================
      ZUSTAND
   ============================================================ */

function newState() {
  return {
    participant_id:
      crypto.randomUUID?.() ||
      "p_" + Date.now() + Math.random().toString(36).slice(2),

    runde: 1,
    maxRounds: randInt(7, 12),

    initial_offer: 5500,
    current_offer: 5500,
    min_price: Math.round(5500 * 0.7),

    history: [],
    warningCount: 0,
    warningText: "",
    patternMessage: "",
    finished: false,
    accepted: false,
    deal_price: null
  };
}

let state = newState();

/* ============================================================
      AUTO-ACCEPT
   ============================================================ */

function shouldAutoAccept(prevOffer, userOffer, minPrice) {
  const diff = Math.abs(prevOffer - userOffer);

  // 5% Regel
  if (diff <= prevOffer * 0.05) return true;

  // >= Schmerzgrenze
  if (userOffer >= minPrice) return true;

  return false;
}

/* ============================================================
      VERHANDLUNGSENGINE
   ============================================================ */

function computeNextOffer(prev, minPrice, userOffer, round, maxRounds) {
  let reduction;

  if (round <= 3) {
    reduction = calculateEarlyReduction(userOffer);
  } else {
    reduction = calculateLateReduction(prev, minPrice, round, maxRounds);
  }

  let newPrice = prev - reduction;
  if (newPrice < minPrice) newPrice = minPrice;

  return round25(newPrice);
}

/* ============================================================
      UI – SCREENS
   ============================================================ */

const app = document.getElementById("app");

function eur(n) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(n);
}

/* --------------------------- STARTSCREEN --------------------------- */

function viewVignette() {
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>
    <p class="muted">Stelle dir folgende Situation vor:</p>

    <p>Du befindest dich auf einer <b>exklusiven Verkaufsmesse</b>.  
       Ein Besucher will seine <b>Designer-Ledercouch</b> verkaufen.  
       Ihr beginnt zu verhandeln.</p>

    <p class="muted"><b>Hinweis:</b> Die Verhandlung umfasst zwischen 7 und 12 Runden.</p>

    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox">
        <span>Ich stimme der anonymen Datenspeicherung zu.</span>
      </label>
      <div><button id="startBtn" disabled>Verhandlung starten</button></div>
    </div>
  `;

  const cb = document.getElementById("consent");
  const btn = document.getElementById("startBtn");

  cb.addEventListener("change", () => {
    btn.disabled = !cb.checked;
  });

  btn.addEventListener("click", () => {
    state = newState();
    viewNegotiate();
  });
}

/* --------------------------- VERLAUFSTABELLE --------------------------- */

function historyTable() {
  if (!state.history.length) return "";

  const rows = state.history
    .map(
      (h) => `
      <tr>
        <td>${h.runde}</td>
        <td>${eur(h.algo_offer)}</td>
        <td>${h.proband_counter ? eur(h.proband_counter) : "-"}</td>
        <td>${h.accepted ? "Ja" : "Nein"}</td>
      </tr>`
    )
    .join("");

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr><th>Runde</th><th>Verkäufer</th><th>Proband</th><th>Angenommen?</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* --------------------------- VERHANDLUNG --------------------------- */

function viewNegotiate(errorMsg) {
  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="grid">
      <div class="card">
        <strong>Aktuelles Angebot der Verkäuferseite:</strong> ${eur(
          state.current_offer
        )}
      </div>

      <label>Dein Gegenangebot</label>
      <div class="row">
        <input id="counter" type="number" min="0" step="0.01">
        <button id="sendBtn">Senden</button>
      </div>

      <button id="acceptBtn" class="ghost">
        Angebot annehmen & Verhandlung beenden
      </button>
    </div>

    ${historyTable()}

    ${state.warningText
      ? `<p style="color:#b45309;background:#fff3cd;padding:8px;border-radius:8px;">
           <b>Verwarnung:</b> ${state.warningText}
         </p>`
      : ""}

    ${state.patternMessage
      ? `<p style="background:#eef;padding:8px;border-radius:8px;">
           <b>Verkäuferseite:</b> ${state.patternMessage}
         </p>`
      : ""}

    ${errorMsg ? `<p style="color:red;">${errorMsg}</p>` : ""}
  `;

  const input = document.getElementById("counter");
  const sendBtn = document.getElementById("sendBtn");

  sendBtn.addEventListener("click", () => handleCounter(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCounter(input.value);
  });

  document.getElementById("acceptBtn").addEventListener("click", () => {
    finishNegotiation(true, state.current_offer);
  });
}

/* --------------------------- GEGENANGEBOT LOGIK --------------------------- */

function handleCounter(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    viewNegotiate("Bitte eine gültige Zahl eingeben.");
    return;
  }

  const prevOffer = state.current_offer;

  // Auto-Accept
  if (shouldAutoAccept(prevOffer, num, state.min_price)) {
    finishNegotiation(true, num);
    return;
  }

  // Unacceptable (<2250)
  if (num < UNACCEPTABLE_LIMIT) {
    state.warningCount++;
    state.warningText =
      "Ein solches Angebot ist zu niedrig. Bitte realistisch bleiben.";

    if (state.warningCount >= 2) {
      finishNegotiation(false, prevOffer);
      return;
    }

    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: false
    });

    state.runde++;
    viewNegotiate();
    return;
  }

  // Akzeptables Angebot → Verkäufer berechnet neues Angebot
  const nextOffer = computeNextOffer(
    prevOffer,
    state.min_price,
    num,
    state.runde,
    state.maxRounds
  );

  state.history.push({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num,
    accepted: false
  });

  state.current_offer = nextOffer;

  // Letzte Runde?
  if (state.runde >= state.maxRounds) {
    viewDecision();
    return;
  }

  state.runde++;
  viewNegotiate();
}

/* --------------------------- LETZTE RUNDE --------------------------- */

function viewDecision() {
  app.innerHTML = `
    <h1>Letzte Runde erreicht</h1>

    <div class="grid">
      <div class="card">
        <strong>Letztes Angebot der Verkäuferseite:</strong> ${eur(
          state.current_offer
        )}
      </div>

      <button id="takeBtn">Annehmen</button>
      <button id="noBtn" class="ghost">Ohne Einigung beenden</button>
    </div>

    ${historyTable()}
  `;

  document.getElementById("takeBtn").addEventListener("click", () => {
    finishNegotiation(true, state.current_offer);
  });

  document.getElementById("noBtn").addEventListener("click", () => {
    finishNegotiation(false, state.current_offer);
  });
}

/* --------------------------- ABSCHLUSS --------------------------- */

function finishNegotiation(accepted, dealPrice) {
  state.accepted = accepted;
  state.finished = true;
  state.deal_price = dealPrice;

  app.innerHTML = `
    <h1>Verhandlung abgeschlossen</h1>

    <div class="grid">
      <div class="card">
        <strong>Ergebnis:</strong><br><br>
        ${
          accepted
            ? `Einigung erzielt bei <b>${eur(dealPrice)}</b>.`
            : `Keine Einigung erzielt.<br>Letztes Angebot: ${eur(
                state.current_offer
              )}.`
        }
      </div>

      <button id="restartBtn">Neue Verhandlung starten</button>
    </div>

    ${historyTable()}
  `;

  document
    .getElementById("restartBtn")
    .addEventListener("click", () => viewVignette());
}

/* ============================================================
      START
   ============================================================ */

viewVignette();

