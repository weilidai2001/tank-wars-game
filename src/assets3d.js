import * as THREE from '../vendor/three.module.min.js';
import {
  SUB_GRID, CELL_SIZE, WORLD_SIZE, TILE,
  WALL_HEIGHT_BRICK, WALL_HEIGHT_STEEL, PERIMETER_HEIGHT, WALL_MAX_HP,
  POWERUP_INFO,
} from './constants.js';
import { subToWorld } from './arenas.js';

// ============================================================================
// Procedural Canvas Textures (including 5 progressive wall-damage stages!)
// ============================================================================
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeBrickStageTexture(hp) {
  const damage = WALL_MAX_HP - hp; // 0 (pristine) .. 4 (critical 1-HP rubble)
  const brickCanvas = makeCanvas(256, 256);
  const bctx = brickCanvas.getContext('2d');
  bctx.fillStyle = damage >= 3 ? '#231815' : '#3b2c28';
  bctx.fillRect(0, 0, 256, 256);

  const rows = 8;
  const cols = 4;
  const bh = 256 / rows;
  const bw = 256 / cols;
  const shades = ['#9e422b', '#b34d34', '#8b3723', '#a8472e', '#943c27'];

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + offset;
      const y = r * bh;
      const hash = ((r * 13 + (c + 2) * 29) * 17) % 23;
      const missingThreshold = damage * 3.8;
      if (damage > 0 && hash < missingThreshold) {
        bctx.fillStyle = '#140d0b';
        bctx.fillRect(x + 4, y + 4, bw - 8, bh - 8);
        continue;
      }

      bctx.fillStyle = shades[(r * 7 + c * 3 + 10) % shades.length];
      bctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      bctx.fillStyle = 'rgba(255, 200, 170, 0.16)';
      bctx.fillRect(x + 3, y + 3, bw - 6, 4);
      bctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      bctx.fillRect(x + 3, y + bh - 7, bw - 6, 4);
    }
  }

  if (damage > 0) {
    for (let s = 0; s < damage * 2; s++) {
      const sx = ((s * 83 + 45) % 210) + 22;
      const sy = ((s * 127 + 35) % 210) + 22;
      const rad = 22 + damage * 11;
      const g = bctx.createRadialGradient(sx, sy, 2, sx, sy, rad);
      g.addColorStop(0, `rgba(12, 8, 7, ${0.28 + damage * 0.1})`);
      g.addColorStop(1, 'rgba(12, 8, 7, 0)');
      bctx.fillStyle = g;
      bctx.fillRect(sx - rad, sy - rad, rad * 2, rad * 2);
    }

    bctx.strokeStyle = '#0e0908';
    bctx.lineWidth = 2 + damage * 1.1;
    const crackSeeds = [
      [[30, 10], [78, 68], [62, 128], [108, 195], [95, 248]],
      [[215, 18], [168, 76], [190, 142], [142, 210]],
      [[12, 118], [88, 134], [148, 108], [238, 152]],
      [[122, 8], [136, 92], [104, 168], [158, 246]],
    ];
    for (let k = 0; k < damage; k++) {
      const pts = crackSeeds[k % crackSeeds.length];
      bctx.beginPath();
      bctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        bctx.lineTo(pts[i][0], pts[i][1]);
      }
      bctx.stroke();
    }

    if (hp === 1) {
      bctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
      bctx.lineWidth = 2;
      bctx.strokeRect(10, 10, 236, 236);
    }
  }

  const tex = new THREE.CanvasTexture(brickCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function makeSteelStageTexture(hp) {
  const damage = WALL_MAX_HP - hp;
  const steelCanvas = makeCanvas(256, 256);
  const sctx = steelCanvas.getContext('2d');
  const grad = sctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, damage >= 3 ? '#475569' : '#788899');
  grad.addColorStop(0.5, damage >= 2 ? '#64748b' : '#a8b8c8');
  grad.addColorStop(1, '#334155');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 256, 256);

  sctx.strokeStyle = '#334155';
  sctx.lineWidth = 8;
  sctx.strokeRect(6, 6, 244, 244);
  sctx.strokeStyle = '#cbd5e1';
  sctx.lineWidth = 3;
  sctx.strokeRect(14, 14, 228, 228);

  sctx.strokeStyle = '#475569';
  sctx.lineWidth = 4;
  sctx.beginPath();
  sctx.moveTo(128, 14); sctx.lineTo(128, 242);
  sctx.moveTo(14, 128); sctx.lineTo(242, 128);
  sctx.stroke();

  const rivets = [
    [28, 28], [108, 28], [148, 28], [228, 28],
    [28, 108], [228, 108], [28, 148], [228, 148],
    [28, 228], [108, 228], [148, 228], [228, 228],
  ];
  for (let i = 0; i < rivets.length; i++) {
    if (damage > 0 && (i * 5) % 4 < damage) continue;
    const [rx, ry] = rivets[i];
    sctx.fillStyle = '#1e293b';
    sctx.beginPath(); sctx.arc(rx + 2, ry + 2, 6, 0, Math.PI * 2); sctx.fill();
    sctx.fillStyle = '#e2e8f0';
    sctx.beginPath(); sctx.arc(rx, ry, 5.5, 0, Math.PI * 2); sctx.fill();
  }

  if (damage > 0) {
    sctx.strokeStyle = hp <= 2 ? '#38bdf8' : '#0f172a';
    sctx.lineWidth = 3 + damage;
    for (let k = 0; k < damage; k++) {
      sctx.beginPath();
      sctx.moveTo(24 + k * 48, 22);
      sctx.lineTo(96 + k * 32, 132);
      sctx.lineTo(54 + k * 45, 234);
      sctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(steelCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createProceduralMaterials() {
  const brickStages = [null];
  const steelStages = [null];
  for (let hp = 1; hp <= WALL_MAX_HP; hp++) {
    brickStages[hp] = new THREE.MeshStandardMaterial({
      map: makeBrickStageTexture(hp),
      roughness: 0.85 + (WALL_MAX_HP - hp) * 0.03,
      metalness: 0.06,
    });
    steelStages[hp] = new THREE.MeshStandardMaterial({
      map: makeSteelStageTexture(hp),
      roughness: 0.32 + (WALL_MAX_HP - hp) * 0.1,
      metalness: Math.max(0.35, 0.78 - (WALL_MAX_HP - hp) * 0.08),
    });
  }

  // 3. Asphalt Tactical Ground Grid Texture
  const groundCanvas = makeCanvas(256, 256);
  const gctx = groundCanvas.getContext('2d');
  gctx.fillStyle = '#1e242c';
  gctx.fillRect(0, 0, 256, 256);
  // Subtle aggregate speckle
  for (let i = 0; i < 900; i++) {
    const gx = (i * 73) % 256;
    const gy = (i * 137) % 256;
    gctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    gctx.fillRect(gx, gy, 3, 3);
  }
  // Sub-cell border + macro-tile accent line
  gctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  gctx.lineWidth = 3;
  gctx.strokeRect(0, 0, 256, 256);
  gctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  gctx.lineWidth = 2;
  gctx.beginPath();
  gctx.moveTo(128, 0);
  gctx.lineTo(128, 256);
  gctx.moveTo(0, 128);
  gctx.lineTo(256, 128);
  gctx.stroke();

  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(SUB_GRID / 2, SUB_GRID / 2);

  // 4. Water Texture
  const waterCanvas = makeCanvas(128, 128);
  const wctx = waterCanvas.getContext('2d');
  wctx.fillStyle = '#0369a1';
  wctx.fillRect(0, 0, 128, 128);
  wctx.strokeStyle = 'rgba(125, 211, 252, 0.45)';
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
  const waterTex = new THREE.CanvasTexture(waterCanvas);
  waterTex.colorSpace = THREE.SRGBColorSpace;
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;

  // 5. Ice Texture
  const iceCanvas = makeCanvas(128, 128);
  const ictx = iceCanvas.getContext('2d');
  const igrad = ictx.createLinearGradient(0, 0, 128, 128);
  igrad.addColorStop(0, '#bae6fd');
  igrad.addColorStop(0.5, '#7dd3fc');
  igrad.addColorStop(1, '#93c5fd');
  ictx.fillStyle = igrad;
  ictx.fillRect(0, 0, 128, 128);
  ictx.strokeStyle = 'rgba(255,255,255,0.6)';
  ictx.lineWidth = 2;
  ictx.beginPath();
  ictx.moveTo(10, 30); ictx.lineTo(110, 95);
  ictx.moveTo(25, 115); ictx.lineTo(95, 20);
  ictx.stroke();
  const iceTex = new THREE.CanvasTexture(iceCanvas);
  iceTex.colorSpace = THREE.SRGBColorSpace;

  // 6. Perimeter Bastion Hazard Texture
  const perimCanvas = makeCanvas(256, 256);
  const pctx = perimCanvas.getContext('2d');
  pctx.fillStyle = '#1e293b';
  pctx.fillRect(0, 0, 256, 256);
  // Bottom yellow-black hazard stripe band
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

  // 7. High-Contrast Segmented Steel Caterpillar Tread Texture
  const treadCanvas = makeCanvas(128, 256);
  const tctx = treadCanvas.getContext('2d');
  tctx.fillStyle = '#141619';
  tctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 32) {
    // Raised steel cleat bar
    tctx.fillStyle = '#64748b';
    tctx.fillRect(4, y + 3, 120, 20);
    // Bright metallic cleat teeth (left & right pads)
    tctx.fillStyle = '#cbd5e1';
    tctx.fillRect(10, y + 6, 46, 12);
    tctx.fillRect(72, y + 6, 46, 12);
    // Center guide tooth
    tctx.fillStyle = '#94a3b8';
    tctx.fillRect(58, y + 2, 12, 22);
  }
  const baseTreadTex = new THREE.CanvasTexture(treadCanvas);
  baseTreadTex.colorSpace = THREE.SRGBColorSpace;
  baseTreadTex.wrapS = baseTreadTex.wrapT = THREE.RepeatWrapping;
  baseTreadTex.repeat.set(1, 2.5);

  return {
    brick: brickStages[WALL_MAX_HP],
    steel: steelStages[WALL_MAX_HP],
    brickStages,
    steelStages,
    rubbleMat: new THREE.MeshStandardMaterial({
      color: 0x3b2822,
      roughness: 0.95,
      metalness: 0.05,
    }),
    slagMat: new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.7,
      metalness: 0.55,
    }),
    ground: new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.92,
      metalness: 0.08,
    }),
    water: new THREE.MeshStandardMaterial({
      map: waterTex,
      roughness: 0.2,
      metalness: 0.25,
      emissive: new THREE.Color(0x022c44),
      emissiveIntensity: 0.5,
    }),
    waterTex,
    ice: new THREE.MeshStandardMaterial({
      map: iceTex,
      roughness: 0.12,
      metalness: 0.3,
    }),
    perimeter: new THREE.MeshStandardMaterial({
      map: perimTex,
      roughness: 0.65,
      metalness: 0.35,
    }),
    foliageDark: new THREE.MeshStandardMaterial({
      color: 0x166534,
      roughness: 0.85,
      transparent: true,
      opacity: 0.84,
    }),
    foliageLight: new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.8,
      transparent: true,
      opacity: 0.82,
    }),
    trunk: new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.9,
    }),
    baseTreadTex,
  };
}

// ============================================================================
// 3D Arena Builder & Dynamic Cell Mesh Manager
// ============================================================================
export class Arena3D {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.cellMeshes = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(null));
    this.eagleGroup = null;
    this.eagleCrest = null;
    this.eagleLight = null;

    // Shared geometries for zero-GC cell & 5-stage progressive wall deterioration updates
    const W = CELL_SIZE * 0.98;
    this.geoBrick = new THREE.BoxGeometry(W, WALL_HEIGHT_BRICK, W);
    this.geoSteel = new THREE.BoxGeometry(W, WALL_HEIGHT_STEEL, W);
    this.wallSubGeos = {
      b4Base: new THREE.BoxGeometry(W, WALL_HEIGHT_BRICK * 0.72, W),
      b4TopA: new THREE.BoxGeometry(W * 0.94, WALL_HEIGHT_BRICK * 0.24, W * 0.54),
      b4TopB: new THREE.BoxGeometry(W * 0.52, WALL_HEIGHT_BRICK * 0.18, W * 0.4),
      b3Base: new THREE.BoxGeometry(W * 0.96, WALL_HEIGHT_BRICK * 0.45, W * 0.96),
      b3PilA: new THREE.BoxGeometry(W * 0.45, WALL_HEIGHT_BRICK * 0.34, W * 0.46),
      b3PilB: new THREE.BoxGeometry(W * 0.42, WALL_HEIGHT_BRICK * 0.23, W * 0.44),
      b2Base: new THREE.BoxGeometry(W * 0.92, WALL_HEIGHT_BRICK * 0.26, W * 0.92),
      b2SlabA: new THREE.BoxGeometry(W * 0.48, WALL_HEIGHT_BRICK * 0.28, W * 0.5),
      b2SlabB: new THREE.BoxGeometry(W * 0.4, WALL_HEIGHT_BRICK * 0.2, W * 0.42),
      b1Stump: new THREE.BoxGeometry(W * 0.78, WALL_HEIGHT_BRICK * 0.18, W * 0.76),
      b1Shard: new THREE.BoxGeometry(W * 0.36, WALL_HEIGHT_BRICK * 0.17, W * 0.36),
      rubble: new THREE.BoxGeometry(0.62, 0.38, 0.52),
    };
    this.geoWater = new THREE.BoxGeometry(CELL_SIZE, 0.3, CELL_SIZE);
    this.geoIce = new THREE.BoxGeometry(CELL_SIZE, 0.08, CELL_SIZE);
    this.geoTrunk = new THREE.CylinderGeometry(0.32, 0.48, 1.8, 7);
    this.geoCone1 = new THREE.ConeGeometry(1.75, 2.5, 7);
    this.geoCone2 = new THREE.ConeGeometry(1.35, 2.1, 7);
  }

  build(grid, template, hasEagle) {
    // Clear previous meshes
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
    for (let r = 0; r < SUB_GRID; r++) {
      for (let c = 0; c < SUB_GRID; c++) {
        this.cellMeshes[r][c] = null;
      }
    }
    this.eagleGroup = null;
    this.eagleCrest = null;
    this.eagleLight = null;

    // Ground plane
    this.mats.ground.color.setHex(0xffffff);
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      this.mats.ground
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    groundMesh.receiveShadow = true;
    this.group.add(groundMesh);

    // Outer surrounding apron
    const apronMat = new THREE.MeshStandardMaterial({
      color: template.groundTint || 0x141820,
      roughness: 0.95,
    });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 3, WORLD_SIZE * 3), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(WORLD_SIZE * 0.5, -0.06, WORLD_SIZE * 0.5);
    this.group.add(apron);

    // Low inner combat boundary curb + set-back Perimeter Bastion Walls (gives camera full breathing room near edges!)
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.4 });
    const curbDefs = [
      { x: WORLD_SIZE * 0.5, z: -0.25, w: WORLD_SIZE + 1, d: 0.5 },
      { x: WORLD_SIZE * 0.5, z: WORLD_SIZE + 0.25, w: WORLD_SIZE + 1, d: 0.5 },
      { x: -0.25, z: WORLD_SIZE * 0.5, w: 0.5, d: WORLD_SIZE },
      { x: WORLD_SIZE + 0.25, z: WORLD_SIZE * 0.5, w: 0.5, d: WORLD_SIZE },
    ];
    for (const cd of curbDefs) {
      const cm = new THREE.Mesh(new THREE.BoxGeometry(cd.w, 0.55, cd.d), curbMat);
      cm.position.set(cd.x, 0.275, cd.z);
      this.group.add(cm);
    }

    const wallThick = 2.5;
    const setback = 4.5;
    const span = WORLD_SIZE + setback * 2 + wallThick * 2;
    const perimDefs = [
      { x: WORLD_SIZE * 0.5, z: -setback - wallThick * 0.5, w: span, d: wallThick },
      { x: WORLD_SIZE * 0.5, z: WORLD_SIZE + setback + wallThick * 0.5, w: span, d: wallThick },
      { x: -setback - wallThick * 0.5, z: WORLD_SIZE * 0.5, w: wallThick, d: span },
      { x: WORLD_SIZE + setback + wallThick * 0.5, z: WORLD_SIZE * 0.5, w: wallThick, d: span },
    ];
    for (const p of perimDefs) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(p.w, PERIMETER_HEIGHT, p.d),
        this.mats.perimeter
      );
      m.position.set(p.x, PERIMETER_HEIGHT * 0.5, p.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }

    // Populate sub-cells
    for (let r = 0; r < SUB_GRID; r++) {
      for (let c = 0; c < SUB_GRID; c++) {
        const t = grid[r][c];
        if (t !== TILE.EMPTY && t !== TILE.EAGLE && t !== TILE.EAGLE_DEAD) {
          this.setCellMesh(c, r, t);
        }
      }
    }

    // Build 3D Golden Eagle Core Monument in Co-op
    if (hasEagle) {
      this.buildEagleMonument(true);
    }
  }

  buildEagleMonument(alive = true) {
    if (this.eagleGroup) {
      this.group.remove(this.eagleGroup);
    }
    const eg = new THREE.Group();
    const cx = 13 * CELL_SIZE; // center of sub-cells 12..13
    const cz = 25 * CELL_SIZE; // center of sub-cells 24..25
    eg.position.set(cx, 0, cz);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.7,
      roughness: 0.35,
    });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.9, 1.1, 8), baseMat);
    ped.position.y = 0.55;
    ped.castShadow = true;
    ped.receiveShadow = true;
    eg.add(ped);

    if (alive) {
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xb45309,
        emissiveIntensity: 0.55,
        metalness: 0.82,
        roughness: 0.2,
      });
      const crest = new THREE.Group();
      crest.position.y = 2.9;

      const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 0), goldMat);
      crest.add(core);

      const wingGeo = new THREE.BoxGeometry(3.8, 0.45, 0.5);
      const wing1 = new THREE.Mesh(wingGeo, goldMat);
      wing1.position.y = 0.25;
      crest.add(wing1);

      const wing2 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.35, 0.4), goldMat);
      wing2.position.y = -0.35;
      crest.add(wing2);

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.5,
      });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.08, 8, 24), ringMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -1.2;
      crest.add(halo);

      eg.add(crest);
      this.eagleCrest = crest;

      const light = new THREE.PointLight(0xfbbf24, 18, 20, 1.6);
      light.position.set(0, 3.6, 0);
      eg.add(light);
      this.eagleLight = light;
    } else {
      const charredMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.95,
      });
      for (let i = 0; i < 5; i++) {
        const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0), charredMat);
        shard.position.set(
          Math.cos(i * 1.25) * 1.1,
          1.2 + (i % 2) * 0.35,
          Math.sin(i * 1.25) * 1.1
        );
        eg.add(shard);
      }
      this.eagleCrest = null;
      this.eagleLight = null;
    }

    this.eagleGroup = eg;
    this.group.add(eg);
  }

  buildWallDeteriorationMesh(c, r, isSteel, hp) {
    const clampedHp = Math.max(1, Math.min(WALL_MAX_HP, hp));
    const stageMat = isSteel
      ? this.mats.steelStages[clampedHp]
      : this.mats.brickStages[clampedHp];

    // Stage 5 (5/5 HP): Pristine full-height wall block
    if (clampedHp >= WALL_MAX_HP) {
      const fullGeo = isSteel ? this.geoSteel : this.geoBrick;
      const fullH = isSteel ? WALL_HEIGHT_STEEL : WALL_HEIGHT_BRICK;
      const m = new THREE.Mesh(fullGeo, stageMat);
      m.position.y = fullH * 0.5;
      m.castShadow = true;
      m.receiveShadow = true;
      const wrap = new THREE.Group();
      wrap.add(m);
      return wrap;
    }

    const g = new THREE.Group();
    const yScale = isSteel ? WALL_HEIGHT_STEEL / WALL_HEIGHT_BRICK : 1.0;
    g.scale.set(1, yScale, 1);
    // Deterministic 90-deg orientation per cell so damaged blocks look organically varied
    g.rotation.y = ((c * 7 + r * 13) % 4) * (Math.PI * 0.5);

    const H = WALL_HEIGHT_BRICK;
    const W = CELL_SIZE * 0.98;
    const sg = this.wallSubGeos;
    const chunkMat = isSteel ? this.mats.slagMat : this.mats.rubbleMat;

    const addPart = (geo, mat, px, py, pz, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };

    if (clampedHp === 4) {
      // Stage 4 (After 1st hit): Notched upper crown & chipped corner + 2 fallen bricks
      addPart(sg.b4Base, stageMat, 0, H * 0.36, 0);
      addPart(sg.b4TopA, stageMat, 0, H * 0.84, -W * 0.2);
      addPart(sg.b4TopB, stageMat, -W * 0.21, H * 0.81, W * 0.24);
      addPart(sg.rubble, stageMat, W * 0.32, 0.19, W * 0.34, 0.15, -0.2);
      addPart(sg.rubble, chunkMat, W * 0.14, 0.18, W * 0.38, -0.1, 0.25);
    } else if (clampedHp === 3) {
      // Stage 3 (After 2nd hit): Jagged breached parapet (~72% height) + 3 rubble blocks
      addPart(sg.b3Base, stageMat, 0, H * 0.225, 0);
      addPart(sg.b3PilA, stageMat, -W * 0.23, H * 0.62, -W * 0.2, 0.04, -0.05);
      addPart(sg.b3PilB, stageMat, W * 0.22, H * 0.56, W * 0.18, -0.06, 0.08);
      addPart(sg.b4TopB, chunkMat, -W * 0.04, H * 0.52, W * 0.08, 0.12, 0.1);
      addPart(sg.rubble, stageMat, W * 0.36, 0.19, -W * 0.28, 0.2, 0.3);
      addPart(sg.rubble, chunkMat, -W * 0.34, 0.19, W * 0.32, -0.25, 0.15);
      addPart(sg.rubble, stageMat, 0.1, 0.19, W * 0.39, 0.1, -0.22);
    } else if (clampedHp === 2) {
      // Stage 2 (After 3rd hit): Half-collapsed tilted ruin (~50% height) + 5 rubble chunks
      addPart(sg.b2Base, stageMat, 0, H * 0.13, 0);
      addPart(sg.b2SlabA, stageMat, -W * 0.18, H * 0.38, -W * 0.12, 0.16, -0.18);
      addPart(sg.b2SlabB, chunkMat, W * 0.2, H * 0.33, W * 0.16, -0.2, 0.22);
      const offsets = [
        [0.36, 0.32], [-0.36, 0.3], [0.34, -0.34], [-0.32, -0.35], [0.05, 0.38],
      ];
      offsets.forEach(([ox, oz], idx) => {
        addPart(
          sg.rubble,
          idx % 2 === 0 ? stageMat : chunkMat,
          W * ox,
          0.19,
          W * oz,
          0.25 * (idx % 3 - 1),
          0.3 * ((idx + 1) % 3 - 1)
        );
      });
    } else {
      // Stage 1 (After 4th hit — 1 shot left!): Low shattered stump (~28% height) + scattered debris
      addPart(sg.b1Stump, stageMat, 0, H * 0.09, 0);
      addPart(sg.b1Shard, stageMat, -W * 0.16, H * 0.24, -W * 0.1, 0.26, -0.24);
      const offsets = [
        [0.36, 0.3], [-0.35, 0.28], [0.3, -0.35], [-0.3, -0.32], [0.12, 0.34], [-0.1, -0.36],
      ];
      offsets.forEach(([ox, oz], idx) => {
        addPart(
          sg.rubble,
          idx % 2 === 0 ? stageMat : chunkMat,
          W * ox,
          0.18,
          W * oz,
          0.35 * (idx % 3 - 1),
          -0.28 * ((idx + 1) % 3 - 1)
        );
      });
    }

    return g;
  }

  setCellMesh(c, r, tileType, hp = WALL_MAX_HP) {
    const existing = this.cellMeshes[r][c];
    if (existing) {
      this.group.remove(existing);
      this.cellMeshes[r][c] = null;
    }
    if (tileType === TILE.EMPTY || tileType === TILE.EAGLE || tileType === TILE.EAGLE_DEAD) {
      return;
    }

    const { x, z } = subToWorld(c, r);
    let obj = null;

    if (tileType === TILE.BRICK) {
      obj = this.buildWallDeteriorationMesh(c, r, false, hp);
      obj.position.set(x, 0, z);
    } else if (tileType === TILE.STEEL) {
      obj = this.buildWallDeteriorationMesh(c, r, true, hp);
      obj.position.set(x, 0, z);
    } else if (tileType === TILE.WATER) {
      obj = new THREE.Mesh(this.geoWater, this.mats.water);
      obj.position.set(x, -0.06, z);
      obj.receiveShadow = true;
    } else if (tileType === TILE.ICE) {
      obj = new THREE.Mesh(this.geoIce, this.mats.ice);
      obj.position.set(x, 0.03, z);
      obj.receiveShadow = true;
    } else if (tileType === TILE.TREES) {
      obj = new THREE.Group();
      obj.position.set(x, 0, z);
      const trunk = new THREE.Mesh(this.geoTrunk, this.mats.trunk);
      trunk.position.y = 0.9;
      obj.add(trunk);

      const c1 = new THREE.Mesh(this.geoCone1, this.mats.foliageDark);
      c1.position.y = 2.4;
      obj.add(c1);

      const c2 = new THREE.Mesh(this.geoCone2, this.mats.foliageLight);
      c2.position.y = 3.65;
      obj.add(c2);
    }

    if (obj) {
      this.cellMeshes[r][c] = obj;
      this.group.add(obj);
    }
  }

  update(dt, elapsed) {
    this.mats.waterTex.offset.x = (elapsed * 0.12) % 1;
    this.mats.waterTex.offset.y = Math.sin(elapsed * 0.8) * 0.08;
    if (this.eagleCrest) {
      this.eagleCrest.rotation.y = elapsed * 1.35;
      this.eagleCrest.position.y = 2.9 + Math.sin(elapsed * 2.5) * 0.22;
    }
  }
}

// ============================================================================
// Detailed Modern Main Battle Tank (MBT) 3D Model Builder
// Inspired by M1A2 Abrams / Leopard 2A6 / M60 reference silhouettes
// ============================================================================
const _tankCamoCache = new Map();
let _starDecalMat = null;
let _fanGrillMat = null;
let _turretExtrudeGeo = null;

function getTankCamoMaterial(baseHex, roughness = 0.54, metalness = 0.36) {
  const key = `${baseHex}_${roughness}`;
  if (_tankCamoCache.has(key)) {
    return _tankCamoCache.get(key).clone();
  }

  const baseCol = new THREE.Color(baseHex);
  const hsl = {};
  baseCol.getHSL(hsl);

  // Tonal military palette derived from player/enemy signature color
  const mainCol = new THREE.Color().setHSL(hsl.h, Math.min(0.68, hsl.s * 0.78), clamp01(hsl.l * 0.88));
  const darkPatch = new THREE.Color().setHSL((hsl.h + 0.03) % 1, Math.min(0.55, hsl.s * 0.65), clamp01(hsl.l * 0.46));
  const lightPatch = new THREE.Color().setHSL(hsl.h, Math.min(0.5, hsl.s * 0.55), clamp01(hsl.l * 1.16));

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

  // Welded armor panel seams & rivets
  ctx.strokeStyle = 'rgba(15, 20, 25, 0.42)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(4, 4, 248, 248);
  ctx.beginPath();
  ctx.moveTo(0, 128); ctx.lineTo(256, 128);
  ctx.moveTo(128, 0); ctx.lineTo(128, 128);
  ctx.stroke();

  // Subtle combat edge scratches & steel wear
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 22; i++) {
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
    roughness,
    metalness,
  });
  _tankCamoCache.set(key, mat);
  return mat.clone();
}

function clamp01(v) {
  return Math.max(0.08, Math.min(0.92, v));
}

function getStarDecalMaterial() {
  if (_starDecalMat) return _starDecalMat;
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);

  // Stencil military circle + 5-point star
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
  _starDecalMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  return _starDecalMat;
}

function getFanGrillMaterial() {
  if (_fanGrillMat) return _fanGrillMat;
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#11161d';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  // Turbine cooling blades
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
  _fanGrillMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.7,
    metalness: 0.5,
  });
  return _fanGrillMat;
}

function getTurretExtrudeGeo() {
  if (_turretExtrudeGeo) return _turretExtrudeGeo;
  // Planform of an Abrams/Leopard angular wedge turret:
  // In 2D shape (x = tank X, y = tank -Z so after rotateX(-PI/2) +Y becomes -Z forward!)
  const shape = new THREE.Shape();
  shape.moveTo(-0.62, 1.18);  // Front-left angled gun cheek
  shape.lineTo(0.62, 1.18);   // Front-right angled gun cheek
  shape.lineTo(1.16, 0.42);   // Right wide composite cheek
  shape.lineTo(1.14, -0.55);  // Right mid turret
  shape.lineTo(0.98, -1.42);  // Rear-right overhang bustle
  shape.lineTo(-0.98, -1.42); // Rear-left overhang bustle
  shape.lineTo(-1.14, -0.55); // Left mid turret
  shape.lineTo(-1.16, 0.42);  // Left wide composite cheek
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.52,
    bevelEnabled: true,
    bevelThickness: 0.11,
    bevelSize: 0.1,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  _turretExtrudeGeo = geo;
  return geo;
}

export function createTankRig(mats, {
  hullColor = 0xf59e0b,
  turretColor = 0xfbbf24,
  scale = 1.0,
  isPlayer = true,
} = {}) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hullMat = getTankCamoMaterial(hullColor, 0.56, 0.34);
  const turretMat = getTankCamoMaterial(turretColor, 0.48, 0.38);
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1f242b,
    roughness: 0.58,
    metalness: 0.68,
  });
  const gunSteelMat = new THREE.MeshStandardMaterial({
    color: 0x323944,
    roughness: 0.42,
    metalness: 0.76,
  });
  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x15171a,
    roughness: 0.88,
    metalness: 0.12,
  });
  const stowageMat = new THREE.MeshStandardMaterial({
    color: 0x4a5535,
    roughness: 0.86,
    metalness: 0.08,
  });
  const wheelRimMat = new THREE.MeshStandardMaterial({
    color: hullColor,
    roughness: 0.52,
    metalness: 0.45,
  });

  // Independent scrolling caterpillar tread textures
  const leftTreadTex = mats.baseTreadTex.clone();
  leftTreadTex.needsUpdate = true;
  const rightTreadTex = mats.baseTreadTex.clone();
  rightTreadTex.needsUpdate = true;

  const leftTreadMat = new THREE.MeshStandardMaterial({
    map: leftTreadTex,
    roughness: 0.65,
    metalness: 0.42,
  });
  const rightTreadMat = new THREE.MeshStandardMaterial({
    map: rightTreadTex,
    roughness: 0.65,
    metalness: 0.42,
  });

  // ========================================================================
  // 1. Trapezoidal Caterpillar Running Gear + 6 Road Wheels + Side Skirts
  // ========================================================================
  const trackBottomGeo = new THREE.BoxGeometry(0.76, 0.72, 3.55);
  const trackRampGeo = new THREE.BoxGeometry(0.75, 0.22, 0.82);
  const sprocketGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.78, 14);
  sprocketGeo.rotateZ(Math.PI / 2);
  const roadTireGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.78, 14);
  roadTireGeo.rotateZ(Math.PI / 2);
  const dishHubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.82, 10);
  dishHubGeo.rotateZ(Math.PI / 2);
  const axleCapGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.86, 8);
  axleCapGeo.rotateZ(Math.PI / 2);

  const wheels = [];
  for (const side of [-1, 1]) {
    const tx = side * 1.44;
    const tMat = side < 0 ? leftTreadMat : rightTreadMat;

    // Main ground-contact track belt
    const beltCore = new THREE.Mesh(trackBottomGeo, tMat);
    beltCore.position.set(tx, 0.38, 0);
    beltCore.castShadow = true;
    beltCore.receiveShadow = true;
    bodyPivot.add(beltCore);

    // Angled front & rear trapezoidal climb belts up to raised sprocket/idler!
    const frontClimb = new THREE.Mesh(trackRampGeo, tMat);
    frontClimb.position.set(tx, 0.38, -1.82);
    frontClimb.rotation.x = 0.42;
    bodyPivot.add(frontClimb);

    const rearClimb = new THREE.Mesh(trackRampGeo, tMat);
    rearClimb.position.set(tx, 0.38, 1.82);
    rearClimb.rotation.x = -0.42;
    bodyPivot.add(rearClimb);

    // Elevated Front Drive Sprocket (-Z) & Rear Idler Wheel (+Z)
    for (const dz of [-1.96, 1.96]) {
      const drum = new THREE.Mesh(sprocketGeo, tMat);
      drum.position.set(tx, 0.58, dz);
      drum.castShadow = true;
      bodyPivot.add(drum);

      const cap = new THREE.Mesh(dishHubGeo, darkMetalMat);
      cap.position.set(tx, 0.58, dz);
      bodyPivot.add(cap);
    }

    // 6 Dual Rubber-Tired Road Wheels per side!
    for (const wz of [-1.45, -0.87, -0.29, 0.29, 0.87, 1.45]) {
      const wGroup = new THREE.Group();
      wGroup.position.set(tx, 0.32, wz);
      const tire = new THREE.Mesh(roadTireGeo, rubberMat);
      const dish = new THREE.Mesh(dishHubGeo, wheelRimMat);
      const cap = new THREE.Mesh(axleCapGeo, darkMetalMat);
      wGroup.add(tire, dish, cap);
      bodyPivot.add(wGroup);
      wheels.push({ group: wGroup, side });
    }

    // Segmented Hinged Ballistic Side Skirts overhanging upper tracks (4 panels per side)
    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const sz = -1.46 + sIdx * 0.97;
      const skirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.91), hullMat);
      skirtPanel.position.set(side * 1.86, 0.78, sz);
      skirtPanel.castShadow = true;
      bodyPivot.add(skirtPanel);
    }

    // Top Armored Sponson / Track Fender Deck + Angled Mudguards
    const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.2, 4.18), hullMat);
    sponson.position.set(tx, 0.98, 0);
    sponson.castShadow = true;
    sponson.receiveShadow = true;
    bodyPivot.add(sponson);

    const frontMudguard = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.12, 0.42), hullMat);
    frontMudguard.position.set(tx, 0.89, -2.22);
    frontMudguard.rotation.x = 0.45;
    bodyPivot.add(frontMudguard);

    const rearMudflap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.32, 0.08), rubberMat);
    rearMudflap.position.set(tx, 0.76, 2.12);
    bodyPivot.add(rearMudflap);
  }

  // ========================================================================
  // 2. Low-Slung Sloped MBT Armored Hull, Front Glacis & Rear Engine Deck
  // ========================================================================
  const mainHull = new THREE.Mesh(new THREE.BoxGeometry(2.18, 0.68, 4.12), hullMat);
  mainHull.position.set(0, 0.76, 0);
  mainHull.castShadow = true;
  mainHull.receiveShadow = true;
  bodyPivot.add(mainHull);

  // Sloped 3x Chobham Upper Glacis (-Z forward) + Lower Nose Wedge
  const upperGlacis = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.26, 1.35), turretMat);
  upperGlacis.position.set(0, 1.04, -1.52);
  upperGlacis.rotation.x = 0.24;
  upperGlacis.castShadow = true;
  bodyPivot.add(upperGlacis);

  const lowerNose = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.42, 0.55), hullMat);
  lowerNose.position.set(0, 0.62, -2.06);
  lowerNose.rotation.x = -0.45;
  bodyPivot.add(lowerNose);

  // Spare Track-Link Armor Pad & Tow Shackles on Front Glacis (like reference Image 6!)
  const spareTrackPad = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.14, 0.52), darkMetalMat);
  spareTrackPad.position.set(0, 1.12, -1.68);
  spareTrackPad.rotation.x = 0.24;
  bodyPivot.add(spareTrackPad);

  for (const sx of [-0.78, 0.78]) {
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 6, 12), gunSteelMat);
    shackle.position.set(sx, 0.74, -2.24);
    bodyPivot.add(shackle);
  }

  // Armored Front Headlight Housings
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
  for (const hx of [-0.92, 0.92]) {
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.22), darkMetalMat);
    guard.position.set(hx, 1.1, -1.96);
    bodyPivot.add(guard);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), headMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(hx, 1.1, -2.06);
    bodyPivot.add(lens);
  }

  // Rear Engine Deck: Twin Circular Cooling Fans (like Leopard 2 in reference Image 7!)
  const deckRaised = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.16, 1.38), hullMat);
  deckRaised.position.set(0, 1.14, 1.32);
  deckRaised.receiveShadow = true;
  bodyPivot.add(deckRaised);

  const fanMat = getFanGrillMaterial();
  const fanGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.05, 18);
  for (const fx of [-0.52, 0.52]) {
    const fan = new THREE.Mesh(fanGeo, fanMat);
    fan.position.set(fx, 1.22, 1.36);
    bodyPivot.add(fan);
  }

  // Rear Transom: Louvered Exhaust Grille + Glowing 1-Hit Reactor Weakspot + Round Tail Lamps!
  const rearGrilleBox = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.48, 0.14), darkMetalMat);
  rearGrilleBox.position.set(0, 0.78, 2.05);
  bodyPivot.add(rearGrilleBox);

  const weakspotMat = new THREE.MeshBasicMaterial({ color: isPlayer ? 0xea580c : 0xff3b30 });
  const rearWeakspot = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.32, 0.08), weakspotMat);
  rearWeakspot.position.set(0, 0.78, 2.09);
  bodyPivot.add(rearWeakspot);

  // Horizontal armored exhaust louver slats across the glowing core (realistic military grille!)
  for (let ly = -0.11; ly <= 0.12; ly += 0.075) {
    const louver = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.032, 0.12), darkMetalMat);
    louver.position.set(0, 0.78 + ly, 2.11);
    bodyPivot.add(louver);
  }

  // Recessed Round Military Tail Lights (left & right rear corners, like Images 3, 4, 5!)
  const brakeLensMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  for (const lx of [-1.02, 1.02]) {
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 12), darkMetalMat);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(lx, 0.92, 2.06);
    bodyPivot.add(bezel);

    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 12), brakeLensMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(lx, 0.92, 2.07);
    bodyPivot.add(lamp);
  }

  // Amphibious Hover-Skirt Pontoons (hidden unless HOVER buff active)
  const pontoonGroup = new THREE.Group();
  const pontoonMat = new THREE.MeshStandardMaterial({
    color: 0x14b8a6,
    emissive: 0x0f766e,
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
  const pGeo = new THREE.CylinderGeometry(0.34, 0.34, 4.4, 10);
  pGeo.rotateX(Math.PI / 2);
  const pL = new THREE.Mesh(pGeo, pontoonMat);
  pL.position.set(-2.05, 0.38, 0);
  const pR = new THREE.Mesh(pGeo, pontoonMat);
  pR.position.set(2.05, 0.38, 0);
  pontoonGroup.add(pL, pR);
  pontoonGroup.visible = false;
  bodyPivot.add(pontoonGroup);

  // Carried Wall Block Cargo Indicator (on rear engine deck when Tractor Beam grabs a wall!)
  const carriedBrick = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.68, 0.88), mats.brick);
  carriedBrick.position.set(0, 1.56, 1.48);
  carriedBrick.visible = false;
  bodyPivot.add(carriedBrick);

  const carriedSteel = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.68, 0.88), mats.steel);
  carriedSteel.position.set(0, 1.56, 1.48);
  carriedSteel.visible = false;
  bodyPivot.add(carriedSteel);

  // ========================================================================
  // 3. Angular Wedge MBT Turret + Wrap-Around Bustle Rack + Roof .50 Cal MG
  // ========================================================================
  const turretPivot = new THREE.Group();
  turretPivot.position.set(0, 1.22, -0.12);
  bodyPivot.add(turretPivot);

  // Turret ring collar
  const turretRing = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.04, 0.14, 18), darkMetalMat);
  turretRing.position.set(0, 0.04, -0.05);
  turretPivot.add(turretRing);

  // Faceted Abrams/Leopard Wedge Turret Armor Shell
  const turretShell = new THREE.Mesh(getTurretExtrudeGeo(), turretMat);
  turretShell.position.set(0, 0.08, 0);
  turretShell.castShadow = true;
  turretShell.receiveShadow = true;
  turretPivot.add(turretShell);

  // Stencil Military Star Insignia on Turret Roof (like reference Image 4!)
  const starDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), getStarDecalMaterial());
  starDecal.rotation.x = -Math.PI / 2;
  starDecal.position.set(0, 0.715, 0.58);
  turretPivot.add(starDecal);

  // Side Reactive Armor / Stowage Boxes on Turret Cheeks
  for (const sx of [-1.18, 1.18]) {
    const sideBox = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.86), darkMetalMat);
    sideBox.position.set(sx, 0.36, 0.02);
    sideBox.castShadow = true;
    turretPivot.add(sideBox);

    // 4-Tube Smoke Grenade Discharger Cluster on Front Cheeks (like Image 6!)
    const smokeCluster = new THREE.Group();
    smokeCluster.position.set(sx * 0.94, 0.38, -0.62);
    smokeCluster.rotation.y = sx < 0 ? 0.42 : -0.42;
    smokeCluster.rotation.x = 0.35;
    for (let gIdx = 0; gIdx < 4; gIdx++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 8), gunSteelMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.set(((gIdx % 2) - 0.5) * 0.11, Math.floor(gIdx / 2) * 0.11, 0);
      smokeCluster.add(tube);
    }
    turretPivot.add(smokeCluster);
  }

  // Wrap-Around Tubular Slat Bustle Storage Basket (Rear & Sides — iconic in Images 1, 3, 4, 5!)
  const rackGroup = new THREE.Group();
  const railRadius = 0.024;
  // Rear horizontal slat rails (3 tiers)
  for (const ry of [0.22, 0.38, 0.54]) {
    const rearRail = new THREE.Mesh(new THREE.CylinderGeometry(railRadius, railRadius, 2.08, 8), gunSteelMat);
    rearRail.rotation.z = Math.PI / 2;
    rearRail.position.set(0, ry, 1.66);
    rackGroup.add(rearRail);

    // Left & right bustle side basket rails
    for (const sx of [-1.06, 1.06]) {
      const sideRail = new THREE.Mesh(new THREE.CylinderGeometry(railRadius, railRadius, 1.02, 8), gunSteelMat);
      sideRail.rotation.x = Math.PI / 2;
      sideRail.position.set(sx, ry, 1.15);
      rackGroup.add(sideRail);
    }
  }
  // Vertical basket stanchion posts
  const postCoords = [
    [-1.04, 1.66], [-0.52, 1.66], [0, 1.66], [0.52, 1.66], [1.04, 1.66],
    [-1.06, 0.68], [1.06, 0.68], [-1.06, 1.18], [1.06, 1.18],
  ];
  for (const [px, pz] of postCoords) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.4, 6), darkMetalMat);
    post.position.set(px, 0.38, pz);
    rackGroup.add(post);
  }

  // Tactical Stowage Packs & Rolled Tarp inside Bustle Basket!
  const pack1 = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.32), stowageMat);
  pack1.position.set(-0.56, 0.36, 1.48);
  const pack2 = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.32, 0.3), darkMetalMat);
  pack2.position.set(0.58, 0.36, 1.48);
  const bedrollGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.66, 10);
  bedrollGeo.rotateZ(Math.PI / 2);
  const bedroll = new THREE.Mesh(bedrollGeo, stowageMat);
  bedroll.position.set(0, 0.56, 1.52);
  rackGroup.add(pack1, pack2, bedroll);
  turretPivot.add(rackGroup);

  // Commander's Ringed Cupola (Right) + Loader's Hatch (Left)
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.16, 14), darkMetalMat);
  cupola.position.set(0.46, 0.74, -0.05);
  turretPivot.add(cupola);

  const loaderHatch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.1, 12), darkMetalMat);
  loaderHatch.position.set(-0.46, 0.72, 0.08);
  turretPivot.add(loaderHatch);

  // Pintle-Mounted .50 Cal Heavy Machine Gun (M2HB) on Commander Cupola (Images 1, 3, 4, 5, 6!)
  const mgGroup = new THREE.Group();
  mgGroup.position.set(0.46, 0.92, -0.14);
  const mgPintle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), darkMetalMat);
  mgPintle.position.set(0, -0.08, 0.06);
  const mgReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.48), gunSteelMat);
  const mgAmmoBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.24), stowageMat);
  mgAmmoBox.position.set(-0.15, -0.02, 0.02);
  const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.68, 8), darkMetalMat);
  mgBarrel.rotation.x = Math.PI / 2;
  mgBarrel.position.set(0, 0.02, -0.52);
  mgGroup.add(mgPintle, mgReceiver, mgAmmoBox, mgBarrel);
  turretPivot.add(mgGroup);

  // CITV / Thermal Gunner Doghouse Optic (glows green when locked on!)
  const doghouse = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.38), darkMetalMat);
  doghouse.position.set(-0.48, 0.78, -0.54);
  turretPivot.add(doghouse);

  const sensorMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const sensorEye = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.06), sensorMat);
  sensorEye.position.set(-0.48, 0.79, -0.74);
  turretPivot.add(sensorEye);

  // Twin Fine Whip Antennas on Rear Bustle Corners (thin realistic steel whips like Images 4, 5, 6!)
  for (const ax of [-0.94, 0.94]) {
    const antBase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 8), darkMetalMat);
    antBase.position.set(ax, 0.68, 1.32);
    turretPivot.add(antBase);

    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.018, 1.15, 6), gunSteelMat);
    whip.position.set(ax, 1.28, 1.35);
    whip.rotation.x = -0.05;
    turretPivot.add(whip);
  }

  // ========================================================================
  // 4. Stepped 120mm Smoothbore Main Cannon + Bore Evacuator (Fume Extractor)
  // ========================================================================
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, 0.38, -0.95);
  turretPivot.add(barrelPivot);

  // Armored Gun Mantlet
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.42, 0.52), darkMetalMat);
  mantlet.castShadow = true;
  barrelPivot.add(mantlet);

  // Base Thermal Shroud Tube
  const rearTubeGeo = new THREE.CylinderGeometry(0.145, 0.165, 1.05, 14);
  rearTubeGeo.rotateX(Math.PI / 2);
  const rearTube = new THREE.Mesh(rearTubeGeo, turretMat);
  rearTube.position.set(0, 0, -0.68);
  rearTube.castShadow = true;
  barrelPivot.add(rearTube);

  // Signature Mid-Barrel Bore Evacuator (Fume Extractor Bulge — Images 5 & 6!)
  const evacGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.56, 16);
  evacGeo.rotateX(Math.PI / 2);
  const boreEvacuator = new THREE.Mesh(evacGeo, turretMat);
  boreEvacuator.position.set(0, 0, -1.28);
  boreEvacuator.castShadow = true;
  barrelPivot.add(boreEvacuator);

  // Forward Smoothbore Barrel Section
  const frontTubeGeo = new THREE.CylinderGeometry(0.115, 0.13, 1.48, 14);
  frontTubeGeo.rotateX(Math.PI / 2);
  const frontTube = new THREE.Mesh(frontTubeGeo, gunSteelMat);
  frontTube.position.set(0, 0, -2.18);
  frontTube.castShadow = true;
  barrelPivot.add(frontTube);

  // Slotted Muzzle Brake / Reference Sensor Collar
  const muzzleBrakeGeo = new THREE.CylinderGeometry(0.165, 0.155, 0.34, 14);
  muzzleBrakeGeo.rotateX(Math.PI / 2);
  const muzzleBrake = new THREE.Mesh(muzzleBrakeGeo, darkMetalMat);
  muzzleBrake.position.set(0, 0, -2.92);
  barrelPivot.add(muzzleBrake);

  // Tier 3+ Upgraded Twin-Rail Thermal Jacket (shown when weaponTier >= 2)
  const heavyShroud = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, 1.85), darkMetalMat);
  heavyShroud.position.set(0, 0.04, -1.15);
  heavyShroud.visible = false;
  barrelPivot.add(heavyShroud);

  // Volumetric-style Multi-Lobe Muzzle Blast Flash (like Image 4!)
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.92,
  });
  const muzzleFlash = new THREE.Group();
  const flashCore = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), flashMat);
  flashCore.scale.set(1, 1, 1.95);
  const flashFlare = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.65 })
  );
  flashFlare.scale.set(1.3, 1.3, 0.85);
  muzzleFlash.add(flashCore, flashFlare);
  muzzleFlash.position.set(0, 0, -3.22);
  muzzleFlash.visible = false;
  barrelPivot.add(muzzleFlash);

  // Forward Laser Target Designator (visible when locked onto an enemy!)
  const laserGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -3.05),
    new THREE.Vector3(0, 0, -24.0),
  ]);
  const laserMat = new THREE.LineBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.55,
  });
  const laserLine = new THREE.Line(laserGeo, laserMat);
  laserLine.visible = false;
  barrelPivot.add(laserLine);

  // Clean Low-Profile Tactical Ground Shield Ring (never clutters the tank silhouette!)
  const shieldMesh = new THREE.Group();
  const ringMat1 = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.62,
  });
  const sRing1 = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.065, 8, 32), ringMat1);
  sRing1.rotation.x = Math.PI / 2;
  sRing1.position.y = 0.14;
  shieldMesh.add(sRing1);
  shieldMesh.visible = false;
  root.add(shieldMesh);

  return {
    root,
    bodyPivot,
    turretPivot,
    barrelPivot,
    hullMat,
    turretMat,
    sensorMat,
    laserLine,
    laserMat,
    muzzleFlash,
    heavyShroud,
    shieldMesh,
    pontoonGroup,
    carriedBrick,
    carriedSteel,
    leftTreadTex,
    rightTreadTex,
    wheels,
  };
}

// ============================================================================
// 3D Projectiles, Crates, Tractor Beams & Debris Effects Manager
// ============================================================================
export class Effects3D {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.rings = [];
    this.beams = [];

    this.cubeGeo = new THREE.BoxGeometry(0.45, 0.35, 0.45);
    this.ringGeo = new THREE.RingGeometry(0.4, 0.85, 20);
    this.ringGeo.rotateX(-Math.PI / 2);
  }

  spawnExplosion(x, y, z, colorHex = 0xf97316, count = 18, big = false) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xfef08a : colorHex,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.cubeGeo, mat);
      const scale = (big ? 1.35 : 0.85) * (0.6 + Math.random() * 0.9);
      mesh.scale.setScalar(scale);
      mesh.position.set(x, y, z);

      const angle = Math.random() * Math.PI * 2;
      const speed = (big ? 15 : 10) * (0.35 + Math.random() * 0.85);
      const vy = (big ? 14 : 9) * (0.4 + Math.random() * 0.8);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        mat,
        vx: Math.cos(angle) * speed,
        vy,
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: big ? 0.75 : 0.48,
      });
    }

    // Ground shockwave ring
    const rMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(this.ringGeo, rMat);
    ring.position.set(x, 0.14, z);
    this.scene.add(ring);
    this.rings.push({
      mesh: ring,
      mat: rMat,
      life: 0,
      maxLife: big ? 0.5 : 0.32,
      maxScale: big ? 7.5 : 4.0,
    });
  }

  spawnTractorBeam(x1, y1, z1, x2, y2, z2, colorHex = 0x38bdf8) {
    const pts = [
      new THREE.Vector3(x1, y1, z1),
      new THREE.Vector3((x1 + x2) * 0.5, Math.max(y1, y2) + 1.4, (z1 + z2) * 0.5),
      new THREE.Vector3(x2, y2, z2),
    ];
    const curve = new THREE.QuadraticBezierCurve3(pts[0], pts[1], pts[2]);
    const geo = new THREE.TubeGeometry(curve, 12, 0.16, 6, false);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.beams.push({ mesh, geo, mat, life: 0, maxLife: 0.26 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 28 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      if (p.mesh.position.y < 0.2) {
        p.mesh.position.y = 0.2;
        p.vy = Math.abs(p.vy) * 0.35;
      }
      p.mesh.rotation.x += 6 * dt;
      p.mesh.rotation.y += 5 * dt;
      p.mat.opacity = 1 - p.life / p.maxLife;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      if (r.life >= r.maxLife) {
        this.scene.remove(r.mesh);
        r.mat.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      const t = r.life / r.maxLife;
      const s = 1 + t * r.maxScale;
      r.mesh.scale.set(s, 1, s);
      r.mat.opacity = (1 - t) * 0.8;
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life += dt;
      if (b.life >= b.maxLife) {
        this.scene.remove(b.mesh);
        b.geo.dispose();
        b.mat.dispose();
        this.beams.splice(i, 1);
        continue;
      }
      b.mat.opacity = (1 - b.life / b.maxLife) * 0.85;
    }
  }

  clear() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mat.dispose();
    }
    for (const r of this.rings) {
      this.scene.remove(r.mesh);
      r.mat.dispose();
    }
    for (const b of this.beams) {
      this.scene.remove(b.mesh);
      b.geo.dispose();
      b.mat.dispose();
    }
    this.particles.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
  }
}

export function createCrateMesh(powerupType) {
  const info = POWERUP_INFO[powerupType] || POWERUP_INFO[0];
  const group = new THREE.Group();

  const coreMat = new THREE.MeshStandardMaterial({
    color: info.hex,
    emissive: info.hex,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.6,
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.85, 1.85), coreMat);
  box.castShadow = true;
  group.add(box);

  const frameMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
  });
  const cage = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.15, 2.15), frameMat);
  group.add(cage);

  return { group, box, cage, coreMat, frameMat };
}
