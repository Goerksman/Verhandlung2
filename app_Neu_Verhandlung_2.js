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

const app = document.getElementById("app");


/* ============================================================
   ZUSTAND – Startpreis & Schmerzgrenze
============================================================ */

function newState() {
  const startpreis = 5500;
  const schmerzgrenze = 3500;

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

function reductionEarly() {
  return randInt(250, 500);
}

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

  if (userOffer < 3000) chance += randInt(10, 30);

  const last = state.history[state.history.length - 1];
  if (last && last.proband_counter !== null) {
    const diff = Math.abs(userOffer - last.proband_counter);
    if (diff <= 100) chance += randInt(5, 20);
  }

  chance += state.runde * 2;

  return Math.min(chance, 75);
}

function maybeAbort(userOffer) {
  const chance = abortProbability(userOffer);
  const roll = randInt(1, 100);

  if (roll <= chance) {

    logRound({
      runde: state.runde,
      algo: state.current_offer,
      counter: userOffer,
      accepted: false,
      finished: true,
      deal: ""
    });

    state.finished = true;
    state.accepted = false;
    state.deal_price = null;
    viewAbort(chance);
    return true;
  }
  return false;
}


/* ============================================================
   SCREEN: Abbruch
============================================================ */

function viewAbort(chance) {
  app.innerHTML = `
    <div class="card">
      <h1>Verhandlung abgebrochen</h1>
      <p>Die Verkäuferseite hat die Verhandlung beendet.</p>
      <p class="muted">Abbruchwahrscheinlichkeit: ${chance}%</p>
      ${renderHistory()}
      <button id="restartBtn">Neue Verhandlung</button>
    </div>
  `;
  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };
}


/* ============================================================
   VIGNETTE
============================================================ */

function viewVignette() {
  app.innerHTML = `
    <div class="card">
      <h1>Designer-Verkaufsmesse</h1>
      <p class="muted">Stelle dir folgende Situation vor:</p>

      <p>Ein Besucher möchte sein <b>Designer-Ledersofa</b> verkaufen.
      Vergleichbare Sofas kosten <b>2.500–10.000 €</b>.</p>

      <p>Der Verkäufer reagiert auf deine Angebote, hat aber eine eigene Untergrenze.</p>

      <p class="muted"><b>Hinweis:</b> Die Verhandlung dauert zufällig 8–12 Runden.</p>

      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme der anonymen Datenspeicherung zu.</span>
      </label>

      <button id="startBtn" disabled>Verhandlung starten</button>
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
   Übergang
============================================================ */

function viewThink(next) {
  app.innerHTML = `
    <div class="card center">
      <h1 class="pulse">Die Verkäuferseite überlegt ...</h1>
    </div>
  `;
  setTimeout(next, randInt(600, 1100));
}


/* ============================================================
   ROUND LOGGING
============================================================ */

function logRound({ runde, algo, counter, accepted, finished, deal }) {
  if (window.sendRow) {
    window.sendRow({
      participant_id: state.participant_id,
      runde,
      algo_offer: algo,
      proband_counter: counter,
      accepted,
      finished,
      deal_price: deal
    });
  }
}


/* ============================================================
   SCREEN: VERHANDLUNG  (mit Farbskala)
============================================================ */

function viewNegotiate(errorMsg = "") {

  const lastCounter =
    state.history.length
      ? state.history[state.history.length - 1].proband_counter
      : 0;

  const abortChance = abortProbability(lastCounter);

  let color = "#16a34a"; // grün
  if (abortChance > 50) color = "#ea580c"; // orange
  else if (abortChance > 25) color = "#eab308"; // gelb

  app.innerHTML = `
    <div class="card">
      <h1>Verkaufsverhandlung</h1>
      <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

      <div class="card" style="margin-bottom:12px;">
        <strong>Aktuelles Angebot:</strong> ${eur(state.current_offer)}
      </div>

      <div style="
        background: ${color}22; 
        border-left: 6px solid ${color};
        padding: 8px 12px;
        margin-bottom: 10px;
        border-radius: 6px;
      ">
        <b style="color:${color};">Abbruchwahrscheinlichkeit:</b>
        <span style="color:${color}; font-weight:600;">${abortChance}%</span>
      </div>

      <label>Dein Gegenangebot (€)</label>
      <input id="counter" type="number" min="0" step="0.01" />

      <button id="sendBtn">Gegenangebot senden</button>
      <button id="acceptBtn" class="ghost">Annehmen</button>

      ${renderHistory()}
      ${state.warningText ? `<p class="muted">${state.warningText}</p>` : ""}
      ${errorMsg ? `<p class="muted" style="color:red">${errorMsg}</p>` : ""}
    </div>
  `;

  const inputEl = document.getElementById("counter");

  document.getElementById("sendBtn").onclick = () =>
    handleSubmit(inputEl.value);

  inputEl.onkeydown = e => {
    if (e.key === "Enter") handleSubmit(inputEl.value);
  };

  document.getElementById("acceptBtn").onclick = () =>
    finish(true, state.current_offer);
}


/* ============================================================
   HANDLE SUBMIT
============================================================ */

function handleSubmit(valRaw) {
  const val = valRaw.trim().replace(",", ".");
  const num = Number(val);

  if (!Number.isFinite(num) || num <= 0) {
    viewNegotiate("Bitte gültige Zahl ≥ 0 eingeben.");
    return;
  }

  const prevOffer = state.current_offer;

  if (num >= state.min_price) {

    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true
    });

    logRound({
      runde: state.runde,
      algo: prevOffer,
      counter: num,
      accepted: true,
      finished: true,
      deal: num
    });

    finish(true, num);
    return;
  }

  if (maybeAbort(num)) return;

  if (num < 2250) {
    state.warningCount++;
    state.warningText = "Ihr Angebot liegt deutlich unter der akzeptablen Preiszone.";

    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num
    });

    logRound({
      runde: state.runde,
      algo: prevOffer,
      counter: num,
      accepted: false,
      finished: false,
      deal: ""
    });

    if (state.warningCount >= 2) {
      finish(false, null);
      return;
    }

    state.runde++;
    viewThink(() => viewNegotiate());
    return;
  }

  state.warningText = "";

  state.history.push({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num
  });

  logRound({
    runde: state.runde,
    algo: prevOffer,
    counter: num,
    accepted: false,
    finished: false,
    deal: ""
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
   SCREEN: LETZTE RUNDE
============================================================ */

function viewDecision() {
  app.innerHTML = `
    <div class="card">
      <h1>Letzte Runde</h1>

      <div class="card" style="margin-bottom:12px;">
        <strong>Letztes Angebot:</strong> ${eur(state.current_offer)}
      </div>

      <button id="acceptBtn">Annehmen</button>
      <button id="declineBtn" class="ghost">Ablehnen</button>

      ${renderHistory()}
    </div>
  `;

  document.getElementById("acceptBtn").onclick = () =>
    finish(true, state.current_offer);

  document.getElementById("declineBtn").onclick = () =>
    finish(false, null);
}


/* ============================================================
   FINISH – Ende der Verhandlung
============================================================ */

function finish(accepted, deal) {
  state.accepted = accepted;
  state.finished = true;
  state.deal_price = deal;

  logRound({
    runde: state.runde,
    algo: state.current_offer,
    counter: deal,
    accepted,
    finished: true,
    deal
  });

  app.innerHTML = `
    <div class="card">
      <h1>Verhandlung beendet</h1>
      <p>${accepted
        ? `Einigung erzielt bei <b>${eur(deal)}</b>`
        : "Keine Einigung erzielt."}</p>
      ${renderHistory()}
      <button id="restartBtn">Neue Verhandlung</button>
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





