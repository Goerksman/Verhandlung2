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

  // Basiswerte jetzt *mit Multiplikator f*
  const baseStart = roundEuro(5500 * f);
  const baseMin   = roundEuro(3500 * f);

  return {
    participant_id: crypto.randomUUID?.() || ("v_" + Date.now()),

    runde: 1,
    max_runden: randInt(8, 12),

    scale: f,

    initial_offer: baseStart,
    current_offer: baseStart,
    min_price: baseMin,

    history: [],
    accepted: false,
    finished: false,

    warningText: "",
    patternMessage: "",
    last_abort_display: 0   // für Maske Option 3
  };
}

let state = newState();



/* ============================================================
   AUTO-ACCEPT LOGIK
============================================================ */

function shouldAccept(userOffer) {
  const buyer = roundEuro(userOffer);
  const seller = state.current_offer;
  const f = state.scale;

  if (buyer >= seller) return true;

  if (Math.abs(seller - buyer) / seller <= 0.05) return true;

  if (buyer >= roundEuro(5000 * f)) return true;

  if (state.max_runden - state.runde <= 1 && buyer >= state.min_price)
    return true;

  return false;
}



/* ============================================================
   VERKÄUFER-UPDATE
============================================================ */

function computeNextOffer(userOffer) {

  if (shouldAccept(userOffer))
    return roundEuro(userOffer);

  const f = state.scale;
  const r = state.runde;
  const min = state.min_price;
  const curr = state.current_offer;

  let next;

  if (r === 1)      next = curr - roundEuro(1000 * f);
  else if (r === 2) next = curr - roundEuro(500 * f);
  else if (r === 3) next = curr - roundEuro(250 * f);
  else              next = curr - (curr - min) * 0.40;

  if (next < min) next = min;

  return roundEuro(next);
}



/* ============================================================
   WARNUNGEN
============================================================ */

function getWarning(userOffer) {
  const buyer = roundEuro(userOffer);
  const f = state.scale;

  const LOWBALL = roundEuro(2250 * f);
  const SMALL_STEP = roundEuro(100 * f);

  const last = state.history[state.history.length - 1];

  if (buyer < LOWBALL)
    return `Ihr Angebot liegt deutlich unter dem erwartbaren Verhandlungsbereich.`;

  if (last && last.proband_counter != null) {
    const diff = buyer - last.proband_counter;
    if (diff > 0 && diff <= SMALL_STEP)
      return `Ihre Erhöhung ist sehr klein (≤ ${eur(SMALL_STEP)}). Bitte machen Sie einen größeren Schritt.`;
  }

  return "";
}



/* ============================================================
   RISIKO-SYSTEM (Differenzmodell + Sofortabbruch <1500·f)
============================================================ */

function abortProbability(diff) {
  const d = roundEuro(diff);

  if (d >= 1000) return 40;
  if (d >= 750) return 30;
  if (d >= 500) return 20;
  if (d >= 250) return 10;
  if (d >= 100) return 5;

  return 0;
}

function maybeAbort(userOffer) {

  const f = state.scale;
  const seller = state.current_offer;
  const buyer = roundEuro(userOffer);

  // 1) Sofortabbruch
  if (buyer < roundEuro(1500 * f)) {

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

    viewAbort(100);

    return true;
  }

  // 2) Differenz-Risiko
  const diff = Math.abs(seller - buyer);
  const chance = abortProbability(diff);

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

    viewAbort(chance);

    return true;
  }

  return false;
}



/* ============================================================
   PATTERNERKENNUNG
============================================================ */

function updatePatternMessage() {
  const f = state.scale;
  const minRelevant = roundEuro(2250 * f);

  const counters = state.history
    .map(h => h.proband_counter)
    .filter(v => v && v >= minRelevant);

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

  if (chain >= 3)
    state.patternMessage =
      "Mit solchen kleinen Erhöhungen wird das schwierig. Geh bitte ein Stück näher an deine Schmerzgrenze.";
  else
    state.patternMessage = "";
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
   HISTORY
============================================================ */

function renderHistory() {
  if (!state.history.length) return "";

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr><th>R</th><th>Verkäufer</th><th>Du</th></tr>
      </thead>
      <tbody>
        ${state.history
          .map(
            h => `
          <tr>
            <td>${h.runde}</td>
            <td>${eur(h.algo_offer)}</td>
            <td>${h.proband_counter != null ? eur(h.proband_counter) : "-"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}



/* ============================================================
   SCREENS – VERHANDLUNGSMASKE (SCREENSHOT VERSION!)
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
      <p>Sie verhandeln über eine Designer-Ledercouch.</p>

      <label class="consent">
        <input id="consent" type="checkbox">
        <span>Ich stimme der anonymen Speicherung zu.</span>
      </label>

      <button id="startBtn" disabled>Verhandlung starten</button>
    </div>
  `;

  const c = document.getElementById("consent");
  const b = document.getElementById("startBtn");

  c.onchange = () => (b.disabled = !c.checked);
  b.onclick = () => {
    state = newState();
    viewNegotiate();
  };
}



function viewNegotiate(errorMsg = "") {

  const seller = state.current_offer;

  let buyer;
  if (state.history.length === 0)
    buyer = seller;
  else
    buyer = state.history[state.history.length - 1].proband_counter;

  let abortChance = state.last_abort_display; // OPTION 3

  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="border:1px dashed var(--accent);">
      <strong>Aktuelles Angebot:</strong> ${eur(seller)}
    </div>

    <div id="abortBox" style="
      background:#16a34a22;
      border-left:6px solid #16a34a;
      padding:10px;
      border-radius:8px;
    ">
      <b id="abortLabel" style="color:#16a34a;">Abbruchwahrscheinlichkeit:</b>
      <span id="abortValue" style="font-weight:600;color:#16a34a;">${abortChance}%</span>
    </div>

    <label for="counter">Dein Gegenangebot (€)</label>
    <div class="row">
      <input id="counter" type="number" step="1">
      <button id="sendBtn">Senden</button>
    </div>

    <button id="acceptBtn" class="ghost">Angebot annehmen</button>

    ${state.warningText ? `<p style="color:#b91c1c">${state.warningText}</p>` : ""}
    ${state.patternMessage ? `<p class="muted">${state.patternMessage}</p>` : ""}
    ${errorMsg ? `<p style="color:red">${errorMsg}</p>` : ""}

    ${renderHistory()}
  `;

  const input = document.getElementById("counter");

  // LIVE-UPDATE des Risikos
  input.oninput = () => {
    const val = Number(input.value);
    const buyer = roundEuro(val);

    let liveChance;

    if (!input.value.trim()) {
      liveChance = state.last_abort_display; // Option 3
    } else if (buyer < roundEuro(1500 * state.scale)) {
      liveChance = 100;
    } else {
      const diff = Math.abs(state.current_offer - buyer);
      liveChance = abortProbability(diff);
    }

    updateAbortUI(liveChance);
  };

  function updateAbortUI(chance) {
    const box = document.getElementById("abortBox");
    const label = document.getElementById("abortLabel");
    const val = document.getElementById("abortValue");

    let color = "#16a34a";
    if (chance > 50) color = "#ea580c";
    else if (chance > 25) color = "#eab308";

    box.style.borderLeft = `6px solid ${color}`;
    box.style.background = color + "22";
    label.style.color = color;
    val.style.color = color;

    val.textContent = chance + "%";
  }

  document.getElementById("sendBtn").onclick =
    () => handleSubmit(input.value);

  document.getElementById("acceptBtn").onclick =
    () => finish(true, state.current_offer);
}



/* ============================================================
   HANDLE SUBMIT
============================================================ */

function handleSubmit(raw) {

  let num = roundEuro(Number(raw));

  if (!Number.isFinite(num) || num <= 0)
    return viewNegotiate("Bitte eine gültige Zahl eingeben.");

  if (state.history.length > 0) {
    const last = state.history[state.history.length - 1].proband_counter;
    if (num < last)
      return viewNegotiate("Sie dürfen nicht niedriger bieten als zuvor.");
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

  state.current_offer = computeNextOffer(num);

  logRound({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: num,
    accepted: false,
    finished: false,
    deal_price: ""
  });

  state.last_abort_display = abortProbability(Math.abs(state.current_offer - num));

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
   ABSCHLUSS
============================================================ */

function finish(accepted, dealPrice) {

  if (dealPrice != null) dealPrice = roundEuro(dealPrice);

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
   START
============================================================ */

viewVignette();
