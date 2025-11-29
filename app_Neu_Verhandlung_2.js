/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const round10 = (v) => Math.round(v / 10) * 10;

const eur = n =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);


/* ============================================================
   ZUSTAND
============================================================ */

function newState() {
  const randomInitial = randInt(5000, 6500);  // Startpreis
  const randomMin = randomInitial - randInt(800, 1300); // Schmerzgrenze

  return {
    participant_id: crypto.randomUUID?.() ||
      ("x_" + Date.now() + Math.random().toString(36).slice(2)),

    runde: 1,
    max_runden: randInt(7, 12),

    initial_offer: randomInitial,
    min_price: randomMin,
    current_offer: randomInitial,

    history: [],

    warningCount: 0,
    warningText: "",
    finished: false,
    accepted: false,
    deal_price: null
  };
}

let state = newState();


/* ============================================================
   PREISLOGIK
============================================================ */

// Runde 1–3: 250–500 €
function reductionEarly() {
  return randInt(250, 500);
}

// Runde 4+: 1–25 % der Nutzerdifferenz
function reductionLate(userOffer) {
  let diff;

  // Wenn Nutzer erst 1 Angebot gemacht hat → diff = Startpreis – Angebot
  const history = state.history.filter(h => h.proband_counter !== null);

  if (history.length < 2) {
    diff = Math.abs(state.initial_offer - userOffer);
  } else {
    const last = history[history.length - 1].proband_counter;
    const prev = history[history.length - 2].proband_counter;
    diff = Math.abs(last - prev);
  }

  if (diff <= 0) diff = 50; // fallback, falls gleiches Angebot

  const percent = randInt(1, 25) / 100; // 1–25 %
  let step = diff * percent;

  return round10(step);
}


/* ============================================================
   NÄCHSTES VERKÄUFERANGEBOT
============================================================ */

function computeNextOffer(userOffer) {
  let prev = state.current_offer;
  let step;

  if (state.runde <= 3) {
    step = reductionEarly();
  } else {
    step = reductionLate(userOffer);
  }

  let newPrice = prev - step;

  if (newPrice < state.min_price)
    newPrice = state.min_price;

  newPrice = round10(newPrice);

  return newPrice;
}


/* ============================================================
   UI SCREENS
============================================================ */

function viewVignette() {
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>
    <p class="muted">Stelle dir folgende Situation vor:</p>

    <p>Du befindest dich auf einer exklusiven Messe für Designer-Möbel.
       Ein Besucher möchte sein hochwertiges Designer-Ledersofa verkaufen.</p>

    <p>Auf der nächsten Seite beginnt die Preisverhandlung.</p>

    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox"/>
        <span>Ich stimme der anonymen Datenspeicherung zu.</span>
      </label>

      <button id="startBtn" disabled>Verhandlung starten</button>
    </div>
  `;

  const consent = document.getElementById("consent");
  const startBtn = document.getElementById("startBtn");

  consent.addEventListener("change", () => {
    startBtn.disabled = !consent.checked;
  });

  startBtn.addEventListener("click", () => {
    state = newState();
    viewNegotiate();
  });
}

function viewThink(next) {
  app.innerHTML = `
    <h1>Die Verkäuferseite überlegt<span class="pulse">…</span></h1>
    <p class="muted">Bitte einen Moment Geduld.</p>
  `;

  setTimeout(next, randInt(1200, 2400));
}

function viewNegotiate(error) {
  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card">
      <strong>Aktuelles Angebot der Verkäuferseite:</strong>
      ${eur(state.current_offer)}
    </div>

    <label>Dein Gegenangebot:</label>
    <div class="row">
      <input id="counter" type="number" min="0" step="1"/>
      <button id="sendBtn">Senden</button>
    </div>

    <button id="acceptBtn" class="ghost">Annehmen</button>

    ${historyTable()}

    ${error ? `<p style="color:red">${error}</p>` : ""}
  `;

  const counter = document.getElementById("counter");
  const sendBtn = document.getElementById("sendBtn");

  sendBtn.addEventListener("click", () => handleCounterInput());
  counter.addEventListener("keydown", e => {
    if (e.key === "Enter") handleCounterInput();
  });

  document.getElementById("acceptBtn")
    .addEventListener("click", () => finish(true, state.current_offer));
}


function historyTable() {
  if (!state.history.length) return "";

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr>
          <th>Runde</th>
          <th>Verkäufer</th>
          <th>Du</th>
        </tr>
      </thead>
      <tbody>
        ${state.history.map(h => `
          <tr>
            <td>${h.runde}</td>
            <td>${eur(h.algo_offer)}</td>
            <td>${h.proband_counter !== null ? eur(h.proband_counter) : "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* ============================================================
   ANGEBOT SENDEN
============================================================ */

function handleCounterInput() {
  const counter = Number(document.getElementById("counter").value);

  if (!Number.isFinite(counter) || counter <= 0)
    return viewNegotiate("Bitte eine gültige Zahl eingeben.");

  const prev = state.current_offer;

  // speichern
  state.history.push({
    runde: state.runde,
    algo_offer: prev,
    proband_counter: counter
  });

  // neues Verkäuferangebot berechnen
  const next = computeNextOffer(counter);
  state.current_offer = next;

  if (state.runde >= state.max_runden) {
    return viewThink(() => viewDecision());
  }

  state.runde++;
  viewThink(() => viewNegotiate());
}


/* ============================================================
   ABSCHLUSS
============================================================ */

function viewDecision() {
  app.innerHTML = `
    <h1>Letzte Runde</h1>
    <p>Letztes Angebot: ${eur(state.current_offer)}</p>

    <button id="takeBtn">Annehmen</button>
    <button id="noBtn" class="ghost">Ablehnen</button>

    ${historyTable()}
  `;

  document.getElementById("takeBtn")
    .addEventListener("click", () => finish(true, state.current_offer));

  document.getElementById("noBtn")
    .addEventListener("click", () => finish(false, null));
}

function finish(accepted, deal) {
  state.finished = true;
  state.accepted = accepted;
  state.deal_price = deal;

  app.innerHTML = `
    <h1>Verhandlung abgeschlossen</h1>

    <p><strong>Ergebnis:</strong><br>
       ${accepted
         ? `Einigung erzielt bei ${eur(deal)}`
         : "Keine Einigung erzielt."
       }
    </p>

    ${historyTable()}

    <button id="restartBtn">Neue Verhandlung</button>
  `;

  document.getElementById("restartBtn")
    .addEventListener("click", () => {
      state = newState();
      viewVignette();
    });
}


/* ============================================================
   START
============================================================ */

viewVignette();

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


