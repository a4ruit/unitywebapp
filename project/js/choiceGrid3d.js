// choiceGrid3d.js — 2x2 grid of 3D choice cards
// Uses ONE shared WebGLRenderer with scissor/viewport so only 1 WebGL context
// is consumed regardless of how many cards are shown. Older/budget Android
// phones cap WebGL at 4-8 contexts; the previous per-card approach (5 contexts)
// would trip that limit when combined with Pack3D, causing white patches.
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

  // ── Single shared WebGL renderer (lazy-created, never disposed) ────────────
  let _renderer  = null;
  let _animFrame = null;

  function _ensureRenderer() {
    if (_renderer) return;
    try {
      _renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
      });
      _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      _renderer.setClearColor(0x000000, 0);
      _renderer.autoClear = false;   // we clear manually with scissor
      // Absolutely covers the whole grid; pointer-events:none so clicks reach cell divs
      _renderer.domElement.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'pointer-events:none;display:block;image-rendering:pixelated;z-index:1;';
    } catch (e) {
      console.warn('ChoiceGrid3D: WebGL init failed', e);
      _renderer = null;
    }
  }

  // ── Cell factory — scene/camera/mesh only, no per-cell renderer ───────────

  function createCell(containerId, card) {
    const cellEl = document.getElementById(containerId);
    if (!cellEl) return null;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
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
      el: cellEl,
      state: 'waiting',
      flipProgress: 0,
      idleT: Math.random() * Math.PI * 2,
      opacity: 1,
      pulseT: 0,
      claimVY: 0,
    };

    // Cell divs handle clicks — the shared canvas above them is pointer-events:none
    cellEl.style.cursor = 'pointer';
    cellEl.addEventListener('click', () => onCellClick(cell));
    cellEl.addEventListener('touchend', (e) => { e.preventDefault(); onCellClick(cell); }, { passive: false });

    return cell;
  }

  // ── Per-cell state machine update (called each frame from shared loop) ─────

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
        if (cell.el) { cell.el.style.opacity = '0'; cell.el.style.pointerEvents = 'none'; }
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
        if (cell.el) { cell.el.style.opacity = '0'; cell.el.style.pointerEvents = 'none'; }
      }
    }

    if (rarityLight && (cell.state === 'idle' || cell.state === 'claim-pulse')) {
      const rarity = card.rarity;
      const base   = cfgIntensity(rarity);
      const t2     = performance.now() / 1000 - cell.startTime;
      if (rarity === 'legendary-alpha') {
        rarityLight.intensity = base + Math.sin(t2 * 3) * 1.5;
        rarityLight.color.setHSL((t2 * 0.1) % 1, 1, 0.7);
      } else if (rarity === 'luck-maxxing') {
        rarityLight.intensity = base + Math.sin(t2 * 2.5) * 1.0;
      } else if (rarity === 'mythical') {
        rarityLight.intensity = base + Math.sin(t2 * 3.5) * 1.2;
      } else if (rarity === 'legendary') {
        rarityLight.intensity = base + Math.sin(cell.idleT * 2) * 0.8;
      } else if (rarity === 'rare') {
        rarityLight.intensity = base + Math.sin(cell.idleT * 1.4) * 0.3;
      }
    }
  }

  // ── Single shared render loop ──────────────────────────────────────────────

  function _startLoop(grid) {
    if (_animFrame) cancelAnimationFrame(_animFrame);
    if (!_renderer) return;

    function loop() {
      _animFrame = requestAnimationFrame(loop);
      if (!cells.length || !_renderer) return;

      // Sync canvas size to live grid dimensions
      const gW = grid.clientWidth  || 300;
      const gH = grid.clientHeight || 400;
      const PR = _renderer.getPixelRatio();
      const targetW = Math.round(gW * PR);
      const targetH = Math.round(gH * PR);
      if (_renderer.domElement.width !== targetW || _renderer.domElement.height !== targetH) {
        _renderer.setSize(gW, gH, false);
      }

      // Clear whole canvas once at the top of the frame
      _renderer.setScissorTest(false);
      _renderer.setViewport(0, 0, gW, gH);
      _renderer.clear(true, true, true);
      _renderer.setScissorTest(true);

      const gridRect = grid.getBoundingClientRect();

      cells.forEach(cell => {
        if (!cell || cell.state === 'gone' || !cell.el) return;

        _updateCell(cell);

        // Map this cell's screen rect into canvas pixel coords
        const rect = cell.el.getBoundingClientRect();
        const x = Math.round((rect.left   - gridRect.left)   * PR);
        const y = Math.round((gridRect.bottom - rect.bottom) * PR); // WebGL Y is flipped
        const w = Math.round(rect.width  * PR);
        const h = Math.round(rect.height * PR);

        if (w <= 0 || h <= 0) return;

        _renderer.setScissor(x, y, w, h);
        _renderer.setViewport(x, y, w, h);
        // Clear depth per card so scenes don't bleed into each other
        _renderer.clearDepth();

        cell.camera.aspect = rect.width / rect.height;
        cell.camera.updateProjectionMatrix();
        _renderer.render(cell.scene, cell.camera);
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
    grid.style.position = 'relative'; // anchors the absolutely-positioned shared canvas

    _ensureRenderer();

    if (_renderer) {
      _renderer.setSize(grid.clientWidth || 300, grid.clientHeight || 400, false);
      // Re-append canvas if it was removed by a previous grid.innerHTML = ''
      if (!grid.contains(_renderer.domElement)) {
        grid.appendChild(_renderer.domElement);
      }
    }

    // Cell placeholder divs — CSS grid handles 2-column layout.
    // The shared canvas (pointer-events:none) sits above them at z-index:1.
    // Click events fall through the canvas to these divs.
    cards.forEach((card, i) => {
      const cellEl = document.createElement('div');
      cellEl.className = 'choice-cell-3d';
      cellEl.id = `choiceCell${i}`;
      grid.appendChild(cellEl);
    });

    cells = cards.map((card, i) => createCell(`choiceCell${i}`, card));
    if (_renderer) _startLoop(grid);

    // ── Star cost badges ─────────────────────────────────────────────────────
    // Appended after createCell so they layer on top of the WebGL canvas
    // (.choice-cost-badge is position:absolute z-index:10 inside position:relative cell).
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
      // Remove listeners by detaching the DOM element (grid.innerHTML='' handles this)
    });
    cells = []; onPickCb = null; onClaimCb = null; picking = false; godMode = false;

    // Detach shared canvas from whichever grid it's currently in
    if (_renderer?.domElement?.parentNode) {
      _renderer.domElement.parentNode.removeChild(_renderer.domElement);
    }
    // _renderer itself is kept alive — recreating a WebGL context is expensive
  }

  return { show, showGodPack, destroy };
})();
