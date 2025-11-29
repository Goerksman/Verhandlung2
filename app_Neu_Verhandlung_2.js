/* ============================================================
   GOOGLE SHEETS CSV – Fahrzeugdaten laden
   ============================================================ */
const GOOGLE_SHEETS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3s5qCrJ2PDoIjbIP9YvNtyUszeiPmko9OGT_saIHe9LneN80kXpSzHTlqGXGdgW93ta2kNvjtl_4k/pub?gid=0&single=true&output=csv";

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

/* ============================================================
   HILFSFUNKTIONEN
   ============================================================ */
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const round25 = v => Math.round(v / 25) * 25;

/* ============================================================
   NEUER PREISALGORITHMUS (dein gewünschter Stil)
   ============================================================ */
function computeNextOffer(prevPrice, minPrice





