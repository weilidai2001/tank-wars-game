import * as THREE from '../../vendor/three.module.min.js';
import {
  SUB_GRID, WALL_MAX_HP, CONCRETE_MAX_HP, STEEL_MAX_HP,
} from '../config/constants.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function clamp01(v) {
  return Math.max(0.06, Math.min(0.94, v));
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

    // 9. High-Contrast Steel Caterpillar Tread Texture
    const treadCanvas = makeCanvas(128, 256);
    const tctx = treadCanvas.getContext('2d');
    tctx.fillStyle = '#141619';
    tctx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 32) {
      tctx.fillStyle = '#52606e';
      tctx.fillRect(4, y + 3, 120, 20);
      tctx.fillStyle = '#9aa8b8';
      tctx.fillRect(10, y + 6, 46, 12);
      tctx.fillRect(72, y + 6, 46, 12);
      tctx.fillStyle = '#7b8a99';
      tctx.fillRect(58, y + 2, 12, 22);
    }
    this.baseTreadTex = new THREE.CanvasTexture(treadCanvas);
    this.baseTreadTex.colorSpace = THREE.SRGBColorSpace;
    this.baseTreadTex.wrapS = this.baseTreadTex.wrapT = THREE.RepeatWrapping;
    this.baseTreadTex.repeat.set(1, 2.5);

    // 10. Shared Vehicle PBR Surface Materials (Painted Armor vs Metal vs Rubber vs Optic)
    this.darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x262c34,
      roughness: 0.52,
      metalness: 0.62,
    });
    this.gunSteelMat = new THREE.MeshStandardMaterial({
      color: 0x424c58,
      roughness: 0.34, // Crisp continuous specular highlight along smooth gun barrels!
      metalness: 0.76,
    });
    this.rubberMat = new THREE.MeshStandardMaterial({
      color: 0x16181b,
      roughness: 0.94, // Completely matte rubber tires (Tanks3D standard)
      metalness: 0.04,
    });
    this.stowageMat = new THREE.MeshStandardMaterial({
      color: 0x566041,
      roughness: 0.88,
      metalness: 0.05,
    });

    this.starDecalMat = this._buildStarDecalMat();
    this.fanGrillMat = this._buildFanGrillMat();
  }

  /**
   * Generate a cached national camouflage PBR armor material.
   * Keeps painted armor matte (roughness ~0.68, metalness ~0.12) so bare gun metal
   * and rubber tires read as distinct materials under directional sunlight.
   */
  getCamoArmorMaterial(paletteOrHex, isWhitewash = false) {
    const key = typeof paletteOrHex === 'number'
      ? `hex_${paletteOrHex}_${isWhitewash}`
      : `pal_${paletteOrHex.base}_${paletteOrHex.dark}_${paletteOrHex.light}_${isWhitewash}`;
    if (this._camoCache.has(key)) {
      return this._camoCache.get(key).clone();
    }

    let mainCol;
    let darkPatch;
    let lightPatch;

    if (typeof paletteOrHex === 'number') {
      const baseCol = new THREE.Color(paletteOrHex);
      const hsl = {};
      baseCol.getHSL(hsl);
      mainCol = new THREE.Color().setHSL(hsl.h, Math.min(0.65, hsl.s * 0.78), clamp01(hsl.l * 0.9));
      darkPatch = new THREE.Color().setHSL((hsl.h + 0.03) % 1, Math.min(0.52, hsl.s * 0.65), clamp01(hsl.l * 0.48));
      lightPatch = new THREE.Color().setHSL(hsl.h, Math.min(0.48, hsl.s * 0.55), clamp01(hsl.l * 1.15));
    } else {
      mainCol = new THREE.Color(paletteOrHex.base);
      darkPatch = new THREE.Color(paletteOrHex.dark);
      lightPatch = new THREE.Color(paletteOrHex.light);
    }

    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d');
    ctx.fillStyle = `#${mainCol.getHexString()}`;
    ctx.fillRect(0, 0, 256, 256);

    // Organic 3-tone military camo blotches
    const blobs = [
      [42, 52, 68, 36, 0.4, darkPatch],
      [175, 48, 62, 34, -0.35, lightPatch],
      [118, 132, 78, 40, 0.25, darkPatch],
      [38, 198, 64, 32, -0.2, lightPatch],
      [206, 188, 72, 38, 0.5, darkPatch],
      [125, 228, 55, 28, 0.1, lightPatch],
    ];
    for (const [bx, by, rx, ry, rot, col] of blobs) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot);
      ctx.fillStyle = `#${col.getHexString()}`;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Welded armor seams & subtle edge wear
    ctx.strokeStyle = 'rgba(15, 20, 25, 0.36)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.beginPath();
    ctx.moveTo(0, 128); ctx.lineTo(256, 128);
    ctx.moveTo(128, 0); ctx.lineTo(128, 128);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(226, 232, 240, 0.15)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      const sx = (i * 53 + 17) % 240;
      const sy = (i * 97 + 29) % 240;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ((i % 3) - 1) * 14, sy + 9);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: isWhitewash ? 0.8 : 0.66,
      metalness: isWhitewash ? 0.04 : 0.14,
    });
    this._camoCache.set(key, mat);
    return mat.clone();
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
