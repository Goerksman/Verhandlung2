/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const eur = n =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const round50 = n => Math.round(n / 50) * 50;

const app = document.getElementById("app");



/* ============================================================
   DIMENSIONSSYSTEM (AUS CODE 1)
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
   SPIELZUSTAND (Preislogik bleibt unverändert!)
============================================================ */

function newState() {
  const f = nextDimension();

  const baseStart = 5500;
  const baseMin   = 4000;
  const baseStep  = 300;

  return {
    participant_id: crypto.randomUUID?.() || "v_" + Date.now(),

    runde: 1,
    max_runden: randInt(8, 12),

    scale: f,
    initial_offer: round50(baseStart * f),
    min_price:     round50(baseMin   * f),
    current_offer: round50(baseStart * f),
    step_amount:   round50(baseStep  * f),

    history: [],
    accepted: false,
    finished: false,

    warningText: "",
    patternMessage: ""
  };
}

let state = newState();



/* ============================================================
 D – AUTO-ACCEPT REGELN AUS CODE 1 (vollständig)
============================================================ */

function shouldAccept(userOffer) {
  const s = state.current_offer;
  const f = state.scale;

  const diffPerc = Math.abs(s - userOffer) / s;

  if (userOffer >= s) return true;               // Käufer überbietet
  if (diffPerc <= 0.05) return true;            // innerhalb 5%
  if (userOffer >= 5000 * f) return true;       // sehr gutes Angebot
  if (state.max_runden - state.runde <= 1 && userOffer >= state.min_price) return true;

  return false;
}



/* ============================================================
   PREISBERECHNUNG (NICHT VERÄNDERT!)
============================================================ */

function computeNextOffer(userOffer) {
  if (shouldAccept(userOffer)) return userOffer;

  let next = state.current_offer - state.step_amount;
  if (next < state.min_price) next = state.min_price;

  return round50(next);
}



/* ============================================================
   C – WARNUNGEN (Lowball + kleine Schritte) – skaliert
============================================================ */

function getWarning(userOffer) {
  const f = state.scale;
  const LOWBALL_LIMIT = 2250 * f;
  const SMALL_STEP_LIMIT = 100 * f;

  const last = state.history[state.history.length - 1];

  if (userOffer < LOWBALL_LIMIT)
    return `Ihr Angebot (${eur(userOffer)}) liegt deutlich unter dem akzeptablen Bereich (${eur(LOWBALL_LIMIT)}).`;

  if (last && last.proband_counter != null) {
    const diff = userOffer - last.proband_counter;

    if (diff > 0 && diff <= SMALL_STEP_LIMIT)
      return `Ihre Erhöhung ist sehr klein (≤ ${eur(SMALL_STEP_LIMIT)}). Bitte machen Sie einen größeren Schritt.`;
  }

  return "";
}



/* ============================================================
   A – RISIKO-SYSTEM AUS CODE 1 (vollständig + skaliert)
============================================================ */

function abortProbability(userOffer) {
  const f = state.scale;
  const s = state.current_offer;
  const diff = Math.abs(s - userOffer);

  let chance = 0;

  // EXTREM NIEDRIG
  if (userOffer < 1500 * f) return 100;

  // LOWBALL
  if (userOffer < 2250 * f) chance += randInt(20, 40);

  // SCHRITT-LOGIK (aus Code 1, aber skaliert!)
  if (diff < 50  * f) chance += 35;
  else if (diff < 100 * f) chance += 25;
  else if (diff < 150 * f) chance += 15;
  else if (diff < 250 * f) chance += 5;
  else chance -= 5; // große Schritte = gut

  return Math.min(Math.max(chance, 0), 95);
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
   B – PATTERN-ERKENNUNG AUS CODE 1
============================================================ */

function updatePatternMessage() {
  if (state.history.length < 3) {
    state.patternMessage = "";
    return;
  }

  const f = state.scale;
  const limit = 2250 * f;

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

    if (diff > 0 && diff <= 100 * f) chain++;
    else chain = 1;
  }

  state.patternMessage =
    chain >= 3
      ? "Sie bewegen sich nur in sehr kleinen Schritten. Bitte kommen Sie etwas entgegen."
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
   HISTORY RENDER
============================================================ */

function renderHistory() {
  if (!state.history.length) return "";

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
   E – VIGNETTE AUS CODE 1
============================================================ */

function viewVignette() {
  app.innerHTML = `
    <div class="card">
      <h1>Designer-Verkaufsmesse</h1>

      <p>
        Sie verhandeln mit einem Verkäufer über eine hochwertige
        <b>Designer-Ledercouch</b>.  
        Vergleichbare Modelle kosten zwischen <b>2.500 € und 10.000 €</b>.
      </p>

      <p class="muted">
        Die Verhandlung dauert zufällig 8–12 Runden.  
        Zu niedrige Angebote oder sehr kleine Schritte können das Abbruchrisiko erhöhen.
      </p>

      <label>
        <input id="consent" type="checkbox"> Ich stimme der anonymen Datenspeicherung zu.
      </label>

      <button id="startBtn" disabled>Verhandlung starten</button>
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
      ${state.patternMessage ? `<p class="muted">${state.patternMessage}</p>` : ""}
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

  // keine rückwärtsgerichteten Angebote
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
   FINISH SCREEN
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
