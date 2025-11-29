/* ============================================================
   HILFSFUNKTIONEN
============================================================ */

const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const round10 = (v) => Math.round(v / 10) * 10;

const eur = n =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);


/* ============================================================
   ZUSTAND – korrigiert
============================================================ */

function newState() {
  const startpreis = 5500;       // Fester Startpreis
  const schmerzgrenze = 3500;    // Feste untere Grenze

  return {
    participant_id: crypto.randomUUID?.() 
      ?? ("x_" + Date.now() + Math.random().toString(36).slice(2)),

    runde: 1,
    max_runden: randInt(8, 12),  // Zufällig 8–12 Runden

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
   PREISLOGIK – korrekt umgesetzt
============================================================ */

// Runde 1–3: Fix 250–500 € runter
function reductionEarly() {
  return randInt(250, 500);
}

// Ab Runde 4: 1–25% der Differenz der letzten 2 Nutzergebote
function reductionLate(userOffer) {
  let diff;

  const history = state.history.filter(h => h.proband_counter !== null);

  if (history.length < 2) {
    diff = Math.abs(state.initial_offer - userOffer);
  } else {
    const last = history[history.length - 1].proband_counter;
    const prev = history[history.length - 2].proband_counter;
    diff = Math.abs(last - prev);
  }

  if (diff <= 0) diff = 50; // fallback

  const percent = randInt(1, 25) / 100; // 1–25 %
  let step = diff * percent;

  return round10(step); // auf 10 € runden
}


/* ============================================================
   NÄCHSTES VERKÄUFERANGEBOT
============================================================ */

function computeNextOffer(userOffer) {
  let prev = state.current_offer;
  let step;

  // Runde 1–3
  if (state.runde <= 3) {
    step = reductionEarly();
  } 
  // Ab Runde 4
  else {
    step = reductionLate(userOffer);
  }

  let newPrice = prev - step;

  // Nicht unter Schmerzgrenze fallen
  if (newPrice < state.min_price)
    newPrice = state.min_price;

  return round10(newPrice);
}


function viewVignette(){
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>

    <p class="muted">Stelle dir folgende Situation vor:</p>

    <p>Du befindest dich auf einer <b>exklusiven Verkaufsmesse</b> für hochwertige Designermöbel.
       Ein Besucher möchte sein <b>gebrauchtes Designer-Ledersofa</b> verkaufen. 
       Das Stück ist gut gepflegt, stammt aus einer bekannten Designlinie und wird realistisch 
       im gehobenen Preisbereich gehandelt. Vergleichbare Sofas liegen auf dieser Messe 
       üblicherweise zwischen <b>2.500 € und 10.000 €</b>.</p>

    <p>Der Verkäufer ist grundsätzlich verhandlungsbereit, möchte aber dennoch einen 
       angemessenen Preis für das Sofa erzielen. Er reagiert auf deine Angebote und 
       passt seine Preisvorstellung im Verlauf der Verhandlung an. Mit zunehmender 
       Dauer der Verhandlung wird er jedoch vorsichtiger, da er sein Preislimit im Blick behalten muss.</p>

    <p>Auf der nächsten Seite beginnt die Preisverhandlung mit der <b>Verkäuferseite</b>.
       Du kannst ein <b>Gegenangebot</b> machen oder ein Angebot direkt annehmen.</p>

    <p class="muted"><b>Hinweis:</b> Die Verhandlung umfasst eine zufällige Anzahl von Runden 
       zwischen ${CONFIG.MIN_RUNDEN} und ${CONFIG.MAX_RUNDEN}.</p>

    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme zu, dass meine Eingaben zu <b>forschenden Zwecken</b> 
        gespeichert und anonym ausgewertet werden dürfen.</span>
      </label>

      <div><button id="startBtn" disabled>Verhandlung starten</button></div>
    </div>
  `;

  const consent = document.getElementById('consent');
  const startBtn = document.getElementById('startBtn');

  const sync = () => { startBtn.disabled = !consent.checked; };
  consent.addEventListener('change', sync);
  sync();

  startBtn.addEventListener('click', () => {
    if (!consent.checked) return;
    state = newState();
    viewNegotiate();
  });
}
