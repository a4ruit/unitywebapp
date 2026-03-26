const WS_URL = 'wss://unitywebapp.onrender.com';

// ─── Card pool ────────────────────────────────────────────────────────────────

const CARDS = [
  { id:'small_cube', name:'Small Cube',  rarity:'common',    rarityRank:0, command:'spawn_small_cube', shapeClass:'shape-small-cube', desc:'A modest offering. The colony will accept it.' },
  { id:'large_cube', name:'Large Cube',  rarity:'uncommon',  rarityRank:1, command:'spawn_large_cube', shapeClass:'shape-large-cube', desc:'Substantial. Colonies may compete for this.' },
  { id:'sphere',     name:'Sphere',      rarity:'rare',      rarityRank:2, command:'spawn_sphere',     shapeClass:'shape-sphere',     desc:'Unusual geometry. Unpredictable colony response.' },
  { id:'triangle',   name:'Obelisk',     rarity:'legendary', rarityRank:3, command:'spawn_triangle',   shapeClass:'shape-triangle',   desc:'Ancient form. The colony will remember this.' },
];

function pick(tier) {
  return { ...CARDS.find(c => c.rarity === tier) };
}

function rollPack() {
  const cards        = [];
  const hasLegendary = Math.random() < 0.1;
  const hasRare      = !hasLegendary && Math.random() < 0.2;

  cards.push(pick('uncommon'));
  if (hasLegendary) {
    cards.push(pick('common')); cards.push(pick('common')); cards.push(pick('legendary'));
  } else if (hasRare) {
    cards.push(pick('common')); cards.push(pick('uncommon')); cards.push(pick('rare'));
  } else {
    cards.push(pick('common')); cards.push(pick('common')); cards.push(pick('uncommon'));
  }

  cards.sort((a, b) => a.rarityRank - b.rarityRank);
  return cards;
}

// ─── State ───────────────────────────────────────────────────────────────────

let ws             = null;
let reconnectTimer = null;
let packCards      = [];
let revealIndex    = 0;
let swipeStartX    = null;
let swipeStartY    = null;
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
  } catch(e) { setStatus(false); reconnectTimer = setTimeout(connect, 3000); }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
    console.log('[WS] Sent:', msg);
  } else {
    console.warn('[WS] Not connected:', msg);
  }
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

// ─── Pack swipe — wired to Pack3D ────────────────────────────────────────────

function initPack() {
  document.getElementById('packStack').innerHTML = '';

  if (typeof Pack3D === 'undefined') {
    console.error('[initPack] Pack3D not defined — pack3d.js failed to load or parse');
    return;
  }

  requestAnimationFrame(() => Pack3D.init());

  document.addEventListener('pack3d:swipe', (e) => {
    const dir = e.detail.dir < 0 ? 'left' : 'right';
    triggerPackOpen(dir);
  });
}

function resetPackSwipe() {
  // no-op — 3D handles its own reset
}

function triggerPackOpen(dir) {
  const packEl = document.getElementById('packCanvas');
  packEl.classList.add(dir === 'left' ? 'fly-left' : 'fly-right');
  send('pack_opened');
  setTickerState('active');

  packCards   = rollPack();
  revealIndex = 0;

  buildPeekStack('packStack');

  setTimeout(() => {
    showScreen('screen-reveal');
    buildPeekStack('revealPeekStack');
    showRevealCard();
  }, 420);
}

// ─── Peek stack ───────────────────────────────────────────────────────────────

function buildPeekStack(id) {
  const stack = document.getElementById(id);
  stack.innerHTML = '';
  stack.classList.remove('stack-reveal');

  const rarities = [...new Set(packCards.map(c => c.rarity))]
    .sort((a, b) => ({ common:0, uncommon:1, rare:2, legendary:3 }[b] - { common:0, uncommon:1, rare:2, legendary:3 }[a]));

  rarities.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = `peek-card peek-${i}`;
    el.dataset.rarity = r;
    stack.appendChild(el);
  });

  setTimeout(() => stack.classList.add('stack-reveal'), 50);
}

// ─── Reveal ───────────────────────────────────────────────────────────────────

function showRevealCard() {
  const card   = packCards[revealIndex];
  const isLast = revealIndex === packCards.length - 1;

  document.getElementById('revealCounter').textContent = `${revealIndex + 1} / ${packCards.length}`;
  document.getElementById('revealHint').textContent    = isLast ? 'tap to keep' : 'tap to reveal next';

  const el = document.getElementById('revealCard');
  el.dataset.rarity = card.rarity;
  el.className = 'rev-card';
  if (card.rarity === 'legendary') el.classList.add('legendary-holo');

  el.innerHTML = `
    <div class="holo-layer"></div>
    <div class="rev-card-inner">
      <div class="rev-shape-wrap"><div class="${card.shapeClass} rev-shape-el"></div></div>
      <div class="rev-card-name">${card.name}</div>
      <div class="rev-card-rarity">${card.rarity}</div>
      <div class="rev-card-desc">${card.desc}</div>
    </div>
  `;

  void el.offsetWidth;
  el.classList.add(card.rarity === 'legendary' ? 'rev-enter-legendary' : 'rev-enter');
  if (card.rarity === 'legendary') { triggerFlash(); setTickerState('legendary'); }
}

function triggerFlash() {
  const f = document.getElementById('flashOverlay');
  f.classList.add('flashing');
  setTimeout(() => f.classList.remove('flashing'), 700);
}

document.getElementById('revealCard').addEventListener('click', () => {
  const isLast = revealIndex === packCards.length - 1;
  if (isLast) { showChoiceGrid(); return; }

  const el = document.getElementById('revealCard');
  el.classList.remove('rev-enter', 'rev-enter-legendary');
  el.classList.add('rev-exit');

  const stack   = document.getElementById('revealPeekStack');
  const lastPeek = stack.lastElementChild;
  if (lastPeek) { lastPeek.classList.add('peek-dismiss'); setTimeout(() => lastPeek.remove(), 300); }

  setTimeout(() => { revealIndex++; showRevealCard(); }, 260);
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
    el.style.animationDelay = `${i*0.08}s`;
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
  document.getElementById('packCanvas').classList.remove('fly-left', 'fly-right');
  document.getElementById('packStack').innerHTML       = '';
  document.getElementById('revealPeekStack').innerHTML = '';
  showScreen('screen-pack');
  setTickerState('idle');
});

// ─── Debug controls ───────────────────────────────────────────────────────────

const debugLog = document.getElementById('debugLog');

function addLogEntry(command, rarity) {
  const empty = debugLog.querySelector('.debug-log-empty');
  if (empty) empty.remove();

  const now   = new Date();
  const time  = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;

  const entry = document.createElement('div');
  entry.className = 'debug-log-entry';
  entry.dataset.rarity = rarity;
  entry.innerHTML = `<span class="log-time">${time}</span>${command}`;

  debugLog.insertBefore(entry, debugLog.firstChild);

  // Keep max 12 entries
  while (debugLog.children.length > 12) debugLog.removeChild(debugLog.lastChild);
}

document.querySelectorAll('.debug-card').forEach(card => {
  card.addEventListener('click', () => {
    const command = card.dataset.command;
    const rarity  = card.dataset.rarity;

    send(command);
    addLogEntry(command, rarity);

    card.classList.remove('spawned');
    void card.offsetWidth;
    card.classList.add('spawned');
  });
});

// ─── Ticker ───────────────────────────────────────────────────────────────────

const TICKER_MESSAGES = {
  idle: [
    'Colony feeding in progress',
    'Awaiting resource drop',
    'Ant activity nominal',
    'Open a pack to begin',
    'Resources sustain the colony',
    'What will you offer?',
  ],
  active: [
    'Pack opened — resources incoming',
    'Colony on alert',
    'Scanning card contents',
    'Choose wisely — the ants are watching',
    'Resource acquisition sequence initiated',
  ],
  legendary: [
    '⬛ LEGENDARY RESOURCE DETECTED ⬛',
    'Colony behavior unpredictable',
    'Ancient form recognised',
    'The ants will remember this',
    '⬛ RARE EVENT LOGGED ⬛',
  ],
};

function buildTickerHTML(messages) {
  // Double the messages so the seamless loop works (CSS animates -50%)
  const all = [...messages, ...messages];
  return all.map(msg =>
    `<span class="ticker-msg">${msg}</span><span class="ticker-sep">◈</span>`
  ).join('');
}

function setTickerState(state) {
  const track = document.getElementById('tickerTrack');
  const messages = TICKER_MESSAGES[state] || TICKER_MESSAGES.idle;

  // Swap content
  track.innerHTML = buildTickerHTML(messages);

  // Reset animation so it doesn't jump
  track.style.animation = 'none';
  void track.offsetWidth; // force reflow
  track.style.animation = '';

  // Colour shift for legendary
  const wrap = track.closest('.ticker-wrap');
  wrap.dataset.state = state;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

connect();
initPack();