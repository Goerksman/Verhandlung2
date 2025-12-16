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
  THINK_DELAY_MS_MAX: parseInt(Q.get("tmax") || "2800", 10)
};

CONFIG.MIN_PRICE = Number.isFinite(CONFIG.MIN_PRICE)
  ? CONFIG.MIN_PRICE
  : Math.round(CONFIG.INITIAL_OFFER * CONFIG.MIN_PRICE_FACTOR);

/* ========================================================================== */
/* Spieler-ID / Probandencode                                                */
/* ========================================================================== */
if (!window.playerId) {
  const fromUrl =
    Q.get("player_id") ||
    Q.get("playerId") ||
    Q.get("pid") ||
    Q.get("id");

  window.playerId =
    fromUrl || ("P_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8));
}

if (!window.probandCode) {
  const fromUrlCode =
    Q.get("proband_code") ||
    Q.get("probandCode") ||
    Q.get("code");

  window.probandCode = fromUrlCode || window.playerId;
}

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
    maximumFractionDigits: 0
  }).format(roundEuro(n));

const app = document.getElementById("app");

/* ========================================================================== */
/* Multiplikatoren (Dimensionen) 1x–5x                                       */
/* ========================================================================== */
const DIM_FACTORS = [1, 2, 3, 4, 5];
let DIM_QUEUE = [];

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

  const baseStart = roundEuro(CONFIG.INITIAL_OFFER * f);
  const baseMin   = roundEuro(CONFIG.MIN_PRICE * f);

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

    last_abort_chance: null // für Anzeige
  };
}

let state = newState();

/* ========================================================================== */
/* Auto-Accept-Logik                                                         */
/* ========================================================================== */
function shouldAccept(userOffer) {
  const buyer  = roundEuro(userOffer);
  const seller = state.current_offer;
  const f      = state.scale;

  // 1) Käufer-Angebot ≥ aktuelles Verkäuferangebot
  if (buyer >= seller) return true;

  // 2) Käufer liegt innerhalb von ±5 % am Verkäuferangebot
  if (Math.abs(seller - buyer) / seller <= 0.05) return true;

  // 3) Absolute Schwelle (mit Dimension skaliert)
  if (buyer >= roundEuro(5000 * f)) return true;

  // 4) Letzte oder vorletzte Runde und Käufer ist mindestens bei min_price
  if (state.max_runden - state.runde <= 1 && buyer >= state.min_price) return true;

  return false;
}

// Wrapper für Kompatibilität
function shouldAutoAccept(_initialOffer, _minPrice, _prevOffer, counter) {
  return shouldAccept(counter);
}

/* ========================================================================== */
/* Angebotslogik                                                              */
/*  Runde 1:  fester Schritt  -500 * f                                      */
/*  Runde 2:  fester Schritt  -250 * f                                      */
/*  ab Runde 3 bis kurz vor letzter Runde: gleichmäßige Schritte Richtung   */
/*             min_price                                                    */
/*  in der letzten Angebotsrunde: min_price                                 */
/* ========================================================================== */
function computeNextOffer() {
  const f    = state.scale;
  const r    = state.runde;
  const min  = state.min_price;
  const curr = state.current_offer;

  let next;

  if (r === 1) {
    next = curr - roundEuro(500 * f);
  } else if (r === 2) {
    next = curr - roundEuro(250 * f);
  } else if (r >= state.max_runden) {
    next = min;
  } else {
    const remainingSteps = state.max_runden - r + 1; // inkl. aktueller Runde
    const gap = curr - min;
    const stepDown = gap / remainingSteps;
    next = curr - stepDown;
  }

  if (next < min) next = min;

  return roundEuro(next);
}

/* ========================================================================== */
/* Pattern-Erkennung (keine / kleine Schritte)                               */
/*  - relevant ab Angeboten ≥ 2250 * Multiplikator                           */
/*  - "kleiner Schritt": diff >= 0 und diff ≤ 100 * Multiplikator           */
/*  - nach 2 solchen Schritten in Folge → Warnung                           */
/*  - Warnung bleibt aktiv, patternRiskRounds zählt Runden mit Warnung      */
/* ========================================================================== */
function updatePatternState(currentBuyerOffer) {
  const f           = state.scale;
  const minRelevant = roundEuro(2250 * f);
  const SMALL_STEP  = roundEuro(100 * f);

  // vorhandene relevante Gegenangebote
  const counters = state.history
    .map(h => h.proband_counter)
    .filter(v => v != null && v !== "" && roundEuro(v) >= minRelevant)
    .map(v => roundEuro(v));

  // aktuelles Angebot ergänzen
  const buyer = roundEuro(currentBuyerOffer);
  if (buyer >= minRelevant) {
    counters.push(buyer);
  }

  if (counters.length < 2) {
    state.patternActive     = false;
    state.patternRiskRounds = 0;
    state.patternMessage    = "";
    return;
  }

  let chain = 1;
  for (let i = 1; i < counters.length; i++) {
    const diff = counters[i] - counters[i - 1];

    // kein Rückschritt und Schritt <= 100 * f (inkl. 0)
    if (diff >= 0 && diff <= SMALL_STEP) {
      chain++;
    } else {
      chain = 1;
    }
  }

  const wasActive = state.patternActive;

  if (chain >= 2) {
    state.patternActive = true;
    if (wasActive) {
      state.patternRiskRounds = (state.patternRiskRounds || 0) + 1;
    } else {
      state.patternRiskRounds = 1;
    }
    state.patternMessage =
      "Mit derart kleinen Erhöhungen kommen wir eher unwahrscheinlich zu einer Einigung.";
  } else {
    state.patternActive     = false;
    state.patternRiskRounds = 0;
    state.patternMessage    = "";
  }
}

/* ========================================================================== */
/* Abbruchwahrscheinlichkeit (Basis)                                         */
/*  - Referenz: Differenz 3000 * Multiplikator → 30 %                       */
/*  - Angebote < 1500 * Multiplikator → Basis 100 %                         */
/* ========================================================================== */
function abortProbabilityFromLastDifference(sellerOffer, buyerOffer) {
  const f      = state.scale || 1.0;
  const seller = roundEuro(sellerOffer);
  const buyer  = roundEuro(buyerOffer);

  if (!Number.isFinite(buyer)) return 0;

  // Extrem niedrige Angebote → Basisrisiko 100 %
  if (buyer < roundEuro(1500 * f)) {
    return 100;
  }

  const diff = Math.abs(seller - buyer);
  const BASE_DIFF = 3000 * f; // 3000 × Multiplikator → 30 %

  let chance = (diff / BASE_DIFF) * 30;
  if (chance < 0) chance = 0;
  if (chance > 100) chance = 100;

  return Math.round(chance);
}

/* ========================================================================== */
/* Abbruchentscheidung                                                       */
/*  - Basisrisiko wie oben                                                  */
/*  - Pattern-Aufschlag: +2 % je Warnrunde (kumulativ)                      */
/*  - tatsächlicher Abbruch erst ab Runde 4                                 */
/* ========================================================================== */
function maybeAbort(userOffer) {
  const seller = state.current_offer;
  const buyer  = roundEuro(userOffer);

  // Basisrisiko
  let baseChance = abortProbabilityFromLastDifference(seller, buyer);

  // Pattern-Zuschlag: 1. Warnrunde +2 %, 2. +4 %, 3. +6 % etc.
  let extraChance = 0;
  if (state.patternActive && state.patternRiskRounds > 0) {
    extraChance = 2 * state.patternRiskRounds;
  }

  let totalChance = baseChance + extraChance;
  if (totalChance > 100) totalChance = 100;

  // Abbruchwahrscheinlichkeit für Anzeige merken
  state.last_abort_chance = totalChance;

  // Vor Runde 4 KEIN Abbruch – nur Anzeige
  if (state.runde < 4) {
    return false;
  }

  const roll = randInt(1, 100);
  if (roll <= totalChance) {
    // Abbruch
    state.history.push({
      runde: state.runde,
      algo_offer: seller,
      proband_counter: buyer,
      accepted: false
    });

    logRound({
      runde: state.runde,
      algo_offer: seller,
      proband_counter: buyer,
      accepted: false,
      finished: true,
      deal_price: ""
    });

    state.finished = true;
    state.accepted = false;

    viewAbort(totalChance);
    return true;
  }

  return false;
}

/* ========================================================================== */
/* Logging                                                                    */
/* ========================================================================== */
function logRound(row) {
  if (window.sendRow) {
    window.sendRow({
      participant_id: state.participant_id,
      player_id: window.playerId,
      proband_code: window.probandCode,
      scale_factor: state.scale,
      ...row
    });
  } else {
    console.log("[sendRow fallback]", {
      participant_id: state.participant_id,
      player_id: window.playerId,
      proband_code: window.probandCode,
      scale_factor: state.scale,
      ...row
    });
  }
}

/* ========================================================================== */
/* Verlauf-Tabelle                                                            */
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
      </tr>
    `
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

function viewVignette(){
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

  document.getElementById("consent").onchange = () => {
    document.getElementById("startBtn").disabled =
      !document.getElementById("consent").checked;
  };

  document.getElementById("startBtn").onclick = () => {
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

  // Farbskala: <20% grün, 20–40% orange, >40% rot
  let color = "#16a34a"; // grün
  if (abortChance !== null) {
    if (abortChance > 40) {
      color = "#dc2626"; // rot
    } else if (abortChance > 20) {
      color = "#f97316"; // orange
    }
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

      ${state.patternMessage ? `<p class="error">${state.patternMessage}</p>` : ""}

      <label for="counter">Dein Gegenangebot (€)</label>
      <div class="row">
        <input id="counter" type="number" step="1" min="0" />
        <button id="sendBtn">Gegenangebot senden</button>
      </div>

      <button id="acceptBtn" class="ghost">Angebot annehmen</button>
    </div>

    ${historyTable()}
    ${errorMsg ? `<p class="error">${errorMsg}</p>` : ""}
  ";

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
      accepted: true
    });

    logRound({
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: "",
      accepted: true,
      finished: true,
      deal_price: state.current_offer
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
  if (last && last.proband_counter != null) {
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

  // Standard-Auto-Accept
  if (shouldAutoAccept(state.initial_offer, state.min_price, prevOffer, num)) {
    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true
    });

    logRound({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true,
      finished: true,
      deal_price: num
    });

    state.accepted = true;
    state.finished = true;
    state.deal_price = num;

    return viewThink(() => viewFinish(true));
  }

  // Zusätzliche Regel:
  // Wenn Käufer-Angebot mehr als 5 % unter dem letzten Verkäuferangebot liegt,
  // aber immerhin ≥ dem nächsten geplanten Schritt des Verkäufers,
  // akzeptiert der Verkäufer dieses Angebot.
  const simulatedNext = computeNextOffer(); // nächster Schritt aus aktueller Situation
  const diffRatio = Math.abs(prevOffer - num) / prevOffer;

  if (diffRatio > 0.05 && num >= simulatedNext && num < prevOffer) {
    state.history.push({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true
    });

    logRound({
      runde: state.runde,
      algo_offer: prevOffer,
      proband_counter: num,
      accepted: true,
      finished: true,
      deal_price: num
    });

    state.accepted = true;
    state.finished = true;
    state.deal_price = num;

    return viewThink(() => viewFinish(true));
  }

  // Pattern-State mit dem aktuellen Angebot aktualisieren
  updatePatternState(num);

  // Abbruch prüfen (nutzt Pattern-Infos, setzt last_abort_chance)
  if (maybeAbort(num)) return;

  // normale Runde: Verkäufer macht sein nächstes Angebot
  const next = computeNextOffer();

  logRound({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num,
    accepted: false,
    finished: false,
    deal_price: ""
  });

  state.history.push({
    runde: state.runde,
    algo_offer: prevOffer,
    proband_counter: num,
    accepted: false
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

  document.getElementById("takeBtn").onclick = () => finish(true, state.current_offer);
  document.getElementById("noBtn").onclick  = () => finish(false, null);
}

/* ========================================================================== */
/* Finish                                                                     */
/* ========================================================================== */
function finish(accepted, dealPrice) {
  state.accepted   = !!accepted;
  state.finished   = true;
  state.deal_price = dealPrice == null ? null : roundEuro(dealPrice);

  logRound({
    runde: state.runde,
    algo_offer: state.current_offer,
    proband_counter: dealPrice == null ? "" : state.deal_price,
    accepted: state.accepted,
    finished: true,
    deal_price: dealPrice == null ? "" : state.deal_price
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
