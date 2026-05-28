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
  ];

  // ── Community task state (driven by WS from Unity's QuestManager) ────────────
  const _com = [
    { id:'flowers', label:'Plant flowers', count:0, goal:50, reward:15, done:false },
    { id:'sheep',   label:'Inhabit sheep', count:0, goal:10, reward:10, done:false },
    { id:'ducks',   label:'Control ducks', count:0, goal:15, reward:10, done:false },
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

    if (dirty) { _render(); _pulseTab(); }
  }

  // ── Public: community quest updates (called from main.js handleQuestMessage) ─

  function recordQuestProgress(quest, count, goal) {
    const t = _c(quest);
    if (!t) return;
    t.count = count;
    if (goal) t.goal = goal;
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

  // ── Public: panel toggle (called from onclick in index.html) ─────────────────

  function togglePanel() { _setOpen(!_open); }

  function _setOpen(state) {
    if (_open === state) return;
    _open = state;
    const panel = document.getElementById('taskPanel');
    if (panel) panel.classList.toggle('task-panel--open', _open);
    _render();
    if (_open) {
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
    el.textContent     = `TASK: ${label.toUpperCase()}  +${reward} ★`;
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

  function _render() {
    _updateTrigger();
    if (!_open) return;
    const body = document.getElementById('taskPanelBody');
    if (!body) return;

    const rows = [];

    rows.push('<div class="task-section-hdr">── MY TASKS</div>');
    _ind.forEach(t => rows.push(_row(t)));

    rows.push('<div class="task-section-hdr task-section-hdr--community">── COMMUNITY</div>');
    _com.forEach(t => rows.push(_comRow(t)));

    body.innerHTML = rows.join('');
  }

  function _row(t) {
    const icon = t.done ? '[✓]' : '[ ]';
    const cls  = t.done ? ' task-row--done' : '';
    const bar  = (!t.done && t.goal > 1) ? _bar(t.count, t.goal) : '';
    const prog = (!t.done && t.goal > 1) ? `<span class="task-prog">${t.count}/${t.goal}</span>` : '';
    const rwd  = t.done ? '' : `<span class="task-rwd">+${t.reward}★</span>`;
    return `<div class="task-row${cls}"><span class="task-icon">${icon}</span><span class="task-lbl">${t.label}</span>${bar}${prog}${rwd}</div>`;
  }

  function _comRow(t) {
    const icon = t.done ? '[✓]' : '[ ]';
    const cls  = t.done ? ' task-row--done' : '';
    const bar  = !t.done ? _bar(t.count, t.goal) : '';
    const prog = !t.done ? `<span class="task-prog">${t.count}/${t.goal}</span>` : '';
    const rwd  = t.done ? '' : `<span class="task-rwd">+${t.reward}★</span>`;
    return `<div class="task-row${cls}"><span class="task-icon">${icon}</span><span class="task-lbl">${t.label}</span>${bar}${prog}${rwd}</div>`;
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
    btn.innerHTML =
      `<span class="task-trigger-label">TASKS</span>` +
      `<span class="task-trigger-count">${done}/${total}</span>` +
      `<span class="task-trigger-bar"><span class="task-trigger-bar-fill">${fill}</span><span class="task-trigger-bar-empty">${empty}</span></span>`;
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

  return { recordEvent, recordQuestProgress, recordQuestComplete, togglePanel };

})();
