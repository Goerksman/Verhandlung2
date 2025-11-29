/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const round10 = (v) => Math.round(v / 10) * 10;

const eur = n =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);


/* ============================================================
   ZUSTAND
============================================================ */

function newState() {
  const startpreis = 5500;     // Fester Startpreis
  const schmerzgrenze = 4500;  // Beispiel: Feste Schmerzgrenze (1000 drunter)

  return {
    participant_id: crypto.randomUUID?.() ||
      ("x_" + Date.now() + Math.random().toString(36).slice(2)),

    runde: 1,
    max_runden: randInt(8, 12), // wie gewünscht

    initial_offer: startpreis,
    min_price: schmerzgrenze,
    current_offer: startpreis,

    history: [],

    warningCount: 0,
    warningText: "",
    finished: false,
    accepted: false,
    deal_price: null
  };
}

let state = newState();


/* ============================================================
   PREISLOGIK
============================================================ */

// Runde 1–3: 250–500 €
function reductionEarly() {
  return randInt(250, 500);
}

// Runde 4+: 1–25 % der Nutzerdifferenz
function reductionLate(userOffer) {
  let diff;

  const history = state.history.filter(h => h.proband_counter !== null);

  if (history.length < 2) {
    // Wenn erst 1 Nutzerangebot → Differenz = Startpreis - Angebot
    diff = Math.abs(state.initial_offer - userOffer);
  } else {
    const last = history[history.length - 1].proband_counter;
    const prev = history[history.length - 2].proband_counter;
    diff = Math.abs(last - prev);
  }

  if (diff <= 0) diff = 50; // fallback, falls gleiches Angebot

  const percent = randInt(1, 25) / 100; // 1–25 %
  let step = diff * percent;

  return round10(step);
}


/* ============================================================
   NÄCHSTES VERKÄUFERANGEBOT
============================================================ */

function computeNextOffer(userOffer) {
  let prev = state.current_offer;
  let step;

  if (state.runde <= 3) {
    step = reductionEarly();
  } else {
    step = reductionLate(userOffer);
  }

  let newPrice = prev - step;

  if (newPrice < state.min_price)
    newPrice = state.min_price;

  return round10(newPrice);
}


/* ============================================================
   UI – Verhandlungsmaske (Startet direkt!)
============================================================ */

function renderScreen(errorMsg = "") {
  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Händler-ID: ${state.participant_id}</p>

    <div class="card">
      <strong>Angebot der Verkäuferseite:</strong> ${eur(state.current_offer)}<br>
      <small>Runde ${state.runde} / ${state.max_runden}</small>
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

  document.getElementById("sendBtn").addEventListener("click", sendCounter);
  document.getElementById("counter").addEventListener("keydown", e => {
    if (e.key === "Enter") sendCounter();
  });

  document.getElementById("acceptBtn").addEventListener("click", () => {
    finish(true, state.current_offer);
  });
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
        ${state.history.map(h => `
          <tr>
            <td>${h.runde}</td>
            <td>${eur(h.algo_offer)}</td>
            <td>${h.proband_counter !== null ? eur(h.proband_counter) : "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* ============================================================
   EINGABE BEARBEITEN
============================================================ */

function sendCounter() {
  const value = Number(document.getElementById("counter").value);

  if (!Number.isFinite(value) || value <= 0)
    return renderScreen("Bitte gültige Zahl eingeben.");

  const prev = state.current_offer;

  // speichern
  state.history.push({
    runde: state.runde,
    algo_offer: prev,
    proband_counter: value
  });

  // nächstes Angebot berechnen
  const next = computeNextOffer(value);
  state.current_offer = next;

  // letzte Runde?
  if (state.runde >= state.max_runden) {
    return renderDecision();
  }

  state.runde++;
  renderScreen();
}


/* ============================================================
   ABSCHLUSS
============================================================ */

function renderDecision() {
  app.innerHTML = `
    <h1>Letzte Runde</h1>

    <div class="card">
      <strong>Letztes Angebot:</strong> ${eur(state.current_offer)}
    </div>

    <button id="acceptBtn">Annehmen</button>
    <button id="declineBtn" class="ghost">Ablehnen</button>

    ${renderHistory()}
  `;

  document.getElementById("acceptBtn").addEventListener("click", () => {
    finish(true, state.current_offer);
  });

  document.getElementById("declineBtn").addEventListener("click", () => {
    finish(false, null);
  });
}

function finish(accepted, deal) {
  state.accepted = accepted;
  state.finished = true;
  state.deal_price = deal;

  app.innerHTML = `
    <h1>Verhandlung beendet</h1>

    <p>
      ${accepted
        ? `Einigung erzielt bei <b>${eur(deal)}</b>`
        : `Keine Einigung erzielt.`}
    </p>

    ${renderHistory()}

    <button id="restartBtn">Neue Verhandlung</button>
  `;

  document.getElementById("restartBtn").addEventListener("click", () => {
    state = newState();
    renderScreen();
  });
}


/* ============================================================
   START DIREKT MIT VERHANDLUNG
============================================================ */

renderScreen();



function viewVignette() {
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>

    <p class="muted">Bitte lesen Sie die folgende Situation aufmerksam durch.</p>

    <p>
      Sie befinden sich auf einer <b>exklusiven Verkaufsmesse für Designer-Möbel</b>.
      Ein Besucher möchte dort sein <b>hochwertiges, gepflegtes Designer-Ledersofa</b> verkaufen.
      Das Sofa zeichnet sich durch ein besonderes Design und eine sehr gute Verarbeitung aus.
    </p>

    <p>
      Auf der Messe werden ähnliche Ledersofas üblicherweise in einer Preisspanne
      zwischen <b>2.500 € und 10.000 €</b> angeboten. Der Verkäufer ist grundsätzlich offen für
      eine Preisverhandlung, möchte aber einen angemessenen Preis erzielen.
    </p>

    <p>
      Sie treten in eine <b>direkte Preisverhandlung</b> mit der Verkäuferseite ein.
      In jeder Runde erhalten Sie ein Verkäuferangebot und können entweder:
    </p>

    <ul>
      <li>ein <b>Gegenangebot</b> machen oder</li>
      <li>das aktuelle Angebot der Verkäuferseite <b>annehmen</b>.</li>
    </ul>

    <p>
      Die Verhandlung endet spätestens nach einer zufälligen Anzahl von
      <b>8 bis 12 Runden</b>. Wird keine Einigung erzielt, gilt die Verhandlung als
      ohne Abschluss beendet.
    </p>

    <p class="muted">
      <b>Hinweis:</b> Während der Verhandlung werden Ihre Eingaben anonym gespeichert
      und ausschließlich für wissenschaftliche Forschungszwecke verwendet.
    </p>

    <div class="grid" style="margin-top:24px;">
      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>
          Ich habe die Beschreibung gelesen und stimme der anonymen Speicherung
          meiner Eingaben zu Forschungszwecken zu.
        </span>
      </label>

      <div>
        <button id="startBtn" disabled>Verhandlung starten</button>
      </div>
    </div>
  `;

  const consent = document.getElementById('consent');
  const startBtn = document.getElementById('startBtn');

  function sync(){
    startBtn.disabled = !consent.checked;
  }

  consent.addEventListener('change', sync);
  sync();

  startBtn.addEventListener('click', () => {
    if (!consent.checked) return;
    state = newState();
    renderScreen();     // ← alte UI starten
  });
}





