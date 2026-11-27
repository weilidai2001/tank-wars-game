import * as THREE from '../../vendor/three.module.min.js';
import { EVENTS } from '../core/EventBus.js';
import { getPowerupDef } from '../config/powerups.js';
import { TILE } from '../config/constants.js';
import {
  ParticleField, TILE_GLOW, TILE_SMOKE, TILE_STREAK, TILE_FLAME,
} from './ParticleField.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Particle shaders write display-space color directly (no color management), so
// convert hex to raw sRGB triples rather than THREE.Color's linear values.
function rgb(hex, mul = 1) {
  return [((hex >> 16) & 255) / 255 * mul, ((hex >> 8) & 255) / 255 * mul, (hex & 255) / 255 * mul];
}

// Display-space color ramps (Tanks3D explosion palette: #fff0b2 -> #ffd779 -> #f4a43f -> #d66b27)
const WHITE_HOT = [1.25, 1.18, 1.0];
const FLAME_YELLOW = rgb(0xffd779, 1.15);
const FLAME_ORANGE = rgb(0xf4a43f, 1.05);
const FLAME_DEEP = rgb(0xd66b27, 0.95);
const EMBER_RED = rgb(0xc1401c, 0.8);
// Tanks3D smoke: blue-gray (.26,.32,.34) lifting toward (.58,.64,.64) — kept mid-toned so
// plumes read against both the dark asphalt and the sky.
const SMOKE_DARK = rgb(0x4d5759);
const SMOKE_MID = rgb(0x76807f);
const SMOKE_LIGHT = rgb(0xa9b2b1);
const DUST = rgb(0x8a7d66);
const SPARK = [1.3, 1.05, 0.62];

/**
 * Event-Driven 3D VFX, Shell & Crate Renderer (SRP + DIP).
 * Subscribes to EventBus events — simulation never imports Three.js.
 *  - Shell tracers: bright-nosed shell with amber tail, additive streak and smoke trail
 *  - Directional muzzle blasts with smoke, sparks and a light flash
 *  - Layered explosions (white core -> fireballs -> sparks -> debris -> rolling smoke)
 *  - Burning wrecks and HQ fires; smoke from damaged tanks; track dust
 * Everything is pooled: two instanced particle fields, one instanced debris mesh and
 * two always-present flash lights (so the shader light count never changes).
 */
export class EffectsRenderer {
  constructor(scene, bus) {
    this.scene = scene;
    this.bus = bus;

    this.glow = new ParticleField(scene, { capacity: 1400, additive: true, renderOrder: 12 });
    this.smoke = new ParticleField(scene, { capacity: 900, additive: false, renderOrder: 11 });

    // Lit debris chunks (instanced)
    this.debrisCap = 220;
    this.debrisMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.3, 0.22, 0.3),
      new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.1 }),
      this.debrisCap
    );
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.castShadow = true;
    scene.add(this.debrisMesh);
    this.debris = [];
    this._dm = new THREE.Matrix4();
    this._dq = new THREE.Quaternion();
    this._de = new THREE.Euler();
    this._ds = new THREE.Vector3();
    this._dp = new THREE.Vector3();
    this._dc = new THREE.Color();

    // Flash lights (pooled; intensity 0 when idle)
    this.flashLights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffb066, 0, 16, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.flashLights.push({ light: l, t: 1, life: 1, peak: 0 });
    }

    this.rings = [];
    this.beams = [];
    this.fires = [];
    this.scorches = [];

    this._shellMeshes = new Map();
    this._crateMeshes = new Map();

    this.ringGeo = new THREE.RingGeometry(0.4, 0.85, 28);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.scorchGeo = new THREE.CircleGeometry(1, 20);
    this.scorchGeo.rotateX(-Math.PI / 2);
    this.scorchTex = this._makeScorchTexture();

    this.shellGeo = this._makeShellGeometry();
    this.shellMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.crateBoxGeo = new THREE.BoxGeometry(1.85, 1.85, 1.85);
    this.crateCageGeo = new THREE.BoxGeometry(2.15, 2.15, 2.15);

    this._subscribe();
  }

  // ==========================================================================
  // Event wiring
  // ==========================================================================
  _subscribe() {
    this.bus.on(EVENTS.TANK_SPAWNED, ({ x, z }) => this.spawnTeleport(x, z));
    this.bus.on(EVENTS.PLAYER_RESPAWNED, ({ x, z }) => this.spawnTeleport(x, z));
    this.bus.on(EVENTS.WALL_DAMAGED, ({ x, y, z, colorHex, tile }) => {
      if (tile === TILE.STEEL) this.spawnSparks(x, y, z, 11, colorHex);
      else this.spawnMasonryHit(x, y, z, colorHex, false);
    });
    this.bus.on(EVENTS.WALL_BREACHED, ({ x, y, z, colorHex }) => this.spawnMasonryHit(x, y, z, colorHex, true));
    this.bus.on(EVENTS.WALL_RICOCHET, ({ x, y, z, colorHex }) => this.spawnSparks(x, y, z, 9, colorHex));
    this.bus.on(EVENTS.SHELL_CANCELLED, ({ x, y, z }) => this.spawnShellClash(x, y, z));
    this.bus.on(EVENTS.TANK_HIT, ({ x, y, z, colorHex }) => this.spawnArmorHit(x, y, z, colorHex));
    this.bus.on(EVENTS.TANK_DESTROYED, ({ x, y, z, hitInfo }) => {
      const isBack = hitInfo && hitInfo.zone === 'BACK';
      this.spawnTankExplosion(x, y, z, isBack);
    });
    this.bus.on(EVENTS.EAGLE_DESTROYED, ({ x, z }) => {
      this.spawnTankExplosion(x, 2.2, z, true, 1.7);
      this.addFire(x, z, 9.0, 1.6);
    });
    this.bus.on(EVENTS.TRACTOR_USED, ({ fromX, fromZ, toX, toZ, colorHex }) => {
      this.spawnTractorBeam(fromX, 1.8, fromZ, toX, 2.0, toZ, colorHex);
    });
  }

  // ==========================================================================
  // Effect recipes
  // ==========================================================================
  _flash(x, y, z, color, peak, life) {
    let pick = this.flashLights[0];
    for (const f of this.flashLights) {
      const cur = f.peak * Math.max(0, 1 - f.t / f.life);
      const best = pick.peak * Math.max(0, 1 - pick.t / pick.life);
      if (cur < best) pick = f;
    }
    pick.light.position.set(x, y + 0.6, z);
    pick.light.color.setHex(color);
    pick.peak = peak;
    pick.t = 0;
    pick.life = life;
  }

  _burst(field, x, y, z, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = rand(o.upMin ?? 0.2, o.upMax ?? 1);
      const sp = rand(o.speedMin, o.speedMax);
      const h = Math.sqrt(Math.max(0, 1 - up * up));
      field.spawn({
        ...o,
        x: x + rand(-o.jitter || 0, o.jitter || 0),
        y: y + rand(-(o.jitterY || 0), o.jitterY || 0),
        z: z + rand(-o.jitter || 0, o.jitter || 0),
        vx: Math.cos(a) * h * sp,
        vy: up * sp + (o.lift || 0),
        vz: Math.sin(a) * h * sp,
        life: rand(o.lifeMin, o.lifeMax),
        size: o.size * rand(0.75, 1.25),
        sizeEnd: (o.sizeEnd ?? o.size) * rand(0.8, 1.2),
        delay: o.delayMax ? rand(o.delayMin || 0, o.delayMax) : 0,
      });
    }
  }

  spawnSparks(x, y, z, n = 8, tintHex = 0xfef08a) {
    const tint = rgb(tintHex);
    this._burst(this.glow, x, y, z, n, {
      tile: TILE_STREAK, stretch: 0.045, size: 0.16, sizeEnd: 0.06,
      speedMin: 6, speedMax: 16, upMin: -0.2, upMax: 0.9, gravity: -16, drag: 1.5,
      lifeMin: 0.16, lifeMax: 0.38, color: SPARK, colorEnd: [tint[0], tint[1] * 0.7, tint[2] * 0.4],
    });
    this.glow.spawn({ x, y, z, tile: TILE_GLOW, size: 1.6, sizeEnd: 0.6, life: 0.12, color: WHITE_HOT, colorEnd: FLAME_ORANGE });
    this.smoke.spawn({
      x, y, z, vy: 0.8, tile: TILE_SMOKE, size: 0.5, sizeEnd: 1.6, life: 0.55,
      color: SMOKE_LIGHT, alpha: 0.3,
    });
  }

  spawnMasonryHit(x, y, z, colorHex, breach) {
    const n = breach ? 14 : 6;
    this._spawnDebris(x, y, z, n, colorHex, breach ? 9 : 6, 0.9);
    this._burst(this.smoke, x, y, z, breach ? 9 : 4, {
      tile: TILE_SMOKE, size: breach ? 1.0 : 0.6, sizeEnd: breach ? 3.4 : 2.0,
      speedMin: 0.6, speedMax: breach ? 3.2 : 2.0, upMin: 0.1, upMax: 0.7, drag: 2.2, lift: 0.4,
      lifeMin: 0.6, lifeMax: breach ? 1.5 : 0.95, jitter: 0.3,
      color: rgb(colorHex, 0.55).map((v, i) => v * 0.6 + DUST[i] * 0.4), alpha: 0.55, fadeIn: 0.08,
    });
    this.glow.spawn({ x, y, z, tile: TILE_GLOW, size: breach ? 2.2 : 1.2, sizeEnd: 0.5, life: 0.1, color: FLAME_YELLOW });
    if (breach) this._addRing(x, z, colorHex, 0.4, 5.5);
  }

  spawnShellClash(x, y, z) {
    this.glow.spawn({ x, y, z, tile: TILE_GLOW, size: 3.2, sizeEnd: 1.0, life: 0.18, color: WHITE_HOT, colorEnd: FLAME_ORANGE });
    this.spawnSparks(x, y, z, 14, 0xfef08a);
    this._flash(x, y, z, 0xffe4a0, 26, 0.16);
  }

  spawnArmorHit(x, y, z, colorHex = 0xf97316) {
    this.spawnSparks(x, y, z, 10, colorHex);
    this.glow.spawn({ x, y, z, tile: TILE_GLOW, size: 2.0, sizeEnd: 0.8, life: 0.14, color: FLAME_YELLOW, colorEnd: FLAME_DEEP });
    this._burst(this.smoke, x, y, z, 3, {
      tile: TILE_SMOKE, size: 0.6, sizeEnd: 2.0, speedMin: 0.5, speedMax: 1.6,
      upMin: 0.3, upMax: 0.9, drag: 1.8, lifeMin: 0.6, lifeMax: 1.0, color: SMOKE_MID, alpha: 0.5,
    });
    this._flash(x, y, z, 0xffb066, 18, 0.14);
  }

  spawnTeleport(x, z) {
    this._addRing(x, z, 0x38bdf8, 0.45, 4.0);
    this._burst(this.glow, x, 0.8, z, 14, {
      tile: TILE_GLOW, size: 0.45, sizeEnd: 0.1, speedMin: 1.5, speedMax: 4,
      upMin: 0.4, upMax: 1, drag: 1.2, lifeMin: 0.35, lifeMax: 0.7, jitter: 1.0,
      color: [0.6, 0.9, 1.3], colorEnd: [0.2, 0.5, 1.0],
    });
  }

  /**
   * Layered tank explosion (after Tanks3D battle_fx): white core, fireballs, sparks,
   * burning debris, then rolling dark smoke and a burning wreck.
   */
  spawnTankExplosion(x, y, z, big = false, scale = 1) {
    const k = (big ? 1.2 : 1.0) * scale;
    for (let i = 0; i < 2; i++) {
      this.glow.spawn({
        x: x + rand(-0.4, 0.4), y: y + rand(0, 0.5), z: z + rand(-0.4, 0.4),
        tile: TILE_GLOW, size: 2.6 * k, sizeEnd: 5.6 * k, life: rand(0.2, 0.3),
        color: [1.0, 0.92, 0.7], colorEnd: FLAME_DEEP, alpha: 0.85,
      });
    }
    this._burst(this.glow, x, y + 0.3, z, Math.round(14 * k), {
      tile: TILE_SMOKE, size: 1.3 * k, sizeEnd: 3.4 * k, speedMin: 2.5, speedMax: 7.5,
      upMin: 0.1, upMax: 0.9, drag: 4.5, lift: 1.0, lifeMin: 0.32, lifeMax: 0.62, jitter: 0.5,
      color: FLAME_YELLOW, colorEnd: EMBER_RED, rotV: 1.5,
    });
    this._burst(this.glow, x, y + 0.4, z, Math.round(16 * k), {
      tile: TILE_STREAK, stretch: 0.05, size: 0.2, sizeEnd: 0.08,
      speedMin: 8, speedMax: 20, upMin: 0.15, upMax: 1, gravity: -12, drag: 0.9,
      lifeMin: 0.3, lifeMax: 0.75, color: SPARK, colorEnd: FLAME_DEEP,
    });
    // Burning embers that arc and fall
    this._burst(this.glow, x, y + 0.5, z, Math.round(10 * k), {
      tile: TILE_GLOW, size: 0.42, sizeEnd: 0.15, speedMin: 4, speedMax: 9,
      upMin: 0.5, upMax: 1, gravity: -9.8, drag: 0.4, lifeMin: 0.8, lifeMax: 1.4,
      color: FLAME_ORANGE, colorEnd: EMBER_RED,
    });
    this._spawnDebris(x, y, z, Math.round(12 * k), 0x2a2f2c, 11 * k, 1.3);
    // Rolling smoke (starts as the fireball cools)
    this._burst(this.smoke, x, y + 0.6, z, Math.round(16 * k), {
      tile: TILE_SMOKE, size: 1.4 * k, sizeEnd: 5.2 * k, speedMin: 0.8, speedMax: 3.2,
      upMin: 0.25, upMax: 0.9, drag: 1.6, lift: 1.3, lifeMin: 1.2, lifeMax: 2.2,
      delayMin: 0.08, delayMax: 0.3, jitter: 0.8, jitterY: 0.4, fadeIn: 0.12,
      color: SMOKE_DARK, colorEnd: SMOKE_MID, alpha: 0.78, rotV: 0.4,
    });
    this._addRing(x, z, 0xf97316, 0.45, big ? 7 : 5.5);
    this._addScorch(x, z, 1.9 * k);
    this._flash(x, y, z, 0xff9a40, 70 * k, 0.45);
    this.addFire(x, z, big ? 5.0 : 3.6, k);
  }

  /** Burning wreck / HQ fire: flickering flame tongues + a rising smoke column. */
  addFire(x, z, duration = 4, scale = 1) {
    this.fires.push({ x, z, t: 0, duration, scale, flameAcc: 0, smokeAcc: 0 });
    if (this.fires.length > 10) this.fires.shift();
  }

  /** Directional muzzle blast (hook from TankMeshBuilder on every new shot). */
  spawnMuzzleBlast(pos, dir, scale = 1) {
    const { x, y, z } = pos;
    this.glow.spawn({ x, y, z, tile: TILE_GLOW, size: 2.4 * scale, sizeEnd: 1.2 * scale, life: 0.09, color: WHITE_HOT, colorEnd: FLAME_ORANGE });
    // Forward sparks
    for (let i = 0; i < 4; i++) {
      const sp = rand(14, 24);
      this.glow.spawn({
        x, y, z,
        vx: dir.x * sp + rand(-2, 2), vy: dir.y * sp + rand(-0.5, 1.8), vz: dir.z * sp + rand(-2, 2),
        tile: TILE_STREAK, stretch: 0.035, size: 0.14, sizeEnd: 0.05, drag: 3, gravity: -6,
        life: rand(0.1, 0.2), color: SPARK, colorEnd: FLAME_DEEP,
      });
    }
    // Muzzle smoke: pushed forward then lingering
    for (let i = 0; i < 4; i++) {
      const sp = rand(2.5, 7.5);
      this.smoke.spawn({
        x: x + dir.x * 0.3, y, z: z + dir.z * 0.3,
        vx: dir.x * sp + rand(-0.8, 0.8), vy: rand(0.4, 1.2), vz: dir.z * sp + rand(-0.8, 0.8),
        tile: TILE_SMOKE, size: 0.5 * scale, sizeEnd: rand(1.8, 2.6) * scale, drag: 3.2,
        life: rand(0.7, 1.1), color: SMOKE_LIGHT, colorEnd: SMOKE_MID, alpha: 0.42, fadeIn: 0.06, rotV: rand(-1, 1),
      });
    }
    this._flash(x + dir.x * 0.8, y, z + dir.z * 0.8, 0xffc070, 22 * scale, 0.1);
  }

  /** Per-vehicle continuous effects: track dust and damage smoke/fire. */
  emitVehicleEffects(tank, rig, dt) {
    // Track dust kicked up behind both tracks
    const spd = Math.abs(tank.actualSpeed || 0);
    if (spd > 1.6) {
      tank._dustAcc = (tank._dustAcc || 0) + dt;
      const interval = tank.isPlayer ? 0.1 : 0.17;
      if (tank._dustAcc >= interval) {
        tank._dustAcc = 0;
        const yaw = tank.yaw;
        const fx = -Math.sin(yaw); const fz = -Math.cos(yaw);
        const rx = Math.cos(yaw); const rz = -Math.sin(yaw);
        const back = (rig.hullLength || 4) * 0.5 * Math.sign(tank.actualSpeed || 1);
        const k = Math.min(1, spd / 9);
        for (const side of [-1, 1]) {
          const px = tank.x - fx * back + rx * side * (rig.halfTrackX || 1.4);
          const pz = tank.z - fz * back + rz * side * (rig.halfTrackX || 1.4);
          this.smoke.spawn({
            x: px + rand(-0.2, 0.2), y: 0.25, z: pz + rand(-0.2, 0.2),
            vx: -fx * rand(0.3, 1.2) + rand(-0.4, 0.4), vy: rand(0.3, 0.8), vz: -fz * rand(0.3, 1.2) + rand(-0.4, 0.4),
            tile: TILE_SMOKE, size: 0.5, sizeEnd: rand(1.4, 2.2), drag: 1.5,
            life: rand(0.45, 0.75), color: DUST, alpha: 0.26 * (0.5 + 0.5 * k), fadeIn: 0.15, rotV: rand(-1, 1),
          });
        }
      }
    }

    // Damage: grey wisps below 2/3 HP, black smoke + flame licks below 1/3
    if (tank.maxHp > 0 && tank.hp < tank.maxHp && rig.exhaust) {
      const ratio = tank.hp / tank.maxHp;
      if (ratio <= 0.67) {
        const heavy = ratio <= 0.34;
        tank._dmgAcc = (tank._dmgAcc || 0) + dt;
        const interval = heavy ? 0.07 : 0.16;
        if (tank._dmgAcc >= interval) {
          tank._dmgAcc = 0;
          rig.exhaust.getWorldPosition(this._dp);
          const p = this._dp;
          this.smoke.spawn({
            x: p.x + rand(-0.15, 0.15), y: p.y, z: p.z + rand(-0.15, 0.15),
            vx: rand(-0.3, 0.3), vy: rand(1.4, 2.2), vz: rand(-0.3, 0.3),
            tile: TILE_SMOKE, size: heavy ? 0.6 : 0.45, sizeEnd: heavy ? 2.6 : 1.8, drag: 0.8,
            life: heavy ? rand(1.1, 1.6) : rand(0.8, 1.2),
            color: heavy ? SMOKE_DARK : SMOKE_LIGHT, colorEnd: SMOKE_MID, alpha: heavy ? 0.62 : 0.34,
            fadeIn: 0.1, rotV: rand(-0.8, 0.8),
          });
          if (heavy && Math.random() < 0.55) {
            this.glow.spawn({
              x: p.x + rand(-0.2, 0.2), y: p.y - 0.1, z: p.z + rand(-0.2, 0.2),
              vy: rand(1.0, 1.8), tile: TILE_FLAME, size: rand(0.45, 0.7), sizeEnd: 0.2, aspect: 1.5,
              rot: rand(-0.15, 0.15), life: rand(0.22, 0.36), color: FLAME_YELLOW, colorEnd: FLAME_DEEP,
            });
          }
        }
      }
    }
  }

  _spawnDebris(x, y, z, n, colorHex, speed, size) {
    const base = new THREE.Color(colorHex);
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= this.debrisCap) this.debris.shift();
      const a = Math.random() * Math.PI * 2;
      const up = rand(0.35, 1);
      const sp = speed * rand(0.4, 1);
      const h = Math.sqrt(1 - up * up);
      const shade = rand(0.6, 1.15);
      this.debris.push({
        x, y, z,
        vx: Math.cos(a) * h * sp, vy: up * sp, vz: Math.sin(a) * h * sp,
        rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6),
        wx: rand(-9, 9), wy: rand(-9, 9), wz: rand(-9, 9),
        s: size * rand(0.5, 1.3),
        color: base.clone().multiplyScalar(shade),
        t: 0, life: rand(1.1, 1.8), rest: false,
      });
    }
  }

  _addRing(x, z, colorHex, life, maxScale) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.45,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(this.ringGeo, mat);
    ring.position.set(x, 0.12, z);
    this.scene.add(ring);
    this.rings.push({ mesh: ring, mat, life: 0, maxLife: life, maxScale });
  }

  _addScorch(x, z, radius) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0b0a08, alphaMap: this.scorchTex, transparent: true, opacity: 0.55,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const m = new THREE.Mesh(this.scorchGeo, mat);
    m.position.set(x, 0.035, z);
    m.scale.setScalar(radius);
    m.rotation.y = Math.random() * Math.PI;
    this.scene.add(m);
    this.scorches.push({ mesh: m, mat, t: 0, life: 14 });
    if (this.scorches.length > 16) {
      const old = this.scorches.shift();
      this.scene.remove(old.mesh);
      old.mat.dispose();
    }
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

  // ==========================================================================
  // Shells: bright-nosed tracer + additive streak + smoke trail
  // ==========================================================================
  _makeShellGeometry() {
    // After Tanks3D's shell: hot nose cone, white tip, amber tapering tail (points along -Z).
    // Scaled x4.4 to this game's units.
    const K = 4.4;
    const ring = (z, r) => ({ z: z * K, r: r * K });
    const profile = [
      { ...ring(-0.14, 0.005), c: 0xfff7d2 },
      { ...ring(-0.035, 0.061), c: 0xfff7d2 },
      { ...ring(0.055, 0.044), c: 0xfff0b4 },
      { ...ring(0.3, 0.007), c: 0xf7ac43 },
    ];
    const seg = 8;
    const pos = [];
    const col = [];
    for (const p of profile) {
      const c = new THREE.Color(p.c).multiplyScalar(1.15);
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pos.push(Math.cos(a) * p.r, Math.sin(a) * p.r, p.z);
        col.push(c.r, c.g, c.b);
      }
    }
    const idx = [];
    for (let r = 0; r < profile.length - 1; r++) {
      for (let i = 0; i < seg; i++) {
        const a = r * seg + i;
        const b = r * seg + ((i + 1) % seg);
        idx.push(a, a + seg, b, b, a + seg, b + seg);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }

  syncShells(shells, dt = 1 / 60) {
    this.glow.clearImmediate();
    const activeIds = new Set();
    for (const s of shells) {
      activeIds.add(s.id);
      let entry = this._shellMeshes.get(s.id);
      if (!entry) {
        const mesh = new THREE.Mesh(this.shellGeo, this.shellMat);
        this.scene.add(mesh);
        entry = { mesh, trailAcc: 0, tint: rgb(s.colorHex || 0xfb923c) };
        this._shellMeshes.set(s.id, entry);
      }
      const y = 1.62;
      entry.mesh.position.set(s.x, y, s.z);
      entry.mesh.rotation.y = s.yaw;

      const vx = s.vx || -Math.sin(s.yaw) * 30;
      const vz = s.vz || -Math.cos(s.yaw) * 30;
      const sp = Math.hypot(vx, vz) || 1;
      const nx = vx / sp; const nz = vz / sp;
      const len = Math.min(4.2, 1.2 + sp * 0.06);
      const t = entry.tint;

      // Additive tracer streak (head at the shell nose) + soft head glow
      this.glow.pushImmediate({
        x: s.x - nx * len * 0.42, y, z: s.z - nz * len * 0.42,
        w: len, h: 0.42, dir: [nx, 0, nz], tile: TILE_STREAK,
        color: [0.55 + t[0] * 0.75, 0.45 + t[1] * 0.6, 0.25 + t[2] * 0.4], alpha: 1,
      });
      this.glow.pushImmediate({
        x: s.x, y, z: s.z, w: 1.5, h: 1.5, tile: TILE_GLOW,
        color: [t[0] * 0.9 + 0.3, t[1] * 0.8 + 0.25, t[2] * 0.6 + 0.12], alpha: 0.85,
      });

      // Thin smoke trail
      entry.trailAcc += dt;
      if (entry.trailAcc >= 0.03) {
        entry.trailAcc = 0;
        this.smoke.spawn({
          x: s.x - nx * 1.1, y: y + rand(-0.05, 0.05), z: s.z - nz * 1.1,
          vx: rand(-0.2, 0.2), vy: rand(0.1, 0.4), vz: rand(-0.2, 0.2),
          tile: TILE_SMOKE, size: 0.32, sizeEnd: 1.25, drag: 1.0, life: rand(0.38, 0.55),
          color: SMOKE_LIGHT, alpha: 0.26, rotV: rand(-1.5, 1.5),
        });
      }
    }

    for (const [id, entry] of this._shellMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.mesh);
        this._shellMeshes.delete(id);
      }
    }
  }

  syncCrates(crates, dt, elapsed) {
    const activeIds = new Set();
    for (let i = 0; i < crates.length; i++) {
      const cr = crates[i];
      activeIds.add(cr.id);
      let entry = this._crateMeshes.get(cr.id);
      if (!entry) {
        const info = getPowerupDef(cr.type);
        const group = new THREE.Group();
        const coreMat = new THREE.MeshStandardMaterial({
          color: info.hex,
          emissive: info.hex,
          emissiveIntensity: 0.55,
          roughness: 0.25,
          metalness: 0.6,
        });
        const box = new THREE.Mesh(this.crateBoxGeo, coreMat);
        box.castShadow = true;
        group.add(box);

        const frameMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
        });
        const cage = new THREE.Mesh(this.crateCageGeo, frameMat);
        group.add(cage);

        this.scene.add(group);
        entry = { group, box, coreMat, frameMat };
        this._crateMeshes.set(cr.id, entry);
      }

      entry.group.position.set(cr.x, 1.35 + Math.sin(elapsed * 3.5 + i) * 0.25, cr.z);
      entry.group.rotation.y += 1.8 * dt;
      entry.box.rotation.x += 0.9 * dt;

      // Blink faster in final 25% of lifetime (Tanks3D pickup telegraph!)
      const remaining = 1 - cr.life / cr.maxLife;
      entry.group.visible = remaining > 0.25 || Math.floor(elapsed * 12) % 2 === 0;
    }

    for (const [id, entry] of this._crateMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.group);
        entry.coreMat.dispose();
        entry.frameMat.dispose();
        this._crateMeshes.delete(id);
      }
    }
  }

  // ==========================================================================
  // Per-frame simulation
  // ==========================================================================
  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this._updateFires(dt);
    this._updateDebris(dt);

    for (const f of this.flashLights) {
      if (f.t < f.life) {
        f.t += dt;
        const k = Math.max(0, 1 - f.t / f.life);
        f.light.intensity = f.peak * k * k;
      } else if (f.light.intensity !== 0) {
        f.light.intensity = 0;
      }
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
      const s = 1 + (1 - (1 - t) * (1 - t)) * r.maxScale;
      r.mesh.scale.set(s, 1, s);
      r.mat.opacity = (1 - t) * (1 - t) * 0.45;
    }

    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const sc = this.scorches[i];
      sc.t += dt;
      if (sc.t >= sc.life) {
        this.scene.remove(sc.mesh);
        sc.mat.dispose();
        this.scorches.splice(i, 1);
        continue;
      }
      sc.mat.opacity = 0.55 * Math.min(1, (sc.life - sc.t) / 3);
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

  _updateFires(dt) {
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt;
      if (f.t >= f.duration) {
        this.fires.splice(i, 1);
        continue;
      }
      const left = f.duration - f.t;
      const strength = Math.min(1, left / 1.6) * Math.min(1, f.t / 0.25 + 0.3);
      const k = f.scale;

      f.flameAcc += dt * 46 * strength * k;
      while (f.flameAcc >= 1) {
        f.flameAcc -= 1;
        const r = 0.85 * k;
        this.glow.spawn({
          x: f.x + rand(-r, r), y: rand(0.35, 1.0), z: f.z + rand(-r, r),
          vx: rand(-0.3, 0.3), vy: rand(1.6, 2.8) * k, vz: rand(-0.3, 0.3),
          tile: TILE_FLAME, size: rand(1.0, 1.7) * k, sizeEnd: 0.3 * k, aspect: 1.5,
          rot: rand(-0.15, 0.15), life: rand(0.34, 0.6),
          color: FLAME_YELLOW, colorEnd: FLAME_DEEP, alpha: 0.85 * strength,
        });
      }
      f.glowAcc = (f.glowAcc || 0) + dt * 8;
      while (f.glowAcc >= 1) {
        f.glowAcc -= 1;
        this.glow.spawn({
          x: f.x, y: 0.9 * k, z: f.z, tile: TILE_GLOW, size: rand(3.2, 4.2) * k, sizeEnd: 3.6 * k,
          life: 0.22, color: FLAME_DEEP, alpha: 0.32 * strength,
        });
      }
      if (Math.random() < dt * 14 * strength) {
        this.glow.spawn({
          x: f.x + rand(-0.6, 0.6), y: 0.6, z: f.z + rand(-0.6, 0.6),
          vx: rand(-1, 1), vy: rand(2.5, 4.5), vz: rand(-1, 1), gravity: -1.5,
          tile: TILE_GLOW, size: 0.18, sizeEnd: 0.06, life: rand(0.6, 1.1),
          color: FLAME_ORANGE, colorEnd: EMBER_RED,
        });
      }

      f.smokeAcc += dt * 9 * Math.max(0.35, strength) * k;
      while (f.smokeAcc >= 1) {
        f.smokeAcc -= 1;
        this.smoke.spawn({
          x: f.x + rand(-0.6, 0.6) * k, y: 1.3 * k, z: f.z + rand(-0.6, 0.6) * k,
          vx: rand(-0.4, 0.4) + 0.35, vy: rand(1.6, 2.6), vz: rand(-0.4, 0.4) + 0.2, drag: 0.35,
          tile: TILE_SMOKE, size: 0.9 * k, sizeEnd: rand(3.2, 4.6) * k, life: rand(1.8, 2.8),
          color: SMOKE_DARK, colorEnd: SMOKE_MID, alpha: 0.62 * Math.max(0.4, strength),
          fadeIn: 0.12, rotV: rand(-0.5, 0.5),
        });
      }
    }
  }

  _updateDebris(dt) {
    const list = this.debris;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.t += dt;
      if (d.t >= d.life) continue;
      if (!d.rest) {
        d.vy -= 22 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
        const floor = 0.1 * d.s;
        if (d.y < floor) {
          d.y = floor;
          if (Math.abs(d.vy) < 2.2) {
            d.rest = true;
          } else {
            d.vy = -d.vy * 0.32;
            d.vx *= 0.55; d.vz *= 0.55;
            d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5;
          }
        }
      }
      const shrink = Math.min(1, (d.life - d.t) / 0.35);
      this._de.set(d.rx, d.ry, d.rz);
      this._dq.setFromEuler(this._de);
      this._ds.setScalar(d.s * shrink);
      this._dp.set(d.x, d.y, d.z);
      this._dm.compose(this._dp, this._dq, this._ds);
      this.debrisMesh.setMatrixAt(w, this._dm);
      this.debrisMesh.setColorAt(w, d.color);
      list[w++] = d;
    }
    list.length = w;
    this.debrisMesh.count = w;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  _makeScorchTexture() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    // Ragged spokes
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      ctx.lineWidth = 2 + Math.random() * 4;
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + Math.cos(a) * rand(40, 62), 64 + Math.sin(a) * rand(40, 62));
      ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    this.debris.length = 0;
    this.debrisMesh.count = 0;
    this.fires.length = 0;
    for (const f of this.flashLights) { f.t = f.life; f.light.intensity = 0; }
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mat.dispose(); }
    for (const sc of this.scorches) { this.scene.remove(sc.mesh); sc.mat.dispose(); }
    for (const b of this.beams) { this.scene.remove(b.mesh); b.geo.dispose(); b.mat.dispose(); }
    for (const entry of this._shellMeshes.values()) this.scene.remove(entry.mesh);
    for (const entry of this._crateMeshes.values()) {
      this.scene.remove(entry.group); entry.coreMat.dispose(); entry.frameMat.dispose();
    }
    this.rings.length = 0;
    this.scorches.length = 0;
    this.beams.length = 0;
    this._shellMeshes.clear();
    this._crateMeshes.clear();
  }
}
