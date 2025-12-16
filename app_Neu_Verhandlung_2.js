/* ========================================================================== */
/* Konfiguration via URL                                                     */
/* ========================================================================== */
const Q = new URLSearchParams(location.search);

const CONFIG = {
  INITIAL_OFFER: Number(Q.get("i")) || 5500,
  MIN_PRICE: Q.has("min") ? Number(Q.get("min")) : undefined,
  MIN_PRICE_FACTOR: Number(Q.get("mf")) || 0.7,
  ROUNDS_MIN: parseInt(Q.get("rmin") || "8", 10),
  ROUNDS_MAX: parseInt(Q.get("rmax") || "12", 10),
  THINK_DELAY_MS_MIN: parseInt(Q.get("tmin") || "1200", 10),
  THINK_DELAY_MS_MAX: parseInt(Q.get("tmax") || "2800", 10),
};

// Mindestpreis finalisieren (Fallback über Faktor)
CONFIG.MIN_PRICE = Number.isFinite(CONFIG.MIN_PRICE)
  ? CONFIG.MIN_PRICE
  : Math.round(CONFIG.INITIAL_OFFER * CONFIG.MIN_PRICE_FACTOR);

/* ========================================================================== */
/* Spieler-ID / Probandencode initialisieren                                 */
/* ========================================================================== */
if (!window.playerId) {
  const fromUrl =
    Q.get("player_id") ||
    Q.get("playerId") ||
    Q.get("pid") ||
    Q.get("id");

  window.playerId =
    fromUrl || "P_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

if (!window.probandCode) {
  const fromUrlCode =
    Q.get("proband_code") ||
    Q.get("probandCode") ||
    Q.get("code");

  window.probandCode = fromUrlCode || window.playerId;
}

/* ========================================================================== */
/* Konstanten                                                                 */
/* ========================================================================== */
const ABSOLUTE_FLOOR     = 3500;
const BASE_INITIAL_OFFER = CONFIG.INITIAL_OFFER;
const BASE_MIN_PRICE     = CONFIG.MIN_PRICE;

/*
   Verhandlungs-Dimensionen (Multiplikatoren):
   1x, 2x, 3x, 4x, 5x
*/
const DIM_FACTORS = [1, 2, 3, 4, 5];
let DIM_QUEUE = [];

/* ========================================================================== */
/* Hilfsfunktionen                                                            */
/* ========================================================================== */
const roundEuro = (n) => Math.round(Number(n));
const randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const eur = (n) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(roundEuro(n));

const app = document.getElementById("app");

function shuffleDimensions() {
  DIM_QUEUE = [...DIM_FACTORS];
  for (let i = DIM_QUEUE.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [DIM_QUEUE[i], DIM_QUEUE[j]] = [DIM_QUEUE[j], DIM_QUEUE[i]];
  }
}

function nextDimension() {
  if (DIM_QUEUE.length === 0) shuffleDimensions();
  return DIM_QUEUE.pop();
}

/* ========================================================================== */
/* Spielzustand                                                               */
/* ========================================================================== */

function newState() {
  const f = nextDimension();

  const baseStart = roundEuro(BASE_INITIAL_OFFER * f);
  const baseMin   = roundEuro(BASE_MIN_PRICE  * f);

  return {
    participant_id: crypto.randomUUID?.() || "v_" + Date.now(),

    runde: 1,
    max_runden: randInt(CONFIG.ROUNDS_MIN, CONFIG.ROUNDS_MAX),

    scale: f,

    initial_offer: baseStart,
    current_offer: baseStart,
    min_price: baseMin,

    history: [],
    accepted: false,
    finished: false,

    // Warn-/Patternzustand
    patternMessage: "",
    patternActive: false,
    patternRiskRounds: 0, // wie viele Runden in Folge das Pattern aktiv ist

    last_abort_chance: null, // für Anzeige
  };
}

let state = newState();

/* ========================================================================== */
/* Logging                                                                    */
/* ========================================================================== */
function logRound(row) {
  const payload = {
    participant_id: state.participant_id,
    player_id: window.playerId,
    proband_code: window.probandCode,
    scale_factor: state.scale,

    runde: row.runde,
    algo_offer: row.algo_offer,
    proband_counter: row.proband_counter,
    accepted: row.accepted,
    finished: row.finished,
    deal_price: row.deal_price,
  };

  if (window.sendRow) {
    window.sendRow(payload);
  } else {
    console.log("[sendRow fallback]", payload);
  }
}

/* ========================================================================== */
/* Auto-Accept                                                                */
/* ========================================================================== */

function shouldAccept(userOffer) {
  const buyer  = roundEuro(userOffer);
  const seller = state.current_offer;
  const f      = state.scale;

  // 1) Käufer-Angebot ≥ aktuelles Verkäuferangebot
  if (buyer >= seller) return true;

  // 2) Käufer liegt innerhalb von 5 % am Verkäuferangebot (max 5 % unterhalb)
  if (Math.abs(seller - buyer) / seller <= 0.05) return true;

  // 3) Käuferangebot deutlich hoch (z. B. absolute Schwelle)
  if (buyer >= roundEuro(5000 * f)) return true;

  // 4) Letzte Runde (oder vorletzte) und Käufer ist mindestens bei min_price
  if (state.max_runden - state.runde <= 1 && buyer >= state.min_price) return true;

  return false;
}

// Wrapper für alte Signatur
function shouldAutoAccept(_initialOffer, _minPrice, _prevOffer, counter) {
  return shouldAccept(counter);
}

/* ========================================================================== */
/* Verkäufer-Update / Angebotslogik                                           */
/*  Runde 1:  -500 * f                                                        */
/*  Runde 2:  -250 * f                                                        */
/*  Ab Runde 3 bis vor der letzten Runde: gleichmäßige Schritte zur          */
/*              Schmerzgrenze                                                 */
/*  Letzte Angebotsrunde: direkt Schmerzgrenze                                */
/* ========================================================================== */

function computeNextOffer(userOffer) {
  const f    = state.scale;
  const r    = state.runde;
  const min  = state.min_price;
  const curr = state.current_offer;

  let next;

  if (r === 1) {
    // 1. Runde: fester Schritt 500 * f
    next = curr - roundEuro(500 * f);
  } else if (r === 2) {
    // 2. Runde: fester Schritt 250 * f
    next = curr - roundEuro(250 * f);
  } else if (r >= state.max_runden) {
    // letzte Angebotsrunde: direkt an die Schmerzgrenze
    next = min;
  } else {
    // Ab Runde 3 gleichmäßige Schritte Richtung min_price
    const remainingSteps = state.max_runden - r + 1; // inkl. dieser Runde
    const gap = curr - min;
    const stepDown = gap / remainingSteps;
    next = curr - stepDown;
  }

  if (next < min) next = min;
  return roundEuro(next);
}

/* ========================================================================== */
/* Pattern-Erkennung (kleine Schritte)                                        */
/*  - relevant ab 2250 * f                                                    */
/*  - kein Unterschied ODER Erhöhung < 100 €                                  */
/*  - ab 3 aufeinanderfolgenden kleinen Schritten: Warnung                    */
/*  - patternRiskRounds zählt, wie lange das Muster aktiv ist                 */
/* ========================================================================== */

function updatePatternState(currentBuyerOffer) {
  const f           = state.scale;
  const minRelevant = roundEuro(2250 * f);

  const counters = state.history
    .map((h) => h.proband_counter)
    .filter((v) => v != null && v !== "" && roundEuro(v) >= minRelevant)
    .map((v) => roundEuro(v));

  const buyer = roundEuro(currentBuyerOffer);
  if (buyer >= minRelevant) {
    counters.push(buyer);
  }

  if (counters.length < 3) {
    state.patternActive = false;
    state.patternRiskRounds = 0;
    state.patternMessage = "";
    return;
  }

  let chain = 1;

  for (let i = 1; i < counters.length; i++) {
    const diff = counters[i] - counters[i - 1];

    // kleine Schritte: kein Unterschied oder Erhöhung < 100 €
    if (diff === 0 || (diff > 0 && diff < 100)) {
      chain++;
    } else {
      chain = 1;
    }
  }

  const wasActive = state.patternActive;

  if (chain >= 3) {
    state.patternActive = true;
    if (wasActive) {
      state.patternRiskRounds = (state.patternRiskRounds || 0) + 1;
    } else {
      state.patternRiskRounds = 1;
    }

    state.patternMessage =
      "Mit derart kleinen Erhöhungen kommen wir eher unwahrscheinlich zu einer Einigung.";
  } else {
    state.patternActive = false;
    state.patternRiskRounds = 0;
    state.patternMessage = "";
  }
}

/* ========================================================================== */
/* Abbruchwahrscheinlichkeit (Differenzmodell)                                */
/*  - 3000 × Multiplikator Differenz → 30 %                                   */
/*  - linear skaliert, max. 100 %                                             */
/* ========================================================================== */

function abortProbabilityFromLastDifference(sellerOffer, buyerOffer) {
  const f = state.scale || 1.0;

  const seller = roundEuro(sellerOffer);
  const buyer  = roundEuro(buyerOffer);

  const diff = Math.abs(seller - buyer);
  const BASE_DIFF = 3000 * f;

  let chance = (diff / BASE_DIFF) * 30;

  if (chance < 0) chance = 0;
  if (chance > 100) chance = 100;

  return Math.round(chance);
}

/* ========================================================================== */
/* maybeAbort                                                                 */
/*  - Basischance aus Differenz                                               */
/*  - +2 % pro Pattern-Runde, solange Warnung aktiv ist                       */
/*  - kein Abbruch vor Runde 4                                                */
/* ========================================================================== */

function maybeAbort(userOffer) {
  const seller = state.current_offer;
  const buyer  = roundEuro(userOffer);

  // Basis-Risiko aus Differenz
  let chance = abortProbabilityFromLastDifference(seller, buyer);

  // Zusatz-Risiko durch Warnmuster: +2 % je Pattern-Runde
  if (state.patternActive && state.patternRiskRounds > 0) {
    chance = Math.min(100, chance + 2 * state.patternRiskRounds);
  }

  state.last_abort_chance = chance;

  // Kein Abbruch vor Runde 4 – nur Anzeige
  if (state.runde < 4) {
    return false;
  }

  const roll = randInt(1, 100);
  if (roll <= chance) {
    logRound({
      runde: state.runde,
      algo_offer: seller,
      proband_counter: buyer,
      accepted: false,
      finished: true,
      deal_price: "",
    });

    state.history.push({
      runde: state.runde,
      algo_offer: seller,
      proband_counter: buyer,
      accepted: false,
    });

    state.finished = true;
    state.accepted = false;

    viewAbort(chance);
    return true;
  }

  return false;
}

/* ========================================================================== */
/* History-Table                                                              */
/* ========================================================================== */

function historyTable() {
  if (!state.history.length) return "";
  const rows = state.history
    .map(
      (h) => `
      <tr>
        <td>${h.runde}</td>
        <td>${eur(h.algo_offer)}</td>
        <td>${
          h.proband_counter != null && h.proband_counter !== ""
            ? eur(h.proband_counter)
            : "-"
        }</td>
        <td>${h.accepted ? "Ja" : "Nein"}</td>
      </tr>`
    )
    .join("");

  return `
    <h2>Verlauf</h2>
    <table>
      <thead>
        <tr><th>Runde</th><th>Angebot Verkäufer</th><th>Gegenangebot</th><th>Angenommen?</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/* ========================================================================== */
/* Screens                                                                    */
/* ========================================================================== */

function viewVignette() {
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>
    <p class="muted">Stelle dir folgende Situation vor:</p>
    <p>
      Ein Verkäufer bietet eine <b>hochwertige Designer-Ledercouch</b> auf einer Möbelmesse an.
      Solche Möbel werden üblicherweise im <b>gehobenen Preissegment €</b> gehandelt, da sie aus wertvollem 
      Material bestehen und in der Regel Einzelstücke sind. Den Rahmen des Preises siehst du in der Verhandlung. 
    </p>
    <p>
      Du verhandelst mit dem Verkäufer über den endgültigen Verkaufspreis. 
    </p>
    <p class="muted"> 
      <b>Hinweis:</b> Die Verhandlung dauert zufällig ${CONFIG.ROUNDS_MIN}–${CONFIG.ROUNDS_MAX} Runden.
      Dein Verhalten beeinflusst das <b>Abbruchrisiko</b>: unangemessen niedrige oder kaum veränderte
      Angebote können zu einem vorzeitigen Abbruch führen.
    </p>
    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme zu, dass meine Eingaben anonym gespeichert werden.</span>
      </label>
      <div><button id="startBtn" disabled>Verhandlung starten</button></div>
    </div>`;

  const consent = document.getElementById("consent");
  const startBtn = document.getElementById("startBtn");
  consent.onchange = () => (startBtn.disabled = !consent.checked);
  startBtn.onclick = () => {
    state = newState();
    viewNegotiate();
  };
}

function viewThink(next) {
  const delay = randInt(CONFIG.THINK_DELAY_MS_MIN, CONFIG.THINK_DELAY_MS_MAX);
  app.innerHTML = `
    <h1>Die Verkäuferseite überlegt<span class="pulse">…</span></h1>
    <p class="muted">Bitte warten.</p>
  `;
  setTimeout(next, delay);
}

function viewAbort(chance) {
  app.innerHTML = `
    <h1>Verhandlung abgebrochen</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Die Verkäuferseite hat die Verhandlung beendet, da er mit Ihrem Gegenangebot nicht zufrieden war.</strong>
      <p class="muted">Abbruchwahrscheinlichkeit in dieser Runde: ${chance}%</p>
    </div>

    <p><b>Du kannst nun entweder eine neue Runde spielen oder die Umfrage beantworten.</b></p>

    <button id="restartBtn">Neue Verhandlung</button>
    <button id="surveyBtn"
      style="
        margin-top:8px;
        display:inline-block;
        padding:8px 14px;
        border-radius:9999px;
        border:1px solid #d1d5db;
        background:#e5e7eb;
        color:#374151;
        font-size:0.95rem;
        cursor:pointer;
      ">
      Zur Umfrage
    </button>

    ${historyTable()}
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };

  const surveyBtn = document.getElementById("surveyBtn");
  if (surveyBtn) {
    surveyBtn.onclick = () => {
      window.location.href =
        "https://docs.google.com/forms/d/e/1FAIpQLSddfk3DSXkwip_fTDijypc-QqpLYOfOlN45s4QouumBLyLLLA/viewform?usp=publish-editor";
    };
  }
}

function viewNegotiate(errorMsg) {
  const abortChance =
    typeof state.last_abort_chance === "number"
      ? state.last_abort_chance
      : null;

  // Farbskala: ≤ 20 % grün, > 20 % bis 40 % orange, > 40 % rot
  let color = "#16a34a"; // grün
  if (abortChance !== null) {
    if (abortChance > 40) color = "#dc2626";      // rot
    else if (abortChance > 20) color = "#f97316"; // orange
  }

  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Spieler-ID: ${window.playerId ?? "-"}</p>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="grid">

      <div class="card" style="padding:16px;border:1px dashed var(--accent);">
        <strong>Aktuelles Angebot:</strong> ${eur(state.current_offer)}
      </div>

      <div style="
        background:${color}22;
        border-left:6px solid ${color};
        padding:10px;
        border-radius:8px;
        margin-bottom:10px;">
        <b style="color:${color};">Abbruchwahrscheinlichkeit:</b>
        <span style="color:${color}; font-weight:600;">
          ${abortChance !== null ? abortChance + "%" : "--"}
        </span>
      </div>

      ${
        state.patternMessage
          ? `<p class="error">${state.patternMessage}</p>`
          : ""
      }

      <label for="counter">Dein Gegenangebot (€)</label>
      <div class="row">
        <input id="counter" type="number" step="1" min="0" />
        <button id="sendBtn">Gegenangebot senden</button>
      </div>

      <button id="acceptBtn" class="ghost">Angebot annehmen</button>
    </div>

    ${historyTable()}
    ${errorMsg ? `<p class="error">${errorMsg}</p>` : ""}
  `;

  const inputEl = document.getElementById("counter");
  inputEl.onkeydown = (e) => {
    if (e.key === "Enter") handleSubmit(inputEl.value);
  };
  document.getElementById("sendBtn").onclick = () =>
    handleSubmit(inputEl.value);

  document.getElementById("acceptBtn").onclick = () => {
    state.history.push({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: null,
      accepted: true,
    });

    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: "",
      accepted: true,
      finished: true,
      deal_price: state.current_offer,
    });

    state.accepted = true;
    state.finished = true;
    state.deal_price = state.current_offer;

    viewThink(() => viewFinish(true));
  };
}

/* ========================================================================== */
/* Handle Submit                                                              */
/* ========================================================================== */

function handleSubmit(raw) {
  const val = String(raw ?? "").trim().replace(",", ".");
  const parsed = Number(val);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return viewNegotiate("Bitte eine gültige Zahl ≥ 0 eingeben.");
  }

  const num = roundEuro(parsed);

  // keine niedrigeren Angebote als in der Vorrunde erlauben
  const last = state.history[state.history.length - 1];
  if (last && last.proband_counter != null && last.proband_counter !== "") {
    const lastBuyer = roundEuro(last.proband_counter);
    if (num < lastBuyer) {
      return viewNegotiate(
        `Dein Gegenangebot darf nicht niedriger sein als in der Vorrunde (${eur(
          lastBuyer
        )}).`
      );
    }
  }

  const prevOffer = state.current_offer;
  const f = state.scale;

  // 1) Standard-Auto-Accept
  if (shouldAutoAccept(state.initial_offer, state.min_price, prevOffer, num)) {
    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true,
    });

    logRound({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true,
      finished: true,
      deal_price: num,
    });

    state.accepted = true;
    state.finished = true;
    state.deal_price = num;

    return viewThink(() => viewFinish(true));
  }

  // 2) Nächster geplanter Schritt des Verkäufers
  const plannedNext = computeNextOffer(num);

  // NEUE REGEL:
  // Wenn das Angebot des Käufers mehr als 5 % unter dem letzten Verkäuferangebot liegt,
  // ABER mindestens so hoch ist wie der nächste Schritt des Verkäufers,
  // nimmt der Verkäufer das Käuferangebot an.
  const diffRel = Math.abs(prevOffer - num) / prevOffer;
  if (diffRel > 0.05 && num >= plannedNext) {
    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true,
    });

    logRound({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true,
      finished: true,
      deal_price: num,
    });

    state.accepted = true;
    state.finished = true;
    state.deal_price = num;

    return viewThink(() => viewFinish(true));
  }

  // 3) Pattern-State mit dem aktuellen Angebot aktualisieren
  updatePatternState(num);

  // 4) Abbruch prüfen (nutzt Pattern-Infos, setzt last_abort_chance)
  if (maybeAbort(num)) return;

  // 5) Normale Runde → Algorithmus gibt neues Angebot ab
  const next = plannedNext;

  logRound({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num,
    accepted: false,
    finished: false,
    deal_price: "",
  });

  state.history.push({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num,
    accepted: false,
  });

  state.current_offer = next;

  if (state.runde >= state.max_runden) {
    state.finished = true;
    return viewThink(() => viewDecision());
  }

  state.runde++;
  viewThink(() => viewNegotiate());
}

/* ========================================================================== */
/* Letzte Runde                                                               */
/* ========================================================================== */

function viewDecision() {
  app.innerHTML = `
    <h1>Letzte Runde</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Letztes Angebot:</strong> ${eur(state.current_offer)}
    </div>

    <button id="takeBtn">Annehmen</button>
    <button id="noBtn" class="ghost">Ablehnen</button>

    ${historyTable()}
  `;

  document.getElementById("takeBtn").onclick = () =>
    finish(true, state.current_offer);
  document.getElementById("noBtn").onclick = () => finish(false, null);
}

/* ========================================================================== */
/* Finish                                                                     */
/* ========================================================================== */

function finish(accepted, dealPrice) {
  state.accepted = !!accepted;
  state.finished = true;
  state.deal_price = dealPrice == null ? null : roundEuro(dealPrice);

  logRound({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: dealPrice == null ? "" : state.deal_price,
    accepted: state.accepted,
    finished: true,
    deal_price: dealPrice == null ? "" : state.deal_price,
  });

  viewThink(() => viewFinish(state.accepted));
}

function viewFinish(accepted) {
  const dealPrice = state.deal_price ?? state.current_offer;

  let text;
  if (accepted) {
    text = `Einigung in Runde ${state.runde} bei ${eur(dealPrice)}.`;
  } else {
    text = `Keine Einigung.`;
  }

  app.innerHTML = `
    <h1>Verhandlung abgeschlossen</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>

    <div class="card" style="padding:16px;border:1px dashed var(--accent);">
      <strong>Ergebnis:</strong> ${text}</strong>
    </div>

    <p><b>Du kannst nun entweder eine neue Runde spielen oder die Umfrage beantworten.</b></p>

    <button id="restartBtn">Neue Verhandlung</button>
    <button id="surveyBtn"
      style="
        margin-top:8px;
        display:inline-block;
        padding:8px 14px;
        border-radius:9999px;
        border:1px solid #d1d5db;
        background:#e5e7eb;
        color:#374151;
        font-size:0.95rem;
        cursor:pointer;
      ">
      Zur Umfrage
    </button>

    ${historyTable()}
  `;

  document.getElementById("restartBtn").onclick = () => {
    state = newState();
    viewVignette();
  };

  const surveyBtn = document.getElementById("surveyBtn");
  if (surveyBtn) {
    surveyBtn.onclick = () => {
      window.location.href =
        "https://docs.google.com/forms/d/e/1FAIpQLSddfk3DSXkwip_fTDijypc-QqpLYOfOlN45s4QouumBLyLLLA/viewform?usp=publish-editor";
    };
  }
}

/* ========================================================================== */
/* Init                                                                       */
/* ========================================================================== */
viewVignette();
