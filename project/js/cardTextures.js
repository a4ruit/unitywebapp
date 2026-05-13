// cardTextures.js â€” shared animated card face/back texture builders
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

  // â”€â”€â”€ Phase helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function cardIsNaturePhase() {
    if (typeof window === 'undefined') return false;
    if (window.activePackType !== 'garbage') return false;
    return parseInt(document.body?.dataset?.corruption || '0') < (window.HORROR_THRESHOLD ?? 15);
  }

  // â”€â”€â”€ Shape drawers â€” reskinned as waste items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function drawShape(ctx, rarity, t) {
    const packType = typeof window !== 'undefined' ? window.activePackType : 'garbage';
    const isHorror = parseInt(document.body?.dataset?.corruption || '0') >= (window.HORROR_THRESHOLD ?? 15);
    if (packType === 'ewaste' && !isHorror) { drawShapeCritter(ctx, rarity, t); return; }
    if (packType === 'ewaste')              { drawShapeScourge(ctx, rarity, t); return; }
    if (packType === 'adpack' && !isHorror) { drawShapeFungi(ctx, rarity, t);  return; }
    if (packType === 'adpack')              { drawShapeRitual(ctx, rarity, t);  return; }
    if (!isHorror)                          { drawShapeNature(ctx, rarity, t);  return; }

    ctx.save();
    ctx.translate(128, 148);
    ctx.lineCap = 'round';

    if (rarity === 'common') {
      // Unidentified Tissue — irregular flesh blob, surface striations
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      const blobPts = [[0,-28],[18,-20],[26,-4],[22,16],[8,28],[-12,26],[-24,12],[-22,-8],[-10,-24]];
      ctx.fillStyle = 'rgba(130,80,72,0.55)';
      ctx.beginPath();
      ctx.moveTo((blobPts[0][0]+blobPts[blobPts.length-1][0])/2, (blobPts[0][1]+blobPts[blobPts.length-1][1])/2);
      for (let i = 0; i < blobPts.length; i++) {
        const c = blobPts[i], n = blobPts[(i+1)%blobPts.length];
        ctx.quadraticCurveTo(c[0],c[1],(c[0]+n[0])/2,(c[1]+n[1])/2);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Surface striations — muscle fibre lines
      ctx.strokeStyle = 'rgba(96,52,48,0.45)'; ctx.lineWidth = 0.8;
      [[-8,-18,6,-8],[-14,0,-2,8],[4,-12,16,2],[-6,12,8,20],[-18,4,-8,16]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+4,(y1+y2)/2,x2,y2); ctx.stroke();
      });
      // Glistening highlight
      ctx.fillStyle = 'rgba(200,140,130,0.22)';
      ctx.beginPath(); ctx.ellipse(-6,-10,10,6,-0.4,0,Math.PI*2); ctx.fill();

    } else if (rarity === 'uncommon') {
      // Pale Growth — pallid tumour with surface nodules and feeding veins
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1.5;
      // Main mass
      ctx.fillStyle = 'rgba(175,175,165,0.52)';
      ctx.beginPath(); ctx.ellipse(0,4,24,20,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Surface nodules — lumpy bumps
      [[14,-10,6],[18,10,5],[-16,8,7],[-10,-14,5],[4,18,5],[-4,-4,4]].forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fillStyle = 'rgba(188,185,174,0.62)'; ctx.fill();
        ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 0.8; ctx.stroke();
      });
      // Feeding veins branching across surface
      ctx.strokeStyle = 'rgba(74,100,130,0.4)'; ctx.lineWidth = 0.8;
      [[0,4,-18,8],[0,4,16,-10],[0,4,-10,-14],[0,4,4,18],[-18,8,-24,0],[16,-10,22,-18]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+3,(y1+y2)/2,x2,y2); ctx.stroke();
      });
      // Pale sheen
      ctx.fillStyle = 'rgba(220,218,210,0.2)';
      ctx.beginPath(); ctx.ellipse(-6,-4,12,8,-0.4,0,Math.PI*2); ctx.fill();

    } else if (rarity === 'rare') {
      // Wet Membrane — translucent stretched skin, drooping and dripping
      ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
      // Membrane body — thin stretched oval
      ctx.fillStyle = 'rgba(154,106,184,0.22)';
      ctx.beginPath();
      ctx.moveTo(-28,-18);
      ctx.bezierCurveTo(-32,-8,-30,10,-26,22);
      ctx.bezierCurveTo(-18,30,18,30,26,22);
      ctx.bezierCurveTo(30,10,32,-8,28,-18);
      ctx.bezierCurveTo(18,-28,-18,-28,-28,-18);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Internal vein network — visible through membrane
      ctx.strokeStyle = 'rgba(130,80,160,0.38)'; ctx.lineWidth = 0.8;
      [[0,-10,0,20],[0,-10,-16,12],[0,-10,16,12],[-16,12,-22,24],[16,12,22,24],[0,20,0,28]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+4,(y1+y2)/2,x2,y2); ctx.stroke();
      });
      // Drips hanging from lower edge
      ctx.strokeStyle = 'rgba(154,106,184,0.5)'; ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(154,106,184,0.45)';
      [[-16,28,-17,42],[-2,30,-2,44],[14,28,15,40]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x2,y2,2.5,0,Math.PI*2); ctx.fill();
      });
      // Surface sheen — wet gloss
      ctx.fillStyle = 'rgba(200,170,230,0.18)';
      ctx.beginPath(); ctx.ellipse(-6,-12,14,8,-0.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(200,170,230,0.12)';
      ctx.beginPath(); ctx.ellipse(10,4,8,5,0.3,0,Math.PI*2); ctx.fill();

    } else if (rarity === 'legendary') {
      // Bone Fragment — cracked, dense, jagged cross-section
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5;
      // Main shaft — slightly angled
      ctx.save(); ctx.rotate(-0.2);
      ctx.fillStyle = 'rgba(210,195,158,0.52)';
      ctx.beginPath();
      ctx.moveTo(-8,-38); ctx.bezierCurveTo(-12,-30,-12,-10,-10,10);
      ctx.bezierCurveTo(-8,28,-6,36,-4,40);
      ctx.lineTo(4,40); ctx.bezierCurveTo(6,36,8,28,10,10);
      ctx.bezierCurveTo(12,-10,12,-30,8,-38);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Epiphysis knob at top
      ctx.fillStyle = 'rgba(200,182,142,0.58)';
      ctx.beginPath(); ctx.ellipse(0,-38,14,8,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Epiphysis knob at bottom
      ctx.beginPath(); ctx.ellipse(0,40,12,7,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Compact bone ring lines on cross-section
      ctx.strokeStyle = 'rgba(200,144,48,0.3)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(0,0,6,5,0,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0,0,4,3,0,0,Math.PI*2); ctx.stroke();
      // Main fracture crack
      ctx.strokeStyle = 'rgba(140,100,30,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-2,-30); ctx.lineTo(3,-14); ctx.lineTo(-1,4); ctx.lineTo(2,18); ctx.stroke();
      // Secondary cracks
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(3,-14); ctx.lineTo(8,-8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-1,4); ctx.lineTo(-7,10); ctx.stroke();
      // Periosteum surface lines — bone texture
      ctx.strokeStyle = 'rgba(200,144,48,0.18)'; ctx.lineWidth = 0.6;
      [[-6,-20,-6,-4],[-4,-28,-4,-10],[4,-24,4,-6],[6,-16,6,2]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      ctx.restore();

    } else if (rarity === 'mythical') {
      // Unnamed Organ — pulsing unrecognizable biological mass, animated
      const pulse = 1 + Math.sin(t*2.5)*0.07;
      ctx.scale(pulse,pulse);
      // Outer membrane — irregular living blob
      const mPts = [[0,-30],[16,-24],[28,-8],[26,14],[12,28],[-8,28],[-24,14],[-28,-8],[-16,-24]];
      ctx.fillStyle = `rgba(168,42,38,${0.38+Math.sin(t*2)*0.06})`;
      ctx.strokeStyle = `rgba(204,34,0,${0.62+Math.sin(t*3)*0.22})`; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo((mPts[0][0]+mPts[mPts.length-1][0])/2,(mPts[0][1]+mPts[mPts.length-1][1])/2);
      for (let i = 0; i < mPts.length; i++) {
        const c = mPts[i], n = mPts[(i+1)%mPts.length];
        ctx.quadraticCurveTo(c[0],c[1],(c[0]+n[0])/2,(c[1]+n[1])/2);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Interior chambers — darker lobes
      [[-8,-6,9],[ 8,-4,8],[0,12,7]].forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
        ctx.fillStyle = `rgba(120,20,18,${0.45+Math.sin(t*3)*0.12})`; ctx.fill();
        ctx.strokeStyle = `rgba(204,34,0,0.3)`; ctx.lineWidth = 0.8; ctx.stroke();
      });
      // Pulsing surface vessels
      ctx.strokeStyle = `rgba(220,60,40,${0.35+Math.sin(t*4)*0.2})`; ctx.lineWidth = 1;
      [[0,-28,0,-10],[22,-6,10,-4],[24,12,12,10],[-26,10,-12,12],[-20,-16,-10,-8]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+4,(y1+y2)/2,x2,y2); ctx.stroke();
      });
      // Central nucleus — dark pulsing core
      ctx.beginPath(); ctx.ellipse(0,0,6,5,0.2,0,Math.PI*2);
      ctx.fillStyle = `rgba(60,0,0,${0.7+Math.sin(t*5)*0.2})`; ctx.fill();
      ctx.strokeStyle = `rgba(204,34,0,0.5)`; ctx.lineWidth = 1; ctx.stroke();

    } else if (rarity === 'luck-maxxing') {
      // Spore Cluster — three fleshy biological masses orbiting, trailing fluid
      const orbitR = 19;
      for (let i = 0; i < 3; i++) {
        const angle = (i/3)*Math.PI*2 + t*1.1;
        const cx = Math.cos(angle)*orbitR, cy = Math.sin(angle)*orbitR;
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle + Math.PI*0.5);
        // Fleshy cluster body
        ctx.fillStyle = `rgba(204,68,170,${0.48+Math.sin(t*3+i)*0.24})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0,0,5,8,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
        // Satellite nodules
        [[-4,0,2.5],[4,-2,2],[0,6,2.5]].forEach(([nx,ny,nr]) => {
          ctx.beginPath(); ctx.arc(nx,ny,nr,0,Math.PI*2);
          ctx.fillStyle = `rgba(180,38,148,${0.5+Math.sin(t*4+i)*0.2})`; ctx.fill();
        });
        // Trailing thread
        ctx.strokeStyle = `rgba(220,80,180,${0.4+Math.sin(t*2+i)*0.2})`; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(0,8); ctx.bezierCurveTo(3,13,4,12,6,18); ctx.stroke();
        ctx.restore();
      }
      // Connecting tissue threads between clusters
      for (let i = 0; i < 3; i++) {
        const a1 = (i/3)*Math.PI*2 + t*1.1, a2 = ((i+1)/3)*Math.PI*2 + t*1.1;
        ctx.strokeStyle = `rgba(204,68,170,${0.14+Math.sin(t*2+i)*0.08})`; ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1)*orbitR, Math.sin(a1)*orbitR);
        ctx.lineTo(Math.cos(a2)*orbitR, Math.sin(a2)*orbitR); ctx.stroke();
      }

    } else if (rarity === 'legendary-alpha') {
      // The Flesh — spreading biological mass, rainbow shimmer
      const pulse = 1 + Math.sin(t*2)*0.06;
      ctx.scale(pulse,pulse);
      const grad = ctx.createRadialGradient(0,0,0,0,0,44);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i/6, rainbow(t,i*60));
      // Primary tendrils radiating out — fleshy protrusions
      ctx.lineCap = 'round';
      for (let b = 0; b < 8; b++) {
        const ba = (b/8)*Math.PI*2 + t*0.1;
        const len = 30 + Math.sin(t*2.5+b)*8;
        const cpx = Math.cos(ba+0.4)*20, cpy = Math.sin(ba+0.4)*20;
        ctx.strokeStyle = grad; ctx.lineWidth = 2.5 + Math.sin(t*2+b)*0.8;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(cpx,cpy,Math.cos(ba)*len,Math.sin(ba)*len); ctx.stroke();
        // Terminal nodule
        ctx.beginPath(); ctx.arc(Math.cos(ba)*len, Math.sin(ba)*len, 3.5+Math.sin(t*3+b),0,Math.PI*2);
        const h = ((t*60+b*45)%360+360)%360;
        ctx.fillStyle = `hsla(${h},80%,52%,0.88)`; ctx.fill();
        // Branch growth at midpoint
        if (b%2===0) {
          const mx = Math.cos(ba)*16, my = Math.sin(ba)*16;
          [[0.75,24],[-0.75,24]].forEach(([da,dist]) => {
            ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(mx,my);
            ctx.lineTo(Math.cos(ba+da)*dist, Math.sin(ba+da)*dist); ctx.stroke();
            ctx.beginPath(); ctx.arc(Math.cos(ba+da)*dist, Math.sin(ba+da)*dist, 2,0,Math.PI*2);
            ctx.fillStyle = `hsla(${(h+40)%360},78%,55%,0.75)`; ctx.fill();
          });
        }
      }
      // Central pulsing mass
      ctx.beginPath(); ctx.arc(0,0,11+Math.sin(t*2)*2,0,Math.PI*2);
      const cg = ctx.createRadialGradient(0,0,0,0,0,13);
      for (let i = 0; i <= 4; i++) cg.addColorStop(i/4, rainbow(t,i*90));
      ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
      // Orbiting droplets
      for (let i = 0; i < 10; i++) {
        const sa = (i/10)*Math.PI*2 + t*0.4;
        const sr = 22 + Math.sin(t*2+i)*5;
        const h = ((t*60+i*36)%360+360)%360;
        ctx.beginPath(); ctx.arc(Math.cos(sa)*sr, Math.sin(sa)*sr,1.8,0,Math.PI*2);
        ctx.fillStyle = `hsla(${h},80%,58%,${0.38+Math.sin(t*3+i)*0.25})`; ctx.fill();
      }
      // Glowing core
      ctx.beginPath(); ctx.arc(0,0,4.5+Math.sin(t*5)*1.2,0,Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${0.52+Math.sin(t*4)*0.3})`; ctx.fill();
    }

    ctx.restore();
  }

  // â”€â”€â”€ NATURE shape drawers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function drawShapeNature(ctx, rarity, t) {
    ctx.save();
    ctx.translate(128, 148);

    if (rarity === 'common') {
      // Fallen Leaf â€” oval with midrib and side veins
      ctx.fillStyle = 'rgba(80,108,72,0.65)';
      ctx.strokeStyle = '#607060';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.bezierCurveTo(24, -22, 24, 22, 0, 34);
      ctx.bezierCurveTo(-24, 22, -24, -22, 0, -34);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Midrib
      ctx.strokeStyle = 'rgba(96,120,80,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(0, 32); ctx.stroke();
      // Side veins
      ctx.strokeStyle = 'rgba(96,120,80,0.5)'; ctx.lineWidth = 0.8;
      [[-8, -18], [-8, -4], [-8, 10], [-8, 22]].forEach(([x, y]) => {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(x*0.5, y-4, x+12, y+2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(-x*0.5, y-4, -x-12, y+2); ctx.stroke();
      });
      // Stem
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 34); ctx.quadraticCurveTo(3, 42, 2, 48); ctx.stroke();

    } else if (rarity === 'uncommon') {
      // Wildflowers — cluster of meadow flowers at different heights
      ctx.lineCap = 'round';
      const flowers = [
        { x: -16, y:  6, r: 10, petals: 5, stemY: 38 },
        { x:   4, y: -6, r: 12, petals: 6, stemY: 36 },
        { x:  20, y:  8, r:  9, petals: 5, stemY: 38 },
        { x:  -4, y: 16, r:  7, petals: 4, stemY: 42 },
      ];
      // Stems first (behind flowers)
      ctx.strokeStyle = 'rgba(60,110,80,0.6)'; ctx.lineWidth = 1.5;
      flowers.forEach(f => {
        ctx.beginPath(); ctx.moveTo(f.x, f.y + f.r * 0.4);
        ctx.quadraticCurveTo(f.x + 3, (f.y + f.stemY) / 2, f.x, f.stemY); ctx.stroke();
        // Tiny leaf
        ctx.fillStyle = 'rgba(60,110,80,0.4)';
        ctx.beginPath();
        ctx.moveTo(f.x, f.y + f.r * 1.4);
        ctx.bezierCurveTo(f.x + 6, f.y + f.r * 1.2, f.x + 8, f.y + f.r * 1.8, f.x + 5, f.y + f.r * 2.2);
        ctx.bezierCurveTo(f.x, f.y + f.r * 1.8, f.x, f.y + f.r * 1.4, f.x, f.y + f.r * 1.4);
        ctx.fill();
      });
      // Petals
      flowers.forEach(f => {
        for (let i = 0; i < f.petals; i++) {
          const a = (i / f.petals) * Math.PI * 2;
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(a);
          ctx.fillStyle = 'rgba(74,138,170,0.35)';
          ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(0, -(f.r * 0.68), f.r * 0.28, f.r * 0.5, 0, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        // Centre dot
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,230,255,0.9)'; ctx.fill();
        ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1;
        ctx.stroke();
      });

    } else if (rarity === 'rare') {
      // Last Bloom â€” 8 petals around a glowing centre
      const petalCount = 8;
      for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        ctx.save(); ctx.rotate(angle);
        ctx.fillStyle = `rgba(154,106,184,${0.3 + (i % 2) * 0.18})`;
        ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-7, 2);
        ctx.bezierCurveTo(-10, -10, -6, -28, 0, -34);
        ctx.bezierCurveTo(6, -28, 10, -10, 7, 2);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // Stamen ring
      ctx.strokeStyle = 'rgba(220,180,255,0.5)'; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*8, Math.sin(a)*8);
        ctx.lineTo(Math.cos(a)*13, Math.sin(a)*13);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(Math.cos(a)*14, Math.sin(a)*14, 1.5, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(240,210,255,0.9)'; ctx.fill();
      }
      // Centre
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(210,170,255,0.8)'; ctx.fill();
      ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 2; ctx.stroke();

    } else if (rarity === 'legendary') {
      // Ancient Yew — gnarled trunk, spreading canopy, red berries
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      // Gnarled trunk — wide at base, twisted
      ctx.fillStyle = 'rgba(44,20,6,0.85)';
      ctx.beginPath();
      ctx.moveTo(-16, 42);
      ctx.bezierCurveTo(-18, 26, -12, 10, -6, -2);
      ctx.bezierCurveTo(-3, -6, 3, -6, 6, -2);
      ctx.bezierCurveTo(12, 10, 18, 26, 16, 42);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Bark texture lines
      ctx.strokeStyle = 'rgba(200,144,48,0.2)'; ctx.lineWidth = 0.8;
      [[-8,30,-10,10],[-2,34,-4,6],[6,32,8,12]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+4,(y1+y2)/2,x2,y2); ctx.stroke();
      });
      // Spreading branches — low and wide like yew
      const branches = [
        [-6,-2,-34,-18,2.0], [-34,-18,-42,-30,1.5], [-34,-18,-22,-28,1.2],
        [6,-2,34,-18,2.0],   [34,-18,42,-30,1.5],   [34,-18,22,-28,1.2],
        [0,-4,0,-28,1.8],    [0,-28,-10,-38,1.2],   [0,-28,10,-38,1.2],
      ];
      ctx.lineCap = 'round';
      branches.forEach(([x1,y1,x2,y2,lw]) => {
        ctx.strokeStyle = 'rgba(200,144,48,0.55)'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      // Dense dark foliage — yew has very dense, dark needle-clusters
      const foliage = [
        [-34,-22,12],[-22,-32,10],[0,-34,14],[22,-32,10],[34,-22,12],
        [-14,-30,11],[14,-30,11],[0,-44,8],
      ];
      foliage.forEach(([cx,cy,r], i) => {
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
        ctx.fillStyle = `rgba(${14+i*5},${44+i*8},${4+i*3},0.88)`; ctx.fill();
        ctx.strokeStyle = 'rgba(200,144,48,0.22)'; ctx.lineWidth = 0.7; ctx.stroke();
      });
      // Red berries — yew's distinctive poisonous aril
      ctx.fillStyle = 'rgba(210,30,18,0.88)';
      [[-28,-24],[22,-30],[-10,-36],[8,-42],[-36,-18],[36,-18],[2,-46],[-20,-28],[18,-26]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.arc(x,y,2.5,0,Math.PI*2); ctx.fill();
      });

    } else if (rarity === 'mythical') {
      // The Old Grove — three ancient trunks, interlocked canopy, animated
      const sway  = Math.sin(t * 0.9) * 0.04;
      const pulse = 0.5 + Math.sin(t * 2.2) * 0.18;
      ctx.rotate(sway);

      // Three trunks — left, centre, right at slightly different heights
      const trunks = [[-16, 0.82], [0, 1.0], [15, 0.78]];
      trunks.forEach(([tx, sc], idx) => {
        ctx.save(); ctx.translate(tx, 0); ctx.scale(sc, sc);
        // Surface roots
        ctx.strokeStyle = `rgba(204,34,0,0.32)`; ctx.lineWidth = 1; ctx.lineCap = 'round';
        [[0,36,-8,48],[0,36,8,48],[0,36,0,52]].forEach(([x1,y1,x2,y2]) => {
          ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+2,y1+5,x2,y2); ctx.stroke();
        });
        // Trunk
        ctx.fillStyle = 'rgba(44,18,4,0.85)';
        ctx.strokeStyle = `rgba(204,34,0,${pulse * 0.5})`; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-8, 38); ctx.bezierCurveTo(-7,18,-5,4,-3,-8);
        ctx.lineTo(3,-8); ctx.bezierCurveTo(5,4,7,18,8,38);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      });

      // Shared interlocking canopy
      const canopy = [
        [-20,-8,15],  [0,-14,18],  [18,-6,14],
        [-10,-24,13], [8,-22,14],  [0,-34,12],
        [-22,-20,10], [20,-18,10],
      ];
      canopy.forEach(([cx,cy,r], i) => {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${12+i*7},${50+i*9},${4+i*4},${pulse - i*0.025})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(204,34,0,${0.16+Math.sin(t*2.2+i)*0.1})`; ctx.lineWidth = 0.7;
        ctx.stroke();
      });
      // Firefly motes drifting between trees
      for (let i = 0; i < 5; i++) {
        const a = (i/5)*Math.PI*2 + t*0.5;
        const mx = Math.cos(a)*18, my = Math.sin(a*1.3)*12 - 20;
        ctx.beginPath(); ctx.arc(mx, my, 1.2+Math.sin(t*3+i)*0.6, 0, Math.PI*2);
        ctx.fillStyle = `rgba(180,220,100,${0.3+Math.sin(t*4+i)*0.25})`; ctx.fill();
      }

    } else if (rarity === 'luck-maxxing') {
      // Dispersal Event â€” three dandelion seed puffs orbiting
      const orbitR = 19;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + t * 1.0;
        const cx = Math.cos(angle) * orbitR;
        const cy = Math.sin(angle) * orbitR;
        ctx.save(); ctx.translate(cx, cy);
        // Seed body
        ctx.fillStyle = `rgba(204,68,170,${0.65 + Math.sin(t*3+i)*0.2})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.ellipse(0, 0, 2.5, 5, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        // Feathery filaments
        const filCount = 10;
        for (let j = 0; j < filCount; j++) {
          const fa = (j / filCount) * Math.PI * 2;
          ctx.strokeStyle = `rgba(255,150,215,${0.55 + Math.sin(t*2+j)*0.25})`; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(fa)*11, Math.sin(fa)*11); ctx.stroke();
          ctx.beginPath(); ctx.arc(Math.cos(fa)*11, Math.sin(fa)*11, 1.5, 0, Math.PI*2);
          ctx.fillStyle = `rgba(255,160,220,0.85)`; ctx.fill();
        }
        ctx.restore();
      }
      // Outer drifting sparkles
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2 + t*0.4;
        const r = 28 + Math.sin(t*2+i)*3;
        ctx.beginPath(); ctx.arc(Math.cos(a)*r, Math.sin(a)*r, 1, 0, Math.PI*2);
        ctx.fillStyle = `rgba(204,68,170,${0.25 + Math.sin(t*3+i)*0.2})`; ctx.fill();
      }

    } else if (rarity === 'legendary-alpha') {
      // Treant — upright tree-creature, humanoid silhouette, rainbow shimmer
      const pulse = 1 + Math.sin(t * 2) * 0.05;
      const sway  = Math.sin(t * 0.8) * 0.04;
      ctx.scale(pulse, pulse);
      ctx.rotate(sway);

      const grad = ctx.createLinearGradient(-38, 52, 38, -52);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i/6, rainbow(t, i*60));

      ctx.lineCap = 'round';

      // Root feet — two splayed root-clusters at base
      const roots = [
        [-10,36,-24,50],[-10,36,-14,52],[-10,36,-4,50],
        [ 10,36,  4,50],[ 10,36, 14,52],[ 10,36, 24,50],
      ];
      roots.forEach(([x1,y1,x2,y2]) => {
        ctx.strokeStyle = grad; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x1,y1);
        ctx.quadraticCurveTo((x1+x2)/2 + (Math.random()-0.5)*4, (y1+y2)/2+4, x2,y2);
        ctx.stroke();
      });

      // Legs — two thick root-columns
      ctx.strokeStyle = grad; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-10,36); ctx.lineTo(-8,14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo( 10,36); ctx.lineTo( 8,14); ctx.stroke();

      // Torso — broad bark-covered trunk body
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-14,16);
      ctx.bezierCurveTo(-16,4,-14,-8,-10,-16);
      ctx.lineTo(-6,-22); ctx.lineTo(6,-22); ctx.lineTo(10,-16);
      ctx.bezierCurveTo(14,-8,16,4,14,16);
      ctx.closePath(); ctx.fill();
      // Bark texture lines on torso
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
      [[-8,0,-6,-14],[ 2,4, 4,-12],[-4,8,-2,-10]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+3,(y1+y2)/2,x2,y2); ctx.stroke();
      });

      // Arms — large gnarled branches spreading wide
      // Left arm
      ctx.strokeStyle = grad; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-12,-4); ctx.bezierCurveTo(-22,-8,-32,-6,-38,-12); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-38,-12); ctx.bezierCurveTo(-42,-16,-44,-22,-40,-26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-38,-12); ctx.lineTo(-42,-8); ctx.stroke();
      // Right arm
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(12,-4); ctx.bezierCurveTo(22,-8,32,-6,38,-12); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(38,-12); ctx.bezierCurveTo(42,-16,44,-22,40,-26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(38,-12); ctx.lineTo(42,-8); ctx.stroke();
      // Finger-branches at arm tips
      [[- 40,-26,-46,-32],[-40,-26,-36,-34],[40,-26,46,-32],[40,-26,36,-34]].forEach(([x1,y1,x2,y2]) => {
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });

      // Head — knobby rounded crown
      const headBlobs = [[0,-30,12],[-8,-38,8],[8,-38,8],[0,-44,9]];
      headBlobs.forEach(([cx,cy,r],i) => {
        const h = ((t*60+i*72)%360+360)%360;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
        ctx.fillStyle = `hsla(${h},72%,38%,${0.42+Math.sin(t*2+i)*0.12})`; ctx.fill();
        ctx.strokeStyle = grad; ctx.lineWidth = 0.8; ctx.stroke();
      });

      // Eyes — two glowing amber eyes in the bark face
      const eyeGlow = 0.7 + Math.sin(t*3)*0.25;
      ctx.fillStyle = `rgba(255,220,80,${eyeGlow})`;
      ctx.beginPath(); ctx.ellipse(-4,-30,3,2.5,0.1,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( 4,-30,3,2.5,-0.1,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(255,255,180,${eyeGlow*0.6})`;
      ctx.beginPath(); ctx.arc(-4,-31,1.2,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc( 4,-31,1.2,0,Math.PI*2); ctx.fill();

      // Canopy foliage clusters sprouting from head/shoulders
      [[0,-50,8],[-10,-46,7],[10,-46,7],[-4,-56,6],[4,-56,6]].forEach(([cx,cy,r],i) => {
        const h = ((t*60+i*55)%360+360)%360;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
        ctx.fillStyle = `hsla(${h},70%,35%,${0.38+Math.sin(t*2.5+i)*0.14})`; ctx.fill();
        ctx.strokeStyle = grad; ctx.lineWidth = 0.7; ctx.stroke();
      });

      // Heartwood pulse — glowing chest core
      ctx.beginPath(); ctx.arc(0,-2, 4+Math.sin(t*4)*1.5, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${0.5+Math.sin(t*5)*0.35})`; ctx.fill();
    }

    ctx.restore();
  }

  // â”€â”€â”€ SCOURGE shape drawers (biological) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function drawShapeScourge(ctx, rarity, t) {
    ctx.save();
    ctx.translate(128, 148);

    if (rarity === 'common') {
      // Ticks â€” engorged arachnid, 8 bent legs, scutum plate
      ctx.save(); ctx.rotate(-0.1);
      // Engorged abdomen
      ctx.fillStyle = 'rgba(72,92,58,0.7)';
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(2, 6, 18, 22, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Scutum plate (hard shield on back, smaller front portion)
      ctx.fillStyle = 'rgba(52,70,40,0.75)';
      ctx.beginPath(); ctx.ellipse(2, -8, 10, 10, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.strokeStyle = '#607060'; ctx.lineWidth = 1; ctx.stroke();
      // Capitulum (head/mouthparts) â€” small forward projection
      ctx.fillStyle = 'rgba(44,60,34,0.85)';
      ctx.beginPath(); ctx.ellipse(2, -20, 5, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(2, -26); ctx.lineTo(2, -30); ctx.stroke(); // hypostome
      // 8 legs â€” 4 each side, bent at knee
      const legPairs = [[-14,-6],[-14,1],[-14,9],[-14,17]];
      legPairs.forEach(([lx, ly], i) => {
        // Left leg
        ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-9, ly); ctx.lineTo(lx, ly - 4); ctx.lineTo(lx - 8, ly + 4); ctx.stroke();
        // Right leg (mirror)
        ctx.beginPath(); ctx.moveTo(13, ly); ctx.lineTo(-lx + 4, ly - 4); ctx.lineTo(-lx + 12, ly + 4); ctx.stroke();
      });
      // Abdomen surface texture â€” faint groove lines
      ctx.strokeStyle = 'rgba(96,112,78,0.35)'; ctx.lineWidth = 0.7;
      for (let g = -1; g <= 1; g++) {
        ctx.beginPath(); ctx.ellipse(2, 6 + g * 7, 14, 4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();

    } else if (rarity === 'uncommon') {
      // Infested Mice â€” hunched dead mouse, flea dots scattered around
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      // Body â€” rounded hunched back
      ctx.fillStyle = 'rgba(74,138,170,0.38)';
      ctx.beginPath();
      ctx.moveTo(-24, 10);
      ctx.bezierCurveTo(-28, -2, -22, -18, -6, -20);
      ctx.bezierCurveTo(4, -22, 16, -16, 20, -6);
      ctx.bezierCurveTo(24, 2, 22, 10, 18, 12);
      ctx.bezierCurveTo(10, 14, -14, 14, -24, 10);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Head â€” small round snout
      ctx.fillStyle = 'rgba(74,138,170,0.5)';
      ctx.beginPath(); ctx.ellipse(26, 2, 9, 8, 0.3, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Snout tip
      ctx.fillStyle = 'rgba(40,80,110,0.7)';
      ctx.beginPath(); ctx.arc(34, 4, 3, 0, Math.PI * 2); ctx.fill();
      // Ear
      ctx.fillStyle = 'rgba(74,138,170,0.45)';
      ctx.beginPath(); ctx.ellipse(18, -12, 5, 7, -0.3, 0, Math.PI * 2);
      ctx.fill(); ctx.strokeStyle = '#4a8aaa'; ctx.stroke();
      // Eye â€” dark dot
      ctx.fillStyle = 'rgba(8,24,44,0.9)';
      ctx.beginPath(); ctx.arc(28, -1, 2, 0, Math.PI * 2); ctx.fill();
      // Tail â€” thin curling line
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-24, 10);
      ctx.bezierCurveTo(-34, 14, -38, 22, -32, 28);
      ctx.bezierCurveTo(-26, 34, -18, 30, -20, 24);
      ctx.stroke();
      // Tiny legs underneath
      ctx.lineWidth = 0.9;
      [[-8,13],[ 2,14],[12,13],[20,10]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x + 4, y + 8); ctx.stroke();
      });
      // Fleas â€” small oval dots scattered on body and nearby
      ctx.fillStyle = 'rgba(18,60,90,0.85)';
      [[-10,-8],[4,-12],[12,-4],[-4,6],[-16,2],[22,-8],[8,8],[-18,18],[30,10],[-6,18]].forEach(([fx,fy]) => {
        ctx.beginPath(); ctx.ellipse(fx, fy, 2.5, 1.5, Math.random(), 0, Math.PI * 2); ctx.fill();
      });

    } else if (rarity === 'rare') {
      // Necrotic Mass â€” irregular tumour with surface veins
      ctx.fillStyle = 'rgba(118,72,150,0.42)';
      ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
      // Lumpy blob outline
      const blobPts = [
        [0,-36],[20,-28],[34,-6],[30,16],[14,34],
        [-10,32],[-28,18],[-32,-4],[-20,-28]
      ];
      ctx.beginPath();
      ctx.moveTo((blobPts[0][0]+blobPts[blobPts.length-1][0])/2,
                 (blobPts[0][1]+blobPts[blobPts.length-1][1])/2);
      for (let i = 0; i < blobPts.length; i++) {
        const cur  = blobPts[i];
        const next = blobPts[(i+1) % blobPts.length];
        ctx.quadraticCurveTo(cur[0], cur[1], (cur[0]+next[0])/2, (cur[1]+next[1])/2);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Satellite bumps
      [[22,-18,5],[18,24,4],[-20,20,5],[-18,-20,4]].forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(118,72,150,0.55)'; ctx.fill();
        ctx.strokeStyle = '#9a6ab8'; ctx.stroke();
      });
      // Surface veins
      ctx.strokeStyle = 'rgba(154,106,184,0.5)'; ctx.lineWidth = 0.8;
      [[0,-34,0,-12],[28,14,10,4],[-26,12,-10,2],[-10,30,-4,12],[24,-20,8,-6]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath();
        ctx.moveTo(x1,y1);
        ctx.quadraticCurveTo((x1+x2)/2+6,(y1+y2)/2, x2, y2);
        ctx.stroke();
      });
      // Dark necrotic core
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 8, 0.3, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(44,14,64,0.65)'; ctx.fill();

    } else if (rarity === 'legendary') {
      // The Black Plague â€” plague doctor mask: beaked mask, round eye lenses, wide-brimmed hat
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      // Wide-brimmed hat â€” brim
      ctx.fillStyle = 'rgba(200,144,48,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, -34, 30, 6, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Hat crown â€” tall cylinder
      ctx.fillStyle = 'rgba(200,144,48,0.22)';
      ctx.beginPath();
      ctx.moveTo(-14, -34);
      ctx.lineTo(-12, -62);
      ctx.bezierCurveTo(-8, -68, 8, -68, 12, -62);
      ctx.lineTo(14, -34);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Hat band
      ctx.strokeStyle = 'rgba(200,144,48,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-13, -50); ctx.lineTo(13, -50); ctx.stroke();
      // Mask face â€” oval
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(200,144,48,0.32)';
      ctx.beginPath(); ctx.ellipse(0, -10, 18, 24, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Beak â€” long downward cone
      ctx.fillStyle = 'rgba(200,144,48,0.35)';
      ctx.beginPath();
      ctx.moveTo(-8, 6);
      ctx.bezierCurveTo(-10, 18, -4, 34, 0, 38);
      ctx.bezierCurveTo(4, 34, 10, 18, 8, 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Beak nostril holes
      ctx.fillStyle = 'rgba(140,90,10,0.6)';
      ctx.beginPath(); ctx.ellipse(-3, 22, 2, 3, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, 22, 2, 3, 0.3, 0, Math.PI * 2); ctx.fill();
      // Eye lenses â€” circular glass
      ctx.fillStyle = 'rgba(24,14,4,0.75)';
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(-8, -14, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(8, -14, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Lens glint
      ctx.fillStyle = 'rgba(220,170,60,0.35)';
      ctx.beginPath(); ctx.arc(-10, -16, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6, -16, 2, 0, Math.PI * 2); ctx.fill();
      // Strap line across mask
      ctx.strokeStyle = 'rgba(200,144,48,0.4)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-18, -10); ctx.lineTo(18, -10); ctx.stroke();

    } else if (rarity === 'mythical') {
      // Host Event â€” pulsing host cell with internal parasites
      const pulse = 1 + Math.sin(t * 2.5) * 0.06;
      ctx.scale(pulse, pulse);
      // Outer membrane â€” irregular blob
      const memPts = [
        [0,-34],[18,-28],[30,-10],[28,14],
        [14,30],[-8,32],[-24,20],[-30,-4],[-20,-26]
      ];
      ctx.fillStyle = `rgba(170,18,0,${0.14 + Math.sin(t*2)*0.04})`;
      ctx.strokeStyle = `rgba(204,34,0,${0.7 + Math.sin(t*3)*0.2})`; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((memPts[0][0]+memPts[memPts.length-1][0])/2,
                 (memPts[0][1]+memPts[memPts.length-1][1])/2);
      for (let i = 0; i < memPts.length; i++) {
        const cur  = memPts[i];
        const next = memPts[(i+1) % memPts.length];
        ctx.quadraticCurveTo(cur[0],cur[1],(cur[0]+next[0])/2,(cur[1]+next[1])/2);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Internal parasites swimming inside the cell
      for (let i = 0; i < 3; i++) {
        const pa = t * 0.85 + (i / 3) * Math.PI * 2;
        const px = Math.cos(pa) * 11;
        const py = Math.sin(pa) * 9;
        ctx.save(); ctx.translate(px, py); ctx.rotate(pa + Math.PI * 0.5);
        ctx.fillStyle = `rgba(230,55,18,${0.6 + Math.sin(t*3+i)*0.2})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 7, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,80,40,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
        // Flagellum on each parasite
        ctx.beginPath();
        ctx.moveTo(0, 7);
        ctx.bezierCurveTo(3,11,5,9,7,13);
        ctx.strokeStyle = `rgba(255,80,40,0.5)`; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      }
      // Dark nuclear region at centre
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 8, 0.2, 0, Math.PI*2);
      ctx.fillStyle = `rgba(110,0,0,${0.5 + Math.sin(t*4)*0.2})`; ctx.fill();
      ctx.strokeStyle = 'rgba(204,34,0,0.38)'; ctx.lineWidth = 1; ctx.stroke();

    } else if (rarity === 'luck-maxxing') {
      // Propagation Cluster â€” three flagellated bacteria orbiting
      const orbitR = 19;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + t * 1.1;
        const cx = Math.cos(angle) * orbitR;
        const cy = Math.sin(angle) * orbitR;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle + Math.PI * 0.5);
        // Cell body
        ctx.fillStyle = `rgba(204,68,170,${0.52 + Math.sin(t*3+i)*0.22})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 0, 5, 8, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        // Nucleus dot
        ctx.fillStyle = 'rgba(175,24,138,0.8)';
        ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI*2); ctx.fill();
        // Flagellum
        ctx.strokeStyle = `rgba(255,120,210,${0.5+Math.sin(t*2+i)*0.3})`;
        ctx.lineWidth = 0.9; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.bezierCurveTo(4, 13, 6, 11, 8, 16);
        ctx.bezierCurveTo(10, 20, 8, 23, 11, 26);
        ctx.stroke();
        ctx.restore();
      }
      // Faint connecting threads between cells
      for (let i = 0; i < 3; i++) {
        const a1 = (i/3)*Math.PI*2 + t*1.1;
        const a2 = ((i+1)/3)*Math.PI*2 + t*1.1;
        ctx.strokeStyle = `rgba(204,68,170,${0.18+Math.sin(t*2+i)*0.08})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1)*orbitR, Math.sin(a1)*orbitR);
        ctx.lineTo(Math.cos(a2)*orbitR, Math.sin(a2)*orbitR);
        ctx.stroke();
      }

    } else if (rarity === 'legendary-alpha') {
      // The Bloom â€” spreading mycelium colony, rainbow shimmer
      const pulse = 1 + Math.sin(t * 2) * 0.05;
      ctx.scale(pulse, pulse);

      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 46);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i/6, rainbow(t, i*60));

      // Primary tendrils radiating outward
      ctx.lineCap = 'round';
      for (let b = 0; b < 8; b++) {
        const ba = (b / 8) * Math.PI * 2;
        const tx = Math.cos(ba) * 38, ty = Math.sin(ba) * 38;
        const cpx = Math.cos(ba + 0.45) * 22, cpy = Math.sin(ba + 0.45) * 22;
        ctx.strokeStyle = grad; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(cpx,cpy,tx,ty); ctx.stroke();
        // Terminal bud
        ctx.beginPath(); ctx.arc(tx, ty, 3.2 + Math.sin(t*3+b), 0, Math.PI*2);
        const h = ((t*60 + b*45) % 360 + 360) % 360;
        ctx.fillStyle = `hsla(${h},82%,58%,0.85)`; ctx.fill();
        // Secondary branches at midpoint
        if (b % 2 === 0) {
          const mx = Math.cos(ba)*20, my = Math.sin(ba)*20;
          ctx.lineWidth = 1.1;
          [[0.8,32],[-0.8,32]].forEach(([da,dist]) => {
            const sx = Math.cos(ba+da)*dist, sy = Math.sin(ba+da)*dist;
            ctx.beginPath(); ctx.moveTo(mx,my); ctx.lineTo(sx,sy); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx,sy,2,0,Math.PI*2);
            ctx.fillStyle = `hsla(${(h+40)%360},80%,62%,0.75)`; ctx.fill();
          });
        }
      }
      // Central mass
      ctx.beginPath(); ctx.arc(0, 0, 11 + Math.sin(t*2)*1.5, 0, Math.PI*2);
      const cgrad = ctx.createRadialGradient(0,0,0,0,0,13);
      for (let i = 0; i <= 4; i++) cgrad.addColorStop(i/4, rainbow(t, i*90));
      ctx.fillStyle = cgrad; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      // Orbiting spore dots
      for (let i = 0; i < 12; i++) {
        const sa = (i/12)*Math.PI*2 + t*0.35;
        const sr = 22 + Math.sin(t*2+i)*6;
        const h  = ((t*60+i*30)%360+360)%360;
        ctx.beginPath(); ctx.arc(Math.cos(sa)*sr, Math.sin(sa)*sr, 1.5, 0, Math.PI*2);
        ctx.fillStyle = `hsla(${h},82%,62%,${0.4+Math.sin(t*3+i)*0.28})`; ctx.fill();
      }
      // Glowing heartwood core
      ctx.beginPath(); ctx.arc(0, 0, 4.5 + Math.sin(t*5)*1.2, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${0.55+Math.sin(t*4)*0.3})`; ctx.fill();
    }

    ctx.restore();
  }

  // ─── RITUAL shape drawers ──────────────────────────────────────────────────────

  function drawShapeRitual(ctx, rarity, t) {
    ctx.save();
    ctx.translate(128, 148);
    ctx.lineCap = 'round';

    if (rarity === 'common') {
      // Sheep Sacrifice — sheep lying on altar stone with blood
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      // Altar base
      ctx.fillStyle = 'rgba(44,34,54,0.65)';
      ctx.beginPath(); ctx.rect(-34, 16, 68, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(36,28,46,0.55)';
      ctx.beginPath(); ctx.rect(-26, 30, 52, 9); ctx.fill(); ctx.stroke();
      // Rune scratches on altar
      ctx.strokeStyle = 'rgba(96,112,96,0.45)'; ctx.lineWidth = 0.8;
      [[-18,20,-14,28],[0,20,0,28],[14,20,18,28]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      // Sheep body lying on altar
      ctx.fillStyle = 'rgba(195,192,185,0.6)';
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(-2, 6, 18, 11, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // Wool bumps
      ctx.fillStyle = 'rgba(210,208,200,0.65)';
      [[-10,0,7],[-1,-4,8],[9,1,6]].forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      });
      // Head turned sideways
      ctx.fillStyle = 'rgba(175,170,162,0.72)';
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(21, 5, 8, 6, 0.2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // Closed eye
      ctx.strokeStyle = 'rgba(60,55,55,0.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(22,5); ctx.lineTo(25,5); ctx.stroke();
      // Blood drips from altar
      ctx.fillStyle = 'rgba(175,18,10,0.72)';
      [[-22,30,-20,42],[-6,30,-5,38],[14,30,15,41]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle = 'rgba(175,18,10,0.72)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(x2,y2,2.5,0,Math.PI*2); ctx.fill();
      });

    } else if (rarity === 'uncommon') {
      // The Goat — standing goat with prominent curved horns
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1.5;
      // Body
      ctx.fillStyle = 'rgba(74,138,170,0.42)';
      ctx.beginPath(); ctx.ellipse(-4, 10, 18, 13, 0.1, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      // Chest lighter
      ctx.fillStyle = 'rgba(100,160,190,0.22)';
      ctx.beginPath(); ctx.ellipse(-2, 14, 9, 7, 0.1, 0, Math.PI*2); ctx.fill();
      // Neck
      ctx.fillStyle = 'rgba(74,138,170,0.48)';
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.bezierCurveTo(12,-8,14,-14,12,-18);
      ctx.bezierCurveTo(17,-16,18,-6,16,0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Head
      ctx.fillStyle = 'rgba(74,138,170,0.55)';
      ctx.beginPath(); ctx.ellipse(12,-22,10,8,0.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Snout
      ctx.fillStyle = 'rgba(55,105,135,0.62)';
      ctx.beginPath(); ctx.ellipse(20,-20,5,4,0.1,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Eye
      ctx.fillStyle = '#0a1820';
      ctx.beginPath(); ctx.arc(18,-24,2,0,Math.PI*2); ctx.fill();
      // Beard
      ctx.fillStyle = 'rgba(65,120,150,0.42)';
      ctx.beginPath(); ctx.moveTo(16,-18); ctx.bezierCurveTo(18,-10,15,-4,13,0); ctx.bezierCurveTo(11,-4,14,-10,16,-18); ctx.fill(); ctx.stroke();
      // Curved horns
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(8,-28); ctx.bezierCurveTo(0,-36,-6,-42,-4,-48); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4,-48); ctx.lineTo(0,-44); ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(18,-28); ctx.bezierCurveTo(26,-36,30,-42,28,-48); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(28,-48); ctx.lineTo(24,-44); ctx.stroke();
      // Legs
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 2.5;
      [[-12,22],[-2,24],[4,22],[14,20]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-1,y+14); ctx.stroke();
      });
      // Tail
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-20,4); ctx.lineTo(-24,-4); ctx.stroke();

    } else if (rarity === 'rare') {
      // The Pyre — logs with animated flames
      ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
      // Log stack
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(-22+i*2, 18+i*4); ctx.rotate(i === 0 ? -0.2 : i === 1 ? 0.1 : 0.15);
        ctx.fillStyle = 'rgba(72,44,22,0.72)';
        ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(20,0,20,5,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // Crossed upper logs
      [[-0.4,0.2],[0.4,-0.18]].forEach(([rx,ry],idx) => {
        ctx.save(); ctx.rotate(rx*0.42);
        ctx.fillStyle = 'rgba(62,36,16,0.78)';
        ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(0,6+idx*4,18,4,ry,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      // Flames — animated
      [[0,2,9,30,0],[-10,6,7,24,-0.28],[10,6,7,26,0.24],[-18,12,4,16,-0.38],[18,12,5,18,0.32]].forEach(([fx,fy,fw,fh,fa]) => {
        const flk = Math.sin(t*4+fx*0.3)*0.15;
        ctx.save(); ctx.translate(fx,fy); ctx.rotate(fa+flk);
        ctx.fillStyle = `rgba(195,55,8,${0.55+Math.sin(t*5+fx)*0.2})`;
        ctx.beginPath(); ctx.moveTo(-fw,0); ctx.bezierCurveTo(-fw*0.6,-fh*0.4,-fw*0.3,-fh*0.8,0,-fh);
        ctx.bezierCurveTo(fw*0.3,-fh*0.8,fw*0.6,-fh*0.4,fw,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(250,155,18,${0.62+Math.sin(t*6+fx)*0.2})`;
        ctx.beginPath(); ctx.moveTo(-fw*0.5,0); ctx.bezierCurveTo(-fw*0.3,-fh*0.5,-fw*0.1,-fh*0.75,0,-fh*0.85);
        ctx.bezierCurveTo(fw*0.1,-fh*0.75,fw*0.3,-fh*0.5,fw*0.5,0); ctx.closePath(); ctx.fill();
        ctx.restore();
      });
      // Rising embers
      for (let i = 0; i < 7; i++) {
        const ey = -16 + Math.sin(t*3+i*1.1)*6 - (t*28+i*18)%38;
        ctx.beginPath(); ctx.arc(Math.sin(t*2+i*0.7)*14, ey, 1.5, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,155,38,${0.5+Math.sin(t*4+i)*0.3})`; ctx.fill();
      }

    } else if (rarity === 'legendary') {
      // The Offering — skull on altar with blood pools
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5;
      // Altar base
      ctx.fillStyle = 'rgba(44,30,58,0.62)';
      ctx.beginPath();
      ctx.moveTo(-36,38); ctx.lineTo(-32,14); ctx.lineTo(32,14); ctx.lineTo(36,38);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Altar top slab
      ctx.fillStyle = 'rgba(56,42,68,0.68)';
      ctx.beginPath(); ctx.rect(-38,6,76,10); ctx.fill(); ctx.stroke();
      // Rune marks on slab
      ctx.strokeStyle = 'rgba(200,144,48,0.32)'; ctx.lineWidth = 0.8;
      [[-26,9,-26,14],[-14,9,-14,14],[0,8,0,14],[14,9,14,14],[26,9,26,14]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      // Skull — on altar
      ctx.fillStyle = 'rgba(195,180,148,0.52)';
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,-4,14,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Jaw
      ctx.fillStyle = 'rgba(180,165,132,0.58)';
      ctx.beginPath(); ctx.moveTo(-10,6); ctx.lineTo(-12,14); ctx.lineTo(12,14); ctx.lineTo(10,6); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Teeth
      ctx.fillStyle = 'rgba(200,185,152,0.75)';
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.rect(i*3-1,8,2,5); ctx.fill(); }
      // Eye sockets
      ctx.fillStyle = 'rgba(16,8,26,0.88)';
      ctx.beginPath(); ctx.ellipse(-5,-4,4,5,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5,-4,4,5,0,0,Math.PI*2); ctx.fill();
      // Nasal
      ctx.beginPath(); ctx.ellipse(0,2,2.5,2,0,0,Math.PI*2); ctx.fill();
      // Blood pools on altar
      ctx.fillStyle = 'rgba(165,18,10,0.62)';
      ctx.beginPath(); ctx.ellipse(-24,11,6,3,0,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(20,11,8,3,0,0,Math.PI*2); ctx.fill();
      // Blood drips
      ctx.strokeStyle = 'rgba(165,18,10,0.55)'; ctx.lineWidth = 2;
      [[-28,16,-30,26],[-18,16,-20,29],[22,16,24,24],[28,16,30,22]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.fillStyle = 'rgba(165,18,10,0.55)';
        ctx.beginPath(); ctx.arc(x2,y2,2.2,0,Math.PI*2); ctx.fill();
      });

    } else if (rarity === 'mythical') {
      // The Summoning — ritual circle, animated rotation, central void
      const rot = t * 0.4;
      // Outer rotating ring
      ctx.save(); ctx.rotate(rot);
      ctx.strokeStyle = `rgba(204,34,0,${0.52+Math.sin(t*3)*0.2})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,0,36,0,Math.PI*2); ctx.stroke();
      // Symbol marks on ring
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2;
        const rx = Math.cos(a)*36, ry = Math.sin(a)*36;
        ctx.save(); ctx.translate(rx,ry); ctx.rotate(a);
        ctx.strokeStyle = `rgba(204,34,0,${0.42+Math.sin(t*3+i)*0.25})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-3,-4); ctx.lineTo(0,-8); ctx.lineTo(3,-4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-3,0); ctx.lineTo(3,0); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      // Inner counter-rotating ring with pentagram
      ctx.save(); ctx.rotate(-rot*1.5);
      ctx.strokeStyle = `rgba(204,34,0,${0.38+Math.sin(t*4)*0.18})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.stroke();
      const pts5 = [];
      for (let i = 0; i < 5; i++) {
        const a = (i/5)*Math.PI*2 - Math.PI/2;
        pts5.push([Math.cos(a)*24, Math.sin(a)*24]);
      }
      ctx.strokeStyle = `rgba(204,34,0,${0.3+Math.sin(t*2)*0.14})`; ctx.lineWidth = 0.8;
      [[0,2],[0,3],[1,3],[1,4],[2,4]].forEach(([a,b]) => {
        ctx.beginPath(); ctx.moveTo(pts5[a][0],pts5[a][1]); ctx.lineTo(pts5[b][0],pts5[b][1]); ctx.stroke();
      });
      ctx.restore();
      // Central pulsing void
      const voidR = 10 + Math.sin(t*3)*2;
      const vg = ctx.createRadialGradient(0,0,0,0,0,voidR);
      vg.addColorStop(0, `rgba(36,0,52,${0.92+Math.sin(t*4)*0.06})`);
      vg.addColorStop(1, 'rgba(90,8,18,0.1)');
      ctx.beginPath(); ctx.arc(0,0,voidR,0,Math.PI*2);
      ctx.fillStyle = vg; ctx.fill();
      ctx.strokeStyle = `rgba(204,34,0,${0.68+Math.sin(t*5)*0.2})`; ctx.lineWidth = 1.5; ctx.stroke();
      // Blood trails leading inward
      ctx.strokeStyle = 'rgba(175,18,10,0.38)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = (i/4)*Math.PI*2 + rot*0.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*36, Math.sin(a)*36);
        ctx.lineTo(Math.cos(a)*12, Math.sin(a)*12);
        ctx.stroke();
      }

    } else if (rarity === 'luck-maxxing') {
      // Mass Rite — three cloaked figures orbiting, candle flames at triangle points
      const orbitR = 20;
      for (let i = 0; i < 3; i++) {
        const angle = (i/3)*Math.PI*2 + t*0.9;
        const cx = Math.cos(angle)*orbitR, cy = Math.sin(angle)*orbitR;
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle + Math.PI*0.5);
        // Robe
        ctx.fillStyle = `rgba(204,68,170,${0.38+Math.sin(t*3+i)*0.2})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-4,8); ctx.lineTo(-5,14); ctx.lineTo(5,14); ctx.lineTo(4,8);
        ctx.bezierCurveTo(5,4,5,0,3,-2); ctx.lineTo(-3,-2);
        ctx.bezierCurveTo(-5,0,-5,4,-4,8); ctx.fill(); ctx.stroke();
        // Hood head
        ctx.beginPath(); ctx.arc(0,-6,4,0,Math.PI*2); ctx.fill(); ctx.stroke();
        // Dark shadow inside hood
        ctx.fillStyle = 'rgba(28,4,28,0.62)';
        ctx.beginPath(); ctx.arc(-1,-7,2,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
      // Candle flames at triangle vertices
      for (let i = 0; i < 3; i++) {
        const a = (i/3)*Math.PI*2 - Math.PI/2;
        const fx = Math.cos(a)*32, fy = Math.sin(a)*32;
        const flk = Math.sin(t*5+i*1.5)*0.14;
        ctx.save(); ctx.translate(fx,fy);
        // Candle stub
        ctx.fillStyle = 'rgba(200,185,150,0.6)';
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.rect(-2,0,4,6); ctx.fill(); ctx.stroke();
        // Flame
        ctx.rotate(flk);
        ctx.fillStyle = `rgba(255,158,18,${0.52+flk})`;
        ctx.beginPath(); ctx.moveTo(-2,0); ctx.bezierCurveTo(-1.5,-4,0,-7,0,-8); ctx.bezierCurveTo(0,-7,1.5,-4,2,0); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      // Connecting ritual triangle
      ctx.strokeStyle = 'rgba(204,68,170,0.18)'; ctx.lineWidth = 0.7;
      const triPts = [0,1,2].map(i => {
        const a = (i/3)*Math.PI*2 - Math.PI/2;
        return [Math.cos(a)*20, Math.sin(a)*20];
      });
      ctx.beginPath(); ctx.moveTo(triPts[0][0],triPts[0][1]);
      triPts.forEach(([px,py]) => ctx.lineTo(px,py));
      ctx.closePath(); ctx.stroke();

    } else if (rarity === 'legendary-alpha') {
      // The Entity — cosmic eye, unknowable, rainbow shimmer
      const pulse = 1 + Math.sin(t*2)*0.06;
      ctx.scale(pulse, pulse);
      const grad = ctx.createRadialGradient(0,0,0,0,0,44);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i/6, rainbow(t, i*60));
      // Outer tendrils
      for (let b = 0; b < 12; b++) {
        const ba = (b/12)*Math.PI*2 + t*0.15;
        const len = 28 + Math.sin(t*3+b)*6;
        ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ba)*12, Math.sin(ba)*12);
        ctx.lineTo(Math.cos(ba)*len, Math.sin(ba)*len); ctx.stroke();
        const h = ((t*60+b*30)%360+360)%360;
        ctx.beginPath(); ctx.arc(Math.cos(ba)*len, Math.sin(ba)*len, 1.5+Math.sin(t*4+b)*0.8,0,Math.PI*2);
        ctx.fillStyle = `hsla(${h},85%,60%,0.8)`; ctx.fill();
      }
      // Eye body — tall ellipse
      ctx.beginPath(); ctx.ellipse(0,0,12,18,0,0,Math.PI*2);
      ctx.fillStyle = 'rgba(8,0,18,0.94)'; ctx.fill();
      ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.stroke();
      // Iris swirl
      ctx.save(); ctx.rotate(t*0.5);
      for (let i = 0; i < 6; i++) {
        const ia = (i/6)*Math.PI*2;
        const h = ((t*60+i*60)%360+360)%360;
        ctx.strokeStyle = `hsla(${h},80%,55%,${0.48+Math.sin(t*3+i)*0.28})`; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(Math.cos(ia)*5, Math.sin(ia)*5, 3+Math.sin(t*4+i),0,Math.PI*2); ctx.stroke();
      }
      ctx.restore();
      // Void pupil
      ctx.beginPath(); ctx.arc(0,0,5+Math.sin(t*3)*1.5,0,Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.38+Math.sin(t*5)*0.28})`; ctx.lineWidth = 1; ctx.stroke();
      // Eye glint
      ctx.fillStyle = `rgba(255,255,255,${0.22+Math.sin(t*4)*0.14})`;
      ctx.beginPath(); ctx.ellipse(-3,-5,3,2,-0.5,0,Math.PI*2); ctx.fill();
    }

    ctx.restore();
  }

  // ─── CRITTER shape drawers ─────────────────────────────────────────────────────

  function drawShapeCritter(ctx, rarity, t) {
    ctx.save();
    ctx.translate(128, 148);
    ctx.lineCap = 'round';

    if (rarity === 'common') {
      // Sheep — fluffy round body, small head, four peg legs
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      // Body base
      ctx.fillStyle = 'rgba(200,198,190,0.62)';
      ctx.beginPath(); ctx.arc(0,4,20,0,Math.PI*2); ctx.fill();
      // Woolly bumps on top
      ctx.fillStyle = 'rgba(212,210,202,0.68)';
      [[-14,-5,10],[-2,-12,11],[12,-6,10],[-8,-10,8]].forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      });
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0,4,20,0,Math.PI*2); ctx.stroke();
      // Head
      ctx.fillStyle = 'rgba(178,172,165,0.72)';
      ctx.beginPath(); ctx.ellipse(22,2,9,8,0.3,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Ears
      ctx.fillStyle = 'rgba(195,158,152,0.68)';
      ctx.beginPath(); ctx.ellipse(18,-8,3.5,5,-0.4,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(27,-7,3,5,0.4,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Snout
      ctx.fillStyle = 'rgba(188,158,152,0.58)';
      ctx.beginPath(); ctx.ellipse(28,5,5,4,0.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Eye
      ctx.fillStyle = '#303030';
      ctx.beginPath(); ctx.arc(25,0,2,0,Math.PI*2); ctx.fill();
      // Legs
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 3;
      [[-14,22],[-5,24],[5,24],[14,22]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+12); ctx.stroke();
      });

    } else if (rarity === 'uncommon') {
      // Duck — round body, flat beak, webbed feet
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1.5;
      // Body
      ctx.fillStyle = 'rgba(74,138,170,0.44)';
      ctx.beginPath(); ctx.ellipse(0,6,22,15,0.08,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Wing sheen
      ctx.fillStyle = 'rgba(55,108,140,0.32)';
      ctx.beginPath(); ctx.ellipse(-2,8,13,8,0.08,0,Math.PI*2); ctx.fill();
      // Tail feathers
      ctx.fillStyle = 'rgba(74,138,170,0.55)';
      ctx.beginPath();
      ctx.moveTo(-18,8); ctx.bezierCurveTo(-28,4,-32,-4,-26,-8);
      ctx.bezierCurveTo(-22,-6,-20,2,-18,8); ctx.fill(); ctx.stroke();
      // Head
      ctx.fillStyle = 'rgba(74,138,170,0.62)';
      ctx.beginPath(); ctx.arc(20,-6,11,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Eye
      ctx.fillStyle = '#0a1820';
      ctx.beginPath(); ctx.arc(23,-8,2.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(175,218,255,0.38)';
      ctx.beginPath(); ctx.arc(22,-9,1,0,Math.PI*2); ctx.fill();
      // Flat bill
      ctx.fillStyle = 'rgba(218,178,58,0.82)';
      ctx.strokeStyle = 'rgba(195,148,38,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(31,-5,7,4,0.1,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(195,148,38,0.45)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(24,-5); ctx.lineTo(36,-5); ctx.stroke();
      // Webbed feet
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1.2;
      [[-8,22],[4,24]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-6,y+8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+6,y+8); ctx.stroke();
        ctx.fillStyle = 'rgba(218,178,58,0.38)';
        ctx.beginPath(); ctx.moveTo(x-6,y+8); ctx.lineTo(x,y+9); ctx.lineTo(x+6,y+8); ctx.lineTo(x,y); ctx.fill();
      });

    } else if (rarity === 'rare') {
      // Flock of Birds — V formation, seven birds at different scales
      ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
      const birds = [[0,0,1.0],[-22,10,0.78],[22,10,0.78],[-40,18,0.62],[40,18,0.62],[-54,28,0.5],[54,28,0.5]];
      birds.forEach(([bx,by,sc]) => {
        ctx.save(); ctx.translate(bx,by); ctx.scale(sc,sc);
        ctx.fillStyle = `rgba(154,106,184,${0.28+sc*0.3})`;
        ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5/sc;
        // Body
        ctx.beginPath(); ctx.ellipse(0,0,7,4,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
        // Wings
        ctx.beginPath(); ctx.moveTo(-7,0); ctx.bezierCurveTo(-13,-8,-19,-10,-23,-6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7,0); ctx.bezierCurveTo(13,-8,19,-10,23,-6); ctx.stroke();
        // Head
        ctx.beginPath(); ctx.arc(8,-2,3.5,0,Math.PI*2);
        ctx.fillStyle = `rgba(118,75,158,${0.48+sc*0.3})`; ctx.fill();
        ctx.restore();
      });

    } else if (rarity === 'legendary') {
      // Red Fox — alert profile, bushy tail, pointed ears
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5;
      // Body
      ctx.fillStyle = 'rgba(198,108,28,0.55)';
      ctx.beginPath(); ctx.ellipse(-4,8,16,19,0.1,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Belly
      ctx.fillStyle = 'rgba(228,196,158,0.38)';
      ctx.beginPath(); ctx.ellipse(-2,14,8,11,0.1,0,Math.PI*2); ctx.fill();
      // Head
      ctx.fillStyle = 'rgba(198,108,28,0.62)';
      ctx.beginPath(); ctx.ellipse(14,-8,13,11,0.3,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Snout
      ctx.fillStyle = 'rgba(178,88,18,0.62)';
      ctx.beginPath();
      ctx.moveTo(24,-6); ctx.bezierCurveTo(30,-8,34,-4,30,-2);
      ctx.bezierCurveTo(28,0,26,-1,24,-6); ctx.fill(); ctx.stroke();
      // Nose
      ctx.fillStyle = 'rgba(38,18,8,0.82)';
      ctx.beginPath(); ctx.arc(32,-3,2,0,Math.PI*2); ctx.fill();
      // Eye
      ctx.fillStyle = 'rgba(198,142,46,0.92)';
      ctx.beginPath(); ctx.arc(22,-12,3.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#100800';
      ctx.beginPath(); ctx.arc(22,-12,2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,218,98,0.28)';
      ctx.beginPath(); ctx.arc(21,-13,1,0,Math.PI*2); ctx.fill();
      // Pointed ears
      ctx.fillStyle = 'rgba(198,108,28,0.65)';
      ctx.beginPath(); ctx.moveTo(8,-16); ctx.lineTo(4,-32); ctx.lineTo(16,-22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20,-18); ctx.lineTo(22,-34); ctx.lineTo(28,-20); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(218,138,98,0.38)';
      ctx.beginPath(); ctx.moveTo(10,-18); ctx.lineTo(6,-28); ctx.lineTo(14,-22); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(21,-20); ctx.lineTo(23,-30); ctx.lineTo(27,-21); ctx.closePath(); ctx.fill();
      // Bushy tail
      ctx.fillStyle = 'rgba(198,108,28,0.48)';
      ctx.beginPath();
      ctx.moveTo(-18,14); ctx.bezierCurveTo(-34,8,-44,-2,-36,-14);
      ctx.bezierCurveTo(-30,-20,-18,-16,-12,-8);
      ctx.bezierCurveTo(-6,-4,-10,6,-18,14); ctx.fill(); ctx.stroke();
      // Tail white tip
      ctx.fillStyle = 'rgba(228,218,208,0.72)';
      ctx.beginPath();
      ctx.moveTo(-34,-6); ctx.bezierCurveTo(-40,-10,-42,-18,-36,-20);
      ctx.bezierCurveTo(-30,-22,-24,-16,-28,-10); ctx.closePath(); ctx.fill();
      // Legs
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 2.5;
      [[-12,26],[-2,28],[4,26]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-2,y+12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+4,y+12); ctx.stroke();
      });

    } else if (rarity === 'mythical') {
      // Great Stag — majestic deer, sweeping antlers, animated sway
      const sway  = Math.sin(t*1.0)*0.03;
      const pulse = 0.55 + Math.sin(t*2.5)*0.2;
      ctx.rotate(sway);
      // Body
      ctx.fillStyle = `rgba(158,98,38,${0.4+Math.sin(t*2)*0.06})`;
      ctx.strokeStyle = `rgba(204,34,0,${pulse*0.58})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0,10,20,14,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Neck
      ctx.fillStyle = `rgba(158,98,38,0.5)`;
      ctx.beginPath();
      ctx.moveTo(10,0); ctx.bezierCurveTo(14,-8,16,-14,14,-18);
      ctx.bezierCurveTo(18,-16,20,-8,18,0); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Head
      ctx.fillStyle = `rgba(158,98,38,${0.48+Math.sin(t*2)*0.06})`;
      ctx.beginPath(); ctx.ellipse(14,-22,10,8,0.2,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Eye
      ctx.fillStyle = '#0a0400';
      ctx.beginPath(); ctx.arc(18,-24,2.5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = `rgba(198,98,18,0.8)`;
      ctx.beginPath(); ctx.arc(17,-25,1,0,Math.PI*2); ctx.fill();
      // Snout
      ctx.fillStyle = `rgba(138,78,28,0.55)`;
      ctx.beginPath(); ctx.ellipse(21,-19,4,3,0.2,0,Math.PI*2); ctx.fill();
      // Antlers
      ctx.strokeStyle = `rgba(204,34,0,${pulse*0.68})`; ctx.lineWidth = 2;
      [[14,-28,4,-44],[4,-44,-8,-54],[4,-44,-2,-56],[4,-44,10,-58],[14,-28,6,-40],[6,-40,0,-50]].forEach(([x1,y1,x2,y2]) => {
        ctx.lineWidth = y1 < -40 ? 1 : 1.8;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      [[18,-28,28,-44],[28,-44,36,-54],[28,-44,30,-56],[28,-44,22,-58],[18,-28,26,-40],[26,-40,32,-50]].forEach(([x1,y1,x2,y2]) => {
        ctx.lineWidth = y1 < -40 ? 1 : 1.8;
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      // Legs
      ctx.strokeStyle = `rgba(204,34,0,${pulse*0.48})`; ctx.lineWidth = 2.5;
      [[-14,22],[-4,24],[8,22],[16,20]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x-2,y+14); ctx.stroke();
      });
      // White rump patch
      ctx.fillStyle = `rgba(228,218,208,${0.58+Math.sin(t*3)*0.18})`;
      ctx.beginPath(); ctx.ellipse(-16,8,5,4,0,0,Math.PI*2); ctx.fill();

    } else if (rarity === 'luck-maxxing') {
      // The Migration — three bird silhouettes orbiting, trailing sparkles
      const orbitR = 20;
      for (let i = 0; i < 3; i++) {
        const angle = (i/3)*Math.PI*2 + t*0.9;
        const cx = Math.cos(angle)*orbitR, cy = Math.sin(angle)*orbitR;
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle + Math.PI*0.5);
        const sc = 0.8 + Math.sin(t*2+i)*0.1;
        ctx.scale(sc,sc);
        ctx.fillStyle = `rgba(204,68,170,${0.52+Math.sin(t*3+i)*0.22})`;
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0,0,5,3,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-5,0); ctx.bezierCurveTo(-10,-5,-14,-6,-16,-4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5,0); ctx.bezierCurveTo(10,-5,14,-6,16,-4); ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2 + t*0.35;
        const r = 30 + Math.sin(t*2+i)*3;
        ctx.beginPath(); ctx.arc(Math.cos(a)*r, Math.sin(a)*r,1,0,Math.PI*2);
        ctx.fillStyle = `rgba(204,68,170,${0.22+Math.sin(t*3+i)*0.18})`; ctx.fill();
      }

    } else if (rarity === 'legendary-alpha') {
      // The Herd — row of animal silhouettes on glowing ground, rainbow shimmer
      const pulse = 1 + Math.sin(t*2)*0.05;
      ctx.scale(pulse,pulse);
      const grad = ctx.createLinearGradient(-46,-40,46,40);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i/6, rainbow(t,i*60));
      // Ground
      ctx.strokeStyle = grad; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-50,26); ctx.lineTo(50,26); ctx.stroke();
      // Five animal silhouettes
      [-36,-18,-2,14,30].forEach((ax,idx) => {
        const h = ((t*60+idx*72)%360+360)%360;
        ctx.fillStyle = `hsla(${h},76%,55%,${0.42+Math.sin(t*2+idx)*0.14})`;
        ctx.strokeStyle = grad; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(ax,16,9,7,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(ax+10,8,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ax+8,4); ctx.lineTo(ax+6,-2); ctx.lineTo(ax+12,3); ctx.fill();
        ctx.strokeStyle = `hsla(${h},76%,44%,0.8)`; ctx.lineWidth = 1.5;
        [[ax-4,22],[ax+2,22],[ax-8,22]].forEach(([x,y]) => {
          ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x,y+6); ctx.stroke();
        });
      });
      // Rainbow ground line
      const lg = ctx.createLinearGradient(-50,28,50,28);
      for (let i = 0; i <= 4; i++) lg.addColorStop(i/4, rainbow(t,i*90));
      ctx.strokeStyle = lg; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-50,28); ctx.lineTo(50,28); ctx.stroke();
    }

    ctx.restore();
  }

  // ─── FUNGI shape drawers ───────────────────────────────────────────────────────

  function drawShapeFungi(ctx, rarity, t) {
    ctx.save();
    ctx.translate(128, 148);
    ctx.lineCap = 'round';

    if (rarity === 'common') {
      // White Mushroom — classic dome cap + straight stem
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      // Stem
      ctx.fillStyle = 'rgba(198,198,188,0.62)';
      ctx.beginPath();
      ctx.moveTo(-9,38); ctx.lineTo(-8,8);
      ctx.quadraticCurveTo(-7,2,0,2); ctx.quadraticCurveTo(7,2,8,8);
      ctx.lineTo(9,38); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Annulus
      ctx.strokeStyle = 'rgba(92,108,92,0.48)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-9,18); ctx.lineTo(9,18); ctx.stroke();
      // Cap
      ctx.fillStyle = 'rgba(192,192,182,0.65)';
      ctx.strokeStyle = '#607060'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-28,8); ctx.bezierCurveTo(-30,-4,-20,-28,0,-30);
      ctx.bezierCurveTo(20,-28,30,-4,28,8);
      ctx.quadraticCurveTo(14,14,0,12); ctx.quadraticCurveTo(-14,14,-28,8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Cap highlight
      ctx.fillStyle = 'rgba(228,228,218,0.28)';
      ctx.beginPath(); ctx.ellipse(-6,-14,10,6,-0.4,0,Math.PI*2); ctx.fill();
      // Gills
      ctx.strokeStyle = 'rgba(92,108,92,0.32)'; ctx.lineWidth = 0.7;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath(); ctx.moveTo(i*4.5,8); ctx.lineTo(i*3,1); ctx.stroke();
      }

    } else if (rarity === 'uncommon') {
      // Fairy Cap — wide spotted fly agaric
      ctx.strokeStyle = '#4a8aaa'; ctx.lineWidth = 1.5;
      // Stem
      ctx.fillStyle = 'rgba(208,214,218,0.62)';
      ctx.beginPath();
      ctx.moveTo(-10,38); ctx.bezierCurveTo(-12,28,-10,18,-8,8);
      ctx.quadraticCurveTo(-7,2,0,2); ctx.quadraticCurveTo(7,2,8,8);
      ctx.bezierCurveTo(10,18,12,28,10,38); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Volva at base
      ctx.fillStyle = 'rgba(188,198,208,0.5)';
      ctx.beginPath(); ctx.ellipse(0,38,14,5,0,0,Math.PI); ctx.fill(); ctx.stroke();
      // Cap
      ctx.fillStyle = 'rgba(74,138,170,0.52)';
      ctx.beginPath();
      ctx.moveTo(-32,8); ctx.bezierCurveTo(-34,-4,-24,-30,0,-32);
      ctx.bezierCurveTo(24,-30,34,-4,32,8);
      ctx.quadraticCurveTo(16,16,0,14); ctx.quadraticCurveTo(-16,16,-32,8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // White wart spots
      ctx.fillStyle = 'rgba(198,214,224,0.82)';
      [[-14,-10,5],[4,-22,4.5],[18,-8,4],[-4,-6,3.5],[10,-28,3]].forEach(([x,y,r]) => {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
      });
      // Gills
      ctx.strokeStyle = 'rgba(74,138,170,0.38)'; ctx.lineWidth = 0.7;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath(); ctx.moveTo(i*4.5,8); ctx.lineTo(i*3,1); ctx.stroke();
      }

    } else if (rarity === 'rare') {
      // Chanterelle — wavy ruffled funnel cap
      ctx.strokeStyle = '#9a6ab8'; ctx.lineWidth = 1.5;
      // Stem — thick
      ctx.fillStyle = 'rgba(198,168,98,0.5)';
      ctx.beginPath();
      ctx.moveTo(-12,38); ctx.bezierCurveTo(-10,22,-6,8,-4,2);
      ctx.bezierCurveTo(-2,-2,2,-2,4,2); ctx.bezierCurveTo(6,8,10,22,12,38);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Funnel cap — slightly depressed centre
      ctx.fillStyle = 'rgba(154,106,184,0.44)';
      ctx.beginPath();
      ctx.moveTo(-28,8); ctx.bezierCurveTo(-30,-2,-22,-20,0,-22);
      ctx.bezierCurveTo(22,-20,30,-2,28,8);
      ctx.bezierCurveTo(18,14,0,12,-28,8); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // Ruffled wavy edge
      ctx.strokeStyle = 'rgba(154,106,184,0.58)'; ctx.lineWidth = 1.2;
      for (let i = -4; i <= 4; i++) {
        const ex = i*7, ey = 2 + Math.sin(i*0.9)*4;
        ctx.beginPath(); ctx.moveTo(ex,8);
        ctx.quadraticCurveTo(ex,ey-5,ex+3,ey-9); ctx.stroke();
      }
      // Fork ridges
      ctx.strokeStyle = 'rgba(128,78,158,0.32)'; ctx.lineWidth = 0.7;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath(); ctx.moveTo(i*4.5,8); ctx.lineTo(i*3,1); ctx.stroke();
      }

    } else if (rarity === 'legendary') {
      // Giant Puffball — large smooth sphere with subtle texture
      ctx.strokeStyle = '#c89030'; ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(198,182,138,0.5)';
      ctx.beginPath(); ctx.arc(0,4,34,0,Math.PI*2); ctx.fill(); ctx.stroke();
      // Concentric rings — texture
      ctx.strokeStyle = 'rgba(200,144,48,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0,4,22,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,4,10,0,Math.PI*2); ctx.stroke();
      // Highlight
      ctx.fillStyle = 'rgba(228,212,178,0.28)';
      ctx.beginPath(); ctx.ellipse(-10,-8,14,10,-0.5,0,Math.PI*2); ctx.fill();
      // Base stub
      ctx.fillStyle = 'rgba(158,128,78,0.42)';
      ctx.beginPath(); ctx.moveTo(-8,36); ctx.lineTo(-6,42); ctx.lineTo(6,42); ctx.lineTo(8,36); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Surface cracks
      ctx.strokeStyle = 'rgba(200,144,48,0.22)'; ctx.lineWidth = 0.8;
      [[-20,4,-10,0],[10,-6,18,2],[0,18,-8,12],[-6,-14,4,-20]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo((x1+x2)/2+4,(y1+y2)/2+4,x2,y2); ctx.stroke();
      });

    } else if (rarity === 'mythical') {
      // Death Cap — pale elegant mushroom, pulsing glow
      const pulse = 1 + Math.sin(t*2.5)*0.06;
      ctx.scale(pulse,pulse);
      ctx.strokeStyle = `rgba(204,34,0,${0.58+Math.sin(t*3)*0.2})`; ctx.lineWidth = 1.5;
      // Stem — pale greenish-white
      ctx.fillStyle = `rgba(188,198,172,${0.42+Math.sin(t*2)*0.08})`;
      ctx.beginPath();
      ctx.moveTo(-8,40); ctx.bezierCurveTo(-10,28,-8,16,-6,6);
      ctx.quadraticCurveTo(-4,0,0,0); ctx.quadraticCurveTo(4,0,6,6);
      ctx.bezierCurveTo(8,16,10,28,8,40); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Volva — cup at base (key death cap feature)
      ctx.fillStyle = `rgba(172,182,158,${0.48+Math.sin(t*2)*0.1})`;
      ctx.beginPath(); ctx.ellipse(0,40,16,6,0,0,Math.PI); ctx.fill(); ctx.stroke();
      // Annulus — drooping ring
      ctx.fillStyle = `rgba(188,198,172,0.42)`;
      ctx.beginPath();
      ctx.moveTo(-12,16); ctx.bezierCurveTo(-16,18,-14,24,-8,22);
      ctx.bezierCurveTo(-4,20,4,20,8,22); ctx.bezierCurveTo(14,24,16,18,12,16);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Cap — pale greenish dome
      ctx.fillStyle = `rgba(182,198,162,${0.44+Math.sin(t*2)*0.08})`;
      ctx.beginPath();
      ctx.moveTo(-30,6); ctx.bezierCurveTo(-32,-8,-22,-28,0,-30);
      ctx.bezierCurveTo(22,-28,32,-8,30,6);
      ctx.quadraticCurveTo(14,14,0,12); ctx.quadraticCurveTo(-14,14,-30,6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // Greenish sheen
      ctx.fillStyle = `rgba(158,182,138,${0.18+Math.sin(t*3)*0.08})`;
      ctx.beginPath(); ctx.ellipse(0,-12,18,10,0,0,Math.PI*2); ctx.fill();
      // Highlight
      ctx.fillStyle = `rgba(218,228,208,${0.18+Math.sin(t*4)*0.1})`;
      ctx.beginPath(); ctx.ellipse(-8,-18,8,5,-0.4,0,Math.PI*2); ctx.fill();
      // Pale gills
      ctx.strokeStyle = `rgba(158,178,138,0.38)`; ctx.lineWidth = 0.7;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath(); ctx.moveTo(i*4.5,6); ctx.lineTo(i*3,0); ctx.stroke();
      }

    } else if (rarity === 'luck-maxxing') {
      // Spore Release — three spore clouds orbiting
      const orbitR = 19;
      for (let i = 0; i < 3; i++) {
        const angle = (i/3)*Math.PI*2 + t*1.0;
        const cx = Math.cos(angle)*orbitR, cy = Math.sin(angle)*orbitR;
        ctx.save(); ctx.translate(cx,cy);
        // Spore cloud — ring of tiny dots
        for (let j = 0; j < 12; j++) {
          const sa = (j/12)*Math.PI*2 + t*0.5;
          const sr = 2 + Math.sin(t*2+j+i)*3;
          ctx.beginPath(); ctx.arc(Math.cos(sa)*sr, Math.sin(sa)*sr,1.5,0,Math.PI*2);
          ctx.fillStyle = `rgba(204,68,170,${0.38+Math.sin(t*3+j)*0.28})`; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2);
        ctx.fillStyle = `rgba(204,68,170,${0.48+Math.sin(t*3+i)*0.2})`; ctx.fill();
        ctx.strokeStyle = '#cc44aa'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 10; i++) {
        const a = (i/10)*Math.PI*2 + t*0.4;
        const r = 30 + Math.sin(t*2+i)*4;
        ctx.beginPath(); ctx.arc(Math.cos(a)*r, Math.sin(a)*r,1,0,Math.PI*2);
        ctx.fillStyle = `rgba(204,68,170,${0.18+Math.sin(t*3+i)*0.14})`; ctx.fill();
      }

    } else if (rarity === 'legendary-alpha') {
      // The Network — mycelium threads radiating, rainbow shimmer
      const pulse = 1 + Math.sin(t*2)*0.05;
      ctx.scale(pulse,pulse);
      const grad = ctx.createLinearGradient(-40,40,40,-40);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i/6, rainbow(t,i*60));
      // Sinuous arms
      for (let b = 0; b < 10; b++) {
        const ba = (b/10)*Math.PI*2;
        const ex = Math.cos(ba)*38, ey = Math.sin(ba)*38;
        const cpx = Math.cos(ba+0.5)*24, cpy = Math.sin(ba+0.5)*24;
        ctx.strokeStyle = grad; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(cpx,cpy,ex,ey); ctx.stroke();
        // Tip node
        ctx.beginPath(); ctx.arc(ex,ey,2.5+Math.sin(t*3+b)*0.8,0,Math.PI*2);
        const h = ((t*60+b*36)%360+360)%360;
        ctx.fillStyle = `hsla(${h},80%,58%,0.85)`; ctx.fill();
        // Secondary branches
        if (b%2===0) {
          const mx = Math.cos(ba)*18, my = Math.sin(ba)*18;
          [[0.7,28],[-0.7,28]].forEach(([da,dist]) => {
            const sx = Math.cos(ba+da)*dist, sy = Math.sin(ba+da)*dist;
            ctx.strokeStyle = grad; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(mx,my); ctx.lineTo(sx,sy); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx,sy,1.8,0,Math.PI*2);
            ctx.fillStyle = `hsla(${(h+50)%360},78%,62%,0.7)`; ctx.fill();
          });
        }
      }
      // Central hub
      ctx.beginPath(); ctx.arc(0,0,9+Math.sin(t*2)*1.5,0,Math.PI*2);
      const cg = ctx.createRadialGradient(0,0,0,0,0,11);
      for (let i = 0; i <= 4; i++) cg.addColorStop(i/4, rainbow(t,i*90));
      ctx.fillStyle = cg; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    }

    ctx.restore();
  }

  // â”€â”€â”€ Animated border â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ Animated background â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ Corner brackets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function drawCorners(ctx, rarity, t) {
    const color = rarity === 'legendary-alpha' ? rainbow(t, 0) : getCfg(rarity).border;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    const b = 14, bp = 14;
    [[bp,bp,1,1],[256-bp,bp,-1,1],[bp,384-bp,1,-1],[256-bp,384-bp,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath(); ctx.moveTo(x,y+sy*b); ctx.lineTo(x,y); ctx.lineTo(x+sx*b,y); ctx.stroke();
    });
  }

  // â”€â”€â”€ Text labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ Public: buildFace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    ctx.fillText('â—ˆ', 128, 210);
    return c;
  }

  return { buildFace, buildBack, isAnimated, getCfg };
})();
