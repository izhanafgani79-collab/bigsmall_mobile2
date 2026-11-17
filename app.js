
const MIN_RESULTS = 5;
const MAX_RESULTS = 80;
const STORAGE_KEY = "big_small_analyzer_phase2";
const SKIP_THRESHOLD = 15;

let results = [];
let selectedWindow = 10;

const $ = id => document.getElementById(id);

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      results = saved
        .filter(x => x === "B" || x === "S")
        .slice(0, MAX_RESULTS);
    }
  } catch {
    results = [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
}

function addResult(value) {
  if (results.length >= MAX_RESULTS) {
    alert("Maximum 80 results allowed.");
    return;
  }

  results.push(value);
  saveData();
  render();
}

function undoLast() {
  if (!results.length) return;
  results.pop();
  saveData();
  render();
}

function resetAll() {
  if (!results.length) return;
  if (!confirm("Are you sure you want to delete all results?")) return;

  results = [];
  saveData();
  render();
}

function countValues(list) {
  const big = list.filter(x => x === "B").length;

  return {
    big,
    small: list.length - big
  };
}

function percentage(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function getStreak(list) {
  if (!list.length) return { value: "—", length: 0 };

  const last = list[list.length - 1];
  let length = 0;

  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] !== last) break;
    length++;
  }

  return { value: last, length };
}

// Positive value supports BIG; negative supports SMALL.
function frequencySignal(list) {
  if (!list.length) return 0;

  const { big, small } = countValues(list);
  return (big - small) / list.length;
}

function alternatingSignal(list) {
  if (list.length < 5) return 0;

  const recent = list.slice(-5);

  const alternating = recent.every((value, index) =>
    index === 0 || value !== recent[index - 1]
  );

  if (!alternating) return 0;

  return recent[recent.length - 1] === "B" ? -1 : 1;
}

function blockPatternSignal(list) {
  if (list.length < 6) return 0;

  const recent = list.slice(-6);
  const first = recent.slice(0, 3);
  const second = recent.slice(3, 6);

  const firstSame = first.every(x => x === first[0]);
  const secondSame = second.every(x => x === second[0]);
  const opposite = first[0] !== second[0];

  if (!firstSame || !secondSame || !opposite) return 0;

  return second[0] === "B" ? 1 : -1;
}

function streakSignal(list) {
  const streak = getStreak(list);

  if (streak.length < 3) return 0;

  const strength = Math.min(streak.length / 5, 1);

  return streak.value === "B" ? strength : -strength;
}

function findHistoricalMatches(list) {
  const maxLength = Math.min(5, list.length - 1);

  for (let length = maxLength; length >= 3; length--) {
    const target = list.slice(-length).join("");
    const currentStart = list.length - length;

    let bigNext = 0;
    let smallNext = 0;

    for (let i = 0; i + length < currentStart; i++) {
      const candidate = list.slice(i, i + length).join("");

      if (candidate !== target) continue;

      const following = list[i + length];

      if (following === "B") bigNext++;
      if (following === "S") smallNext++;
    }

    const total = bigNext + smallNext;

    if (total > 0) {
      return {
        length,
        target,
        bigNext,
        smallNext,
        total
      };
    }
  }

  return null;
}

function historicalSignal(list) {
  const match = findHistoricalMatches(list);

  if (!match || match.total < 2) return 0;

  return (match.bigNext - match.smallNext) / match.total;
}

// MODEL ENGINE
function getModelIndication(list) {
  if (list.length < MIN_RESULTS) {
    return {
      choice: "WAIT",
      bigScore: 50,
      smallScore: 50,
      strength: 0,
      reason: "Enter at least 5 results."
    };
  }

  const signals = [];

  signals.push({
    name: "Recent 5",
    weight: 30,
    value: frequencySignal(list.slice(-5))
  });

  if (list.length >= 10) {
    signals.push({
      name: "Recent 10",
      weight: 25,
      value: frequencySignal(list.slice(-10))
    });
  }

  if (list.length >= 20) {
    signals.push({
      name: "Recent 20",
      weight: 20,
      value: frequencySignal(list.slice(-20))
    });
  }

  const alternate = alternatingSignal(list);
  const block = blockPatternSignal(list);
  const streak = streakSignal(list);

  const patternValue = alternate !== 0
    ? alternate
    : block !== 0
      ? block
      : streak;

  signals.push({
    name: "Pattern",
    weight: 15,
    value: patternValue
  });

  signals.push({
    name: "History",
    weight: 10,
    value: historicalSignal(list)
  });

  const totalWeight = signals.reduce(
    (sum, item) => sum + item.weight, 0
  );

  const combinedSignal = signals.reduce(
    (sum, item) => sum + item.value * item.weight, 0
  ) / totalWeight;

  const bigScore = 50 + combinedSignal * 50;
  const smallScore = 50 - combinedSignal * 50;

  const strength = Math.round(
    Math.abs(bigScore - smallScore)
  );

  let choice = "SKIP";

  if (strength >= SKIP_THRESHOLD) {
    choice = bigScore > smallScore ? "BIG" : "SMALL";
  }

  const reasons = signals
    .filter(item => item.value !== 0)
    .map(item =>
      `${item.name}: ${item.value > 0 ? "BIG support" : "SMALL support"}`
    );

  return {
    choice,
    bigScore: Math.round(bigScore),
    smallScore: Math.round(smallScore),
    strength,
    reason: reasons.length
      ? reasons.join(" | ")
      : "No meaningful directional signal found."
  };
}

// BASIC STATISTICS
function renderResults() {
  $("count").textContent = results.length;

  $("sequenceInfo").textContent = results.length
    ? `${results.length} results entered`
    : "No results added";

  const sequence = $("sequence");
  sequence.innerHTML = "";

  if (!results.length) {
    sequence.innerHTML =
      '<p class="empty">Your results will appear here.</p>';
  } else {
    results.forEach((value, index) => {
      const chip = document.createElement("div");
      chip.className = `sequence-chip ${value}`;
      chip.textContent = value;
      chip.title = `Result ${index + 1}: ${value === "B" ? "BIG" : "SMALL"}`;
      sequence.appendChild(chip);
    });
  }

  const { big, small } = countValues(results);
  const streak = getStreak(results);

  $("totalStat").textContent = results.length;
  $("bigStat").textContent = big;
  $("smallStat").textContent = small;

  $("streakStat").textContent = streak.length
    ? `${streak.value === "B" ? "BIG" : "SMALL"} × ${streak.length}`
    : "—";

  $("addBig").disabled = results.length >= MAX_RESULTS;
  $("addSmall").disabled = results.length >= MAX_RESULTS;
  $("undoBtn").disabled = !results.length;
}

// PHASE 3: LIVE TREND GRAPH
function renderTrendGraph() {
  const chart = $("trendChart");
  const list = results.slice(-selectedWindow);

  if (!list.length) {
    chart.innerHTML = `
      <text x="350" y="130" text-anchor="middle"
        fill="#91a0b8" font-size="15">
        Add results to see graph
      </text>
    `;

    $("graphRange").textContent = "Showing 0 results";
    $("graphLatest").textContent = "Latest: —";
    $("graphSummary").textContent = "Graph analysis will appear here.";
    return;
  }

  const width = 700;
  const height = 260;
  const left = 58;
  const right = 680;
  const top = 42;
  const bottom = 205;
  const gap = list.length > 1
    ? (right - left) / (list.length - 1)
    : 0;

  const bigY = top;
  const smallY = bottom;

  let svg = `
    <line x1="${left}" y1="${bigY}" x2="${right}" y2="${bigY}"
      stroke="#26364d" stroke-dasharray="5 5"/>
    <line x1="${left}" y1="${smallY}" x2="${right}" y2="${smallY}"
      stroke="#26364d" stroke-dasharray="5 5"/>

    <text x="8" y="${bigY + 5}" fill="#62a5ff" font-size="12">BIG</text>
    <text x="8" y="${smallY + 5}" fill="#35d99c" font-size="12">SMALL</text>
  `;

  const points = list.map((value, index) => {
    const x = list.length === 1
      ? (left + right) / 2
      : left + index * gap;

    const y = value === "B" ? bigY : smallY;

    return { x, y, value, index };
  });

  // Connect results with a line.
  const polyline = points
    .map(point => `${point.x},${point.y}`)
    .join(" ");

  svg += `
    <polyline points="${polyline}"
      fill="none"
      stroke="#8294b0"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity=".8"/>
  `;

  points.forEach(point => {
    const color = point.value === "B" ? "#3988ff" : "#16c784";

    svg += `
      <circle cx="${point.x}" cy="${point.y}" r="6"
        fill="${color}" stroke="#ffffff" stroke-width="1.5">
        <title>Result ${point.index + 1}: ${point.value === "B" ? "BIG" : "SMALL"}</title>
      </circle>
    `;
  });

  // Horizontal position labels.
  const labelCount = Math.min(5, list.length);

  for (let i = 0; i < labelCount; i++) {
    const index = labelCount === 1
      ? 0
      : Math.round(i * (list.length - 1) / (labelCount - 1));

    const x = list.length === 1
      ? (left + right) / 2
      : left + index * gap;

    svg += `
      <text x="${x}" y="238" text-anchor="middle"
        fill="#91a0b8" font-size="10">
        ${results.length - list.length + index + 1}
      </text>
    `;
  }

  chart.innerHTML = svg;

  const { big, small } = countValues(list);
  const latest = list[list.length - 1];

  $("graphRange").textContent =
    `Showing last ${list.length} of ${results.length} results`;

  $("graphLatest").textContent =
    `Latest: ${latest === "B" ? "BIG" : "SMALL"}`;

  $("graphSummary").textContent =
    `In this ${list.length}-result window: BIG ${big} (${percentage(big, list.length)}%) and SMALL ${small} (${percentage(small, list.length)}%). This describes past results only.`;
}

// PHASE 3: SIGNAL STRENGTH METER
function renderSignalMeter() {
  const model = getModelIndication(results);

  $("signalNumber").textContent = `${model.strength}%`;
  $("bigScoreText").textContent = `${model.bigScore}/100`;
  $("smallScoreText").textContent = `${model.smallScore}/100`;

  $("bigScoreBar").style.width = `${model.bigScore}%`;
  $("smallScoreBar").style.width = `${model.smallScore}%`;

  $("signalFill").style.width = `${model.strength}%`;

  const status = $("signalStatus");

  if (model.choice === "WAIT") {
    status.className = "signal-status neutral";
    status.textContent = "WAITING";
    $("signalFill").style.background = "#64748b";
  } else if (model.choice === "SKIP") {
    status.className = "signal-status skip";
    status.textContent = "SKIP IT";
    $("signalFill").style.background = "#ffc857";
  } else if (model.choice === "BIG") {
    status.className = "signal-status big";
    status.textContent = "BIG SIGNAL";
    $("signalFill").style.background = "#3988ff";
  } else {
    status.className = "signal-status small";
    status.textContent = "SMALL SIGNAL";
    $("signalFill").style.background = "#16c784";
  }
}

// ROLLING ANALYSIS
function renderRollingAnalysis() {
  const windows = [5, 10, 20, 40];
  $("rollingGrid").innerHTML = "";

  windows.forEach(size => {
    const list = results.slice(-size);
    const { big, small } = countValues(list);

    const card = document.createElement("div");
    card.className = "rolling-card";

    card.innerHTML = `
      <h3>Last ${size} Results</h3>
      <p>Available: <strong>${list.length}</strong></p>
      <p>BIG: <strong>${big}</strong> (${percentage(big, list.length)}%)</p>
      <p>SMALL: <strong>${small}</strong> (${percentage(small, list.length)}%)</p>
    `;

    $("rollingGrid").appendChild(card);
  });
}

// PATTERN DETECTION
function renderPatterns() {
  const grid = $("patternGrid");
  grid.innerHTML = "";

  if (results.length < MIN_RESULTS) {
    grid.innerHTML =
      '<div class="empty-card">Add at least 5 results to start analysis.</div>';
    return;
  }

  const recent = results.slice(-6);
  const streak = getStreak(results);

  const alternating = results.slice(-5).every((value, index, arr) =>
    index === 0 || value !== arr[index - 1]
  );

  const first = recent.slice(0, 3);
  const second = recent.slice(3, 6);

  const threeThree = recent.length === 6 &&
    first.every(x => x === first[0]) &&
    second.every(x => x === second[0]) &&
    first[0] !== second[0];

  const patterns = [
    {
      name: "Alternating Pattern",
      found: alternating,
      detail: alternating
        ? "Last 5 results alternate BIG/SMALL."
        : "No current 5-result alternation."
    },
    {
      name: "3–3 Block Pattern",
      found: threeThree,
      detail: threeThree
        ? "Three same results followed by three opposite results."
        : "No current 3–3 block pattern."
    },
    {
      name: "Long Streak",
      found: streak.length >= 4,
      detail: streak.length >= 4
        ? `${streak.value === "B" ? "BIG" : "SMALL"} repeated ${streak.length} times.`
        : `Current streak: ${streak.length}.`
    }
  ];

  patterns.forEach(pattern => {
    const card = document.createElement("div");
    card.className = "pattern-card";

    card.innerHTML = `
      <h3>${pattern.name}</h3>
      <p class="pattern-status">${pattern.found ? "Pattern detected" : "Not detected"}</p>
      <p>${pattern.detail}</p>
    `;

    grid.appendChild(card);
  });
}

// HISTORICAL MATCH
function renderHistoricalMatch() {
  const box = $("historyMatch");

  if (results.length < MIN_RESULTS) {
    box.innerHTML = '<p class="muted">Waiting for at least 5 results.</p>';
    return;
  }

  const match = findHistoricalMatches(results);

  if (!match) {
    box.textContent =
      "No earlier matching sequence with a known following result was found.";
    return;
  }

  box.innerHTML = `
    <strong>Matched sequence:</strong> ${match.target.split("").join(" – ")}<br>
    <strong>Sequence length:</strong> ${match.length}<br>
    <strong>Earlier matches:</strong> ${match.total}<br>
    <strong>Following BIG:</strong> ${match.bigNext}<br>
    <strong>Following SMALL:</strong> ${match.smallNext}<br>
    <strong>Historical split:</strong>
    BIG ${percentage(match.bigNext, match.total)}% /
    SMALL ${percentage(match.smallNext, match.total)}%
    <p class="muted">Historical samples do not establish future outcomes.</p>
  `;
}

// NEXT RESULT INDICATION
function renderPrediction() {
  const box = $("prediction");
  const reason = $("modelReason");

  if (results.length < MIN_RESULTS) {
    box.className = "prediction-result";

    box.innerHTML = `
      <div class="prediction-icon">?</div>
      <div>
        <h3>Waiting for data</h3>
        <p>Enter ${MIN_RESULTS - results.length} more result(s).</p>
      </div>
    `;

    reason.textContent = "Analysis starts after 5 results.";
    return;
  }

  const model = getModelIndication(results);

  if (model.choice === "SKIP") {
    box.className = "prediction-result neutral";

    box.innerHTML = `
      <div class="prediction-icon">↷</div>
      <div>
        <h3>SKIP IT</h3>
        <p>Signal strength is below ${SKIP_THRESHOLD}%.</p>
      </div>
    `;
  } else {
    const isBig = model.choice === "BIG";

    box.className = `prediction-result ${isBig ? "big" : "small"}`;

    box.innerHTML = `
      <div class="prediction-icon">${isBig ? "B" : "S"}</div>
      <div>
        <h3>${model.choice}</h3>
        <p>Model indication only — not guaranteed.</p>
      </div>
    `;
  }

  reason.innerHTML = `
    <strong>BIG model score:</strong> ${model.bigScore}/100<br>
    <strong>SMALL model score:</strong> ${model.smallScore}/100<br>
    <strong>Signal strength:</strong> ${model.strength}%<br>
    <strong>Threshold:</strong> ${SKIP_THRESHOLD}%<br>
    <strong>Analysis:</strong> ${model.reason}
  `;
}

// ACCURACY TRACKER
function calculateAccuracy() {
  let checked = 0;
  let correct = 0;
  let wrong = 0;

  for (let i = MIN_RESULTS; i < results.length; i++) {
    const pastResults = results.slice(0, i);
    const actualNext = results[i];
    const prediction = getModelIndication(pastResults);

    if (
      prediction.choice === "SKIP" ||
      prediction.choice === "WAIT"
    ) {
      continue;
    }

    checked++;

    if (
      (prediction.choice === "BIG" && actualNext === "B") ||
      (prediction.choice === "SMALL" && actualNext === "S")
    ) {
      correct++;
    } else {
      wrong++;
    }
  }

  $("checkedPredictions").textContent = checked;
  $("correctPredictions").textContent = correct;
  $("wrongPredictions").textContent = wrong;

  $("accuracyRate").textContent = checked
    ? `${percentage(correct, checked)}%`
    : "—";
}

// MAIN RENDER
function render() {
  renderResults();
  renderTrendGraph();
  renderSignalMeter();
  renderRollingAnalysis();
  renderPatterns();
  renderHistoricalMatch();
  renderPrediction();
  calculateAccuracy();
}

// BUTTON EVENTS
$("addBig").addEventListener("click", () => addResult("B"));
$("addSmall").addEventListener("click", () => addResult("S"));
$("undoBtn").addEventListener("click", undoLast);
$("resetBtn").addEventListener("click", resetAll);

// GRAPH WINDOW BUTTONS
document.querySelectorAll(".window-btn").forEach(button => {
  button.addEventListener("click", () => {
    selectedWindow = Number(button.dataset.window);

    document.querySelectorAll(".window-btn").forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");
    renderTrendGraph();
  });
});

// INITIALIZE
loadData();
render();
