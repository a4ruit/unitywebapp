// spec.js — role specialisation: the game noticing how you actually play.
//
// The declared role (Roles / playerRole) does nothing mechanical, and that is
// the point — it is a promise about how you intend to play, not a stat block.
// This module watches what you ACTUALLY place, and once you have committed to
// one kind of card often enough it starts seeding your packs with more of them.
//
// Tracked on BEHAVIOUR, not on the declaration. Someone who picks TANK and then
// plays nothing but heals is a medic, and the interesting moment is the game
// telling them so. Seeding what they claimed would just be the badge restated.
//
// FOUR STREAMS, and a player ends up in exactly one.
//
// TANK, MEDIC and DAMAGE are earned on the nature side, by what you place.
// SABOTEUR is the glitchling route: take the corrupted card enough times, flip
// to the horror packs, and that IS the stream. Horror cards do not carry a
// tank/medic/damage reading at all - they are not in CARD_ROLE, and a placement
// made in the horror phase only ever advances SABOTEUR. Bolstering the boss is
// not tanking; it is sabotage that happens to look like tanking from the other
// side of the field.
//
// Whichever counter reaches the threshold first claims the player.
//
// The room-level effect is the real prize: once specialisation is on, a session
// with no medics has visibly fewer heals in circulation. Nobody has to be told
// that — the packs simply get meaner and somebody asks out loud.
//
// Exposes: Spec.record(card, horror), Spec.current(), Spec.isSaboteur(),
//          Spec.counts(), Spec.progress(), Spec.cardRole(card),
//          Spec.weight(card), Spec.tierWeight(pool, tier)
const Spec = (() => {

  // ── What each card IS ──────────────────────────────────────────────────────
  // Keyed by display name, because several cards share a placement string (the
  // bloom family, ULTRAVIOLET/INFRAMEND) and the name is what tells them apart
  // everywhere else in the build.
  //
  // Cards absent from this map are neutral: they never advance a specialisation
  // and are never seeded for or against.
  const CARD_ROLE = {
    // ── NATURE ──
    // THORNSPIKE reads defensive in its flavour text but plays as damage: it
    // throws a charge that detonates for 6 in an AOE. Tagging it tank made the
    // nature side look like it had a tank when it did not.
    'THORNSPIKE':  'damage',
    'SOLARGRIP':   'tank',      // holds the crowd so nothing else has to
    'CHOMPTRAP':   'damage',
    'FIREBLOOM':   'damage',
    'FROSTBLOOM':  'damage',
    'VENOMBLOOM':  'damage',
    'ULTRAVIOLET': 'damage',
    'INFRAMEND':   'medic',
    'CLOVERSTORM': 'damage',

    // ── FUNGI ──
    'BLOOMSHROOM': 'medic',
    'FROSTCAP':    'damage',
    'PUFFBALL':    'tank',
    'Blue Angel':  'tank',      // taunt — soaks so others don't

    // ── CRITTER ──
    'RAM':         'damage',
    'DD.DUCK':     'damage',
    'BUGFIX':      'medic',
    'C:\\GULL':    'damage',
    'LAZERPIG':    'damage',
    'COWNADO':     'damage',
    'COSMEOW':     'damage',
    'BUFFERING':   'tank',      // the rally field: the critter side's only tank

    // NOTE: the horror pools - FLESH, SCOURGE and RITUAL - are deliberately
    // ABSENT. Once a player has taken the glitchling route they are in the
    // SABOTEUR stream, and nothing they place over there reads as tank, medic
    // or damage. See record().
  };

  // Placements of one role before the game starts seeding for it.
  //
  // Counted on cards PLAYED, not cards offered. That makes it an honest number
  // and a slow one — at gallery pace a player might place a dozen things all
  // session, so this is a real commitment rather than a formality. Worth
  // re-tuning against real placement counts once you have them.
  const THRESHOLD = 7;

  // How much likelier an on-role card is once specialised.
  //
  // Capped, never exclusive. Seeding compounds — more shields offered means more
  // shields played means more shields seeded — and over a ten minute session
  // that lock-in is mostly desirable. But a player who wants to change their
  // mind has to still be able to see the door, so off-role cards keep a real
  // share of every pack.
  const ON_ROLE_WEIGHT = 2.0;

  // A tier that contains an on-role card is only nudged, not forced: this
  // decides how OFTEN you are offered the slot your card lives in, which is a
  // much blunter instrument than which card fills it.
  const ON_ROLE_TIER_WEIGHT = 1.45;

  const _counts = { tank: 0, medic: 0, damage: 0, saboteur: 0 };
  let   _spec   = null;   // one of the four streams, once a threshold is crossed

  function cardRole(card) {
    if (!card || card.corrupted) return null;
    return CARD_ROLE[card.name] || null;
  }

  function current()    { return _spec; }
  function isSaboteur() { return _spec === 'saboteur'; }
  function counts()  { return { ..._counts }; }
  function threshold() { return THRESHOLD; }

  /// How far along the player is toward their leading role, 0..1. Drives the
  /// low-key visual tell without needing a number on screen.
  function progress() {
    let best = 0;
    for (const k in _counts) if (_counts[k] > best) best = _counts[k];
    return Math.min(1, best / THRESHOLD);
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  /// Count a placed card. Called from dropCard once the placement is committed —
  /// offered cards do not count, only played ones.
  ///
  /// `horror` is true for a corrupted card, or for anything placed once this
  /// phone has flipped to the horror packs. It routes the placement to SABOTEUR
  /// and stops there: a horror card never advances tank, medic or damage, even
  /// when what it does on the field resembles one of them.
  function record(card, horror) {
    const role = horror ? 'saboteur' : cardRole(card);
    if (!role) return;

    _counts[role]++;

    // First past the post claims the player. A stream is not re-evaluated once
    // it is set — a medic who later dabbles is still a medic, and the whole
    // point of the threshold is that it recognises a commitment rather than
    // tracking a running total.
    if (!_spec && _counts[role] >= THRESHOLD) {
      _spec = role;
      _announce(role);
    }
    _paint();
  }

  // ── Seeding ────────────────────────────────────────────────────────────────

  /// Weight for one card inside its rarity tier. 1 = untouched.
  ///
  /// A SABOTEUR is seeded by nothing, and correctly so: no card carries that
  /// role, so both weight functions fall through to 1. The horror flip has
  /// already replaced their entire pool, which is a far louder version of the
  /// thing seeding does — there is nothing left to nudge.
  ///
  /// This is where specialisation actually bites, but only where a tier holds
  /// more than one card — NATURE rare (ULTRAVIOLET / INFRAMEND) and CRITTER
  /// uncommon (DD.DUCK / BUGFIX) are the two real forks in the build today.
  function weight(card) {
    if (!_spec) return 1;
    return cardRole(card) === _spec ? ON_ROLE_WEIGHT : 1;
  }

  /// Weight for a whole rarity tier, so a specialised player meets the tier
  /// their card lives in more often. With one card per tier in most pools this
  /// is what carries the effect — seeding within a tier can do nothing when the
  /// tier has only one occupant.
  function tierWeight(pool, tier) {
    if (!_spec || !Array.isArray(pool)) return 1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].rarity === tier && cardRole(pool[i]) === _spec) return ON_ROLE_TIER_WEIGHT;
    }
    return 1;
  }

  // ── The tell ───────────────────────────────────────────────────────────────

  /// Low-key by design: a body class carrying the role, which the stylesheet
  /// uses to shift the background. No banner, no modal — the change should be
  /// something a player notices on their next pull rather than something that
  /// interrupts this one.
  function _paint() {
    const b = document.body;
    if (!b) return;

    b.classList.toggle('spec-tank',     _spec === 'tank');
    b.classList.toggle('spec-medic',    _spec === 'medic');
    b.classList.toggle('spec-damage',   _spec === 'damage');
    b.classList.toggle('spec-saboteur', _spec === 'saboteur');
    b.classList.toggle('specialised',   !!_spec);
  }

  /// The moment it trips. A sound and a one-shot pulse on the background, and
  /// nothing else — no banner to dismiss. The player is mid-placement when this
  /// fires, so anything modal would land on top of the thing they were doing.
  /// What they should notice is the NEXT pack looking different.
  function _announce(role) {
    try { if (typeof Sound !== 'undefined') Sound.play('star'); } catch (e) {}

    const b = document.body;
    if (!b) return;
    b.classList.remove('spec-just-tripped');
    void b.offsetWidth;                 // restart the animation
    b.classList.add('spec-just-tripped');
    setTimeout(() => b.classList.remove('spec-just-tripped'), 2600);
  }

  return { record, current, isSaboteur, counts, progress, threshold,
           cardRole, weight, tierWeight };
})();
