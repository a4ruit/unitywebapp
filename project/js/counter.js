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
  boss:    50,   // defeat-the-boss event quest (keep in sync with QuestManager.bossStarReward)
};

// ─── Stars ─────────────────────────────────────────────────────────────────────

function addStars(amount, fromEl) {
  // Reward ding (no-op unless "sound on"). Only on an actual gain.
  if (typeof Sound !== 'undefined' && amount > 0) Sound.play('star');
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
      showEmpty();   // calm cooldown screen — no ads in the pristine phase
    } else {
      showGate();    // horror gate with ad/spend options
    }
    return false;
  }
  packsLeft--;
  updateCounterDisplay();
  pulseCounter();
  return true;
}

// ─── Pristine "no packs" cooldown screen ─────────────────────────────────────

const EMPTY_COOLDOWN_SECS = 30;
let _emptyCooldownUntil = 0;
let _emptyCooldownTimer = null;

function showEmpty() {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('screen-empty').classList.remove('hidden');
  _startEmptyCooldown();
}

function _startEmptyCooldown() {
  // Only start a new countdown if one isn't already running.
  if (Date.now() < _emptyCooldownUntil) { _syncEmptyBtn(); return; }
  _emptyCooldownUntil = Date.now() + EMPTY_COOLDOWN_SECS * 1000;
  clearInterval(_emptyCooldownTimer);
  _emptyCooldownTimer = setInterval(_syncEmptyBtn, 250);
  _syncEmptyBtn();
}

function _syncEmptyBtn() {
  const btn   = document.getElementById('emptyCooldownBtn');
  const timer = document.getElementById('emptyCooldownTimer');
  const remaining = Math.max(0, _emptyCooldownUntil - Date.now());
  if (remaining > 0) {
    const s = Math.ceil(remaining / 1000);
    const mm = Math.floor(s / 60), ss = s % 60;
    if (timer) timer.textContent = `${mm}:${String(ss).padStart(2,'0')}`;
    if (btn)   { btn.disabled = true; }
  } else {
    if (timer) timer.textContent = 'Ready!';
    if (btn)   { btn.disabled = false; }
    clearInterval(_emptyCooldownTimer);
    _emptyCooldownTimer = null;
  }
}

// Player taps "Get a free pack" after the countdown.
function emptyClaimFree() {
  if (Date.now() < _emptyCooldownUntil) return;
  packsLeft += 1;
  updateCounterDisplay();
  resetToPackScreen();
}

// Player taps "Open shop" from the empty screen.
function emptyOpenShop() {
  // showScreen returns to pack-screen first, then open the shop inside it.
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('screen-empty').classList.add('hidden');
  if (typeof openShop === 'function') openShop();
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
  // Door-bell jingle on entry (no-op unless "sound on" is ticked).
  if (typeof Sound !== 'undefined') Sound.play('shopOpen');
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
  _syncGiftButton();      // keep the gift CLAIMED if already taken this session
  _syncRefreshButton();   // keep the refresh cooldown countdown showing
  _syncPrismaticButton(); // keep the prismatic ACTIVE if already purchased
}

function closeShop() {
  // Reverse jingle on exit — the "leaving the milk bar" beat.
  if (typeof Sound !== 'undefined') Sound.play('shopClose');
  if (typeof showScreen === 'function') {
    showScreen('screen-pack');
  } else {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById('screen-pack').classList.remove('hidden');
  }
}

function shopBuy(cost) {
  if (stars < cost) {
    if (typeof Sound !== 'undefined') Sound.play('deny');
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
  if (typeof Sound !== 'undefined') Sound.play('deny');
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

// Refresh tasks — reset individual tasks so the player keeps earning. Costs 1
// star AND has a 15-minute cooldown per session (in-memory → resets on reload).
const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
let _refreshCooldownUntil = 0;
let _refreshTimer = null;

function shopRefreshTasks(btn) {
  if (Date.now() < _refreshCooldownUntil) { _shopDenied(); return; }   // still cooling down
  if (!spendStars(1)) { _shopDenied(); return; }
  if (typeof TaskTracker !== 'undefined' && TaskTracker.refreshIndividual) {
    TaskTracker.refreshIndividual();
  }
  syncShopBalance();
  _refreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS;
  _startRefreshCooldownUI();
  updateShopButtons();
}

// Drives the mm:ss countdown on the refresh button until the cooldown ends.
function _startRefreshCooldownUI() {
  _syncRefreshButton();
  clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    _syncRefreshButton();
    if (Date.now() >= _refreshCooldownUntil) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }, 1000);
}

// Reflect the cooldown state on the refresh button (called on tick + shop open).
function _syncRefreshButton() {
  const btn = document.getElementById('shopRefreshBtn');
  if (!btn) return;
  const remaining = _refreshCooldownUntil - Date.now();
  if (remaining > 0) {
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    btn.textContent  = `${m}:${String(s).padStart(2, '0')}`;
    btn.disabled     = true;
    btn.style.opacity = '0.5';
  } else {
    btn.textContent  = 'REFRESH';
    btn.disabled     = false;
    btn.style.opacity = '';
  }
}

// Prismatic name tag — cosmetic upgrade, persists for the session.
let _prismaticOwned = false;
function shopBuyPrismatic(cost, btn) {
  if (_prismaticOwned) { _shopConfirm(btn, 'ACTIVE'); return; }  // already owned
  if (!spendStars(cost)) { _shopDenied(); return; }
  _prismaticOwned = true;
  syncShopBalance();
  updateShopButtons();
  _syncPrismaticButton();
  // Apply to the web name tag immediately
  if (typeof applyPrismaticNametag === 'function') applyPrismaticNametag();
  // Re-broadcast set_name with the prismatic flag so Unity picks it up
  if (typeof reSendSetName === 'function') reSendSetName();
  _shopConfirm(btn, '✦ ACTIVE');
}

function _syncPrismaticButton() {
  const btn  = document.getElementById('shopPrismaticBtn');
  const item = document.getElementById('shopPrismaticItem');
  if (!btn) return;
  if (_prismaticOwned) {
    btn.textContent   = '✦ ACTIVE';
    btn.disabled      = true;
    btn.style.opacity = '0.6';
    if (item) item.style.opacity = '0.7';
  }
}

// Guaranteed legendary — pierce the gacha. Next pack's top card is legendary+.
function shopBuyLegendary(cost, btn) {
  if (!spendStars(cost)) { _shopDenied(); return; }
  syncShopBalance();
  updateShopButtons();
  // Take the player to the single-card legendary reveal (they tap to claim it).
  if (typeof showLegendaryReveal === 'function') {
    showLegendaryReveal();
  } else {
    window._guaranteedLegendary = true;   // fallback to next-pull voucher
  }
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
  _syncRefreshButton();   // cooldown state must win over the affordability pass
}