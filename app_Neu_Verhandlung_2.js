// === Google-Sheets Konfiguration =================================================
const GOOGLE_SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3s5qCrJ2PDoIjbIP9YvNtyUszeiPmko9OGT_saIHe9LneN80kXpSzHTlqGXGdgW93ta2kNvjtl_4k/pub?gid=0&single=true&output=csv";

// === Hilfsfunktionen =============================================================
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const eur = n => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const roundTo25 = v => Math.round(v / 25) * 25;

// === Funktion: CSV → JSON ========================================================
async function loadSheetData() {
  const csv = await fetch(GOOGLE_SHEETS_CSV_URL).then(r => r.text());
  const rows = csv.trim().split("\n").map(r => r.split(","));
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i] ? row[i].trim() : "");
    return obj;
  });
}

// === Verhandlungslogik ===========================================================
function computeNextOffer(prevOffer, minPrice, userOffer, round, maxRounds) {
  const prev = Number(prevOffer);
  const m = Number(minPrice);

  // Runde 1–3: große Schritte
  if (round <= 3) {
    const MAX = 500;
    const MIN = 250;
    const THRESHOLD = 3000;
    let step;
    if (userOffer >= THRESHOLD) {
      step = MAX;
    } else {
      const ratio = userOffer / THRESHOLD;
      step = MIN + (MAX - MIN) * ratio;
    }
    const raw = prev - step;
    return Math.max(m, roundTo25(raw));
  }

  // Ab Runde 4: kleine Schritte bis Schmerzgrenze
  const remaining = maxRounds - round + 1;
  const dist = Math.max(0, prev - m);
  let step = dist / remaining;
  step = clamp(step, 10, 80);
  const raw = prev - step;
  return Math.max(m, roundTo25(raw));
}

// === Browser UI + Verhandlung ====================================================
document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");

  let state = null;

  function newState(start, min) {
    return {
      round: 1,
      maxRounds: randInt(7, 12),
      currentPrice: start,
      minPrice: min,
      startPrice: start,
      history: []
    };
  }

  function renderLoadCar(data) {
    app.innerHTML = `
      <h1>Fahrzeug auswählen</h1>
      <label for="vehicleId">ID:</label>
      <input id="vehicleId" type="number" value="1"/>
      <button id="loadBtn">Laden</button>
    `;
    document.getElementById("loadBtn").addEventListener("click", async () => {
      const id = document.getElementById("vehicleId").value;
      const car = data.find(x => x.ID === String(id));
      if (!car) {
        alert("Fahrzeug nicht gefunden.");
        return;
      }
      const start = Number(car.Startpreis);
      const min = Number(car.Schmerzgrenze);
      state = newState(start, min);
      renderNegotiation();
    });
  }

  function renderNegotiation() {
    app.innerHTML = `
      <h1>Verhandlung</h1>
      <p>Runde: ${state.round} / ${state.maxRounds}</p>
      <p>Aktuelles Angebot: <strong>${eur(state.currentPrice)}</strong></p>
      <label for="userOffer">Dein Angebot (€):</label><br>
      <input id="userOffer" type="number" /><br><br>
      <button id="offerBtn">Gegenangebot</button>
      <div id="log"></div>
    `;
    document.getElementById("offerBtn").addEventListener("click", () => {
      const userVal = Number(document.getElementById("userOffer").value);
      if (!Number.isFinite(userVal) || userVal < 0) {
        alert("Bitte gültigen Betrag eingeben.");
        return;
      }
      const next = computeNextOffer(state.currentPrice, state.minPrice, userVal, state.round, state.maxRounds);
      const logDiv = document.getElementById("log");
      logDiv.innerHTML += `
        <p>Dein Angebot: ${eur(userVal)} — Verkäufer bietet: ${eur(next)}</p>
      `;
      state.currentPrice = next;
      state.round++;
      if (state.round > state.maxRounds) {
        logDiv.innerHTML += `<p><strong>Verhandlung beendet. Letztes Angebot: ${eur(next)}</strong></p>`;
      } else {
        renderNegotiation();
      }
    });
  }

  // Lade Daten → dann UI
  loadSheetData().then(data => {
    renderLoadCar(data);
  }).catch(err => {
    app.innerHTML = `<p style="color:red;">Fehler beim Laden der Fahrzeugdaten.</p>`;
    console.error(err);
  });
});




