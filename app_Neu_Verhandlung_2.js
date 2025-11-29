

// Google Sheet → Datei → Im Web veröffentlichen → CSV
const GOOGLE_SHEETS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/1993f7-GVNOEetat7rIFJ61WZN8zaqPGRb0ExCwWpjnM/edit?gid=1523776226#gid=1523776226";



/* ============================================================
      CSV LADEN (Google Sheets)
   ============================================================ */

async function loadSheetData() {
    const fetch = (await import("node-fetch")).default;

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
      NEUE VERHANDLUNGSLOGIK
   ============================================================ */

// Runde 1–3 → 250–500 € Reduktion, abhängig vom Nutzerangebot
function calculateEarlyReduction(userOffer) {
    const MAX = 500;
    const MIN = 250;
    const THRESHOLD = 3000;

    if (userOffer >= THRESHOLD) return MAX;

    const ratio = userOffer / THRESHOLD;     // 0–1

    return Math.round(MIN + ratio * (MAX - MIN));
}

// Ab Runde 4 → kleine, dynamische Schritte Richtung Schmerzgrenze
function calculateLateReduction(currentPrice, minPrice, round, maxRounds) {
    const remaining = currentPrice - minPrice;
    const remainingRounds = maxRounds - round + 1;

    return Math.max(5, Math.round(remaining / remainingRounds));
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}



/* ============================================================
      VERHANDLUNGSENGINE
   ============================================================ */

async function startNegotiation(vehicleId) {

    console.log("📄 Lade Fahrzeugdaten aus Google Sheets ...");

    const data = await loadSheetData();

    const car = data.find(x => x.ID === String(vehicleId));
    if (!car) {
        console.error("❌ Fahrzeug nicht gefunden!");
        return;
    }

    const initialOffer = Number(car.Startpreis);
    const minPrice = Number(car.Schmerzgrenze);
    const maxRounds = randInt(7, 12);

    console.log(`\n=== Verhandlung gestartet: ${car.Fahrzeug} ===`);
    console.log(`🔵 Startpreis: ${initialOffer} €`);
    console.log(`🔴 Schmerzgrenze: ${minPrice} €`);
    console.log(`🔁 Runden: ${maxRounds}`);
    console.log("=================================================");

    let current = initialOffer;
    let round = 1;
    let history = [];
    let finished = false;
    let dealPrice = null;

    while (!finished && round <= maxRounds) {

        console.log(`\n📘 Runde ${round}/${maxRounds}`);
        console.log(`🏷️ Verkäufer bietet: ${current} €`);

        // Nutzerfragen (Terminal)
        const userOffer = await askUser("👤 Dein Gegenangebot (oder Enter für Annehmen): ");

        if (userOffer === "") {
            console.log(`\n✔ Du hast angenommen: ${current} €`);
            finished = true;
            dealPrice = current;
            break;
        }

        const userVal = Number(userOffer);

        history.push({ round, seller: current, user: userVal });

        // Auto-Accept
        if (Math.abs(userVal - current) <= 100) {
            console.log("\n🎉 Auto-Accept: Differenz < 100 €");
            dealPrice = userVal;
            finished = true;
            break;
        }

        // Verkäufer berechnet neues Angebot
        let reduction;

        if (round <= 3) {
            reduction = calculateEarlyReduction(userVal);
        } else {
            reduction = calculateLateReduction(current, minPrice, round, maxRounds);
        }

        console.log(`📉 Reduktion: -${reduction} €`);

        current = current - reduction;
        if (current < minPrice) current = minPrice;

        round++;
        await sleep(500 + randInt(200, 600));
    }

    console.log("\n================= ENDE =================");

    if (finished && dealPrice !== null) {
        console.log(`🎯 Einigung erzielt: ${dealPrice} €`);
    } else {
        console.log(`❌ Keine Einigung. Letztes Angebot: ${current} €`);
    }

    console.log("\n📄 Verhandlungsverlauf:");
    console.table(history);
}



/* ============================================================
      HELFERFUNKTIONEN (Node.js)
   ============================================================ */

function askUser(question) {
    return new Promise(res => {
        const rl = require("readline").createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(question, answer => {
            rl.close();
            res(answer);
        });
    });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}



/* ============================================================
      VERHANDLUNG STARTEN
   ============================================================ */

// Beispiel: Fahrzeug mit ID = 1 aus Google Sheets
startNegotiation(1);


