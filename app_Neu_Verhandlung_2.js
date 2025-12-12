/* ============================================================
   KONFIG (fehlt sonst -> "Lade …")
============================================================ */
const CONFIG = {
  ROUNDS_MIN: 8,
  ROUNDS_MAX: 12,
  THINK_DELAY_MS_MIN: 1200,
  THINK_DELAY_MS_MAX: 2800
};


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
    max_runden: randInt(CONFIG.ROUNDS_MIN, CONFIG.ROUNDS_MAX),

    scale: f,

    initial_offer: baseStart,
    current_offer: baseStart,
    min_price: baseMin,

    history: [],
    accepted: false,
    finished: false,

    warningText: "",
    patternMessage: "",
    last_abort_chance: null // für Anzeige
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

/* Wrapper, weil dein handleSubmit vorher shouldAutoAccept aufruft */
function shouldAutoAccept(_initialOffer, _minPrice, _prevOffer, counter) {
  return shouldAccept(counter);
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

    viewAbort(100);
    return true;
  }

  // 2) Differenz-Risiko
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

function historyTable(){
  if (!state.history.length) return '';
  const rows = state.history
    .map(h => `
      <tr>
        <td>${h.runde}</td>
        <td>${eur(h.algo_offer)}</td>
        <td>${h.proband_counter != null && h.proband_counter !== '' ? eur(h.proband_counter) : '-'}</td>
        <td>${h.accepted ? 'Ja' : 'Nein'}</td>
      </tr>
    `)
    .join('');

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr><th>Runde</th><th>Angebot Verkäufer</th><th>Gegenangebot</th><th>Angenommen?</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}


/* ============================================================
   SCREENS
============================================================ */

function viewVignette(){
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>
    <p class="muted">Stelle dir folgende Situation vor:</p>
    <p>
      Ein Verkäufer bietet eine <b>hochwertige Designer-Ledercouch</b> auf einer Möbelmesse an.
      Vergleichbare Sofas liegen zwischen <b>2.500 €</b> und <b>10.000 €</b>.
    </p>
    <p>
      Du verhandelst über den Verkaufspreis, aber der Verkäufer besitzt eine klare Preisuntergrenze.
    </p>
    <p class="muted">
      <b>Hinweis:</b> Die Verhandlung dauert zufällig ${CONFIG.ROUNDS_MIN}–${CONFIG.ROUNDS_MAX} Runden.
      Dein Verhalten beeinflusst das <b>Abbruchrisiko</b>.
    </p>

    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme zu, dass meine Eingaben anonym gespeichert werden.</span>
      </label>
      <div><button id="startBtn" disabled>Verhandlung starten</button></div>
    </div>
  `;

  document.getElementById('consent').onchange =
    () => document.getElementById('startBtn').disabled =
      !document.getElementById('consent').checked;

  document.getElementById('startBtn').onclick = () => {
    state = newState();
    viewNegotiate();
  };
}

function viewThink(next){
  const delay = randInt(CONFIG.THINK_DELAY_MS_MIN, CONFIG.THINK_DELAY_MS_MAX);
  app.innerHTML = `
    <h1>Die Verkäuferseite überlegt<span class="pulse">…</span></h1>
    <p class="muted">Bitte warten.</p>
  `;
  setTimeout(next, delay);
}

function viewAbort(chance){
  app.innerHTML = `
    <h1>Verhandlung abgebrochen</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Die Verkäuferseite hat die Verhandlung beendet.</strong>
      <p class="muted">Abbruchwahrscheinlichkeit in dieser Runde: ${chance}%</p>
    </div>

    <button id="restartBtn">Neue Verhandlung</button>

    ${historyTable()}
  `;

  document.getElementById('restartBtn').onclick = () => {
    state = newState();
    viewVignette();
  };
}

function viewNegotiate(errorMsg){
  // Anzeige: zuletzt berechnete Abbruchwahrscheinlichkeit (Differenzmodell)
  const abortChance = (typeof state.last_abort_chance === 'number')
    ? state.last_abort_chance
    : null;

  let color = '#16a34a';
  if (abortChance !== null){
    if (abortChance > 50) color = '#ea580c';
    else if (abortChance > 25) color = '#eab308';
  }

  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Spieler-ID: ${window.playerId ?? '-'}</p>
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
        <span style="color:${color}; font-weight:600;">
          ${abortChance !== null ? abortChance + '%' : '--'}
        </span>
      </div>

      <label for="counter">Dein Gegenangebot (€)</label>
      <div class="row">
        <input id="counter" type="number" step="1" min="0" />
        <button id="sendBtn">Gegenangebot senden</button>
      </div>

      <button id="acceptBtn" class="ghost">Angebot annehmen</button>
    </div>

    ${historyTable()}
    ${state.patternMessage ? `<p class="info">${state.patternMessage}</p>` : ''}
    ${errorMsg ? `<p class="error">${errorMsg}</p>` : ''}
  `;

  const inputEl = document.getElementById('counter');
  inputEl.onkeydown = e => { if (e.key === "Enter") handleSubmit(inputEl.value); };
  document.getElementById('sendBtn').onclick = () => handleSubmit(inputEl.value);

  document.getElementById('acceptBtn').onclick = () => {
    state.history.push({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: null,
      accepted: true
    });

    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: '',
      accepted: true,
      finished: true,
      deal_price: state.current_offer
    });

    state.accepted = true;
    state.finished = true;
    state.deal_price = state.current_offer;

    viewThink(() => viewFinish(true));
  };
}


/* ============================================================
   HANDLE SUBMIT
============================================================ */

function handleSubmit(raw){
  const val = String(raw ?? '').trim().replace(',','.');
  const parsed = Number(val);

  if (!Number.isFinite(parsed) || parsed < 0){
    return viewNegotiate('Bitte eine gültige Zahl ≥ 0 eingeben.');
  }

  const num = roundEuro(parsed);

  const prevOffer = state.current_offer;

  // Auto-Accept
  if (shouldAutoAccept(state.initial_offer, state.min_price, prevOffer, num)){
    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true
    });

    logRound({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true,
      finished: true,
      deal_price: num
    });

    state.accepted = true;
    state.finished = true;
    state.deal_price = num;

    return viewThink(() => viewFinish(true));
  }

  // Abbruch prüfen (Differenzmodell / Sofortabbruch)
  if (maybeAbort(num)) return;

  // normale Runde
  const next = computeNextOffer(num);

  logRound({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num,
    accepted: false,
    finished: false,
    deal_price: ''
  });

  state.history.push({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num,
    accepted: false
  });

  updatePatternMessage();

  state.current_offer = next;

  if (state.runde >= state.max_runden){
    state.finished = true;
    return viewThink(() => viewDecision());
  }

  state.runde++;
  viewThink(() => viewNegotiate());
}


/* ============================================================
   LETZTE RUNDE
============================================================ */

function viewDecision(){
  app.innerHTML = `
    <h1>Letzte Runde</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Letztes Angebot:</strong> ${eur(state.current_offer)}
    </div>

    <button id="takeBtn">Annehmen</button>
    <button id="noBtn" class="ghost">Ablehnen</button>

    ${historyTable()}
  `;

  document.getElementById('takeBtn').onclick = () => finish(true, state.current_offer);
  document.getElementById('noBtn').onclick = () => finish(false, null);
}


/* ============================================================
   FINISH
============================================================ */

function finish(accepted, dealPrice) {
  state.accepted = !!accepted;
  state.finished = true;
  state.deal_price = (dealPrice == null ? null : roundEuro(dealPrice));

  logRound({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: dealPrice == null ? '' : state.deal_price,
    accepted: state.accepted,
    finished: true,
    deal_price: dealPrice == null ? '' : state.deal_price
  });

  viewThink(() => viewFinish(state.accepted));
}

function viewFinish(accepted){
  const dealPrice = state.deal_price ?? state.current_offer;

  let text;
  if (accepted){
    text = `Einigung in Runde ${state.runde} bei ${eur(dealPrice)}.`;
  } else {
    text = `Keine Einigung.`;
  }

  app.innerHTML = `
    <h1>Verhandlung abgeschlossen</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Ergebnis:</strong> ${text}</strong>
    </div>

    <button id="restartBtn">Neue Verhandlung</button>

    ${historyTable()}
  `;

  document.getElementById('restartBtn').onclick = () => {
    state = newState();
    viewVignette();
  };
}


/* ============================================================
   INIT
============================================================ */

viewVignette();
