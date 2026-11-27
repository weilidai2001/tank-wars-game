import * as THREE from '../../vendor/three.module.min.js';
import { TILE } from '../config/constants.js';
import { clamp } from '../core/MathUtils.js';

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

/**
 * Data-driven 3D Tank & Armored Vehicle Mesh Builder (SRP + Open/Closed Principle).
 * Builds distinct hulls, turrets, running gear (tracked OR 6-wheeled recon car),
 * national camouflage, player identity stripes, and smooth-shaded cannon barrels
 * purely from a declarative vehicleSpec.
 */
export class TankMeshBuilder {
  constructor(mats) {
    this.mats = mats;
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
    const rubberMat = this.mats.rubberMat;
    const stowageMat = this.mats.stowageMat;

    const identityMat = new THREE.MeshStandardMaterial({
      color: identityColor,
      emissive: identityColor,
      emissiveIntensity: isPlayer ? 0.28 : 0.15,
      roughness: 0.4,
      metalness: 0.2,
    });

    const wheelRimMat = new THREE.MeshStandardMaterial({
      color: palette ? palette.base : identityColor,
      roughness: 0.62,
      metalness: 0.22,
    });

    const leftTreadTex = this.mats.baseTreadTex.clone();
    leftTreadTex.needsUpdate = true;
    const rightTreadTex = this.mats.baseTreadTex.clone();
    rightTreadTex.needsUpdate = true;

    const leftTreadMat = new THREE.MeshStandardMaterial({
      map: leftTreadTex,
      roughness: 0.72,
      metalness: 0.35,
    });
    const rightTreadMat = new THREE.MeshStandardMaterial({
      map: rightTreadTex,
      roughness: 0.72,
      metalness: 0.35,
    });

    const hullH = spec.hullHeight || 0.7;
    const hullW = spec.hullWidth || 2.2;
    const hullL = spec.hullLength || 4.12;
    const halfTrackX = hullW * 0.5 + 0.34;

    // ========================================================================
    // 1. Running Gear: Tracked Caterpillar OR 6-Wheeled Recon Car!
    // ========================================================================
    const wheels = [];
    if (spec.runningGear === 'wheeled6') {
      // 6-Wheeled Armored Recon Car (Sd.Kfz. 231 style from Tanks3D!)
      const tireGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 16);
      tireGeo.rotateZ(Math.PI / 2);
      const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.46, 12);
      hubGeo.rotateZ(Math.PI / 2);

      for (const side of [-1, 1]) {
        const wx = side * (hullW * 0.5 + 0.24);
        for (const wz of [-1.42, 0.12, 1.38]) {
          const wGroup = new THREE.Group();
          wGroup.position.set(wx, 0.46, wz);
          wGroup.add(
            new THREE.Mesh(tireGeo, rubberMat),
            new THREE.Mesh(hubGeo, wheelRimMat)
          );
          wGroup.children[0].castShadow = true;
          bodyPivot.add(wGroup);
          wheels.push({ group: wGroup, side });
        }
        // Swept armored wheel fenders
        const fender = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, hullL * 0.94), hullMat);
        fender.position.set(wx, 0.98, 0);
        fender.castShadow = true;
        bodyPivot.add(fender);
      }
    } else {
      const trackBottomGeo = new THREE.BoxGeometry(0.74, 0.7, hullL * 0.86);
      const trackRampGeo = new THREE.BoxGeometry(0.73, 0.22, 0.8);
      const sprocketGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.76, 14);
      sprocketGeo.rotateZ(Math.PI / 2);
      const roadTireGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.76, 14);
      roadTireGeo.rotateZ(Math.PI / 2);
      const dishHubGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.8, 10);
      dishHubGeo.rotateZ(Math.PI / 2);
      const axleCapGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.84, 8);
      axleCapGeo.rotateZ(Math.PI / 2);

      for (const side of [-1, 1]) {
        const tx = side * halfTrackX;
        const tMat = side < 0 ? leftTreadMat : rightTreadMat;

        const beltCore = new THREE.Mesh(trackBottomGeo, tMat);
        beltCore.position.set(tx, 0.37, 0);
        beltCore.castShadow = true;
        beltCore.receiveShadow = true;
        bodyPivot.add(beltCore);

        const frontClimb = new THREE.Mesh(trackRampGeo, tMat);
        frontClimb.position.set(tx, 0.38, -hullL * 0.44);
        frontClimb.rotation.x = 0.42;
        bodyPivot.add(frontClimb);

        const rearClimb = new THREE.Mesh(trackRampGeo, tMat);
        rearClimb.position.set(tx, 0.38, hullL * 0.44);
        rearClimb.rotation.x = -0.42;
        bodyPivot.add(rearClimb);

        for (const dz of [-hullL * 0.48, hullL * 0.48]) {
          const drum = new THREE.Mesh(sprocketGeo, tMat);
          drum.position.set(tx, 0.56, dz);
          drum.castShadow = true;
          bodyPivot.add(drum);

          const cap = new THREE.Mesh(dishHubGeo, darkMetalMat);
          cap.position.set(tx, 0.56, dz);
          bodyPivot.add(cap);
        }

        // 6 Dual Rubber-Tired Road Wheels per side
        for (const wz of [-1.42, -0.85, -0.28, 0.28, 0.85, 1.42]) {
          const wGroup = new THREE.Group();
          wGroup.position.set(tx, 0.32, wz);
          wGroup.add(
            new THREE.Mesh(roadTireGeo, rubberMat),
            new THREE.Mesh(dishHubGeo, wheelRimMat),
            new THREE.Mesh(axleCapGeo, darkMetalMat)
          );
          bodyPivot.add(wGroup);
          wheels.push({ group: wGroup, side });
        }

        // Optional Ballistic Side Skirts (tier-dependent!)
        if (spec.hasSideSkirts !== false) {
          for (let sIdx = 0; sIdx < 4; sIdx++) {
            const sz = -1.44 + sIdx * 0.96;
            const skirtPanel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.44, 0.9), hullMat);
            skirtPanel.position.set(side * (halfTrackX + 0.41), 0.78, sz);
            skirtPanel.castShadow = true;
            bodyPivot.add(skirtPanel);
          }
        }

        const sponson = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.18, hullL + 0.06), hullMat);
        sponson.position.set(tx, 0.96, 0);
        sponson.castShadow = true;
        sponson.receiveShadow = true;
        bodyPivot.add(sponson);

        const frontMudguard = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.42), hullMat);
        frontMudguard.position.set(tx, 0.88, -hullL * 0.54);
        frontMudguard.rotation.x = 0.45;
        bodyPivot.add(frontMudguard);

        const rearMudflap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.32, 0.08), rubberMat);
        rearMudflap.position.set(tx, 0.75, hullL * 0.52);
        bodyPivot.add(rearMudflap);
      }
    }

    // ========================================================================
    // 2. Armored Hull, Sloped Glacis, Engine Deck & Rear 1-Hit Reactor Core
    // ========================================================================
    const hullY = 0.42 + hullH * 0.5;
    const hullTopY = 0.42 + hullH;

    const mainHull = new THREE.Mesh(new THREE.BoxGeometry(hullW, hullH, hullL), hullMat);
    mainHull.position.set(0, hullY, 0);
    mainHull.castShadow = true;
    mainHull.receiveShadow = true;
    bodyPivot.add(mainHull);

    const glacisSlope = spec.hullShape === 'sloped' ? 0.36 : 0.24;
    const upperGlacis = new THREE.Mesh(new THREE.BoxGeometry(hullW - 0.04, 0.24, 1.32), turretMat);
    upperGlacis.position.set(0, hullTopY - 0.06, -hullL * 0.36);
    upperGlacis.rotation.x = glacisSlope;
    upperGlacis.castShadow = true;
    bodyPivot.add(upperGlacis);

    const lowerNose = new THREE.Mesh(new THREE.BoxGeometry(hullW - 0.06, 0.4, 0.54), hullMat);
    lowerNose.position.set(0, 0.62, -hullL * 0.5);
    lowerNose.rotation.x = -0.45;
    bodyPivot.add(lowerNose);

    // Front spare track pad + tow shackles + headlights
    const spareTrackPad = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.13, 0.48), darkMetalMat);
    spareTrackPad.position.set(0, hullTopY + 0.02, -hullL * 0.4);
    spareTrackPad.rotation.x = glacisSlope;
    bodyPivot.add(spareTrackPad);

    const headMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
    for (const hx of [-hullW * 0.42, hullW * 0.42]) {
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.22), darkMetalMat);
      guard.position.set(hx, hullTopY - 0.02, -hullL * 0.47);
      bodyPivot.add(guard);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), headMat);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(hx, hullTopY - 0.02, -hullL * 0.5);
      bodyPivot.add(lens);
    }

    // Rear engine deck + twin cooling fans
    const deckRaised = new THREE.Mesh(new THREE.BoxGeometry(hullW - 0.14, 0.14, 1.35), hullMat);
    deckRaised.position.set(0, hullTopY + 0.04, hullL * 0.31);
    deckRaised.receiveShadow = true;
    bodyPivot.add(deckRaised);

    const fanGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16);
    for (const fx of [-0.48, 0.48]) {
      const fan = new THREE.Mesh(fanGeo, this.mats.fanGrillMat);
      fan.position.set(fx, hullTopY + 0.12, hullL * 0.32);
      bodyPivot.add(fan);
    }

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
      const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 12), darkMetalMat);
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(lx, 0.92, rearZ + 0.02);
      bodyPivot.add(bezel);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12), brakeLensMat);
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
    const pGeo = new THREE.CylinderGeometry(0.34, 0.34, hullL + 0.3, 10);
    pGeo.rotateX(Math.PI / 2);
    const pL = new THREE.Mesh(pGeo, pontoonMat);
    pL.position.set(-(halfTrackX + 0.62), 0.38, 0);
    const pR = new THREE.Mesh(pGeo, pontoonMat);
    pR.position.set(halfTrackX + 0.62, 0.38, 0);
    pontoonGroup.add(pL, pR);
    pontoonGroup.visible = false;
    bodyPivot.add(pontoonGroup);

    // Carried Wall Cargo Indicators (Brick / Concrete / Steel)
    const carriedBrick = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.68, 0.88), this.mats.brick);
    carriedBrick.position.set(0, hullTopY + 0.46, hullL * 0.35);
    carriedBrick.visible = false;
    bodyPivot.add(carriedBrick);

    const carriedConcrete = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.68, 0.88), this.mats.concrete);
    carriedConcrete.position.set(0, hullTopY + 0.46, hullL * 0.35);
    carriedConcrete.visible = false;
    bodyPivot.add(carriedConcrete);

    const carriedSteel = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.68, 0.88), this.mats.steel);
    carriedSteel.position.set(0, hullTopY + 0.46, hullL * 0.35);
    carriedSteel.visible = false;
    bodyPivot.add(carriedSteel);

    // ========================================================================
    // 3. Vehicle-Specific Turret + Identity Roof Band + Cupola + Bustle Rack
    // ========================================================================
    const turretPivot = new THREE.Group();
    turretPivot.position.set(0, hullTopY + 0.08, spec.turretZ ?? -0.1);
    bodyPivot.add(turretPivot);

    const turretRing = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.0, 0.14, 18), darkMetalMat);
    turretRing.position.set(0, 0.04, -0.04);
    turretPivot.add(turretRing);

    const tScale = spec.turretScale || [1, 1, 1];
    const turretShell = new THREE.Mesh(getTurretGeometry(spec.turretShape || 'wedge_mbt'), turretMat);
    turretShell.scale.set(tScale[0], tScale[1], tScale[2]);
    turretShell.position.set(0, 0.08, 0);
    turretShell.castShadow = true;
    turretShell.receiveShadow = true;
    turretPivot.add(turretShell);

    // ERA Brick Clusters on T-90A front cheeks
    if (spec.turretShape === 'era_dome') {
      for (const sx of [-0.72, 0.72]) {
        const era = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.34), darkMetalMat);
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
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.16, 14), darkMetalMat);
    cupola.position.set(0.42 * tScale[0], 0.72 * tScale[1] + 0.04, -0.06);
    turretPivot.add(cupola);

    const mgGroup = new THREE.Group();
    mgGroup.position.set(0.42 * tScale[0], 0.72 * tScale[1] + 0.2, -0.14);
    const mgReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.44), gunSteelMat);
    const mgBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.62, 8), darkMetalMat);
    mgBarrel.rotation.x = Math.PI / 2;
    mgBarrel.position.set(0, 0.02, -0.48);
    mgGroup.add(mgReceiver, mgBarrel);
    turretPivot.add(mgGroup);

    // Optional Bustle Storage Basket (modern MBT tiers)
    if (spec.hasBustleRack) {
      const rackGroup = new THREE.Group();
      for (const ry of [0.24, 0.46]) {
        const rearRail = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.9, 8), gunSteelMat);
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
    const doghouse = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.34), darkMetalMat);
    doghouse.position.set(-0.44 * tScale[0], 0.72 * tScale[1] + 0.06, -0.48);
    turretPivot.add(doghouse);

    const sensorMat = new THREE.MeshBasicMaterial({ color: isPlayer ? 0x38bdf8 : 0xef4444 });
    const sensorEye = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.06), sensorMat);
    sensorEye.position.set(-0.44 * tScale[0], 0.72 * tScale[1] + 0.07, -0.66);
    turretPivot.add(sensorEye);

    // ========================================================================
    // 4. Smooth-Shaded Main Cannon + Bore Evacuator / Muzzle Brake
    // ========================================================================
    const barrelBaseZ = -0.92 * tScale[2];
    const barrelPivot = new THREE.Group();
    barrelPivot.position.set(0, 0.36 * tScale[1], barrelBaseZ);
    turretPivot.add(barrelPivot);

    const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.48), darkMetalMat);
    mantlet.castShadow = true;
    barrelPivot.add(mantlet);

    const bLen = spec.barrelLength || 2.55;
    const bCal = spec.barrelCaliber || 0.128;

    // 18-segment smooth cylinder gives continuous specular highlight along the gun barrel!
    const barrelGeo = new THREE.CylinderGeometry(bCal * 0.86, bCal * 1.08, bLen, 18);
    barrelGeo.rotateX(Math.PI / 2);
    const barrelMesh = new THREE.Mesh(barrelGeo, gunSteelMat);
    barrelMesh.position.set(0, 0, -bLen * 0.5 - 0.18);
    barrelMesh.castShadow = true;
    barrelPivot.add(barrelMesh);

    if (spec.hasBoreEvacuator) {
      const evacGeo = new THREE.CylinderGeometry(bCal * 1.48, bCal * 1.48, 0.54, 18);
      evacGeo.rotateX(Math.PI / 2);
      const evac = new THREE.Mesh(evacGeo, turretMat);
      evac.position.set(0, 0, -bLen * 0.46 - 0.18);
      evac.castShadow = true;
      barrelPivot.add(evac);
    }

    if (spec.hasMuzzleBrake) {
      const brakeGeo = new THREE.BoxGeometry(bCal * 2.8, bCal * 2.1, 0.36);
      const brake = new THREE.Mesh(brakeGeo, darkMetalMat);
      brake.position.set(0, 0, -bLen - 0.22);
      barrelPivot.add(brake);
    } else {
      const collarGeo = new THREE.CylinderGeometry(bCal * 1.18, bCal * 1.1, 0.24, 16);
      collarGeo.rotateX(Math.PI / 2);
      const collar = new THREE.Mesh(collarGeo, darkMetalMat);
      collar.position.set(0, 0, -bLen - 0.16);
      barrelPivot.add(collar);
    }

    // Heavy Thermal Shroud (visible on Tier III+)
    const heavyShroud = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, bLen * 0.55), darkMetalMat);
    heavyShroud.position.set(0, 0.04, -bLen * 0.35);
    heavyShroud.visible = false;
    barrelPivot.add(heavyShroud);

    // Multi-Lobe Muzzle Blast Flash
    const muzzleFlash = new THREE.Group();
    const flashCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.46, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.92 })
    );
    flashCore.scale.set(1, 1, 1.9);
    const flashFlare = new THREE.Mesh(
      new THREE.SphereGeometry(0.66, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.65 })
    );
    flashFlare.scale.set(1.25, 1.25, 0.85);
    muzzleFlash.add(flashCore, flashFlare);
    muzzleFlash.position.set(0, 0, -bLen - 0.48);
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
      heavyShroud,
      shieldMesh,
      pontoonGroup,
      carriedBrick,
      carriedConcrete,
      carriedSteel,
      leftTreadTex,
      rightTreadTex,
      wheels,
    };
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

    // Displacement-driven treads & spinning wheels (never spin when blocked by a wall!)
    rig.leftTreadTex.offset.y = ((tank.leftTrackTravel || 0) * 0.35) % 1;
    rig.rightTreadTex.offset.y = ((tank.rightTrackTravel || 0) * 0.35) % 1;

    if (rig.wheels) {
      const leftAngle = -(tank.leftTrackTravel || 0) * 2.2;
      const rightAngle = -(tank.rightTrackTravel || 0) * 2.2;
      for (const w of rig.wheels) {
        w.group.rotation.x = w.side < 0 ? leftAngle : rightAngle;
      }
    }

    if (tank.recoil > 0) {
      tank.recoil = Math.max(0, tank.recoil - dt * 2.8);
    }
    rig.barrelPivot.position.z = rig.barrelBaseZ + (tank.recoil || 0);

    if (tank.muzzleTimer > 0) {
      tank.muzzleTimer = Math.max(0, tank.muzzleTimer - dt);
      rig.muzzleFlash.visible = true;
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
  }
}
