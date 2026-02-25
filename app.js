const BOARD_SIZE = 8;
const TOTAL_CARDS = BOARD_SIZE * BOARD_SIZE;
const PAIR_COUNT = TOTAL_CARDS / 2;

const board = document.querySelector("#game-board");
const cardTemplate = document.querySelector("#card-template");
const resetBtn = document.querySelector("#reset-btn");
const movesText = document.querySelector("#moves");
const matchesText = document.querySelector("#matches");
const timerText = document.querySelector("#timer");
const bestRecordText = document.querySelector("#best-record");

const photoDir = "assets/photos";
const defaultPhotos = Array.from({ length: PAIR_COUNT }, (_, i) =>
  `${photoDir}/photo-${String(i + 1).padStart(2, "0")}.jpg`
);
const BEST_RECORD_KEY = "memory-game-best-record-v1";

let cards = [];
let opened = [];
let lock = false;
let moves = 0;
let matches = 0;
let elapsedSeconds = 0;
let timerId = null;
let hasStarted = false;
let bestRecord = loadBestRecord();
let audioCtx = null;

function ensureAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playFlipSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.09);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.11);
}

function loadBestRecord() {
  try {
    const raw = localStorage.getItem(BEST_RECORD_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Number.isInteger(parsed.moves) ||
      !Number.isInteger(parsed.seconds) ||
      parsed.moves < 0 ||
      parsed.seconds < 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveBestRecord(record) {
  bestRecord = record;
  localStorage.setItem(BEST_RECORD_KEY, JSON.stringify(record));
}

function formatTime(seconds) {
  const min = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function updateStats() {
  movesText.textContent = String(moves);
  matchesText.textContent = String(matches);
  timerText.textContent = formatTime(elapsedSeconds);
}

function updateBestRecordUI() {
  if (!bestRecord) {
    bestRecordText.textContent = "없음";
    return;
  }
  bestRecordText.textContent = `시도 ${bestRecord.moves}회 / ${formatTime(bestRecord.seconds)}`;
}

function startTimerIfNeeded() {
  if (hasStarted || timerId) return;
  hasStarted = true;
  timerId = setInterval(() => {
    elapsedSeconds += 1;
    timerText.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
}

function isBetterRecord(nextRecord, prevRecord) {
  if (!prevRecord) return true;
  if (nextRecord.moves < prevRecord.moves) return true;
  if (nextRecord.moves === prevRecord.moves && nextRecord.seconds < prevRecord.seconds) return true;
  return false;
}

function buildDeck(imagePool) {
  const selected = imagePool.slice(0, PAIR_COUNT);
  const duplicated = [...selected, ...selected];

  return shuffle(
    duplicated.map((src, idx) => ({
      id: `card-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      src,
      matched: false,
    }))
  );
}

function cardElement(cardData) {
  const node = cardTemplate.content.firstElementChild.cloneNode(true);
  const img = node.querySelector("img");

  node.dataset.id = cardData.id;
  node.dataset.src = cardData.src;
  img.src = cardData.src;
  img.alt = "동료 사진";

  img.addEventListener("error", () => {
    img.src = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
        <rect width='200' height='200' fill='#e8f1f3'/>
        <circle cx='100' cy='75' r='32' fill='#90a4ae'/>
        <rect x='45' y='120' width='110' height='55' rx='22' fill='#90a4ae'/>
      </svg>`
    );
  }, { once: true });

  node.addEventListener("click", () => onCardClick(node));
  return node;
}

function finishGame() {
  stopTimer();
  const currentRecord = { moves, seconds: elapsedSeconds };
  const isNewBest = isBetterRecord(currentRecord, bestRecord);
  if (isNewBest) {
    saveBestRecord(currentRecord);
    updateBestRecordUI();
  }

  setTimeout(() => {
    const summary = `완료! 시도 ${moves}회, 시간 ${formatTime(elapsedSeconds)}`;
    const bestLine = isNewBest
      ? "새 최고기록입니다."
      : bestRecord
        ? `최고기록: 시도 ${bestRecord.moves}회 / ${formatTime(bestRecord.seconds)}`
        : "";
    alert([summary, bestLine].filter(Boolean).join("\n"));
  }, 200);
}

function closeOpenedCards() {
  opened.forEach((card) => card.classList.remove("flipped"));
  opened = [];
}

function onCardClick(cardNode) {
  if (lock) return;
  if (cardNode.classList.contains("flipped") || cardNode.classList.contains("matched")) return;

  startTimerIfNeeded();
  playFlipSound();
  cardNode.classList.add("flipped");
  opened.push(cardNode);

  if (opened.length < 2) return;

  moves += 1;
  updateStats();

  const [first, second] = opened;
  const isMatch = first.dataset.src === second.dataset.src;

  if (isMatch) {
    first.classList.add("matched");
    second.classList.add("matched");
    first.disabled = true;
    second.disabled = true;
    opened = [];
    matches += 1;
    updateStats();

    if (matches === PAIR_COUNT) {
      finishGame();
    }
    return;
  }

  lock = true;
  setTimeout(() => {
    closeOpenedCards();
    lock = false;
  }, 700);
}

function resetState() {
  stopTimer();
  opened = [];
  lock = false;
  moves = 0;
  matches = 0;
  elapsedSeconds = 0;
  hasStarted = false;
  updateStats();
}

function render(imagePool = defaultPhotos) {
  resetState();
  cards = buildDeck(imagePool);

  board.innerHTML = "";
  cards.forEach((card) => {
    board.append(cardElement(card));
  });
}

resetBtn.addEventListener("click", () => render());
updateBestRecordUI();
render();
