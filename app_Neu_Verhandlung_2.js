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
    // Teilnehmer-ID
    participant_id:
      crypto.randomUUID?.() ||
      "x_" + Date.now() + Math.random().toString(36).slice(2),

    // Runden
    runde: 1,
    max_runden: randInt(8, 12),

    // Preise
    initial_offer: startpreis,
    min_price: schmerzgrenze,
    current_offer: startpreis,

    // Verlauf
    history: [],

    // Status
    finished: false,
    accepted: false,
    deal_price: null,

    // Muster & Warnung
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
   NÄCHSTES VERKÄUFERANGEBOT
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

  // 1) Angebote unter 3000 → 10–30 %
  if (userOffer < 3000) {
    chance += randInt(10, 30);
  }

  // 2) Minimale Erhöhungen (≤ +20 € gegenüber letztem Angebot)
  const last = state.history[state.history.length - 1];
  if (last && last.proband_counter !== null) {
    const diff = Math.abs(userOffer - last.proband_counter);
    if (diff <= 20) {
      chance += randInt(5, 20);
    }
  }

  // 3) später in den Runden → zusätzlich + 2 % pro Runde
  chance += state.runde * 2;

  // harte Obergrenze
  if (chance > 75) chance = 75;

  return chance;
}

function maybeAbort(userOffer) {
  const chance = abortProbability(userOffer);
  const roll = randInt(1, 100);

  if (roll <= chance) {
    // Abbruch
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
    <p class="muted">Auslöser: Angebotsmuster / Preisabweichungen (Abbruchchance: ${chance} %)</p>

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

    <p>Du befindest dich auf einer <b>exklusiven Verkaufsmesse</b> für hochwertige Designermöbel.
       Ein Besucher möchte sein <b>gebrauchtes Designer-Ledersofa</b> verkaufen.
       Das Stück ist gepflegt und wird auf der Messe im gehobenen Preisbereich gehandelt.</p>

    <p>Der Verkäufer ist verhandlungsbereit, reagiert auf Gegenangebote
       und passt seinen Preis Schritt für Schritt an.</p>

    <p class="muted"><b>Hinweis:</b> Die Verhandlung umfasst eine zufällige Anzahl
       an Runden zwischen 8 und 12.</p>

    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox">
        <span>Ich stimme zu, dass meine Eingaben zu <b>forschenden Zwecken</b> gespeichert
        und anonym analysiert werden dürfen.</span>
      </label>
      <div><button id="startBtn" disabled>Verhandlung starten</button></div>
    </div>
  `;

  const c = document.getElementById("consent");
  const b = document.getElementById("startBtn");

  const sync = () => (b.disabled = !c.checked);
  c.addEventListener("change", sync);
  sync();

  b.addEventListener("click", () => {
    state = newState();
    viewNegotiate();
  });
}


/* ============================================================
   SCREEN: VERHANDLUNG
============================================================ */

function viewNegotiate(errorMsg = "") {
  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;background:#fafafa;border-radius:12px;border:1px dashed #888;">
      <strong>Aktuelles Angebot der Verkäuferseite:</strong> ${eur(state.current_offer)}
      <br><small>Runde ${state.runde} / ${state.max_runden}</small>
    </div>

    <label>Dein Gegenangebot:</label>
    <div class="row">
      <input id="counter" type="number" min="0" step="1">
      <button id="sendBtn">Senden</button>
    </div>

    <button id="acceptBtn" class="ghost">Angebot annehmen</button>

    ${errorMsg ? `<p style="color:red">${errorMsg}</p>` : ""}

    ${renderHistory()}
  `;

  document.getElementById("sendBtn").onclick = sendCounter;
  document.getElementById("counter").onkeydown = e => {
    if (e.key === "Enter") sendCounter();
  };

  document.getElementById("acceptBtn").onclick = () =>
    finish(true, state.current_offer);
}


/* ============================================================
   VERLAUFSTABELLE
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
          .map(
            h => `
          <tr>
            <td>${h.runde}</td>
            <td>${eur(h.algo_offer)}</td>
            <td>${h.proband_counter != null ? eur(h.proband_counter) : "-"}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}
/* ============================================================
   EINGABE DES KÄUFERS
============================================================ */

function sendCounter() {
  const value = Number(document.getElementById("counter").value);

  if (!Number.isFinite(value) || value <= 0)
    return viewNegotiate("Bitte gültige Zahl eingeben.");

  // vor Speicherung prüfen: Abbruch?
  if (maybeAbort(value)) return;

  const prev = state.current_offer;

  state.history.push({
    runde: state.runde,
    algo_offer: prev,
    proband_counter: value
  });

  const next = computeNextOffer(value);
  state.current_offer = next;

  if (state.runde >= state.max_runden)
    return viewDecision();

  state.runde++;
  viewNegotiate();
}


/* ============================================================
   SCREEN: LETZTE RUNDE
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
   FINALE SEITE
============================================================ */

function finish(accepted, deal) {
  state.finished = true;
  state.accepted = accepted;
  state.deal_price = deal;

  app.innerHTML = `
    <h1>Verhandlung beendet</h1>

    <p>${
      accepted
        ? `Einigung erzielt bei <b>${eur(deal)}</b>.`
        : "Keine Einigung erzielt."
    }</p>

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
