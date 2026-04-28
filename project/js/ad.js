// ─── AD SYSTEM ───────────────────────────────────────────────────────────────

const AD_DURATION_MS = 15000;

let _adElapsed   = 0;
let _adCallbacks = null;
let _adInterval  = null;
let _adAnimFrame = null;
let _glitchTimer = 0;

// ─── Show ─────────────────────────────────────────────────────────────────────

function showAd({ onComplete, onSkip }) {
  _adCallbacks = { onComplete, onSkip };
  _adElapsed   = 0;
  _glitchTimer = 0;

  send('ad_playing');

  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('screen-ad').classList.remove('hidden');

  // Init LED — just let it run its own sequence loop, don't interrupt it
  const ledCanvas = document.getElementById('adLEDCanvas');
  if (ledCanvas) LED.init(ledCanvas);

  // Start progress timer immediately — no buffer delay needed, LED handles the opening
  _adInterval = setInterval(adTick, 100);

  // Scanline + glitch overlay on the LED wrap
  startAdAnimLoop();
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

function adTick() {
  _adElapsed += 100;
  updateAdProgress();
  if (_adElapsed >= AD_DURATION_MS) adComplete();
}

// ─── Animation loop — scanline + glitch over the LED panel ───────────────────

function startAdAnimLoop() {
  // Target the LED wrap, not the removed ad-content
  const wrap = document.querySelector('#screen-ad .ad-led-wrap');
  if (!wrap) { _adAnimFrame = requestAnimationFrame(() => startAdAnimLoop()); return; }

  let sweepY    = 0;
  let lastNoise = 0;

  // Inject sweep element
  let sweep = document.getElementById('adSweep');
  if (!sweep) {
    sweep = document.createElement('div');
    sweep.id = 'adSweep';
    Object.assign(sweep.style, {
      position:'absolute', left:'0', right:'0', height:'2px',
      zIndex:'10', pointerEvents:'none',
      background:'rgba(255,255,255,0.14)', top:'-2px',
    });
    wrap.appendChild(sweep);
  }

  function loop(ts) {
    const screen = document.getElementById('screen-ad');
    if (!screen || screen.classList.contains('hidden')) return;

    // Sweep
    const h = wrap.offsetHeight || 300;
    sweepY = (sweepY + 1.2) % (h + 2);
    sweep.style.top = sweepY + 'px';

    // Random glitch slices on the LED wrap
    _glitchTimer += 16;
    if (_glitchTimer > 1800 + Math.random() * 2600) {
      _glitchTimer = 0;
      const count = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        const el  = document.createElement('div');
        const ht  = 2 + Math.floor(Math.random() * 7);
        const y   = Math.floor(Math.random() * h);
        const dx  = (Math.random() - 0.5) * 28;
        const isBlackout = Math.random() > 0.7;
        Object.assign(el.style, {
          position:'absolute', left:'0', right:'0',
          height:ht+'px', top:y+'px', zIndex:'11',
          background: isBlackout ? 'rgba(0,0,0,0.65)' : `rgba(255,255,255,${0.16 + Math.random() * 0.18})`,
          transform:`translateX(${dx}px)`,
          pointerEvents:'none',
        });
        wrap.appendChild(el);
        setTimeout(() => el.remove(), 40 + Math.random() * 90);
      }
    }

    _adAnimFrame = requestAnimationFrame(loop);
  }

  _adAnimFrame = requestAnimationFrame(loop);
}

// ─── Progress ─────────────────────────────────────────────────────────────────

function updateAdProgress() {
  const bar  = document.getElementById('adProgressFill');
  const time = document.getElementById('adTimeLeft');
  if (!bar || !time) return;
  const pct        = Math.min(_adElapsed / AD_DURATION_MS, 1);
  bar.style.width  = `${pct * 100}%`;
  const remaining  = Math.max(0, Math.ceil((AD_DURATION_MS - _adElapsed) / 1000));
  time.textContent = `${remaining}s`;
  const skipBtn = document.getElementById('adSkipBtn');
  if (skipBtn) skipBtn.style.opacity = stars >= STARS_SKIP_AD ? '1' : '0.35';
}

// ─── Skip / complete ──────────────────────────────────────────────────────────

function adSkip() {
  if (stars < STARS_SKIP_AD) return;
  clearInterval(_adInterval);
  cancelAnimationFrame(_adAnimFrame);
  spendStars(STARS_SKIP_AD);
  LED.destroy();
  send('ad_ended');
  document.getElementById('screen-ad').classList.add('hidden');
  if (_adCallbacks?.onSkip) _adCallbacks.onSkip(STARS_SKIP_AD);
  _adCallbacks = null;
}

function adComplete() {
  clearInterval(_adInterval);
  cancelAnimationFrame(_adAnimFrame);
  LED.destroy();
  send('ad_ended');
  document.getElementById('screen-ad').classList.add('hidden');
  if (_adCallbacks?.onComplete) _adCallbacks.onComplete();
  _adCallbacks = null;
}