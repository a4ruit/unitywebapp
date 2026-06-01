// ─── STARS CURRENCY + PACK COUNTER ────────────────────────────────────────────

let stars           = 0;   // earned through quests and ad-watching — start at zero
let packsLeft      = 6;   // 6 free packs on load

const PACKS_PER_BATCH = 3;
const STARS_PER_AD     = 10;  // earned by watching full ad
const STARS_SKIP_AD    = 10;  // cost to skip an ad
const STARS_PER_BATCH  = 50;  // cost to buy 3 packs

// Stars earned when a collective quest objective is completed by the room.
// Unity broadcasts quest_reward|{quest}|{n} → server relays → handled in main.js.
const QUEST_STAR_REWARDS = {
  flowers: 15,
  sheep:   10,
  ducks:   10,
  all:     20,
};

// ─── Stars ─────────────────────────────────────────────────────────────────────

function addStars(amount, fromEl) {
  const prev = stars;
  stars += amount;

  // Juicy pixel-star flight: tick the DISPLAY up as stars land on the counter,
  // then reconcile to the exact total. Falls back to a plain snap if StarFX
  // isn't available.
  if (typeof StarFX !== 'undefined' && amount > 0) {
    setStarsValue(prev);                       // hold old value until stars arrive
    StarFX.burst({
      amount,
      from: fromEl || null,
      onLand: (landed, total) => setStarsValue(prev + Math.round(amount * landed / total)),
      onComplete: () => { setStarsValue(stars); pulseStars(); },
    });
  } else {
    setStarsValue(stars);
    pulseStars();
  }
  updateSpendAffordance();                      // keep buttons in sync immediately
}

// Set just the displayed number (used for the coin count-up).
function setStarsValue(v) {
  const el = document.getElementById('starsValue');
  if (el) el.textContent = v;
}

function spendStars(amount) {
  if (stars < amount) return false;
  stars -= amount;
  updateStarsDisplay();
  return true;
}

function updateStarsDisplay() {
  setStarsValue(stars);
  updateSpendAffordance();
}

function updateSpendAffordance() {
  // Dim spend button if not enough stars
  const btn = document.getElementById('gateSpendBtn');
  if (btn) {
    const canAfford = stars >= STARS_PER_BATCH;
    btn.disabled      = !canAfford;
    btn.style.opacity = canAfford ? '1' : '0.35';
  }
  // Re-light / dim any cards on a live choice grid as the balance changes
  // (covers both earning and spending — every balance change routes through here).
  if (typeof ChoiceGrid3D !== 'undefined' && ChoiceGrid3D.refreshAffordability) {
    ChoiceGrid3D.refreshAffordability();
  }
  // Keep the choice-grid star balance readout in sync.
  const cs = document.getElementById('choiceStarBalance');
  if (cs) cs.textContent = stars;
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
    if (document.body.classList.contains('pristine-phase')) {
      // Pristine phase: no gate — just silently refill and continue
      packsLeft = PACKS_PER_BATCH;
    } else {
      showGate();
      return false;
    }
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

// Exposed so choiceGrid3d.js can check affordability without importing stars directly.
window.getStarBalance = () => stars;

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
  _syncGiftButton();   // keep the gift CLAIMED if already taken this session
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

// ─── PRISTINE SHOP — generous, non-predatory items ────────────────────────────

function syncShopBalance() {
  const el = document.getElementById('shopStarBalance');
  if (el) el.textContent = stars;
}

// Brief green confirmation on a shop button
function _shopConfirm(btn, text) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = text || '✓';
  btn.style.background = 'var(--green-lt, #3aaa3a)';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 750);
}

// Red flash on the balance when a player can't afford something
function _shopDenied() {
  const el = document.getElementById('shopStarBalance');
  if (el) { el.style.color = 'var(--red, #ff1414)'; setTimeout(() => el.style.color = '', 600); }
}

// Free gift — top up packs at no cost. ONE per session so it can't be farmed.
let giftClaimed = false;
function shopGiftPacks(n, btn) {
  if (giftClaimed) return;            // already taken this session
  giftClaimed = true;
  packsLeft += n;
  updateCounterDisplay();
  _shopConfirm(btn, 'GIFTED');
  setTimeout(_syncGiftButton, 760);  // settle into the CLAIMED state after the flash
}

// Reflect the gift's claimed state on its button (called on claim + shop open).
function _syncGiftButton() {
  const btn = document.getElementById('shopGiftBtn');
  if (!btn || !giftClaimed) return;
  btn.textContent      = 'CLAIMED';
  btn.disabled         = true;
  btn.style.opacity    = '0.5';
  btn.style.background  = '';
  const item = btn.closest('.shop-item');
  if (item) item.style.opacity = '0.6';
}

// Buy a pack bundle with stars (net-positive if you do the tasks).
function shopBuyPacks(cost, n, btn) {
  if (!spendStars(cost)) { _shopDenied(); return; }
  packsLeft += n;
  updateCounterDisplay();
  syncShopBalance();
  updateShopButtons();
  _shopConfirm(btn, '+' + n);
}

// Refresh tasks — reset individual tasks so the player keeps earning. Costs 1 star.
function shopRefreshTasks(btn) {
  if (!spendStars(1)) { _shopDenied(); return; }
  if (typeof TaskTracker !== 'undefined' && TaskTracker.refreshIndividual) {
    TaskTracker.refreshIndividual();
  }
  syncShopBalance();
  updateShopButtons();
  _shopConfirm(btn, 'DONE');
}

// Guaranteed legendary — pierce the gacha. Next pack's top card is legendary+.
function shopBuyLegendary(cost, btn) {
  if (!spendStars(cost)) { _shopDenied(); return; }
  window._guaranteedLegendary = true;
  syncShopBalance();
  updateShopButtons();
  _shopConfirm(btn, 'READY');
}

function updateShopButtons() {
  // Grey out items the player can't afford, highlight what they can
  document.querySelectorAll('.shop-item').forEach(item => {
    const btn = item.querySelector('.shop-btn');
    if (!btn || btn.classList.contains('shop-btn--affordable')) return;
    const starsEl = item.querySelector('.shop-item-stars');
    if (!starsEl) return;
    const cost = parseInt(starsEl.textContent.replace(/[★,\s]/g,''));
    if (isNaN(cost)) return;
    const canAfford = stars >= cost;
    if (item.closest('.shop-items-pristine')) {
      // Friendly shop — keep the cozy CSS button colours, just convey
      // affordability through opacity (no harsh orange repaint).
      btn.style.opacity  = canAfford ? '1' : '0.4';
      item.style.opacity = canAfford ? '1' : '0.7';
    } else {
      btn.style.opacity = canAfford ? '1' : '0.3';
      btn.style.background = canAfford ? 'var(--orange)' : '';
      btn.style.color = canAfford ? 'var(--bg)' : '';
      item.style.opacity = canAfford ? '1' : '0.6';
    }
  });
}