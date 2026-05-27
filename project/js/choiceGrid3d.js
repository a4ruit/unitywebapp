// choiceGrid3d.js — 2x2 grid of 3D choice cards
//
// Architecture: ONE shared off-screen WebGLRenderer renders each card scene
// individually, then copies the result to per-cell 2D canvases via drawImage.
//
// Why not per-cell renderers: budget Android phones cap WebGL at ~4-8 contexts;
//   5 cards + Pack3D = 6 contexts → browser silently kills them → white patches.
// Why not scissor/overlay: iOS Safari incorrectly places an absolutely-positioned
//   canvas inside a CSS grid, breaking cell layout; Safari scissor test is also buggy.
// This approach uses 1 WebGL context total and no scissor — works everywhere.
//
// Exposes: ChoiceGrid3D.show(cards, containerId, onPick)
//           ChoiceGrid3D.showGodPack(cards, containerId, onClaim)
//           ChoiceGrid3D.destroy()

const ChoiceGrid3D = (() => {

  const RARITY_ORDER = { common:0, uncommon:1, rare:2, legendary:3, mythical:4, 'luck-maxxing':5, 'legendary-alpha':6 };
  const STAGGER_MS   = 60;

  let cells     = [];
  let onPickCb  = null;
  let onClaimCb = null;
  let picking   = false;
  let godMode   = false;

  // ── Shared off-screen WebGL renderer ──────────────────────────────────────
  // Not appended to the DOM — used as a render-then-copy offscreen buffer.
  // preserveDrawingBuffer:true is required so drawImage can read the pixels.

  let _renderer  = null;
  let _animFrame = null;

  function _ensureRenderer() {
    if (_renderer) return;
    try {
      _renderer = new THREE.WebGLRenderer({
        antialias:           false,
        alpha:               true,
        powerPreference:     'low-power',
        preserveDrawingBuffer: true,
      });
      _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      _renderer.setClearColor(0x000000, 0);
      // Canvas is intentionally NOT appended to the DOM
    } catch (e) {
      console.warn('ChoiceGrid3D: WebGL init failed', e);
      _renderer = null;
    }
  }

  // ── Cell factory ──────────────────────────────────────────────────────────
  // Each cell has its own 2D <canvas> (display surface) + a Three.js scene.
  // The shared renderer renders the 3D scene off-screen, then copies pixels
  // into the cell's 2D canvas via drawImage.

  function createCell(containerId, card) {
    const cellEl = document.getElementById(containerId);
    if (!cellEl) return null;

    // Visible display canvas — lives inside the cell div, sized by CSS
    const displayCanvas = document.createElement('canvas');
    displayCanvas.style.cssText =
      'display:block;width:100%!important;height:100%!important;' +
      'image-rendering:pixelated;cursor:pointer;';
    cellEl.appendChild(displayCanvas);
    const displayCtx = displayCanvas.getContext('2d');

    // 3D scene (no per-cell WebGL renderer)
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 2 / 3, 0.1, 100);
    camera.position.set(0, 0, 3.8);

    scene.add(new THREE.AmbientLight(0x1a2a1a, 0.9));
    const front = new THREE.DirectionalLight(0xffffff, 0.4);
    front.position.set(0, 0, 5); scene.add(front);
    const top = new THREE.DirectionalLight(0x3aaa3a, 0.3);
    top.position.set(0, 4, 2); scene.add(top);

    const cfg = CardTextures.getCfg(card.rarity);
    let rarityLight = null;
    if (cfg.light) {
      rarityLight = new THREE.PointLight(cfg.light.color, cfg.light.intensity, cfg.light.dist);
      rarityLight.position.set(0, 0, 2);
      scene.add(rarityLight);
    }

    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 256; faceCanvas.height = 384;
    CardTextures.buildFace(card, faceCanvas, 0);
    const faceTex = new THREE.CanvasTexture(faceCanvas);

    const backCanvas = CardTextures.buildBack();
    const backTex    = new THREE.CanvasTexture(backCanvas);

    const geo      = new THREE.BoxGeometry(1.6, 2.4, 0.04);
    const edgeMat  = new THREE.MeshStandardMaterial({ color: 0x0f160f, roughness: 0.9 });
    const frontMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.7,
      metalness: card.rarity === 'legendary-alpha' ? 0.5 : card.rarity === 'legendary' ? 0.3 : 0.05,
      emissive: new THREE.Color(cfg.emissive),
      emissiveIntensity: cfg.emissiveIntensity,
    });
    const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.8, metalness: 0.05 });

    const mesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    mesh.rotation.y = Math.PI;
    scene.add(mesh);

    const animated  = CardTextures.isAnimated(card.rarity);
    const startTime = performance.now() / 1000;

    const cell = {
      scene, camera, mesh, rarityLight, card,
      faceCanvas, faceTex, frontMat, animated, startTime,
      displayCanvas, displayCtx,
      el: cellEl,
      state: 'waiting',
      flipProgress: 0,
      idleT: Math.random() * Math.PI * 2,
      opacity: 1,
      pulseT: 0,
      claimVY: 0,
    };

    // Click/touch listeners on the visible 2D canvas
    displayCanvas.addEventListener('click', () => onCellClick(cell));
    displayCanvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      onCellClick(cell);
    }, { passive: false });

    return cell;
  }

  // ── Per-cell state machine update ──────────────────────────────────────────

  function _updateCell(cell) {
    cell.idleT += 0.014;
    const t = performance.now() / 1000 - cell.startTime;
    const { mesh, rarityLight, card, faceCanvas, faceTex, animated } = cell;

    if (animated && faceCanvas && faceTex && (cell.state === 'idle' || cell.state === 'pulse')) {
      CardTextures.buildFace(card, faceCanvas, t);
      faceTex.needsUpdate = true;
    }

    if (cell.state === 'flipping') {
      cell.flipProgress += 0.08;
      const ease = 1 - Math.pow(1 - Math.min(cell.flipProgress, 1), 3);
      mesh.rotation.y = Math.PI * (1 - ease);
      mesh.position.y = Math.sin(Math.min(cell.flipProgress, 1) * Math.PI) * 0.08;
      if (animated && faceCanvas && faceTex && cell.flipProgress > 0.5) {
        CardTextures.buildFace(card, faceCanvas, t);
        faceTex.needsUpdate = true;
      }
      if (cell.flipProgress >= 1) { cell.state = 'idle'; cell.flipProgress = 0; }

    } else if (cell.state === 'idle') {
      mesh.rotation.y = lerp(mesh.rotation.y, Math.sin(cell.idleT * 0.6) * 0.05, 0.05);
      mesh.rotation.x = lerp(mesh.rotation.x, Math.cos(cell.idleT * 0.4) * 0.02, 0.05);
      mesh.position.y = lerp(mesh.position.y, Math.sin(cell.idleT * 0.8) * 0.025, 0.08);

    } else if (cell.state === 'pulse') {
      cell.pulseT += 0.06;
      const pulse = 0.5 + Math.sin(cell.pulseT * 4) * 0.5;
      cell.frontMat.emissiveIntensity = pulse * 1.5;
      if (rarityLight) rarityLight.intensity = pulse * cfgIntensity(card.rarity) * 1.5;
      mesh.rotation.y = Math.sin(cell.pulseT * 3) * 0.08;
      if (cell.pulseT > Math.PI) {
        cell.state = 'done';
        if (onPickCb) { onPickCb(card); onPickCb = null; }
      }

    } else if (cell.state === 'claim-pulse') {
      cell.pulseT += 0.055;
      const pulse = 0.5 + Math.sin(cell.pulseT * 5) * 0.5;
      cell.frontMat.emissiveIntensity = pulse * 2.0;
      if (rarityLight) rarityLight.intensity = pulse * cfgIntensity(card.rarity) * 2;
      mesh.rotation.y = Math.sin(cell.pulseT * 4) * 0.12;
      mesh.rotation.z = Math.sin(cell.pulseT * 3) * 0.04;
      if (animated && faceCanvas && faceTex) {
        CardTextures.buildFace(card, faceCanvas, t);
        faceTex.needsUpdate = true;
      }
      if (cell.pulseT > Math.PI * 0.7) {
        cell.state   = 'claimed';
        cell.claimVY = 0.04;
        if (onClaimCb) onClaimCb(card);
      }

    } else if (cell.state === 'claimed') {
      cell.claimVY   += 0.004;
      mesh.position.y += cell.claimVY;
      cell.opacity    = lerp(cell.opacity, 0, 0.06);
      mesh.material.forEach(m => {
        if (!m.transparent) m.transparent = true;
        m.opacity = cell.opacity;
      });
      if (cell.opacity < 0.02) {
        cell.state = 'gone';
        if (cell.displayCanvas) {
          cell.displayCanvas.style.opacity = '0';
          cell.displayCanvas.style.pointerEvents = 'none';
        }
      }

    } else if (cell.state === 'flipping-back') {
      cell.flipProgress += 0.08;
      const ease = 1 - Math.pow(1 - Math.min(cell.flipProgress, 1), 3);
      mesh.rotation.y = Math.PI * ease;
      if (cell.flipProgress >= 1) { cell.state = 'fading'; cell.flipProgress = 0; }

    } else if (cell.state === 'fading') {
      cell.opacity = lerp(cell.opacity, 0, 0.1);
      mesh.material.forEach(m => {
        if (!m.transparent) m.transparent = true;
        m.opacity = cell.opacity;
      });
      if (cell.opacity < 0.01) {
        cell.state = 'gone';
        if (cell.displayCanvas) {
          cell.displayCanvas.style.opacity = '0';
          cell.displayCanvas.style.pointerEvents = 'none';
        }
      }
    }

    if (rarityLight && (cell.state === 'idle' || cell.state === 'claim-pulse')) {
      const rarity = card.rarity;
      const base   = cfgIntensity(rarity);
      if (rarity === 'legendary-alpha') {
        rarityLight.intensity = base + Math.sin(t * 3) * 1.5;
        rarityLight.color.setHSL((t * 0.1) % 1, 1, 0.7);
      } else if (rarity === 'luck-maxxing') {
        rarityLight.intensity = base + Math.sin(t * 2.5) * 1.0;
      } else if (rarity === 'mythical') {
        rarityLight.intensity = base + Math.sin(t * 3.5) * 1.2;
      } else if (rarity === 'legendary') {
        rarityLight.intensity = base + Math.sin(cell.idleT * 2) * 0.8;
      } else if (rarity === 'rare') {
        rarityLight.intensity = base + Math.sin(cell.idleT * 1.4) * 0.3;
      }
    }
  }

  // ── Shared render loop ─────────────────────────────────────────────────────
  // Renders each cell's 3D scene into the shared off-screen renderer, then
  // copies the result into the cell's visible 2D canvas via drawImage.

  function _startLoop() {
    if (_animFrame) cancelAnimationFrame(_animFrame);
    if (!_renderer) return;

    function loop() {
      _animFrame = requestAnimationFrame(loop);
      if (!cells.length || !_renderer) return;

      const PR = _renderer.getPixelRatio();

      cells.forEach(cell => {
        if (!cell || cell.state === 'gone' || !cell.displayCanvas) return;

        _updateCell(cell);

        const cssW = cell.displayCanvas.offsetWidth;
        const cssH = cell.displayCanvas.offsetHeight;
        if (cssW <= 0 || cssH <= 0) return;

        const rW = Math.round(cssW * PR);
        const rH = Math.round(cssH * PR);

        // Keep display canvas buffer in sync with physical pixels
        if (cell.displayCanvas.width !== rW || cell.displayCanvas.height !== rH) {
          cell.displayCanvas.width  = rW;
          cell.displayCanvas.height = rH;
        }

        // Resize shared renderer only when dimensions change (usually just once)
        if (_renderer.domElement.width !== rW || _renderer.domElement.height !== rH) {
          _renderer.setSize(cssW, cssH, false);
        }

        cell.camera.aspect = cssW / cssH;
        cell.camera.updateProjectionMatrix();

        // Render scene into off-screen WebGL buffer
        _renderer.clear();
        _renderer.render(cell.scene, cell.camera);

        // Blit the WebGL result into the visible 2D canvas
        cell.displayCtx.clearRect(0, 0, rW, rH);
        cell.displayCtx.drawImage(_renderer.domElement, 0, 0, rW, rH);
      });
    }
    loop();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function cfgIntensity(rarity) {
    return {
      common: 0, uncommon: 1.2, rare: 1.8, legendary: 2.5,
      mythical: 3.0, 'luck-maxxing': 3.2, 'legendary-alpha': 4.0,
    }[rarity] || 1;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function _shakeCell(cell) {
    if (!cell.el) return;
    cell.el.classList.remove('choice-cell-shake');
    void cell.el.offsetWidth;
    cell.el.classList.add('choice-cell-shake');
    setTimeout(() => cell.el.classList.remove('choice-cell-shake'), 500);
  }

  // ── Click / touch handler ──────────────────────────────────────────────────

  function onCellClick(chosenCell) {
    if (chosenCell.state !== 'idle') return;

    // Star affordability gate — god-pack claim bypasses cost
    if (!godMode) {
      const cost    = chosenCell.card.starCost ?? 0;
      const balance = typeof window.getStarBalance === 'function' ? window.getStarBalance() : Infinity;
      if (cost > 0 && balance < cost) {
        _shakeCell(chosenCell);
        return;
      }
    }

    if (godMode) {
      chosenCell.state  = 'claim-pulse';
      chosenCell.pulseT = 0;
    } else {
      if (picking) return;
      picking = true;
      cells.forEach(cell => {
        if (cell === chosenCell) {
          cell.state = 'pulse'; cell.pulseT = 0;
        } else {
          setTimeout(() => {
            if (cell.state === 'idle') { cell.state = 'flipping-back'; cell.flipProgress = 0; }
          }, 40 + Math.random() * 60);
        }
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function show(cards, containerId, onPick) {
    destroy();
    picking = false; godMode = false;
    onPickCb = onPick; onClaimCb = null;
    _buildGrid(cards, containerId);
  }

  function showGodPack(cards, containerId, onClaim) {
    destroy();
    picking = false; godMode = true;
    onPickCb = null; onClaimCb = onClaim;
    _buildGrid(cards, containerId);
  }

  function _buildGrid(cards, containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    _ensureRenderer();

    // Build cell divs — CSS grid handles the 2-column layout
    cards.forEach((card, i) => {
      const cellEl = document.createElement('div');
      cellEl.className = 'choice-cell-3d';
      cellEl.id = `choiceCell${i}`;
      grid.appendChild(cellEl);
    });

    cells = cards.map((card, i) => createCell(`choiceCell${i}`, card));
    if (_renderer) _startLoop();

    // ── Star cost badges ──────────────────────────────────────────────────────
    // Appended after createCell — the badge sits inside the cell div, on top of
    // the 2D display canvas (.choice-cost-badge is position:absolute z-index:10).
    const _bal = typeof window.getStarBalance === 'function' ? window.getStarBalance() : Infinity;
    cards.forEach((card, i) => {
      const cost = card.starCost ?? 0;
      if (cost === 0) return;
      const cellEl = document.getElementById(`choiceCell${i}`);
      if (!cellEl) return;
      const badge = document.createElement('div');
      badge.className = 'choice-cost-badge' + (_bal < cost ? ' choice-cost-badge--locked' : '');
      badge.textContent = `★ ${cost}`;
      cellEl.appendChild(badge);
    });

    // Stagger card flips by rarity (lowest first)
    const sortedIndices = cards
      .map((c, i) => ({ rank: RARITY_ORDER[c.rarity] ?? 0, i }))
      .sort((a, b) => a.rank - b.rank)
      .map(x => x.i);

    sortedIndices.forEach((cardIndex, staggerPos) => {
      const cell = cells[cardIndex];
      if (!cell) return;
      setTimeout(() => { cell.state = 'flipping'; cell.flipProgress = 0; }, staggerPos * STAGGER_MS);
    });
  }

  function destroy() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }

    cells.forEach(cell => {
      if (!cell) return;
      cell.mesh?.geometry?.dispose();
      cell.mesh?.material?.forEach?.(m => m.dispose());
      cell.faceTex?.dispose();
      if (cell.rarityLight) cell.scene?.remove(cell.rarityLight);
    });
    cells = []; onPickCb = null; onClaimCb = null; picking = false; godMode = false;
    // _renderer stays alive — WebGL context creation is expensive
  }

  return { show, showGodPack, destroy };
})();
