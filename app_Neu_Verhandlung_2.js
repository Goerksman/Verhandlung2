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
   ZUSTAND
============================================================ */

function newState() {
  const startpreis = 5500;
  const schmerzgrenze = 4000;

  return {
    participant_id:
      crypto.randomUUID?.() ||
      "v_" + Date.now() + Math.random().toString(36).slice(2),

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
    warningText: ""
  };
}

let state = newState();


/* ============================================================
   PREISLOGIK + ANNAHMELOGIK (Möglichkeit A)
============================================================ */

function reductionEarly() {
  return randInt(250, 500);
}

function reductionLate(userOffer) {
  const offers = state.history.filter(h => h.proband_counter !== null);

  let diff;
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

/* -----------------------------------------------
   Algorithmus darf gute Angebote annehmen (A)
   & Käufer nicht unterbieten
------------------------------------------------ */
function shouldAccept(userOffer) {

  const sellerOffer = state.current_offer;
  const diffPercent = Math.abs(userOffer - sellerOffer) / sellerOffer;

  // 1) Angebote >= 5000 sofort akzeptieren
  if (userOffer >= 5000) return true;

  // 2) Käufer >= aktuelles Verkäuferangebot
  if (userOffer >= sellerOffer) return true;

  // 3) innerhalb 5 %
  if (diffPercent <= 0.05) return true;

  // 4) letzte Runde → akzeptieren, wenn >= Schmerzgrenze
  if (state.max_runden - state.runde <= 1 && userOffer >= state.min_price)
    return true;

  return false;
}

function computeNextOffer(userOffer) {

  // Wenn das Angebot akzeptiert werden soll → nicht unterbieten
  if (shouldAccept(userOffer)) return userOffer;

  const prev = state.current_offer;

  let step =
    state.runde <= 3 ? reductionEarly()
                     : reductionLate(userOffer);

  let newPrice = prev - step;

  if (newPrice < state.min_price)
    newPrice = state.min_price;

  return round10(newPrice);
}


/* ============================================================
   ABBRUCHWAHRSCHEINLICHKEIT (Möglichkeit B)
============================================================ */

function abortProbability(userOffer) {

  const sellerOffer = state.current_offer;
  const diff = Math.abs(sellerOffer - userOffer);

  let chance = 0;

  if (userOffer < 1500) return 100;

  if (userOffer < 2250) chance += randInt(20, 40);

  if (userOffer >= 2250 && userOffer < 3000) {
    if (diff < 100) chance += randInt(10, 25);
  }

  if (userOffer >= 3000 && userOffer < 3700) {
    chance += randInt(1, 7);
  }

  if (userOffer >= 3700 && userOffer < 4000) {
    chance += randInt(0, 3);
  }

  if (userOffer >= 4000) return randInt(0, 2);

  if (diff >= 500) chance += 25;
  else if (diff >= 300) chance += 15;
  else if (diff >= 150) chance += 10;
  else if (diff >= 100) chance += 5;

  return Math.min(chance, 95);
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
   UI SCREENS
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


function viewVignette() {
  app.innerHTML = `
    <div class="card">
      <h1>Designer-Verkaufsmesse</h1>

      <p class="muted">Stelle dir folgende Situation vor:</p>

      <p>Ein Verkäufer bietet eine <b>hochwertige Designer-Ledercouch</b> 
      auf einer Möbelmesse an. Vergleichbare Sofas kosten zwischen 
      <b>2.500 € und 10.000 €</b>.</p>

      <p>Du verhandelst über den Verkaufspreis, der Verkäufer besitzt jedoch eine
      feste Preisuntergrenze.</p>

      <p class="muted"><b>Hinweis:</b>
        Die Verhandlung dauert zufällig 8–12 Runden.
        Dein Verhalten beeinflusst das <b>Abbruchsrisiko</b>:
        unangemessen niedrige oder kaum veränderte Angebote erhöhen die Gefahr,
        dass der Verkäufer die Verhandlung <b>vorzeitig beendet</b>.
      </p>

      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme der anonymen Datenspeicherung zu.</span>
      </label>

      <button id="startBtn" disabled>Verhandlung starten</button>
    </div>
  `;

  const consent = document.getElementById("consent");
  const start = document.getElementById("startBtn");

  consent.onchange = () => start.disabled = !consent.checked;
  start.onclick = () => {
    state = newState();
    viewNegotiate();
  };
}


function renderHistory() {
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
            <td>${h.proband_counter != null ? eur(h.proband_counter) : "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* ============================================================
   VERHANDLUNGSSCREEN
============================================================ */

function viewNegotiate(errorMsg = "") {

  const abortChance = abortProbability(state.current_offer);

  let color = "#16a34a";
  if (abortChance > 50) color = "#ea580c";
  else if (abortChance > 25) color = "#eab308";

  app.innerHTML = `
    <div class="card">
      <h1>Verkaufsverhandlung</h1>

      <p class="muted">Spieler-ID: ${window.playerId}</p>
      <p class="muted">Verhandlungs-ID: ${state.participant_id}</p>

      <div class="card" style="margin-bottom:12px;">
        <strong>Aktuelles Angebot:</strong> ${eur(state.current_offer)}
      </div>

      <div style="
        background:${color}22;
        border-left:6px solid ${color};
        padding:10px;
        border-radius:8px;
        margin-bottom:10px;">
        <b style="color:${color};">Abbruchwahrscheinlichkeit:</b>
        <span style="color:${color}; font-weight:600;">${abortChance}%</span>
      </div>

      <label>Dein Gegenangebot (€)</label>
      <input id="counter" type="number" min="0" step="0.01">

      <button id="sendBtn">Gegenangebot senden</button>
      <button id="acceptBtn" class="ghost">Annehmen</button>

      ${state.warningText ? `<p class="muted" style="color:#b91c1c">${state.warningText}</p>` : ""}
      ${errorMsg ? `<p class="muted" style="color:red">${errorMsg}</p>` : ""}

      ${renderHistory()}
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

function handleSubmit(raw) {

  const num = Number(raw.trim().replace(",", "."));

  if (!Number.isFinite(num) || num <= 0) {
    viewNegotiate("Bitte gültige Zahl eingeben.");
    return;
  }

  if (state.history.length > 0) {
    const last = state.history[state.history.length - 1].proband_counter;
    if (last != null && num < last) {
      viewNegotiate("Du darfst kein niedrigeres Angebot als zuvor machen.");
      return;
    }
  }

  if (num < 1500) {
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
      finished: true,
      deal_price: ""
    });

    viewAbort(100);
    return;
  }

  if (num < 2250) {

    state.warningCount++;
    state.warningText = "Ihr Angebot liegt deutlich unter der akzeptablen Preiszone.";

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

    if (state.warningCount >= 2) {
      finish(false, null);
      return;
    }

    state.runde++;
    viewNegotiate();
    return;
  }

  if (maybeAbort(num)) return;

  state.warningText = "";

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

  const next = computeNextOffer(num);
  state.current_offer = next;

  if (state.runde >= state.max_runden) {
    viewDecision();
    return;
  }

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
   FINISH
============================================================ */

function finish(accepted, price) {

  state.accepted = accepted;
  state.finished = true;
  state.deal_price = price;

  logRound({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: price,
    accepted,
    finished: true,
    deal_price: price
  });

  app.innerHTML = `
    <div class="card">
      <h1>Verhandlung beendet</h1>

      <p>${
        accepted
          ? `Einigung erzielt bei <b>${eur(price)}</b>`
          : "Keine Einigung erzielt."
      }</p>

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
