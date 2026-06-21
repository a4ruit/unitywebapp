// collection.js — session-based card collection ("dex")
// v2026-06-15
//
// Left-side slide-out panel, mirroring the right-side Tasks tab. Tracks which
// cards the player has actually claimed THIS session. State is in-memory only,
// so a page refresh wipes the collection (intentional — session based).
//
// Cards are grouped by rarity (one block per tier). Each tier holds the six
// theme variants of that rarity (nature/critter/fungi + flesh/scourge/ritual),
// so completing a tier = "collect all the commons / all the rares / …", which
// grants a set-bonus reward. Collecting every card grants a grand bonus.
//
// Collected cards render their real face (via CardTextures.buildFace). Cards
// not yet seen render as near-black locked slabs — almost indistinguishable.
//
// Called from:
//   main.js  dropCard()              → Collection.record(card)
//   main.js  god-pack claim callback → Collection.record(claimedCard)
//   main.js  legendary reveal cb     → Collection.record(chosenCard)

const Collection = (() => {

  // ── Pool order + the global-state context each pool renders under ────────────
  // CardTextures.buildFace() keys its artwork off window.activePackType + the
  // body's corruption dataset, so to draw a given theme we temporarily swap
  // those globals, render, then restore (see _renderFace).
  const POOLS = [
    { key:'nature',  label:'NATURE',  global:'NATURE_CARDS',  type:'garbage', corruption:0  },
    { key:'critter', label:'CRITTER', global:'CRITTER_CARDS', type:'ewaste',  corruption:0  },
    { key:'fungi',   label:'FUNGI',   global:'FUNGI_CARDS',   type:'adpack',  corruption:0  },
    { key:'flesh',   label:'FLESH',   global:'FLESH_CARDS',   type:'garbage', corruption:16 },
    { key:'scourge', label:'SCOURGE', global:'SCOURGE_CARDS', type:'ewaste',  corruption:16 },
    { key:'ritual',  label:'RITUAL',  global:'RITUAL_CARDS',  type:'adpack',  corruption:16 },
  ];

  // main.js declares the six pools as top-level `const` (lexical globals, not on
  // window). They're in the shared global scope, so we can read them directly —
  // but only once main.js has run, hence this is called lazily (never at init).
  function _resolvePools() {
    try {
      return {
        NATURE_CARDS, CRITTER_CARDS, FUNGI_CARDS,
        FLESH_CARDS, SCOURGE_CARDS, RITUAL_CARDS,
      };
    } catch (e) {
      return {};
    }
  }

  // ── Phase gating ──────────────────────────────────────────────────────────────
  // Pristine phase shows only the three pristine pools (nature/critter/fungi).
  // The horror-phase pools (flesh/scourge/ritual) stay hidden until THIS phone
  // crosses into the horror phase, at which point the full collection reveals.
  function _isHorror() {
    try { return personalPacksOpened >= HORROR_THRESHOLD; }
    catch (e) { return false; }
  }
  function _phaseKey() { return _isHorror() ? 'h' : 'p'; }
  function _visiblePools(horror) {
    // corruption:0 marks the pristine trio; the rest are horror-only.
    return horror ? POOLS : POOLS.filter(p => p.corruption === 0);
  }

  // Rarity tiers, low → high. labelShort keeps the panel header tidy.
  const TIERS = [
    { rarity:'common',          label:'COMMONS',     reward:5  },
    { rarity:'uncommon',        label:'UNCOMMONS',   reward:10 },
    { rarity:'rare',            label:'RARES',       reward:15 },
    { rarity:'legendary',       label:'LEGENDARIES', reward:25 },
    { rarity:'mythical',        label:'MYTHICALS',   reward:40 },
    { rarity:'luck-maxxing',    label:'LUCK-MAXX',   reward:55 },
    { rarity:'legendary-alpha', label:'ALPHAS',      reward:75 },
  ];

  const GRAND_BONUS = 100;   // collect every card in the dex

  // ── State ────────────────────────────────────────────────────────────────────
  // Collected cards keyed by card.name (every card name is unique across pools).
  const _collected    = new Set();
  const _holo         = new Set();   // names owned in a holographic finish
  const _tierClaimed  = new Set();   // "<rarity>:<phase>" set-bonuses already paid
  const _grandClaimed = new Set();   // phases whose full-collection bonus was paid
  let   _open         = false;
  let   _catalog      = null;        // lazily built once the pools exist
  let   _catalogPhase = null;        // phase the cached catalog was built for

  // ── Catalog (built lazily so it reads main.js's pool consts after they load) ─
  // Scoped to the current phase: only the visible pools are included, so the
  // horror cards simply don't exist in the catalog until horror is reached.
  function _buildCatalog(horror) {
    const pools  = _resolvePools();
    const byTier = TIERS.map(tier => ({
      ...tier,
      cards: [],   // [{ card, poolKey, type, corruption }]
    }));
    _visiblePools(horror).forEach(pool => {
      const arr = pools[pool.global];
      if (!arr) return;
      arr.forEach(card => {
        const tier = byTier.find(t => t.rarity === card.rarity);
        if (tier) tier.cards.push({ card, poolKey: pool.key, type: pool.type, corruption: pool.corruption });
      });
    });
    return byTier;
  }

  function _cat() {
    const horror = _isHorror();
    if (!_catalog || _catalogPhase !== horror) {
      _catalog      = _buildCatalog(horror);
      _catalogPhase = horror;
    }
    return _catalog;
  }

  function _total() {
    return _cat().reduce((n, t) => n + t.cards.length, 0);
  }
  // Cards collected among those currently visible (robust if scope ever shrinks).
  function _collectedCount() {
    let n = 0;
    _cat().forEach(t => t.cards.forEach(e => { if (_collected.has(e.card.name)) n++; }));
    return n;
  }

  // ── Public: record a claimed card ─────────────────────────────────────────────
  function record(card) {
    if (!card || !card.name) return;
    const isHolo = card.variant === 'holo';
    if (_collected.has(card.name)) {
      // Already owned — but a holo pull upgrades the slot's finish.
      if (isHolo && !_holo.has(card.name)) { _holo.add(card.name); _render(); _pulseTab(); }
      return;
    }
    _collected.add(card.name);
    if (isHolo) _holo.add(card.name);
    _checkRewards();
    _render();
    _pulseTab();
  }

  // ── Rewards — full-tier set bonuses + grand completion ────────────────────────
  // Completion is measured against the currently-revealed catalog and tracked
  // per phase, so completing a rarity in pristine (3 cards) and again in horror
  // (all 6) are distinct, separately-earnable bonuses.
  function _checkRewards() {
    const phase = _phaseKey();
    _cat().forEach(tier => {
      const key = tier.rarity + ':' + phase;
      if (_tierClaimed.has(key)) return;
      const have = tier.cards.filter(e => _collected.has(e.card.name)).length;
      if (have >= tier.cards.length && tier.cards.length > 0) {
        _tierClaimed.add(key);
        if (typeof addStars === 'function') addStars(tier.reward);
        _toast(`${tier.label} complete`, tier.reward);
      }
    });
    if (!_grandClaimed.has(phase) && _collectedCount() >= _total() && _total() > 0) {
      _grandClaimed.add(phase);
      if (typeof addStars === 'function') addStars(GRAND_BONUS);
      _toast('FULL COLLECTION', GRAND_BONUS);
    }
  }

  // ── Public: phase changed (called from main.js updatePersonalPhase) ──────────
  // Rebuilds the catalog for the new phase and re-renders, so crossing into the
  // horror phase reveals the full collection immediately — and a pulse on the
  // trigger nudges the player to look.
  function onPhaseChange() {
    const horror = _isHorror();
    if (_catalogPhase === horror) return;    // no actual change
    const firstInit = _catalogPhase === null; // startup, not a real transition
    _catalog = null;                          // force rebuild on next _cat()
    _render();
    if (!firstInit) _pulseTab();              // nudge only on a genuine reveal
  }

  // ── Panel toggle (mirrors TaskTracker) ────────────────────────────────────────
  function togglePanel() { _setOpen(!_open); }

  function _setOpen(state) {
    if (_open === state) return;
    _open = state;
    const panel = document.getElementById('collPanel');
    if (panel) panel.classList.toggle('coll-panel--open', _open);
    if (_open) {
      if (typeof Sound !== 'undefined') Sound.play('uiOpen');
      _render();
      setTimeout(() => document.addEventListener('pointerdown', _onOutsideClick, true), 0);
    } else {
      document.removeEventListener('pointerdown', _onOutsideClick, true);
    }
  }

  function _onOutsideClick(e) {
    const panel = document.getElementById('collPanel');
    if (!panel || panel.contains(e.target)) return;
    _setOpen(false);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────────

  // Draw one card face onto a fresh 256×384 canvas, temporarily faking the
  // global pack-type + corruption so CardTextures draws the right theme.
  function _renderFace(entry) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 384;
    const prevType = window.activePackType;
    const prevCorr = document.body.dataset.corruption;
    window.activePackType = entry.type;
    document.body.dataset.corruption = entry.corruption;
    // Owned in holo? Render the slot with the foil finish.
    const card = _holo.has(entry.card.name) ? { ...entry.card, variant: 'holo' } : entry.card;
    try {
      CardTextures.buildFace(card, cv, 0, { hideFlavor: true });
    } catch (e) {
      // ignore — falls back to a blank canvas
    } finally {
      window.activePackType = prevType;
      document.body.dataset.corruption = prevCorr;
    }
    return cv;
  }

  function _bar(have, goal, w = 6) {
    const f = goal > 0 ? Math.round((Math.min(have, goal) / goal) * w) : 0;
    return `<span class="coll-bar"><span class="coll-bar-fill">${'█'.repeat(f)}</span>` +
           `<span class="coll-bar-empty">${'░'.repeat(w - f)}</span></span>`;
  }

  function _render() {
    _updateTrigger();
    if (!_open) return;
    const body = document.getElementById('collPanelBody');
    if (!body) return;

    body.innerHTML = '';

    const phase = _phaseKey();
    _cat().forEach(tier => {
      const have  = tier.cards.filter(e => _collected.has(e.card.name)).length;
      const goal  = tier.cards.length;
      const done  = _tierClaimed.has(tier.rarity + ':' + phase);
      const accent = (typeof CardTextures !== 'undefined' && CardTextures.getCfg)
        ? CardTextures.getCfg(tier.rarity).border : '#8bc28b';

      // Tier header — label + set-bonus reward / progress
      const hdr = document.createElement('div');
      hdr.className = 'coll-tier-hdr' + (done ? ' coll-tier-hdr--done' : '');
      hdr.style.setProperty('--tier', accent);
      const rwd = done
        ? `<span class="coll-tier-rwd coll-tier-rwd--done">✓</span>`
        : `<span class="coll-tier-rwd">+${tier.reward}★</span>`;
      hdr.innerHTML =
        `<span class="coll-tier-name">${tier.label}</span>` +
        `<span class="coll-tier-prog">${_bar(have, goal)}<span class="coll-tier-count">${have}/${goal}</span></span>` +
        rwd;
      body.appendChild(hdr);

      // Two-column grid of the tier's theme variants
      const grid = document.createElement('div');
      grid.className = 'coll-grid';
      tier.cards.forEach(entry => {
        const cell = document.createElement('div');
        cell.className = 'coll-card';
        if (_collected.has(entry.card.name)) {
          const cv = _renderFace(entry);
          cv.className = 'coll-card-face';
          cell.appendChild(cv);
          cell.title = entry.card.name;
          if (_holo.has(entry.card.name)) {
            cell.classList.add('coll-card--holo');
            const badge = document.createElement('span');
            badge.className = 'coll-holo-badge';
            badge.textContent = '✦';
            cell.appendChild(badge);
          }
        } else {
          cell.classList.add('coll-card--locked');
          const slab = document.createElement('div');
          slab.className = 'coll-card-locked';
          cell.appendChild(slab);
        }
        grid.appendChild(cell);
      });
      body.appendChild(grid);
    });
  }

  function _updateTrigger() {
    const btn = document.getElementById('collPanelTrigger');
    if (!btn) return;
    const have  = _collectedCount();
    const total = _total();
    const W = 5;
    const f = total > 0 ? Math.round((have / total) * W) : 0;
    btn.innerHTML =
      `<span class="coll-trigger-label">CARDS</span>` +
      `<span class="coll-trigger-count">${have}/${total}</span>` +
      `<span class="coll-trigger-bar"><span class="coll-trigger-bar-fill">${'█'.repeat(f)}</span>` +
      `<span class="coll-trigger-bar-empty">${'░'.repeat(W - f)}</span></span>`;
  }

  function _pulseTab() {
    const btn = document.getElementById('collPanelTrigger');
    if (!btn) return;
    btn.classList.remove('coll-panel-trigger--ping');
    void btn.offsetWidth;
    btn.classList.add('coll-panel-trigger--ping');
    btn.addEventListener('animationend', () => btn.classList.remove('coll-panel-trigger--ping'), { once: true });
  }

  // Reuses the shared quest toast element (same as TaskTracker).
  function _toast(label, reward) {
    const el = document.getElementById('questToast');
    if (!el) return;
    el.textContent     = `Set: ${label}  +${reward} ★`;
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

  // Initial trigger count once the pools (and DOM) are ready.
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => { _catalog = null; _updateTrigger(); });
  }

  return { record, togglePanel, onPhaseChange };

})();
