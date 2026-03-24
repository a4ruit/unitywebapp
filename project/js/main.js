const WS_URL = 'wss://unitywebapp.onrender.com';

// ─── Card pool ────────────────────────────────────────────────────────────────

const CARD_POOL = {
  common: [
    { id: 'small_cube', name: 'Small Cube', rarity: 'common', rarityRank: 0, command: 'spawn_small_cube', shapeClass: 'shape-small-cube', desc: 'A modest offering. The colony will accept it.' }
  ],
  uncommon: [
    { id: 'large_cube', name: 'Large Cube', rarity: 'uncommon', rarityRank: 1, command: 'spawn_large_cube', shapeClass: 'shape-large-cube', desc: 'Substantial. Colonies may compete for this.' }
  ],
  rare: [
    { id: 'sphere', name: 'Sphere', rarity: 'rare', rarityRank: 2, command: 'spawn_sphere', shapeClass: 'shape-sphere', desc: 'Unusual geometry. Unpredictable colony response.' }
  ],
  legendary: [
    { id: 'triangle', name: 'Obelisk', rarity: 'legendary', rarityRank: 3, command: 'spawn_triangle', shapeClass: 'shape-triangle', desc: 'Ancient form. The colony will remember this.' }
  ]
};

function pick(tier) {
  const pool = CARD_POOL[tier];
  return { ...pool[Math.floor(Math.random() * pool.length)] };
}

// Roll a pack of 4 cards — rarest always last
function rollPack() {
  const cards = [];
  const hasLegendary = Math.random() < 0.1;  // 1 in 10
  const hasRare      = !hasLegendary && Math.random() < 0.2; // 1 in 5 (when no legendary)

  // Always: 1 uncommon minimum
  cards.push(pick('uncommon'));

  if (hasLegendary) {
    cards.push(pick('common'));
    cards.push(pick('common'));
    cards.push(pick('legendary'));
  } else if (hasRare) {
    cards.push(pick('common'));
    cards.push(pick('uncommon'));
    cards.push(pick('rare'));
  } else {
    cards.push(pick('common'));
    cards.push(pick('common'));
    cards.push(pick('uncommon'));
  }

  // Sort common → legendary so rarest is last (at back of stack visually = top of array)
  cards.sort((a, b) => a.rarityRank - b.rarityRank);
  return cards;
}

// ─── State ───────────────────────────────────────────────────────────────────

let ws             = null;
let reconnectTimer = null;
let packCards      = [];   // current pack, sorted common→rarest
let revealedCards  = [];   // cards already flipped
let currentIndex   = 0;    // index into packCards being shown

// Swipe state
let swipeStartX    = null;
let swipeStartY    = null;
let swipeTarget    = null; // 'pack' | 'card'
const SWIPE_THRESHOLD = 55;
const TOP_ZONE_RATIO  = 0.55; // top 55% of element triggers swipe

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
  } catch (e) {
    setStatus(false);
    reconnectTimer = setTimeout(connect, 3000);
  }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(msg); console.log('[WS] Sent:', msg); }
  else console.warn('[WS] Not connected:', msg);
}

// ─── Screen management ───────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ─── Pack stack visual ────────────────────────────────────────────────────────
// Cards peek from behind the pack, stacked and slightly rotated

function buildPackStack() {
  const stack = document.getElementById('packStack');
  stack.innerHTML = '';
  // Render back→front (rarest at back = rendered first = lowest z-index)
  // We show 3 peek cards behind the pack
  const peekRarities = ['legendary', 'rare', 'uncommon'];
  peekRarities.forEach((rarity, i) => {
    const peek = document.createElement('div');
    peek.className = `peek-card peek-${i}`;
    peek.dataset.rarity = rarity;
    stack.appendChild(peek);
  });
}

// ─── Swipe gesture (horizontal, top-zone only) ────────────────────────────────

function initSwipe(el, target, onSwipeLeft, onSwipeRight) {
  el.addEventListener('touchstart', (e) => {
    const rect  = el.getBoundingClientRect();
    const touch = e.touches[0];
    const relY  = touch.clientY - rect.top;
    if (relY > rect.height * TOP_ZONE_RATIO) return; // only top zone
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    swipeTarget = target;
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (swipeTarget !== target || swipeStartX === null) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = Math.abs(e.touches[0].clientY - swipeStartY);
    if (dy > 30) { resetSwipe(el); return; } // too vertical — let page scroll
    const clamped = Math.max(-120, Math.min(120, dx));
    el.style.transform = `translateX(${clamped * 0.7}px) rotate(${clamped * 0.04}deg)`;
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (swipeTarget !== target || swipeStartX === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY);
    resetSwipe(el);
    if (dy > 30) return;
    if (dx < -SWIPE_THRESHOLD) onSwipeLeft();
    else if (dx > SWIPE_THRESHOLD) onSwipeRight();
  }, { passive: true });

  // Mouse fallback
  let mStartX = null, mStartY = null;
  el.addEventListener('mousedown', (e) => {
    const rect = el.getBoundingClientRect();
    if (e.clientY - rect.top > rect.height * TOP_ZONE_RATIO) return;
    mStartX = e.clientX; mStartY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (mStartX === null) return;
    const dx = e.clientX - mStartX;
    const clamped = Math.max(-120, Math.min(120, dx));
    el.style.transform = `translateX(${clamped * 0.7}px) rotate(${clamped * 0.04}deg)`;
  });
  window.addEventListener('mouseup', (e) => {
    if (mStartX === null) return;
    const dx = e.clientX - mStartX;
    const dy = Math.abs(e.clientY - mStartY);
    el.style.transform = '';
    mStartX = null;
    if (dy > 30) return;
    if (dx < -SWIPE_THRESHOLD) onSwipeLeft();
    else if (dx > SWIPE_THRESHOLD) onSwipeRight();
  });
}

function resetSwipe(el) {
  el.style.transform = '';
  swipeStartX = null;
  swipeStartY = null;
  swipeTarget = null;
}

// ─── Pack open ────────────────────────────────────────────────────────────────

function initPack() {
  const packEl = document.getElementById('pack');
  buildPackStack();

  initSwipe(packEl, 'pack',
    () => triggerPackOpen('left'),
    () => triggerPackOpen('right')
  );
}

function triggerPackOpen(dir) {
  const packEl = document.getElementById('pack');
  packEl.classList.add(dir === 'left' ? 'fly-left' : 'fly-right');
  packCards    = rollPack();
  revealedCards = [];
  currentIndex  = 0;
  setTimeout(() => {
    showScreen('screen-reveal');
    buildRevealStack();
  }, 380);
}

// ─── Reveal stack ─────────────────────────────────────────────────────────────
// Cards stacked on screen, rarest at back (bottom z), commons on top
// User swipes the top card away to reveal the one beneath

function buildRevealStack() {
  const container = document.getElementById('revealStack');
  container.innerHTML = '';

  // Render rarest first (goes to back), commons last (goes to front/top)
  // packCards is sorted common→rare, so we reverse for DOM order
  [...packCards].reverse().forEach((card, i) => {
    const el = makeRevealCardEl(card, i);
    container.appendChild(el);
  });

  updateRevealHint();
  // Attach swipe to top card
  attachTopCardSwipe();
}

function makeRevealCardEl(card, stackDepth) {
  const el = document.createElement('div');
  el.className = 'rev-card';
  el.dataset.rarity = card.rarity;
  el.dataset.id     = card.id;

  // Stack offset — cards beneath are peeking
  const offset   = stackDepth * 6;
  const rotation = (stackDepth % 2 === 0 ? 1 : -1) * stackDepth * 1.5;
  el.style.cssText = `
    bottom: ${offset}px;
    transform: rotate(${rotation}deg);
    z-index: ${10 - stackDepth};
  `;

  el.innerHTML = `
    <div class="rev-card-inner">
      <div class="rev-shape-wrap"><div class="${card.shapeClass} rev-shape-el"></div></div>
      <div class="rev-card-name">${card.name}</div>
      <div class="rev-card-rarity">${card.rarity}</div>
      <div class="rev-card-desc">${card.desc}</div>
    </div>
  `;
  return el;
}

function attachTopCardSwipe() {
  const container = document.getElementById('revealStack');
  // Top card = last child (highest z-index)
  const topCard = container.lastElementChild;
  if (!topCard) return;

  initSwipe(topCard, 'card',
    () => dismissTopCard('left'),
    () => dismissTopCard('right')
  );
}

function dismissTopCard(dir) {
  const container = document.getElementById('revealStack');
  const topCard   = container.lastElementChild;
  if (!topCard) return;

  const cardId = topCard.dataset.id;
  const card   = packCards.find(c => c.id === cardId);
  if (card) revealedCards.push(card);

  topCard.classList.add(dir === 'left' ? 'dismiss-left' : 'dismiss-right');

  setTimeout(() => {
    topCard.remove();
    currentIndex++;

    const remaining = container.children.length;

    if (remaining === 0) {
      // All cards revealed — show 2x2 grid
      showChoiceGrid();
    } else {
      updateRevealHint();
      attachTopCardSwipe();
    }
  }, 350);
}

function updateRevealHint() {
  const remaining = packCards.length - revealedCards.length;
  const hint = document.getElementById('revealHint');
  const counter = document.getElementById('revealCounter');
  if (remaining === 1) {
    hint.textContent = 'swipe to reveal final card';
    counter.textContent = `${packCards.length} / ${packCards.length}`;
  } else {
    hint.textContent = 'swipe to reveal next card';
    counter.textContent = `${revealedCards.length + 1} / ${packCards.length}`;
  }
}

// ─── Choice grid ──────────────────────────────────────────────────────────────

function showChoiceGrid() {
  showScreen('screen-choose');
  const grid = document.getElementById('choiceGrid');
  grid.innerHTML = '';

  packCards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'choice-card';
    el.dataset.rarity = card.rarity;
    el.style.animationDelay = `${i * 0.08}s`;
    el.innerHTML = `
      <div class="choice-shape-wrap"><div class="${card.shapeClass} choice-shape-el"></div></div>
      <div class="choice-card-name">${card.name}</div>
      <div class="choice-card-rarity">${card.rarity}</div>
    `;
    el.addEventListener('click', () => dropCard(card));
    grid.appendChild(el);
  });
}

// ─── Drop ─────────────────────────────────────────────────────────────────────

function dropCard(card) {
  send(card.command);
  document.getElementById('droppedSub').textContent =
    `${card.name.toUpperCase()} · ${card.rarity.toUpperCase()} · ${card.desc}`;
  showScreen('screen-dropped');
}

// ─── Again ────────────────────────────────────────────────────────────────────

document.getElementById('againBtn').addEventListener('click', () => {
  const packEl = document.getElementById('pack');
  packEl.classList.remove('fly-left', 'fly-right');
  showScreen('screen-pack');
  initPack();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

connect();
initPack();