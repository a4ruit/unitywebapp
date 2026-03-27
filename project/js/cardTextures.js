// cardTextures.js — shared animated card face/back texture builders
// Used by cards3d.js and choiceGrid3d.js
// Exposes: CardTextures.buildFace(card, t), CardTextures.buildBack(), CardTextures.isAnimated(rarity)

const CardTextures = (() => {

  const RARITY_CFG = {
    common:          { border:'#607060', emissive:0x101810, emissiveIntensity:0.05, light:null },
    uncommon:        { border:'#4a8aaa', emissive:0x0a1820, emissiveIntensity:0.2,  light:{ color:0x4a8aaa, intensity:1.2, dist:5 } },
    rare:            { border:'#9a6ab8', emissive:0x120a1a, emissiveIntensity:0.3,  light:{ color:0x9a6ab8, intensity:1.8, dist:5 } },
    legendary:       { border:'#c89030', emissive:0x201000, emissiveIntensity:0.5,  light:{ color:0xc89030, intensity:2.5, dist:6 } },
    mythical:        { border:'#cc2200', emissive:0x200400, emissiveIntensity:0.6,  light:{ color:0xcc2200, intensity:3.0, dist:6 } },
    'luck-maxxing':  { border:'#cc44aa', emissive:0x1a0414, emissiveIntensity:0.65, light:{ color:0xcc44aa, intensity:3.2, dist:7 } },
    'legendary-alpha':{ border:'#ffffff', emissive:0x101010, emissiveIntensity:0.8,  light:{ color:0xffffff, intensity:4.0, dist:8 } },
  };

  const ANIMATED = new Set(['mythical','luck-maxxing','legendary-alpha']);

  function isAnimated(rarity) { return ANIMATED.has(rarity); }

  function getCfg(rarity) { return RARITY_CFG[rarity] || RARITY_CFG.common; }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  // Rainbow color at time t, angle offset
  function rainbow(t, offset = 0) {
    const h = ((t * 60 + offset) % 360 + 360) % 360;
    const s = 100, l = 60;
    return `hsl(${h},${s}%,${l}%)`;
  }

  // ─── Shape drawers ──────────────────────────────────────────────────────────

  function drawShape(ctx, rarity, t) {
    const cfg = getCfg(rarity);

    ctx.save();
    ctx.translate(128, 148);

    if (rarity === 'common') {
      ctx.fillStyle = cfg.border;
      ctx.fillRect(-18,-18,36,36);

    } else if (rarity === 'uncommon') {
      ctx.fillStyle = cfg.border;
      ctx.fillRect(-32,-32,64,64);

    } else if (rarity === 'rare') {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2 - Math.PI/8;
        i===0 ? ctx.moveTo(Math.cos(a)*34,Math.sin(a)*34) : ctx.lineTo(Math.cos(a)*34,Math.sin(a)*34);
      }
      ctx.closePath(); ctx.fillStyle = cfg.border; ctx.fill();

    } else if (rarity === 'legendary') {
      ctx.beginPath(); ctx.moveTo(0,-44); ctx.lineTo(36,36); ctx.lineTo(-36,36); ctx.closePath();
      ctx.fillStyle = cfg.border; ctx.fill();
      const ig = ctx.createLinearGradient(0,-44,0,36);
      ig.addColorStop(0,'rgba(255,220,100,0.3)'); ig.addColorStop(1,'transparent');
      ctx.fillStyle = ig; ctx.fill();

    } else if (rarity === 'mythical') {
      // Octagon — rotates slowly
      const rot = t * Math.PI * 0.4;
      ctx.rotate(rot);
      const pulse = 30 + Math.sin(t * 3) * 4;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2;
        i===0 ? ctx.moveTo(Math.cos(a)*pulse,Math.sin(a)*pulse) : ctx.lineTo(Math.cos(a)*pulse,Math.sin(a)*pulse);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(204,34,0,${0.7 + Math.sin(t*4)*0.3})`;
      ctx.fill();
      // Inner ring
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2 + Math.PI/8;
        i===0 ? ctx.moveTo(Math.cos(a)*16,Math.sin(a)*16) : ctx.lineTo(Math.cos(a)*16,Math.sin(a)*16);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(255,80,40,${0.5 + Math.sin(t*4+1)*0.3})`;
      ctx.fill();

    } else if (rarity === 'luck-maxxing') {
      // Three circles — orbit each other
      const orbitR = 18;
      const circR  = 12 + Math.sin(t * 2) * 2;
      for (let i = 0; i < 3; i++) {
        const angle = (i/3)*Math.PI*2 + t * 1.2;
        const cx    = Math.cos(angle) * orbitR;
        const cy    = Math.sin(angle) * orbitR;
        ctx.beginPath();
        ctx.arc(cx, cy, circR, 0, Math.PI*2);
        ctx.fillStyle = `rgba(204,68,170,${0.6 + Math.sin(t*3 + i*2)*0.4})`;
        ctx.fill();
        // Glow ring
        ctx.beginPath();
        ctx.arc(cx, cy, circR + 3, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(255,120,210,${0.3 + Math.sin(t*2+i)*0.2})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

    } else if (rarity === 'legendary-alpha') {
      // Star — rotates, rainbow fill
      const rot     = t * Math.PI * 0.5;
      const outerR  = 36 + Math.sin(t*3)*3;
      const innerR  = 15 + Math.sin(t*3+1)*2;
      const points  = 5;
      ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i / (points*2)) * Math.PI*2 - Math.PI/2;
        i===0 ? ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r) : ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
      }
      ctx.closePath();
      // Rainbow fill
      const grad = ctx.createLinearGradient(-outerR,-outerR,outerR,outerR);
      for (let i = 0; i <= 6; i++) {
        grad.addColorStop(i/6, rainbow(t, i*60));
      }
      ctx.fillStyle = grad;
      ctx.fill();
      // White core glow
      ctx.beginPath();
      ctx.arc(0, 0, 8 + Math.sin(t*4)*2, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(t*5)*0.4})`;
      ctx.fill();
    }

    ctx.restore();
  }

  // ─── Animated border ────────────────────────────────────────────────────────

  function drawBorder(ctx, rarity, t) {
    const cfg = getCfg(rarity);

    if (rarity === 'legendary-alpha') {
      // Rainbow border
      const grad = ctx.createLinearGradient(0,0,256,384);
      for (let i = 0; i <= 8; i++) {
        grad.addColorStop(i/8, rainbow(t, i*45));
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,255,255,0.2)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else if (rarity === 'luck-maxxing') {
      // Pulsing pink
      const alpha = 0.7 + Math.sin(t * 3) * 0.3;
      ctx.strokeStyle = `rgba(204,68,170,${alpha})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,120,210,0.2)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else if (rarity === 'mythical') {
      // Pulsing red
      const alpha = 0.7 + Math.sin(t * 4) * 0.3;
      ctx.strokeStyle = `rgba(204,34,0,${alpha})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,80,40,0.25)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else {
      ctx.strokeStyle = cfg.border;
      ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.3)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    }
  }

  // ─── Animated background ────────────────────────────────────────────────────

  function drawBackground(ctx, rarity, t) {
    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0,0,256,384);

    const cfg = getCfg(rarity);

    if (rarity === 'legendary-alpha') {
      // Shifting rainbow bg wash
      const grad = ctx.createRadialGradient(128,192,0,128,192,200);
      grad.addColorStop(0, `hsla(${(t*40)%360},80%,20%,0.4)`);
      grad.addColorStop(0.5, `hsla(${(t*40+120)%360},80%,10%,0.2)`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,256,384);
    } else if (rarity === 'luck-maxxing') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,180);
      grad.addColorStop(0, `rgba(204,68,170,${0.1 + Math.sin(t*2)*0.05})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,256,384);
    } else if (rarity === 'mythical') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,180);
      grad.addColorStop(0, `rgba(204,34,0,${0.08 + Math.sin(t*3)*0.04})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,256,384);
    } else if (rarity === 'legendary') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,160);
      grad.addColorStop(0,'rgba(200,144,48,0.12)');
      grad.addColorStop(1,'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(0,0,256,384);
    }

    // Diagonal grid
    const gridColor = rarity === 'legendary-alpha'
      ? `rgba(255,255,255,0.06)`
      : `rgba(${hexToRgb(cfg.border)},0.1)`;
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    // Scanlines
    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0,y+2,256,2);
    }
  }

  // ─── Corner brackets ────────────────────────────────────────────────────────

  function drawCorners(ctx, rarity, t) {
    let color;
    if (rarity === 'legendary-alpha') {
      color = rainbow(t, 0);
    } else {
      color = getCfg(rarity).border;
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    const b = 14, bp = 14;
    [[bp,bp,1,1],[256-bp,bp,-1,1],[bp,384-bp,1,-1],[256-bp,384-bp,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x,y+sy*b); ctx.lineTo(x,y); ctx.lineTo(x+sx*b,y); ctx.stroke();
    });
  }

  // ─── Text labels ────────────────────────────────────────────────────────────

  function drawLabels(ctx, card, rarity, t) {
    const cfg = getCfg(rarity);

    let nameColor, rarityColor;
    if (rarity === 'legendary-alpha') {
      nameColor   = rainbow(t, 30);
      rarityColor = rainbow(t, 90);
    } else {
      nameColor   = cfg.border;
      rarityColor = `rgba(${hexToRgb(cfg.border)},0.7)`;
    }

    // Rarity label
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = rarityColor;
    ctx.fillText(rarity.toUpperCase(), 128, 218);

    // Name
    ctx.font = 'bold 34px "VT323", monospace';
    ctx.fillStyle = nameColor;
    if (rarity !== 'legendary-alpha') { ctx.shadowColor = nameColor; ctx.shadowBlur = 8; }
    ctx.fillText(card.name.toUpperCase(), 128, 256);
    ctx.shadowBlur = 0;

    // Divider
    ctx.strokeStyle = `rgba(${rarity === 'legendary-alpha' ? '255,255,255' : hexToRgb(cfg.border)},0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28,268); ctx.lineTo(228,268); ctx.stroke();

    // Description
    ctx.font = '13px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.5)';
    ctx.shadowBlur = 0;
    const words = card.desc.split(' ');
    let line = '', lineY = 292;
    words.forEach(w => {
      const test = line ? line+' '+w : w;
      if (ctx.measureText(test).width > 210 && line) {
        ctx.fillText(line,128,lineY); line=w; lineY+=18;
      } else { line=test; }
    });
    if (line) ctx.fillText(line,128,lineY);
  }

  // ─── Public: buildFace ─────────────────────────────────────────────────────
  // t = elapsed time in seconds (used for animation)

  function buildFace(card, canvas, t = 0) {
    // Accept an existing canvas to draw into (for animated reuse)
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 384;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,256,384);

    drawBackground(ctx, card.rarity, t);
    drawBorder(ctx, card.rarity, t);
    drawCorners(ctx, card.rarity, t);
    drawShape(ctx, card.rarity, t);
    drawLabels(ctx, card, card.rarity, t);

    return canvas;
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
    return c;
  }

  return { buildFace, buildBack, isAnimated, getCfg };
})();