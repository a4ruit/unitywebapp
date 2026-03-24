const WS_URL = 'wss://unitywebapp.onrender.com';

// ─── Card definitions — ordered common → legendary (rarest last) ─────────────

const CARDS = [
  {
    id:         'small_cube',
    name:       'Small Cube',
    rarity:     'common',
    rarityRank: 0,
    command:    'spawn_small_cube',
    shapeClass: 'shape-small-cube',
    desc:       'A modest offering. The colony will accept it.'
  },
  {
    id:         'large_cube',
    name:       'Large Cube',
    rarity:     'uncommon',
    rarityRank: 1,
    command:    'spawn_large_cube',
    shapeClass: 'shape-large-cube',
    desc:       'Substantial. Colonies may compete for this.'
  },
  {
    id:         'sphere',
    name:       'Sphere',
    rarity:     'rare',
    rarityRank: 2,
    command:    'spawn_sphere',
    shapeClass: 'shape-sphere',
    desc:       'Unusual geometry. Unpredictable colony response.'
  },
  {
    id:         'triangle',
    name:       'Obelisk',
    rarity:     'legendary',
    rarityRank: 3,
    command:    'spawn_triangle',
    shapeClass: 'shape-triangle',
    desc:       'Ancient form. The colony will remember this.'
  }
];

// ─── State ───────────────────────────────────────────────────────────────────

let ws            = null;
let reconnectTimer = null;
let revealQueue   = [];   // cards in reveal order (common first)
let revealIndex   = 0;    // which card we're currently showing
let chosenCard    = null; // the card the user tapped

let touchStartY = null;
let touchStartX = null;
const SWIPE_THRESHOLD = 60;

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
    ws.onopen = () => {
      setStatus(true);
      ws.send('web_client');
      clearTimeout(reconnectTimer);
    };
    ws.onclose = () => {
      setStatus(false);
      reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => console.log('[WS] From server:', e.data);
  } catch (e) {
    setStatus(false);
    reconnectTimer = setTimeout(connect, 3000);
  }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
    console.log('[WS] Sent:', msg);
  } else {
    console.warn('[WS] Not connected:', msg);
  }
}

// ─── Screen management ───────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ─── Swipe to open ───────────────────────────────────────────────────────────

const pack      = document.getElementById('pack');
const swipeHint = document.getElementById('swipeHint');

pack.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
}, { passive: true });

pack.addEventListener('touchmove', (e) => {
  if (touchStartY === null) return;
  const deltaY = touchStartY - e.touches[0].clientY;
  const deltaX = Math.abs(touchStartX - e.touches[0].clientX);
  if (deltaX > 40) return;
  const clamped = Math.min(Math.max(deltaY, 0), SWIPE_THRESHOLD * 1.5);
  pack.style.transform = `translateY(-${clamped * 0.6}px) scale(${1 - clamped * 0.001})`;
  if (swipeHint) swipeHint.style.opacity = 1 - (clamped / SWIPE_THRESHOLD);
}, { passive: true });

pack.addEventListener('touchend', (e) => {
  if (touchStartY === null) return;
  const deltaY = touchStartY - e.changedTouches[0].clientY;
  const deltaX = Math.abs(touchStartX - e.changedTouches[0].clientX);
  pack.style.transform = '';
  if (deltaY >= SWIPE_THRESHOLD && deltaX < 40) {
    openPack();
  } else {
    if (swipeHint) swipeHint.style.opacity = 1;
  }
  touchStartY = null;
  touchStartX = null;
}, { passive: true });

// Mouse fallback
let mouseStartY = null;
pack.addEventListener('mousedown', (e) => { mouseStartY = e.clientY; });
window.addEventListener('mouseup', (e) => {
  if (mouseStartY === null) return;
  const deltaY = mouseStartY - e.clientY;
  pack.style.transform = '';
  if (deltaY >= SWIPE_THRESHOLD) openPack();
  mouseStartY = null;
});
window.addEventListener('mousemove', (e) => {
  if (mouseStartY === null) return;
  const clamped = Math.min(Math.max(mouseStartY - e.clientY, 0), SWIPE_THRESHOLD * 1.5);
  pack.style.transform = `translateY(-${clamped * 0.6}px)`;
  if (swipeHint) swipeHint.style.opacity = 1 - (clamped / SWIPE_THRESHOLD);
});

function openPack() {
  pack.classList.add('opening');
  setTimeout(() => {
    startReveal();
  }, 500);
}

// ─── Reveal sequence ──────────────────────────────────────────────────────────
// Sort cards so rarest is last — user sees common → uncommon → rare → legendary

function startReveal() {
  // Sort ascending by rarityRank so legendary is revealed last
  revealQueue = [...CARDS].sort((a, b) => a.rarityRank - b.rarityRank);
  revealIndex = 0;
  chosenCard  = null;
  showScreen('screen-reveal');
  showRevealCard(revealIndex);
}

function showRevealCard(index) {
  const card = revealQueue[index];
  const total = revealQueue.length;

  const revealCard    = document.getElementById('revealCard');
  const revealCounter = document.getElementById('revealCounter');
  const revealTap     = document.getElementById('revealTap');

  // Counter — e.g. "2 / 4"
  revealCounter.textContent = `${index + 1} / ${total}`;

  // Is this the last card?
  const isLast = index === total - 1;
  revealTap.textContent = isLast ? 'tap to choose this one' : 'tap to continue';

  // Build card face
  revealCard.className = 'reveal-card';
  revealCard.dataset.rarity = card.rarity;
  revealCard.innerHTML = `
    <div class="reveal-card-inner">
      <div class="reveal-shape-wrap">
        <div class="${card.shapeClass} reveal-shape-el"></div>
      </div>
      <div class="reveal-card-name">${card.name}</div>
      <div class="reveal-card-rarity">${card.rarity}</div>
      <div class="reveal-card-desc">${card.desc}</div>
    </div>
  `;

  // Trigger entrance animation
  void revealCard.offsetWidth; // reflow
  revealCard.classList.add('reveal-enter');
}

// Tap on reveal card
document.getElementById('revealCard').addEventListener('click', () => {
  const card = revealQueue[revealIndex];
  const isLast = revealIndex === revealQueue.length - 1;

  if (isLast) {
    // Last card — choosing it drops it
    dropCard(card);
  } else {
    // Animate out, then show next
    const revealCard = document.getElementById('revealCard');
    revealCard.classList.add('reveal-exit');
    setTimeout(() => {
      revealIndex++;
      showRevealCard(revealIndex);
    }, 300);
  }
});

// ─── Drop ─────────────────────────────────────────────────────────────────────

function dropCard(card) {
  chosenCard = card;
  send(card.command);

  document.getElementById('droppedSub').textContent =
    `${card.name.toUpperCase()} · ${card.rarity.toUpperCase()} · ${card.desc}`;

  showScreen('screen-dropped');
}

// ─── Open another pack ────────────────────────────────────────────────────────

document.getElementById('againBtn').addEventListener('click', () => {
  pack.classList.remove('opening');
  if (swipeHint) swipeHint.style.opacity = 1;
  showScreen('screen-pack');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

connect();