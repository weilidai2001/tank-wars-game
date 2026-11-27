import * as THREE from '../../vendor/three.module.min.js';
import {
  SUB_GRID, WALL_MAX_HP, CONCRETE_MAX_HP, STEEL_MAX_HP,
} from '../config/constants.js';
import {
  makePolygonCamoTexture, camoSpecForPalette, camoSpecForHex, applyArmorShader,
  makeTrackRunTexture, makeTrackSideTexture, makeContactShadowTexture,
} from './ArmorSurfaces.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ============================================================================
// Procedural PBR Textures + Bump Maps for Walls, Terrain & National Camo
// Inspired by Tanks3D's material separation (painted armor vs steel vs rubber)
// ============================================================================

function makeBrickTextures(hp) {
  const damage = WALL_MAX_HP - hp;
  const colCanvas = makeCanvas(256, 256);
  const bumpCanvas = makeCanvas(256, 256);
  const ctx = colCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');

  // Mortar base
  ctx.fillStyle = damage >= 3 ? '#261b18' : '#4a3d35';
  ctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#202020';
  bctx.fillRect(0, 0, 256, 256);

  const rows = 8;
  const cols = 4;
  const bh = 256 / rows;
  const bw = 256 / cols;
  const shades = ['#9e4a32', '#b3553a', '#8d3f2a', '#a85036', '#97452e'];

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset;
      const y = r * bh;
      const hash = ((r * 13 + (c + 2) * 29) * 17) % 23;
      if (damage > 0 && hash < damage * 3.6) {
        ctx.fillStyle = '#18100d';
        ctx.fillRect(x + 4, y + 4, bw - 8, bh - 8);
        bctx.fillStyle = '#050505';
        bctx.fillRect(x + 4, y + 4, bw - 8, bh - 8);
        continue;
      }

      ctx.fillStyle = shades[(r * 7 + c * 3 + 10) % shades.length];
      ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      // Warm sunlit top edge & cool bottom recess
      ctx.fillStyle = 'rgba(255, 220, 185, 0.18)';
      ctx.fillRect(x + 3, y + 3, bw - 6, 4);
      ctx.fillStyle = 'rgba(18, 25, 30, 0.28)';
      ctx.fillRect(x + 3, y + bh - 7, bw - 6, 4);

      bctx.fillStyle = '#dcdcdc';
      bctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
    }
  }

  if (damage > 0) {
    // Blast scorch marks
    for (let s = 0; s < damage * 2; s++) {
      const sx = ((s * 83 + 45) % 210) + 22;
      const sy = ((s * 127 + 35) % 210) + 22;
      const rad = 22 + damage * 11;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, rad);
      g.addColorStop(0, `rgba(14, 10, 8, ${0.3 + damage * 0.1})`);
      g.addColorStop(1, 'rgba(14, 10, 8, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
    }

    // Deep masonry cracks in both diffuse & bump
    const crackSeeds = [
      [[30, 10], [78, 68], [62, 128], [108, 195], [95, 248]],
      [[215, 18], [168, 76], [190, 142], [142, 210]],
      [[12, 118], [88, 134], [148, 108], [238, 152]],
      [[122, 8], [136, 92], [104, 168], [158, 246]],
    ];
    for (const [targetCtx, col] of [[ctx, '#0f0a09'], [bctx, '#000000']]) {
      targetCtx.strokeStyle = col;
      targetCtx.lineWidth = 2.2 + damage * 1.1;
      for (let k = 0; k < damage; k++) {
        const pts = crackSeeds[k % crackSeeds.length];
        targetCtx.beginPath();
        targetCtx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) targetCtx.lineTo(pts[i][0], pts[i][1]);
        targetCtx.stroke();
      }
    }
  }

  const map = new THREE.CanvasTexture(colCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

// Tanks3D art assets (assets/textures): photographic masonry for brick walls and
// battlefield grass for open-country arenas. Loaded async; procedural art shows until ready.
const TEXTURE_BASE = new URL('../../assets/textures/', import.meta.url);

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = new URL(file, TEXTURE_BASE).href;
  });
}

/** Repaint one brick damage stage over the masonry photo (same 5-stage damage language). */
function paintMasonryStage(colCanvas, bumpCanvas, hp, img, lumBump) {
  const damage = WALL_MAX_HP - hp;
  const S = colCanvas.width;
  const ctx = colCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(img, 0, 0, S, S);
  bctx.drawImage(lumBump, 0, 0, S, S);
  const k = S / 256;
  ctx.scale(k, k);
  bctx.scale(k, k);

  if (damage >= 3) {
    ctx.fillStyle = 'rgba(28, 18, 14, 0.28)';
    ctx.fillRect(0, 0, 256, 256);
  }
  if (damage > 0) {
    // Blown-out chunks on the same hashed layout as the procedural wall
    const rows = 8;
    const cols = 4;
    const bh = 256 / rows;
    const bw = 256 / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (bw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const hash = ((r * 13 + (c + 2) * 29) * 17) % 23;
        if (hash >= damage * 3.6) continue;
        const x = c * bw + offset;
        const y = r * bh;
        const g = ctx.createRadialGradient(x + bw / 2, y + bh / 2, 2, x + bw / 2, y + bh / 2, bw * 0.62);
        g.addColorStop(0, '#120b09');
        g.addColorStop(0.7, 'rgba(24, 15, 12, 0.92)');
        g.addColorStop(1, 'rgba(24, 15, 12, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 6, y - 4, bw + 12, bh + 8);
        bctx.fillStyle = '#050505';
        bctx.fillRect(x + 4, y + 4, bw - 8, bh - 8);
      }
    }
    for (let sIdx = 0; sIdx < damage * 2; sIdx++) {
      const sx = ((sIdx * 83 + 45) % 210) + 22;
      const sy = ((sIdx * 127 + 35) % 210) + 22;
      const rad = 22 + damage * 11;
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, rad);
      g.addColorStop(0, `rgba(14, 10, 8, ${0.3 + damage * 0.1})`);
      g.addColorStop(1, 'rgba(14, 10, 8, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
    }
    const crackSeeds = [
      [[30, 10], [78, 68], [62, 128], [108, 195], [95, 248]],
      [[215, 18], [168, 76], [190, 142], [142, 210]],
      [[12, 118], [88, 134], [148, 108], [238, 152]],
      [[122, 8], [136, 92], [104, 168], [158, 246]],
    ];
    for (const [targetCtx, col] of [[ctx, '#0f0a09'], [bctx, '#000000']]) {
      targetCtx.strokeStyle = col;
      targetCtx.lineWidth = 1.6 + damage * 0.9;
      for (let kk = 0; kk < damage; kk++) {
        const pts = crackSeeds[kk % crackSeeds.length];
        targetCtx.beginPath();
        targetCtx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) targetCtx.lineTo(pts[i][0], pts[i][1]);
        targetCtx.stroke();
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Height map from the masonry photo: mortar (light) recessed, brick faces raised. */
function masonryBumpFromImage(img, size) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // Bricks are darker/redder than the tan mortar: invert and stretch
    const v = Math.max(0, Math.min(255, (190 - lum) * 2.2 + 110));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

function makeConcreteTextures(hp) {
  const damage = CONCRETE_MAX_HP - hp;
  const colCanvas = makeCanvas(256, 256);
  const bumpCanvas = makeCanvas(256, 256);
  const ctx = colCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');

  ctx.fillStyle = damage >= 2 ? '#6e757a' : '#8d9499';
  ctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#b0b0b0';
  bctx.fillRect(0, 0, 256, 256);

  // Aggregate pitting & formwork seams
  for (let i = 0; i < 650; i++) {
    const x = (i * 73 + 11) % 256;
    const y = (i * 139 + 23) % 256;
    const dark = i % 2 === 0;
    ctx.fillStyle = dark ? 'rgba(20, 26, 32, 0.14)' : 'rgba(240, 245, 250, 0.12)';
    ctx.fillRect(x, y, 3, 3);
    bctx.fillStyle = dark ? '#808080' : '#d8d8d8';
    bctx.fillRect(x, y, 3, 3);
  }

  // Horizontal precast slab seams & tie-rod holes
  ctx.strokeStyle = 'rgba(30, 38, 46, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 248);
  ctx.beginPath();
  ctx.moveTo(0, 128); ctx.lineTo(256, 128);
  ctx.stroke();

  bctx.strokeStyle = '#303030';
  bctx.lineWidth = 5;
  bctx.strokeRect(4, 4, 248, 248);
  bctx.beginPath();
  bctx.moveTo(0, 128); bctx.lineTo(256, 128);
  bctx.stroke();

  for (const [rx, ry] of [[42, 42], [214, 42], [42, 214], [214, 214]]) {
    ctx.fillStyle = '#3c434a';
    ctx.beginPath(); ctx.arc(rx, ry, 7, 0, Math.PI * 2); ctx.fill();
    bctx.fillStyle = '#151515';
    bctx.beginPath(); bctx.arc(rx, ry, 7, 0, Math.PI * 2); bctx.fill();
  }

  // Exposed dark-rust rebar & spalling when damaged
  if (damage > 0) {
    ctx.fillStyle = '#2f353b';
    ctx.fillRect(58, 76, 86, 52 + damage * 22);
    ctx.strokeStyle = '#7c3f24';
    ctx.lineWidth = 4;
    for (let x = 68; x <= 132; x += 20) {
      ctx.beginPath(); ctx.moveTo(x, 76); ctx.lineTo(x, 128 + damage * 22); ctx.stroke();
    }
    ctx.strokeStyle = '#14181c';
    ctx.lineWidth = 3 + damage;
    ctx.beginPath();
    ctx.moveTo(20, 30); ctx.lineTo(95, 110); ctx.lineTo(65, 225);
    ctx.moveTo(150, 18); ctx.lineTo(132, 130); ctx.lineTo(220, 210);
    ctx.stroke();

    bctx.fillStyle = '#101010';
    bctx.fillRect(58, 76, 86, 52 + damage * 22);
  }

  const map = new THREE.CanvasTexture(colCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  return { map, bumpMap };
}

function makeSteelTextures(hp, permanent = false) {
  const damage = permanent ? 0 : STEEL_MAX_HP - hp;
  const colCanvas = makeCanvas(256, 256);
  const bumpCanvas = makeCanvas(256, 256);
  const ctx = colCanvas.getContext('2d');
  const bctx = bumpCanvas.getContext('2d');

  // Cool blue-gray armored steel (Tanks3D palette: #466d7c .. #b0c0b6)
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, damage >= 2 ? '#3b515e' : '#537382');
  grad.addColorStop(0.5, damage >= 2 ? '#617a87' : '#8ba5b2');
  grad.addColorStop(1, '#314450');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  bctx.fillStyle = '#909090';
  bctx.fillRect(0, 0, 256, 256);

  // Outer chamfered rim (pale gold for permanent bastion steel, bright rim for standard)
  ctx.strokeStyle = permanent ? '#eab308' : '#b8cbd4';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 240);
  bctx.strokeStyle = '#ffffff';
  bctx.lineWidth = 10;
  bctx.strokeRect(8, 8, 240, 240);

  // Raised diagonal X reinforcement ribs (signature readability from Tanks3D!)
  ctx.strokeStyle = permanent ? '#fde047' : '#c6d6de';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(26, 26); ctx.lineTo(230, 230);
  ctx.moveTo(230, 26); ctx.lineTo(26, 230);
  ctx.stroke();

  bctx.strokeStyle = '#f0f0f0';
  bctx.lineWidth = 12;
  bctx.beginPath();
  bctx.moveTo(26, 26); bctx.lineTo(230, 230);
  bctx.moveTo(230, 26); bctx.lineTo(26, 230);
  bctx.stroke();

  // Corner rivets
  const rivets = [[30, 30], [226, 30], [30, 226], [226, 226], [128, 30], [128, 226], [30, 128], [226, 128]];
  for (let i = 0; i < rivets.length; i++) {
    if (damage > 0 && (i * 3) % 4 < damage) continue;
    const [rx, ry] = rivets[i];
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.arc(rx + 2, ry + 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = permanent ? '#fef08a' : '#e2e8f0';
    ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.fill();
    bctx.fillStyle = '#ffffff';
    bctx.beginPath(); bctx.arc(rx, ry, 6, 0, Math.PI * 2); bctx.fill();
  }

  if (damage > 0) {
    ctx.strokeStyle = hp <= 2 ? '#38bdf8' : '#0f172a';
    ctx.lineWidth = 4 + damage * 1.4;
    for (let k = 0; k < damage; k++) {
      ctx.beginPath();
      ctx.moveTo(30 + k * 54, 20);
      ctx.lineTo(100 + k * 28, 130);
      ctx.lineTo(64 + k * 42, 236);
      ctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(colCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  return { map, bumpMap };
}

export class MaterialLibrary {
  constructor() {
    this._camoCache = new Map();
    this._initMaterials();
  }

  _initMaterials() {
    // 1. Progressive 5-stage Brick PBR Materials with Bump Maps
    this.brickStages = [null];
    for (let hp = 1; hp <= WALL_MAX_HP; hp++) {
      const { map, bumpMap } = makeBrickTextures(hp);
      this.brickStages[hp] = new THREE.MeshStandardMaterial({
        map,
        bumpMap,
        bumpScale: 0.14,
        roughness: 0.86 + (WALL_MAX_HP - hp) * 0.025,
        metalness: 0.04,
      });
    }
    this.brick = this.brickStages[WALL_MAX_HP];

    // 2. Progressive 3-stage Reinforced Concrete PBR Materials
    this.concreteStages = [null];
    for (let hp = 1; hp <= CONCRETE_MAX_HP; hp++) {
      const { map, bumpMap } = makeConcreteTextures(hp);
      this.concreteStages[hp] = new THREE.MeshStandardMaterial({
        map,
        bumpMap,
        bumpScale: 0.16,
        roughness: 0.9,
        metalness: 0.06,
      });
    }
    this.concrete = this.concreteStages[CONCRETE_MAX_HP];

    // 3. Progressive 4-stage Steel + Permanent Bastion Steel
    this.steelStages = [null];
    for (let hp = 1; hp <= STEEL_MAX_HP; hp++) {
      const { map, bumpMap } = makeSteelTextures(hp, false);
      this.steelStages[hp] = new THREE.MeshStandardMaterial({
        map,
        bumpMap,
        bumpScale: 0.12,
        roughness: 0.42 + (STEEL_MAX_HP - hp) * 0.08,
        metalness: Math.max(0.4, 0.62 - (STEEL_MAX_HP - hp) * 0.06),
      });
    }
    this.steel = this.steelStages[STEEL_MAX_HP];

    const permTex = makeSteelTextures(STEEL_MAX_HP, true);
    this.permSteel = new THREE.MeshStandardMaterial({
      map: permTex.map,
      bumpMap: permTex.bumpMap,
      bumpScale: 0.14,
      roughness: 0.36,
      metalness: 0.68,
    });

    // Rubble & Slag materials
    this.rubbleMat = new THREE.MeshStandardMaterial({ color: 0x4b352c, roughness: 0.95, metalness: 0.03 });
    this.concreteRubbleMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.94, metalness: 0.05 });
    this.slagMat = new THREE.MeshStandardMaterial({ color: 0x3b4d5a, roughness: 0.62, metalness: 0.55 });
    this.rebarMat = new THREE.MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.72, metalness: 0.65 });

    // 4. Asphalt Tactical Ground Grid
    const groundCanvas = makeCanvas(256, 256);
    const gctx = groundCanvas.getContext('2d');
    gctx.fillStyle = '#252c35';
    gctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const gx = (i * 73) % 256;
      const gy = (i * 137) % 256;
      gctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)';
      gctx.fillRect(gx, gy, 3, 3);
    }
    gctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    gctx.lineWidth = 3;
    gctx.strokeRect(0, 0, 256, 256);
    gctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    gctx.lineWidth = 2;
    gctx.beginPath();
    gctx.moveTo(128, 0); gctx.lineTo(128, 256);
    gctx.moveTo(0, 128); gctx.lineTo(256, 128);
    gctx.stroke();

    const groundTex = new THREE.CanvasTexture(groundCanvas);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(SUB_GRID / 2, SUB_GRID / 2);

    this.ground = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.92,
      metalness: 0.04,
    });

    // 5. Water Texture (deep blue + crisp ripples)
    const waterCanvas = makeCanvas(128, 128);
    const wctx = waterCanvas.getContext('2d');
    wctx.fillStyle = '#0369a1';
    wctx.fillRect(0, 0, 128, 128);
    wctx.strokeStyle = 'rgba(186, 230, 253, 0.52)';
    wctx.lineWidth = 3;
    for (let y = 16; y < 128; y += 32) {
      wctx.beginPath();
      for (let x = 0; x <= 128; x += 16) {
        const wy = y + Math.sin((x / 128) * Math.PI * 2) * 5;
        if (x === 0) wctx.moveTo(x, wy);
        else wctx.lineTo(x, wy);
      }
      wctx.stroke();
    }
    this.waterTex = new THREE.CanvasTexture(waterCanvas);
    this.waterTex.colorSpace = THREE.SRGBColorSpace;
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.RepeatWrapping;

    this.water = new THREE.MeshStandardMaterial({
      map: this.waterTex,
      roughness: 0.18,
      metalness: 0.2,
      emissive: new THREE.Color(0x022c44),
      emissiveIntensity: 0.45,
    });
    this.waterBank = new THREE.MeshStandardMaterial({
      color: 0x3a4d57,
      roughness: 0.88,
      metalness: 0.08,
    });

    // 6. Ice Texture (Tanks3D cyan slab + diagonal specular bands)
    const iceCanvas = makeCanvas(128, 128);
    const ictx = iceCanvas.getContext('2d');
    const igrad = ictx.createLinearGradient(0, 0, 128, 128);
    igrad.addColorStop(0, '#bae6fd');
    igrad.addColorStop(0.5, '#83c5de');
    igrad.addColorStop(1, '#9fc9cf');
    ictx.fillStyle = igrad;
    ictx.fillRect(0, 0, 128, 128);
    ictx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ictx.lineWidth = 3;
    ictx.beginPath();
    ictx.moveTo(8, 34); ictx.lineTo(114, 96);
    ictx.moveTo(26, 118); ictx.lineTo(98, 16);
    ictx.stroke();
    const iceTex = new THREE.CanvasTexture(iceCanvas);
    iceTex.colorSpace = THREE.SRGBColorSpace;

    this.ice = new THREE.MeshStandardMaterial({
      map: iceTex,
      roughness: 0.12,
      metalness: 0.24,
    });

    // 7. Perimeter Bastion Hazard Texture
    const perimCanvas = makeCanvas(256, 256);
    const pctx = perimCanvas.getContext('2d');
    pctx.fillStyle = '#253242';
    pctx.fillRect(0, 0, 256, 256);
    pctx.fillStyle = '#0f172a';
    pctx.fillRect(0, 196, 256, 60);
    pctx.fillStyle = '#eab308';
    for (let x = -64; x < 320; x += 48) {
      pctx.beginPath();
      pctx.moveTo(x, 256);
      pctx.lineTo(x + 24, 256);
      pctx.lineTo(x + 52, 196);
      pctx.lineTo(x + 28, 196);
      pctx.closePath();
      pctx.fill();
    }
    const perimTex = new THREE.CanvasTexture(perimCanvas);
    perimTex.colorSpace = THREE.SRGBColorSpace;
    perimTex.wrapS = perimTex.wrapT = THREE.RepeatWrapping;
    perimTex.repeat.set(16, 1);

    this.perimeter = new THREE.MeshStandardMaterial({
      map: perimTex,
      roughness: 0.68,
      metalness: 0.32,
    });

    // 8. Foliage & Trunks (translucent cover, alpha ~0.76)
    this.foliageDark = new THREE.MeshStandardMaterial({
      color: 0x1b5e36,
      roughness: 0.88,
      transparent: true,
      opacity: 0.78,
    });
    this.foliageLight = new THREE.MeshStandardMaterial({
      color: 0x2d8a4e,
      roughness: 0.84,
      transparent: true,
      opacity: 0.74,
    });
    this.trunk = new THREE.MeshStandardMaterial({
      color: 0x624229,
      roughness: 0.92,
    });

    // 9. Running gear textures: steel shoes + rubber pads (top run) and link side plates
    this.trackRunTex = makeTrackRunTexture();
    this.trackRunTex.repeat.set(1, 3.2);
    this.trackSideTex = makeTrackSideTexture();
    this.trackSideTex.repeat.set(3.2, 1);
    this.trackWrapTex = makeTrackSideTexture();
    this.trackWrapTex.repeat.set(2, 1);

    // 10. Shared vehicle surfaces — three distinct responses (Tanks3D art pass):
    //     painted armor (matte), bare metal (half-metallic, smooth highlights), rubber (dead matte).
    this.darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x353d3f,
      roughness: 0.55,
      metalness: 0.5,
      envMapIntensity: 0.7,
    });
    this.gunSteelMat = new THREE.MeshStandardMaterial({
      color: 0x8a9692,
      roughness: 0.34, // smooth tube: one continuous specular streak along the barrel
      metalness: 0.62,
      envMapIntensity: 1.1,
    });
    this.trackSteelMat = new THREE.MeshStandardMaterial({
      color: 0x697575,
      roughness: 0.5,
      metalness: 0.45,
      envMapIntensity: 0.8,
    });
    this.rubberMat = new THREE.MeshStandardMaterial({
      color: 0x1f2729,
      roughness: 1.0, // rubber never mirrors the sky
      metalness: 0.0,
      envMapIntensity: 0.08,
    });
    this.boreMat = new THREE.MeshBasicMaterial({ color: 0x0b1214 });
    this.lensMat = new THREE.MeshStandardMaterial({
      color: 0xf5e5a6,
      emissive: 0xf5e5a6,
      emissiveIntensity: 0.55,
      roughness: 0.22,
      metalness: 0.0,
      envMapIntensity: 1.4,
    });
    this.stowageMat = new THREE.MeshStandardMaterial({
      color: 0x5b6142,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.15,
    });

    this.contactShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: makeContactShadowTexture(),
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // Battlefield grass ground for open-country arenas (Tanks3D: albedo #aab39e x grass, roughness 1)
    const grassCanvas = makeCanvas(512, 512);
    const grctx = grassCanvas.getContext('2d');
    grctx.fillStyle = '#56603a';
    grctx.fillRect(0, 0, 512, 512);
    this.grassCanvas = grassCanvas;
    const grassTex = new THREE.CanvasTexture(grassCanvas);
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(SUB_GRID / 2, SUB_GRID / 2);
    grassTex.anisotropy = 4;
    this.grassGround = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0xb4bca6,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });

    this._loadArtTextures();

    this.starDecalMat = this._buildStarDecalMat();
    this.fanGrillMat = this._buildFanGrillMat();
    this._paintCache = new Map();
  }

  _loadArtTextures() {
    if (typeof Image === 'undefined') return;
    loadImage('battlefield_grass.jpg').then((img) => {
      const ctx = this.grassCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 512, 512);
      // Keep a faint tactical cell grid so positions stay readable (2 cells per tile)
      ctx.strokeStyle = 'rgba(24, 30, 18, 0.22)';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(24, 30, 18, 0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(256, 0); ctx.lineTo(256, 512);
      ctx.moveTo(0, 256); ctx.lineTo(512, 256);
      ctx.stroke();
      this.grassGround.map.needsUpdate = true;
    }).catch(() => {});

    loadImage('urban_masonry.jpg').then((img) => {
      const size = 512;
      const lumBump = masonryBumpFromImage(img, size);
      for (let hp = 1; hp <= WALL_MAX_HP; hp++) {
        const mat = this.brickStages[hp];
        const col = makeCanvas(size, size);
        const bump = makeCanvas(size, size);
        paintMasonryStage(col, bump, hp, img, lumBump);
        const map = new THREE.CanvasTexture(col);
        map.colorSpace = THREE.SRGBColorSpace;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.anisotropy = 4;
        const bumpMap = new THREE.CanvasTexture(bump);
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
        const oldMap = mat.map;
        const oldBump = mat.bumpMap;
        mat.map = map;
        mat.bumpMap = bumpMap;
        mat.bumpScale = 0.09;
        mat.needsUpdate = true;
        oldMap.dispose();
        oldBump.dispose();
      }
    }).catch(() => {});
  }

  /** Per-rig track materials (cloned textures so each side's links can scroll independently). */
  createTrackMaterials() {
    const run = this.trackRunTex.clone();
    const side = this.trackSideTex.clone();
    const wrap = this.trackWrapTex.clone();
    const params = { roughness: 0.78, metalness: 0.32, envMapIntensity: 0.55 };
    return {
      runTex: run,
      sideTex: side,
      wrapTex: wrap,
      runMat: new THREE.MeshStandardMaterial({ map: run, ...params }),
      sideMat: new THREE.MeshStandardMaterial({ map: side, ...params }),
      wrapMat: new THREE.MeshStandardMaterial({ map: wrap, ...params }),
    };
  }

  /** Plain (un-camouflaged) painted armor for wheel hubs, hatches and small castings. */
  getPaintMaterial(hex, isWhitewash = false) {
    const key = `${hex}_${isWhitewash}`;
    if (!this._paintCache.has(key)) {
      this._paintCache.set(key, new THREE.MeshStandardMaterial({
        color: hex,
        roughness: isWhitewash ? 0.8 : 0.66,
        metalness: 0.0,
        envMapIntensity: 0.45,
      }));
    }
    return this._paintCache.get(key);
  }

  /**
   * National polygon-camouflage armor material (per-tank clone, triplanar-mapped).
   * Painted armor stays matte and non-metallic (roughness 0.66, whitewash 0.8) so bare
   * gun metal and rubber tyres read as different materials under the same sun.
   */
  getCamoArmorMaterial(paletteOrHex, isWhitewash = false) {
    const key = typeof paletteOrHex === 'number'
      ? `hex_${paletteOrHex}_${isWhitewash}`
      : `pal_${paletteOrHex.base}_${paletteOrHex.dark}_${paletteOrHex.light}_${isWhitewash}`;
    let proto = this._camoCache.get(key);
    if (!proto) {
      const spec = typeof paletteOrHex === 'number'
        ? camoSpecForHex(paletteOrHex)
        : camoSpecForPalette(paletteOrHex, isWhitewash);
      proto = new THREE.MeshStandardMaterial({
        map: makePolygonCamoTexture(spec),
        roughness: isWhitewash ? 0.8 : 0.66,
        metalness: 0.0,
        envMapIntensity: isWhitewash ? 0.32 : 0.45,
      });
      this._camoCache.set(key, proto);
    }
    // onBeforeCompile is not carried by clone(), so patch every instance.
    return applyArmorShader(proto.clone());
  }

  _buildStarDecalMat() {
    const c = makeCanvas(128, 128);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 36 : 15;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  }

  _buildFanGrillMat() {
    const c = makeCanvas(128, 128);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#11161d';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52);
      ctx.stroke();
    }
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 64, 28, 0, Math.PI * 2);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.5 });
  }
}
