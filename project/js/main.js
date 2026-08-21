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
// ⚠ THE RELAY. This MUST match WS_Client.wsUrl in Unity — they are two ends of
// one pipe, and if they differ, everything looks healthy while nothing works:
// the socket opens, packs open, cards render, and not one message reaches the
// world. Change both together, every time.
//
// Currently the DigitalOcean droplet (Sydney) — preferred over Render, which on
// the free tier sleeps after inactivity and cold-starts for ~30s.
//
// It was briefly on Render because packmentality.cc had been auto-classified as
// "Grayware" by URL-filtering vendors — an unlucky reputation hit that education
// networks block outright, which is why phones on uni Wi-Fi couldn't reach it
// while a laptop on 5G could. Recategorised as Entertainment-and-Arts and now
// reachable. If a venue blocks it again, flip this AND WS_Client.wsUrl in Unity
// to the Render URL together, and verify both readouts agree.
const WS_PRIMARY = 'wss://packmentality.cc';
// Kept ONLY for the ?server=render manual override. Nothing selects it
// automatically — automatic failover is what caused the silent split.
const WS_BACKUP  = 'wss://unitywebapp.onrender.com';

const _wsOverride = (() => {
  try {
    const v = new URLSearchParams(location.search).get('server');
    // Mapped by SERVER NAME, not by primary/backup — those labels swap whenever
    // the active relay changes, and a ?server=render that quietly meant .cc is
    // exactly the kind of confusion this whole bug was made of.
    if (v === 'render') return 'wss://unitywebapp.onrender.com';
    if (v === 'do' || v === 'cc' || v === 'packmentality') return 'wss://packmentality.cc';
  } catch (e) {}
  return null;
})();

let WS_URL = _wsOverride || WS_PRIMARY;

// ─── Card pools ───────────────────────────────────────────────────────────────

// ─── NATURE (garbage / pristine) ──────────────────────────────────────────────
// TRIMMED to 4 tiers (common..legendary). Old Grove / Pollen Drift / Tree of Life
// (mythical/luck-maxxing/legendary-alpha) are cut — their Unity spawn cases still
// exist but are simply unreachable now, since rollTopCard() only ever rolls
// tiers actually present in the active pool.
//
// Leaf Storm replaces Ancient Yew's slot. It's an ABILITY card, not a placement
// card — no `placement` field. Tapping it opens the figure-eight trace panel
// (see combo.js beginAbilityTrace / dropCard's `card.ability` branch) instead of
// the joystick placement modal.
const NATURE_CARDS = [
  { id:'small_cube', name:'Thornwire',   rarity:'common',    rarityRank:0, command:'spawn_small_cube', placement:'thornwire',  desc:'Barbed and coiled. It only defends.' },
  { id:'large_cube', name:'Wildflowers', rarity:'uncommon',  rarityRank:1, command:'spawn_large_cube', placement:'wildflower', desc:'Nobody planted them. That\'s the point.' },
  // `placement` stays 'flowerbush' — it is the wire protocol Unity matches on,
  // and the halo, radius and prefab lookups are all keyed to that string. Only
  // the name the player reads has changed.
  { id:'sphere',     name:'Lightning Iris', rarity:'rare',   rarityRank:2, command:'spawn_sphere',     placement:'flowerbush', desc:'It blooms and the air goes tight. Whatever is near feels it first.' },
  { id:'triangle',   name:'Leaf Storm',  rarity:'legendary', rarityRank:3, command:'spawn_triangle',   ability:'leafstorm',    desc:'Trace the storm. Let it hunt for you.' },
];

// ─── FLESH (garbage / horror) ─────────────────────────────────────────────────
// Every slot here is MEAT FOR THE BOSS: it flies across the map and grafts on as
// a limb, raising the boss's max HP for good. With no boss alive it lies on the
// ground and waits to be absorbed by the next one.
//
// The creatures that used to come out of this pack (glitchling, glitchworm) now
// belong to SCOURGE, whose job is attacking the nature players' plants. Card art
// is keyed by pack + rarity rather than by name, so these renames keep their
// existing illustrations.
const FLESH_CARDS = [
  { id:'small_cube', name:'Mystery Meat', rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Origin unclear. It knows where to crawl.' },
  { id:'large_cube', name:'Gristle Knot',        rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'Muscle with nothing left to move. It wants a body.' },
  { id:'sphere',     name:'Blind Box',           rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'It has eyes. They do not work. Get inside it.' },
  { id:'triangle',   name:'Bone Fragment',       rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Dense. Old. It will find somewhere to fit.' },
  { id:'octagon',    name:'Unnamed Organ',       rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'It has a function. You do not want to know what it is.' },
  { id:'triad',      name:'Tendril Cluster',     rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Three. Always three. All reaching for the same host.' },
  { id:'star',       name:'The Flesh',           rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It was here before you. It will be here after.' },
];

// ─── CRITTER (ewaste / pristine) ──────────────────────────────────────────────
// TRIMMED to 5 tiers — Great Stag (mythical) and The Migration (luck-maxxing)
// are cut, leaving a GAP at ranks 4-5. Emerald Serpent keeps legendary-alpha, so
// it's still the guaranteed-legendary voucher's target (see _guaranteedLegendary
// below) and still what a prismatic critter pull ultimately means.
const CRITTER_CARDS = [
  { id:'small_cube', name:'RAM',             rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Docile. Unaware. Already moving on.' },
  { id:'large_cube', name:'DDoS Duck',       rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'Paddling. Persistent. Unbothered.' },
  { id:'sphere',     name:'C:\\GULL',         rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Already airborne. Eyeing your chips.' },
  { id:'triangle',   name:'Red Fox',         rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'It was watching before you arrived.' },
  { id:'star',       name:'Emerald Serpent', rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It blooms where the rot was. The garden answers the wound.' },
];

// ─── SCOURGE (ewaste / horror) ────────────────────────────────────────────────
// The pack that attacks the NATURE players' board. It's the only horror route
// that works with no boss on the field. Two shapes of threat:
//   • rot fields — a marked ring of ground that chews every plant inside it
//   • biters — glitchlings and glitchworms that chase individual placements
const SCOURGE_CARDS = [
  { id:'small_cube', name:'Ticks',               rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'Eight legs. No conscience. Everything inside the ring is food.' },
  { id:'large_cube', name:'Infested Mice',       rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'It picks a flower and walks straight at it.' },
  { id:'sphere',     name:'Necrotic Mass',       rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Growing. Always growing. Mostly below the soil.' },
  { id:'triangle',   name:'The Black Plague',    rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Arrived by ship. Nothing grows where it settles.' },
  { id:'octagon',    name:'Host Event',          rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'The distinction between parasite and host is administrative.' },
  { id:'triad',      name:'Propagation Cluster', rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'Three vectors. Three places nobody can plant.' },
  { id:'star',       name:'The Bloom',           rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It does not spread. It reveals.' },
];

// ─── FUNGI (adpack / pristine) ────────────────────────────────────────────────
// TRIMMED to 4 tiers (common..legendary), matching Nature's shape.
//
// Chanterelle is cut. Giant Puffball is renamed "Puffball" and moved down into
// the rare slot. Blue Angel fills legendary and is the pack's answer to the boss
// camping the Soul Seed: it TAUNTS. Planted anywhere on the map it takes priority
// over whatever the boss is eating, and its 20 HP is how long the germination
// ground stays clear. Its own placement type ('blueangel', not 'fungi') because
// Unity treats it as a different card end to end — no spore paint, and three
// tap-to-drop spore caps once it lands.
const FUNGI_CARDS = [
  { id:'small_cube', name:'White Mushroom', rarity:'common',    rarityRank:0, command:'spawn_small_cube', placement:'fungi',     desc:'Overnight. Unannounced.' },
  { id:'large_cube', name:'Fairy Cap',      rarity:'uncommon',  rarityRank:1, command:'spawn_large_cube', placement:'fungi',     desc:'Do not eat. Do not touch.' },
  { id:'sphere',     name:'Puffball',       rarity:'rare',      rarityRank:2, command:'spawn_sphere',     placement:'fungi',     desc:'Ten trillion spores. Patient.' },
  { id:'triangle',   name:'Blue Angel',     rarity:'legendary', rarityRank:3, command:'spawn_triangle',   placement:'blueangel', desc:'It sings. The glitch stops whatever it is doing and comes.' },
];

// ─── RITUAL (adpack / horror) ─────────────────────────────────────────────────
// Raises an altar and a procession of acolytes who walk to the boss and burn
// themselves to HEAL it. The walk is the card: nature players who spot it can
// kill the acolytes before they arrive and the offering is lost. Higher tiers
// send more of them, not faster ones.
//
// With no boss alive the sacrifices bank toward SUMMONING one instead, which is
// how the horror side gets back into a fight it has already lost.
const RITUAL_CARDS = [
  { id:'small_cube', name:'Sheep Sacrifice',  rarity:'common',          rarityRank:0, command:'spawn_small_cube', desc:'The sheep is spent. The one who spent it walks on.' },
  { id:'large_cube', name:'The Goat',         rarity:'uncommon',        rarityRank:1, command:'spawn_large_cube', desc:'The old compact. Blood for favour, paid at a run.' },
  { id:'sphere',     name:'The Pyre',         rarity:'rare',            rarityRank:2, command:'spawn_sphere',     desc:'Two walk out of the fire. Neither comes back.' },
  { id:'triangle',   name:'The Offering',     rarity:'legendary',       rarityRank:3, command:'spawn_triangle',   desc:'Named. Then unnamed. Then given away.' },
  { id:'octagon',    name:'The Summoning',    rarity:'mythical',        rarityRank:4, command:'spawn_octagon',    desc:'Something answered. It wants feeding.' },
  { id:'triad',      name:'Mass Rite',        rarity:'luck-maxxing',    rarityRank:5, command:'spawn_triad',      desc:'They came at midnight. None returned alone.' },
  { id:'star',       name:'The Entity',       rarity:'legendary-alpha', rarityRank:6, command:'spawn_star',       desc:'It was the ritual all along.' },
];

// ─── Corrupted cards (sprinkled into pristine packs) ──────────────────────────
// Choice-driven corruption: a pristine pack occasionally hides one of these.
// Picking it (dropCard) advances this phone's corruptionLevel toward the horror
// phase and spawns a corrupted creature; picking nature keeps you pristine.
//
// `command:'spawn_corrupted'` is a DEDICATED Unity command, not one of the seven
// shared pack commands. It used to send spawn_large_cube with the pack type
// forced to "flesh" and rely on uncommon-in-a-horror-pack being intercepted into
// a glitchling; when the horror packs were split so each owns one verb, that
// intercept disappeared and this card quietly started dropping boss meat instead
// of the creature it's named after. The card face is still keyed by `id`, so the
// art is unchanged.
const CORRUPTED_FLESHLING = {
  id:'large_cube', name:'Glitchling', rarity:'common', rarityRank:0,
  command:'spawn_corrupted', corrupted:true,
  desc:'Small. Hungry. It found you first.',
};
// Chance a pristine pack hides a corrupted card. Near-guaranteed: in a session
// lasting minutes rather than weeks, the choice between nature and corruption
// has to be put in front of a player almost every pull, or most people leave
// having never been offered it.
const CORRUPTED_CARD_CHANCE = 0.9;

// ─── Flock o' Sheep — rare "starlight" sheep variant ──────────────────────────
// A special rare that occasionally appears in pristine critter packs: its symbol
// floats over a starlit frame with a hovering flock of smaller sheep (rendered
// by cardTextures.buildFace via the `flock` flag). Placing it releases a small
// flock (multiple sheep) — see dropCard.
const FLOCK_O_SHEEP = {
  id:'sphere', name:"Flock o' Sheep", rarity:'rare', rarityRank:2,
  command:'spawn_small_cube', flock:true,
  desc:'A drifting constellation. It counts itself to sleep.',
};
const FLOCK_CHANCE = 0.25;   // chance a pristine critter pack offers the Flock o' Sheep

// How many sheep one Flock o' Sheep card releases.
//
// A plain constant, not a PlayerMods field. It used to scale with Presence and
// with the SHEPHERD perk; Presence now pools into the room-wide movement bonus
// and the perks are gone, so it could never vary — a knob that reads like it
// does something while always returning 3 is worse than a number.
const FLOCK_SIZE = 3;

// ─── Placement star costs ──────────────────────────────────────────────────────
// Common and uncommon are always free — lower rarities must remain accessible
// so players can contribute to the collective quests without needing currency.
// Higher rarities require stars earned through those quests.
// Numbers are intentionally tunable; keep in sync with QUEST_STAR_REWARDS in counter.js.
// ALL FREE. The currency gate moved to pack acquisition (STARS_PER_PACK in
// counter.js), which is how the games this models actually work: you pay to
// pull, then play whatever comes out.
//
// Charging to PLACE inverted that, and produced the worst moment in the piece —
// a first-time player pulls something rare, feels the hit, and is then told they
// can't use it. That has no real-world referent, so it reads as the game being
// broken rather than as a critique of anything. It also throttled the only way a
// player can damage the boss.
//
// Restore any of these to re-gate use; the lookup is still wired up.
const PLACEMENT_COSTS = {
  'common':          0,
  'uncommon':        0,
  'rare':            0,
  'legendary':       0,
  'mythical':        0,
  'luck-maxxing':    0,
  'legendary-alpha': 0,
};

// ─── Active pack type ──────────────────────────────────────────────────────────
let activePackType = 'garbage';
const PACK_TYPE_ORDER = ['garbage', 'ewaste', 'adpack'];

// Returns the correct card pool for this phone's personal phase + active pack type.
// Personal phase is independent of the collective bar — two players can be in
// different pools simultaneously (one pulls FLESH while another pulls NATURE).
function getActiveCardPool() {
  const isHorror = corruptionLevel >= HORROR_THRESHOLD;
  if (activePackType === 'garbage') return isHorror ? FLESH_CARDS   : NATURE_CARDS;
  if (activePackType === 'ewaste')  return isHorror ? SCOURGE_CARDS : CRITTER_CARDS;
  if (activePackType === 'adpack')  return isHorror ? RITUAL_CARDS  : FUNGI_CARDS;
  return NATURE_CARDS;
}

// ─── Corruption / progression ──────────────────────────────────────────────────
// packsOpened — collective Unity count (still received from server broadcasts).
// No bar displayed; kept for logging and legacy pack_type_* fallback.
let packsOpened = 0;
// corruptionLevel — THIS phone's corruption: how many CORRUPTED cards it has
// chosen to spawn. Phase is now choice-driven (NOT pack-count): plant nature and
// stay pristine; pick corrupted cards to advance toward horror. Drives:
//   card pool · tab labels · pristine-phase CSS · glitch transition · horror spin
let corruptionLevel = 0;
let _prevPersonalLevel  = 0;
const HORROR_THRESHOLD = 8;   // corrupted cards chosen before the horror phase begins
const CORRUPTION_MAX   = 11;  // max corruption level (HORROR_THRESHOLD + a few horror ticks)
// Expose the threshold so cardTextures.js / Pack3d.js (which read the body's
// corruption dataset) agree on where horror begins.
window.HORROR_THRESHOLD = HORROR_THRESHOLD;

// Drives everything tied to THIS phone's personal phase (called on every pull
// and on WS reconnect). Does NOT touch the collective bar or packsOpened.
// ── Boss defeat cleanses this phone ─────────────────────────────────────────
// Unity broadcasts "corruption_cleansed" when the room kills the boss.
//
// Lives in main.js rather than corruption-bar.js because that file is currently
// shelved (its <script> tag is commented out in index.html), so a handler there
// would never run — and this is the ONLY way out of personal horror phase.
// corruptionLevel is otherwise write-once-upward: placing a corrupted card
// increments it and nothing decrements it, so a player who crossed over stayed
// corrupted for the session and kept re-summoning the boss with every legendary.
function handleCleanseMessage(data) {
  if (typeof data !== 'string') return false;
  const msg = data.startsWith('web:') ? data.slice(4).trim() : data.trim();
  if (msg !== 'corruption_cleansed') return false;

  if (corruptionLevel > 0) {
    corruptionLevel = 0;
    // Repoints pack tabs, card pools and card art back to nature. Also resets
    // _prevPersonalLevel, so a later re-crossing still fires the glitch
    // transition and the boss summon rather than being swallowed.
    updatePersonalPhase();
    sendPackType();
    console.log('[corruption] cleansed by boss defeat — back to nature phase');
  }
  return true;
}

// ─── Love mail ────────────────────────────────────────────────────────────────
// Post-boss phase. Unity sends "lovemail|needed|opened|secondsLeft|declined"
// while a window is open and "lovemail_end" when it closes either way.
//
// Reply and Open are the same message with a different verb, because there is no
// answer to this mail that isn't a yes. The X is the only refusal, and it does
// not lower what the room needs.

let _loveMailOpen    = false;   // a window is live
let _loveMailAnswered = false;  // this phone has already clicked something
let _loveMailReturn  = null;    // screen to restore when it closes

function handleLoveMailMessage(data) {
  if (typeof data !== 'string') return false;
  const msg = data.startsWith('web:') ? data.slice(4).trim() : data.trim();

  if (msg === 'lovemail_end') {
    if (!_loveMailOpen) return true;
    _loveMailOpen = false;
    _loveMailAnswered = false;
    // Don't yank a player out of whatever they moved on to.
    if (document.getElementById('screen-lovemail') &&
        !document.getElementById('screen-lovemail').classList.contains('hidden')) {
      showScreen(_loveMailReturn || 'screen-pack');
    }
    _loveMailReturn = null;
    return true;
  }

  if (!msg.startsWith('lovemail|')) return false;

  const [, needed, opened, secs] = msg.split('|');

  if (!_loveMailOpen) {
    _loveMailOpen = true;
    _loveMailAnswered = false;
    // Remember where they were so closing returns them there.
    const current = document.querySelector('.screen:not(.hidden)');
    _loveMailReturn = current ? current.id : 'screen-pack';
    showScreen('screen-lovemail');
  }

  const status = document.getElementById('loveMailStatus');
  if (status) {
    status.textContent = _loveMailAnswered
      ? `SENT.  ${opened}/${needed}`
      : `${opened}/${needed} OPENED   ${secs}s`;
  }
  return true;
}

function _loveMailSend(action) {
  if (!_loveMailOpen || _loveMailAnswered) return;
  _loveMailAnswered = true;
  if (typeof CLIENT_ID !== 'undefined') send(`lovemail_click|${CLIENT_ID}|${action}`);
}

function loveMailOpen()    { _loveMailSend('open');  _loveMailDismiss(); }
function loveMailReply()   { _loveMailSend('reply'); _loveMailDismiss(); }
function loveMailDecline() { _loveMailSend('no');    _loveMailDismiss(); }

// Whatever they chose, the window goes away for them. The room's count keeps
// running on the shared screen.
function _loveMailDismiss() {
  showScreen(_loveMailReturn || 'screen-pack');
}

// ─── Soul recovery ────────────────────────────────────────────────────────────
// Unity sends "soul_recovery|needed|yes|no" while the vote is open and
// "soul_recovery_end" when it closes either way.
//
// This screen is force-shown over WHATEVER the player is doing. An earlier
// version queued it until the current action finished, which is why a playtest
// stranded everyone who was mid-placement or steering a creature when the tree
// died: the action they were waiting to finish could never finish, because the
// world it belonged to was gone.

let _soulOpen   = false;
let _soulVoted  = false;
let _soulReturn = null;

function handleSoulMessage(data) {
  if (typeof data !== 'string') return false;
  const msg = data.startsWith('web:') ? data.slice(4).trim() : data.trim();

  if (msg === 'soul_recovery_end') {
    if (!_soulOpen) return true;
    _soulOpen = false;
    _soulVoted = false;
    showScreen(_soulReturn || 'screen-pack');
    _soulReturn = null;
    return true;
  }

  if (!msg.startsWith('soul_recovery|')) return false;

  const [, needed, yes, no] = msg.split('|');

  if (!_soulOpen) {
    _soulOpen  = true;
    _soulVoted = false;
    const cur  = document.querySelector('.screen:not(.hidden)');
    // Never return them to a placement screen — that session is already over.
    _soulReturn = (cur && cur.id !== 'screen-soul' && cur.id !== 'screen-place')
                ? cur.id : 'screen-pack';
    _soulForceOut();
    showScreen('screen-soul');
    const sent = document.getElementById('soulSent');
    if (sent) sent.classList.add('hidden');
    // Restored here, not in submitSoulVote — the tree can wither more than once
    // in a session and the second prompt has to be answerable.
    const btns = document.querySelector('#screen-soul .soul-ask-btns');
    if (btns) btns.classList.remove('hidden');
  }

  // The tally is no longer displayed. It is still parsed, because Unity keeps
  // sending it and the next person to reach for it should find it here rather
  // than re-deriving it — but showing a running count under the question tells
  // an undecided player what everyone else picked, which is the one thing a
  // collective decision should not lead with.
  return true;
}

// Tears down anything that owns the screen or an input loop. Unity has already
// ended the underlying sessions; this is the phone catching up so the prompt
// isn't drawn underneath a joystick.
function _soulForceOut() {
  // DOM level only, on purpose. Unity's CancelAllSessions already broadcast
  // placement_done, which possession.js handles through its own teardown — this
  // is only here in case that message is lost or arrives late, so it must not
  // depend on any function inside another module.
  ['poss-place-overlay', 'comboPath', 'comboPrompt'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active', 'open');
  });
}

function submitSoulVote(yes) {
  if (!_soulOpen || _soulVoted) return;
  _soulVoted = true;
  if (typeof CLIENT_ID !== 'undefined') send(`soul_vote|${CLIENT_ID}|${yes ? 'yes' : 'no'}`);

  // Answered — swap the buttons for the acknowledgement rather than leaving a
  // live-looking choice on screen that no longer does anything.
  const btns = document.querySelector('#screen-soul .soul-ask-btns');
  if (btns) btns.classList.add('hidden');
  const sent = document.getElementById('soulSent');
  if (sent) sent.classList.remove('hidden');
}

// Failsafe. If the console is ever shown with no way out — a dropped connection,
// a Unity crash, a bug we have not found — this releases the phone locally
// without waiting for Unity. It does not resolve the vote, it just stops one
// person being trapped.
function debugForceCloseSoul() {
  _soulOpen = false;
  _soulVoted = false;
  showScreen(_soulReturn || 'screen-pack');
  _soulReturn = null;
  console.warn('[soul] force-closed locally');
}

function updatePersonalPhase() {
  const level      = corruptionLevel;
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
  const isHorror = corruptionLevel >= HORROR_THRESHOLD;
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
  if (sp) sp.classList.toggle('adpack-active', type === 'adpack' && corruptionLevel >= HORROR_THRESHOLD);
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

// Holographic finish — pilot is gated to the critter pool. 40% of packs contain
// exactly ONE holo, placed on a randomly chosen rarity present in the pack
// (one per pack, one per rarity category).
const HOLO_PACK_CHANCE = 0.40;
// How much likelier a COMMON is to receive the pack's holo than any other rarity.
// Tuned so a prismatic Thornwire (3 charges instead of 1) lands about 1 pack in
// 3.5 — see the holo roll at the end of rollPack(). 1 = uniform across rarities.
const HOLO_COMMON_WEIGHT = 4.0;

// ─── Distinct-card packs ──────────────────────────────────────────────────────
// Every pool holds exactly ONE card per rarity, and pick() resolves by rarity —
// so the old composition (common, common, uncommon, top) always produced two
// identical commons, and a second duplicate whenever the top card rolled
// uncommon. Packs routinely showed four slots holding two or three different
// things.
//
// A retention-driven game WANTS duplicates: they're what makes a collection feel
// unfinished. This is a walk-up experience where most people open a handful of
// packs and never return, so breadth beats grind — the middle slots now draw
// DISTINCT rarities, which in these pools means distinct cards.
//
// Weighted low so variety doesn't quietly turn every pack into a jackpot: most
// packs still land uncommon + rare, with a legendary surfacing occasionally.
// Rare is weighted close to uncommon rather than half of it: at 90% corruption
// most packs have only ONE filler slot, so a heavy uncommon bias would make that
// slot the same card nearly every time — the sameness this was meant to fix.
// legendary and above are NOT here — they're headline-only, see below. They used
// to be included at low weight, but for a 3-tier pool (Nature, Fungi) removing
// the top card's own tier leaves exactly 2 candidates for the 2 filler slots —
// both get drawn every time, no randomness left. That made a legendary appear as
// FILLER in almost every pack whenever it wasn't already the headline, which is
// why legendaries were showing up far more than the top-card odds alone suggest.
// Filler now only ever draws from uncommon/rare, so legendary stays a genuine
// headline event instead of a near-guaranteed extra.
const FILLER_TIER_WEIGHTS = {
  'uncommon': 5,
  'rare':     4,
};

// Nature/Fungi are now trimmed to common..legendary and Critter has a gap at
// mythical/luck-maxxing (see the card lists above), so a filler draw can no
// longer assume all 7 tiers exist. `activePool` restricts the candidates to
// tiers actually present, so e.g. rolling 'mythical' filler for Nature is no
// longer possible — pick('mythical') on that pool would return an empty object
// (no command, no rarity) and silently corrupt the pack.
function pickFillerTiers(count, excludeTier, activePool) {
  const present = new Set(activePool.map(c => c.rarity));
  // 'common' is excluded because it's always slot 0 — see rollPack.
  const pool = Object.keys(FILLER_TIER_WEIGHTS).filter(t => t !== excludeTier && present.has(t));
  const out  = [];

  for (let i = 0; i < count && pool.length; i++) {
    const total = pool.reduce((a, t) => a + FILLER_TIER_WEIGHTS[t], 0);
    let r = Math.random() * total;
    let idx = 0;
    while (idx < pool.length - 1 && r >= FILLER_TIER_WEIGHTS[pool[idx]]) {
      r -= FILLER_TIER_WEIGHTS[pool[idx]];
      idx++;
    }
    out.push(pool[idx]);
    pool.splice(idx, 1);   // drawn without replacement, so the slots stay distinct
  }

  // Backfill with commons if the pool ran dry.
  //
  // FILLER_TIER_WEIGHTS only holds uncommon and rare, and the top card's own
  // rarity is excluded from it — so a rare or uncommon headline pull left just
  // ONE tier to draw from and the pack silently came out at three cards instead
  // of four. A second common is the right filler: it keeps the "no two slots
  // share a rarity" rule everywhere it matters (the middle slots are still
  // distinct from each other and from the headline), it costs nothing against
  // the legendary odds that were just rebalanced, and duplicate commons are
  // ordinary in the genre this imitates.
  while (out.length < count) out.push('common');

  return out;
}

// Relative weights for the pack's headline pull.
//
// Was a fixed if/else bracket chain rolled against Math.random(), which assumed
// every pool had all 6 non-common tiers. Nature and Fungi are now trimmed to
// common..legendary and Critter has a gap at mythical/luck-maxxing, so that
// chain would have called pick('mythical') etc. on pools that don't have one —
// pick() would return a spread of `undefined` (no command, no rarity, no
// rarityRank), and that broken object would go straight into the pack, breaking
// the sort and the eventual spawn. rollTopCard renormalises the weights over
// only the tiers the ACTIVE pool actually has, so it degrades cleanly for any
// pool shape instead of assuming the full 7-tier ladder.
//
// legendary DROPPED 18 → 11. With filler no longer able to award a legendary
// (see FILLER_TIER_WEIGHTS), this is now the ONLY source of a legendary pull, so
// it had to be retuned on its own terms rather than inheriting a weight that was
// originally set alongside a filler path that doubled its real frequency.
// Target was roughly 2–3 legendary pulls across a ~13-pack session:
//   Nature / Fungi   (3 tiers: uncommon+rare+legendary)         11/73  ≈ 15.1%
//   Critter          (4 tiers, + legendary-alpha)               11/77  ≈ 14.3%
//   Flesh/Scourge/Ritual (all 7 tiers)                          11/93  ≈ 11.8%
// The horror pools land a little under target — acceptable, since a rarer
// legendary pull on the corrupting side isn't the reported problem.
const TOP_CARD_WEIGHTS = {
  'uncommon':        28,
  'rare':            34,
  'legendary':       11,
  'mythical':        10,
  'luck-maxxing':    6,
  'legendary-alpha': 4,
};

function rollTopCard(activePool) {
  const present = new Set(activePool.map(c => c.rarity));
  const tiers   = Object.keys(TOP_CARD_WEIGHTS).filter(t => present.has(t));
  const total   = tiers.reduce((a, t) => a + TOP_CARD_WEIGHTS[t], 0);

  let r = Math.random() * total;
  for (const t of tiers) {
    if (r < TOP_CARD_WEIGHTS[t]) return pick(t);
    r -= TOP_CARD_WEIGHTS[t];
  }
  return pick(tiers[tiers.length - 1]);   // float-rounding fallback
}

// Where an injected special (Flock, corrupted Fleshling) should land.
//
// Both used to hard-target the common slot, which was fine at a 50% corruption
// rate but not at 90%: the Fleshling would overwrite a Flock o' Sheep almost
// every time it appeared, quietly deleting that card from the game. This finds
// the next-best slot instead of clobbering an existing special.
function injectionSlot(cards, topCard, preferCommon) {
  const free = i => {
    const c = cards[i];
    return c !== topCard && !c.flock && !c.corrupted;
  };

  if (preferCommon) {
    const ci = cards.findIndex((c, i) => c.rarity === 'common' && free(i));
    if (ci >= 0) return ci;
  }

  // Lowest-rarity ordinary card that isn't the pack's headline pull.
  let best = -1;
  for (let i = 0; i < cards.length; i++) {
    if (!free(i)) continue;
    if (best < 0 || cards[i].rarityRank < cards[best].rarityRank) best = i;
  }
  return best;
}

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
  // Headline pull — weighted per TOP_CARD_WEIGHTS, restricted to whatever tiers
  // the active pool actually has (see rollTopCard above).
  const activePool = getActiveCardPool();
  let topCard = rollTopCard(activePool);

  // Guaranteed Legendary voucher (bought in the pristine shop). Forces the top
  // card to the Emerald Serpent (critter legendary-alpha) — the only legendary
  // creature available right now. Update this once more legendaries exist.
  if (window._guaranteedLegendary) {
    topCard = { ...CRITTER_CARDS.find(c => c.rarity === 'legendary-alpha') };
    window._guaranteedLegendary = false;
  }

  // Choice-driven corruption — decided BEFORE the pack is built, because the
  // Fleshling now gets a slot of its own rather than overwriting one.
  //
  // It used to replace the pool's common, which was survivable at 50% but not at
  // 90%: Thornwire is the nature pool's only common and carries the whole
  // thornwire mechanic (including the prismatic 3-charge variant), so it would
  // have vanished from nine packs in ten. The Fleshling is its own kind of
  // common — the corrupted counterpart to the pool's entry card, sitting beside
  // it rather than in place of it. Seeing both together is also what makes the
  // pack read as a CHOICE.
  const corrupted = corruptionLevel < HORROR_THRESHOLD
                 && Math.random() < CORRUPTED_CARD_CHANCE;

  // Slot 0 is always the pool's common. The middle slots draw distinct rarities
  // (see pickFillerTiers), so no two cards in a pack are ever the same — and the
  // Fleshling takes one of those slots when it appears.
  cards.push(pick('common'));
  for (const tier of pickFillerTiers(corrupted ? 1 : 2, topCard.rarity, activePool))
    cards.push(pick(tier));
  if (corrupted) cards.push({ ...CORRUPTED_FLESHLING });
  cards.push(topCard);

  // Stable sort, so the two rank-0 cards keep insertion order: the pool's common
  // first, its corrupted counterpart immediately after it.
  cards.sort((a, b) => a.rarityRank - b.rarityRank);
  // Flock o' Sheep — a starlight rare that occasionally replaces a common in a
  // pristine critter pack (keeping the uncommon Duck). Re-sorted below to its
  // rare position, so it appears to the RIGHT of the Duck.
  if (getActiveCardPool() === CRITTER_CARDS && corruptionLevel < HORROR_THRESHOLD
      && Math.random() < FLOCK_CHANCE) {
    const fi = injectionSlot(cards, topCard, true);
    if (fi >= 0) cards[fi] = { ...FLOCK_O_SHEEP };
  }

  // ── Holographic finish roll — critter + nature pools ────────────────────────
  // Runs LAST, after the Flock and corrupted injections. It used to run before
  // them, which silently destroyed prismatic pulls: both injections REPLACE a
  // common, and Thornwire is the only common in the nature pool, so a 50%
  // corrupted roll was frequently overwriting the holo that had just been
  // assigned to it.
  //
  // The holo lands on one randomly chosen rarity present in the pack, but the
  // draw is WEIGHTED toward commons (HOLO_COMMON_WEIGHT). A prismatic Thornwire
  // is a genuine mechanical upgrade — three charges instead of one — so it needs
  // to show up often enough to be part of the game rather than a curiosity.
  // Injected specials (Flock, corrupted) are excluded: they already have their
  // own distinct treatment and shouldn't be double-skinned.
  const _holoPool = getActiveCardPool();
  if ((_holoPool === CRITTER_CARDS || _holoPool === NATURE_CARDS) &&
      Math.random() < HOLO_PACK_CHANCE) {
    const eligible = cards.filter(c => !c.corrupted && !c.flock);
    const rarities = [...new Set(eligible.map(c => c.rarity))];
    if (rarities.length) {
      const weights = rarities.map(r => (r === 'common' ? HOLO_COMMON_WEIGHT : 1));
      const total   = weights.reduce((a, b) => a + b, 0);
      let roll = Math.random() * total;
      let ri = 0;
      while (ri < rarities.length - 1 && roll >= weights[ri]) { roll -= weights[ri]; ri++; }
      const pool = eligible.filter(c => c.rarity === rarities[ri]);
      pool[Math.floor(Math.random() * pool.length)].variant = 'holo';
    }
  }

  // Re-sort so injected specials land in rarity order (the rare Flock o' Sheep
  // sits to the right of the uncommon Duck; the common corrupted card stays left).
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
  // Show WHICH relay, not just up/down. The failure that cost a whole testing
  // session was a phone with a perfectly healthy socket open to a server Unity
  // wasn't on — indistinguishable from working, because the only thing on screen
  // said "live". The host is the one fact that would have caught it instantly.
  const host = (() => {
    try { return new URL(WS_URL).host.replace('unitywebapp.onrender.com', 'render')
                                     .replace('packmentality.cc', 'cc'); }
    catch (e) { return '?'; }
  })();
  label.textContent = connected ? `live · ${host}` : `offline · ${host}`;
  if (label.parentElement) label.parentElement.title = WS_URL;
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
// Wire protocol:  set_name|<CLIENT_ID>|<NAME>|<#RRGGBB>|<PRISMATIC>|<TITLE>
//   field 5 = "1" when the prismatic cosmetic is owned
//   field 6 = purchased title WITHOUT brackets, e.g. THE BEST PLAYTESTER
// Both trail the original three fields, so an older relay or an older Unity
// build simply ignores them.
let playerName   = '';
// A purchased title. Semi-permanent, so it has to ride EVERY set_name — Unity
// only overwrites its stored title when field 6 is present.
let playerTitle  = '';
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

// One builder for all three send sites. They used to compose the message
// separately and had already drifted: the reconnect handler sent three fields
// and silently dropped the prismatic flag, so a phone that reconnected lost its
// cosmetic until it bought another one.
function _setNamePayload() {
  const prismatic = (typeof _prismaticOwned !== 'undefined' && _prismaticOwned) ? '1' : '';
  return `set_name|${CLIENT_ID}|${playerName}|${playerColor}|${prismatic}|${playerTitle}`;
}

function sendSetName() {
  if (ws && ws.readyState === WebSocket.OPEN && playerName) ws.send(_setNamePayload());
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
  sendSetName();
  // Show the player's persistent name tag on the pack screen, in their colour.
  const tag = document.getElementById('playerNametag');
  if (tag) {
    tag.textContent     = `<${playerName}>`;
    tag.style.color     = playerColor;
    tag.style.display   = 'block';
  }
  // Reveal the persistent LV badge above the tag + make the tag open the stats
  // window, both tinted to the player's colour.
  if (typeof Player !== 'undefined' && Player.reveal) Player.reveal(playerColor);
  document.getElementById('screen-name').classList.add('hidden');
  document.getElementById('screen-pack').classList.remove('hidden');
}

// Render the purchased title under the phone's own name tag.
//
// Under rather than inline, unlike the world label and the roster: the pack
// screen has vertical room, and a title reads as a second, quieter line of
// identity there. Rebuilt from scratch each call so buying and re-rendering
// cannot stack two of them.
function applyTitleNametag() {
  const tag = document.getElementById('playerNametag');
  if (!tag) return;

  let el = document.getElementById('playerTitleTag');
  if (!playerTitle) { if (el) el.remove(); return; }

  if (!el) {
    el = document.createElement('div');
    el.id = 'playerTitleTag';
    // After the tag, not inside it — the tag's own colour and the prismatic
    // gradient are set on that element, and a child would inherit both.
    tag.insertAdjacentElement('afterend', el);
  }
  el.textContent = `<${playerTitle}>`;
}

// Apply the prismatic CSS to the web name tag immediately when purchased.
function applyPrismaticNametag() {
  const tag = document.getElementById('playerNametag');
  if (tag) {
    tag.classList.add('prismatic');
    tag.style.color = '';  // let CSS gradient take over
     
 
  }
}

// Re-broadcast identity so Unity picks up a cosmetic the moment it is bought.
function reSendSetName() { sendSetName(); }

function connect() {
  try {
    _wsHadOpenThisAttempt = false;
    // NOT gated behind WS_DEBUG. Which relay this phone is talking to is the one
    // line worth having in every console, every time — it's the fact that makes a
    // phone/Unity mismatch obvious instead of invisible.
    console.log('[WS] Connecting to', WS_URL);
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => {
      _wsHadOpenThisAttempt = true;
      setStatus(true);
      ws.send('web_client');
      clearTimeout(reconnectTimer);
      sendPackType();
      updatePossessionWS();
      sendSetName();
    };
    ws.onclose = () => {
      setStatus(false);
      // AUTOMATIC FAILOVER REMOVED — retry the same endpoint forever.
      //
      // The two relays are independent servers with nothing bridging them, and
      // Unity failed over on its own schedule, so the two sides could silently
      // settle on different ones. A phone in that state looks completely healthy:
      // the socket is open, packs open, cards render — but every message goes to
      // a relay Unity isn't listening to, so names never register and nothing
      // ever spawns.
      //
      // It only took ONE failed attempt to strand a phone there, which is why it
      // hit 5G users hardest: mobile first-connections lose that race far more
      // often than Wi-Fi ones. Retrying the same URL is strictly better — a phone
      // that can't reach the server fails visibly instead of half-working.
      reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      if (WS_DEBUG) console.log('[WS]', e.data);
      // Player progression watches the raw stream for "playing in Unity" signals
      // (possession ticks → Vigor XP). Runs before routing returns short-circuit.
      if (typeof Player !== 'undefined') Player.observe(e.data);
      // Order matters: corruption messages are checked first because they're
      // high-frequency (every 0.5s) and we want to short-circuit early.
      if (handleSoulMessage(e.data)) return;
      if (handleCleanseMessage(e.data)) return;
      if (typeof handleCorruptionMessage === 'function' && handleCorruptionMessage(e.data)) return;
      if (handleSoulTreeGoal(e.data)) return;
      if (handleQuestMessage(e.data)) return;
      if (handleLoveMailMessage(e.data)) return;
      if (typeof Announce !== 'undefined' && Announce.handleMessage(e.data)) return;
      if (typeof Combo    !== 'undefined' && Combo.handleMessage(e.data))    return;
      if (typeof Player   !== 'undefined' && Player.handleMessage(e.data))   return;
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

// Soul Tree objectives, straight through to the Main Task row. Both messages
// already existed — the site's per-flower count was being broadcast and simply
// had nothing listening on the phone.
// Guards against the relay echoing a reward, or a late-joining phone replaying
// one it has already been paid for. Keyed on stage name because each stage is
// reached exactly once per tree.
const _soulRewardsPaid = new Set();

function handleSoulTreeGoal(data) {
  if (typeof data !== 'string') return false;
  const msg = data.startsWith('web:') ? data.slice(4).trim() : data.trim();

  // soultree_reward|stageName|stars — the room is paid for reaching a stage.
  // Handled BEFORE the TaskTracker guard below: the payout does not depend on
  // the task UI existing, and a missing TaskTracker should not cost the room
  // its stars.
  if (msg.startsWith('soultree_reward|')) {
    const p     = msg.split('|');
    const stage = p[1] || '';
    const stars = parseInt(p[2]) || 0;
    if (stars > 0 && !_soulRewardsPaid.has(stage)) {
      _soulRewardsPaid.add(stage);
      if (typeof addStars === 'function') addStars(stars);
      if (typeof showRewardToast === 'function')
        showRewardToast(`<${stage.toUpperCase()}> REACHED`, stars);
    }
    return true;
  }

  if (typeof TaskTracker === 'undefined') return false;

  if (msg.startsWith('soultree_site|')) {
    const p = msg.split('|');
    TaskTracker.setSeedProgress(parseInt(p[1]) || 0, parseInt(p[2]) || 0,
                                parseInt(p[3]) || 0);
    return true;
  }
  if (msg.startsWith('soultree_goal|')) {
    const p = msg.split('|');
    TaskTracker.setTreeGoal(p[1] || '', parseInt(p[2]) || 0, parseInt(p[3]) || 0,
                            parseInt(p[4]) || 0, p[5] === '1', p[6] === '1',
                            parseInt(p[7]) || 0);
    return true;
  }
  return false;
}

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
  showRewardToast(`QUEST: ${label}`, starsEarned);
}

// The same toast, without the QUEST prefix. Split out because the soul tree
// pays the room for reaching a stage, and "QUEST: SEEDLING" describes something
// the player was never given.
function showRewardToast(label, starsEarned) {
  const el = document.getElementById('questToast');
  if (!el) return;
  el.textContent = `${label}  +${starsEarned} ★`;
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
  const isHorror = corruptionLevel >= HORROR_THRESHOLD;
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

// Set by UI that closes a full-screen overlay (see possession.js). Guards against
// click-through: a tap that dismisses an overlay ends with the finger lifting
// over whatever was underneath, and the pack canvas opens on `click`. Without
// this, throwing a thornwire on the minimap immediately tore open a new pack.
window.suppressPackOpenUntil = 0;

// ─── Pack-open re-entry guard ─────────────────────────────────────────────────
// Tapping the pack again mid-animation used to restart the sequence from the
// top. consumePack() had already run, so the player was charged a pack, the
// in-flight reveal was thrown away, and nothing was ever spawned from it — a
// spammed tap could burn an inventory in seconds and produce nothing.
//
// The guard has to sit BEFORE consumePack, or the pack is spent before we decide
// to ignore the tap.
let _packOpening = false;
let _packOpenWatchdog = null;

function _beginPackOpen() {
  _packOpening = true;
  // Nothing may leave this flag set forever. Every exit clears it, but a bug in
  // any one of those paths would lock the player out of the whole game, so a
  // watchdog releases it regardless. Generous, because it should never be what
  // actually clears the flag.
  clearTimeout(_packOpenWatchdog);
  _packOpenWatchdog = setTimeout(() => {
    if (!_packOpening) return;
    console.warn('[pack] Watchdog released the open guard — a completion path did not clear it');
    _packOpening = false;
  }, 12000);
}

function _endPackOpen() {
  _packOpening = false;
  clearTimeout(_packOpenWatchdog);
  _packOpenWatchdog = null;
}

function triggerPackOpen(dir) {
  if (Date.now() < (window.suppressPackOpenUntil || 0)) {
    console.log('[pack] Open suppressed — overlay just closed under the pointer');
    return;
  }
  if (_packOpening) {
    console.log('[pack] Ignored — an open is already running');
    return;
  }
  if (!consumePack()) return;
  _beginPackOpen();
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
  _endPackOpen();
  showScreen('screen-pack');
}

function doPackOpen(dir) {
  // Armed here as well as in triggerPackOpen, because the adpack prompt calls
  // straight in and would otherwise run an unguarded open. Idempotent — arming
  // twice just resets the watchdog.
  _beginPackOpen();

  // Pack-opening sound — no-op unless "sound on" was ticked on the name screen.
  if (typeof Sound !== 'undefined') Sound.play('packOpen');

  // Roll the pack FIRST so we know the top card's rarity before we tell Unity.
  // Rarity is forwarded in the pack_opened message so CorruptionManager can
  // scale the damage: common pulls add less corruption, legendary pulls add more.
  // "Engagement is the damage — and rarity is the intensity."
  packCards      = rollPack();
  revealIndex    = 0;
  godPackClaimed = [];

  // ── Personal phase sync ────────────────────────────────────────────────────
  // Opening a pack no longer advances the phase — corruption is now choice-driven
  // (only placing a corrupted card raises corruptionLevel; see dropCard). We
  // still re-sync here so tab labels / theme / sendPackType stay correct.
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
  const _gpHorror = corruptionLevel >= HORROR_THRESHOLD;
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
  // The reveal is over and the player is choosing — safe to arm the pack again.
  _endPackOpen();
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
  _endPackOpen();
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

  // Corrupted card — choice-driven corruption. Placing it advances THIS phone
  // toward the horror phase (HORROR_THRESHOLD → flip) and spawns a corrupted
  // creature (forced "flesh" pack type → Unity spawns a Fleshling). Doesn't
  // count toward placement tasks or the collection.
  if (card.corrupted) {
    corruptionLevel++;
    updatePersonalPhase();
    if (typeof CLIENT_ID !== 'undefined') send(`${card.command}|${CLIENT_ID}|flesh`);
    resetToPackScreen();
    return;
  }

  // Individual tasks: "Place 5 things" + "First legendary"
  if (typeof TaskTracker !== 'undefined') {
    TaskTracker.recordEvent('placement', { rarity: card.rarity });
  }

  // Session collection — the card is now claimed
  if (typeof Collection !== 'undefined') Collection.record(card);

  // Player progression — releasing a critter into the world feeds Presence.
  if (typeof Player !== 'undefined') Player.gainXP('presence', 12);

  // Flock o' Sheep — releases a small flock instead of one sheep. Kept as a
  // proof of concept for batch-release cards; FLOCK_SIZE is fixed.
  if (card.flock) {
    if (typeof CLIENT_ID !== 'undefined') {
      // 4th field carries the finish, 5th the origin. Both are trailing, so an
      // older Unity build still spawns plain sheep rather than erroring.
      // "flock" is what upgrades their missile to the splitting warhead.
      const flockFinish = card.variant === 'holo' ? 'holo' : '';
      for (let n = 0; n < FLOCK_SIZE; n++)
        send(`spawn_small_cube|${CLIENT_ID}|critter|${flockFinish}|flock`);
    }
    resetToPackScreen();
    return;
  }

  // Ability cards (Leaf Storm) open the figure-eight trace panel instead of the
  // joystick placement modal or a direct spawn. The card is already claimed at
  // this point (Collection.record/XP above), matching how a placement card is
  // "spent" the moment its session opens rather than only on success — same
  // convention as thornwire, which can also fail to find ground after being
  // claimed.
  if (card.ability && typeof Combo !== 'undefined' && typeof Combo.beginAbilityTrace === 'function') {
    // The finish rides along, same convention as placement_request above: a HOLO
    // pull makes the ability itself holo, not just the card art in the pack.
    Combo.beginAbilityTrace(card.ability, card.name,
                            card.variant === 'holo' ? 'holo' : '');
    resetToPackScreen();
    return;
  }

  // Placement cards get their own modal regardless of phase.
  // The finish rides along as a 6th field so Unity can make the placed object
  // shimmer — and, for Thornwire, grant a prismatic pull its extra charges.
  if (card.placement && typeof CLIENT_ID !== 'undefined') {
    const placeFinish = card.variant === 'holo' ? 'holo' : '';
    send(`placement_request|${CLIENT_ID}|${card.placement}|${card.rarity}|${card.name}|${placeFinish}`);
    resetToPackScreen();
    return;
  }

  // Personal horror phase (non-godpack) gets an extra variant spin before spawning.
  // Uses corruptionLevel — each phone's own phase, not the collective bar.
  const isHorror = corruptionLevel >= HORROR_THRESHOLD;
  if (isHorror && !isGodPack) {
    showHorrorSpin(card);   // resetToPackScreen() fires inside the spin confirm
    return;
  }

  // Tag spawn commands with CLIENT_ID + personal pack type so Unity routes
  // this spawn to the correct object set (nature vs flesh etc.) for THIS player,
  // independent of what other phones are currently sending. A holo finish rides
  // as an optional 4th field so Unity can spawn a holographic object.
  const finish = card.variant === 'holo' ? '|holo' : '';
  send(`${card.command}|${CLIENT_ID}|${getUnityPackType()}${finish}`);
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

// ── Debug menu gate ──────────────────────────────────────────────────────────
// The cogwheel starts hidden (class="debug-hidden" in the markup) and is only
// revealed when the page is opened with ?debug — or #debug, since some QR and
// link handlers strip query strings but keep the fragment.
//
// Markup-first rather than JS-first: the menu is hidden in the HTML and shown by
// script, so a JS error leaves it OFF. The other way round, any failure before
// this line would leave the debug controls sitting on a player's screen.
(function _gateDebugMenu() {
  const on = /(^|[?&])debug/.test(location.search) ||
             /(^|#)debug/.test(location.hash);
  if (!on) return;
  const apply = () => {
    const el = document.getElementById('debug-menu');
    if (el) el.classList.remove('debug-hidden');
  };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();

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
// Flips corruptionLevel between 0 (pristine) and HORROR_THRESHOLD so the
// transition logic — tab swaps, glitch effect, pack type sync — fires exactly
// as it would after a real grind. Remove this block + the HTML button +
// the CSS rule before production.

function debugTogglePhase() {
  const btn = document.getElementById('debugPhaseBtn');
  const inHorror = corruptionLevel >= HORROR_THRESHOLD;

  // TWO separate things have to move, and only doing one is why this stopped
  // working:
  //
  //   1. Unity's COLLECTIVE corruption bar — the world's state.
  //   2. This phone's PERSONAL corruption level — which is what actually drives
  //      the pack tabs, the card pools and the card art on this device.
  //
  // corruptionLevel is only ever incremented by placing a corrupted card, so
  // messaging Unity alone left the world corrupted while the phone stayed
  // resolutely in nature phase. updatePersonalPhase() is what flips the UI.
  send(inHorror ? 'debug_corruption_reset' : 'debug_corruption_horror');

  corruptionLevel = inHorror ? 0 : HORROR_THRESHOLD;
  updatePersonalPhase();
  sendPackType();   // the active pack tab means a different pool now

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

// Grants one attribute level so the stat branches on the name tag can be seen
// without grinding XP. Cycles DEX → PRE → VIG, so the first three taps fan out
// one branch each and every tap after that stacks another node onto an existing
// branch — which is both behaviours the branch UI needs to prove.
//
// For a single long limb (to check the off-screen clamp), call it directly:
//   Player.debugLevel('dexterity', 5)
let _debugStatIdx = 0;
const DEBUG_STAT_ORDER = ['dexterity', 'presence', 'vigor'];
function debugStatLevel() {
  if (typeof Player === 'undefined' || !Player.debugLevel) return;
  const attr = DEBUG_STAT_ORDER[_debugStatIdx % DEBUG_STAT_ORDER.length];
  _debugStatIdx++;
  Player.debugLevel(attr, 1);
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
