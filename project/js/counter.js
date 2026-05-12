// ─── STARS CURRENCY + PACK COUNTER ────────────────────────────────────────────

let stars           = 0;
let packsLeft      = 6;   // 6 free packs on load

const PACKS_PER_BATCH = 3;
const STARS_PER_AD     = 10;  // earned by watching full ad
const STARS_SKIP_AD    = 10;  // cost to skip an ad
const STARS_PER_BATCH  = 50;  // cost to buy 3 packs

// ─── Stars ─────────────────────────────────────────────────────────────────────

function addStars(amount) {
  stars += amount;
  updateStarsDisplay();
  pulseStars();
}

function spendStars(amount) {
  if (stars < amount) return false;
  stars -= amount;
  updateStarsDisplay();
  return true;
}

function updateStarsDisplay() {
  const el = document.getElementById('starsValue');
  if (el) el.textContent = stars;
  // Dim spend button if not enough stars
  const btn = document.getElementById('gateSpendBtn');
  if (btn) {
    const canAfford = stars >= STARS_PER_BATCH;
    btn.disabled      = !canAfford;
    btn.style.opacity = canAfford ? '1' : '0.35';
  }
}

function pulseStars() {
  const el = document.getElementById('starsDisplay');
  if (!el) return;
  el.classList.remove('stars-pulse');
  void el.offsetWidth;
  el.classList.add('stars-pulse');
  // Also pulse the value number
  const val = document.getElementById('starsValue');
  if (val) { val.style.transform='scale(1.15)'; setTimeout(()=>val.style.transform='',200); }
}

// ─── Counter display ──────────────────────────────────────────────────────────

function updateCounterDisplay() {
  const pEl = document.getElementById('counterPacks');
  const lEl = document.getElementById('counterLabel');
  const sEl = document.getElementById('counterSub');
  const cEl = document.getElementById('packCounter');
  if (!pEl) return;

  pEl.textContent = String(packsLeft).padStart(2, '0');

  if (packsLeft > 0) {
    if (lEl) lEl.textContent = 'PACKS';
    if (sEl) sEl.textContent = 'swipe or tap to open';
    if (cEl) cEl.dataset.state = 'ready';
  } else {
    if (lEl) lEl.textContent = 'EMPTY';
    if (sEl) sEl.textContent = 'watch ad or spend stars';
    if (cEl) cEl.dataset.state = 'waiting';
  }
}

// ─── Consume pack ─────────────────────────────────────────────────────────────

function consumePack() {
  if (packsLeft <= 0) {
    showGate();
    return false;
  }
  packsLeft--;
  updateCounterDisplay();
  pulseCounter();
  return true;
}

function pulseCounter() {
  const el = document.getElementById('packCounter');
  if (!el) return;
  el.classList.remove('counter-pulse');
  void el.offsetWidth;
  el.classList.add('counter-pulse');
}

// ─── Gate screen — appears when packs run out ─────────────────────────────────

function showGate() {
  updateStarsDisplay();
  // Sync the gate screen's stars display
  const gateVal = document.getElementById('starsValueGate');
  if (gateVal) gateVal.textContent = stars;
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('screen-gate').classList.remove('hidden');
}

function gateWatchAd() {
  document.getElementById('screen-gate').classList.add('hidden');
  showAd({
    onComplete: () => {
      // Watched full ad — earn stars + get packs
      addStars(STARS_PER_AD);
      packsLeft = PACKS_PER_BATCH;
      updateCounterDisplay();
      resetToPackScreen();
    },
    onSkip: (starsSpent) => {
      // Skipped ad — already spent stars in showAd, just give packs
      packsLeft = PACKS_PER_BATCH;
      updateCounterDisplay();
      resetToPackScreen();
    }
  });
}

function gateSpendStars() {
  if (!spendStars(STARS_PER_BATCH)) return;
  packsLeft = PACKS_PER_BATCH;
  updateCounterDisplay();
  document.getElementById('screen-gate').classList.add('hidden');
  resetToPackScreen();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function initCounter() {
  updateCounterDisplay();
  updateStarsDisplay();
}

// ─── SHOP ─────────────────────────────────────────────────────────────────────

function openShop() {
  // Ensure page-pack is visible (in case nav had switched)
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-pack').classList.remove('hidden');
  // Show shop screen via showScreen if available, otherwise manually
  if (typeof showScreen === 'function') {
    showScreen('screen-shop');
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('screen-shop').classList.remove('hidden');
  }
  // Sync balance display
  const el = document.getElementById('shopStarBalance');
  if (el) el.textContent = stars;
  updateShopButtons();
}

function closeShop() {
  if (typeof showScreen === 'function') {
    showScreen('screen-pack');
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('screen-pack').classList.remove('hidden');
  }
}

function shopBuy(cost) {
  if (stars < cost) {
    // Can't afford — flash the balance red
    const el = document.getElementById('shopStarBalance');
    if (el) {
      el.style.color = 'var(--red, #ff1414)';
      setTimeout(() => el.style.color = '', 600);
    }
    return;
  }
  spendStars(cost);
  // Give packs based on tier
  const packMap = {
    50:       3,
    500:      30,
    5000:     300,
    50000:    3000,
    200000:   30000,
    2000000:  999999,
  };
  const packs = packMap[cost] || 3;
  packsLeft += packs;
  updateCounterDisplay();
  updateShopButtons();
  // Update shop balance
  const el = document.getElementById('shopStarBalance');
  if (el) el.textContent = stars;
  // Brief confirmation flash
  pulseStars();
}

function updateShopButtons() {
  // Grey out items the player can't afford, highlight what they can
  document.querySelectorAll('.shop-item').forEach(item => {
    const btn = item.querySelector('.shop-btn');
    if (!btn || btn.classList.contains('shop-btn--affordable')) return;
    const starsEl = item.querySelector('.shop-item-stars');
    if (!starsEl) return;
    const cost = parseInt(starsEl.textContent.replace(/[★,\s]/g,''));
    if (!isNaN(cost)) {
      const canAfford = stars >= cost;
      btn.style.opacity = canAfford ? '1' : '0.3';
      btn.style.background = canAfford ? 'var(--orange)' : '';
      btn.style.color = canAfford ? 'var(--bg)' : '';
      item.style.opacity = canAfford ? '1' : '0.6';
    }
  });
}