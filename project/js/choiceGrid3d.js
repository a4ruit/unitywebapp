// choiceGrid3d.js — 2x2 grid of 3D choice cards
// Depends on: cardTextures.js
// Exposes: ChoiceGrid3D.show(cards, containerId, onPick)
//           ChoiceGrid3D.showGodPack(cards, containerId, onClaim)
//           ChoiceGrid3D.destroy()

const ChoiceGrid3D = (() => {

  const RARITY_ORDER = { common:0, uncommon:1, rare:2, legendary:3, mythical:4, 'luck-maxxing':5, 'legendary-alpha':6 };
  const STAGGER_MS   = 180;

  let cells      = [];
  let onPickCb   = null;
  let onClaimCb  = null;
  let picking    = false;
  let godMode    = false;

  // ─── Cell creation ─────────────────────────────────────────────────────────

  function createCell(containerId, card) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return null;

    const W = wrap.clientWidth  || 150;
    const H = wrap.clientHeight || 210;

    const renderer = new THREE.WebGLRenderer({ antialias:false, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    wrap.innerHTML = '';
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%!important;height:100%!important;image-rendering:pixelated;cursor:pointer;';

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W/H, 0.1, 100);
    camera.position.set(0, 0, 3.8);

    scene.add(new THREE.AmbientLight(0x1a2a1a, 0.9));
    const front = new THREE.DirectionalLight(0xffffff, 0.4);
    front.position.set(0,0,5); scene.add(front);
    const top = new THREE.DirectionalLight(0x3aaa3a, 0.3);
    top.position.set(0,4,2); scene.add(top);

    const cfg = CardTextures.getCfg(card.rarity);
    let rarityLight = null;
    if (cfg.light) {
      rarityLight = new THREE.PointLight(cfg.light.color, cfg.light.intensity, cfg.light.dist);
      rarityLight.position.set(0,0,2);
      scene.add(rarityLight);
    }

    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = 256; faceCanvas.height = 384;
    CardTextures.buildFace(card, faceCanvas, 0);
    const faceTex = new THREE.CanvasTexture(faceCanvas);

    const backCanvas = CardTextures.buildBack();
    const backTex    = new THREE.CanvasTexture(backCanvas);

    const geo      = new THREE.BoxGeometry(1.6, 2.4, 0.04);
    const edgeMat  = new THREE.MeshStandardMaterial({ color:0x0f160f, roughness:0.9 });
    const frontMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.7,
      metalness: card.rarity === 'legendary-alpha' ? 0.5 : card.rarity === 'legendary' ? 0.3 : 0.05,
      emissive: new THREE.Color(cfg.emissive),
      emissiveIntensity: cfg.emissiveIntensity,
    });
    const backMat = new THREE.MeshStandardMaterial({ map:backTex, roughness:0.8, metalness:0.05 });

    const mesh = new THREE.Mesh(geo, [edgeMat,edgeMat,edgeMat,edgeMat,frontMat,backMat]);
    mesh.rotation.y = Math.PI;
    scene.add(mesh);

    const animated  = CardTextures.isAnimated(card.rarity);
    const startTime = performance.now() / 1000;

    const cell = {
      renderer, scene, camera, mesh, rarityLight, card,
      faceCanvas, faceTex, frontMat, animated, startTime,
      animFrame: null,
      state: 'waiting', // waiting | flipping | idle | pulse | flipping-back | fading | claimed
      flipProgress: 0,
      idleT: Math.random() * Math.PI * 2,
      opacity: 1,
      pulseT: 0,
      claimVY: 0,
    };

    renderer.domElement.addEventListener('click', () => onCellClick(cell));
    renderer.domElement.addEventListener('touchend', (e) => { e.preventDefault(); onCellClick(cell); }, { passive:false });

    return cell;
  }

  // ─── Animation loop ────────────────────────────────────────────────────────

  function startCellLoop(cell) {
    function loop() {
      cell.animFrame = requestAnimationFrame(loop);
      cell.idleT += 0.014;
      const t = performance.now() / 1000 - cell.startTime;
      const { mesh, rarityLight, card, faceCanvas, faceTex, animated } = cell;

      // Animated texture
      if (animated && faceCanvas && faceTex && (cell.state === 'idle' || cell.state === 'pulse')) {
        CardTextures.buildFace(card, faceCanvas, t);
        faceTex.needsUpdate = true;
      }

      if (cell.state === 'flipping') {
        cell.flipProgress += 0.032;
        const ease = 1 - Math.pow(1 - Math.min(cell.flipProgress,1), 3);
        mesh.rotation.y = Math.PI * (1 - ease);
        mesh.position.y = Math.sin(Math.min(cell.flipProgress,1) * Math.PI) * 0.12;
        if (animated && faceCanvas && faceTex && cell.flipProgress > 0.5) {
          CardTextures.buildFace(card, faceCanvas, t);
          faceTex.needsUpdate = true;
        }
        if (cell.flipProgress >= 1) { cell.state = 'idle'; cell.flipProgress = 0; }

      } else if (cell.state === 'idle') {
        mesh.rotation.y = lerp(mesh.rotation.y, Math.sin(cell.idleT*0.6)*0.05, 0.05);
        mesh.rotation.x = lerp(mesh.rotation.x, Math.cos(cell.idleT*0.4)*0.02, 0.05);
        mesh.position.y = lerp(mesh.position.y, Math.sin(cell.idleT*0.8)*0.025, 0.08);

      } else if (cell.state === 'pulse') {
        // Normal pick mode — pulse then fire callback
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
        // God-pack mode — pulse then fly up and fade
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
          cell.state     = 'claimed';
          cell.claimVY   = 0.04;
          if (onClaimCb) onClaimCb(card);
        }

      } else if (cell.state === 'claimed') {
        // Fly upward and fade
        cell.claimVY   += 0.004;
        mesh.position.y += cell.claimVY;
        cell.opacity    = lerp(cell.opacity, 0, 0.06);
        mesh.material.forEach(m => {
          if (!m.transparent) m.transparent = true;
          m.opacity = cell.opacity;
        });
        if (cell.opacity < 0.02) {
          cell.state = 'gone';
          cell.renderer.domElement.style.opacity = '0';
          cell.renderer.domElement.style.pointerEvents = 'none';
        }

      } else if (cell.state === 'flipping-back') {
        cell.flipProgress += 0.045;
        const ease = 1 - Math.pow(1 - Math.min(cell.flipProgress,1), 3);
        mesh.rotation.y = Math.PI * ease;
        if (cell.flipProgress >= 1) { cell.state = 'fading'; cell.flipProgress = 0; }

      } else if (cell.state === 'fading') {
        cell.opacity = lerp(cell.opacity, 0, 0.07);
        mesh.material.forEach(m => {
          if (!m.transparent) m.transparent = true;
          m.opacity = cell.opacity;
        });
        if (cell.opacity < 0.01) {
          cell.state = 'gone';
          cell.renderer.domElement.style.opacity = '0';
          cell.renderer.domElement.style.pointerEvents = 'none';
        }
      }

      // Rarity light in idle/claim-pulse
      if (rarityLight && (cell.state === 'idle' || cell.state === 'claim-pulse')) {
        const rarity = card.rarity;
        const base   = cfgIntensity(rarity);
        if (rarity === 'legendary-alpha') {
          rarityLight.intensity = base + Math.sin(t*3)*1.5;
          rarityLight.color.setHSL((t*0.1)%1, 1, 0.7);
        } else if (rarity === 'luck-maxxing') {
          rarityLight.intensity = base + Math.sin(t*2.5)*1.0;
        } else if (rarity === 'mythical') {
          rarityLight.intensity = base + Math.sin(t*3.5)*1.2;
        } else if (rarity === 'legendary') {
          rarityLight.intensity = base + Math.sin(cell.idleT*2)*0.8;
        } else if (rarity === 'rare') {
          rarityLight.intensity = base + Math.sin(cell.idleT*1.4)*0.3;
        }
      }

      cell.renderer.render(cell.scene, cell.camera);
    }
    loop();
  }

  function cfgIntensity(rarity) {
    return { common:0, uncommon:1.2, rare:1.8, legendary:2.5, mythical:3.0, 'luck-maxxing':3.2, 'legendary-alpha':4.0 }[rarity] || 1;
  }

  function lerp(a,b,t) { return a+(b-a)*t; }

  // ─── Click handler ─────────────────────────────────────────────────────────

  function onCellClick(chosenCell) {
    if (chosenCell.state !== 'idle') return;

    if (godMode) {
      // God-pack: claim this card, leave others untouched
      chosenCell.state  = 'claim-pulse';
      chosenCell.pulseT = 0;

    } else {
      // Normal mode: pick one, dismiss others
      if (picking) return;
      picking = true;
      cells.forEach(cell => {
        if (cell === chosenCell) {
          cell.state = 'pulse'; cell.pulseT = 0;
        } else {
          setTimeout(() => {
            if (cell.state === 'idle') { cell.state = 'flipping-back'; cell.flipProgress = 0; }
          }, 80 + Math.random() * 120);
        }
      });
    }
  }

  // ─── Public: show (normal pick mode) ──────────────────────────────────────

  function show(cards, containerId, onPick) {
    destroy();
    picking   = false;
    godMode   = false;
    onPickCb  = onPick;
    onClaimCb = null;
    _buildGrid(cards, containerId);
  }

  // ─── Public: showGodPack (claim-all mode) ─────────────────────────────────

  function showGodPack(cards, containerId, onClaim) {
    destroy();
    picking   = false;
    godMode   = true;
    onPickCb  = null;
    onClaimCb = onClaim;
    _buildGrid(cards, containerId);
  }

  // ─── Shared grid builder ──────────────────────────────────────────────────

  function _buildGrid(cards, containerId) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    cards.forEach((card, i) => {
      const cellEl = document.createElement('div');
      cellEl.className = 'choice-cell-3d';
      cellEl.id = `choiceCell${i}`;
      grid.appendChild(cellEl);
    });

    const sortedIndices = cards
      .map((c,i) => ({ rank: RARITY_ORDER[c.rarity] ?? 0, i }))
      .sort((a,b) => a.rank - b.rank)
      .map(x => x.i);

    cells = cards.map((card,i) => createCell(`choiceCell${i}`, card));
    cells.forEach(cell => { if (cell) startCellLoop(cell); });

    sortedIndices.forEach((cardIndex, staggerPos) => {
      const cell = cells[cardIndex];
      if (!cell) return;
      setTimeout(() => { cell.state = 'flipping'; cell.flipProgress = 0; }, staggerPos * STAGGER_MS);
    });
  }

  // ─── Destroy ──────────────────────────────────────────────────────────────

  function destroy() {
    cells.forEach(cell => {
      if (!cell) return;
      cancelAnimationFrame(cell.animFrame);
      cell.mesh?.geometry?.dispose();
      cell.mesh?.material?.forEach?.(m => m.dispose());
      cell.faceTex?.dispose();
      if (cell.rarityLight) cell.scene?.remove(cell.rarityLight);
      cell.renderer?.dispose();
    });
    cells = []; onPickCb = null; onClaimCb = null; picking = false; godMode = false;
  }

  return { show, showGodPack, destroy };
})();