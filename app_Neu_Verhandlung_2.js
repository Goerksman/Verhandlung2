/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const roundEuro = n => Math.round(Number(n));

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const eur = n =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(roundEuro(n));

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
  const baseMin   = 3500;

  return {
    participant_id: crypto.randomUUID?.() || "v_" + Date.now(),

    runde: 1,
    max_runden: randInt(8, 12),

    scale: f,

    initial_offer: roundEuro(baseStart * f),
    min_price:     roundEuro(baseMin   * f),
    current_offer: roundEuro(baseStart * f),

    history: [],
    accepted: false,
    finished: false,

    warningText: "",
    patternMessage: "",
    last_abort_chance: null
  };
}

let state = newState();



/* ============================================================
   AUTO-ACCEPT
============================================================ */

function shouldAccept(userOffer) {
  userOffer = roundEuro(userOffer);

  const s = state.current_offer;
  const f = state.scale;

  const diffPerc = Math.abs(s - userOffer) / s;

  if (userOffer >= s) return true;
  if (diffPerc <= 0.05) return true;
  if (userOffer >= roundEuro(5000 * f)) return true;

  if (state.max_runden - state.runde <= 1 && userOffer >= state.min_price)
    return true;

  return false;
}



/* ============================================================
   VERKÄUFERLOGIK
============================================================ */

function computeNextOffer(userOffer) {

  if (shouldAccept(userOffer)) return roundEuro(userOffer);

  const f = state.scale;
  const r = state.runde;
  const min = state.min_price;
  const curr = state.current_offer;

  let next;

  if (r === 1) {
    next = curr - roundEuro(1000 * f);
  } else if (r === 2) {
    next = curr - roundEuro(500 * f);
  } else if (r === 3) {
    next = curr - roundEuro(250 * f);
  } else {
    next = curr - (curr - min) * 0.40;
  }

  if (next < min) next = min;

  return roundEuro(next);
}



/* ============================================================
   WARNUNGEN
============================================================ */

function getWarning(userOffer) {
  userOffer = roundEuro(userOffer);

  const f = state.scale;
  const LOWBALL_LIMIT = roundEuro(2250 * f);
  const SMALL_STEP_LIMIT = roundEuro(100 * f);

  const last = state.history[state.history.length - 1];

  if (userOffer < LOWBALL_LIMIT)
    return `Ihr Angebot liegt deutlich unter dem akzeptablen Bereich.`;

  if (last && last.proband_counter != null) {
    const diff = userOffer - last.proband_counter;
    if (diff > 0 && diff <= SMALL_STEP_LIMIT)
      return `Ihre Erhöhung ist sehr klein. Bitte machen Sie einen größeren Schritt.`;
  }

  return "";
}



/* ============================================================
   RISIKO-SYSTEM (DIFFERENZMODELL + SOFORT-ABBRUCH < 1500*f)
============================================================ */

// Risiko aus Differenz
function abortProbability(diff) {
  diff = roundEuro(diff);
  const f = state.scale;

  let chance = 0;

  if (diff >= roundEuro(1000 * f)) chance += 40;
  else if (diff >= roundEuro(750 * f)) chance += 30;
  else if (diff >= roundEuro(500 * f)) chance += 20;
  else if (diff >= roundEuro(250 * f)) chance += 10;
  else if (diff >= roundEuro(100 * f)) chance += 5;

  return Math.min(chance, 100);
}

function maybeAbort(userOffer) {
  const f = state.scale;
  const seller = state.current_offer;
  const buyer = roundEuro(userOffer);

  // 1) Sofortabbruch
  if (buyer < roundEuro(1500 * f)) {

    state.last_abort_chance = 100;

    logRound({
      runde: state.runde,
      algo_offer: seller,
      proband_counter: buyer,
      accepted: false,
      finished: true,
      deal_price: ""
    });

    state.finished = true;
    state.accepted = false;
    return viewAbort(100);
  }

  // 2) Reguläre Wahrscheinlichkeit
  const diff = Math.abs(seller - buyer);
  const chance = abortProbability(diff);
  state.last_abort_chance = chance;

  const roll = randInt(1, 100);
  if (roll <= chance) {

    logRound({
      runde: state.runde,
      algo_offer: seller,
      proband_counter: buyer,
      accepted: false,
      finished: true,
      deal_price: ""
    });

    state.finished = true;
    state.accepted = false;
    return viewAbort(chance);
  }

  return false;
}



/* ============================================================
   PATTERNERKENNUNG
============================================================ */

function updatePatternMessage() {
  const f = state.scale;
  const limit = roundEuro(2250 * f);

  const counters = state.history
    .map(h => h.proband_counter)
    .filter(v => v && v >= limit);

  if (counters.length < 3) {
    state.patternMessage = "";
    return;
  }

  let chain = 1;

  for (let i = 1; i < counters.length; i++) {
    const diff = counters[i] - counters[i - 1];
    if (diff > 0 && diff <= roundEuro(100 * f)) chain++;
    else chain = 1;
  }

  state.patternMessage =
    chain >= 3
      ? "Mit solchen kleinen Erhöhungen wird das schwierig. Bitte kommen Sie etwas entgegen."
      : "";
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
   VERLAUF RENDER
============================================================ */

function renderHistory() {
  if (!state.history.length) return "";

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr>
          <th>Runde</th>
          <th>Angebot Verkäufer</th>
          <th>Gegenangebot</th>
        </tr>
      </thead>
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
    <h1>Verhandlung abgebrochen</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Die Verkäuferseite hat die Verhandlung beendet.</strong>
      <p class="muted">Abbruchwahrscheinlichkeit in dieser Runde: ${chance}%</p>
    </div>

    <button id="restartBtn">Neue Verhandlung</button>

    ${renderHistory()}
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };
}



function viewVignette() {
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>
    <p class="muted">Stelle dir folgende Situation vor:</p>

    <p>
      Ein Verkäufer bietet eine hochwertige <b>Designer-Ledercouch</b> an.
      Unangemessen niedrige oder kaum veränderte Angebote erhöhen das Abbruchrisiko.
    </p>

    <label class="consent">
      <input id="consent" type="checkbox">
      <span>Ich stimme der anonymen Speicherung zu.</span>
    </label>

    <button id="startBtn" disabled>Verhandlung starten</button>
  `;

  const c = document.getElementById("consent");
  const b = document.getElementById("startBtn");

  c.onchange = () => b.disabled = !c.checked;
  b.onclick = () => { state = newState(); viewNegotiate(); };
}



function viewNegotiate(errorMsg = "") {

  const last = state.history[state.history.length - 1];
  const seller = state.current_offer;
  const buyer = last ? last.proband_counter : seller;

  const diff = Math.abs(seller - buyer);

  let abortChance =
    buyer < roundEuro(1500 * state.scale)
      ? 100
      : abortProbability(diff);

  state.last_abort_chance = abortChance;

  let color = "#16a34a";
  if (abortChance > 50) color = "#ea580c";
  else if (abortChance > 25) color = "#eab308";

  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="grid">

      <div class="card" style="padding:16px;border:1px dashed var(--accent);">
        <strong>Aktuelles Angebot:</strong> ${eur(state.current_offer)}
      </div>

      <div style="
        background:${color}22;
        border-left:6px solid ${color};
        padding:10px;
        border-radius:8px;
        margin-bottom:10px;">
        <b style="color:${color};">Abbruchwahrscheinlichkeit:</b>
        <span style="color:${color};font-weight:600;">
          ${abortChance}%
        </span>
      </div>

      <label for="counter">Dein Gegenangebot (€)</label>
      <div class="row">
        <input id="counter" type="number" step="1" min="0" />
        <button id="sendBtn">Gegenangebot senden</button>
      </div>

      <button id="acceptBtn" class="ghost">Angebot annehmen</button>
    </div>

    ${renderHistory()}
    ${state.patternMessage ? `<p class="info">${state.patternMessage}</p>` : ""}
    ${state.warningText ? `<p class="error" style="color:#b91c1c">${state.warningText}</p>` : ""}
    ${errorMsg ? `<p class="error" style="color:red">${errorMsg}</p>` : ""}
  `;

  document.getElementById("sendBtn").onclick =
    () => handleSubmit(document.getElementById("counter").value);

  document.getElementById("counter").onkeydown =
    e => { if (e.key === "Enter") handleSubmit(e.target.value); };

  document.getElementById("acceptBtn").onclick =
    () => finish(true, state.current_offer);
}




/* ============================================================
   HANDLE SUBMIT
============================================================ */

function handleSubmit(raw) {

  const num = roundEuro(Number(raw));
  if (!Number.isFinite(num) || num <= 0)
    return viewNegotiate("Bitte eine gültige Zahl eingeben.");

  if (state.history.length > 0) {
    const last = state.history[state.history.length - 1].proband_counter;
    if (last && num < last)
      return viewNegotiate("Sie dürfen kein niedrigeres Angebot machen.");
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

  updatePatternMessage();

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
    <h1>Letzte Runde</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Letztes Angebot:</strong> ${eur(state.current_offer)}
    </div>

    <button id="acceptBtn">Annehmen</button>
    <button id="declineBtn" class="ghost">Ablehnen</button>

    ${renderHistory()}
  `;

  document.getElementById("acceptBtn").onclick =
    () => finish(true, state.current_offer);

  document.getElementById("declineBtn").onclick =
    () => finish(false, null);
}




/* ============================================================
   FINISH SCREEN
============================================================ */

function finish(accepted, dealPrice) {

  if (dealPrice != null)
    dealPrice = roundEuro(dealPrice);

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
    <h1>Verhandlung abgeschlossen</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Ergebnis:</strong>
      ${accepted
        ? `Einigung bei ${eur(dealPrice)}`
        : `Keine Einigung.`}
    </div>

    <button id="restartBtn">Neue Verhandlung</button>

    ${renderHistory()}
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
