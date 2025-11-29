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
// === Screens =================================================================
function viewVignette(){
  app.innerHTML = `
    <h1>Designer-Verkaufsmesse</h1>
    <p class="muted">Stelle dir folgende Situation vor:</p>
    <p>Du befindest dich auf einer <b>exklusiven Verkaufsmesse</b> für Designermöbel.
       Ein Besucher möchte sein <b>gebrauchtes Designer-Ledersofa</b> verkaufen.
       Es handelt sich um ein hochwertiges, gepflegtes Stück mit einzigartigem Design.
       Auf der Messe siehst du viele verschiedene Designer-Sofas, wobei die Preisspanne
       bei ähnlichen Sofas typischerweise zwischen <b>2.500 € und 10.000 €</b> liegt. Du kommst ins Gespräch und ihr
       verhandelt über den Verkaufspreis.</p>
    <p>Auf der nächsten Seite beginnt die Preisverhandlung mit der <b>Verkäuferseite</b>.
       Du kannst ein <b>Gegenangebot</b> eingeben oder das Angebot annehmen. Achte darauf, dass die Messe
       gut besucht ist und die Verkäuferseite realistisch bleiben möchte aber auch selbstbewusst in
       die Verhandlung geht.</p>
    <p class="muted"><b>Hinweis:</b> Die Verhandlung umfasst maximal ${CONFIG.MAX_RUNDEN} Runden.</p>
    <div class="grid">
      <label class="consent">
        <input id="consent" type="checkbox" />
        <span>Ich stimme zu, dass meine Eingaben zu <b>forschenden Zwecken</b> gespeichert und anonym ausgewertet werden dürfen.</span>
      </label>
      <div><button id="startBtn" disabled>Verhandlung starten</button></div>
    </div>`;
  const consent = document.getElementById('consent');
  const startBtn = document.getElementById('startBtn');
  const sync = () => { startBtn.disabled = !consent.checked; };
  consent.addEventListener('change', sync); sync();
  startBtn.addEventListener('click', () => {
    if (!consent.checked) return;
    state = newState();
    viewNegotiate();
  });
}

function viewThink(next){
  const delay = randInt(CONFIG.THINK_DELAY_MS_MIN, CONFIG.THINK_DELAY_MS_MAX);
  app.innerHTML = `
    <h1>Die Verkäuferseite überlegt<span class="pulse">&hellip;</span></h1>
    <p class="muted">Bitte einen Moment Geduld.</p>`;
  setTimeout(next, delay);
}

function historyTable(){
  if (!state.history.length) return '';
  const rows = state.history.map(h => `
    <tr>
      <td>${h.runde}</td>
      <td>${eur(h.algo_offer)}</td>
      <td>${h.proband_counter != null && h.proband_counter !== '' ? eur(h.proband_counter) : '-'}</td>
      <td>${h.accepted ? 'Ja' : 'Nein'}</td>
    </tr>`).join('');
  return `
    <h2>Verlauf</h2>
    <table>
      <thead><tr><th>Runde</th><th>Angebot Verkäuferseite</th><th>Gegenangebot</th><th>Angenommen?</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function viewNegotiate(errorMsg){
  app.innerHTML = `
    <h1>Verkaufsverhandlung</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>
    <div class="grid">
      <div class="card" style="padding:16px;background:#fafafa;border-radius:12px;border:1px dashed var(--accent);">
        <div><strong>Aktuelles Angebot der Verkäuferseite:</strong> ${eur(state.current_offer)}</div>
      </div>
      <label for="counter">Dein Gegenangebot in €</label>
      <div class="row">
        <input id="counter" type="number" step="0.01" min="0" required />
        <button id="sendBtn">Gegenangebot senden</button>
      </div>
      <button id="acceptBtn" class="ghost">Angebot annehmen &amp; Verhandlung beenden</button>
    </div>
    ${historyTable()}
    ${state.patternMessage
      ? `<p style="color:#1f2937;background:#e5e7eb;border:1px solid #d1d5db;padding:8px 10px;border-radius:8px;">
           <strong>Verkäuferseite:</strong> ${state.patternMessage}
         </p>`
      : ``}
    ${state.warningText
      ? `<p style="color:#b45309;background:#fffbeb;border:1px solid #fbbf24;padding:8px 10px;border-radius:8px;">
           <strong>Verwarnung:</strong> ${state.warningText}
         </p>`
      : ``}
    ${state.runde === 7
      ? `<p style="color:#1f2937;background:#e5e7eb;border:1px solid #d1d5db;padding:8px 10px;border-radius:8px;">
           <strong>Verkäuferseite:</strong> Das ist meine Schmerzgrenze. Die Ledercouch ist zu Wertvoll, um noch weiter runter zugehen.
         </p>`
      : ``}
    ${errorMsg
      ? `<p style="color:#b91c1c;"><strong>Fehler:</strong> ${errorMsg}</p>`
      : ``}
  `;

  const inputEl = document.getElementById('counter');
  const sendBtn = document.getElementById('sendBtn');

  function handleSubmit(){
    const val = inputEl.value.trim().replace(',','.');
    const num = Number(val);
    if (!Number.isFinite(num) || num < 0){
      viewNegotiate('Bitte eine gültige Zahl ≥ 0 eingeben.');
      return;
    }

    const prevOffer = state.current_offer;

    // Auto-Accept (inkl. 5%-Regel)
    if (shouldAutoAccept(state.initial_offer, state.min_price, prevOffer, num)) {
      state.history.push({ runde: state.runde, algo_offer: prevOffer, proband_counter: num, accepted: true });
      state.accepted = true;
      state.finished = true;
      state.finish_reason = 'accepted';
      state.deal_price = num;
      sendRow({
        participant_id: state.participant_id,
        runde: state.runde,
        algo_offer: prevOffer,
        proband_counter: num,
        accepted: true,
        finished: true,
        deal_price: num
      });
      viewThink(() => viewFinish(true));
      return;
    }

    // Unakzeptable Angebote (< 2.250 €) + Verwarnungslogik
    if (num < UNACCEPTABLE_LIMIT) {
      if (!state.hasCrossedThreshold) {
        state.hasUnacceptable = true;
      }

      state.warningCount = (state.warningCount || 0) + 1;
      const isSecondWarning = state.warningCount >= 2;

      state.warningText =
        'Ein solches Angebot ist sehr inakzeptabel. Bei einem erneuten Angebot in der Art, möchte ich mit Ihnen nicht mehr verhandeln.';

      const rowData = {
        participant_id: state.participant_id,
        runde: state.runde,
        algo_offer: prevOffer,
        proband_counter: num,
        accepted: false,
        finished: isSecondWarning
      };
      sendRow(rowData);

      state.history.push({
        runde: state.runde,
        algo_offer: prevOffer,
        proband_counter: num,
        accepted: false
      });
      state.current_offer = prevOffer;
      state.last_concession = 0;

      if (isSecondWarning) {
        state.finished = true;
        state.accepted = false;
        state.finish_reason = 'warnings';
        viewThink(() => viewFinish(false));
      } else {
        if (state.runde >= CONFIG.MAX_RUNDEN) {
          state.finished = true;
          state.finish_reason = 'max_rounds';
          viewThink(() => viewDecision());
        } else {
          state.runde += 1;
          viewThink(() => viewNegotiate());
        }
      }
      return;
    }

    // Ab hier: akzeptable Angebote (>= 2.250 €)

    if (!state.hasCrossedThreshold) {
      state.hasCrossedThreshold = true;
    }

    // vorhandene Verwarnungstexte zurücksetzen
    state.warningText = '';

    // Normale Runde mit bisheriger Strategie
    const prev = state.current_offer;
    const next = computeNextOffer(prev, state.min_price, num, state.runde, state.last_concession);
    const concession = prev - next;

    sendRow({
      participant_id: state.participant_id,
      runde: state.runde,
      algo_offer: prev,
      proband_counter: num,
      accepted: false,
      finished: false
    });

    state.history.push({ runde: state.runde, algo_offer: prev, proband_counter: num, accepted:false });

    // Mustererkennung für kleine Erhöhungen (Chat-Hinweis aktualisieren)
    updatePatternMessage();

    state.current_offer = next;
    state.last_concession = concession;

    if (state.runde >= CONFIG.MAX_RUNDEN) {
      state.finished = true;
      state.finish_reason = 'max_rounds';
      viewThink(() => viewDecision());
    } else {
      state.runde += 1;
      viewThink(() => viewNegotiate());
    }
  }

  sendBtn.addEventListener('click', handleSubmit);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } });

  document.getElementById('acceptBtn').addEventListener('click', () => {
    state.history.push({ runde: state.runde, algo_offer: state.current_offer, proband_counter: null, accepted:true });
    state.accepted = true;
    state.finished = true;
    state.finish_reason = 'accepted';
    state.deal_price = state.current_offer;
    sendRow({
      participant_id: state.participant_id,
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: '',
      accepted: true,
      finished: true,
      deal_price: state.current_offer
    });
    viewThink(() => viewFinish(true));
  });
}

function viewDecision(){
  app.innerHTML = `
    <h1>Letzte Runde der Verhandlung erreicht.</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>
    <div class="grid">
      <div class="card" style="padding:16px;background:#fafafa;border-radius:12px;border:1px dashed var(--accent);">
        <div><strong>Letztes Angebot der Verkäuferseite:</strong> ${eur(state.current_offer)}</div>
      </div>
      <button id="takeBtn">Letztes Angebot annehmen</button>
      <button id="noBtn" class="ghost">Ohne Einigung beenden</button>
    </div>
    ${historyTable()}
  `;
  document.getElementById('takeBtn').addEventListener('click', () => {
    state.history.push({ runde: state.runde, algo_offer: state.current_offer, proband_counter: null, accepted:true });
    state.accepted = true;
    state.finished = true;
    state.finish_reason = 'accepted';
    state.deal_price = state.current_offer;
    sendRow({
      participant_id: state.participant_id,
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: '',
      accepted: true,
      finished: true,
      deal_price: state.current_offer
    });
    viewThink(() => viewFinish(true));
  });
  document.getElementById('noBtn').addEventListener('click', () => {
    state.history.push({ runde: state.runde, algo_offer: state.current_offer, proband_counter: null, accepted:false });
    state.accepted = false;
    state.finished = true;
    state.finish_reason = 'max_rounds';
    sendRow({
      participant_id: state.participant_id,
      runde: state.runde,
      algo_offer: state.current_offer,
      proband_counter: '',
      accepted: false,
      finished: true
    });
    viewThink(() => viewFinish(false));
  });
}

function viewFinish(accepted){
  // Dealpreis bestimmen (falls mal nicht gesetzt, fallback auf current_offer)
  var dealPrice = state.deal_price != null ? state.deal_price : state.current_offer;

  var resultText;
  if (accepted) {
    resultText =
      'Annahme in Runde ' + state.runde + ' bei ' + eur(dealPrice) +
      '. Letztes Angebot der Verkäuferseite: ' + eur(state.current_offer) + '.';
  } else if (state.finish_reason === 'warnings') {
    resultText =
      'Verhandlung aufgrund wiederholt unakzeptabler Angebote abgebrochen. ' +
      'Letztes Angebot der Verkäuferseite: ' + eur(state.current_offer) + '.';
  } else {
    resultText =
      'Maximale Rundenzahl erreicht. Letztes Angebot der Verkäuferseite: ' +
      eur(state.current_offer) + '.';
  }

  app.innerHTML = `
    <h1>Verhandlung abgeschlossen</h1>
    <p class="muted">Teilnehmer-ID: ${state.participant_id}</p>
    <div class="grid">
      <div class="card" style="padding:16px;background:#fafafa;border-radius:12px;border:1px dashed var(--accent);">
        <div><strong>Ergebnis:</strong> ${resultText}</div>
      </div>
      <button id="restartBtn">Neue Verhandlung starten</button>
    </div>
    ${historyTable()}
  `;
  document.getElementById('restartBtn').addEventListener('click', () => {
    state = newState();
    viewVignette();
  });
}

// === Start ===================================================================
viewVignette();

