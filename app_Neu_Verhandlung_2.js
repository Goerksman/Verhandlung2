/* ========================================================================== */
/* Konfiguration via URL                                                      */
/* ========================================================================== */
const Q = new URLSearchParams(location.search);
const CONFIG = {
  INITIAL_OFFER: Number(Q.get("i")) || 5500,
  MIN_PRICE: Q.has("min") ? Number(Q.get("min")) : undefined,
  MIN_PRICE_FACTOR: Number(Q.get("mf")) || 0.70,

  ROUNDS_MIN: parseInt(Q.get("rmin") || "8", 10),
  ROUNDS_MAX: parseInt(Q.get("rmax") || "12", 10),

  THINK_DELAY_MS_MIN: parseInt(Q.get("tmin") || "1200", 10),
  THINK_DELAY_MS_MAX: parseInt(Q.get("tmax") || "2800", 10),

  ACCEPT_MARGIN: Number(Q.get("am")) || 0.12,
  ACCEPT_RANGE_MIN: Number(Q.get("armin")) || 4700,
  ACCEPT_RANGE_MAX: Number(Q.get("armax")) || 4800
};

CONFIG.MIN_PRICE = Number.isFinite(CONFIG.MIN_PRICE)
  ? CONFIG.MIN_PRICE
  : Math.round(CONFIG.INITIAL_OFFER * CONFIG.MIN_PRICE_FACTOR);

/* ========================================================================== */
/* Spieler-ID / Probandencode                                                 */
/* ========================================================================== */
if (!window.playerId) {
  const fromUrl =
    Q.get("player_id") ||
    Q.get("pid") ||
    Q.get("id");

  window.playerId =
    fromUrl ||
    "P_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

if (!window.probandCode) {
  const fromUrlCode = Q.get("proband_code") || Q.get("code");
  window.probandCode = fromUrlCode || window.playerId;
}

/* ========================================================================== */
/* Konstanten                                                                 */
/* ========================================================================== */
const EXTREME_BASE = 1500;
const UNACCEPTABLE_LIMIT = 2250;
const ABSOLUTE_FLOOR = 3500;
const BASE_STEP_AMOUNT = 167;

const DIMENSION_FACTORS = [1.0, 1.3, 1.5];
let dimensionQueue = [];

function refillDimensionQueue() {
  dimensionQueue = [...DIMENSION_FACTORS];
  for (let i = dimensionQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dimensionQueue[i], dimensionQueue[j]] = [dimensionQueue[j], dimensionQueue[i]];
  }
}

function nextDimensionFactor() {
  if (dimensionQueue.length === 0) refillDimensionQueue();
  return dimensionQueue.pop();
}

/* ========================================================================== */
/* Hilfsfunktionen                                                            */
/* ========================================================================== */
const app = document.getElementById("app");

const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const eur = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const round50 = (v) => Math.round(v / 50) * 50;

/* ========================================================================== */
/* Zustand erzeugen (mit Dimensionsskalierung)                                */
/* ========================================================================== */
function newState() {
  const f = nextDimensionFactor();

  const initial = round50(CONFIG.INITIAL_OFFER * f);
  const minPrice = round50(Math.max(CONFIG.MIN_PRICE * f, ABSOLUTE_FLOOR * f));
  const stepAmount = BASE_STEP_AMOUNT * f;

  return {
    participant_id:
      crypto.randomUUID?.() || "x_" + Date.now() + Math.random().toString(36).slice(2),

    runde: 1,
    max_runden: randInt(CONFIG.ROUNDS_MIN, CONFIG.ROUNDS_MAX),

    scale_factor: f,
    step_amount: stepAmount,

    initial_offer: initial,
    current_offer: initial,
    min_price: minPrice,
    max_price: initial,

    history: [],
    finished: false,
    accepted: false,
    deal_price: null,
    finish_reason: null,

    patternMessage: ""
  };
}

let state = newState();

/* ========================================================================== */
/* Logging                                                                    */
/* ========================================================================== */
function logRound(row) {
  const payload = {
    participant_id: state.participant_id,
    player_id: window.playerId,
    proband_code: window.probandCode,
    scale_factor: state.scale_factor,

    runde: row.runde,
    algo_offer: row.algo_offer,
    proband_counter: row.proband_counter,
    accepted: row.accepted,
    finished: row.finished,
    deal_price: row.deal_price
  };

  if (window.sendRow) window.sendRow(payload);
  else console.log("[sendRow fallback]", payload);
}

/* ========================================================================== */
/* AUTO-ACCEPT (Möglichkeit A)                                                */
/* ========================================================================== */
function shouldAutoAccept(counter) {
  const c = Number(counter);
  const prev = state.current_offer;
  const f = state.scale_factor;
  const minPrice = state.min_price;

  const diff = Math.abs(prev - c);
  const diffPercent = diff / prev;

  if (c >= prev) return true;
  if (c >= 5000 * f) return true;
  if (diffPercent <= 0.05) return true;

  if (state.max_runden - state.runde <= 1 && c >= minPrice)
    return true;

  return false;
}

/* ========================================================================== */
/* Preislogik – Verkäufer unterbietet nie den Käufer                          */
/* ========================================================================== */
function computeNextOffer(userOffer) {
  if (shouldAutoAccept(userOffer)) return userOffer;

  const prev = state.current_offer;

  let raw = prev - state.step_amount;
  let next = round50(raw);

  if (next < state.min_price) next = state.min_price;
  if (next > prev) next = prev;

  return next;
}

/* ========================================================================== */
/* Abbruchwahrscheinlichkeit (Version B, OHNE runde*2)                        */
/* ========================================================================== */
function abortProbability(counter) {
  const c = Number(counter);
  const s = state.current_offer;
  const diff = Math.abs(s - c);
  const f = state.scale_factor;

  const EXT = EXTREME_BASE * f;
  const UNACC = UNACCEPTABLE_LIMIT * f;
  const T3000 = 3000 * f;
  const T3700 = 3700 * f;
  const T4000 = 4000 * f;

  let chance = 0;

  if (c < EXT) return 100;

  if (c < UNACC) chance += randInt(20, 40);

  if (c >= UNACC && c < T3000) {
    if (diff < 100 * f) chance += randInt(10, 25);
  }

  if (c >= T3000 && c < T3700) chance += randInt(1, 7);
  if (c >= T3700 && c < T4000) chance += randInt(0, 3);

  if (c >= T4000) return randInt(0, 2);

  if (diff >= 500 * f) chance += 25;
  else if (diff >= 300 * f) chance += 15;
  else if (diff >= 150 * f) chance += 10;
  else if (diff >= 100 * f) chance += 5;

  return Math.min(chance, 95);
}

function maybeAbort(counter) {
  const chance = abortProbability(counter);
  const roll = randInt(1, 100);

  if (roll <= chance) {
    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: counter,
      accepted: false,
      finished: true,
      deal_price: ""
    });

    state.history.push({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: counter,
      accepted: false
    });

    state.finished = true;
    state.finish_reason = "abort";

    viewAbort(chance);
    return true;
  }

  return false;
}

/* ========================================================================== */
/* Rendering                                                                  */
/* ========================================================================== */
function historyTable() {
  if (!state.history.length) return "";

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr><th>Runde</th><th>Verkäufer</th><th>Du</th></tr>
      </thead>
      <tbody>
        ${state.history
          .map(
            (h) => `
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

function viewAbort(chance) {
  app.innerHTML = `
    <div class="card">
      <h1>Verhandlung abgebrochen</h1>
      <p class="muted">Abbruchrate: ${chance}%</p>
      ${historyTable()}
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

      <p>Ein Verkäufer bietet eine <b>hochwertige Designer-Ledercouch</b> an.
      Vergleichbare Sofas liegen zwischen <b>2.500–10.000 €</b>.</p>

      <p>Du verhandelst über den Verkaufspreis.</p>

      <p class="muted">
        <b>Hinweis:</b> Die Verhandlung dauert zufällig 8–12 Runden.
        Dein Verhalten beeinflusst das <b>Abbruchsrisiko</b>.
      </p>

      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme der anonymen Datenspeicherung zu.</span>
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
  const chance = abortProbability(state.current_offer);
  let color = "#16a34a";
  if (chance > 50) color = "#ea580c";
  else if (chance > 25) color = "#eab308";

  app.innerHTML = `
    <div class="card">
      <h1>Verkaufsverhandlung</h1>

      <p class="muted">Spieler-ID: ${window.playerId}</p>
      <p class="muted">Verhandlungs-ID: ${state.participant_id}</p>

      <div class="card">
        <strong>Aktuelles Angebot:</strong> ${eur(state.current_offer)}
      </div>

      <div style="background:${color}22; border-left:6px solid ${color}; padding:10px;">
        <b style="color:${color}">Abbruchwahrscheinlichkeit:</b>
        <span style="color:${color}; font-weight:600;">${chance}%</span>
      </div>

      <label>Dein Gegenangebot (€)</label>
      <input id="counter" type="number" min="0"/>

      <button id="sendBtn">Gegenangebot senden</button>
      <button id="acceptBtn" class="ghost">Annehmen</button>

      ${historyTable()}
      ${errorMsg ? `<p style="color:red">${errorMsg}</p>` : ""}
    </div>
  `;

  document.getElementById("sendBtn").onclick = () =>
    handleSubmit(document.getElementById("counter").value);

  document.getElementById("acceptBtn").onclick = () =>
    finish(true, state.current_offer);
}

/* ========================================================================== */
/* HANDLE SUBMIT                                                              */
/* ========================================================================== */
function handleSubmit(raw) {
  const num = Number(raw.replace(",", "."));

  if (!Number.isFinite(num) || num <= 0)
    return viewNegotiate("Bitte gültige Zahl eingeben.");

  if (
    state.history.length &&
    num < state.history[state.history.length - 1].proband_counter
  )
    return viewNegotiate("Du darfst kein niedrigeres Angebot als zuvor machen.");

  const extreme = EXTREME_BASE * state.scale_factor;
  if (num < extreme) {
    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: num,
      accepted: false,
      finished: true,
      deal_price: ""
    });
    return viewAbort(100);
  }

  if (shouldAutoAccept(num)) {
    state.accepted = true;
    state.finished = true;
    state.deal_price = num;

    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: num,
      accepted: true,
      finished: true,
      deal_price: num
    });

    return viewFinish(true);
  }

  if (maybeAbort(num)) return;

  const prev = state.current_offer;

  state.history.push({
    runde: state.runde,
    algo_offer: prev,
    proband_counter: num
  });

  logRound({
    runde: state.runde,
    algo_offer: prev,
    proband_counter: num,
    accepted: false,
    finished: false,
    deal_price: ""
  });

  state.current_offer = computeNextOffer(num);

  if (state.runde >= state.max_runden) return viewDecision();

  state.runde++;
  return viewNegotiate();
}

/* ========================================================================== */
/* Entscheidung                                                               */
/* ========================================================================== */
function viewDecision() {
  app.innerHTML = `
    <div class="card">
      <h1>Letzte Runde</h1>

      <div class="card"><strong>Letztes Angebot:</strong> ${eur(state.current_offer)}</div>

      <button id="acceptBtn">Annehmen</button>
      <button id="declineBtn" class="ghost">Ablehnen</button>

      ${historyTable()}
    </div>
  `;

  document.getElementById("acceptBtn").onclick = () =>
    finish(true, state.current_offer);

  document.getElementById("declineBtn").onclick = () =>
    finish(false, null);
}

/* ========================================================================== */
/* Finish                                                                     */
/* ========================================================================== */
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
      ${historyTable()}
      <button id="restartBtn">Neue Verhandlung</button>
    </div>
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };
}

/* ========================================================================== */
/* INIT                                                                       */
/* ========================================================================== */
viewVignette();
