// pack3d.js — CSS 3D pack, works on all browsers including Safari iOS

const Pack3D = (() => {

  let card = null;
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;
  let dragCurrentX = 0;
  let velocityX = 0;
  let currentRotY = 0, currentRotX = 8;
  let onThrowComplete = null;
  let idleActive = false;

  const SWIPE_THRESHOLD = 42;

  function init() {
    card = document.getElementById('pack3dCard');
    if (!card) return;

    startIdle();
    attachEvents();
  }

  // ─── Idle animation ─────────────────────────────────────────────────────────

  function startIdle() {
    if (!card) return;
    card.classList.add('idle');
    idleActive = true;
  }

  function stopIdle() {
    if (!card) return;
    card.classList.remove('idle');
    idleActive = false;
  }

  // ─── Events ─────────────────────────────────────────────────────────────────

  function attachEvents() {
    const scene = document.getElementById('pack3dScene');
    if (!scene) return;

    scene.addEventListener('touchstart', onTouchStart, { passive: false });
    scene.addEventListener('touchmove',  onTouchMove,  { passive: false });
    scene.addEventListener('touchend',   onTouchEnd,   { passive: true });
    scene.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
  }

  function onTouchStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  }
  function onTouchMove(e) {
    e.preventDefault();
    if (!isDragging) return;
    const t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
  }
  function onTouchEnd(e) {
    if (!isDragging) return;
    const t = e.changedTouches[0];
    endDrag(t.clientX, t.clientY);
  }
  function onMouseDown(e) { startDrag(e.clientX, e.clientY); }
  function onMouseMove(e) { if (isDragging) moveDrag(e.clientX, e.clientY); }
  function onMouseUp(e)   { if (isDragging) endDrag(e.clientX, e.clientY); }

  function startDrag(x, y) {
    isDragging = true;
    dragStartX = dragCurrentX = x;
    dragStartY = y;
    velocityX = 0;
    stopIdle();
    if (card) card.style.transition = 'none';
  }

  function moveDrag(x, y) {
    velocityX = x - dragCurrentX;
    dragCurrentX = x;

    const dx = x - dragStartX;
    const dy = y - dragStartY;

    // Horizontal → Y rotation, vertical → X rotation
    const rotY = Math.max(-45, Math.min(45, dx * 0.35));
    const rotX = Math.max(-10, Math.min(20, 8 - dy * 0.12));

    currentRotY = rotY;
    currentRotX = rotX;

    setTransform(rotX, rotY);
  }

  function endDrag(x, y) {
    isDragging = false;
    const dx = x - dragStartX;
    const dy = Math.abs(y - dragStartY);
    const isH = Math.abs(dx) > dy * 1.4;
    const isFast = Math.abs(velocityX) > 3;

    if (card) card.style.transition = '';

    if (isH && (Math.abs(dx) > SWIPE_THRESHOLD || isFast)) {
      const dir = dx < 0 ? -1 : 1;
      document.dispatchEvent(new CustomEvent('pack3d:swipe', { detail: { dir } }));
    } else {
      // Snap back to idle
      setTransform(8, 0);
      startIdle();
    }
  }

  function setTransform(rotX, rotY, extra = '') {
    if (!card) return;
    card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) ${extra}`;
  }

  // ─── Public ─────────────────────────────────────────────────────────────────

  function throwPack(dir, callback) {
    if (!card) { callback?.(); return; }

    stopIdle();
    onThrowComplete = callback;
    card.style.transition = '';
    card.classList.add(dir < 0 ? 'throw-left' : 'throw-right');

    card.addEventListener('animationend', () => {
      card.classList.remove('throw-left', 'throw-right');
      if (onThrowComplete) {
        const cb = onThrowComplete;
        onThrowComplete = null;
        cb();
      }
    }, { once: true });
  }

  function resetPack() {
    if (!card) return;
    card.classList.remove('throw-left', 'throw-right', 'idle');
    card.style.transform = 'rotateX(8deg) rotateY(0deg)';
    card.style.transition = 'transform 0.4s ease';
    setTimeout(() => {
      if (card) card.style.transition = '';
      startIdle();
    }, 420);
  }

  return { init, throwPack, resetPack };
})();