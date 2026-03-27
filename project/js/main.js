const WS_URL = 'wss://unitywebapp.onrender.com';

// ─── Card pool ────────────────────────────────────────────────────────────────

const CARDS = [
  { id:'small_cube',  name:'Small Cube', rarity:'common',          rarityRank:0, command:'spawn_small_cube', shapeClass:'shape-small-cube', desc:'A modest offering. The colony will accept it.' },
  { id:'large_cube',  name:'Large Cube', rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', shapeClass:'shape-large-cube', desc:'Substantial. Colonies may compete for this.' },
  { id:'sphere',      name:'Sphere',     rarity:'rare',            rarityRank:2, command:'spawn_sphere',     shapeClass:'shape-sphere',     desc:'Unusual geometry. Unpredictable colony response.' },
  { id:'triangle',    name:'Obelisk',    rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   shapeClass:'shape-triangle',   desc:'Ancient form. The colony will remember this.' },
  { id:'octagon',     name:'Octagon',    rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    shapeClass:'shape-octagon',    desc:'Eight sides. The colony trembles.' },
  { id:'triad',       name:'Triad',      rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      shapeClass:'shape-triad',      desc:'Three points of contact. Fortune intervenes.' },
  { id:'star',        name:'Star',       rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       shapeClass:'shape-star',       desc:'It should not exist. Yet here it is.' },
];

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
    'Colony behaviour unpredictable',
    'Ancient form recognised',
    'The ants will remember this',
    '⬛ RARE EVENT LOGGED ⬛',
  ],
  godpack: [
    '★ GOD-PACK DETECTED ★',
    'All resources claimed by the colony',
    'The ants have never seen this',
    '★ FOUR RELICS — ALL YOURS ★',
    'Colony capacity exceeded',
    'This should not be possible',
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
  const messages = TICKER_MESSAGES[state] || TICKER_MESSAGES.idle;
  track.innerHTML = buildTickerHTML(messages);
  track.style.animation = 'none';
  void track.offsetWidth;
  track.style.animation = '';
  const wrap = track.closest('.ticker-wrap');
  wrap.dataset.state = state;
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
  requestAnimationFrame(() => Pack3D.init());
  document.addEventListener('pack3d:swipe', (e) => {
    triggerPackOpen(e.detail.dir < 0 ? 'left' : 'right');
  });
}

function triggerPackOpen(dir) {
  if (!consumePack()) return;
  send('pack_opened');

  packCards      = rollPack();
  revealIndex    = 0;
  godPackClaimed = [];

  setTickerState(isGodPack ? 'godpack' : 'active');
  buildPeekStack('packStack');

  Pack3D.throwPack(dir === 'left' ? -1 : 1, () => {
    if (isGodPack) triggerGodPackFlash();
    setTimeout(() => {
      showScreen('screen-reveal');
      buildPeekStack('revealPeekStack');
      showRevealCard();
    }, isGodPack ? 900 : 80);
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

// ─── Reveal ───────────────────────────────────────────────────────────────────

function showRevealCard() {
  const card   = packCards[revealIndex];
  const isLast = revealIndex === packCards.length - 1;

  document.getElementById('revealCounter').textContent = `${revealIndex + 1} / ${packCards.length}`;
  document.getElementById('revealHint').textContent    = isLast
    ? (isGodPack ? 'swipe to claim all' : 'swipe to keep')
    : 'swipe to reveal next';
  document.getElementById('revealHint').style.opacity = '0';

  const isUltraRare = ['legendary','mythical','luck-maxxing','legendary-alpha'].includes(card.rarity);
  if (isUltraRare) {
    triggerFlash();
    setTickerState(isGodPack ? 'godpack' : 'legendary');
  }

  Cards3D.showCard(card, 'revealCard', () => {
    document.getElementById('revealHint').style.opacity = '';
  });

  const el = document.getElementById('revealCard');
  el.dataset.rarity = card.rarity;
  el.style.opacity  = '1';
}

function triggerFlash() {
  const f = document.getElementById('flashOverlay');
  f.classList.add('flashing');
  setTimeout(() => f.classList.remove('flashing'), 700);
}

// ─── Swipe to advance ─────────────────────────────────────────────────────────

let revealSwipeStartX = null;
let revealSwipeStartY = null;
const REVEAL_SWIPE_THRESHOLD = 45;
const revealEl = document.getElementById('revealCard');

function advanceReveal() {
  const isLast = revealIndex === packCards.length - 1;
  if (isLast) {
    isGodPack ? showGodPackClaimGrid() : showChoiceGrid();
    return;
  }
  const stack    = document.getElementById('revealPeekStack');
  const lastPeek = stack.lastElementChild;
  if (lastPeek) { lastPeek.classList.add('peek-dismiss'); setTimeout(() => lastPeek.remove(), 300); }
  revealIndex++;
  showRevealCard();
}

revealEl.addEventListener('touchstart', (e) => {
  revealSwipeStartX = e.touches[0].clientX;
  revealSwipeStartY = e.touches[0].clientY;
}, { passive: true });

revealEl.addEventListener('touchend', (e) => {
  if (revealSwipeStartX === null) return;
  const dx = e.changedTouches[0].clientX - revealSwipeStartX;
  const dy = e.changedTouches[0].clientY - revealSwipeStartY;
  revealSwipeStartX = null; revealSwipeStartY = null;
  if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > REVEAL_SWIPE_THRESHOLD) advanceReveal();
}, { passive: true });

revealEl.addEventListener('mousedown', (e) => { revealSwipeStartX = e.clientX; revealSwipeStartY = e.clientY; });
revealEl.addEventListener('mouseup', (e) => {
  if (revealSwipeStartX === null) return;
  const dx = e.clientX - revealSwipeStartX;
  const dy = e.clientY - revealSwipeStartY;
  revealSwipeStartX = null; revealSwipeStartY = null;
  if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > REVEAL_SWIPE_THRESHOLD) advanceReveal();
});

// ─── Normal choice grid ───────────────────────────────────────────────────────

function showChoiceGrid() {
  Cards3D.destroy();
  const el = document.getElementById('revealCard');
  el.innerHTML = ''; el.style.opacity = '';
  showScreen('screen-choose');
  document.querySelector('.choose-title').textContent = 'CHOOSE A RESOURCE';
  document.querySelector('.choose-sub').textContent   = 'feed your colony';
  ChoiceGrid3D.show(packCards, 'choiceGrid', (chosenCard) => {
    setTimeout(() => dropCard(chosenCard), 400);
  });
}

// ─── God-pack claim grid ──────────────────────────────────────────────────────

function showGodPackClaimGrid() {
  Cards3D.destroy();
  const el = document.getElementById('revealCard');
  el.innerHTML = ''; el.style.opacity = '';
  showScreen('screen-choose');
  document.querySelector('.choose-title').textContent = 'GOD-PACK';
  document.querySelector('.choose-sub').textContent   = `claim all ${packCards.length} — tap each to keep`;

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
  const names = godPackClaimed.map(c => c.name.toUpperCase()).join(' · ');
  document.getElementById('droppedSub').textContent  = names;
  document.getElementById('droppedText').textContent = 'GOD-PACK CLAIMED';
  document.getElementById('droppedIcon').textContent = '★';
  showScreen('screen-dropped');
  setTickerState('godpack');
}

// ─── Normal drop ──────────────────────────────────────────────────────────────

function dropCard(card) {
  send(card.command);
  document.getElementById('droppedSub').textContent  = `${card.name.toUpperCase()} · ${card.rarity.toUpperCase()} · ${card.desc}`;
  document.getElementById('droppedText').textContent = 'RESOURCE DROPPED';
  document.getElementById('droppedIcon').textContent = '⬇';
  showScreen('screen-dropped');
}

// ─── Again ────────────────────────────────────────────────────────────────────

document.getElementById('againBtn').addEventListener('click', () => {
  document.getElementById('packStack').innerHTML       = '';
  document.getElementById('revealPeekStack').innerHTML = '';
  isGodPack      = false;
  godPackClaimed = [];
  Pack3D.resetPack();
  showScreen('screen-pack');
  setTickerState('idle');
});

// ─── Debug controls ───────────────────────────────────────────────────────────

const debugLog = document.getElementById('debugLog');

function addLogEntry(command, rarity) {
  const empty = debugLog.querySelector('.debug-log-empty');
  if (empty) empty.remove();
  const now  = new Date();
  const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  const entry = document.createElement('div');
  entry.className = 'debug-log-entry';
  entry.dataset.rarity = rarity;
  entry.innerHTML = `<span class="log-time">${time}</span>${command}`;
  debugLog.insertBefore(entry, debugLog.firstChild);
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

// ─── Init ─────────────────────────────────────────────────────────────────────

connect();
initPack();
setTickerState('idle');
initCounter();