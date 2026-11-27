import * as THREE from '../../vendor/three.module.min.js';
import {
  SUB_GRID, CELL_SIZE, WORLD_SIZE, TILE,
  WALL_HEIGHT_BRICK, WALL_HEIGHT_CONCRETE, WALL_HEIGHT_STEEL, PERIMETER_HEIGHT,
  WALL_MAX_HP, CONCRETE_MAX_HP, STEEL_MAX_HP,
} from '../config/constants.js';
import { subToWorld } from '../core/MathUtils.js';

/**
 * 3D Arena & Destructible Environment Renderer (Single Responsibility Principle).
 * Renders:
 *  - 5-stage destructible Brick walls with progressive 3D deterioration & rubble
 *  - 3-stage destructible Reinforced Concrete barriers with exposed rebar rods
 *  - 4-stage Steel walls & gold-trimmed Permanent Bastion Steel
 *  - Stepped-bank animated Water canals, shimmering Ice lanes, multi-crown Forests
 *  - National HQ / Golden Eagle Command Monument
 */
export class ArenaRenderer {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.cellMeshes = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(null));
    this.eagleGroup = null;
    this.eagleCrest = null;
    this.eagleLight = null;

    const W = CELL_SIZE * 0.98;
    this.geoBrick = new THREE.BoxGeometry(W, WALL_HEIGHT_BRICK, W);
    this.geoConcrete = new THREE.BoxGeometry(W, WALL_HEIGHT_CONCRETE, W);
    this.geoSteel = new THREE.BoxGeometry(W, WALL_HEIGHT_STEEL, W);
    this.geoSteelCap = new THREE.BoxGeometry(W * 0.88, 0.16, W * 0.88);

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
      rebar: new THREE.CylinderGeometry(0.035, 0.035, 0.95, 6),
    };

    this.geoWater = new THREE.BoxGeometry(CELL_SIZE, 0.26, CELL_SIZE);
    this.geoWaterBank = new THREE.BoxGeometry(CELL_SIZE, 0.14, CELL_SIZE);
    this.geoIce = new THREE.BoxGeometry(CELL_SIZE, 0.08, CELL_SIZE);
    this.geoTrunk = new THREE.CylinderGeometry(0.28, 0.44, 1.85, 7);
    this.geoCrown1 = new THREE.DodecahedronGeometry(1.45, 0);
    this.geoCrown2 = new THREE.DodecahedronGeometry(1.12, 0);
  }

  build(arenaGrid, template, hasEagle, hqStyle = 'radio') {
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

    // Ground plane (asphalt tactical grid, or Tanks3D battlefield grass for open-country arenas)
    this.mats.ground.color.setHex(0xffffff);
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      template.groundStyle === 'grass' ? this.mats.grassGround : this.mats.ground
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    groundMesh.receiveShadow = true;
    this.group.add(groundMesh);

    // Outer surrounding apron
    const apronMat = new THREE.MeshStandardMaterial({
      color: template.groundTint || 0x1e242c,
      roughness: 0.95,
    });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SIZE * 3, WORLD_SIZE * 3), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(WORLD_SIZE * 0.5, -0.06, WORLD_SIZE * 0.5);
    this.group.add(apron);

    // Inner curb + Set-back Perimeter Bastion Walls
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x3b4a5e, roughness: 0.7, metalness: 0.35 });
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
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, PERIMETER_HEIGHT, p.d), this.mats.perimeter);
      m.position.set(p.x, PERIMETER_HEIGHT * 0.5, p.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }

    // Populate sub-cells
    for (let r = 0; r < SUB_GRID; r++) {
      for (let c = 0; c < SUB_GRID; c++) {
        const t = arenaGrid.getTile(c, r);
        if (t !== TILE.EMPTY && t !== TILE.EAGLE && t !== TILE.EAGLE_DEAD) {
          this.setCellMesh(c, r, t, arenaGrid.getHp(c, r));
        }
      }
    }

    if (hasEagle) {
      this.buildEagleMonument(true, hqStyle);
    }
  }

  buildEagleMonument(alive = true, hqStyle = 'radio') {
    if (this.eagleGroup) {
      this.group.remove(this.eagleGroup);
    }
    const eg = new THREE.Group();
    const cx = 13 * CELL_SIZE;
    const cz = 25 * CELL_SIZE;
    eg.position.set(cx, 0, cz);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.9, 1.1, 8), baseMat);
    ped.position.y = 0.55;
    ped.castShadow = true;
    ped.receiveShadow = true;
    eg.add(ped);

    if (alive) {
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xb45309,
        emissiveIntensity: 0.5,
        metalness: 0.8,
        roughness: 0.22,
      });
      const crest = new THREE.Group();
      crest.position.y = 2.95;

      const core = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), goldMat);
      crest.add(core);

      const wing1 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.42, 0.48), goldMat);
      wing1.position.y = 0.22;
      const wing2 = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.32, 0.38), goldMat);
      wing2.position.y = -0.34;
      crest.add(wing1, wing2);

      // National HQ roof landmark (Tanks3D touch: USA radio mast, USSR watch turret, GER copper cupola)
      if (hqStyle === 'radio') {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.5, 8), baseMat);
        mast.position.set(0, 1.4, 0);
        crest.add(mast);
      } else if (hqStyle === 'cupola') {
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.65, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshStandardMaterial({ color: 0x2dd4bf, metalness: 0.65, roughness: 0.35 })
        );
        dome.position.set(0, 0.9, 0);
        crest.add(dome);
      }

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(1.95, 0.08, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.5 })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.y = -1.2;
      crest.add(halo);

      eg.add(crest);
      this.eagleCrest = crest;

      const light = new THREE.PointLight(0xfbbf24, 16, 22, 1.6);
      light.position.set(0, 3.8, 0);
      eg.add(light);
      this.eagleLight = light;
    } else {
      const charredMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.95 });
      for (let i = 0; i < 5; i++) {
        const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0), charredMat);
        shard.position.set(Math.cos(i * 1.25) * 1.1, 1.2 + (i % 2) * 0.35, Math.sin(i * 1.25) * 1.1);
        eg.add(shard);
      }
      this.eagleCrest = null;
      this.eagleLight = null;
    }

    this.eagleGroup = eg;
    this.group.add(eg);
  }

  _buildWallMesh(c, r, tileType, hp) {
    const isPerm = tileType === TILE.PERM_STEEL;
    const isSteel = tileType === TILE.STEEL || isPerm;
    const isConcrete = tileType === TILE.CONCRETE;

    const maxHp = isSteel ? STEEL_MAX_HP : isConcrete ? CONCRETE_MAX_HP : WALL_MAX_HP;
    const clampedHp = Math.max(1, Math.min(maxHp, hp || maxHp));

    const stageMat = isPerm
      ? this.mats.permSteel
      : isSteel
      ? this.mats.steelStages[clampedHp]
      : isConcrete
      ? this.mats.concreteStages[clampedHp]
      : this.mats.brickStages[clampedHp];

    // Pristine full block
    if (isPerm || clampedHp >= maxHp) {
      const fullGeo = isSteel ? this.geoSteel : isConcrete ? this.geoConcrete : this.geoBrick;
      const fullH = isSteel ? WALL_HEIGHT_STEEL : isConcrete ? WALL_HEIGHT_CONCRETE : WALL_HEIGHT_BRICK;
      const wrap = new THREE.Group();
      const m = new THREE.Mesh(fullGeo, stageMat);
      m.position.y = fullH * 0.5;
      m.castShadow = true;
      m.receiveShadow = true;
      wrap.add(m);

      // Raised bevel collar on top of steel blocks for crisp aerial readability
      if (isSteel) {
        const cap = new THREE.Mesh(this.geoSteelCap, stageMat);
        cap.position.y = fullH + 0.08;
        cap.receiveShadow = true;
        wrap.add(cap);
      }
      return wrap;
    }

    // Map remaining HP fraction onto 4 visual deterioration tiers (4..1)
    const visualStage = Math.max(1, Math.min(4, Math.ceil((clampedHp / maxHp) * 4)));
    const g = new THREE.Group();
    const fullH = isSteel ? WALL_HEIGHT_STEEL : isConcrete ? WALL_HEIGHT_CONCRETE : WALL_HEIGHT_BRICK;
    g.scale.set(1, fullH / WALL_HEIGHT_BRICK, 1);
    g.rotation.y = ((c * 7 + r * 13) % 4) * (Math.PI * 0.5);

    const H = WALL_HEIGHT_BRICK;
    const W = CELL_SIZE * 0.98;
    const sg = this.wallSubGeos;
    const chunkMat = isSteel
      ? this.mats.slagMat
      : isConcrete
      ? this.mats.concreteRubbleMat
      : this.mats.rubbleMat;

    const addPart = (geo, mat, px, py, pz, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };

    if (visualStage === 4) {
      addPart(sg.b4Base, stageMat, 0, H * 0.36, 0);
      addPart(sg.b4TopA, stageMat, 0, H * 0.84, -W * 0.2);
      addPart(sg.b4TopB, stageMat, -W * 0.21, H * 0.81, W * 0.24);
      addPart(sg.rubble, stageMat, W * 0.32, 0.19, W * 0.34, 0.15, -0.2);
      addPart(sg.rubble, chunkMat, W * 0.14, 0.18, W * 0.38, -0.1, 0.25);
    } else if (visualStage === 3) {
      addPart(sg.b3Base, stageMat, 0, H * 0.225, 0);
      addPart(sg.b3PilA, stageMat, -W * 0.23, H * 0.62, -W * 0.2, 0.04, -0.05);
      addPart(sg.b3PilB, stageMat, W * 0.22, H * 0.56, W * 0.18, -0.06, 0.08);
      addPart(sg.rubble, stageMat, W * 0.36, 0.19, -W * 0.28, 0.2, 0.3);
      addPart(sg.rubble, chunkMat, -W * 0.34, 0.19, W * 0.32, -0.25, 0.15);
      if (isConcrete) {
        addPart(sg.rebar, this.mats.rebarMat, -W * 0.14, H * 0.64, W * 0.04, 0.2, 0.15);
        addPart(sg.rebar, this.mats.rebarMat, W * 0.08, H * 0.58, -W * 0.08, -0.18, -0.1);
      }
    } else if (visualStage === 2) {
      addPart(sg.b2Base, stageMat, 0, H * 0.13, 0);
      addPart(sg.b2SlabA, stageMat, -W * 0.18, H * 0.38, -W * 0.12, 0.16, -0.18);
      addPart(sg.b2SlabB, chunkMat, W * 0.2, H * 0.33, W * 0.16, -0.2, 0.22);
      if (isConcrete) {
        addPart(sg.rebar, this.mats.rebarMat, -W * 0.06, H * 0.42, 0.1, 0.32, -0.2);
        addPart(sg.rebar, this.mats.rebarMat, W * 0.15, H * 0.36, -0.14, -0.25, 0.28);
      }
      const offsets = [[0.36, 0.32], [-0.36, 0.3], [0.34, -0.34], [-0.32, -0.35]];
      offsets.forEach(([ox, oz], idx) => {
        addPart(sg.rubble, idx % 2 === 0 ? stageMat : chunkMat, W * ox, 0.19, W * oz, 0.2, -0.2);
      });
    } else {
      addPart(sg.b1Stump, stageMat, 0, H * 0.09, 0);
      addPart(sg.b1Shard, stageMat, -W * 0.16, H * 0.24, -W * 0.1, 0.26, -0.24);
      const offsets = [[0.36, 0.3], [-0.35, 0.28], [0.3, -0.35], [-0.3, -0.32], [0.12, 0.34]];
      offsets.forEach(([ox, oz], idx) => {
        addPart(sg.rubble, idx % 2 === 0 ? stageMat : chunkMat, W * ox, 0.18, W * oz, 0.3, -0.25);
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

    if (
      tileType === TILE.BRICK ||
      tileType === TILE.CONCRETE ||
      tileType === TILE.STEEL ||
      tileType === TILE.PERM_STEEL
    ) {
      obj = this._buildWallMesh(c, r, tileType, hp);
      obj.position.set(x, 0, z);
    } else if (tileType === TILE.WATER) {
      obj = new THREE.Group();
      obj.position.set(x, 0, z);
      const bank = new THREE.Mesh(this.geoWaterBank, this.mats.waterBank);
      bank.position.y = 0.02;
      bank.receiveShadow = true;
      const water = new THREE.Mesh(this.geoWater, this.mats.water);
      water.position.y = -0.04;
      water.receiveShadow = true;
      obj.add(bank, water);
    } else if (tileType === TILE.ICE) {
      obj = new THREE.Mesh(this.geoIce, this.mats.ice);
      obj.position.set(x, 0.03, z);
      obj.receiveShadow = true;
    } else if (tileType === TILE.TREES) {
      // Multi-crown asymmetric forest canopy (inspired by Tanks3D's organic trees!)
      obj = new THREE.Group();
      obj.position.set(x, 0, z);
      const seed = (c * 31 + r * 17) % 16;
      const jx = ((seed % 4) - 1.5) * 0.25;
      const jz = (Math.floor(seed / 4) - 1.5) * 0.25;

      const trunk = new THREE.Mesh(this.geoTrunk, this.mats.trunk);
      trunk.position.set(jx, 0.92, jz);
      trunk.castShadow = true;
      obj.add(trunk);

      const c1 = new THREE.Mesh(this.geoCrown1, this.mats.foliageDark);
      c1.position.set(jx - 0.18, 2.35, jz + 0.12);
      c1.scale.set(1.1, 0.78, 1.05);
      c1.rotation.y = seed * 0.4;
      obj.add(c1);

      const c2 = new THREE.Mesh(this.geoCrown2, this.mats.foliageLight);
      c2.position.set(jx + 0.34, 3.15, jz - 0.18);
      c2.scale.set(1.05, 0.76, 1.0);
      c2.rotation.y = seed * 0.7;
      obj.add(c2);
    }

    if (obj) {
      this.cellMeshes[r][c] = obj;
      this.group.add(obj);
    }
  }

  update(elapsed) {
    this.mats.waterTex.offset.x = (elapsed * 0.12) % 1;
    this.mats.waterTex.offset.y = Math.sin(elapsed * 0.8) * 0.08;
    if (this.eagleCrest) {
      this.eagleCrest.rotation.y = elapsed * 1.35;
      this.eagleCrest.position.y = 2.95 + Math.sin(elapsed * 2.5) * 0.2;
    }
  }
}
