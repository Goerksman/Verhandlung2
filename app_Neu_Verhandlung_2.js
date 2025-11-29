

const GOOGLE_SHEETS_CSV_URL =
    https://docs.google.com/spreadsheets/d/1993f7-GVNOEetat7rIFJ61WZN8zaqPGRb0ExCwWpjnM/edit?gid=1523776226#gid=1523776226;



/* ================================
    GOOGLE SHEETS LADEN (CSV → JSON)
   ================================ */

async function loadSheetData() {
    const csv = await fetch(GOOGLE_SHEETS_CSV_URL).then(r => r.text());
    const rows = csv.split("\n").map(r => r.split(","));
    const headers = rows[0];

    return rows.slice(1)
        .filter(r => r.length === headers.length)
        .map(row => {
            let obj = {};
            headers.forEach((h, i) => obj[h.trim()] = row[i].trim());
            return obj;
        });
}



/* ================================
      NEUER VERHANDLUNGSALGORITHMUS
   ================================ */

function computeNextOffer(prev, round, maxRounds, minPrice) {

    // Nahe Schmerzgrenze → kleine Schritte
    if (prev <= minPrice + 80) {
        const step = randInt(5, 35);
        return roundTo25(Math.max(prev - step, minPrice));
    }

    // Fortschritt von 0 → 1
    const progress = round / maxRounds;

    // Anfang große Schritte → später kleine
    const MAX_STEP = 500;
    const MIN_STEP = 40;
    const dynamic = Math.floor(MAX_STEP - (MAX_STEP - MIN_STEP) * progress);

    const reduction = randInt(Math.floor(dynamic * 0.7), dynamic);

    let next = prev - reduction;
    if (next < minPrice) next = minPrice;

    return roundTo25(next);
}



/* ================================
      VERHANDLUNG STARTEN
   ================================ */

async function startNegotiation(vehicleId) {
    const data = await loadSheetData();

    const car = data.find(x => x.ID === String(vehicleId));
    if (!car) {
        console.error("Fahrzeug nicht gefunden!");
        return;
    }

    // Daten aus Google Sheets
    const initialOffer = Number(car.Startpreis);
    const minPrice = Number(car.Schmerzgrenze);

    // Zufällige 7–12 Runden
    const maxRounds = randInt(7, 12);

    let current = initialOffer;
    let round = 1;
    let finished = false;
    let dealPrice = null;
    let history = [];

    console.log(`\n=== Verhandlung gestartet für: ${car.Fahrzeug} ===`);
    console.log(`Startpreis: ${initialOffer} €`);
    console.log(`Schmerzgrenze: ${minPrice} €`);
    console.log(`Runden: ${maxRounds}`);
    console.log("----------------------------------------");

    while (!finished && round <= maxRounds) {

        // Verkäufer macht Angebot
        console.log(`\nRunde ${round}/${maxRounds}`);
        console.log(`Verkäufer bietet an: ${current} €`);

        // Nutzerangebot abfragen
        const userOffer = await askUser(`Dein Gegenangebot (oder leer für ANNEHMEN): `);

        if (userOffer === "") {
            finished = true;
            dealPrice = current;
            console.log(`\nDu hast angenommen: ${current} €`);
            break;
        }

        const userVal = Number(userOffer);

        history.push({
            round,
            seller: current,
            user: userVal
        });

        // Auto-Accept Regel
        if (Math.abs(current - userVal) <= 100) {
            finished = true;
            dealPrice = userVal;
            console.log(`\nAuto-Accept! Differenz < 100 €`);
            console.log(`Einigung bei: ${dealPrice} €`);
            break;
        }

        // Neues Verkäuferangebot
        current = computeNextOffer(current, round, maxRounds, minPrice);

        round++;
        await sleep(randInt(600, 1600));
    }

    if (!finished) {
        console.log("\nKeine Einigung erzielt!");
        console.log(`Letztes Angebot: ${current} €`);
    }

    console.log("\n=== VERHANDLUNGSVERLAUF ===");
    console.table(history);

    return {
        finished,
        dealPrice,
        history,
        lastOffer: current
    };
}



/* ================================
      HELFERFUNKTIONEN
   ================================ */

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roundTo25(value) {
    const r = value % 25;
    return r >= 13 ? value + (25 - r) : value - r;
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Nutzereingabe in Node.js
function askUser(question) {
    return new Promise(res => {
        const rl = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(question, (answer) => {
            rl.close();
            res(answer);
        });
    });
}



/* ================================
      START (BEISPIEL)
   ================================ */



startNegotiation(1);






