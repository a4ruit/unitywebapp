const WS_URL = 'wss://unitywebapp.onrender.com';

// ─── Card definitions ────────────────────────────────────────────────────────

const CARDS = [
  {
    id:      'small_cube',
    name:    'Small Cube',
    rarity:  'common',
    command: 'spawn_small_cube',
    shapeClass: 'shape-small-cube',
    desc:    'A modest offering. The colony will accept it.'
  },
  {
    id:      'large_cube',
    name:    'Large Cube',
    rarity:  'uncommon',
    command: 'spawn_large_cube',
    shapeClass: 'shape-large-cube',
    desc:    'Substantial. Colonies may compete for this.'
  },
  {
    id:      'sphere',
    name:    'Sphere',
    rarity:  'rare',
    command: 'spawn_sphere',
    shapeClass: 'shape-sphere',
    desc:    'Unusual geometry. Unpredictable colony response.'
  },
  {
    id:      'triangle',
    name:    'Obelisk',
    rarity:  'legendary',
    command: 'spawn_triangle',
    shapeClass: 'shape-triangle',
    desc:    'Ancient form. The colony will remember this.'
  }
];

// ─── State ───────────────────────────────────────────────────────────────────

let selectedCard = null;
let ws = null;
let reconnectTimer = null;

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
    console.warn('[WS] Not connected — message not sent:', msg);
  }
}

// ─── Screen management ───────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ─── Pack opening ─────────────────────────────────────────────────────────────

const pack = document.getElementById('pack');

pack.addEventListener('click', () => {
  pack.classList.add('opening');

  setTimeout(() => {
    showScreen('screen-cards');
    buildCards();
  }, 500);
});

// ─── Card building ────────────────────────────────────────────────────────────

function buildCards() {
  const grid = document.getElementById('cardsGrid');
  grid.innerHTML = '';

  // Shuffle cards so order varies each pack
  const shuffled = [...CARDS].sort(() => Math.random() - 0.5);

  shuffled.forEach(card => {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.rarity = card.rarity;
    el.dataset.id = card.id;

    el.innerHTML = `
      <div class="card-shape">
        <div class="${card.shapeClass}"></div>
      </div>
      <span class="card-name">${card.name}</span>
      <span class="card-rarity">${card.rarity}</span>
    `;

    el.addEventListener('click', () => selectCard(card));
    grid.appendChild(el);
  });
}

// ─── Card selection ───────────────────────────────────────────────────────────

function selectCard(card) {
  selectedCard = card;

  // Build confirm screen shape
  const confirmShape = document.getElementById('confirmShape');
  confirmShape.innerHTML = `<div class="${card.shapeClass}" style="transform:scale(1.6)"></div>`;

  document.getElementById('confirmName').textContent   = card.name;
  document.getElementById('confirmRarity').textContent = card.rarity;

  // Tint confirm name by rarity
  const rarityColors = {
    common:    'var(--common)',
    uncommon:  'var(--uncommon)',
    rare:      'var(--rare)',
    legendary: 'var(--legendary)'
  };
  document.getElementById('confirmName').style.color = rarityColors[card.rarity] || 'var(--text)';

  showScreen('screen-confirm');
}

// ─── Drop button ──────────────────────────────────────────────────────────────

document.getElementById('dropBtn').addEventListener('click', () => {
  if (!selectedCard) return;

  // Send spawn command to Unity via WebSocket
  send(selectedCard.command);

  // Update dropped screen
  document.getElementById('droppedSub').textContent =
    `${selectedCard.name.toUpperCase()} · ${selectedCard.rarity.toUpperCase()} · ${selectedCard.desc}`;

  showScreen('screen-dropped');
});

// ─── Back button ──────────────────────────────────────────────────────────────

document.getElementById('backBtn').addEventListener('click', () => {
  showScreen('screen-cards');
});

// ─── Open another pack ────────────────────────────────────────────────────────

document.getElementById('againBtn').addEventListener('click', () => {
  selectedCard = null;
  pack.classList.remove('opening');
  showScreen('screen-pack');
});

// ─── Init ─────────────────────────────────────────────────────────────────────

connect();