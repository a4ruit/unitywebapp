// cards3d.js — Three.js 3D card reveal with animated texture support
// Depends on: cardTextures.js
// Exposes: Cards3D.showCard(card, containerId, onComplete), Cards3D.destroy()

const Cards3D = (() => {

  let renderer, scene, camera, cardMesh;
  let animFrame;
  let isFlipping     = false;
  let flipProgress   = 0;
  let flipDone       = false;
  let onFlipComplete = null;
  let rarityLight    = null;
  let idleT          = 0;
  let startTime      = 0;
  let currentCard    = null;
  let faceCanvas     = null;
  let faceTex        = null;
  let animated       = false;

  function init(containerId) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    destroy();

    const W = wrap.clientWidth  || 216;
    const H = wrap.clientHeight || 296;

    renderer = new THREE.WebGLRenderer({ antialias:false, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    wrap.innerHTML = '';
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'display:block;width:100%!important;height:100%!important;image-rendering:pixelated;';

    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, W/H, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    scene.add(new THREE.AmbientLight(0x1a2a1a, 0.9));
    const front = new THREE.DirectionalLight(0xffffff, 0.4);
    front.position.set(0,0,5); scene.add(front);
    const top = new THREE.DirectionalLight(0x3aaa3a, 0.3);
    top.position.set(0,4,2); scene.add(top);

    animate();
  }

  function showCard(card, containerId, callback) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    if (!renderer) init(containerId);

    if (cardMesh) {
      scene.remove(cardMesh);
      cardMesh.geometry?.dispose();
      cardMesh.material?.forEach?.(m => m.dispose());
      cardMesh = null;
    }
    if (rarityLight) { scene.remove(rarityLight); rarityLight = null; }

    currentCard = card;
    animated    = CardTextures.isAnimated(card.rarity);
    startTime   = performance.now() / 1000;

    const cfg = CardTextures.getCfg(card.rarity);

    if (cfg.light) {
      rarityLight = new THREE.PointLight(cfg.light.color, cfg.light.intensity, cfg.light.dist);
      rarityLight.position.set(0,0,2);
      scene.add(rarityLight);
    }

    faceCanvas = document.createElement('canvas');
    faceCanvas.width = 256; faceCanvas.height = 384;
    CardTextures.buildFace(card, faceCanvas, 0);
    faceTex = new THREE.CanvasTexture(faceCanvas);

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

    cardMesh = new THREE.Mesh(geo, [edgeMat,edgeMat,edgeMat,edgeMat,frontMat,backMat]);
    cardMesh.rotation.y = Math.PI;
    scene.add(cardMesh);

    isFlipping     = true;
    flipProgress   = 0;
    flipDone       = false;
    onFlipComplete = callback || null;
    idleT          = 0;
  }

  function animate() {
    animFrame = requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;

    idleT += 0.014;
    const t = performance.now() / 1000 - startTime;

    if (isFlipping && cardMesh) {
      flipProgress += 0.032;
      const ease = 1 - Math.pow(1 - Math.min(flipProgress,1), 3);
      cardMesh.rotation.y = Math.PI * (1 - ease);
      cardMesh.position.y = Math.sin(Math.min(flipProgress,1) * Math.PI) * 0.15;

      if (animated && faceCanvas && faceTex && currentCard && flipProgress > 0.5) {
        CardTextures.buildFace(currentCard, faceCanvas, t);
        faceTex.needsUpdate = true;
      }

      if (flipProgress >= 1 && !flipDone) {
        flipDone = true; isFlipping = false;
        if (onFlipComplete) { onFlipComplete(); onFlipComplete = null; }
      }

    } else if (cardMesh && !isFlipping) {
      if (animated && faceCanvas && faceTex && currentCard) {
        CardTextures.buildFace(currentCard, faceCanvas, t);
        faceTex.needsUpdate = true;
      }
      cardMesh.rotation.y = lerp(cardMesh.rotation.y, Math.sin(idleT*0.6)*0.04, 0.05);
      cardMesh.rotation.x = lerp(cardMesh.rotation.x, Math.cos(idleT*0.4)*0.02, 0.05);
      cardMesh.position.y = lerp(cardMesh.position.y, Math.sin(idleT*0.8)*0.03, 0.08);
    }

    if (rarityLight && !isFlipping) {
      const rarity = currentCard?.rarity;
      if (rarity === 'legendary-alpha') {
        rarityLight.intensity = 4.0 + Math.sin(t*3)*1.5;
        rarityLight.color.setHSL((t*0.1)%1, 1, 0.7);
      } else if (rarity === 'luck-maxxing') {
        rarityLight.intensity = 3.2 + Math.sin(t*2.5)*1.0;
      } else if (rarity === 'mythical') {
        rarityLight.intensity = 3.0 + Math.sin(t*3.5)*1.2;
      } else if (rarity === 'legendary') {
        rarityLight.intensity = 2.5 + Math.sin(idleT*2)*0.8;
      } else if (rarity === 'rare') {
        rarityLight.intensity = 1.8 + Math.sin(idleT*1.4)*0.4;
      }
    }

    renderer.render(scene, camera);
  }

  function lerp(a,b,t) { return a+(b-a)*t; }

  function destroy() {
    cancelAnimationFrame(animFrame); animFrame = null;
    if (cardMesh) {
      scene?.remove(cardMesh);
      cardMesh.geometry?.dispose();
      cardMesh.material?.forEach?.(m => m.dispose());
      cardMesh = null;
    }
    if (rarityLight) { scene?.remove(rarityLight); rarityLight = null; }
    faceTex?.dispose(); faceTex = null; faceCanvas = null;
    renderer?.dispose(); renderer = null;
    scene = null; camera = null; currentCard = null; animated = false;
  }

  return { showCard, destroy };
})();