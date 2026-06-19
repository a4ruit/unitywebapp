// ─── WebSocket endpoints — primary + backup ──────────────────────────────────
// Primary is the Sydney DigitalOcean droplet (low latency for Melbourne
// players). Backup is the original Render Singapore deployment, kept alive
// as a failover in case the droplet goes down mid-installation.
//
// Both servers run an identical index.js — they're interchangeable from the
// client's perspective. The failover logic in connect() below swaps to the
// other URL whenever a WebSocket fails to open at all (= URL unreachable),
// then keeps alternating until one comes back. If we connect and THEN drop,
// we retry the same URL (= transient blip, not a server outage).
//
// Manual override for testing:  ?server=do  or  ?server=render  in the URL.
const WS_PRIMARY = 'wss://packmentality.cc';
const WS_BACKUP  = 'wss://unitywebapp.onrender.com';

const _wsOverride = (() => {
  try {
    const v = new URLSearchParams(location.search).get('server');
    if (v === 'do'     || v === 'primary') return WS_PRIMARY;
    if (v === 'render' || v === 'backup')  return WS_BACKUP;
  } catch (e) {}
  return null;
})();

let WS_URL = _wsOverride || WS_PRIMARY;

// ─── Card pools ───────────────────────────────────────────────────────────────

// ─── NATURE (garbage / pristine) ──────────────────────────────────────────────
const NATURE_CARDS = [
  { id:'small_cube', name:'Fallen Leaf',     rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Still green. Give it time.' },
  { id:'large_cube', name:'Wildflowers',     rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', placement:'wildflower', desc:'Nobody planted them. That\'s the point.' },
  { id:'sphere',     name:'Flower Bush',     rarity:'rare',            rarityRank:2, command:'spawn_sphere',     placement:'flowerbush', desc:'In bloom. Spreading beyond the path.' },
  { id:'triangle',   name:'Ancient Yew',     rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   placement:'ancientyew', desc:'It watched the forest grow. It will watch it fall.' },
  { id:'octagon',    name:'The Old Grove',   rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'Before the map. Before the name.' },
  { id:'triad',      name:'Pollen Drift',    rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Carried by nothing. Reaching everything.' },
  { id:'star',       name:'Tree of Life',     rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It remembers the first rain. It will outlast the last.' },
];

// ─── FLESH (garbage / horror) ─────────────────────────────────────────────────
const FLESH_CARDS = [
  { id:'small_cube', name:'Mystery Meat', rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Origin unclear. The environment has accepted it.' },
  { id:'large_cube', name:'Fleshling',           rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'Small. Hungry. It found you first.' },
  { id:'sphere',     name:'Blind Box',            rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'It has eyes. They do not work. But it knows you are here.' },
  { id:'triangle',   name:'Bone Fragment',       rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Dense. Old. Pre-dates the colony.' },
  { id:'octagon',    name:'Unnamed Organ',       rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'It has a function. You do not want to know what it is.' },
  { id:'triad',      name:'Spore Cluster',       rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Three. Always three. Already airborne.' },
  { id:'star',       name:'The Flesh',           rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It was here before you. It will be here after.' },
];

// ─── CRITTER (ewaste / pristine) ──────────────────────────────────────────────
const CRITTER_CARDS = [
  { id:'small_cube', name:'sheep.png',     rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Static bitmap. Harmless.' },
  { id:'large_cube', name:'duck.gif',      rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'Loops forever. Never buffers.' },
  { id:'sphere',     name:'gull.svg',      rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Vector. Scales clean.' },
  { id:'triangle',   name:'fox.exe',       rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Runs on sight.' },
  { id:'octagon',    name:'stag.sys',      rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'A driver. Do not delete.' },
  { id:'triad',      name:'swarm.bat',     rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Batch job. Thousands of instances.' },
  { id:'star',       name:'ouroboros.exe', rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'while(true){}. Never returns.' },
];

// ─── SCOURGE (ewaste / horror) ────────────────────────────────────────────────
const SCOURGE_CARDS = [
  { id:'small_cube', name:'Ticks',               rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Eight legs. No conscience. Already feeding.' },
  { id:'large_cube', name:'Infested Mice',       rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'The fleas are the point. The mice are just transport.' },
  { id:'sphere',     name:'Necrotic Mass',       rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Growing. Always growing.' },
  { id:'triangle',   name:'The Black Plague',    rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Arrived by ship. Left by reputation.' },
  { id:'octagon',    name:'Host Event',          rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'The distinction between parasite and host is administrative.' },
  { id:'triad',      name:'Propagation Cluster', rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Three vectors. Simultaneous. Uncontained.' },
  { id:'star',       name:'The Bloom',           rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It does not spread. It reveals.' },
];

// ─── FUNGI (adpack / pristine) ────────────────────────────────────────────────
// common → legendary get placement (joystick modal + PLACE confirm, same as
// wildflower / flower bush). mythical and above are direct-spawns only.
const FUNGI_CARDS = [
  { id:'small_cube', name:'White Mushroom',   rarity:'common',          rarityRank:0, command:'spawn_small_cube', placement:'fungi', desc:'Overnight. Unannounced.' },
  { id:'large_cube', name:'Fairy Cap',        rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', placement:'fungi', desc:'Do not eat. Do not touch.' },
  { id:'sphere',     name:'Chanterelle',      rarity:'rare',            rarityRank:2, command:'spawn_sphere',     placement:'fungi', desc:'The forest floor gives selectively.' },
  { id:'triangle',   name:'Giant Puffball',   rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   placement:'fungi', desc:'Ten trillion spores. Patient.' },
  { id:'octagon',    name:'Death Cap',        rarity:'mythical',        rarityRank:4, command:'spawn_octagon',                       desc:'Beautiful. Absolute.' },
  { id:'triad',      name:'Spore Release',    rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',                         desc:'Already airborne. Already everywhere.' },
  { id:'star',       name:'The Network',      rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',                          desc:'It remembered this forest before the trees did.' },
];

// ─── RITUAL (adpack / horror) ─────────────────────────────────────────────────
const RITUAL_CARDS = [
  { id:'small_cube', name:'Sheep Sacrifice',  rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Offered willingly. Or so they believed.' },
  { id:'large_cube', name:'The Goat',         rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'The old compact. Blood for favour.' },
  { id:'sphere',     name:'The Pyre',         rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'What the circle demands.' },
  { id:'triangle',   name:'The Offering',     rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Named. Then unnamed.' },
  { id:'octagon',    name:'The Summoning',    rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'Something answered.' },
  { id:'triad',      name:'Mass Rite',        rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'They came at midnight. None returned alone.' },
  { id:'star',       name:'The Entity',       rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It was the ritual all along.' },
];

// ─── Placement star costs ──────────────────────────────────────────────────────
// Common and uncommon are always free — lower rarities must remain accessible
// so players can contribute to the collective quests without needing currency.
// Higher rarities require stars earned through those quests.
// Numbers are intentionally tunable; keep in sync with QUEST_STAR_REWARDS in counter.js.
const PLACEMENT_COSTS = {
  'common':          0,
  'uncommon':        0,
  'rare':            3,
  'legendary':       8,
  'mythical':        15,
  'luck-maxxing':    15,
  'legendary-alpha': 25,
};

// ─── Active pack type ──────────────────────────────────────────────────────────
let activePackType = 'garbage';
const PACK_TYPE_ORDER = ['garbage', 'ewaste', 'adpack'];

// Returns the correct card pool for this phone's personal phase + active pack type.
// Personal phase is independent of the collective bar — two players can be in
// different pools simultaneously (one pulls FLESH while another pulls NATURE).
function getActiveCardPool() {
  const isHorror = personalPacksOpened >= HORROR_THRESHOLD;
  if (activePackType === 'garbage') return isHorror ? FLESH_CARDS   : NATURE_CARDS;
  if (activePackType === 'ewaste')  return isHorror ? SCOURGE_CARDS : CRITTER_CARDS;
  if (activePackType === 'adpack')  return isHorror ? RITUAL_CARDS  : FUNGI_CARDS;
  return NATURE_CARDS;
}

// ─── Corruption / progression ──────────────────────────────────────────────────
// packsOpened — collective Unity count (still received from server broadcasts).
// No bar displayed; kept for logging and legacy pack_type_* fallback.
let packsOpened = 0;
// personalPacksOpened — THIS phone's own pull count. Drives everything:
//   card pool · tab labels · pristine-phase CSS · glitch transition
//   sendPackType · horror spin gate · god-pack horror check
let personalPacksOpened = 0;
let _prevPersonalLevel  = 0;
const HORROR_THRESHOLD = 15;  // packs opened before horror phase begins
const CORRUPTION_MAX   = 18;  // max corruption level (HORROR_THRESHOLD + a few horror ticks)

// Drives everything tied to THIS phone's personal phase (called on every pull
// and on WS reconnect). Does NOT touch the collective bar or packsOpened.
function updatePersonalPhase() {
  const level      = personalPacksOpened;
  const isPristine = level < HORROR_THRESHOLD;
  // Update the bar immediately — don't wait for the next Unity broadcast.
  // Other players' pulls no longer move this phone's bar.
  document.body.dataset.corruption = Math.min(level, CORRUPTION_MAX);
  // Toggle pristine-phase CSS class (drives tab + carousel styling)
  document.body.classList.toggle('pristine-phase', isPristine);
  // Keep the 6-way pack theme class in sync whenever phase changes
  syncPackThemeClass();
  // Update pack tab labels / icons (NATURE↔FLESH, CRITTER↔SCOURGE, FUNGI↔RITUAL)
  updateFirstPackTab(isPristine);
  updateSecondPackTab(isPristine);
  updateThirdPackTab(isPristine);
  // On the personal nature→horror crossing, fire the 3D glitch transition
  // and automatically spawn the Flesh Boss for this player.
  if (typeof Pack3D !== 'undefined') {
    if (_prevPersonalLevel < HORROR_THRESHOLD && level >= HORROR_THRESHOLD) {
      Pack3D.startGlitchTransition();
      // Tell Unity to spawn the boss — gated server-side (one at a time).
      if (typeof CLIENT_ID !== 'undefined') send(`spawn_boss|${CLIENT_ID}`);
    } else {
      Pack3D.onCorruptionUpdate();
    }
  }
  _prevPersonalLevel = level;
  // Drive the screen bleed off THIS phone's horror phase too (reversible: when a
  // future revert-to-pristine drops `level`, this drops below threshold and the
  // blood fades out). Maps pulls into 0..1 where HORROR_THRESHOLD = 0.60.
  if (typeof BloodDrip !== 'undefined' && BloodDrip.setPersonalLevel) {
    BloodDrip.setPersonalLevel(Math.min(1, (level / HORROR_THRESHOLD) * 0.60));
  }
  // Tell Unity THIS player's current pack type so per-spawn routing is correct
  sendPackType();
  // Reveal the horror half of the card collection once this phone flips phase
  if (typeof Collection !== 'undefined' && Collection.onPhaseChange) Collection.onPhaseChange();
}

function updateFirstPackTab(isPristine) {
  const btn = document.getElementById('packTypeGarbage');
  if (!btn) return;
  const icon = btn.querySelector('img');
  const label = btn.querySelector('.pack-type-label');
  if (icon) icon.src = isPristine ? 'assets/nature-symbol.png' : 'assets/flesh-symbol.png';
  if (label) label.textContent = isPristine ? 'NATURE' : 'FLESH';
}

function updateThirdPackTab(isFungi) {
  const btn = document.getElementById('packTypeAdpack');
  if (!btn) return;
  const icon = btn.querySelector('img');
  const label = btn.querySelector('.pack-type-label');
  if (icon) icon.src = isFungi ? 'assets/fungi-symbol.png' : 'assets/ritual-symbol.png';
  if (label) label.textContent = isFungi ? 'FUNGI' : 'RITUAL';
  btn.classList.toggle('fungi-mode', isFungi);
  if (btn.classList.contains('active')) {
    syncPackThemeClass();
    const sp = document.getElementById('screen-pack');
    if (sp) sp.classList.toggle('adpack-active', !isFungi);
  }
}

function updateSecondPackTab(isCritter) {
  const btn = document.getElementById('packTypeEwaste');
  if (!btn) return;
  const icon = btn.querySelector('img');
  const label = btn.querySelector('.pack-type-label');
  if (icon) icon.src = isCritter ? 'assets/critter-symbol.png' : 'assets/scourge-symbol.png';
  if (label) label.textContent = isCritter ? 'CRITTER' : 'SCOURGE';
  btn.classList.toggle('critter-mode', isCritter);
}

// ── Pack theme class sync ──────────────────────────────────────────────────
// Keeps exactly one of 6 mutually-exclusive body classes active so the CSS
// can target each pack state independently.
//   nature-active   — garbage tab · pristine phase
//   flesh-active    — garbage tab · horror phase
//   critter-active  — ewaste tab  · pristine phase
//   scourge-active  — ewaste tab  · horror phase
//   fungi-active    — adpack tab  · pristine phase
//   ritual-active   — adpack tab  · horror phase
const _PACK_THEME_CLASSES = [
  'nature-active','flesh-active',
  'critter-active','scourge-active',
  'fungi-active','ritual-active',
];
function syncPackThemeClass() {
  const isHorror = personalPacksOpened >= HORROR_THRESHOLD;
  _PACK_THEME_CLASSES.forEach(c => document.body.classList.remove(c));
  if (activePackType === 'garbage') {
    document.body.classList.add(isHorror ? 'flesh-active'   : 'nature-active');
  } else if (activePackType === 'ewaste') {
    document.body.classList.add(isHorror ? 'scourge-active' : 'critter-active');
  } else if (activePackType === 'adpack') {
    document.body.classList.add(isHorror ? 'ritual-active'  : 'fungi-active');
  }
}

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
  document.getElementById('packTypeGarbage')?.classList.toggle('active', type === 'garbage');
  document.getElementById('packTypeEwaste')?.classList.toggle('active',  type === 'ewaste');
  document.getElementById('packTypeAdpack')?.classList.toggle('active',  type === 'adpack');
  syncPackThemeClass();
  updatePackCarousel(type);
  animatePackTypeSwitch(prevType, type);
  // Toggle adpack glow on screen-pack (personal phase — not collective bar)
  const sp = document.getElementById('screen-pack');
  if (sp) sp.classList.toggle('adpack-active', type === 'adpack' && personalPacksOpened >= HORROR_THRESHOLD);
  const stage = document.getElementById('packCarouselStage');
  if (stage) {
    stage.classList.remove('adpack-shimmer-burst');
    if (type === 'adpack') {
      void stage.offsetWidth;
      stage.classList.add('adpack-shimmer-burst');
    }
  }
  sendPackType();
  showScreen('screen-pack');
  setTickerState('idle');
}

function pick(tier) {
  return { ...getActiveCardPool().find(c => c.rarity === tier) };
}

let isGodPack = false;

// Holographic finish — pilot is gated to the critter pool. ~10% per card.
const HOLO_CHANCE = 0.10;

function rollPack() {
  const cards = [];

  // TODO: God Pack disabled — concept not consolidated yet.
  // Re-enable when the god-pack flow (flash → claim grid → Unity spawn_godpack)
  // is fully designed. Original roll: Math.random() < 0.0333.
  // if (Math.random() < 0.0333) {
  //   isGodPack = true;
  //   cards.push(pick('mythical'));
  //   cards.push(pick('luck-maxxing'));
  //   cards.push(pick('legendary-alpha'));
  //   cards.push(pick('legendary-alpha'));
  //   cards.sort((a, b) => a.rarityRank - b.rarityRank);
  //   return cards;
  // }

  isGodPack = false;
  const roll = Math.random();
  let topCard;
  if      (roll < 0.04)  topCard = pick('legendary-alpha');
  else if (roll < 0.09)  topCard = pick('luck-maxxing');
  else if (roll < 0.157) topCard = pick('mythical');
  else if (roll < 0.257) topCard = pick('legendary');
  else if (roll < 0.457) topCard = pick('rare');
  else                   topCard = pick('uncommon');

  // Guaranteed Legendary voucher (bought in the pristine shop). Forces the top
  // card to the Emerald Serpent (critter legendary-alpha) — the only legendary
  // creature available right now. Update this once more legendaries exist.
  if (window._guaranteedLegendary) {
    topCard = { ...CRITTER_CARDS.find(c => c.rarity === 'legendary-alpha') };
    window._guaranteedLegendary = false;
  }

  cards.push(pick('common'));
  cards.push(pick('common'));
  cards.push(pick('uncommon'));
  cards.push(topCard);
  cards.sort((a, b) => a.rarityRank - b.rarityRank);
  // Holographic finish roll — pilot: critter pool only. Tag per card; the
  // variant rides the card object through the choice grid → dropCard → collection.
  if (getActiveCardPool() === CRITTER_CARDS) {
    cards.forEach(c => { if (Math.random() < HOLO_CHANCE) c.variant = 'holo'; });
  }
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

// ── WS verbose logging gate ─────────────────────────────────────────────────
// Per-message console.log fires for every send AND every receive. On a phone
// during multi-player play that's dozens of writes/sec, each of which can
// jank the render thread when DevTools is attached. Flip with
//   ?wsdebug=1  in the URL (or `localStorage.wsDebug='1'` in DevTools).
// Off by default for production play.
const WS_DEBUG = (() => {
  try {
    if (new URLSearchParams(location.search).get('wsdebug')) return true;
    if (localStorage.getItem('wsDebug')) return true;
  } catch (e) {}
  return false;
})();

// Tracks whether the current attempt ever reached the `open` state.
// Used by onclose to decide between failover (never opened = bad URL) and
// plain retry (was open, dropped = transient).
let _wsHadOpenThisAttempt = false;

// ─── Player identity (name + tag colour) ─────────────────────────────────────
// The chosen colour is shown by Unity on:
//   - the player's placement labels in the world
//   - the floating tag when they inhabit a critter
//   - (future) chat-log entries
// Wire protocol:  set_name|<CLIENT_ID>|<NAME>|<#RRGGBB>
let playerName   = '';
let playerColor  = '';   // set by selectPlayerColor() or randomly on submit
let soundEnabled = true; // name-screen "sound" toggle — gates all phone audio

// Must match the swatches in index.html (and ideally Unity's palette).
const PLAYER_COLORS = ['#7BE3FF', '#FFD96B', '#FF9BC9', '#6FE886', '#C28BFF', '#FFB070'];

function selectPlayerColor(el) {
  const hex = el && el.dataset ? el.dataset.color : '';
  if (!hex) return;
  document.querySelectorAll('.name-color-swatch').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  playerColor = hex;
}

// Name-screen sound toggle. Records the preference only — the AudioContext is
// unlocked on the enter-world tap (a user gesture) in submitPlayerName().
function toggleSound() {
  soundEnabled = !soundEnabled;
  if (typeof Sound !== 'undefined') Sound.setEnabled(soundEnabled);
  _updateSoundToggle();
}
function _updateSoundToggle() {
  const btn = document.getElementById('nameSoundToggle');
  if (!btn) return;
  btn.classList.toggle('name-sound-toggle--on', soundEnabled);
  btn.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
  const box = btn.querySelector('.name-sound-box');
  if (box) box.textContent = soundEnabled ? '[✓]' : '[ ]';
}

function submitPlayerName() {
  const input = document.getElementById('nameInput');
  const raw   = input ? input.value.trim() : '';
  if (!raw) {
    input && input.classList.add('name-input-shake');
    setTimeout(() => input && input.classList.remove('name-input-shake'), 400);
    return;
  }
  playerName = raw.slice(0, 16).toUpperCase();
  // Random fallback if player didn't pick a colour
  if (!playerColor) {
    playerColor = PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
  }
  // The enter-world tap is a user gesture — unlock audio now so later sounds
  // aren't blocked by mobile autoplay policy (no-op if sound is toggled off).
  if (typeof Sound !== 'undefined') { Sound.setEnabled(soundEnabled); Sound.unlock(); }
  if (ws && ws.readyState === WebSocket.OPEN) {
    const prismatic = (typeof _prismaticOwned !== 'undefined' && _prismaticOwned) ? '|1' : '';
    ws.send(`set_name|${CLIENT_ID}|${playerName}|${playerColor}${prismatic}`);
  }
  // Show the player's persistent name tag on the pack screen, in their colour.
  const tag = document.getElementById('playerNametag');
  if (tag) {
    tag.textContent     = `<${playerName}>`;
    tag.style.color     = playerColor;
    tag.style.display   = 'block';
  }
  document.getElementById('screen-name').classList.add('hidden');
  document.getElementById('screen-pack').classList.remove('hidden');
}

// Apply the prismatic CSS to the web name tag immediately when purchased.
function applyPrismaticNametag() {
  const tag = document.getElementById('playerNametag');
  if (tag) {
    tag.classList.add('prismatic');
    tag.style.color = '';  // let CSS gradient take over
     
 
  }
}

// Re-broadcast set_name including the new prismatic flag so Unity updates live.
function reSendSetName() {
  if (ws && ws.readyState === WebSocket.OPEN && playerName) {
    ws.send(`set_name|${CLIENT_ID}|${playerName}|${playerColor}|1`);
  }
}

function connect() {
  try {
    _wsHadOpenThisAttempt = false;
    if (WS_DEBUG) console.log('[WS] Connecting to', WS_URL);
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => {
      _wsHadOpenThisAttempt = true;
      setStatus(true);
      ws.send('web_client');
      clearTimeout(reconnectTimer);
      sendPackType();
      updatePossessionWS();
      if (playerName) ws.send(`set_name|${CLIENT_ID}|${playerName}|${playerColor}`);
    };
    ws.onclose = () => {
      setStatus(false);
      // Never reached `open` → this URL is unreachable. Swap to the other
      // endpoint for the next attempt (unless the URL was forced via
      // ?server= override — then the user explicitly chose this server,
      // so honor that and keep retrying it).
      if (!_wsHadOpenThisAttempt && !_wsOverride && WS_PRIMARY !== WS_BACKUP) {
        const other = (WS_URL === WS_PRIMARY) ? WS_BACKUP : WS_PRIMARY;
        console.warn('[WS] Failover:', WS_URL, '→', other);
        WS_URL = other;
      }
      reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      if (WS_DEBUG) console.log('[WS]', e.data);
      // Order matters: corruption messages are checked first because they're
      // high-frequency (every 0.5s) and we want to short-circuit early.
      if (typeof handleCorruptionMessage === 'function' && handleCorruptionMessage(e.data)) return;
      if (handleQuestMessage(e.data)) return;
      if (typeof Announce !== 'undefined' && Announce.handleMessage(e.data)) return;
      handlePossessionMessage(e.data);
    };
  } catch(e) { setStatus(false); reconnectTimer = setTimeout(connect, 3000); }
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
    if (WS_DEBUG) console.log('[WS] Sent:', msg);
  } else {
    console.warn('[WS] Not connected:', msg);
  }
}

// ─── Quest rewards ────────────────────────────────────────────────────────────
// Unity broadcasts "quest_reward|{quest}|{packCount}" when a collective
// objective completes. Server relays it to all phones. We convert it to a
// star reward and show a brief banner so the player knows they earned something.

function handleQuestMessage(msg) {
  // Live progress broadcast from Unity's QuestManager: quest_progress|quest|count|goal
  if (msg.startsWith('quest_progress|')) {
    const parts = msg.split('|');
    if (typeof TaskTracker !== 'undefined') {
      TaskTracker.recordQuestProgress(parts[1], parseInt(parts[2]), parseInt(parts[3]));
    }
    return true;
  }

  // Quest completion from Unity's QuestManager: quest_reward|quest|packCount
  if (!msg.startsWith('quest_reward|')) return false;
  const parts  = msg.split('|');
  const quest  = parts[1];
  const reward = QUEST_STAR_REWARDS[quest];
  if (reward) {
    addStars(reward);
    showQuestToast(quest, reward);
    if (typeof TaskTracker !== 'undefined') {
      TaskTracker.recordQuestComplete(quest);
    }
  }
  return true;
}

function showQuestToast(quest, starsEarned) {
  const labels = { flowers: 'FLOWERS', sheep: 'SHEEP', ducks: 'DUCKS', all: 'ALL DONE', boss: 'BOSS SLAIN' };
  const label  = labels[quest] || quest.toUpperCase();
  const el = document.getElementById('questToast');
  if (!el) return;
  el.textContent = `QUEST: ${label}  +${starsEarned} ★`;
  el.style.display    = 'block';
  el.style.opacity    = '0';
  el.style.transition = 'none';
  void el.offsetWidth;
  el.style.transition = 'opacity 0.35s ease';
  el.style.opacity    = '1';
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 400);
  }, 3000);
}

function shakeStarDisplay() {
  const el = document.getElementById('starsDisplay');
  if (!el) return;
  el.classList.remove('stars-shake');
  void el.offsetWidth;
  el.classList.add('stars-shake');
  setTimeout(() => el.classList.remove('stars-shake'), 500);
}

// ─── Unity pack type sync ─────────────────────────────────────────────────────

// Maps this phone's personal phase + active pack tab → Unity spawn type name.
// Embedded in every spawn command: spawn_sphere|CLIENT_ID|<type>
// so Unity routes each card to the correct object set for THIS player,
// regardless of the global collective phase.
function getUnityPackType() {
  const isHorror = personalPacksOpened >= HORROR_THRESHOLD;
  if (activePackType === 'garbage') return isHorror ? 'flesh'   : 'nature';
  if (activePackType === 'ewaste')  return isHorror ? 'scourge' : 'critter';
  if (activePackType === 'adpack')  return isHorror ? 'ritual'  : 'fungi';
  return 'nature';
}

function sendPackType() {
  send('pack_type_' + getUnityPackType());
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
  doPackOpen(_pendingPackDir);
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
  // Pack-opening sound — no-op unless "sound on" was ticked on the name screen.
  if (typeof Sound !== 'undefined') Sound.play('packOpen');

  // Roll the pack FIRST so we know the top card's rarity before we tell Unity.
  // Rarity is forwarded in the pack_opened message so CorruptionManager can
  // scale the damage: common pulls add less corruption, legendary pulls add more.
  // "Engagement is the damage — and rarity is the intensity."
  packCards      = rollPack();
  revealIndex    = 0;
  godPackClaimed = [];

  // ── Personal phase — count this pull and update THIS phone's pool ──────────
  // Drives card pool, tab labels, glitch transition, sendPackType.
  // Runs BEFORE we sample topCard so getActiveCardPool() reflects the new count.
  personalPacksOpened++;
  updatePersonalPhase();

  // Individual task: "Open all pack types"
  if (typeof TaskTracker !== 'undefined') {
    TaskTracker.recordEvent('pack_opened', { packType: activePackType });
  }

  // ── Collective corruption (rarity-scaled) ──
  // Unity is the source of truth. It increments the shared level by an amount
  // that scales with rarity, then broadcasts back to every connected phone.
  // Round-trip is ~200-500ms; the pack-open animation hides the latency.
  const topCard = packCards[packCards.length - 1];
  send('pack_opened|' + (topCard?.rarity ?? 'common'));
  BloodDrip.onPackOpened();

  const isAdpack = activePackType === 'adpack';
  setTickerState(isGodPack ? 'godpack' : isAdpack ? 'adpack' : 'active');

  // Flash for high rarity pulls
  const isHighRarity = ['legendary','mythical','luck-maxxing','legendary-alpha'].includes(topCard?.rarity);
  if (isHighRarity) triggerFlash();

  // God pack — announce to every phone (dormant until god packs are re-enabled).
  if (isGodPack) {
    send(`godpack_pulled|${playerName}|${playerColor}`);
    if (typeof Announce !== 'undefined') Announce.godPack(playerName, playerColor);
  }

  // Only send spawn_godpack in personal horror phase — Unity's SpawnGodPack
  // always queues flesh objects, so in pristine phase individual card commands
  // route through the player's personal pack type instead.
  const _gpHorror = personalPacksOpened >= HORROR_THRESHOLD;
  // Tag spawn commands with this phone's CLIENT_ID so Unity can attach it
  // to the matching sheep_spawned / duck_spawned broadcast — that way only
  // the phone that actually pulled the card unlocks the Inhabit button.
  if (isGodPack && _gpHorror) send(`spawn_godpack|${CLIENT_ID}`);

  Pack3D.throwPack(dir === 'left' ? -1 : 1, () => {
    if (isGodPack) {
      triggerGodPackFlash();
      // God-pack flash still needs time to play before the grid appears
      setTimeout(showGodPackClaimGrid, 900);
    } else {
      // Choice grid appears the instant the closing blip ends — no dead air
      showChoiceGrid();
    }
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
  const csb = document.getElementById('choiceStarBalance');
  if (csb) csb.textContent = (typeof stars !== 'undefined') ? stars : (window.getStarBalance ? window.getStarBalance() : 0);
  const cardsWithCost = packCards.map(c => ({
    ...c,
    starCost: PLACEMENT_COSTS[c.rarity] ?? 0,
  }));
  ChoiceGrid3D.show(cardsWithCost, 'choiceGrid', (chosenCard) => {
    setTimeout(() => dropCard(chosenCard), 400);
  });
}

// ─── Legendary reveal (shop "guaranteed legendary") ─────────────────────────────
// A dedicated single-card screen. Already paid for in the shop, so tapping the
// card just claims + spawns it — no extra cost. Currently always the Emerald
// Serpent (the only legendary creature); expand when more legendaries exist.
function showLegendaryReveal() {
  Cards3D.destroy();
  const el = document.getElementById('revealCard');
  if (el) { el.innerHTML = ''; el.style.opacity = ''; }

  const card = { ...CRITTER_CARDS.find(c => c.rarity === 'legendary-alpha'), starCost: 0 };

  showScreen('screen-legendary');

  ChoiceGrid3D.show([card], 'legendaryGrid', (chosenCard) => {
    setTimeout(() => {
      // Count toward the "first legendary" / placement tasks.
      if (typeof TaskTracker !== 'undefined') {
        TaskTracker.recordEvent('placement', { rarity: chosenCard.rarity });
      }
      // Session collection — claim the legendary
      if (typeof Collection !== 'undefined') Collection.record(chosenCard);
      // Force the CRITTER pool so it always spawns the Emerald Serpent,
      // regardless of which pack type / phase the player is currently in.
      send(`${chosenCard.command}|${CLIENT_ID}|critter`);
      resetToPackScreen();
    }, 400);
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
    // Tag with CLIENT_ID + personal pack type — Unity routes per-spawn.
    send(`${claimedCard.command}|${CLIENT_ID}|${getUnityPackType()}`);
    // Session collection — claim each god-pack card as it's released
    if (typeof Collection !== 'undefined') Collection.record(claimedCard);
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
  // Star cost gate — deduct here (grid already pre-checked affordability visually,
  // but spendStars is the authoritative source of truth).
  const cost = PLACEMENT_COSTS[card.rarity] ?? 0;
  if (cost > 0 && !spendStars(cost)) {
    // Shouldn't normally reach here — the choice grid blocks the tap.
    // Defensively: shake the display and leave the player on the choose screen.
    if (typeof Sound !== 'undefined') Sound.play('deny');
    shakeStarDisplay();
    return;
  }

  // Card committed — soft placement "plop".
  if (typeof Sound !== 'undefined') Sound.play('place');

  // Individual tasks: "Place 5 things" + "First legendary"
  if (typeof TaskTracker !== 'undefined') {
    TaskTracker.recordEvent('placement', { rarity: card.rarity });
  }

  // Session collection — the card is now claimed
  if (typeof Collection !== 'undefined') Collection.record(card);

  // Placement cards get their own modal regardless of phase
  if (card.placement && typeof CLIENT_ID !== 'undefined') {
    send(`placement_request|${CLIENT_ID}|${card.placement}|${card.rarity}|${card.name}`);
    resetToPackScreen();
    return;
  }

  // Personal horror phase (non-godpack) gets an extra variant spin before spawning.
  // Uses personalPacksOpened — each phone's own phase, not the collective bar.
  const isHorror = personalPacksOpened >= HORROR_THRESHOLD;
  if (isHorror && !isGodPack) {
    showHorrorSpin(card);   // resetToPackScreen() fires inside the spin confirm
    return;
  }

  // Tag spawn commands with CLIENT_ID + personal pack type so Unity routes
  // this spawn to the correct object set (nature vs flesh etc.) for THIS player,
  // independent of what other phones are currently sending.
  send(`${card.command}|${CLIENT_ID}|${getUnityPackType()}`);
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
document.body.dataset.corruption = 0; // start fully pristine
updatePersonalPhase();    // sets pristine-phase, syncs all tab labels, applies nature-active theme
connect();
initPack();
updatePackCarousel(activePackType);
setTickerState('idle');
initCounter();

// ── DEBUG: dropdown menu (temporary) ─────────────────────────────────────
// All debug actions live under a single ⚙ toggle in the top-left corner so
// they don't interfere with playtesting. Tap the gear to expand, tap any
// action to fire + auto-close, tap outside to dismiss.
// Remove this block + the HTML markup + the CSS rule before production.

function debugMenuToggle(e) {
  e.stopPropagation();   // prevent the document handler below from immediately closing it
  document.getElementById('debug-menu').classList.toggle('open');
}
function debugMenuClose() {
  document.getElementById('debug-menu').classList.remove('open');
}
// Close when tapping anywhere outside the menu
document.addEventListener('click', function(e) {
  const menu = document.getElementById('debug-menu');
  if (menu && !menu.contains(e.target)) debugMenuClose();
});

// ── DEBUG: phase toggle (temporary) ───────────────────────────────────────
// Flips personalPacksOpened between 0 (pristine) and HORROR_THRESHOLD so the
// transition logic — tab swaps, glitch effect, pack type sync — fires exactly
// as it would after a real grind. Remove this block + the HTML button +
// the CSS rule before production.

function debugTogglePhase() {
  const btn = document.getElementById('debugPhaseBtn');
  const inHorror = personalPacksOpened >= HORROR_THRESHOLD;
  // Speak to Unity so the COLLECTIVE bar moves — every phone flips with us.
  // (Old behaviour mutated only the local packsOpened; that no longer drives
  // anything since corruption is Unity-authoritative now.)
  send(inHorror ? 'debug_corruption_reset' : 'debug_corruption_horror');
  if (inHorror) {
    btn.textContent = '▸ horror';
    btn.dataset.phase = 'pristine';
  } else {
    btn.textContent = '◂ pristine';
    btn.dataset.phase = 'horror';
  }
}

// Direct boss spawn — bypasses the legendary-pull gate so we can iterate on
// the fight without grinding packs. Unity handles `debug_spawn_boss` by
// calling FleshBoss.Spawn at a ground point regardless of phase.
function debugSpawnBoss() {
  send('debug_spawn_boss');
  console.log('[DEBUG] requested boss spawn');
}

// Direct fleshling spawn — same idea for the small horror minions. Each call
// spawns one fleshling at a random ground point.
function debugSpawnFleshling() {
  send('debug_spawn_fleshling');
  console.log('[DEBUG] requested fleshling spawn');
}

// Blind Box debug spawn — spawns the inhabitable horror box without needing
// a flesh-rare pull. The Inhabit button appears on any phone that taps it
// after the box lands in the world.
function debugSpawnBlindBox() {
  send('debug_spawn_blind_box');
  console.log('[DEBUG] requested blind box spawn');
}

function debugAddStars() {
  if (typeof addStars === 'function') addStars(25);
  console.log('[DEBUG] +25 stars granted');
}

// ── Horror Phase Roulette (Three.js) ──────────────────────────────────────
// Five 3D items orbit around the Z axis. They spin individually on their own
// axes too. On tap, the orbit accelerates and decelerates via cubic ease-out
// over SPIN_DURATION_MS, landing the winner under the top pointer.
// HOLO uses a custom rainbow shader for iridescence. Result is cosmetic —
// Unity always receives the standard spawn command.

const HORROR_VARIANTS = [
  { id:'flesh',  label:'FLESH',  prob:35, color:'#8B2020' },
  { id:'pallor', label:'PALLOR', prob:30, color:'#C8B89A' },
  { id:'bile',   label:'BILE',   prob:25, color:'#6B7A12' },
  { id:'void',   label:'VOID',   prob:8,  color:'#8A2FBE' },
  { id:'holo',   label:'HOLO',   prob:2,  color:'#ffccff' },
];

const SPIN_DURATION_MS = 3000;

let _spinPendingCard = null;
let _spinPhase       = 'idle';   // idle | spinning | done

// Three.js scene state for the 3D roulette
const _spin3D = {
  scene: null, camera: null, renderer: null,
  group: null, items: [], rafId: null,
  isSpinning: false,
  frozen: false,                // true once the wheel lands — kills item rotation + idle orbit
  reveal: null,                 // active winner-reveal tween, or null
  lastT: 0, idleSpin: 0.55,
};

const REVEAL_DURATION_MS = 800;   // winner moves to centre + losers fade

// Loaded pack-symbol image cache (avoid re-loading the same PNG)
const _packSymbolImgCache = {};

// Map active pack type → horror pack symbol PNG
function _packSymbolPath() {
  if (activePackType === 'ewaste') return 'assets/scourge-symbol.png';
  if (activePackType === 'adpack') return 'assets/ritual-symbol.png';
  return 'assets/flesh-symbol.png';   // garbage / default
}

function _loadPackSymbol(cb) {
  const path = _packSymbolPath();
  if (_packSymbolImgCache[path]) { cb(_packSymbolImgCache[path]); return; }
  const img = new Image();
  img.onload  = () => { _packSymbolImgCache[path] = img; cb(img); };
  img.onerror = () => cb(null);
  img.src = path;
}

// Build a THREE.Texture from a loaded HTMLImageElement, set up for pixel-art
// (NearestFilter, no mipmaps). Used for the symbol overlay planes.
function _makeSymbolTexture(symbolImg) {
  if (!symbolImg) return null;
  const tex = new THREE.Texture(symbolImg);
  tex.magFilter       = THREE.NearestFilter;
  tex.minFilter       = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate     = true;
  return tex;
}

// Rounded-square outline used for the token geometry. Returns a THREE.Shape
// with smooth quadratic-curve corners.
function _makeRoundedSquareShape(size, cornerRadius) {
  const s = size / 2;
  const r = cornerRadius;
  const shape = new THREE.Shape();
  shape.moveTo(-s + r, -s);
  shape.lineTo( s - r, -s);
  shape.quadraticCurveTo( s, -s,  s, -s + r);
  shape.lineTo( s,  s - r);
  shape.quadraticCurveTo( s,  s,  s - r,  s);
  shape.lineTo(-s + r,  s);
  shape.quadraticCurveTo(-s,  s, -s,  s - r);
  shape.lineTo(-s, -s + r);
  shape.quadraticCurveTo(-s, -s, -s + r, -s);
  return shape;
}

// Soft radial glow texture — used by the HOLO bloom plane behind the cube.
// Pink → purple radial fade, additively blended for a halo.
function _makeHoloGlowTexture() {
  const SIZE = 64;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(SIZE/2, SIZE/2, 4, SIZE/2, SIZE/2, SIZE/2);
  grad.addColorStop(0,   'rgba(255,180,255,0.95)');
  grad.addColorStop(0.4, 'rgba(220,130,255,0.55)');
  grad.addColorStop(1,   'rgba(120,60,200,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;  // glow is soft — no need to pixelate
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Iridescent material for the HOLO cube. Draws:
//   1. an animated rainbow frame around each face (the "holographic outline")
//   2. a diagonal shimmer sweep across the inside ("shininess")
//   3. the pack symbol underneath everything
function _makeHoloMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      time:     { value: 0 },
      uOpacity: { value: 1.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float uOpacity;
      varying vec2 vUv;

      vec3 rainbow(float h) {
        h = floor(fract(h) * 8.0) / 8.0;
        return vec3(
          0.5 + 0.5 * cos(6.2831 * h + 0.0),
          0.5 + 0.5 * cos(6.2831 * h + 2.094),
          0.5 + 0.5 * cos(6.2831 * h + 4.188)
        );
      }

      void main() {
        // Rainbow tint across the full surface — the symbol overlay plane
        // handles the icon, so the token body is pure iridescence + shimmer.
        vec3 holoCol = rainbow(vUv.x * 0.4 + vUv.y * 0.3 + time * 0.35);
        float sweep   = (vUv.x + vUv.y) * 6.0 - time * 4.0;
        float shimmer = pow(max(0.0, 0.5 + 0.5 * sin(sweep)), 14.0);
        vec3 col = holoCol * 1.15 + vec3(shimmer * 0.9);
        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
}

function _initSpin3D() {
  if (_spin3D.renderer) return;
  const wrap = document.getElementById('roulette3DWrap');
  if (!wrap || typeof THREE === 'undefined') return;

  const W = wrap.clientWidth  || 280;
  const H = wrap.clientHeight || 280;

  _spin3D.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  _spin3D.renderer.setPixelRatio(1);   // no high-DPI — we want chunky pixels
  // Render at half res; CSS scales the canvas up to 280×280 with `image-rendering:
  // pixelated` for that authentic low-poly 3D pixel feel.
  const renderW = Math.round(W * 0.5);
  const renderH = Math.round(H * 0.5);
  _spin3D.renderer.setSize(renderW, renderH, false);
  const canvasEl = _spin3D.renderer.domElement;
  canvasEl.style.width  = W + 'px';
  canvasEl.style.height = H + 'px';
  _spin3D.renderer.setClearColor(0x000000, 0);
  wrap.appendChild(canvasEl);

  _spin3D.scene  = new THREE.Scene();
  _spin3D.camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  _spin3D.camera.position.set(0, 0, 5);
  _spin3D.camera.lookAt(0, 0, 0);

  // Orbit container — rotation.z drives the carousel
  _spin3D.group = new THREE.Group();
  _spin3D.scene.add(_spin3D.group);

  _spin3D.lastT = performance.now();
  _spinAnimate();
}

// Tear down current items and rebuild them with the active pack's symbol.
// Called each time the horror spin screen is opened.
function _buildSpinItems() {
  if (!_spin3D.group) return;

  // Dispose & remove existing items. The winner may have been reparented to
  // the scene during the previous reveal — remove from whichever parent it's in.
  _spin3D.items.forEach(item => {
    [item.mesh, item.glow].forEach(m => {
      if (!m) return;
      if (m.parent) m.parent.remove(m);
      if (m.geometry) m.geometry.dispose();
      const disposeMat = (mat) => {
        if (!mat) return;
        if (mat.map) mat.map.dispose();
        if (mat.uniforms && mat.uniforms.map && mat.uniforms.map.value) {
          mat.uniforms.map.value.dispose();
        }
        mat.dispose();
      };
      if (Array.isArray(m.material)) m.material.forEach(disposeMat);
      else disposeMat(m.material);
    });
  });
  _spin3D.items  = [];
  _spin3D.frozen = false;
  _spin3D.reveal = null;

  _loadPackSymbol((symbolImg) => {
    const radius = 1.5;
    const N = HORROR_VARIANTS.length;
    // One symbol texture shared by all 5 items (same pack PNG)
    const symbolTex = _makeSymbolTexture(symbolImg);

    HORROR_VARIANTS.forEach((v, i) => {
      // θ measured CCW from +X. Top = π/2. Clockwise arrangement from top.
      const theta = Math.PI / 2 - (i * Math.PI * 2 / N);
      const x = Math.cos(theta) * radius;
      const y = Math.sin(theta) * radius;

      // Token geometry — flat rounded square, slight extrusion. Centred on Z.
      const tokenShape = _makeRoundedSquareShape(0.7, 0.16);
      const tokenGeom  = new THREE.ExtrudeGeometry(tokenShape, {
        depth:        0.08,
        bevelEnabled: false,
        curveSegments: 6,
      });
      tokenGeom.translate(0, 0, -0.04);

      let mesh, glow = null;

      if (v.id === 'holo') {
        // Bloom glow plane behind — billboarded via counter-rotation
        glow = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 1.6),
          new THREE.MeshBasicMaterial({
            map: _makeHoloGlowTexture(),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        glow.position.set(x, y, -0.4);
        _spin3D.group.add(glow);

        // HOLO token body — pure iridescent shader (rainbow + shimmer)
        mesh = new THREE.Mesh(tokenGeom, _makeHoloMaterial());
      } else {
        // Regular token body — solid rarity colour (the rarity outline IS
        // the whole token; no canvas-baked frame needed).
        mesh = new THREE.Mesh(
          tokenGeom,
          new THREE.MeshBasicMaterial({
            color: v.color,
            transparent: true,
          })
        );
      }

      mesh.position.set(x, y, 0);
      mesh.userData = {
        variant: v,
        spinAxis: new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize(),
        spinSpeed: 0.5 + Math.random() * 0.7,
      };

      // Symbol overlay — two child planes (front + back), each with the pack
      // PNG. Because they're separate meshes (not canvas-baked into the token
      // texture) the PNG renders with full alpha/colour fidelity.
      if (symbolTex) {
        const symGeom = new THREE.PlaneGeometry(0.58, 0.58);
        const symMat  = new THREE.MeshBasicMaterial({
          map:          symbolTex,
          transparent:  true,
          depthWrite:   false,
        });
        const symFront = new THREE.Mesh(symGeom, symMat);
        symFront.position.z = 0.045;
        mesh.add(symFront);

        const symBack = new THREE.Mesh(symGeom, symMat);
        symBack.position.z   = -0.045;
        symBack.rotation.y   = Math.PI;
        mesh.add(symBack);
      }

      _spin3D.group.add(mesh);
      _spin3D.items.push({ mesh, glow, variant: v, x, y });
    });
  });
}

// Apply an opacity value to every material on an item (mesh + glow + child
// symbol planes). Handles single materials, material arrays, and the HOLO
// ShaderMaterial's uOpacity uniform.
function _setItemOpacity(item, opacity) {
  const apply = (m) => {
    if (!m) return;
    if (m.uniforms && m.uniforms.uOpacity) {
      m.uniforms.uOpacity.value = opacity;
    } else {
      m.transparent = true;
      m.opacity     = opacity;
    }
  };
  const matOf = (mesh) => {
    if (!mesh) return;
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach(apply); else apply(mat);
  };

  matOf(item.mesh);
  // Symbol overlay planes are children of the token mesh
  item.mesh.children.forEach(matOf);

  if (item.glow) {
    item.glow.material.opacity = opacity * 0.8;
  }
}

// Once the wheel lands, run a short tween that pulls the winner to the centre
// of the screen at a larger scale while the losers fade out where they sit.
function _startWinnerReveal(winnerIdx) {
  const winner = _spin3D.items[winnerIdx];
  if (!winner) return;

  // Detach winner (and its glow) from the orbit group so we can animate them
  // in world space — otherwise lerping to (0,0,0) lands them at the rotated
  // group's local origin, not the actual centre of the screen.
  [winner.mesh, winner.glow].forEach(m => {
    if (!m) return;
    const worldPos  = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    m.getWorldPosition(worldPos);
    m.getWorldQuaternion(worldQuat);
    if (m.parent) m.parent.remove(m);
    _spin3D.scene.add(m);
    m.position.copy(worldPos);
    m.quaternion.copy(worldQuat);
  });

  _spin3D.reveal = {
    startTime:  performance.now(),
    winnerIdx,
    startPos:   winner.mesh.position.clone(),
    startQuat:  winner.mesh.quaternion.clone(),
    startScale: winner.mesh.scale.x,
    glowStartPos: winner.glow ? winner.glow.position.clone() : null,
  };
}

function _spinAnimate() {
  _spin3D.rafId = requestAnimationFrame(_spinAnimate);

  const now = performance.now();
  const dt  = Math.min(0.05, (now - _spin3D.lastT) / 1000);
  _spin3D.lastT = now;
  const t = now * 0.001;

  // Counter-rotate the HOLO glow plane while it's still parented to the
  // group, so it always faces the camera as the group rotates.
  const negZ = -_spin3D.group.rotation.z;

  _spin3D.items.forEach(item => {
    // Tumble — paused once frozen=true
    if (!_spin3D.frozen) {
      item.mesh.rotateOnAxis(item.mesh.userData.spinAxis, dt * item.mesh.userData.spinSpeed);
    }
    // HOLO shader time keeps moving even when frozen
    if (item.mesh.material.uniforms && item.mesh.material.uniforms.time) {
      item.mesh.material.uniforms.time.value = t;
    }
    // Billboard HOLO glow (only while parented to the rotating group)
    if (item.glow && item.glow.parent === _spin3D.group) {
      item.glow.rotation.z = negZ;
    }
  });

  // Idle orbit — only when not actively spinning AND not yet landed
  if (!_spin3D.isSpinning && !_spin3D.frozen) {
    _spin3D.group.rotation.z += _spin3D.idleSpin * dt;
  }

  // Winner reveal tween — drives the winner to centre and fades losers out
  if (_spin3D.reveal) {
    const r = _spin3D.reveal;
    const p = Math.min(1, (now - r.startTime) / REVEAL_DURATION_MS);
    const eased = 1 - Math.pow(1 - p, 3);   // cubic ease-out

    const targetPos   = new THREE.Vector3(0, 0, 0.5);
    const targetQuat  = new THREE.Quaternion();      // identity — face camera
    const targetScale = 1.45;

    _spin3D.items.forEach((item, i) => {
      if (i === r.winnerIdx) {
        // Winner — slide to centre, scale up, rotate to face camera
        item.mesh.position.lerpVectors(r.startPos, targetPos, eased);
        const s = r.startScale + (targetScale - r.startScale) * eased;
        item.mesh.scale.set(s, s, s);
        item.mesh.quaternion.copy(r.startQuat).slerp(targetQuat, eased);
        if (item.glow && r.glowStartPos) {
          item.glow.position.lerpVectors(r.glowStartPos, new THREE.Vector3(0, 0, 0.1), eased);
          item.glow.scale.set(s, s, 1);
          item.glow.rotation.z = 0;            // face camera once detached
          item.glow.material.opacity = 0.9;
        }
        // Subtle pulsating brightness for the winner — a "flash" on landing
        const flash = Math.max(0, 1 - p * 3);  // bright first 1/3 of the tween
        if (item.mesh.material.uniforms && item.mesh.material.uniforms.uOpacity) {
          item.mesh.material.uniforms.uOpacity.value = 1.0;
        }
        item.mesh.scale.multiplyScalar(1 + flash * 0.12);
      } else {
        // Losers — fade out where they sit
        _setItemOpacity(item, 1 - eased);
      }
    });

    if (p >= 1) _spin3D.reveal = null;
  }

  _spin3D.renderer.render(_spin3D.scene, _spin3D.camera);
}

function _spinTo(winnerIdx, duration) {
  const startZ   = _spin3D.group.rotation.z;
  const N        = HORROR_VARIANTS.length;
  const segAngle = (Math.PI * 2) / N;

  // Item i starts at θ_i = π/2 - i*segAngle. The group rotates CCW around Z
  // by rZ, so item's effective angle = θ_i + rZ. To land at π/2 (the top,
  // under the pointer) we solve: rZ = i * segAngle (mod 2π). NO jitter —
  // the winner must land dead-centre under the arrow.
  const targetAngle = winnerIdx * segAngle;

  const startMod = ((startZ % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let delta      = targetAngle - startMod;
  if (delta < 0) delta += Math.PI * 2;
  const endZ     = startZ + delta + (5 * Math.PI * 2);   // 5 spins + landing

  const t0 = performance.now();
  _spin3D.isSpinning = true;

  function tick() {
    const p = Math.min(1, (performance.now() - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    _spin3D.group.rotation.z = startZ + (endZ - startZ) * eased;
    if (p < 1) {
      requestAnimationFrame(tick);
    } else {
      _spin3D.group.rotation.z = endZ;
      _spin3D.isSpinning = false;
      _spin3D.frozen     = true;          // freeze tumble + idle orbit
      _startWinnerReveal(winnerIdx);      // begin centre-stage reveal
    }
  }
  tick();
}

function _rollHorrorVariant() {
  const total = HORROR_VARIANTS.reduce((s, v) => s + v.prob, 0);
  let r = Math.random() * total;
  for (let i = 0; i < HORROR_VARIANTS.length; i++) {
    r -= HORROR_VARIANTS[i].prob;
    if (r <= 0) return i;
  }
  return HORROR_VARIANTS.length - 1;
}

function showHorrorSpin(card) {
  _spinPendingCard = card;
  _spinPhase       = 'idle';

  showScreen('screen-horror-spin');

  // Renderer/camera/group are built once; items get rebuilt every pull so the
  // texture reflects the current pack type (flesh / scourge / ritual) and the
  // frozen flag is cleared.
  _initSpin3D();
  _buildSpinItems();

  const btn = document.getElementById('rouletteBtn');
  btn.textContent = 'SPIN';
  btn.disabled    = false;
}

function horrorSpinTap() {
  if (_spinPhase === 'spinning') return;

  // Second tap = confirm — include personal pack type so Unity routes correctly
  if (_spinPhase === 'done') {
    if (_spinPendingCard) send(`${_spinPendingCard.command}|${CLIENT_ID}|${getUnityPackType()}`);
    _spinPendingCard = null;
    _spinPhase       = 'idle';
    resetToPackScreen();
    return;
  }

  // First tap = spin
  _spinPhase = 'spinning';
  const btn  = document.getElementById('rouletteBtn');
  btn.disabled    = true;
  btn.textContent = '...';

  const winnerIdx = _rollHorrorVariant();
  _spinTo(winnerIdx, SPIN_DURATION_MS);

  // CONFIRM appears only after the wheel has landed AND the winner-reveal
  // tween has finished centring the chosen token.
  setTimeout(() => {
    btn.textContent = 'CONFIRM';
    btn.disabled    = false;
    _spinPhase      = 'done';
  }, SPIN_DURATION_MS + REVEAL_DURATION_MS + 100);
}
