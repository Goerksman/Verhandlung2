
// Wichtig: Google Sheet → Datei → Im Web veröffentlichen → CSV wählen!
const GOOGLE_SHEETS_CSV_URL =
    https://docs.google.com/spreadsheets/d/1993f7-GVNOEetat7rIFJ61WZN8zaqPGRb0ExCwWpjnM/edit?gid=1523776226#gid=1523776226; // 




async function loadSheetData() {
    const csv = await fetch(GOOGLE_SHEETS_CSV_URL).then(r => r.text());
    const rows = csv.split("\n").map(r => r.split(","));
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
      🟧 VERHANDLUNGSSTIL (Neue Logik!)
   ============================================================ */

// Runde 1–3 → große Schritte 250–500 €, abhängig vom Nutzerangebot
function calculateEarlyReduction(userOffer) {
    const maxReduction = 500;
    const minReduction = 250;
    const threshold = 3000;

    // Nutzer bietet >= 3000 → volle Reduktion 500€
    if (userOffer >= threshold) {
        return maxReduction;
    }

    // Verhältnis (0–1)
    const ratio = userOffer / threshold;

    // Dynamisch 250–500 €, je höher das Nutzerangebot, desto mehr Reduktion
    const reduction = minReduction + ((maxReduction - minReduction) * ratio);

    return Math.round(reduction);
}

// Ab Runde 4 → Schritte werden kleiner, abhängig vom Restabstand
function calculateLateReduction(currentPrice, minPrice, round, maxRounds) {
    const remaining = currentPrice - minPrice;
    const remainingRounds = maxRounds - round + 1;

    // Durchschnittlicher dynamischer Schritt Richtung Schmerzgrenze
    const reduction = remaining / remainingRounds;

    return Math.round(reduction);
}

// Hilfsfunktion (Zufallszahl)
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}



/* ============================================================
      🟩 VERHANDLUNGSENGINE
   ============================================================ */

function sellerCounterOffer(state, userOffer) {

    const { round, maxRounds, currentPrice, minPrice } = state;
    let reduction;

    // ---------------------------------------
    // 🟦 Erste 3 Runden → große Schritte
    // ---------------------------------------
    if (round <= 3) {
        reduction = calculateEarlyReduction(userOffer);
    }

    // ---------------------------------------
    // 🟧 Ab Runde 4 → kleine Schritte
    // ---------------------------------------
    else {
        reduction = calculateLateReduction(currentPrice, minPrice, round, maxRounds);
    }

    // ---------------------------------------
    // Neues Angebot berechnen
    // ---------------------------------------
    let newPrice = currentPrice - reduction;
    if (newPrice < minPrice) newPrice = minPrice;

    // State aktualisieren
    state.currentPrice = newPrice;
    state.round++;

    return newPrice;
}



/* ============================================================
      🟨 VERHANDLUNG STARTEN (mit Daten aus Google Sheets)
   ============================================================ */

async function startNegotiationFromSheets(vehicleID) {

    console.log("📄 Lade Daten aus Google Sheets ...");

    const data = await loadSheetData();

    const car = data.find(x => x.ID === String(vehicleID));

    if (!car) {
        console.error("❌ Fahrzeug mit dieser ID nicht gefunden.");
        return;
    }

    // Werte aus Google Sheets
    const startPrice = Number(car.Startpreis);
    const minPrice = Number(car.Schmerzgrenze);

    // Zufällige Runden 7–12
    const maxRounds = randInt(7, 12);

    console.log("====================================");
    console.log("🚗 Fahrzeug:", car.Fahrzeug);
    console.log("🔵 Startpreis:", startPrice);
    console.log("🔴 Schmerzgrenze:", minPrice);
    console.log("🔁 Anzahl Runden:", maxRounds);
    console.log("====================================");

    const state = {
        round: 1,
        maxRounds,
        startPrice,
        currentPrice: startPrice,
        minPrice
    };

    return state;
}



/* ============================================================
      🟪 BEISPIEL-VERHANDLUNG (Terminal)
   ============================================================ */

async function runExample(vehicleID) {

    const state = await startNegotiationFromSheets(vehicleID);

    if (!state) return;

    // Beispielhafte Nutzerangebote
    const userOffers = [2000, 2500, 2800, 3200, 3500, 3800, 4000, 4300, 4600];

    for (const offer of userOffers) {
        if (state.round > state.maxRounds) {
            console.log("❌ Max. Runden erreicht.");
            break;
        }

        console.log(`\n🟦 Runde ${state.round}/${state.maxRounds}`);
        console.log(`👤 Nutzer bietet: ${offer} €`);

        const newOffer = sellerCounterOffer(state, offer);

        console.log(`🏷️ Verkäufer bietet: ${newOffer} €`);
        console.log("------------------------------------");

        if (offer >= newOffer) {
            console.log(`✅ Der Verkäufer akzeptiert dein Angebot!`);
            break;
        }
    }

    console.log("\n🏁 Verhandlung beendet.");
}



// ============================================================
// STARTE TESTVERHANDLUNG (ID = 1 aus Google Sheets)
// ============================================================
runExample(1);


