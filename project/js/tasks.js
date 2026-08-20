// tasks.js — Individual + community task tracker
// v2026-05-27
//
// Individual tasks are tracked client-side only — no server or Unity changes
// needed. Community tasks receive live progress via WebSocket
// (quest_progress|quest|count|goal) and fire completions via quest_reward.
//
// Called from:
//   main.js  doPackOpen()           → TaskTracker.recordEvent('pack_opened',{packType})
//   main.js  dropCard()             → TaskTracker.recordEvent('placement',{rarity})
//   main.js  handleQuestMessage()   → TaskTracker.recordQuestProgress / recordQuestComplete
//   possession.js  _onEnded()       → TaskTracker.recordEvent('creature_full_duration')

const TaskTracker = (() => {

  // ── Individual task definitions ──────────────────────────────────────────────
  const _ind = [
    {
      id:    'first_legendary',
      label: 'Place a legendary',
      reward: 10,
      goal:   1,
      count:  0,
      done:   false,
    },
    {
      id:    'five_placements',
      label: 'Place 5 things',
      reward: 3,
      goal:   5,
      count:  0,
      done:   false,
    },
    {
      id:    'all_pack_types',
      label: 'Open all pack types',
      reward: 8,
      goal:   3,
      count:  0,
      done:   false,
      _seen:  new Set(),
    },
    {
      id:    'full_possession',
      label: 'Full creature session',
      reward: 5,
      goal:   1,
      count:  0,
      done:   false,
    },
    {
      // Cross-player synergy. Deliberately the highest individual reward: it's
      // the only task that CANNOT be completed alone, so it needs to be worth
      // approaching a stranger for.
      id:    'combo',
      label: 'Combo with another player',
      reward: 12,
      goal:   1,
      count:  0,
      done:   false,
    },
  ];

  // ── Community task state (driven by WS from Unity's QuestManager) ────────────
  const _com = [
    { id:'flowers', label:'Plant flowers', count:0, goal:50, reward:15, done:false },
    { id:'sheep',   label:'Inhabit sheep', count:0, goal:10, reward:10, done:false },
    { id:'ducks',   label:'Control ducks', count:0, goal:15, reward:10, done:false },
    // Event quest — only shown once Unity says a boss has spawned (active=true).
    { id:'boss',    label:'Defeat the boss', count:0, goal:1, reward:50, done:false, active:false },
  ];

  const _LEGENDARY = new Set(['legendary','mythical','luck-maxxing','legendary-alpha']);

  // ── Panel state ──────────────────────────────────────────────────────────────
  let _open = false;

  // ── Public: record individual task events ────────────────────────────────────

  function recordEvent(type, data) {
    data = data || {};
    let dirty = false;

    if (type === 'placement') {
      // "Place 5 things"
      const t = _i('five_placements');
      if (t && !t.done) {
        t.count = Math.min(t.count + 1, t.goal);
        dirty = true;
        _maybeComplete(t);
      }
      // "First legendary"
      if (_LEGENDARY.has(data.rarity)) {
        const tl = _i('first_legendary');
        if (tl && !tl.done) { tl.count = 1; dirty = true; _maybeComplete(tl); }
      }
    }

    if (type === 'pack_opened') {
      const t = _i('all_pack_types');
      if (t && !t.done) {
        t._seen.add(data.packType);
        t.count = t._seen.size;
        dirty = true;
        _maybeComplete(t);
      }
    }

    if (type === 'creature_full_duration') {
      const t = _i('full_possession');
      if (t && !t.done) { t.count = 1; dirty = true; _maybeComplete(t); }
    }

    // Fired by combo.js when a cross-player synergy completes and THIS phone was
    // one of the two participants.
    if (type === 'combo') {
      const t = _i('combo');
      if (t && !t.done) { t.count = 1; dirty = true; _maybeComplete(t); }
    }

    if (dirty) { _render(); _pulseTab(); }
  }

  // ── Public: community quest updates (called from main.js handleQuestMessage) ─

  function recordQuestProgress(quest, count, goal) {
    const t = _c(quest);
    if (!t) return;
    t.active = true;                       // reveal event quests (e.g. boss) on first progress
    t.count  = count;
    if (goal) t.goal = goal;
    if (count < t.goal) t.done = false;    // re-arm if a fresh round started (boss respawn)
    _render();
    _pulseTab();
  }

  function recordQuestComplete(quest) {
    const t = _c(quest);
    if (!t || t.done) return;
    t.done  = true;
    t.count = t.goal;
    _render();
    _pulseTab();
  }

  // ── Public: refresh individual tasks (called from the pristine shop) ─────────
  // Resets the client-side individual tasks so the player can complete and
  // re-earn them — the generous "keep earning" loop. Community tasks are
  // server-driven and left untouched.
  function refreshIndividual() {
    _ind.forEach(t => {
      t.count = 0;
      t.done  = false;
      if (t._seen) t._seen.clear();
    });
    _render();
    _pulseTab();
  }

  // ── Public: panel toggle (called from onclick in index.html) ─────────────────

  function togglePanel() { _setOpen(!_open); }

  function _setOpen(state) {
    // Opening is the acknowledgement — the badge clears here rather than on a
    // timer, so it always means "there is something you have not looked at".
    if (state) _mainSeen = _mainKey;
    if (_open === state) return;
    _open = state;
    const panel = document.getElementById('taskPanel');
    if (panel) panel.classList.toggle('task-panel--open', _open);
    _render();
    if (_open) {
      if (typeof Sound !== 'undefined') Sound.play('uiOpen');
      // Delay one tick so the click that opened doesn't immediately close
      setTimeout(() => document.addEventListener('pointerdown', _onOutsideClick, true), 0);
    } else {
      document.removeEventListener('pointerdown', _onOutsideClick, true);
    }
  }

  // Close when player taps anywhere outside the panel (a card, the carousel,
  // pack-type buttons, the background, etc.). Taps inside the panel (trigger
  // or body) are ignored so the panel doesn't dismiss itself.
  function _onOutsideClick(e) {
    const panel = document.getElementById('taskPanel');
    if (!panel || panel.contains(e.target)) return;
    _setOpen(false);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  function _i(id) { return _ind.find(t => t.id === id); }
  function _c(id) { return _com.find(t => t.id === id); }

  // Block-character progress bar — e.g. ████░░░ (W chars wide)
  function _bar(count, goal) {
    const W = 7;
    const f = goal > 0 ? Math.round((Math.min(count, goal) / goal) * W) : 0;
    const fill  = '█'.repeat(f);
    const empty = '░'.repeat(W - f);
    return `<span class="task-bar"><span class="task-bar-fill">${fill}</span><span class="task-bar-empty">${empty}</span></span>`;
  }

  function _maybeComplete(task) {
    if (task.done || task.count < task.goal) return;
    task.done = true;
    if (typeof addStars === 'function') addStars(task.reward);
    _toast(task.label, task.reward);
  }

  function _toast(label, reward) {
    const el = document.getElementById('questToast');
    if (!el) return;
    el.textContent     = `Task: ${label}  +${reward} ★`;
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

  // ── UI rendering ─────────────────────────────────────────────────────────────

  // ── Main task ──────────────────────────────────────────────────────────────
  // What the ROOM is working on, straight from Unity. Feedback from a playtest
  // was that people arrived with no idea what to do, and anyone standing away
  // from the projection could not read the Soul Seed's label — so the objective
  // existed only for people near the screen. This puts it on every phone.

  let _main = null;   // { title, detail, have, need, ready }

  /// Germination: soultree_site|planted|required
  function setSeedProgress(planted, required) {
    _main = {
      title : 'THE SOUL SEED',
      detail: 'Germination Stage',
      have  : planted,
      need  : required,
      ready : planted >= required,
      line  : `Plant ${required} flowers on the mound`,
    };
    _flagNew('seed:' + planted + '/' + required);
    _render();
  }

  /// After sprouting: soultree_goal|stage|plants|animals|fungi|combo|ready
  function setTreeGoal(stage, plants, animals, fungi, combo, ready) {
    const parts = [];
    if (plants  > 0) parts.push(`${plants} flowers`);
    if (animals > 0) parts.push(`${animals} animals`);
    if (fungi   > 0) parts.push(`${fungi} fungi`);
    if (combo)       parts.push('a player combo');

    _main = {
      title : 'THE SOUL TREE',
      // Every stage reads "<name> Stage", matching Germination. The final stage
      // never appears here — Unity only broadcasts a goal while a NEXT stage
      // exists — so there is no last-stage case to special-case.
      detail: stage ? stage + ' Stage' : '',
      have  : null,
      need  : null,
      ready : ready,
      line  : ready ? 'Ready to grow' : 'Needs ' + parts.join(', '),
    };
    // Only the STAGE seeds the badge, not every count. A pulsing marker that
    // returns on each flower would be noise, and players would stop reading it.
    _flagNew('goal:' + stage);
    _render();
  }

  // The badge marks a genuinely new objective. It clears when the panel is
  // opened and comes back only when the key changes — the stage advancing, or
  // the very first thing the room is asked to do.
  let _mainKey = null, _mainSeen = null;
  function _flagNew(key) {
    const stageKey = key.split(':')[0] === 'goal' ? key : 'seed';
    if (stageKey !== _mainKey) { _mainKey = stageKey; }
  }
  function _mainIsNew() { return _mainKey !== null && _mainKey !== _mainSeen; }

  function _mainRows() {
    if (!_main) return [];
    const pct = (_main.need > 0 && _main.have !== null)
      ? Math.min(100, (_main.have / _main.need) * 100) : (_main.ready ? 100 : 0);
    const count = (_main.have !== null && _main.need !== null)
      ? `<span class="task-mission-count">${_main.have}/${_main.need}</span>` : '';
    // Class names are prefixed `mission-` rather than `main-`. The existing task
    // rows already use `.task-main` for their inner wrapper, so styling a class
    // by that name put a border around every task in the panel.
    return [
      '<div class="task-section-hdr task-section-hdr--mission">── Main Task</div>',
      '<div class="task-mission' + (_main.ready ? ' task-mission--ready' : '') + '">' +
        `<div class="task-mission-title">&lt;${_main.title}&gt;${count}</div>` +
        `<div class="task-mission-stage">${_main.detail}</div>` +
        // Same [ ] / [✓] indicator the other rows use, so the objective reads as
        // a task rather than as a status line.
        `<div class="task-mission-line">` +
          `<span class="task-mission-box">${_main.ready ? '[✓]' : '[ ]'}</span>` +
          `<span>${_main.line}</span>` +
        `</div>` +
        `<div class="task-mission-bar"><span style="width:${pct.toFixed(0)}%"></span></div>` +
      '</div>',
    ];
  }

  function _render() {
    _updateTrigger();
    if (!_open) return;
    const body = document.getElementById('taskPanelBody');
    if (!body) return;

    const rows = [];

    rows.push(..._mainRows());

    rows.push('<div class="task-section-hdr">── My Tasks</div>');
    _ind.forEach(t => rows.push(_row(t)));

    rows.push('<div class="task-section-hdr task-section-hdr--community">── Community</div>');
    _com.filter(t => t.active !== false).forEach(t => rows.push(_comRow(t)));

    body.innerHTML = rows.join('');
  }

  function _row(t)    { return _rowHtml(t, !t.done && t.goal > 1); }
  function _comRow(t) { return _rowHtml(t, !t.done); }

  // Shared row markup. Label + reward sit on the top line; the progress bar
  // drops to its own line beneath so the label never gets squished.
  function _rowHtml(t, showBar) {
    const icon = t.done ? '[✓]' : '[ ]';
    const cls  = t.done ? ' task-row--done' : '';
    const rwd  = t.done ? '' : `<span class="task-rwd">+${t.reward}★</span>`;
    const progRow = showBar
      ? `<div class="task-progrow">${_bar(t.count, t.goal)}<span class="task-prog">${t.count}/${t.goal}</span></div>`
      : '';
    return `<div class="task-row${cls}">` +
             `<span class="task-icon">${icon}</span>` +
             `<div class="task-main">` +
               `<div class="task-toprow"><span class="task-lbl">${t.label}</span>${rwd}</div>` +
               progRow +
             `</div>` +
           `</div>`;
  }

  function _updateTrigger() {
    const btn = document.getElementById('taskPanelTrigger');
    if (!btn) return;
    const done  = _ind.filter(t => t.done).length + _com.filter(t => t.done).length;
    const total = _ind.length + _com.length;
    // Mini 5-char progress bar showing overall completion at a glance
    const W = 5;
    const f = total > 0 ? Math.round((done / total) * W) : 0;
    const fill  = '█'.repeat(f);
    const empty = '░'.repeat(W - f);
    const alert = _mainIsNew();
    btn.classList.toggle('task-panel-trigger--alert', alert);

    btn.innerHTML =
      `<span class="task-trigger-label">TASKS</span>` +
      `<span class="task-trigger-count">${done}/${total}</span>` +
      `<span class="task-trigger-bar"><span class="task-trigger-bar-fill">${fill}</span><span class="task-trigger-bar-empty">${empty}</span></span>`;

    // The badge is a CHILD of the button, but absolutely positioned outside its
    // left edge — so it is anchored to the tab yet out of the flow entirely and
    // cannot change the tab's size.
    //
    // It has to be re-appended because the line above replaces innerHTML. As a
    // sibling of the button it was anchored to .task-panel, which is as tall as
    // its body while the trigger stays compact at the top (align-items:
    // flex-start), so "halfway down" put it far below the tab.
    if (alert) {
      const bang = document.createElement('span');
      bang.className = 'task-bang';
      bang.textContent = '!';
      btn.appendChild(bang);
    }
  }

  // Brief pixel-blink on the tab whenever a task progresses
  function _pulseTab() {
    const btn = document.getElementById('taskPanelTrigger');
    if (!btn) return;
    btn.classList.remove('task-panel-trigger--ping');
    void btn.offsetWidth;  // force reflow so animation restarts if called rapidly
    btn.classList.add('task-panel-trigger--ping');
    btn.addEventListener('animationend', () => btn.classList.remove('task-panel-trigger--ping'), { once: true });
  }

  return { recordEvent, recordQuestProgress, recordQuestComplete, refreshIndividual,
           togglePanel, setSeedProgress, setTreeGoal, mainIsNew: _mainIsNew };

})();
