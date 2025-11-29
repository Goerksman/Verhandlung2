

// Google Sheet → Datei → Im Web veröffentlichen → CSV auswählen
const GOOGLE_SHEETS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/1993f7-GVNOEetat7rIFJ61WZN8zaqPGRb0ExCwWpjnM/edit?gid=1523776226#gid=1523776226";  // <-- WICHTIG



/* ============================================================
      CSV → JSON PARSER
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
      VERHANDLUNGSLOGIK (NEU)
   ============================================================ */

// Runde 1–3 → große Schritte (250–500€) abhängig vom Nutzerangebot
function calculateEarlyReduction(userOffer) {
    const MAX = 500;
    const MIN = 250;
    const THRESHOLD = 3000;

    if (userOffer >= THRESHOLD) return MAX;

    const ratio = userOffer / THRESHOLD; // 0–1
    return Math.round(MIN + ratio * (MAX - MIN));
}

// Ab Runde 4 → kleine Schritte Richtung Schmerzgrenze
function calculateLateReduction(currentPrice, minPrice, round, maxRounds) {
    const remaining = currentPrice - minPrice;
    const remainingRounds = maxRounds - round + 1;

    return Math.max(5, Math.round(remaining / remainingRounds));
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}



/* ============================================================
      BROWSER: VERHANDLUNGSDATEN
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
        document.getElementById("carData").innerHTML = "❌ Fahrzeug nicht gefunden.";
        return;
    }

    const startPrice = Number(car.Startpreis);
    const minPrice = Number(car.Schmerzgrenze);
    const maxRounds = randInt(7, 12);

    state = {
        round: 1,
        maxRounds,
        currentPrice: startPrice,
        startPrice,
        minPrice,
        car,
        history: []
    };

    // Ausgabe im Browser
    document.getElementById("carData").innerHTML = `
        <b>Fahrzeug:</b> ${car.Fahrzeug}<br>
        <b>Startpreis:</b> ${startPrice} €<br>
        <b>Schmerzgrenze:</b> ${minPrice} €<br>
        <b>Runden:</b> ${maxRounds}<br>
    `;

    document.getElementById("log").innerHTML =
        `Verhandlung gestartet! Verkäufer startet mit <b>${startPrice} €</b>.`;
}



/* ============================================================
      ANGEBOT SENDEN
   ============================================================ */

function sendOffer() {
    if (!state) {
        alert("Bitte erst Fahrzeug laden!");
        return;
    }

    const userOffer = Number(document.getElementById("userOffer").value);

    if (!userOffer || isNaN(userOffer)) {
        alert("Bitte gültigen Betrag eingeben.");
        return;
    }

    let sellerOffer;
    const prev = state.currentPrice;

    // große Schritte (Runde 1–3)
    if (state.round <= 3) {
        sellerOffer = prev - calculateEarlyReduction(userOffer);
    }

    // kleine Schritte (Runde >=4)
    else {
        sellerOffer = prev - calculateLateReduction(prev, state.minPrice, state.round, state.maxRounds);
    }

    // Schmerzgrenze einhalten
    if (sellerOffer < state.minPrice) sellerOffer = state.minPrice;

    state.currentPrice = sellerOffer;

    // History speichern
    state.history.push({
        round: state.round,
        user: userOffer,
        seller: sellerOffer
    });

    // Ausgabe im Browser
    const log = document.getElementById("log");
    log.innerHTML += `
        <br><br><b>Runde ${state.round}</b><br>
        Nutzer bietet: ${userOffer} €<br>
        Verkäufer bietet: ${sellerOffer} €`;

    state.round++;

    // Ende erreicht?
    if (state.round > state.maxRounds) {
        log.innerHTML += `<br><br><b>⛔ Maximale Runden erreicht!</b>`;
    }

    // Auto-Accept
    if (Math.abs(userOffer - sellerOffer) <= 100) {
        log.innerHTML += `<br><br><b>🎉 Auto-Accept! Einigung bei ${userOffer} €.</b>`;
    }
}


