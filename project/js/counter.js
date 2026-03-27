// ─── PACK COUNTER SYSTEM ─────────────────────────────────────────────────────
// Add this section to main.js — session-based, resets on refresh

const PACK_BATCHES = [
  { packs: 3, cost: null,           label: 'FREE' },
  { packs: 3, cost: 60,             label: '1 MIN' },
  { packs: 3, cost: 300,            label: '5 MIN' },
  { packs: 3, cost: 1800,           label: '30 MIN' },
  { packs: 3, cost: 18000,          label: '5 HRS' },
  { packs: 3, cost: 157680000,      label: '5 YRS' },
  { packs: 3, cost: 946080000,      label: '30 YRS' },
  { packs: 3, cost: 2461680000,     label: '78 YRS' },
];

let currentBatch      = 0;
let packsLeftInBatch  = PACK_BATCHES[0].packs;
let waitingUntil      = null; // timestamp ms when wait ends
let countdownInterval = null;

function getCounterEl()    { return document.getElementById('packCounter'); }
function getCounterPacks() { return document.getElementById('counterPacks'); }
function getCounterLabel() { return document.getElementById('counterLabel'); }
function getCounterSub()   { return document.getElementById('counterSub'); }

function formatCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 3600) {
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }
  const h  = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const m  = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s  = String(totalSec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function updateCounterDisplay() {
  const pEl = getCounterPacks();
  const lEl = getCounterLabel();
  const sEl = getCounterSub();
  if (!pEl) return;

  if (waitingUntil) {
    const remaining = waitingUntil - Date.now();
    if (remaining <= 0) {
      finishWait();
      return;
    }
    pEl.textContent = formatCountdown(remaining);
    lEl.textContent = 'WAIT';
    sEl.textContent = `next batch: ${PACK_BATCHES[currentBatch]?.label || 'FREE'}`;
    getCounterEl().dataset.state = 'waiting';
  } else {
    pEl.textContent = String(packsLeftInBatch).padStart(2, '0');
    const batch = PACK_BATCHES[currentBatch];
    lEl.textContent = batch ? `NEXT: ${batch.label}` : 'FINAL';
    const nextBatch = PACK_BATCHES[currentBatch + 1];
    sEl.textContent = nextBatch
      ? `then: ${nextBatch.label}`
      : currentBatch >= PACK_BATCHES.length - 1 ? 'no more packs' : '';
    getCounterEl().dataset.state = packsLeftInBatch === 0 ? 'waiting' : 'ready';
  }
}

function startCountdown(durationMs) {
  clearInterval(countdownInterval);
  waitingUntil = Date.now() + durationMs;
  updateCounterDisplay();
  countdownInterval = setInterval(() => {
    if (!waitingUntil) { clearInterval(countdownInterval); return; }
    const remaining = waitingUntil - Date.now();
    if (remaining <= 0) { finishWait(); }
    else { updateCounterDisplay(); }
  }, 250); // 250ms tick for smooth seconds
}

function finishWait() {
  clearInterval(countdownInterval);
  waitingUntil = null;
  currentBatch++;
  if (currentBatch < PACK_BATCHES.length) {
    packsLeftInBatch = PACK_BATCHES[currentBatch].packs;
  } else {
    packsLeftInBatch = 0;
  }
  updateCounterDisplay();
  pulseCounter();
}

function consumePack() {
  // Called when a pack is opened
  if (waitingUntil) return false; // still waiting
  if (packsLeftInBatch <= 0) return false;

  packsLeftInBatch--;
  updateCounterDisplay();
  pulseCounter();

  if (packsLeftInBatch === 0) {
    // Start wait for next batch
    const nextBatch = PACK_BATCHES[currentBatch + 1];
    if (nextBatch && nextBatch.cost) {
      setTimeout(() => startCountdown(nextBatch.cost * 1000), 800);
    }
  }

  return true;
}

function pulseCounter() {
  const el = getCounterEl();
  if (!el) return;
  el.classList.remove('counter-pulse');
  void el.offsetWidth;
  el.classList.add('counter-pulse');
}

function initCounter() {
  updateCounterDisplay();
}