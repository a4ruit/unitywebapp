const WS_URL = 'wss://unitywebapp.onrender.com';

// ─── Card pool ────────────────────────────────────────────────────────────────

// ─── FLESH pack ───────────────────────────────────────────────────────────────
const GARBAGE_CARDS = [
  { id:'small_cube', name:'Unidentified Tissue', rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Origin unclear. The environment has accepted it.' },
  { id:'large_cube', name:'Pale Growth',         rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'Found attached to nothing. Still warm.' },
  { id:'sphere',     name:'Wet Membrane',        rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Permeable. Spreading.' },
  { id:'triangle',   name:'Bone Fragment',       rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Dense. Old. Pre-dates the colony.' },
  { id:'octagon',    name:'Unnamed Organ',       rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'It has a function. You do not want to know what it is.' },
  { id:'triad',      name:'Spore Cluster',       rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Three. Always three. Already airborne.' },
  { id:'star',       name:'The Flesh',           rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It was here before you. It will be here after.' },
];

// ─── E-WASTE pack ──────────────────────────────────────────────────────────────
const EWASTE_CARDS = [
  { id:'small_cube', name:'Tangled Cable',   rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'USB-A. Obsolete. Non-recyclable.' },
  { id:'large_cube', name:'Dead Battery',    rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'Lithium. Do not puncture. Do not discard.' },
  { id:'sphere',     name:'Cracked Screen',  rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Glass and indium. Separation cost: infinite.' },
  { id:'triangle',   name:'Old iPod',        rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'1000 songs. 0 second-lives. Still here.' },
  { id:'octagon',    name:'Laptop Shell',    rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'Magnesium alloy. The guts are somewhere else.' },
  { id:'triad',      name:'Circuit Board',   rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Lead solder. Gold traces. Worth nothing now.' },
  { id:'star',       name:'RAM Stick',       rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'32GB DDR5. Rare earth metals. Permanent.' },
];

// ─── AD PACK cards ────────────────────────────────────────────────────────────
const ADPACK_CARDS = [
  { id:'small_cube', name:'Flyer',              rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Already on the ground before you noticed.' },
  { id:'large_cube', name:'Pop-Up Ad',          rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'Appeared without warning. Cannot be closed.' },
  { id:'sphere',     name:'Digital Billboard',  rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Never turns off. Never looks away.' },
  { id:'triangle',   name:'Loyalty Card',       rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'You signed up for this.' },
  { id:'octagon',    name:'Sponsored Content',  rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'You cannot tell the difference anymore.' },
  { id:'triad',      name:'Terms & Conditions', rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'94 pages. Updated weekly. You agreed.' },
  { id:'star',       name:'Data Centre',        rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'The water remembers.' },
];

// ─── Active pack type ──────────────────────────────────────────────────────────
let activePackType = 'garbage';
let CARDS = GARBAGE_CARDS;
const PACK_TYPE_ORDER = ['garbage', 'ewaste', 'adpack'];
let isPackTypeSwitching = false;

function updatePackCarousel(type) {
  const packs = Array.from(document.querySelectorAll('#packCarouselBg .carousel-pack'));
  if (!packs.length) return;

  const currentIdx = PACK_TYPE_ORDER.indexOf(type);
  packs.forEach((el) => {
    const packType = el.dataset.pack;
    const idx = PACK_TYPE_ORDER.indexOf(packType);
    const rel = (idx - currentIdx + PACK_TYPE_ORDER.length) % PACK_TYPE_ORDER.length;

    el.classList.remove('carousel-left', 'carousel-center', 'carousel-right');
    if (rel === 0) el.classList.add('carousel-center');
    else if (rel === 1) el.classList.add('carousel-right');
    else el.classList.add('carousel-left');
  });
}

function animatePackTypeSwitch(fromType, toType) {
  const wrap = document.getElementById('packCanvas');
  if (!wrap || fromType === toType) {
    Pack3D.setPackTheme(toType);
    Pack3D.resetPack();
    isPackTypeSwitching = false;
    return;
  }

  const prevIdx = PACK_TYPE_ORDER.indexOf(fromType);
  const nextIdx = PACK_TYPE_ORDER.indexOf(toType);
  const delta = (nextIdx - prevIdx + PACK_TYPE_ORDER.length) % PACK_TYPE_ORDER.length;
  const movingRight = delta === 1;
  const outClass = delta === 1 ? 'pack-swap-out-right' : 'pack-swap-out-left';
  const inClass  = delta === 1 ? 'pack-swap-in-right'  : 'pack-swap-in-left';
  const stage = document.getElementById('packCarouselStage');

  wrap.classList.remove('pack-swap-out-left', 'pack-swap-out-right', 'pack-swap-in-left', 'pack-swap-in-right');
  void wrap.offsetWidth;
  if (stage) {
    stage.classList.remove('carousel-arc-left', 'carousel-arc-right');
    void stage.offsetWidth;
    stage.classList.add(movingRight ? 'carousel-arc-right' : 'carousel-arc-left');
    setTimeout(() => stage.classList.remove('carousel-arc-left', 'carousel-arc-right'), 480);
  }
  wrap.classList.add(outClass);

  setTimeout(() => {
    Pack3D.setPackTheme(toType);
    Pack3D.resetPack();
    wrap.classList.remove(outClass);
    wrap.classList.add(inClass);
    setTimeout(() => {
      wrap.classList.remove(inClass);
      isPackTypeSwitching = false;
    }, 360);
  }, 220);
}

function setPackType(type) {
  if (type === activePackType || isPackTypeSwitching) return;
  isPackTypeSwitching = true;
  const prevType = activePackType;
  activePackType = type;
  window.activePackType = type;
  if (type === 'adpack') {
    CARDS = ADPACK_CARDS;
  } else if (type === 'ewaste') {
    CARDS = EWASTE_CARDS;
  } else {
    CARDS = GARBAGE_CARDS;
  }
  document.getElementById('packTypeGarbage')?.classList.toggle('active', type === 'garbage');
  document.getElementById('packTypeEwaste')?.classList.toggle('active',  type === 'ewaste');
  document.getElementById('packTypeAdpack')?.classList.toggle('active',  type === 'adpack');
  updatePackCarousel(type);
  animatePackTypeSwitch(prevType, type);
  // Toggle adpack glow on screen-pack
  const sp = document.getElementById('screen-pack');
  if (sp) sp.classList.toggle('adpack-active', type === 'adpack');
  const stage = document.getElementById('packCarouselStage');
  if (stage) {
    stage.classList.remove('adpack-shimmer-burst');
    if (type === 'adpack') {
      void stage.offsetWidth;
      stage.classList.add('adpack-shimmer-burst');
    }
  }
  showScreen('screen-pack');
  setTickerState('idle');
}

function pick(tier) { return { ...CARDS.find(c => c.rarity === tier) }; }

let isGodPack = false;

function rollPack() {
  const cards = [];

  if (Math.random() < 0.0333) {
    isGodPack = true;
    cards.push(pick('mythical'));
    cards.push(pick('luck-maxxing'));
    cards.push(pick('legendary-alpha'));
    cards.push(pick('legendary-alpha'));
    cards.sort((a, b) => a.rarityRank - b.rarityRank);
    return cards;
  }

  isGodPack = false;
  const roll = Math.random();
  let topCard;
  if      (roll < 0.04)  topCard = pick('legendary-alpha');
  else if (roll < 0.09)  topCard = pick('luck-maxxing');
  else if (roll < 0.157) topCard = pick('mythical');
  else if (roll < 0.257) topCard = pick('legendary');
  else if (roll < 0.457) topCard = pick('rare');
  else                   topCard = pick('uncommon');

  cards.push(pick('common'));
  cards.push(pick('common'));
  cards.push(pick('uncommon'));
  cards.push(topCard);
  cards.sort((a, b) => a.rarityRank - b.rarityRank);
  return cards;
}

// ─── State ───────────────────────────────────────────────────────────────────

let ws             = null;
let reconnectTimer = null;
let packCards      = [];
let revealIndex    = 0;
let godPackClaimed = [];

// ─── WebSocket ────────────────────────────────────────────────────────────────

const dot   = document.getElementById('wsDot');
const label = document.getElementById('wsLabel');

function setStatus(connected) {
  dot.classList.toggle('live', connected);
  label.textContent = connected ? 'live' : 'offline';
}

function connect() {
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => { setStatus(true); ws.send('web_client'); clearTimeout(reconnectTimer); };
    ws.onclose = () => { setStatus(false); reconnectTimer = setTimeout(connect, 3000); };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => console.log('[WS]', e.data);
  } catch(e) { setStatus(false); reconnectTimer = setTimeout(connect, 3000); }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg); console.log('[WS] Sent:', msg);
  } else {
    console.warn('[WS] Not connected:', msg);
  }
}

// ─── Ticker ───────────────────────────────────────────────────────────────────

const TICKER_MESSAGES = {
  idle: [
    'Awaiting next deposit',
    'The environment is watching',
    'Open a pack to contribute',
    'What will you leave behind?',
    'Every pack pollutes',
    'Nothing is free. Nothing decomposes.',
  ],
  active: [
    'Pack opened — waste incoming',
    'Environmental load increasing',
    'Scanning contents',
    'Choose wisely — it stays forever',
    'Contribution logged',
  ],
  adpack: [
    '◈ AD PACK DETECTED ◈',
    'Sponsored content incoming',
    'The environment is now ad-supported',
    'Your attention has been allocated',
    '◈ PREMIUM POLLUTION ◈',
    'Terms and conditions apply',
  ],
  legendary: [
    '⬛ HIGH-IMPACT WASTE DETECTED ⬛',
    'Shatter radius: significant',
    'The environment will remember this',
    'Decomposition time: unknown',
    '⬛ RARE POLLUTANT LOGGED ⬛',
  ],
  godpack: [
    '★ LANDFILL EVENT DETECTED ★',
    'Full dump in progress',
    'The environment has never seen this',
    '★ MAXIMUM IMPACT ★',
    'Capacity exceeded',
    'You did this.',
  ],
};

function buildTickerHTML(messages) {
  const all = [...messages, ...messages];
  return all.map(msg =>
    `<span class="ticker-msg">${msg}</span><span class="ticker-sep">◈</span>`
  ).join('');
}

function setTickerState(state) {
  const track    = document.getElementById('tickerTrack');
  if (!track) return;
  const messages = TICKER_MESSAGES[state] || TICKER_MESSAGES.idle;
  track.innerHTML = buildTickerHTML(messages);
  track.style.animation = 'none';
  void track.offsetWidth;
  track.style.animation = '';
  const wrap = track.closest('.ticker-wrap');
  if (wrap) wrap.dataset.state = state;
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`page-${btn.dataset.page}`).classList.remove('hidden');
  });
});

// ─── Screen management ───────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ─── Pack swipe ───────────────────────────────────────────────────────────────

function initPack() {
  document.getElementById('packStack').innerHTML = '';
  if (typeof Pack3D === 'undefined') { console.error('[initPack] Pack3D not defined'); return; }
  // Wait for fonts (Adobe Fonts/Typekit loads async — canvas falls back without this)
  document.fonts.ready.then(() => requestAnimationFrame(() => Pack3D.init()));

  // Swipe to open
  document.addEventListener('pack3d:swipe', (e) => {
    triggerPackOpen(e.detail.dir < 0 ? 'left' : 'right');
  });

  // Click/tap the pack canvas to open
  const packCanvas = document.getElementById('packCanvas');
  if (packCanvas) {
    packCanvas.addEventListener('click', () => triggerPackOpen('right'));
  }
}

let _pendingPackDir = 'right';

function triggerPackOpen(dir) {
  if (activePackType === 'adpack') {
    _pendingPackDir = dir;
    showAdpackPrompt();
    return;
  }
  if (!consumePack()) return;
  doPackOpen(dir);
}

function showAdpackPrompt() {
  // Update skip button affordability
  const skipBtn = document.getElementById('adpackSkipBtn');
  if (skipBtn) {
    const canAfford = stars >= STARS_SKIP_AD;
    skipBtn.style.opacity = canAfford ? '1' : '0.35';
    const sub = skipBtn.querySelector('.adpack-prompt-btn-sub');
    if (sub) sub.textContent = canAfford ? 'skip ad · open pack' : `need 10 ★ · you have ${stars}`;
  }
  showScreen('screen-adpack-prompt');
}

function adpackConfirmWatch() {
  showAd({
    onComplete: () => {
      addStars(STARS_PER_AD);
      doPackOpen(_pendingPackDir);
    },
    onSkip: () => {
      doPackOpen(_pendingPackDir);
    }
  });
}

function adpackConfirmSkip() {
  if (stars < STARS_SKIP_AD) return;
  spendStars(STARS_SKIP_AD);
  doPackOpen(_pendingPackDir);
}

function adpackCancel() {
  showScreen('screen-pack');
}

function doPackOpen(dir) {
  send('pack_opened');
  BloodDrip.onPackOpened();

  packCards      = rollPack();
  revealIndex    = 0;
  godPackClaimed = [];

  const isAdpack = activePackType === 'adpack';
  setTickerState(isGodPack ? 'godpack' : isAdpack ? 'adpack' : 'active');

  // Flash for high rarity pulls
  const topCard = packCards[packCards.length - 1];
  const isHighRarity = ['legendary','mythical','luck-maxxing','legendary-alpha'].includes(topCard?.rarity);
  if (isHighRarity) triggerFlash();

  Pack3D.throwPack(dir === 'left' ? -1 : 1, () => {
    if (isGodPack) triggerGodPackFlash();
    setTimeout(() => {
      // Skip reveal — go straight to choice grid (suspension is in the face-down hold)
      isGodPack ? showGodPackClaimGrid() : showChoiceGrid();
    }, isGodPack ? 900 : 120);
  });
}

// ─── God-pack flash ───────────────────────────────────────────────────────────

function triggerGodPackFlash() {
  const f = document.getElementById('flashOverlay');
  let count = 0;
  const iv = setInterval(() => {
    f.classList.add('flashing');
    setTimeout(() => f.classList.remove('flashing'), 280);
    if (++count >= 3) clearInterval(iv);
  }, 320);

  const banner = document.getElementById('godPackBanner');
  if (banner) {
    banner.classList.remove('hidden');
    setTimeout(() => banner.classList.add('hidden'), 2000);
  }
}

// ─── Peek stack ───────────────────────────────────────────────────────────────

const RARITY_RANK_MAP = { common:0, uncommon:1, rare:2, legendary:3, mythical:4, 'luck-maxxing':5, 'legendary-alpha':6 };

function buildPeekStack(id) {
  const stack = document.getElementById(id);
  stack.innerHTML = '';
  stack.classList.remove('stack-reveal');
  const rarities = [...new Set(packCards.map(c => c.rarity))]
    .sort((a, b) => (RARITY_RANK_MAP[b] ?? 0) - (RARITY_RANK_MAP[a] ?? 0));
  rarities.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = `peek-card peek-${i}`;
    el.dataset.rarity = r;
    stack.appendChild(el);
  });
  setTimeout(() => stack.classList.add('stack-reveal'), 50);
}

function triggerFlash() {
  const f = document.getElementById('flashOverlay');
  f.classList.add('flashing');
  setTimeout(() => f.classList.remove('flashing'), 700);
}

// ─── Normal choice grid ───────────────────────────────────────────────────────

function showChoiceGrid() {
  Cards3D.destroy();
  const el = document.getElementById('revealCard');
  if (el) { el.innerHTML = ''; el.style.opacity = ''; }
  showScreen('screen-choose');
  const ct = document.querySelector('.choose-title');
  const cs = document.querySelector('.choose-sub');
  if (ct) ct.textContent = activePackType === 'adpack' ? 'CHOOSE YOUR AD' : 'CHOOSE YOUR WASTE';
  if (cs) cs.textContent = activePackType === 'adpack' ? 'pollution is the point' : 'one drop per pack';
  ChoiceGrid3D.show(packCards, 'choiceGrid', (chosenCard) => {
    setTimeout(() => dropCard(chosenCard), 400);
  });
}

// ─── God-pack claim grid ──────────────────────────────────────────────────────

function showGodPackClaimGrid() {
  Cards3D.destroy();
  const el = document.getElementById('revealCard');
  if (el) { el.innerHTML = ''; el.style.opacity = ''; }
  showScreen('screen-choose');
  const ct = document.querySelector('.choose-title');
  const cs = document.querySelector('.choose-sub');
  if (ct) ct.textContent = 'FULL DUMP';
  if (cs) cs.textContent = `drop all ${packCards.length} — tap each to release`;

  ChoiceGrid3D.showGodPack(packCards, 'choiceGrid', (claimedCard) => {
    send(claimedCard.command);
    godPackClaimed.push(claimedCard);
    if (godPackClaimed.length === packCards.length) {
      setTimeout(showGodPackComplete, 600);
    }
  });
}

function showGodPackComplete() {
  ChoiceGrid3D.destroy();
  // Skip dropped screen — immediately reset for next pack
  resetToPackScreen();
}

// ─── Normal drop ──────────────────────────────────────────────────────────────

function dropCard(card) {
  send(card.command);
  // Skip dropped screen — immediately reset for next pack
  resetToPackScreen();
}

// ─── Again ────────────────────────────────────────────────────────────────────

// ─── Reset to pack screen ────────────────────────────────────────────────────

function resetToPackScreen() {
  document.getElementById('packStack').innerHTML = '';
  isGodPack      = false;
  godPackClaimed = [];
  Cards3D.destroy();
  ChoiceGrid3D.destroy();
  Pack3D.resetPack();
  showScreen('screen-pack');
  setTickerState('idle');
}

// ─── Debug controls ───────────────────────────────────────────────────────────

// debug panel removed

// ─── Init ─────────────────────────────────────────────────────────────────────

window.activePackType = 'garbage'; // default for cardTextures.js
connect();
initPack();
updatePackCarousel(activePackType);
setTickerState('idle');
initCounter();