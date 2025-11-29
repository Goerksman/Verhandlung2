/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const round10 = v => Math.round(v / 10) * 10;

const eur = n =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);


/* ============================================================
   ZUSTAND – Fester Startpreis & Schmerzgrenze
============================================================ */

function newState() {
  const startpreis = 5500;
  const schmerzgrenze = 4500;

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

    warningCount: 0,
    warningText: "",
    finished: false,
    accepted: false,
    deal_price: null,

    patternMessage: ""
  };
}

let state = newState();


/* ============================================================
   PREISLOGIK
============================================================ */

// Runde 1–3: feste Absenkung 250–500 €
function reductionEarly() {
  return randInt(250, 500);
}

// Ab Runde 4: 1–25 % der Nutzer-Differenz
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
  let step = diff * percent;

  return round10(step);
}


/* ============================================================
   NÄCHSTES VERKÄUFER-ANGEBOT
============================================================ */

function computeNextOffer(userOffer) {
  const prev = state.current_offer;

  let step =
    state.runde <= 3 ? reductionEarly() : reductionLate(userOffer);

  let newPrice = prev - step;
  if (newPrice < state.min_price) newPrice = state.min_price;

  return round10(newPrice);
}


/* ============================================================
   SCREEN: VIGNETTE
============================================================ */

function viewVignette() {
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>

    <p class="muted">Stelle dir folgende Situation vor:</p>

    <p>Du befindest dich auf einer <b>exklusiven Verkaufsmesse</b> für hochwertige Designermöbel.
       Ein Besucher möchte sein <b>gebrauchtes Designer-Ledersofa</b> verkaufen. Es ist gut gepflegt
       und wird realistisch im gehobenen Preisbereich gehandelt. Vergleichbare Sofas werden hier
       meist zwischen <b>2.500 € und 10.000 €</b> angeboten.</p>

    <p>Der Verkäufer ist verhandlungsbereit, möchte aber dennoch einen fairen Preis erzielen.
       Er reagiert auf deine Angebote, passt seinen Preis schrittweise an und behält sein eigenes
       Preislimit im Blick.</p>

    <p>Auf der nächsten Seite beginnt die Preisverhandlung mit der <b>Verkäuferseite</b>.
       Du kannst frei Gegenangebote machen oder Angebote annehmen.</p>

    <p class="muted"><b>Hinweis:</b> Die Verhandlung umfasst eine zufällige Anzahl an Runden
       zwischen 8 und 12.</p>

    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox">
        <span>Ich stimme zu, dass meine Eingaben zu <b>forschenden Zwecken</b>
        gespeichert und anonym ausgewertet werden dürfen.</span>
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

    <div class="card" style="padding:16px;background:#fafafa;border:1px dashed #ccc;border-radius:12px;">
      <strong>Aktuelles Angebot der Verkäuferseite:</strong> ${eur(state.current_offer)}
      <br><small>Runde ${state.runde} / ${state.max_runden}</small>
    </div>

    <label for="counter">Dein Gegenangebot in €</label>
    <div class="row">
      <input id="counter" type="number" step="1" min="0">
      <button id="sendBtn">Gegenangebot senden</button>
    </div>

    <button id="acceptBtn" class="ghost">Angebot annehmen & Verhandlung beenden</button>

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
   VERLAUF (TABELLE)
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
   EINGABE DES NUTZERS
============================================================ */

function sendCounter() {
  const value = Number(document.getElementById("counter").value);

  if (!Number.isFinite(value) || value <= 0)
    return viewNegotiate("Bitte gültige Zahl eingeben.");

  const prev = state.current_offer;

  // speichern
  state.history.push({
    runde: state.runde,
    algo_offer: prev,
    proband_counter: value
  });

  // berechne neues Angebot
  const next = computeNextOffer(value);
  state.current_offer = next;

  if (state.runde >= state.max_runden) return viewDecision();

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
   SCREEN: FINALE SEITE
============================================================ */

function finish(accepted, deal) {
  state.accepted = accepted;
  state.finished = true;
  state.deal_price = deal;

  app.innerHTML = `
    <h1>Verhandlung beendet</h1>

    <p>
      ${
        accepted
          ? `Einigung erzielt bei <b>${eur(deal)}</b>`
          : `Keine Einigung erzielt.`
      }
    </p>

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

