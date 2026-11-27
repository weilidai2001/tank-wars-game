import * as THREE from '../../vendor/three.module.min.js';
import { TILE } from '../config/constants.js';
import { clamp } from '../core/MathUtils.js';
import { bakeArmorAttributes } from './ArmorSurfaces.js';

// Cached turret geometries per silhouette type (shared across instances!)
const _turretGeoCache = new Map();

function getTurretGeometry(shapeType) {
  if (_turretGeoCache.has(shapeType)) return _turretGeoCache.get(shapeType);

  let geo;
  if (shapeType === 'cast_round') {
    // Smooth cast dome turret (Sherman, IS-2, Leopard 1)
    geo = new THREE.CylinderGeometry(0.86, 1.06, 0.72, 16);
    geo.translate(0, 0.36, 0);
  } else if (shapeType === 'cast_heavy') {
    // Elongated heavy cast turret with rear bustle (Pershing, M60A3)
    const shape = new THREE.Shape();
    shape.moveTo(-0.55, 1.08);
    shape.lineTo(0.55, 1.08);
    shape.quadraticCurveTo(1.12, 0.55, 1.04, -0.35);
    shape.lineTo(0.82, -1.35);
    shape.lineTo(-0.82, -1.35);
    shape.lineTo(-1.04, -0.35);
    shape.quadraticCurveTo(-1.12, 0.55, -0.55, 1.08);
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.56,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.12,
      bevelSegments: 3,
    });
    geo.rotateX(-Math.PI / 2);
  } else if (shapeType === 'dome_low' || shapeType === 'era_dome') {
    // Low Soviet hemispherical dome (T-62, T-90A)
    geo = new THREE.SphereGeometry(1.14, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52);
    geo.scale(1.0, 0.68, 1.06);
  } else if (shapeType === 'hex_forward') {
    // Iconic T-34/76 & Sd.Kfz.231 compact sloped hexagonal turret
    const shape = new THREE.Shape();
    shape.moveTo(-0.48, 0.96);
    shape.lineTo(0.48, 0.96);
    shape.lineTo(0.92, 0.1);
    shape.lineTo(0.76, -1.02);
    shape.lineTo(-0.76, -1.02);
    shape.lineTo(-0.92, 0.1);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.56,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.08,
      bevelSegments: 2,
    });
    geo.rotateX(-Math.PI / 2);
  } else if (shapeType === 'trapezoid') {
    // Panther / Panzer II narrow sloped trapezoidal turret
    const shape = new THREE.Shape();
    shape.moveTo(-0.56, 1.08);
    shape.lineTo(0.56, 1.08);
    shape.lineTo(0.96, -0.2);
    shape.lineTo(0.84, -1.22);
    shape.lineTo(-0.84, -1.22);
    shape.lineTo(-0.96, -0.2);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.58,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.08,
      bevelSegments: 1,
    });
    geo.rotateX(-Math.PI / 2);
  } else if (shapeType === 'slab_heavy') {
    // Long slab-sided turret (Tiger II, Striker)
    const shape = new THREE.Shape();
    shape.moveTo(-0.66, 1.24);
    shape.lineTo(0.66, 1.24);
    shape.lineTo(1.04, 0.15);
    shape.lineTo(0.96, -1.45);
    shape.lineTo(-0.96, -1.45);
    shape.lineTo(-1.04, 0.15);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.62,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.07,
      bevelSegments: 1,
    });
    geo.rotateX(-Math.PI / 2);
  } else if (shapeType === 'box_mbt') {
    // Broad flat-faced Leopard 2A4 / Goliath composite box turret
    const shape = new THREE.Shape();
    shape.moveTo(-0.96, 1.15);
    shape.lineTo(0.96, 1.15);
    shape.lineTo(1.16, 0.78);
    shape.lineTo(1.16, -1.35);
    shape.lineTo(-1.16, -1.35);
    shape.lineTo(-1.16, 0.78);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.58,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.08,
      bevelSegments: 1,
    });
    geo.rotateX(-Math.PI / 2);
  } else {
    // Default 'wedge_mbt' (M1A1 Abrams angular composite wedge)
    const shape = new THREE.Shape();
    shape.moveTo(-0.62, 1.18);
    shape.lineTo(0.62, 1.18);
    shape.lineTo(1.16, 0.42);
    shape.lineTo(1.14, -0.55);
    shape.lineTo(0.98, -1.42);
    shape.lineTo(-0.98, -1.42);
    shape.lineTo(-1.14, -0.55);
    shape.lineTo(-1.16, 0.42);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.52,
      bevelEnabled: true,
      bevelThickness: 0.11,
      bevelSize: 0.1,
      bevelSegments: 2,
    });
    geo.rotateX(-Math.PI / 2);
  }

  _turretGeoCache.set(shapeType, geo);
  return geo;
}


// Per-vehicle geometry cache: rigs of the same vehicle type are built identically, so after the
// first build every later rig reuses the same buffers (no per-spawn GPU geometry), and painted
// armor parts carry baked triplanar-camo attributes.
const _rigGeoCache = new Map();
const _tmpInv = new THREE.Matrix4();
const _tmpRel = new THREE.Matrix4();
const _tmpRoot = new THREE.Matrix4();
const _tipPos = new THREE.Vector3();
const _tipDir = new THREE.Vector3();
const _tipQuat = new THREE.Quaternion();

const MUZZLE_FLASH_LIFE = 0.2;

function makeMuzzleJetGeometry() {
  // Directional star-shaped muzzle jet (after Tanks3D): rings at z [0, -.28, -.6, -1.26],
  // radii [.12, .53, .24, .022], ring 1 alternating x0.58 for a star silhouette.
  const zs = [0, -0.28, -0.6, -1.26];
  const rs = [0.12, 0.53, 0.24, 0.022];
  const cols = [
    [new THREE.Color(0xfff2bd), new THREE.Color(0xfff2bd)],
    [new THREE.Color(0xcf5918), new THREE.Color(0xffc16a)],
    [new THREE.Color(0xf5ae3f), new THREE.Color(0xffe6a0)],
    [new THREE.Color(0xfff2bd), new THREE.Color(0xfff2bd)],
  ];
  const seg = 8;
  const pos = [];
  const col = [];
  for (let r = 0; r < zs.length; r++) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const rad = rs[r] * (r === 1 && i % 2 === 1 ? 0.58 : 1);
      pos.push(Math.cos(a) * rad, Math.sin(a) * rad * 0.84, zs[r]);
      // Two-sided additive cone: halve the energy so overlapping faces stay hot, not paper-white
      const c = cols[r][i % 2];
      col.push(c.r * 0.55, c.g * 0.55, c.b * 0.55);
    }
  }
  const idx = [];
  for (let r = 0; r < zs.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * seg + i;
      const b = r * seg + ((i + 1) % seg);
      const c = (r + 1) * seg + i;
      const d = (r + 1) * seg + ((i + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

const _muzzleJetGeo = makeMuzzleJetGeometry();
const _contactGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Data-driven 3D Tank & Armored Vehicle Mesh Builder (SRP + Open/Closed Principle).
 * Builds distinct hulls, turrets, running gear (tracked OR 6-wheeled recon car),
 * national polygon camouflage, player identity stripes, and two-tone gun tubes
 * (painted breech end, bare-metal muzzle end) purely from a declarative vehicleSpec.
 */
export class TankMeshBuilder {
  constructor(mats) {
    this.mats = mats;
    /** Optional hook: (tank, tipWorldPos, tipWorldDir, caliberScale) on every new shot. */
    this.onMuzzleBlast = null;
    /** Optional hook: (tank, rig, dt) each synced frame, for track dust / damage smoke. */
    this.onVehicleFrame = null;
  }

  createRig({
    vehicleSpec,
    palette = null,
    identityColor = 0xf59e0b,
    scale = 1.0,
    isPlayer = true,
  }) {
    const spec = vehicleSpec || {};
    const root = new THREE.Group();
    root.scale.setScalar(scale);

    const bodyPivot = new THREE.Group();
    root.add(bodyPivot);

    const isWhitewash = Boolean(palette && palette.base === 0xb8bcaf);
    const hullMat = this.mats.getCamoArmorMaterial(palette || identityColor, isWhitewash);
    const turretMat = this.mats.getCamoArmorMaterial(palette || identityColor, isWhitewash);
    const darkMetalMat = this.mats.darkMetalMat;
    const gunSteelMat = this.mats.gunSteelMat;
    const trackSteelMat = this.mats.trackSteelMat;
    const rubberMat = this.mats.rubberMat;
    const stowageMat = this.mats.stowageMat;
    const paintHex = palette ? palette.base : new THREE.Color(identityColor).multiplyScalar(0.62).getHex();
    const hubPaintMat = this.mats.getPaintMaterial(paintHex, isWhitewash);

    const identityMat = new THREE.MeshStandardMaterial({
      color: identityColor,
      emissive: identityColor,
      emissiveIntensity: isPlayer ? 0.22 : 0.12,
      roughness: 0.5,
      metalness: 0.0,
    });

    const track = this.mats.createTrackMaterials();

    const hullH = spec.hullHeight || 0.7;
    const hullW = spec.hullWidth || 2.2;
    const hullL = spec.hullLength || 4.12;
    const halfTrackX = hullW * 0.5 + 0.34;

    // ========================================================================
    // 1. Running Gear: Tracked belt loop OR 6-Wheeled Recon Car
    // ========================================================================
    const wheels = [];
    let wheelRadius = 0.3;
    if (spec.runningGear === 'wheeled6') {
      wheelRadius = 0.46;
      const tireGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 22);
      tireGeo.rotateZ(Math.PI / 2);
      const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.46, 16);
      hubGeo.rotateZ(Math.PI / 2);
      const nutGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
      nutGeo.rotateZ(Math.PI / 2);

      for (const side of [-1, 1]) {
        const wx = side * (hullW * 0.5 + 0.24);
        for (const wz of [-1.42, 0.12, 1.38]) {
          const wGroup = new THREE.Group();
          wGroup.position.set(wx, 0.46, wz);
          wGroup.add(
            new THREE.Mesh(tireGeo, rubberMat),
            new THREE.Mesh(hubGeo, hubPaintMat),
            new THREE.Mesh(nutGeo, gunSteelMat)
          );
          bodyPivot.add(wGroup);
          wheels.push({ group: wGroup, side });
        }
        // Swept armored wheel fenders
        const fender = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, hullL * 0.94), hullMat);
        fender.position.set(wx, 0.98, 0);
        bodyPivot.add(fender);
      }
      const belly = new THREE.Mesh(new THREE.BoxGeometry(hullW * 0.92, 0.34, hullL * 0.9), hullMat);
      belly.position.set(0, 0.42, 0);
      bodyPivot.add(belly);
    } else {
      // Belt loop: top + bottom runs wrapping front/rear drums, road wheels visible in between
      const trackW = 0.74;
      const runLen = hullL * 0.96;
      const drumR = 0.36;
      const drumY = 0.42;
      const runMats = [track.sideMat, track.sideMat, track.runMat, track.runMat, track.sideMat, track.sideMat];
      const runGeo = new THREE.BoxGeometry(trackW, 0.08, runLen);
      const drumGeo = new THREE.CylinderGeometry(drumR, drumR, trackW, 24);
      drumGeo.rotateZ(Math.PI / 2);
      const sprocketGeo = new THREE.CylinderGeometry(0.2, 0.2, trackW + 0.06, 12);
      sprocketGeo.rotateZ(Math.PI / 2);
      const roadTireGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.56, 22);
      roadTireGeo.rotateZ(Math.PI / 2);
      const dishHubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.6, 16);
      dishHubGeo.rotateZ(Math.PI / 2);
      const axleCapGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.66, 8);
      axleCapGeo.rotateZ(Math.PI / 2);
      const rollerGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.4, 10);
      rollerGeo.rotateZ(Math.PI / 2);

      wheelRadius = 0.3;
      for (const side of [-1, 1]) {
        const tx = side * halfTrackX;

        const topRun = new THREE.Mesh(runGeo, runMats);
        topRun.position.set(tx, drumY + drumR - 0.04, 0);
        bodyPivot.add(topRun);

        const bottomRun = new THREE.Mesh(runGeo, runMats);
        bottomRun.position.set(tx, 0.04, 0);
        bodyPivot.add(bottomRun);

        for (const dz of [-runLen * 0.5, runLen * 0.5]) {
          const drum = new THREE.Mesh(drumGeo, [track.wrapMat, darkMetalMat, darkMetalMat]);
          drum.position.set(tx, drumY, dz);
          bodyPivot.add(drum);
          const hub = new THREE.Mesh(sprocketGeo, gunSteelMat);
          hub.position.set(tx, drumY, dz);
          bodyPivot.add(hub);
        }

        // Return rollers under the top run
        for (const rz of [-runLen * 0.2, runLen * 0.2]) {
          const roller = new THREE.Mesh(rollerGeo, darkMetalMat);
          roller.position.set(tx - side * 0.08, drumY + drumR - 0.16, rz);
          bodyPivot.add(roller);
        }

        // Rubber-tired road wheels: dark rubber rim around a painted dished hub
        const nWheels = 6;
        const span = runLen - drumR * 2.6;
        for (let w = 0; w < nWheels; w++) {
          const wz = -span * 0.5 + (span * w) / (nWheels - 1);
          const wGroup = new THREE.Group();
          wGroup.position.set(tx, 0.385, wz);
          wGroup.add(
            new THREE.Mesh(roadTireGeo, rubberMat),
            new THREE.Mesh(dishHubGeo, hubPaintMat),
            new THREE.Mesh(axleCapGeo, gunSteelMat)
          );
          bodyPivot.add(wGroup);
          wheels.push({ group: wGroup, side });
        }

        // Optional Ballistic Side Skirts (tier-dependent!)
        if (spec.hasSideSkirts !== false) {
          for (let sIdx = 0; sIdx < 4; sIdx++) {
            const sz = -1.44 + sIdx * 0.96;
            const skirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.9), hullMat);
            skirtPanel.position.set(side * (halfTrackX + 0.43), 0.8, sz);
            bodyPivot.add(skirtPanel);
          }
        }

        const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.14, hullL + 0.06), hullMat);
        sponson.position.set(tx, 0.98, 0);
        bodyPivot.add(sponson);

        const frontMudguard = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.1, 0.42), hullMat);
        frontMudguard.position.set(tx, 0.92, -hullL * 0.54);
        frontMudguard.rotation.x = 0.45;
        bodyPivot.add(frontMudguard);

        const rearMudflap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.06), rubberMat);
        rearMudflap.position.set(tx, 0.8, hullL * 0.53);
        bodyPivot.add(rearMudflap);
      }

      // Lower hull between the tracks (fills the gap seen between road wheels)
      const belly = new THREE.Mesh(new THREE.BoxGeometry(hullW, 0.4, hullL * 0.9), hullMat);
      belly.position.set(0, 0.36, 0);
      bodyPivot.add(belly);
    }

    // ========================================================================
    // 2. Armored Hull, Sloped Glacis, Engine Deck & Rear 1-Hit Reactor Core
    // ========================================================================
    const hullY = 0.42 + hullH * 0.5;
    const hullTopY = 0.42 + hullH;

    const mainHull = new THREE.Mesh(new THREE.BoxGeometry(hullW, hullH, hullL), hullMat);
    mainHull.position.set(0, hullY, 0);
    bodyPivot.add(mainHull);

    const glacisSlope = spec.hullShape === 'sloped' ? 0.36 : 0.24;
    const upperGlacis = new THREE.Mesh(new THREE.BoxGeometry(hullW - 0.04, 0.24, 1.32), hullMat);
    upperGlacis.position.set(0, hullTopY - 0.06, -hullL * 0.36);
    upperGlacis.rotation.x = glacisSlope;
    bodyPivot.add(upperGlacis);

    const lowerNose = new THREE.Mesh(new THREE.BoxGeometry(hullW - 0.06, 0.4, 0.54), hullMat);
    lowerNose.position.set(0, 0.62, -hullL * 0.5);
    lowerNose.rotation.x = -0.45;
    bodyPivot.add(lowerNose);

    // Front spare track links + headlights
    const spareTrackPad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.48), track.runMat);
    spareTrackPad.position.set(0, hullTopY + 0.02, -hullL * 0.4);
    spareTrackPad.rotation.x = glacisSlope;
    bodyPivot.add(spareTrackPad);

    const lensGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 14);
    lensGeo.rotateX(Math.PI / 2);
    for (const hx of [-hullW * 0.42, hullW * 0.42]) {
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.22), hullMat);
      guard.position.set(hx, hullTopY - 0.02, -hullL * 0.47);
      bodyPivot.add(guard);
      const lens = new THREE.Mesh(lensGeo, this.mats.lensMat);
      lens.position.set(hx, hullTopY - 0.02, -hullL * 0.5);
      bodyPivot.add(lens);
    }

    // Rear engine deck + twin cooling fans + exhaust stacks
    const deckRaised = new THREE.Mesh(new THREE.BoxGeometry(hullW - 0.14, 0.14, 1.35), hullMat);
    deckRaised.position.set(0, hullTopY + 0.04, hullL * 0.31);
    bodyPivot.add(deckRaised);

    const fanGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20);
    for (const fx of [-0.48, 0.48]) {
      const fan = new THREE.Mesh(fanGeo, this.mats.fanGrillMat);
      fan.position.set(fx, hullTopY + 0.12, hullL * 0.32);
      bodyPivot.add(fan);
    }

    const exhaust = new THREE.Object3D();
    exhaust.position.set(hullW * 0.3, hullTopY + 0.2, hullL * 0.46);
    bodyPivot.add(exhaust);

    // Rear Transom: Louvered Exhaust + Glowing 1-Hit Reactor Weakspot + Tail Lamps
    const rearZ = hullL * 0.5;
    const rearGrilleBox = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.46, 0.14), darkMetalMat);
    rearGrilleBox.position.set(0, 0.78, rearZ);
    bodyPivot.add(rearGrilleBox);

    const weakspotMat = new THREE.MeshBasicMaterial({ color: isPlayer ? 0xea580c : 0xff3b30 });
    const rearWeakspot = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.08), weakspotMat);
    rearWeakspot.position.set(0, 0.78, rearZ + 0.04);
    bodyPivot.add(rearWeakspot);

    for (let ly = -0.1; ly <= 0.11; ly += 0.07) {
      const louver = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.03, 0.12), darkMetalMat);
      louver.position.set(0, 0.78 + ly, rearZ + 0.06);
      bodyPivot.add(louver);
    }

    const brakeLensMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    for (const lx of [-hullW * 0.44, hullW * 0.44]) {
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 14), darkMetalMat);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(lx, 0.92, rearZ + 0.02);
      bodyPivot.add(bezel);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 14), brakeLensMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(lx, 0.92, rearZ + 0.03);
      bodyPivot.add(lamp);
    }

    // Amphibious Hover-Skirt Pontoons (hidden unless HOVER active)
    const pontoonGroup = new THREE.Group();
    const pontoonMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      emissive: 0x0f766e,
      emissiveIntensity: 0.35,
      roughness: 0.35,
    });
    const pGeo = new THREE.CylinderGeometry(0.34, 0.34, hullL + 0.3, 14);
    pGeo.rotateX(Math.PI / 2);
    const pL = new THREE.Mesh(pGeo, pontoonMat);
    pL.position.set(-(halfTrackX + 0.62), 0.38, 0);
    const pR = new THREE.Mesh(pGeo, pontoonMat);
    pR.position.set(halfTrackX + 0.62, 0.38, 0);
    pontoonGroup.add(pL, pR);
    pontoonGroup.visible = false;
    bodyPivot.add(pontoonGroup);

    // Carried Wall Cargo Indicators (Brick / Concrete / Steel)
    const cargoGeo = new THREE.BoxGeometry(0.88, 0.68, 0.88);
    const carriedBrick = new THREE.Mesh(cargoGeo, this.mats.brick);
    carriedBrick.position.set(0, hullTopY + 0.46, hullL * 0.35);
    carriedBrick.visible = false;
    bodyPivot.add(carriedBrick);

    const carriedConcrete = new THREE.Mesh(cargoGeo, this.mats.concrete);
    carriedConcrete.position.set(0, hullTopY + 0.46, hullL * 0.35);
    carriedConcrete.visible = false;
    bodyPivot.add(carriedConcrete);

    const carriedSteel = new THREE.Mesh(cargoGeo, this.mats.steel);
    carriedSteel.position.set(0, hullTopY + 0.46, hullL * 0.35);
    carriedSteel.visible = false;
    bodyPivot.add(carriedSteel);

    // ========================================================================
    // 3. Vehicle-Specific Turret + Identity Roof Band + Cupola + Bustle Rack
    // ========================================================================
    const turretPivot = new THREE.Group();
    turretPivot.position.set(0, hullTopY + 0.08, spec.turretZ ?? -0.1);
    bodyPivot.add(turretPivot);

    const turretRing = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.0, 0.14, 24), darkMetalMat);
    turretRing.position.set(0, 0.04, -0.04);
    turretPivot.add(turretRing);

    const tScale = spec.turretScale || [1, 1, 1];
    const turretShell = new THREE.Mesh(getTurretGeometry(spec.turretShape || 'wedge_mbt'), turretMat);
    turretShell.scale.set(tScale[0], tScale[1], tScale[2]);
    turretShell.position.set(0, 0.08, 0);
    turretPivot.add(turretShell);

    // ERA Brick Clusters on T-90A front cheeks
    if (spec.turretShape === 'era_dome') {
      for (const sx of [-0.72, 0.72]) {
        const era = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.34), turretMat);
        era.position.set(sx, 0.36, -0.88);
        era.rotation.y = sx < 0 ? 0.55 : -0.55;
        turretPivot.add(era);
      }
    }

    // High-visibility Player Identity Band on Turret Roof (stays distinct from national camo!)
    const idBand = new THREE.Mesh(new THREE.BoxGeometry(1.18 * tScale[0], 0.07, 0.22), identityMat);
    idBand.position.set(0, 0.72 * tScale[1] + 0.04, 0.25);
    turretPivot.add(idBand);

    const starDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.74), this.mats.starDecalMat);
    starDecal.rotation.x = -Math.PI / 2;
    starDecal.position.set(0, 0.72 * tScale[1] + 0.08, 0.56);
    turretPivot.add(starDecal);

    // Commander Cupola + Roof MG
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 18), turretMat);
    cupola.position.set(0.42 * tScale[0], 0.72 * tScale[1] + 0.04, -0.06);
    turretPivot.add(cupola);

    const mgGroup = new THREE.Group();
    mgGroup.position.set(0.42 * tScale[0], 0.72 * tScale[1] + 0.2, -0.14);
    const mgReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.44), darkMetalMat);
    const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.62, 10), gunSteelMat);
    mgBarrel.rotation.x = Math.PI / 2;
    mgBarrel.position.set(0, 0.02, -0.48);
    mgGroup.add(mgReceiver, mgBarrel);
    turretPivot.add(mgGroup);

    // Optional Bustle Storage Basket (modern MBT tiers)
    if (spec.hasBustleRack) {
      const rackGroup = new THREE.Group();
      for (const ry of [0.24, 0.46]) {
        const rearRail = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.9, 8), darkMetalMat);
        rearRail.rotation.z = Math.PI / 2;
        rearRail.position.set(0, ry, 1.52 * tScale[2]);
        rackGroup.add(rearRail);
      }
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.3), stowageMat);
      pack.position.set(0, 0.36, 1.38 * tScale[2]);
      rackGroup.add(pack);
      turretPivot.add(rackGroup);
    }

    // Gunner Thermal Optic Doghouse (glows green on target lock!)
    const doghouse = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.34), turretMat);
    doghouse.position.set(-0.44 * tScale[0], 0.72 * tScale[1] + 0.06, -0.48);
    turretPivot.add(doghouse);

    const sensorMat = new THREE.MeshBasicMaterial({ color: isPlayer ? 0x38bdf8 : 0xef4444 });
    const sensorEye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.06), sensorMat);
    sensorEye.position.set(-0.44 * tScale[0], 0.72 * tScale[1] + 0.07, -0.66);
    turretPivot.add(sensorEye);

    // ========================================================================
    // 4. Main Cannon: painted cast mantlet + breech-end tube, bare-metal muzzle-end tube,
    //    muzzle hardware and a dark bore. 24-segment smooth tubes keep one unbroken
    //    specular streak along the gun.
    // ========================================================================
    const barrelBaseZ = -0.92 * tScale[2];
    const barrelPivot = new THREE.Group();
    barrelPivot.position.set(0, 0.36 * tScale[1], barrelBaseZ);
    turretPivot.add(barrelPivot);

    const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.38, 0.4), turretMat);
    barrelPivot.add(mantlet);
    const gunShieldGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.74, 20);
    gunShieldGeo.rotateZ(Math.PI / 2);
    const gunShield = new THREE.Mesh(gunShieldGeo, turretMat);
    gunShield.position.set(0, 0, -0.2);
    barrelPivot.add(gunShield);

    const bLen = spec.barrelLength || 2.55;
    const bCal = spec.barrelCaliber || 0.128;
    const tubeStartZ = -0.28;
    const rearLen = bLen * 0.5;
    const frontLen = bLen - rearLen;

    // CylinderGeometry after rotateX(+PI/2): radiusTop -> breech (+z), radiusBottom -> muzzle (-z)
    const rearTubeGeo = new THREE.CylinderGeometry(bCal * 1.16, bCal * 1.04, rearLen, 24);
    rearTubeGeo.rotateX(Math.PI / 2);
    const rearTube = new THREE.Mesh(rearTubeGeo, turretMat);
    rearTube.position.set(0, 0, tubeStartZ - rearLen * 0.5);
    barrelPivot.add(rearTube);

    const frontTubeGeo = new THREE.CylinderGeometry(bCal * 1.0, bCal * 0.9, frontLen, 24, 1, true);
    frontTubeGeo.rotateX(Math.PI / 2);
    const frontTube = new THREE.Mesh(frontTubeGeo, gunSteelMat);
    frontTube.position.set(0, 0, tubeStartZ - rearLen - frontLen * 0.5);
    barrelPivot.add(frontTube);

    // Thin steel band where the paint ends
    const bandGeo = new THREE.CylinderGeometry(bCal * 1.12, bCal * 1.12, 0.06, 24);
    bandGeo.rotateX(Math.PI / 2);
    const band = new THREE.Mesh(bandGeo, gunSteelMat);
    band.position.set(0, 0, tubeStartZ - rearLen);
    barrelPivot.add(band);

    const tubeEndZ = tubeStartZ - bLen;

    if (spec.hasBoreEvacuator) {
      const evacGeo = new THREE.CylinderGeometry(bCal * 1.5, bCal * 1.5, 0.52, 24);
      evacGeo.rotateX(Math.PI / 2);
      const evac = new THREE.Mesh(evacGeo, turretMat);
      evac.position.set(0, 0, tubeStartZ - rearLen * 0.82);
      barrelPivot.add(evac);
    }

    let muzzleZ;
    if (spec.hasMuzzleBrake) {
      const brakeGeo = new THREE.CylinderGeometry(bCal * 1.45, bCal * 1.45, 0.36, 24);
      brakeGeo.rotateX(Math.PI / 2);
      brakeGeo.scale(1.25, 0.88, 1);
      const brake = new THREE.Mesh(brakeGeo, darkMetalMat);
      brake.position.set(0, 0, tubeEndZ - 0.16);
      barrelPivot.add(brake);
      // Side ports
      for (const sx of [-1, 1]) {
        const port = new THREE.Mesh(new THREE.BoxGeometry(0.02, bCal * 1.4, 0.12), this.mats.boreMat);
        port.position.set(sx * bCal * 1.8, 0, tubeEndZ - 0.16);
        barrelPivot.add(port);
      }
      muzzleZ = tubeEndZ - 0.34;
    } else {
      const collarGeo = new THREE.CylinderGeometry(bCal * 1.16, bCal * 1.1, 0.22, 24);
      collarGeo.rotateX(Math.PI / 2);
      const collar = new THREE.Mesh(collarGeo, gunSteelMat);
      collar.position.set(0, 0, tubeEndZ - 0.08);
      barrelPivot.add(collar);
      muzzleZ = tubeEndZ - 0.19;
    }

    // Dark bore (inner radius 0.69 cal, after Tanks3D's muzzle lip)
    const boreGeo = new THREE.CircleGeometry(bCal * 0.69, 18);
    boreGeo.rotateY(Math.PI);
    const bore = new THREE.Mesh(boreGeo, this.mats.boreMat);
    bore.position.set(0, 0, muzzleZ - 0.005);
    barrelPivot.add(bore);

    const muzzleTip = new THREE.Object3D();
    muzzleTip.position.set(0, 0, muzzleZ - 0.02);
    barrelPivot.add(muzzleTip);

    // Heavy Thermal Shroud (visible on Tier III+)
    const heavyShroud = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, bLen * 0.55), darkMetalMat);
    heavyShroud.position.set(0, 0.04, -bLen * 0.35);
    heavyShroud.visible = false;
    barrelPivot.add(heavyShroud);

    // Directional muzzle jet (additive, scaled to caliber, animated in syncRig)
    const flashMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const muzzleFlash = new THREE.Mesh(_muzzleJetGeo, flashMat);
    const jetScale = clamp(bCal / 0.11, 0.85, 1.6);
    muzzleFlash.userData.baseScale = jetScale * 1.35;
    muzzleFlash.position.set(0, 0, muzzleZ - 0.02);
    muzzleFlash.visible = false;
    barrelPivot.add(muzzleFlash);

    // Forward Laser Target Designator
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -bLen - 0.28),
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

    // Clean Low-Profile Ground Shield Ring
    const shieldMesh = new THREE.Group();
    const sRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.55, 0.065, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65 })
    );
    sRing.rotation.x = Math.PI / 2;
    sRing.position.y = 0.14;
    shieldMesh.add(sRing);
    shieldMesh.visible = false;
    root.add(shieldMesh);

    // Soft contact shadow pad: grounds the hull even where the sun shadow falls behind it
    const contactShadow = new THREE.Mesh(_contactGeo, this.mats.contactShadowMat);
    contactShadow.scale.set(hullW + 1.6, 1, hullL + 1.4);
    contactShadow.position.y = 0.03;
    contactShadow.renderOrder = -1;
    root.add(contactShadow);

    // ========================================================================
    // 5. Shadows + geometry reuse + baked triplanar camo attributes
    // ========================================================================
    const armorMats = new Set([hullMat, turretMat]);
    const noShadow = new Set([flashMat, this.mats.starDecalMat, this.mats.contactShadowMat, this.mats.boreMat]);
    this._finalizeGeometry(spec, root, bodyPivot, turretPivot, armorMats, noShadow);

    return {
      root,
      bodyPivot,
      turretPivot,
      barrelPivot,
      barrelBaseZ,
      hullMat,
      turretMat,
      sensorMat,
      laserLine,
      laserMat,
      muzzleFlash,
      flashMat,
      muzzleTip,
      exhaust,
      heavyShroud,
      shieldMesh,
      pontoonGroup,
      carriedBrick,
      carriedConcrete,
      carriedSteel,
      track,
      trackScroll: {
        run: track.runTex.repeat.y / Math.max(0.5, hullL * 0.96),
        side: track.sideTex.repeat.x / Math.max(0.5, hullL * 0.96),
        wrap: track.wrapTex.repeat.x / (Math.PI * 2 * 0.36),
      },
      wheelRadius,
      wheels,
      halfTrackX,
      hullLength: hullL,
      flashAge: 1,
      lastMuzzleTimer: 0,
    };
  }

  _finalizeGeometry(spec, root, bodyPivot, turretPivot, armorMats, noShadow) {
    const vehicleKey = spec.id || spec.name || `${spec.turretShape}_${spec.hullLength}`;
    root.updateMatrixWorld(true);
    _tmpRoot.copy(root.matrixWorld).invert();
    const bodyInv = new THREE.Matrix4().copy(bodyPivot.matrixWorld).invert();
    const turretInv = new THREE.Matrix4().copy(turretPivot.matrixWorld).invert();

    let i = 0;
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const key = `${vehicleKey}#${i++}`;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const isArmor = mats.some((m) => armorMats.has(m));
      const castable = !mats.some((m) => noShadow.has(m) || m.transparent);

      let cached = _rigGeoCache.get(key);
      if (!cached) {
        let geo = obj.geometry;
        if (isArmor) {
          // Camo pattern lives in turret space for everything riding the turret
          let inTurret = false;
          for (let p = obj.parent; p; p = p.parent) {
            if (p === turretPivot) { inTurret = true; break; }
          }
          _tmpInv.copy(inTurret ? turretInv : bodyInv);
          _tmpRel.multiplyMatrices(_tmpInv, obj.matrixWorld);
          const toRoot = new THREE.Matrix4().multiplyMatrices(_tmpRoot, obj.matrixWorld);
          geo = bakeArmorAttributes(obj.geometry, _tmpRel, toRoot);
        }
        cached = geo;
        _rigGeoCache.set(key, cached);
      }
      obj.geometry = cached;

      obj.castShadow = castable;
      obj.receiveShadow = isArmor;
    });
  }

  /**
   * Synchronize a tank entity's simulation state to its 3D rig (suspension pitch/roll,
   * idle breathing, displacement-driven treads/wheels, turret slew, recoil, buffs).
   */
  syncRig(tank, dt) {
    const rig = tank.rig;
    if (!rig) return;

    rig.root.visible = Boolean(tank.alive);
    if (!tank.alive) return;

    rig.root.position.set(tank.x, 0, tank.z);
    rig.root.rotation.y = tank.yaw;

    // Suspension pitch, turning roll, and subtle idle engine breathing
    rig.bodyPivot.position.y = tank.idleBob || 0;
    rig.bodyPivot.rotation.x = clamp(tank.pitch || 0, -0.085, 0.085);
    rig.bodyPivot.rotation.z = clamp(tank.roll || 0, -0.065, 0.065);
    rig.turretPivot.rotation.y = tank.turretOffset || 0;

    // Displacement-driven tracks & spinning wheels (never spin when blocked by a wall!)
    const lt = tank.leftTrackTravel || 0;
    const rt = tank.rightTrackTravel || 0;
    const tr = rig.track;
    if (tr) {
      // One shared belt texture per rig: average the two sides (pivot turns read via wheels)
      const avg = (lt + rt) * 0.5;
      tr.runTex.offset.y = (avg * rig.trackScroll.run) % 1;
      tr.sideTex.offset.x = (-avg * rig.trackScroll.side) % 1;
      tr.wrapTex.offset.x = (avg * rig.trackScroll.wrap) % 1;
    }

    if (rig.wheels) {
      const leftAngle = -lt / rig.wheelRadius;
      const rightAngle = -rt / rig.wheelRadius;
      for (const w of rig.wheels) {
        w.group.rotation.x = w.side < 0 ? leftAngle : rightAngle;
      }
    }

    if (tank.recoil > 0) {
      tank.recoil = Math.max(0, tank.recoil - dt * 2.8);
    }
    rig.barrelPivot.position.z = rig.barrelBaseZ + (tank.recoil || 0);

    // New shot? (muzzleTimer jumps up on fire — also true for replicated guest snapshots)
    const mt = tank.muzzleTimer || 0;
    // flashAge guard: replicated guest timers can wobble upward between host snapshots
    if (mt > rig.lastMuzzleTimer + 0.01 && rig.flashAge > 0.1) {
      rig.flashAge = 0;
      if (this.onMuzzleBlast) {
        rig.root.updateMatrixWorld(true);
        rig.muzzleTip.getWorldPosition(_tipPos);
        rig.muzzleTip.getWorldQuaternion(_tipQuat);
        _tipDir.set(0, 0, -1).applyQuaternion(_tipQuat);
        this.onMuzzleBlast(tank, _tipPos, _tipDir, rig.muzzleFlash.userData.baseScale);
      }
    }
    if (tank.muzzleTimer > 0) {
      tank.muzzleTimer = Math.max(0, tank.muzzleTimer - dt);
    }
    rig.lastMuzzleTimer = tank.muzzleTimer || 0;

    // Directional muzzle jet: fast open, slower collapse (Tanks3D timing)
    if (rig.flashAge < MUZZLE_FLASH_LIFE) {
      rig.flashAge += dt;
      const t = clamp(rig.flashAge / MUZZLE_FLASH_LIFE, 0, 1);
      const open = 1 - Math.pow(1 - clamp(t / 0.2, 0, 1), 2);
      const close = smoothstep(0.35, 1, t);
      const base = rig.muzzleFlash.userData.baseScale;
      const sxy = (0.68 + 0.32 * open) * (1 - 0.45 * close) * base;
      const sz = (0.84 + 0.36 * open) * (1 - 0.62 * close) * base;
      rig.muzzleFlash.scale.set(sxy, sxy, sz);
      rig.muzzleFlash.rotation.z = rig.flashAge * 9;
      rig.flashMat.opacity = 1 - smoothstep(0.15, 0.96, t);
      rig.muzzleFlash.visible = t < 1;
    } else {
      rig.muzzleFlash.visible = false;
    }

    rig.heavyShroud.visible = tank.weaponTier >= 2;
    rig.pontoonGroup.visible = Boolean(tank.hasHover);
    rig.carriedBrick.visible = tank.carriedTile === TILE.BRICK;
    rig.carriedConcrete.visible = tank.carriedTile === TILE.CONCRETE;
    rig.carriedSteel.visible = tank.carriedTile === TILE.STEEL;

    if (tank.shieldTimer > 0) {
      rig.shieldMesh.visible = true;
      rig.shieldMesh.rotation.y += 2.2 * dt;
    } else {
      rig.shieldMesh.visible = false;
    }

    if (tank.lockedTarget) {
      rig.sensorMat.color.setHex(0x4ade80);
      if (tank.isPlayer && !tank.isAIControlled) {
        rig.laserLine.visible = true;
        const scaleZ = Math.max(0.2, (tank.lockedDist - 2.85) / (24.0 - 2.85));
        rig.laserLine.scale.set(1, 1, scaleZ);
      } else {
        rig.laserLine.visible = false;
      }
    } else {
      rig.sensorMat.color.setHex(tank.isPlayer ? 0x38bdf8 : 0xef4444);
      rig.laserLine.visible = false;
    }

    if (this.onVehicleFrame && dt > 0) this.onVehicleFrame(tank, rig, dt);
  }
}
