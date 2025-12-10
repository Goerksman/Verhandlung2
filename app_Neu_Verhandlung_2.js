/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const eur = n =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const round50 = n => Math.round(n / 50) * 50;

const app = document.getElementById("app");



/* ============================================================
   DIMENSIONSSYSTEM
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
  const f = nextDimension();

  const baseStart = 5500;
  const baseMin   = 4000;
  const baseStep  = 300;

  const startpreis = round50(baseStart * f);
  const mindest    = round50(baseMin   * f);
  const step       = round50(baseStep  * f);

  return {
    participant_id: crypto.randomUUID?.() || "v_" + Date.now(),

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

  if (userOffer >= s) return true;
  if (diffPerc <= 0.05) return true;
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
   WARNUNGEN — voll skaliert
============================================================ */

function getWarning(userOffer) {
  const f = state.scale;

  const LOWBALL_LIMIT = 2250 * f;
  const SMALL_STEP_LIMIT = 100 * f;

  const last = state.history[state.history.length - 1];

  if (userOffer < LOWBALL_LIMIT) {
    return `Ihr Angebot liegt deutlich unter dem akzeptablen Bereich (unter ${eur(LOWBALL_LIMIT)}).`;
  }

  if (last && last.proband_counter != null) {
    const diff = userOffer - last.proband_counter;
    if (diff > 0 && diff <= SMALL_STEP_LIMIT) {
      return `Ihre Erhöhung ist sehr gering (≤ ${eur(SMALL_STEP_LIMIT)}). Bitte machen Sie einen größeren Schritt.`;
    }
  }

  return "";
}



/* ============================================================
   ABBRUCHWAHRSCHEINLICHKEIT (Skalierte Version)
============================================================ */

function abortProbability(userOffer) {
  const f = state.scale;
  const s = state.current_offer;
  const diff = Math.abs(s - userOffer);

  let chance = 0;

  if (userOffer < 1500 * f) return 100;

  if (userOffer < 2250 * f) chance += randInt(20, 40);

  if (diff < 50 * f) chance += 35;
  else if (diff < 100 * f) chance += 25;
  else if (diff < 150 * f) chance += 15;
  else if (diff < 250 * f) chance += 5;
  else chance -= 5;

  return Math.min(Math.max(chance, 0), 95);
}



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
      ...row
    });
  }
}



/* ============================================================
   HISTORY RENDER
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
            <td>${h.proband_counter != null ? eur(h.proband_counter) : "-"}</td>
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
      <p>Abbruchwahrscheinlichkeit: <b>${chance}%</b></p>
      ${renderHistory()}
      <button id="restartBtn">Neu starten</button>
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
      <p>Ein Verkäufer bietet eine hochwertige <b>Designer-Ledercouch</b> an (2.500–10.000 €).</p>
      <p class="muted">Zu kleine Schritte oder zu niedrige Angebote erhöhen das Abbruchrisiko.</p>

      <label><input id="consent" type="checkbox"> Ich stimme zu.</label>
      <button id="startBtn" disabled>Start</button>
    </div>
  `;

  const c = document.getElementById("consent");
  const b = document.getElementById("startBtn");

  c.onchange = () => b.disabled = !c.checked;
  b.onclick = () => { state = newState(); viewNegotiate(); };
}



/* ============================================================
   VERHANDLUNGSSCREEN
============================================================ */

function viewNegotiate(errorMsg = "") {

  const last = state.history[state.history.length - 1];
  const lastOffer = last ? last.proband_counter : state.current_offer;
  const abortChance = abortProbability(lastOffer);

  let color = "#16a34a";
  if (abortChance > 50) color = "#ea580c";
  else if (abortChance > 25) color = "#eab308";

  app.innerHTML = `
    <div class="card">
      <h1>Verkaufsverhandlung</h1>

      <div class="card">
        <strong>Aktuelles Angebot:</strong> ${eur(state.current_offer)}
      </div>

      <div style="border-left:6px solid ${color}; padding:10px; background:${color}22;">
        <b style="color:${color};">Abbruchwahrscheinlichkeit:</b>
        <span>${abortChance}%</span>
      </div>

      <label>Dein Gegenangebot:</label>
      <input id="counter" type="number">

      <button id="sendBtn">Senden</button>
      <button id="acceptBtn" class="ghost">Annehmen</button>

      ${state.warningText ? `<p style="color:#b91c1c">${state.warningText}</p>` : ""}
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

  if (state.history.length > 0) {
    const last = state.history[state.history.length - 1].proband_counter;
    if (last && num < last)
      return viewNegotiate("Du darfst kein niedrigeres Angebot machen.");
  }

  state.warningText = getWarning(num);

  if (shouldAccept(num)) {
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

  if (maybeAbort(num)) return;

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

  state.accepted = accepted;
  state.finished = true;
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
      <p>${accepted ? `Einigung bei <b>${eur(dealPrice)}</b>` : "Keine Einigung."}</p>
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
