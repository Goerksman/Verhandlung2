/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const eur = n =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(n);

const round50 = n => Math.round(n / 50) * 50;

const app = document.getElementById("app");



/* ============================================================
   DIMENSIONSSYSTEM
   1.0 – normal
   1.3 – stärker
   1.5 – sehr stark
============================================================ */

const DIM_FACTORS = [1.0, 1.3, 1.5];
let DIM_QUEUE = [];

function shuffleDimensions() {
  DIM_QUEUE = [...DIM_FACTORS];
  for (let i = DIM_QUEUE.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [DIM_QUEUE[i], DIM_QUEUE[j]] = [DIM_QUEUE[j], DIM_QUEUE[i]];
  }
}
function nextDimension() {
  if (DIM_QUEUE.length === 0) shuffleDimensions();
  return DIM_QUEUE.pop();
}



/* ============================================================
   SPIELZUSTAND
============================================================ */

function newState() {
  const f = nextDimension();  // Dimensionsfaktor

  const baseStart = 5500;
  const baseMin   = 4000;
  const baseStep  = 300;

  const startpreis = round50(baseStart * f);
  const mindest    = round50(baseMin   * f);
  const step       = round50(baseStep  * f);

  return {
    participant_id:
      crypto.randomUUID?.() || "v_" + Date.now(),

    runde: 1,
    max_runden: randInt(8, 12),

    scale: f,
    initial_offer: startpreis,
    min_price: mindest,
    current_offer: startpreis,
    step_amount: step,

    history: [],
    accepted: false,
    finished: false,
    warningText: ""
  };
}

let state = newState();



/* ============================================================
   OPTION A — Algorithmus akzeptiert gute Angebote
============================================================ */

function shouldAccept(userOffer) {
  const s = state.current_offer;
  const diffPerc = Math.abs(s - userOffer) / s;

  if (userOffer >= s) return true;      // Käufer überbietet
  if (userOffer >= s * 0.95) return true; // innerhalb 5 %
  if (userOffer >= 5000 * state.scale) return true;
  if (state.max_runden - state.runde <= 1 && userOffer >= state.min_price)
    return true;

  return false;
}



/* ============================================================
   PREISBERECHNUNG — Verkäufer unterbietet NIE den Käufer
============================================================ */

function computeNextOffer(userOffer) {

  if (shouldAccept(userOffer)) return userOffer;

  let next = state.current_offer - state.step_amount;
  if (next < state.min_price) next = state.min_price;

  return round50(next);
}



/* ============================================================
   ABBRUCHWAHRSCHEINLICHKEIT (Version 3 – korrekt)
============================================================ */

function abortProbability(userOffer) {
  const s = state.current_offer;
  const diff = Math.abs(s - userOffer);
  const f = state.scale;

  let chance = 0;

  // 1. Extrem niedrige Angebote sofort riskant
  if (userOffer < 1500 * f) return 100;

  // 2. "Unerwünscht" Bereich (<2250*F)
  if (userOffer < 2250 * f) chance += randInt(20, 40);

  // Differenzbasierte Regel (NEUE VERSION):
  // Große Schritte = gut (senkt Risiko)
  // Kleine Schritte = schlecht (erhöht Risiko)

  if (diff < 50 * f) chance += 35;
  else if (diff < 100 * f) chance += 25;
  else if (diff < 150 * f) chance += 15;
  else if (diff < 250 * f) chance += 5;
  else chance -= 5;  // große Schritte → Bonus

  chance = Math.max(0, Math.min(chance, 95));
  return chance;
}



/* ============================================================
   REALER ABBRUCH
============================================================ */

function maybeAbort(userOffer) {
  const chance = abortProbability(userOffer);
  const roll = randInt(1, 100);

  if (roll <= chance) {

    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: userOffer,
      accepted: false,
      finished: true,
      deal_price: ""
    });

    state.finished = true;
    state.accepted = false;

    viewAbort(chance);
    return true;
  }

  return false;
}



/* ============================================================
   LOGGING
============================================================ */

function logRound(row) {
  if (window.sendRow) {
    window.sendRow({
      participant_id: state.participant_id,
      player_id: window.playerId,
      proband_code: window.probandCode,

      runde: row.runde,
      algo_offer: row.algo_offer,
      proband_counter: row.proband_counter,
      accepted: row.accepted,
      finished: row.finished,
      deal_price: row.deal_price
    });
  }
}



/* ============================================================
   RENDER HELPER
============================================================ */

function renderHistory() {
  return `
    <h2>Verlauf</h2>
    <table>
      <thead><tr><th>R</th><th>Verkäufer</th><th>Du</th></tr></thead>
      <tbody>
        ${state.history.map(h => `
          <tr>
            <td>${h.runde}</td>
            <td>${eur(h.algo_offer)}</td>
            <td>${h.proband_counter ? eur(h.proband_counter) : "-"}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}



/* ============================================================
   SCREENS
============================================================ */

function viewAbort(chance) {
  app.innerHTML = `
    <div class="card">
      <h1>Verhandlung abgebrochen</h1>
      <p class="muted">Abbruchwahrscheinlichkeit dieser Runde: <b>${chance}%</b></p>
      ${renderHistory()}
      <button id="restartBtn">Neue Verhandlung</button>
    </div>
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };
}


function viewVignette() {
  app.innerHTML = `
    <div class="card">
      <h1>Designer-Verkaufsmesse</h1>
      <p>Ein Verkäufer bietet eine hochwertige <b>Designer-Ledercouch</b> an
      (Preisrange 2.500–10.000 €).</p>

      <p class="muted">Die Verhandlung dauert zwischen 8 und 12 Runden.
      Zu niedrige oder zu kleine Schritte können das Abbruchrisiko erhöhen.</p>

      <label><input id="consent" type="checkbox"> Ich stimme der Datenspeicherung zu.</label>
      <button id="startBtn" disabled>Start</button>
    </div>
  `;

  const c = document.getElementById("consent");
  const b = document.getElementById("startBtn");
  c.onchange = () => b.disabled = !c.checked;
  b.onclick = () => {
    state = newState();
    viewNegotiate();
  };
}



/* ============================================================
   VERHANDLUNGSSCREEN – Risiko wird NUR nach Angebot aktualisiert
============================================================ */

function viewNegotiate(errorMsg = "") {

  // Risiko basiert auf letztem Käuferangebot
  const last = state.history[state.history.length - 1];
  const lastOffer = last ? last.proband_counter : state.current_offer;

  const abortChance = abortProbability(lastOffer);

  let color = "#16a34a";
  if (abortChance > 50) color = "#ea580c";
  else if (abortChance > 25) color = "#eab308";

  app.innerHTML = `
    <div class="card">
      <h1>Verkaufsverhandlung</h1>
      <p class="muted">Verhandlungs-ID: ${state.participant_id}</p>

      <div class="card">
        <strong>Aktuelles Verkäuferangebot:</strong> ${eur(state.current_offer)}
      </div>

      <div style="
        border-left:6px solid ${color};
        background:${color}22;
        margin-top:10px;padding:10px;">
        <b style="color:${color};">Abbruchwahrscheinlichkeit:</b>
        <span style="color:${color};font-weight:600;">${abortChance}%</span>
      </div>

      <label>Dein Gegenangebot:</label>
      <input id="counter" type="number">

      <button id="sendBtn">Senden</button>
      <button id="acceptBtn" class="ghost">Annehmen</button>

      ${errorMsg ? `<p style="color:red">${errorMsg}</p>` : ""}
      ${renderHistory()}
    </div>
  `;

  document.getElementById("sendBtn").onclick =
    () => handleSubmit(document.getElementById("counter").value);

  document.getElementById("acceptBtn").onclick =
    () => finish(true, state.current_offer);
}



/* ============================================================
   HANDLE SUBMIT
============================================================ */

function handleSubmit(raw) {
  const num = Number(raw);

  if (!Number.isFinite(num) || num <= 0)
    return viewNegotiate("Bitte eine gültige Zahl eingeben.");

  // kein niedrigeres Angebot erlaubt
  if (state.history.length > 0) {
    const last = state.history[state.history.length - 1].proband_counter;
    if (last && num < last)
      return viewNegotiate("Du darfst kein niedrigeres Angebot machen.");
  }

  // akzeptiert der Algorithmus?
  if (shouldAccept(num)) {
    state.history.push({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: num
    });

    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: num,
      accepted: true,
      finished: true,
      deal_price: num
    });

    return finish(true, num);
  }

  // realer Abbruch
  if (maybeAbort(num)) return;

  // normale Runde
  state.history.push({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: num
  });

  logRound({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: num,
    accepted: false,
    finished: false,
    deal_price: ""
  });

  state.current_offer = computeNextOffer(num);

  if (state.runde >= state.max_runden)
    return viewDecision();

  state.runde++;
  viewNegotiate();
}



/* ============================================================
   LETZTE RUNDE
============================================================ */

function viewDecision() {
  app.innerHTML = `
    <div class="card">
      <h1>Letzte Runde</h1>
      <p>Letztes Angebot: ${eur(state.current_offer)}</p>

      <button id="acceptBtn">Annehmen</button>
      <button id="declineBtn" class="ghost">Ablehnen</button>

      ${renderHistory()}
    </div>
  `;

  document.getElementById("acceptBtn").onclick =
    () => finish(true, state.current_offer);

  document.getElementById("declineBtn").onclick =
    () => finish(false, null);
}



/* ============================================================
   FINISH
============================================================ */

function finish(accepted, dealPrice) {

  state.finished = true;
  state.accepted = accepted;
  state.deal_price = dealPrice;

  logRound({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: dealPrice,
    accepted,
    finished: true,
    deal_price: dealPrice
  });

  app.innerHTML = `
    <div class="card">
      <h1>Verhandlung beendet</h1>
      <p>${accepted ? `Einigung erzielt bei <b>${eur(dealPrice)}</b>` : "Keine Einigung."}</p>
      ${renderHistory()}
      <button id="restartBtn">Neu starten</button>
    </div>
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };
}



/* ============================================================
   INIT
============================================================ */

viewVignette();
