/* ============================================================
      GOOGLE-SHEETS CSV LINK (FUNKTIONIERT IM BROWSER!)
   ============================================================ */

const GOOGLE_SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3s5qCrJ2PDoIjbIP9YvNtyUszeiPmko9OGT_saIHe9LneN80kXpSzHTlqGXGdgW93ta2kNvjtl_4k/pub?output=ods";


/* ============================================================
      CSV → JSON
   ============================================================ */

async function loadSheetData() {

    const csv = await fetch(GOOGLE_SHEETS_CSV_URL).then(r => r.text());

    const rows = csv.trim().split("\n").map(r => r.split(","));
    const headers = rows[0].map(h => h.trim());

    return rows.slice(1).map(row => {
        let obj = {};
        headers.forEach((h, i) => obj[h] = row[i]?.trim());
        return obj;
    });
}



/* ============================================================
      NEUE VERHANDLUNGSLOGIK
   ============================================================ */

function calculateEarlyReduction(userOffer) {
    const MAX = 500;
    const MIN = 250;
    const THRESHOLD = 3000;

    if (userOffer >= THRESHOLD) return MAX;

    const ratio = userOffer / THRESHOLD; 
    return Math.round(MIN + ratio * (MAX - MIN));
}

function calculateLateReduction(currentPrice, minPrice, round, maxRounds) {
    const remaining = currentPrice - minPrice;
    const remainingRounds = maxRounds - round + 1;
    return Math.max(5, Math.round(remaining / remainingRounds));
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}



/* ============================================================
      VERHANDLUNGSZUSTAND
   ============================================================ */

let state = null;



/* ============================================================
      FAHRZEUG LADEN
   ============================================================ */

async function loadVehicle() {

    const id = document.getElementById("vehicleId").value;
    const data = await loadSheetData();
    const car = data.find(x => x.ID === String(id));

    if (!car) {
        document.getElementById("carData").innerHTML = "❌ Fahrzeug nicht gefunden!";
        return;
    }

    const startPrice = Number(car.Startpreis);
    const minPrice = Number(car.Schmerzgrenze);

    state = {
        round: 1,
        maxRounds: randInt(7,12),
        currentPrice: startPrice,
        startPrice,
        minPrice,
        car,
        history: []
    };

    document.getElementById("carData").innerHTML = `
        <b>Fahrzeug:</b> ${car.Fahrzeug}<br>
        <b>Startpreis:</b> ${startPrice} €<br>
        <b>Schmerzgrenze:</b> ${minPrice} €<br>
        <b>Runden:</b> ${state.maxRounds}
    `;

    document.getElementById("log").innerHTML =
        `🔵 Verkäufer startet mit <b>${startPrice} €</b>.`;
}



/* ============================================================
      ANGEBOT SENDEN
   ============================================================ */

function sendOffer() {
    if (!state) return alert("Bitte erst Fahrzeug laden.");

    const userOffer = Number(document.getElementById("userOffer").value);
    if (!userOffer) return alert("Bitte ein Angebot eingeben.");

    const prev = state.currentPrice;
    let sellerOffer;

    if (state.round <= 3) {
        sellerOffer = prev - calculateEarlyReduction(userOffer);
    } else {
        sellerOffer = prev - calculateLateReduction(prev, state.minPrice, state.round, state.maxRounds);
    }

    if (sellerOffer < state.minPrice) sellerOffer = state.minPrice;
    state.currentPrice = sellerOffer;

    state.history.push({
        round: state.round,
        user: userOffer,
        seller: sellerOffer
    });

    const log = document.getElementById("log");
    log.innerHTML += `
        <br><br><b>Runde ${state.round}</b><br>
        👤 Nutzer: ${userOffer} €<br>
        🏷️ Verkäufer: ${sellerOffer} €
    `;

    if (Math.abs(userOffer - sellerOffer) <= 100) {
        log.innerHTML += `<br><br><b>🎉 Einigung bei ${userOffer} € (Auto-Accept)</b>`;
    }

    state.round++;

    if (state.round > state.maxRounds) {
        log.innerHTML += `<br><br><b>⛔ Maximale Runden erreicht.</b>`;
    }
}


