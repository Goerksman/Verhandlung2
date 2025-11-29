/* ============================================================
      GOOGLE SHEETS KONFIGURATION
   ============================================================ */

// --- CSV-Link deiner Tabelle ---
const GOOGLE_SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3s5qCrJ2PDoIjbIP9YvNtyUszeiPmko9OGT_saIHe9LneN80kXpSzHTlqGXGdgW93ta2kNvjtl_4k/pub?gid=0&single=true&output=csv";


/* ============================================================
      CSV → JSON LADEN
   ============================================================ */

async function loadSheetData() {
  const csv = await fetch(GOOGLE_SHEETS_CSV_URL).then(r => r.text());
  const rows = csv.trim().split("\n").map(r => r.split(","));
  const headers = rows[0].map(h => h.trim());

  return rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      obj[h] = (row[i] ? row[i].trim() : "");
    });
    return obj;
  });
}


/* ============================================================
      NEUE VERHANDLUNGS-REDUKTIONSLOGIK
   ============================================================ */

// Runde 1–3 → große Schritte (250–500€)
function calculateEarlyReduction(userOffer) {
  const MAX = 500;
  const MIN = 250;
  const THRESHOLD = 3000;

  // Wenn Nutzerangebot >= 3000 → maximaler Schritt
  if (userOffer >= THRESHOLD) return MAX;

  // Skaliere linear zwischen 250 und 500
  const ratio = userOffer / THRESHOLD;
  const reduction = MIN + ratio * (MAX - MIN);

  return Math.round(reduction);
}

// Runde 4+ → immer kleiner werdende Schritte Richtung Schmerzgrenze
function calculateLateReduction(currentPrice, minPrice, round, maxRounds) {
  const remainingRounds = maxRounds - round + 1;
  const remainingDiff = currentPrice - minPrice;

  if (remainingDiff < 0) return 0;

  return Math.max(5, Math.round(remainingDiff / remainingRounds));
}

// Random helper
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Rundung auf 25€
function round25(v) {
  return Math.round(v / 25) * 25;
}


/* ============================================================
      VERHANDLUNGSENGINE
   ============================================================ */

function sellerCounterOffer(state, userOffer) {

  let { round, maxRounds, currentPrice, minPrice } = state;

  let stepReduction;

  if (round <= 3) {
    // Frühe großen Schritte
    stepReduction = calculateEarlyReduction(userOffer);
  } else {
    // Späte kleinen Schritte
    stepReduction = calculateLateReduction(currentPrice, minPrice, round, maxRounds);
  }

  // Preis reduzieren
  let newPrice = currentPrice - stepReduction;

  // Schmerzgrenze nicht unterschreiten
  if (newPrice < minPrice) newPrice = minPrice;

  // Auf 25€ runden
  newPrice = round25(newPrice);

  // State aktualisieren
  state.currentPrice = newPrice;
  state.round++;

  return newPrice;
}


/* ============================================================
      UI LOGIK (Browser)
   ============================================================ */

let globalState = null;

async function loadVehicle() {

  const id = document.getElementById("vehicleId").value.trim();
  const data = await loadSheetData();

  const car = data.find(x => x.ID === String(id));
  if (!car) {
    document.getElementById("carData").innerHTML = "❌ Fahrzeug nicht gefunden.";
    return;
  }

  const startPrice = Number(car.Startpreis);
  const minPrice = Number(car.Schmerzgrenze);
  const maxRounds = randInt(7, 12);

  globalState = {
    round: 1,
    maxRounds,
    startPrice,
    currentPrice: startPrice,
    minPrice,
    car
  };

  document.getElementById("carData").innerHTML = `
      <b>Fahrzeug:</b> ${car.Fahrzeug}<br>
      <b>Startpreis:</b> ${startPrice} €<br>
      <b>Schmerzgrenze:</b> ${minPrice} €<br>
      <b>Runden:</b> ${maxRounds}
  `;

  document.getElementById("log").innerHTML =
      `Verhandlung gestartet! Verkäufer startet mit <b>${startPrice} €</b>.`;
}


function sendOffer() {
  if (!globalState) {
    alert("Bitte zuerst ein Fahrzeug laden!");
    return;
  }

  const userOffer = Number(document.getElementById("userOffer").value);

  if (isNaN(userOffer)) {
    alert("Bitte gültigen Zahlenwert eingeben.");
    return;
  }

  const sellerOffer = sellerCounterOffer(globalState, userOffer);

  let log = document.getElementById("log");
  log.innerHTML += `
        <br><br><b>Runde ${globalState.round - 1}</b>
        <br>Nutzer bietet: ${userOffer} €
        <br>Verkäufer bietet: ${sellerOffer} €
    `;

  if (globalState.round > globalState.maxRounds) {
    log.innerHTML += `<br><br><b>⛔ Maximale Runden erreicht!</b>`;
  }
}
