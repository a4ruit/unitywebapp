// choiceGrid3d.js — 2x2 grid of 3D choice cards
// Exposes: ChoiceGrid3D.show(cards, onPick), ChoiceGrid3D.destroy()

const ChoiceGrid3D = (() => {

  const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, legendary: 3 };
  const STAGGER_MS   = 180; // delay between each card flip

  const RARITY_CFG = {
    common:    { border: '#607060', emissive: 0x101810, emissiveIntensity: 0.05, light: null },
    uncommon:  { border: '#4a8aaa', emissive: 0x0a1820, emissiveIntensity: 0.2,  light: { color: 0x4a8aaa, intensity: 1.0, dist: 4 } },
    rare:      { border: '#9a6ab8', emissive: 0x120a1a, emissiveIntensity: 0.3,  light: { color: 0x9a6ab8, intensity: 1.4, dist: 4 } },
    legendary: { border: '#c89030', emissive: 0x201000, emissiveIntensity: 0.5,  light: { color: 0xc89030, intensity: 2.0, dist: 5 } },
  };

  // Per-cell state
  let cells       = []; // { renderer, scene, camera, mesh, light, card, animFrame, state, flipProgress, idleT }
  let onPickCb    = null;
  let picking     = false; // locked during pick animation

  // ─── Texture builders (shared with cards3d pattern) ──────────────────────

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  function buildFace(card) {
    const c   = document.createElement('canvas');
    c.width   = 256; c.height = 384;
    const ctx = c.getContext('2d');
    const cfg = RARITY_CFG[card.rarity] || RARITY_CFG.common;

    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0, 0, 256, 384);

    // Diagonal grid
    ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.12)`;
    ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    // Legendary glow bg
    if (card.rarity === 'legendary') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,160);
      grad.addColorStop(0,'rgba(200,144,48,0.12)'); grad.addColorStop(1,'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    }

    // Border
    ctx.strokeStyle = cfg.border; ctx.lineWidth = 5;
    ctx.strokeRect(5,5,246,374);
    ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.3)`; ctx.lineWidth = 1.5;
    ctx.strokeRect(10,10,236,364);

    // Scanlines
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0,y+2,256,2);
    }

    // Corner brackets
    ctx.strokeStyle = cfg.border; ctx.lineWidth = 2;
    const b = 14, bp = 14;
    [[bp,bp,1,1],[256-bp,bp,-1,1],[bp,384-bp,1,-1],[256-bp,384-bp,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x,y+sy*b); ctx.lineTo(x,y); ctx.lineTo(x+sx*b,y); ctx.stroke();
    });

    // Shape
    ctx.save(); ctx.translate(128, 140);
    if (card.rarity === 'common') {
      ctx.fillStyle = cfg.border;
      ctx.fillRect(-18,-18,36,36);
    } else if (card.rarity === 'uncommon') {
      ctx.fillStyle = cfg.border;
      ctx.fillRect(-32,-32,64,64);
    } else if (card.rarity === 'rare') {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2 - Math.PI/8;
        i===0 ? ctx.moveTo(Math.cos(a)*34,Math.sin(a)*34) : ctx.lineTo(Math.cos(a)*34,Math.sin(a)*34);
      }
      ctx.closePath(); ctx.fillStyle = cfg.border; ctx.fill();
    } else if (card.rarity === 'legendary') {
      ctx.beginPath(); ctx.moveTo(0,-44); ctx.lineTo(36,36); ctx.lineTo(-36,36); ctx.closePath();
      ctx.fillStyle = cfg.border; ctx.fill();
      const ig = ctx.createLinearGradient(0,-44,0,36);
      ig.addColorStop(0,'rgba(255,220,100,0.3)'); ig.addColorStop(1,'transparent');
      ctx.fillStyle = ig; ctx.fill();
    }
    ctx.restore();

    // Rarity label
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(${hexToRgb(cfg.border)},0.7)`;
    ctx.fillText(card.rarity.toUpperCase(), 128, 218);

    // Name
    ctx.font = 'bold 34px "VT323", monospace';
    ctx.fillStyle = cfg.border;
    ctx.shadowColor = cfg.border; ctx.shadowBlur = 8;
    ctx.fillText(card.name.toUpperCase(), 128, 256);
    ctx.shadowBlur = 0;

    // Divider
    ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.3)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28,268); ctx.lineTo(228,268); ctx.stroke();

    // Desc — word wrap
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.5)';
    const words = card.desc.split(' ');
    let line = '', lineY = 292;
    words.forEach(w => {
      const test = line ? line+' '+w : w;
      if (ctx.measureText(test).width > 210 && line) {
        ctx.fillText(line, 128, lineY); line = w; lineY += 18;
      } else { line = test; }
    });
    if (line) ctx.fillText(line, 128, lineY);

    if (card.rarity === 'legendary') {
      const holo = ctx.createLinearGradient(0,0,256,0);
      holo.addColorStop(0,'rgba(200,144,48,0.0)'); holo.addColorStop(0.5,'rgba(255,200,80,0.1)'); holo.addColorStop(1,'rgba(200,144,48,0.0)');
      ctx.fillStyle = holo; ctx.fillRect(0,0,256,384);
    }

    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }

  function buildBack() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 384;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a100a'; ctx.fillRect(0,0,256,384);
    ctx.strokeStyle = 'rgba(42,122,42,0.12)'; ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }
    ctx.strokeStyle = '#e85c1a'; ctx.lineWidth = 4;
    ctx.strokeRect(8,8,240,368);
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(0,y+2,256,2);
    }
    ctx.font = '52px "VT323", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,92,26,0.18)';
    ctx.fillText('◈', 128, 210);
    const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true; return tex;
  }

  // ─── Cell setup ────────────────────────────────────────────────────────────

  function createCell(containerId, card) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return null;

    const W = wrap.clientWidth  || 150;
    const H = wrap.clientHeight || 210;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
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

    const cfg = RARITY_CFG[card.rarity] || RARITY_CFG.common;
    let rarityLight = null;
    if (cfg.light) {
      rarityLight = new THREE.PointLight(cfg.light.color, cfg.light.intensity, cfg.light.dist);
      rarityLight.position.set(0,0,2);
      scene.add(rarityLight);
    }

    const geo      = new THREE.BoxGeometry(1.6, 2.4, 0.04);
    const edgeMat  = new THREE.MeshStandardMaterial({ color: 0x0f160f, roughness: 0.9 });
    const frontMat = new THREE.MeshStandardMaterial({
      map: buildFace(card),
      roughness: 0.7,
      metalness: card.rarity === 'legendary' ? 0.3 : 0.05,
      emissive: new THREE.Color(cfg.emissive),
      emissiveIntensity: cfg.emissiveIntensity,
    });
    const backMat = new THREE.MeshStandardMaterial({ map: buildBack(), roughness: 0.8, metalness: 0.05 });

    const mesh = new THREE.Mesh(geo, [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat]);
    mesh.rotation.y = Math.PI; // start face-down
    scene.add(mesh);

    const cell = {
      renderer, scene, camera, mesh, rarityLight, card,
      animFrame: null,
      state: 'waiting', // waiting | flipping | idle | picking | flipping-back | fading
      flipProgress: 0,
      idleT: Math.random() * Math.PI * 2, // offset so cells don't bob in sync
      opacity: 1,
    };

    // Click handler on the canvas
    renderer.domElement.addEventListener('click', () => onCellClick(cell));
    renderer.domElement.addEventListener('touchend', (e) => { e.preventDefault(); onCellClick(cell); }, { passive: false });

    return cell;
  }

  function startCellLoop(cell) {
    function loop() {
      cell.animFrame = requestAnimationFrame(loop);
      cell.idleT += 0.014;

      const { mesh, rarityLight, card } = cell;

      if (cell.state === 'flipping') {
        cell.flipProgress += 0.032;
        const t    = Math.min(cell.flipProgress, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        mesh.rotation.y = Math.PI * (1 - ease);
        mesh.position.y = Math.sin(t * Math.PI) * 0.12;
        if (t >= 1) {
          cell.state = 'idle';
          cell.flipProgress = 0;
        }

      } else if (cell.state === 'idle') {
        mesh.rotation.y = lerp(mesh.rotation.y, Math.sin(cell.idleT * 0.6) * 0.05, 0.05);
        mesh.rotation.x = lerp(mesh.rotation.x, Math.cos(cell.idleT * 0.4) * 0.02, 0.05);
        mesh.position.y = lerp(mesh.position.y, Math.sin(cell.idleT * 0.8) * 0.025, 0.08);

      } else if (cell.state === 'pulse') {
        // Chosen card — pulse emissive then drop
        cell.pulseT = (cell.pulseT || 0) + 0.06;
        const pulse = 0.5 + Math.sin(cell.pulseT * 4) * 0.5;
        mesh.material[4].emissiveIntensity = pulse * 1.2;
        if (rarityLight) rarityLight.intensity = pulse * 3;
        mesh.rotation.y = Math.sin(cell.pulseT * 3) * 0.08;
        if (cell.pulseT > Math.PI) {
          cell.state = 'done';
          if (onPickCb) { onPickCb(card); onPickCb = null; }
        }

      } else if (cell.state === 'flipping-back') {
        cell.flipProgress += 0.045;
        const t    = Math.min(cell.flipProgress, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        mesh.rotation.y = Math.PI * ease; // 0 → π (front to back)
        if (t >= 1) {
          cell.state = 'fading';
          cell.flipProgress = 0;
        }

      } else if (cell.state === 'fading') {
        cell.opacity = lerp(cell.opacity, 0, 0.07);
        mesh.material.forEach(m => {
          if (!m.transparent) { m.transparent = true; }
          m.opacity = cell.opacity;
        });
        if (cell.opacity < 0.01) {
          cell.state = 'gone';
          cell.renderer.domElement.style.opacity = '0';
        }
      }

      // Rarity light pulse
      if (rarityLight && cell.state === 'idle') {
        const cfg = RARITY_CFG[card.rarity];
        if (card.rarity === 'legendary') {
          rarityLight.intensity = cfg.light.intensity + Math.sin(cell.idleT * 2) * 0.6;
        } else if (card.rarity === 'rare') {
          rarityLight.intensity = cfg.light.intensity + Math.sin(cell.idleT * 1.4) * 0.3;
        }
      }

      cell.renderer.render(cell.scene, cell.camera);
    }
    loop();
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ─── Cell click ────────────────────────────────────────────────────────────

  function onCellClick(chosenCell) {
    if (picking) return;
    if (chosenCell.state !== 'idle') return;
    picking = true;

    cells.forEach(cell => {
      if (cell === chosenCell) {
        cell.state  = 'pulse';
        cell.pulseT = 0;
      } else {
        // Stagger flip-back slightly
        setTimeout(() => {
          if (cell.state === 'idle') cell.state = 'flipping-back';
          cell.flipProgress = 0;
        }, 80 + Math.random() * 120);
      }
    });
  }

  // ─── Public: show ──────────────────────────────────────────────────────────

  function show(cards, containerId, onPick) {
    destroy();
    picking  = false;
    onPickCb = onPick;

    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = '';

    // Build 2x2 grid of canvas containers
    cards.forEach((card, i) => {
      const cellEl = document.createElement('div');
      cellEl.className = 'choice-cell-3d';
      cellEl.id = `choiceCell${i}`;
      grid.appendChild(cellEl);
    });

    // Sort by rarity for stagger order (common first)
    const sortedIndices = cards
      .map((c, i) => ({ rarity: RARITY_ORDER[c.rarity] ?? 0, i }))
      .sort((a, b) => a.rarity - b.rarity)
      .map(x => x.i);

    // Create cells
    cells = cards.map((card, i) => createCell(`choiceCell${i}`, card));

    // Start loops immediately (shows back face)
    cells.forEach(cell => { if (cell) startCellLoop(cell); });

    // Stagger flip reveals by rarity order
    sortedIndices.forEach((cardIndex, staggerPos) => {
      const cell = cells[cardIndex];
      if (!cell) return;
      setTimeout(() => {
        cell.state        = 'flipping';
        cell.flipProgress = 0;
      }, staggerPos * STAGGER_MS);
    });
  }

  // ─── Public: destroy ───────────────────────────────────────────────────────

  function destroy() {
    cells.forEach(cell => {
      if (!cell) return;
      cancelAnimationFrame(cell.animFrame);
      cell.mesh?.geometry?.dispose();
      cell.mesh?.material?.forEach?.(m => m.dispose());
      if (cell.rarityLight) cell.scene?.remove(cell.rarityLight);
      cell.renderer?.dispose();
    });
    cells    = [];
    onPickCb = null;
    picking  = false;
  }

  return { show, destroy };
})();