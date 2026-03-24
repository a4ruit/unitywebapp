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

function rollPack() {
  const cards = [];
  const hasLegendary = Math.random() < 0.1;
  const hasRare      = !hasLegendary && Math.random() < 0.2;

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

  // Commons first, rarest last
  cards.sort((a, b) => a.rarityRank - b.rarityRank);
  return cards;
}

// ─── State ───────────────────────────────────────────────────────────────────

let ws             = null;
let reconnectTimer = null;
let packCards      = [];
let revealIndex    = 0;

let swipeStartX = null;
let swipeStartY = null;
const SWIPE_THRESHOLD = 55;
const TOP_ZONE_RATIO  = 0.55;

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

// ─── Pack swipe ───────────────────────────────────────────────────────────────

function initPack() {
  const packEl = document.getElementById('pack');
  document.getElementById('packStack').innerHTML = '';

  packEl.addEventListener('touchstart', (e) => {
    const rect  = packEl.getBoundingClientRect();
    const touch = e.touches[0];
    if (touch.clientY - rect.top > rect.height * TOP_ZONE_RATIO) return;
    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
  }, { passive: true });

  packEl.addEventListener('touchmove', (e) => {
    if (swipeStartX === null) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = Math.abs(e.touches[0].clientY - swipeStartY);
    if (dy > 30) { resetPackSwipe(packEl); return; }
    const clamped = Math.max(-120, Math.min(120, dx));
    packEl.style.transform = `translateX(${clamped * 0.7}px) rotate(${clamped * 0.04}deg)`;
  }, { passive: true });

  packEl.addEventListener('touchend', (e) => {
    if (swipeStartX === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY);
    resetPackSwipe(packEl);
    if (dy > 30) return;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) triggerPackOpen(dx < 0 ? 'left' : 'right');
  }, { passive: true });

  let mStartX = null, mStartY = null;
  packEl.addEventListener('mousedown', (e) => {
    const rect = packEl.getBoundingClientRect();
    if (e.clientY - rect.top > rect.height * TOP_ZONE_RATIO) return;
    mStartX = e.clientX; mStartY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (mStartX === null) return;
    const dx = e.clientX - mStartX;
    const clamped = Math.max(-120, Math.min(120, dx));
    packEl.style.transform = `translateX(${clamped * 0.7}px) rotate(${clamped * 0.04}deg)`;
  });
  window.addEventListener('mouseup', (e) => {
    if (mStartX === null) return;
    const dx = e.clientX - mStartX;
    const dy = Math.abs(e.clientY - mStartY);
    packEl.style.transform = '';
    mStartX = null;
    if (dy > 30) return;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) triggerPackOpen(dx < 0 ? 'left' : 'right');
  });
}

function resetPackSwipe(packEl) {
  packEl.style.transform = '';
  swipeStartX = null;
  swipeStartY = null;
}

function triggerPackOpen(dir) {
  const packEl = document.getElementById('pack');
  packEl.classList.add(dir === 'left' ? 'fly-left' : 'fly-right');

  packCards   = rollPack();
  revealIndex = 0;

  // Build peek stack in pack screen (briefly visible as pack flies off)
  buildPeekStack('packStack');

  setTimeout(() => {
    showScreen('screen-reveal');
    // Rebuild peek stack in reveal screen — persists throughout reveal
    buildPeekStack('revealPeekStack');
    showRevealCard();
  }, 420);
}

// ─── Peek stack builder ───────────────────────────────────────────────────────
// Builds into whichever container id is passed

function buildPeekStack(containerId) {
  const stack = document.getElementById(containerId);
  stack.innerHTML = '';

  // Unique rarities in this pack, rarest first = furthest back
  const rarities = [...new Set(packCards.map(c => c.rarity))]
    .sort((a, b) => {
      const rank = { common:0, uncommon:1, rare:2, legendary:3 };
      return rank[b] - rank[a]; // descending = rarest first
    });

  rarities.forEach((rarity, i) => {
    const peek = document.createElement('div');
    peek.className = `peek-card peek-${i}`;
    peek.dataset.rarity = rarity;
    stack.appendChild(peek);
  });

  // Trigger reveal animation
  setTimeout(() => stack.classList.add("stack-reveal"), 50);
}

// ─── Reveal ───────────────────────────────────────────────────────────────────

function showRevealCard() {
  const card   = packCards[revealIndex];
  const total  = packCards.length;
  const isLast = revealIndex === total - 1;

  document.getElementById('revealCounter').textContent = `${revealIndex + 1} / ${total}`;
  document.getElementById('revealHint').textContent    = isLast ? 'tap to keep' : 'tap to reveal next';

  const revealCard = document.getElementById('revealCard');
  revealCard.dataset.rarity = card.rarity;
  revealCard.className      = 'rev-card';

  // Legendary gets the holo class
  if (card.rarity === 'legendary') revealCard.classList.add('legendary-holo');

  revealCard.innerHTML = `
    <div class="holo-layer"></div>
    <div class="rev-card-inner">
      <div class="rev-shape-wrap"><div class="${card.shapeClass} rev-shape-el"></div></div>
      <div class="rev-card-name">${card.name}</div>
      <div class="rev-card-rarity">${card.rarity}</div>
      <div class="rev-card-desc">${card.desc}</div>
    </div>
  `;

  void revealCard.offsetWidth;
  revealCard.classList.add(card.rarity === 'legendary' ? 'rev-enter-legendary' : 'rev-enter');

  // Legendary: flash the screen
  if (card.rarity === 'legendary') triggerFlash();
}

function triggerFlash() {
  const flash = document.getElementById('flashOverlay');
  flash.classList.add('flashing');
  setTimeout(() => flash.classList.remove('flashing'), 700);
}

document.getElementById('revealCard').addEventListener('click', () => {
  const isLast = revealIndex === packCards.length - 1;

  if (isLast) {
    showChoiceGrid();
    return;
  }

  const revealCard = document.getElementById('revealCard');
  revealCard.classList.remove('rev-enter', 'rev-enter-legendary');
  revealCard.classList.add('rev-exit');

  // Remove one peek card from the stack as each card is revealed
  const peekStack = document.getElementById('revealPeekStack');
  const lastPeek  = peekStack.lastElementChild;
  if (lastPeek) {
    lastPeek.classList.add('peek-dismiss');
    setTimeout(() => lastPeek.remove(), 300);
  }

  setTimeout(() => {
    revealIndex++;
    showRevealCard();
  }, 260);
});

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
  document.getElementById('packStack').innerHTML       = '';
  document.getElementById('revealPeekStack').innerHTML = '';
  showScreen('screen-pack');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

connect();
initPack();