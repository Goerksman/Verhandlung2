/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const round10 = v => Math.round(v / 10) * 10;

const eur = n =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(n);


/* ============================================================
   ZUSTAND – Fester Startpreis & Schmerzgrenze
============================================================ */

function newState() {
  const startpreis = 5500;
  const schmerzgrenze = 4500;

  return {
    participant_id:
      crypto.randomUUID?.() ||
      "x_" + Date.now() + Math.random().toString(36).slice(2),

    runde: 1,
    max_runden: randInt(8, 12),

    initial_offer: startpreis,
    min_price: schmerzgrenze,
    current_offer: startpreis,

    history: [],

    finished: false,
    accepted: false,
    deal_price: null,

    warningCount: 0,
    warningText: "",
    patternMessage: ""
  };
}

let state = newState();


/* ============================================================
   PREISLOGIK
============================================================ */

// Runde 1–3 → feste Absenkung 250–500 €
function reductionEarly() {
  return randInt(250, 500);
}

// Runde 4+ → 1–25 % der Nutzerdifferenz
function reductionLate(userOffer) {
  let diff;

  const offers = state.history.filter(h => h.proband_counter !== null);

  if (offers.length < 2) {
    diff = Math.abs(state.initial_offer - userOffer);
  } else {
    const last = offers[offers.length - 1].proband_counter;
    const prev = offers[offers.length - 2].proband_counter;
    diff = Math.abs(last - prev);
  }

  if (diff <= 0) diff = 50;

  const percent = randInt(1, 25) / 100;
  return round10(diff * percent);
}


/* ============================================================
   NÄCHSTES ANGEBOT BERECHNEN
============================================================ */

function computeNextOffer(userOffer) {
  const prev = state.current_offer;

  let step =
    state.runde <= 3 ? reductionEarly() : reductionLate(userOffer);

  let newPrice = prev - step;

  if (newPrice < state.min_price)
    newPrice = state.min_price;

  return round10(newPrice);
}


/* ============================================================
   ABBRUCHWAHRSCHEINLICHKEIT
============================================================ */

function abortProbability(userOffer) {
  let chance = 0;

  // Unter 3000 €
  if (userOffer < 3000) {
    chance += randInt(10, 30);
  }

  // Minimaler Schritt (≤ 20 €)
  const last = state.history[state.history.length - 1];
  if (last && last.proband_counter !== null) {
    const diff = Math.abs(userOffer - last.proband_counter);
    if (diff <= 20) {
      chance += randInt(5, 20);
    }
  }

  // Spätere Runden
  chance += state.runde * 2;

  if (chance > 75) chance = 75;

  return chance;
}

function maybeAbort(userOffer) {
  const chance = abortProbability(userOffer);
  const roll = randInt(1, 100);

  if (roll <= chance) {
    state.finished = true;
    state.accepted = false;
    state.deal_price = null;
    viewAbort(chance);
    return true;
  }
  return false;
}


/* ============================================================
   SCREEN: Abbruch durch Verkäuferseite
============================================================ */

function viewAbort(chance) {
  app.innerHTML = `
    <h1>Verhandlung abgebrochen</h1>

    <p>Die Verkäuferseite hat die Verhandlung vorzeitig beendet.</p>
    <p class="muted">Abbruchwahrscheinlichkeit: ${chance}%</p>

    ${renderHistory()}

    <button id="restartBtn">Neue Verhandlung</button>
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };
}


/* ============================================================
   SCREEN: VIGNETTE
============================================================ */

function viewVignette() {
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>
    <p class="muted">Stelle dir folgende Situation vor:</p>

    <p>Du befindest dich auf einer <b>exklusiven Verkaufsmesse</b> für Designermöbel.
       Ein Besucher möchte sein <b>gebrauchtes Designer-Ledersofa</b> verkaufen.
       Es handelt sich um ein hochwertiges, gepflegtes Stück mit einzigartigem Design.
       Vergleichbare Sofas liegen zwischen <b>2.500 € und 10.000 €</b>.</p>

    <p>Der Verkäufer reagiert auf deine Angebote und passt seinen Preis an —
       bleibt aber selbstbewusst und verfolgt seine eigene Preisuntergrenze.</p>

    <p class="muted"><b>Hinweis:</b> Die Verhandlung dauert zufällig 8–12 Runden.</p>

    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme der anonymen Datenspeicherung zu.</span>
      </label>
      <div><button id="startBtn" disabled>Verhandlung starten</button></div>
    </div>
  `;

  const c = document.getElementById("consent");
  const b = document.getElementById("startBtn");

  const sync = () => (b.disabled = !c.checked);
  c.addEventListener("change", sync);
  sync();

  b.onclick = () => {
    state = newState();
    viewNegotiate();
  };
}


/* ============================================================
   HISTORY TABLE
============================================================ */

function renderHistory() {
  if (!state.history.length) return "";

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr><th>Runde</th><th>Verkäufer</th><th>Du</th></tr>
      </thead>
      <tbody>
        ${state.history
          .map(h => `
            <tr>
              <td>${h.runde}</td>
              <td>${eur(h.algo_offer)}</td>
              <td>${h.proband_counter != null ? eur(h.proband_counter) : "-"}</td>
            </tr>
          `)
          .join("")}
      </tbody>
    </table>
  `;
}


/* ============================================================
   SCREEN: VERHANDLUNG
============================================================ */

function viewNegotiate(errorMsg){
  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>
    <div class="grid">
      <div class="card" style="padding:16px;background:#fafafa;border-radius:12px;border:1px dashed var(--accent);">
        <div><strong>Aktuelles Angebot der Verkäuferseite:</strong> ${eur(state.current_offer)}</div>
      </div>
      <label for="counter">Dein Gegenangebot in €</label>
      <div class="row">
        <input id="counter" type="number" step="0.01" min="0" required />
        <button id="sendBtn">Gegenangebot senden</button>
      </div>
      <button id="acceptBtn" class="ghost">Angebot annehmen &amp; Verhandlung beenden</button>
    </div>
    ${historyTable()}
    ${state.patternMessage
      ? `<p style="color:#1f2937;background:#e5e7eb;border:1px solid #d1d5db;padding:8px 10px;border-radius:8px;">
           <strong>Verkäuferseite:</strong> ${state.patternMessage}
         </p>`
      : ``}
    ${state.warningText
      ? `<p style="color:#b45309;background:#fffbeb;border:1px solid #fbbf24;padding:8px 10px;border-radius:8px;">
           <strong>Verwarnung:</strong> ${state.warningText}
         </p>`
      : ``}
    ${errorMsg
      ? `<p style="color:#b91c1c;"><strong>Fehler:</strong> ${errorMsg}</p>`
      : ``}
  `;

  const inputEl = document.getElementById('counter');
  const sendBtn = document.getElementById('sendBtn');

  function handleSubmit(){
    const val = inputEl.value.trim().replace(',','.');
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0){
      viewNegotiate('Bitte eine gültige Zahl ≥ 0 eingeben.');
      return;
    }

    const prevOffer = state.current_offer;

    // Auto-Accept (inkl. 5%-Regel)
    if (shouldAutoAccept(state.initial_offer, state.min_price, prevOffer, num)) {
      ...
    }

    // Unakzeptable Angebote ...
    if (num < UNACCEPTABLE_LIMIT) {
      ...
    }

    // akzeptable Angebote ...
    const prev = state.current_offer;
    const next = computeNextOffer(prev, state.min_price, num, state.runde, state.last_concession);
    ...
  }

  sendBtn.addEventListener('click', handleSubmit);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } });

  document.getElementById('acceptBtn').addEventListener('click', () => {
    ...
  });
}



/* ============================================================
   HANDLE SUBMIT – NEUE VERSION
============================================================ */

function handleSubmit() {
  const val = inputEl.value.trim().replace(",", ".");
  const num = Number(val);

  if (!Number.isFinite(num) || num <= 0) {
    viewNegotiate("Bitte gültige Zahl ≥ 0 eingeben.");
    return;
  }

  const prevOffer = state.current_offer;

  // AUTO-ACCEPT
  if (num >= prevOffer) {
    state.history.push({ runde: state.runde, algo_offer: prevOffer, proband_counter: num, accepted: true });
    state.accepted = true;
    state.finished = true;
    state.deal_price = num;
    viewThink(() => viewFinish(true));
    return;
  }

  // ABBRUCH CHANCE
  if (maybeAbort(num)) return;

  // UNAKZEPTABEL
  if (num < 2250) {
    state.warningCount++;

    state.warningText =
      "Ihr Angebot liegt deutlich unter der akzeptablen Preiszone.";

    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num
    });

    if (state.warningCount >= 2) {
      state.finished = true;
      viewThink(() => viewFinish(false));
      return;
    }

    state.runde++;
    viewThink(() => viewNegotiate());
    return;
  }

  // NORMAL
  state.warningText = "";

  state.history.push({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num
  });

  const next = computeNextOffer(num);
  state.current_offer = next;

  if (state.runde >= state.max_runden) {
    viewThink(() => viewDecision());
    return;
  }

  state.runde++;
  viewThink(() => viewNegotiate());
}


/* ============================================================
   SCREEN: Letzte Runde
============================================================ */

function viewDecision() {
  app.innerHTML = `
    <h1>Letzte Runde</h1>

    <div class="card">
      <strong>Letztes Angebot:</strong> ${eur(state.current_offer)}
    </div>

    <button id="acceptBtn">Annehmen</button>
    <button id="declineBtn" class="ghost">Ablehnen</button>

    ${renderHistory()}
  `;

  document.getElementById("acceptBtn").onclick = () =>
    finish(true, state.current_offer);

  document.getElementById("declineBtn").onclick = () =>
    finish(false, null);
}


/* ============================================================
   FINISH
============================================================ */

function finish(accepted, deal) {
  state.accepted = accepted;
  state.finished = true;
  state.deal_price = deal;

  app.innerHTML = `
    <h1>Verhandlung beendet</h1>

    <p>${accepted
        ? `Einigung erzielt bei <b>${eur(deal)}</b>`
        : "Keine Einigung erzielt."}
    </p>

    ${renderHistory()}

    <button id="restartBtn">Neue Verhandlung</button>
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };
}


/* ============================================================
   START
============================================================ */

viewVignette();


