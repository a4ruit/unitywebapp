// cardTextures.js — shared animated card face/back texture builders
// Reskinned: shapes now represent consumer waste items
// Exposes: CardTextures.buildFace(card, t), CardTextures.buildBack(), CardTextures.isAnimated(rarity)

const CardTextures = (() => {

  const RARITY_CFG = {
    common:           { border:'#607060', emissive:0x101810, emissiveIntensity:0.05, light:null },
    uncommon:         { border:'#4a8aaa', emissive:0x0a1820, emissiveIntensity:0.2,  light:{ color:0x4a8aaa, intensity:1.2, dist:5 } },
    rare:             { border:'#9a6ab8', emissive:0x120a1a, emissiveIntensity:0.3,  light:{ color:0x9a6ab8, intensity:1.8, dist:5 } },
    legendary:        { border:'#c89030', emissive:0x201000, emissiveIntensity:0.5,  light:{ color:0xc89030, intensity:2.5, dist:6 } },
    mythical:         { border:'#cc2200', emissive:0x200400, emissiveIntensity:0.6,  light:{ color:0xcc2200, intensity:3.0, dist:6 } },
    'luck-maxxing':   { border:'#cc44aa', emissive:0x1a0414, emissiveIntensity:0.65, light:{ color:0xcc44aa, intensity:3.2, dist:7 } },
    'legendary-alpha':{ border:'#ffffff', emissive:0x101010, emissiveIntensity:0.8,  light:{ color:0xffffff, intensity:4.0, dist:8 } },
  };

  const ANIMATED = new Set(['mythical','luck-maxxing','legendary-alpha']);

  function isAnimated(rarity) { return ANIMATED.has(rarity); }
  function getCfg(rarity)     { return RARITY_CFG[rarity] || RARITY_CFG.common; }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  }

  function rainbow(t, offset = 0) {
    const h = ((t * 60 + offset) % 360 + 360) % 360;
    return `hsl(${h},100%,60%)`;
  }

  // ─── Shape drawers — reskinned as waste items ────────────────────────────────

  function drawShape(ctx, rarity, t) {
    ctx.save();
    ctx.translate(128, 148);

    if (rarity === 'common') {
      // Plastic bag — thin irregular trapezoid with a knotted top
      ctx.fillStyle = 'rgba(96,112,96,0.7)';
      ctx.strokeStyle = '#607060';
      ctx.lineWidth = 2;
      // Bag body
      ctx.beginPath();
      ctx.moveTo(-18, -28);
      ctx.lineTo(-24, 28);
      ctx.lineTo(24, 28);
      ctx.lineTo(18, -28);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Knot at top
      ctx.beginPath();
      ctx.arc(0, -30, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#607060'; ctx.fill();
      // Handles
      ctx.beginPath();
      ctx.moveTo(-8, -28); ctx.quadraticCurveTo(-14, -42, -6, -44);
      ctx.moveTo(8, -28);  ctx.quadraticCurveTo(14, -42, 6, -44);
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 2; ctx.stroke();

    } else if (rarity === 'uncommon') {
      // Cardboard box — slightly crushed perspective box
      ctx.fillStyle = 'rgba(74,138,170,0.3)';
      ctx.strokeStyle = '#4a8aaa';
      ctx.lineWidth = 2;
      // Front face
      ctx.beginPath();
      ctx.rect(-28, -12, 56, 40);
      ctx.fill(); ctx.stroke();
      // Top flaps — open
      ctx.beginPath();
      ctx.moveTo(-28, -12); ctx.lineTo(-20, -32); ctx.lineTo(12, -32); ctx.lineTo(4, -12);
      ctx.fillStyle = 'rgba(74,138,170,0.2)'; ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(28, -12); ctx.lineTo(36, -32); ctx.lineTo(12, -32); ctx.lineTo(4, -12);
      ctx.fillStyle = 'rgba(74,138,170,0.15)'; ctx.fill(); ctx.stroke();
      // Side face
      ctx.beginPath();
      ctx.moveTo(28, -12); ctx.lineTo(36, -4); ctx.lineTo(36, 36); ctx.lineTo(28, 28);
      ctx.fillStyle = 'rgba(74,138,170,0.2)'; ctx.fill(); ctx.stroke();
      // Tape line
      ctx.strokeStyle = 'rgba(200,180,100,0.5)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-28, 8); ctx.lineTo(28, 8); ctx.stroke();

    } else if (rarity === 'rare') {
      // Crushed can — cylinder viewed at angle, dented
      ctx.fillStyle = 'rgba(154,106,184,0.5)';
      ctx.strokeStyle = '#9a6ab8';
      ctx.lineWidth = 2;
      // Can body
      ctx.beginPath();
      ctx.ellipse(0, 20, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -20, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-22, -20); ctx.lineTo(-22, 20);
      ctx.moveTo(22, -20);  ctx.lineTo(22, 20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(154,106,184,0.3)';
      ctx.fillRect(-22, -20, 44, 40);
      // Dent
      ctx.strokeStyle = 'rgba(100,60,140,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -10); ctx.quadraticCurveTo(0, 2, 8, -6);
      ctx.stroke();
      // Tab
      ctx.fillStyle = '#9a6ab8';
      ctx.beginPath();
      ctx.ellipse(0, -22, 6, 2, 0, 0, Math.PI * 2);
      ctx.fill();

    } else if (rarity === 'legendary') {
      // Glass bottle — tall elegant silhouette
      ctx.fillStyle = 'rgba(200,144,48,0.25)';
      ctx.strokeStyle = '#c89030';
      ctx.lineWidth = 2;
      // Bottle body
      ctx.beginPath();
      ctx.moveTo(-16, 36);
      ctx.lineTo(-18, 0);
      ctx.quadraticCurveTo(-18, -16, -8, -24);
      ctx.lineTo(-6, -40);
      ctx.lineTo(6, -40);
      ctx.lineTo(8, -24);
      ctx.quadraticCurveTo(18, -16, 18, 0);
      ctx.lineTo(16, 36);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Shine
      ctx.strokeStyle = 'rgba(255,220,100,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 20); ctx.lineTo(-12, -10);
      ctx.stroke();
      // Label area
      ctx.strokeStyle = 'rgba(200,144,48,0.4)'; ctx.lineWidth = 1;
      ctx.strokeRect(-14, 0, 28, 20);

    } else if (rarity === 'mythical') {
      // Bottle cap — low flat disc, rotates
      const rot = t * Math.PI * 0.4;
      ctx.rotate(rot);
      ctx.fillStyle = `rgba(204,34,0,${0.6 + Math.sin(t*3)*0.2})`;
      ctx.strokeStyle = '#cc2200';
      ctx.lineWidth = 2;
      // Outer disc
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Crimped edge — serrated
      for (let i = 0; i < 21; i++) {
        const a = (i / 21) * Math.PI * 2;
        const r = i % 2 === 0 ? 28 : 24;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(255,80,40,${0.4 + Math.sin(t*4)*0.3})`; ctx.lineWidth = 1.5;
      ctx.stroke();
      // Inner circle
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,20,0,${0.5 + Math.sin(t*4+1)*0.3})`; ctx.fill();

    } else if (rarity === 'luck-maxxing') {
      // Three cigarette butts — orbit each other
      const orbitR = 20;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + t * 1.2;
        const cx = Math.cos(angle) * orbitR;
        const cy = Math.sin(angle) * orbitR;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + Math.PI / 4);
        // Butt body
        ctx.fillStyle = `rgba(204,68,170,${0.5 + Math.sin(t*3+i)*0.3})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-4, -12, 8, 20);
        ctx.fill(); ctx.stroke();
        // Filter tip
        ctx.fillStyle = `rgba(255,160,80,0.7)`;
        ctx.fillRect(-4, 8, 8, 6);
        // Ash tip
        ctx.fillStyle = 'rgba(200,200,200,0.6)';
        ctx.beginPath();
        ctx.ellipse(0, -12, 4, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

    } else if (rarity === 'legendary-alpha') {
      // Styrofoam chunk — irregular lumpy mass, rainbow shimmer
      const rot    = t * Math.PI * 0.3;
      const pulse  = 1 + Math.sin(t * 2) * 0.08;
      ctx.rotate(rot);
      ctx.scale(pulse, pulse);
      // Irregular blob shape
      ctx.beginPath();
      const points = [
        [0, -40], [28, -28], [38, 0], [28, 30],
        [8, 42], [-20, 36], [-36, 14], [-32, -18], [-14, -38]
      ];
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        const [x, y] = points[i];
        const [px, py] = points[i-1];
        const cx = (px + x) / 2;
        const cy = (py + y) / 2;
        ctx.quadraticCurveTo(px, py, cx, cy);
      }
      ctx.closePath();
      // Rainbow fill for styrofoam
      const grad = ctx.createLinearGradient(-38,-40,38,42);
      for (let i = 0; i <= 6; i++) {
        grad.addColorStop(i/6, rainbow(t, i*60));
      }
      ctx.fillStyle = grad;
      ctx.fill();
      // White highlight — styrofoam reads as white
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(t*4)*0.2})`;
      ctx.beginPath();
      ctx.ellipse(-8, -12, 14, 8, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // Porous texture dots
      ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.sin(t*3)*0.1})`;
      [[-16,0],[8,12],[-4,-24],[20,-8],[-20,20]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      });
    }

    ctx.restore();
  }

  // ─── Animated border ────────────────────────────────────────────────────────

  function drawBorder(ctx, rarity, t) {
    const cfg = getCfg(rarity);

    if (rarity === 'legendary-alpha') {
      const grad = ctx.createLinearGradient(0,0,256,384);
      for (let i = 0; i <= 8; i++) { grad.addColorStop(i/8, rainbow(t, i*45)); }
      ctx.strokeStyle = grad; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,255,255,0.2)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else if (rarity === 'luck-maxxing') {
      const alpha = 0.7 + Math.sin(t * 3) * 0.3;
      ctx.strokeStyle = `rgba(204,68,170,${alpha})`; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,120,210,0.2)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else if (rarity === 'mythical') {
      const alpha = 0.7 + Math.sin(t * 4) * 0.3;
      ctx.strokeStyle = `rgba(204,34,0,${alpha})`; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(255,80,40,0.25)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    } else {
      ctx.strokeStyle = cfg.border; ctx.lineWidth = 5;
      ctx.strokeRect(5,5,246,374);
      ctx.strokeStyle = `rgba(${hexToRgb(cfg.border)},0.3)`; ctx.lineWidth = 1.5;
      ctx.strokeRect(10,10,236,364);
    }
  }

  // ─── Animated background ────────────────────────────────────────────────────

  function drawBackground(ctx, rarity, t) {
    ctx.fillStyle = '#0f160f';
    ctx.fillRect(0,0,256,384);

    const cfg = getCfg(rarity);

    if (rarity === 'legendary-alpha') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,200);
      grad.addColorStop(0, `hsla(${(t*40)%360},80%,20%,0.4)`);
      grad.addColorStop(0.5, `hsla(${(t*40+120)%360},80%,10%,0.2)`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    } else if (rarity === 'luck-maxxing') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,180);
      grad.addColorStop(0, `rgba(204,68,170,${0.1 + Math.sin(t*2)*0.05})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    } else if (rarity === 'mythical') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,180);
      grad.addColorStop(0, `rgba(204,34,0,${0.08 + Math.sin(t*3)*0.04})`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    } else if (rarity === 'legendary') {
      const grad = ctx.createRadialGradient(128,192,0,128,192,160);
      grad.addColorStop(0,'rgba(200,144,48,0.12)');
      grad.addColorStop(1,'transparent');
      ctx.fillStyle = grad; ctx.fillRect(0,0,256,384);
    }

    const gridColor = rarity === 'legendary-alpha'
      ? `rgba(255,255,255,0.06)`
      : `rgba(${hexToRgb(cfg.border)},0.1)`;
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    for (let x = -384; x < 512; x += 20) {
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+384,384); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+384,0); ctx.lineTo(x,384); ctx.stroke();
    }

    for (let y = 0; y < 384; y += 4) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0,y+2,256,2);
    }
  }

  // ─── Corner brackets ────────────────────────────────────────────────────────

  function drawCorners(ctx, rarity, t) {
    const color = rarity === 'legendary-alpha' ? rainbow(t, 0) : getCfg(rarity).border;
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

    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = rarityColor;
    ctx.fillText(rarity.toUpperCase(), 128, 218);

    ctx.font = 'bold 30px "VT323", monospace';
    ctx.fillStyle = nameColor;
    if (rarity !== 'legendary-alpha') { ctx.shadowColor = nameColor; ctx.shadowBlur = 8; }
    ctx.fillText(card.name.toUpperCase(), 128, 254);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = `rgba(${rarity === 'legendary-alpha' ? '255,255,255' : hexToRgb(cfg.border)},0.3)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28,266); ctx.lineTo(228,266); ctx.stroke();

    ctx.font = '12px "Share Tech Mono", monospace';
    ctx.fillStyle = 'rgba(232,224,200,0.5)';
    const words = card.desc.split(' ');
    let line = '', lineY = 290;
    words.forEach(w => {
      const test = line ? line+' '+w : w;
      if (ctx.measureText(test).width > 210 && line) {
        ctx.fillText(line,128,lineY); line=w; lineY+=18;
      } else { line=test; }
    });
    if (line) ctx.fillText(line,128,lineY);
  }

  // ─── Public: buildFace ─────────────────────────────────────────────────────

  function buildFace(card, canvas, t = 0) {
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