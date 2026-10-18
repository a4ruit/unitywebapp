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
    'LAVACAP':     'damage',
    'SPORETILLERY':'damage',
    'PUFFBALL':    'tank',
    'AZURELURE':   'tank',      // taunt — soaks so others don't
    'MYCELIATHREAD':'medic',    // the only legendary heal on the nature side

    // ── CRITTER ──
    'RAM':         'damage',
    // Was missing entirely: a rare that detonates for 9 read as neutral, so
    // placing it advanced no stream at all.
    'FLOCKASHEEP': 'damage',
    'DD.DUCK':     'damage',
    'BUGFIX':      'medic',
    'LAZERPIG':    'damage',
    'COWNADO':     'damage',
    'COSMEOW':     'damage',
    'B.SHELLEY':   'tank',      // taunts on hit and eats it: the critter tank

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
  // Five, not seven.
  //
  // Seven was tuned when crossing it only changed pack weighting, which is a
  // nearly invisible payoff — most tiers hold one card, so a specialised pack
  // looks much like an unspecialised one. Now that it unlocks a BODY on the
  // field, the threshold has to be reachable at gallery pace, where a player
  // may only place eight or ten things in total.
  //
  // It is also exactly one tally group, which is why the tick marks can cross
  // the way a real tally does.
  const THRESHOLD = 5;

  // Per-role overrides, because the roles are not equally easy to fill.
  //
  // DAMAGE is the cheap one. Far more cards read as damage than as tank or
  // heal, so a player doing nothing in particular drifts into it — and a role
  // you fall into by accident is not a commitment, which is the only thing this
  // system is actually trying to measure. Eight makes it cost about as much
  // intent as the other two do at five, rather than arriving unbidden.
  //
  // This is a CARD-POOL correction, not a balance one. If the pools ever even
  // out, this should go back to five rather than the number being tuned further.
  const ROLE_THRESHOLD = {
    damage: 8,
  };

  // ── Saboteur ───────────────────────────────────────────────────────────────
  // Not a placement count at all. A saboteur is a CORRUPTED player, so the
  // stream is held by this phone's corruption level crossing into the horror
  // phase and is given up when they are cleansed. Counting horror placements
  // instead meant a player could be fully corrupted and still not be one, and
  // could stay one after being cleansed — both of which read as the game
  // ignoring the thing it just put on screen.
  let _corruption = 0;
  let _corruptNeed = 8;   // overwritten by the first syncCorruption

  function corrupted() { return _corruption >= _corruptNeed; }

  function need(role) {
    if (role === 'saboteur') return _corruptNeed;
    return ROLE_THRESHOLD[role] || THRESHOLD;
  }

  /// Called from updatePersonalPhase whenever this phone's corruption moves.
  function syncCorruption(level, threshold) {
    _corruption = Math.max(0, Number(level) || 0);
    if (threshold > 0) _corruptNeed = threshold;
    _counts.saboteur = _corruption;

    const was = _spec;
    if (corrupted()) { _spec = 'saboteur'; _offer = null; }
    else if (_spec === 'saboteur') { _spec = null; }

    if (_spec !== was && _spec) _announce(_spec);
    _paint();
    if (_spec !== was) {
      try { if (typeof window.onSpecChanged === 'function') window.onSpecChanged(); } catch (e) {}
    }
  }

  // How much likelier an on-role card is once specialised.
  //
  // Capped, never exclusive. Seeding compounds — more shields offered means more
  // shields played means more shields seeded — and over a ten minute session
  // that lock-in is mostly desirable. But a player who wants to change their
  // mind has to still be able to see the door, so off-role cards keep a real
  // share of every pack.
  const ON_ROLE_WEIGHT = 2.0;

  // A tier that contains an on-role card is nudged rather than forced: this
  // decides how OFTEN you are offered the slot your card lives in, which is a
  // much blunter instrument than which card fills it.
  //
  // Raised from 1.45 once seeding started at join rather than at specialisation.
  // TANK and MEDIC hold four cards each against DAMAGE's sixteen, so without a
  // real push a player who asks for the shield is offered one about a sixth of
  // the time and never reaches five in a session. This is the number to tune if
  // the streams still finish at different speeds — it carries most of the
  // effect, because most tiers hold a single card and weighting inside a tier
  // can do nothing there.
  const ON_ROLE_TIER_WEIGHT = 2.2;

  const _counts = { tank: 0, medic: 0, damage: 0, saboteur: 0 };
  // A second stream the player has since filled and may switch to. Null until
  // one completes behind the one they already hold.
  let   _offer  = null;
  let   _spec   = null;   // one of the four streams, once a threshold is crossed

  function cardRole(card) {
    if (!card || card.corrupted) return null;
    return CARD_ROLE[card.name] || null;
  }

  /// The role the player picked on the join screen, or null.
  ///
  /// SABOTEUR is excluded deliberately: no card carries it, so there is nothing
  /// to seed toward and nothing to count. That stream is still reached the way
  /// it always was, by flipping to the horror packs.
  ///
  /// `playerRole` is a top-level `let` in main.js, so it never lands on window —
  /// hence the bare identifier behind a typeof guard.
  function declared() {
    try {
      const r = typeof playerRole !== 'undefined' ? playerRole : null;
      return (r === 'tank' || r === 'medic' || r === 'damage') ? r : null;
    } catch (e) { return null; }
  }

  /// The role the packs lean toward: the one they have earned, or failing that
  /// the one they asked for.
  function seedRole() { return _spec || declared(); }

  function current()    { return _spec; }
  /// A role they have ALSO completed and could move to, or null.
  function offer()      { return _offer; }

  /// Take the offered stream. Their counts are untouched — they earned both,
  /// and a player who switches back and forth has genuinely played both ways.
  function commit() {
    if (!_offer) return;
    _spec  = _offer;
    _offer = null;
    _announce(_spec);
    _paint();
    try { if (typeof window.onSpecChanged === 'function') window.onSpecChanged(); } catch (e) {}
  }
  function isSaboteur() { return _spec === 'saboteur'; }
  function counts()  { return { ..._counts }; }
  /// The threshold for a given role — or for the leading one when not told,
  /// which is what the tally drawing wants.
  function threshold(role) {
    if (role) return need(role);
    let best = null, n = 0;
    for (const k in _counts) if (_counts[k] > n) { n = _counts[k]; best = k; }
    return need(best || _spec);
  }

  /// How far along the player is toward their leading role, 0..1. Drives the
  /// low-key visual tell without needing a number on screen.
  function progress() {
    // Toward the role they are actually working on, which is the declared one
    // until they earn it. Tracking whichever counter happens to be highest
    // would fill a tank player's tell with damage placements they can no
    // longer specialise into.
    const want = seedRole();
    if (want) return Math.min(1, (_counts[want] || 0) / need(want));

    let best = 0, lead = null;
    for (const k in _counts) if (_counts[k] > best) { best = _counts[k]; lead = k; }
    return Math.min(1, best / need(lead));
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
    // Horror placements are not what makes a saboteur — corruption is, and
    // syncCorruption owns that counter. Nothing to record here.
    if (horror) return;
    const role = cardRole(card);
    if (!role) return;

    _counts[role]++;

    // Counting NEVER stops.
    //
    // It used to freeze the moment a stream was claimed, on the reasoning that
    // first-past-the-post recognises a commitment. That was right when the only
    // prize was pack weighting and wrong now that it is a body: a player who has
    // earned BULLWARK keeps placing for the rest of the session, and freezing
    // their counters meant every one of those cards was worth nothing. It also
    // left them stuck in a role they might have finished with.
    //
    // So a second stream can still fill up behind the first. Reaching the
    // threshold OFFERS that role rather than taking it — switching out from
    // under someone mid-turn would be the game making the decision.
    // Only the role they ASKED for can claim them.
    //
    // It used to be first-past-the-post across all three, which sounds fair and
    // was not: damage holds 16 of the 24 tagged cards, so it filled in about a
    // dozen placements while tank and medic needed thirty. At gallery pace that
    // made damage the only reachable stream, and every player in a session came
    // away with the same card no matter which symbol they had chosen.
    //
    // SABOTEUR is exempt because it is claimed by flipping to the horror packs
    // rather than by picking it on the join screen.
    const want = declared();
    if (!_spec && _counts[role] >= need(role) && role === want) {
      _spec = role;
      _announce(role);
    } else if (_spec && role !== _spec && _counts[role] >= need(role)) {
      // Still offered, so a player who drifts into another stream can move to
      // it. The declared role gets first claim, not sole claim.
      if (_offer !== role) { _offer = role; _announce(role); }
    }
    _paint();

    // Let the rest of the app react without spec.js needing to know what a
    // nametag or an avatar button is. Guarded, because a throwing listener
    // must not take a placement down with it.
    try { if (typeof window.onSpecChanged === 'function') window.onSpecChanged(); }
    catch (e) { console.warn('[spec] listener failed', e); }
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
    const want = seedRole();
    if (!want) return 1;
    return cardRole(card) === want ? ON_ROLE_WEIGHT : 1;
  }

  /// Weight for a whole rarity tier, so a specialised player meets the tier
  /// their card lives in more often. With one card per tier in most pools this
  /// is what carries the effect — seeding within a tier can do nothing when the
  /// tier has only one occupant.
  function tierWeight(pool, tier) {
    const want = seedRole();
    if (!want || !Array.isArray(pool)) return 1;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].rarity === tier && cardRole(pool[i]) === want) return ON_ROLE_TIER_WEIGHT;
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

  // ── Debug ──────────────────────────────────────────────────────────────────

  /// Fill a role's tally straight to the threshold.
  ///
  /// Goes through the same trip-and-announce path a real run of placements
  /// does, rather than just assigning _spec — otherwise the sound, the body
  /// class and the onSpecChanged listeners never fire, and the thing under test
  /// is reached by a route no player can take.
  ///
  /// Refuses once a stream is claimed, for the same reason record() does: first
  /// past the post is the rule, and a debug key that quietly rewrote it would
  /// hide the one behaviour most worth checking.
  function debugFill(role) {
    role = role || 'tank';
    if (!(role in _counts)) { console.warn('[spec] no such role', role); return; }
    if (_spec) { console.warn('[spec] already specialised as', _spec); return; }

    const want = need(role) - _counts[role];
    for (let i = 0; i < want; i++) {
      _counts[role]++;
      if (!_spec && _counts[role] >= need(role)) { _spec = role; _announce(role); }
    }
    _paint();
    try { if (typeof window.onSpecChanged === 'function') window.onSpecChanged(); } catch (e) {}
    console.log('[spec] debug-filled', role, _counts);
  }

  /// Hand the role back to the room.
  ///
  /// Called when an avatar spends its last charge. Clears the counts as well as
  /// the stream, so the player starts the climb again rather than re-unlocking
  /// the body on their next single placement — the threshold is what makes
  /// holding the role mean something, and a reset that skipped it would make
  /// the charge limit cosmetic.
  ///
  /// Their packs go back to unweighted at the same time, which is correct: they
  /// are not a tank again until they have played like one again.
  function release() {
    for (const k in _counts) _counts[k] = 0;
    _spec  = null;
    _offer = null;
    // Corruption is not a turn and is not spent — a player who is still
    // corrupted is still a saboteur. What limits them is the boss's charges.
    if (corrupted()) { _spec = 'saboteur'; _counts.saboteur = _corruption; }
    _paint();
    try { if (typeof window.onSpecChanged === 'function') window.onSpecChanged(); } catch (e) {}
  }

  /// Back to nothing, so the trip can be watched more than once per reload.
  function debugReset() {
    for (const k in _counts) _counts[k] = 0;
    _spec  = null;
    _offer = null;
    _paint();
    try { if (typeof window.onSpecChanged === 'function') window.onSpecChanged(); } catch (e) {}
    console.log('[spec] reset');
  }

  return { record, current, isSaboteur, counts, progress, threshold,
           cardRole, weight, tierWeight, offer, commit, release,
           declared, seedRole, syncCorruption, corrupted,
           debugFill, debugReset };
})();
