import * as THREE from '../../vendor/three.module.min.js';
import { EVENTS } from '../core/EventBus.js';
import { getPowerupDef } from '../config/powerups.js';

/**
 * Event-Driven 3D VFX, Shell Mesh & Crate Mesh Renderer (SRP + DIP).
 * Subscribes to EventBus events for explosions, sparks, debris, smoke, shell cancellations,
 * and tractor beams — simulation never imports Three.js!
 */
export class EffectsRenderer {
  constructor(scene, bus) {
    this.scene = scene;
    this.bus = bus;

    this.particles = [];
    this.smoke = [];
    this.rings = [];
    this.beams = [];

    this._shellMeshes = new Map();
    this._crateMeshes = new Map();

    // Shared geometries (zero per-spawn geometry allocation)
    this.cubeGeo = new THREE.BoxGeometry(0.42, 0.34, 0.42);
    this.smokeGeo = new THREE.DodecahedronGeometry(0.55, 0);
    this.ringGeo = new THREE.RingGeometry(0.4, 0.85, 20);
    this.ringGeo.rotateX(-Math.PI / 2);

    this.shellGeo = new THREE.SphereGeometry(0.28, 10, 10);
    this.shellTrailGeo = new THREE.ConeGeometry(0.22, 1.35, 8);
    this.shellTrailGeo.rotateX(-Math.PI / 2);
    this.crateBoxGeo = new THREE.BoxGeometry(1.85, 1.85, 1.85);
    this.crateCageGeo = new THREE.BoxGeometry(2.15, 2.15, 2.15);

    this._subscribe();
  }

  _subscribe() {
    this.bus.on(EVENTS.TANK_SPAWNED, ({ x, z }) => {
      this.spawnExplosion(x, 1.0, z, 0x38bdf8, 8, false);
    });
    this.bus.on(EVENTS.WALL_DAMAGED, ({ x, y, z, colorHex }) => {
      this.spawnExplosion(x, y, z, colorHex, 9, false);
    });
    this.bus.on(EVENTS.WALL_BREACHED, ({ x, y, z, colorHex }) => {
      this.spawnExplosion(x, y, z, colorHex, 18, true);
    });
    this.bus.on(EVENTS.WALL_RICOCHET, ({ x, y, z, colorHex }) => {
      this.spawnExplosion(x, y, z, colorHex, 7, false);
    });
    this.bus.on(EVENTS.SHELL_CANCELLED, ({ x, y, z }) => {
      this.spawnExplosion(x, y, z, 0xfef08a, 12, false);
    });
    this.bus.on(EVENTS.TANK_HIT, ({ x, y, z, colorHex }) => {
      this.spawnExplosion(x, y, z, colorHex, 11, false);
    });
    this.bus.on(EVENTS.TANK_DESTROYED, ({ x, y, z, hitInfo }) => {
      const isBack = hitInfo && hitInfo.zone === 'BACK';
      this.spawnExplosion(x, y, z, isBack ? 0xf43f5e : 0xf97316, isBack ? 34 : 26, true);
    });
    this.bus.on(EVENTS.EAGLE_DESTROYED, ({ x, z }) => {
      this.spawnExplosion(x, 2.2, z, 0xef4444, 42, true);
    });
    this.bus.on(EVENTS.TRACTOR_USED, ({ fromX, fromZ, toX, toZ, colorHex }) => {
      this.spawnTractorBeam(fromX, 1.8, fromZ, toX, 2.0, toZ, colorHex);
    });
  }

  spawnExplosion(x, y, z, colorHex = 0xf97316, count = 16, big = false) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xfef08a : colorHex,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(this.cubeGeo, mat);
      const scale = (big ? 1.3 : 0.82) * (0.6 + Math.random() * 0.85);
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
        maxLife: big ? 0.72 : 0.45,
      });
    }

    // Rolling dark smoke plumes on big explosions (Tanks3D-style layered explosions!)
    if (big) {
      for (let s = 0; s < 5; s++) {
        const sMat = new THREE.MeshStandardMaterial({
          color: 0x262c34,
          roughness: 0.95,
          transparent: true,
          opacity: 0.65,
        });
        const sm = new THREE.Mesh(this.smokeGeo, sMat);
        sm.position.set(
          x + (Math.random() - 0.5) * 1.4,
          y + 0.4 + Math.random() * 0.8,
          z + (Math.random() - 0.5) * 1.4
        );
        this.scene.add(sm);
        this.smoke.push({
          mesh: sm,
          mat: sMat,
          vy: 2.8 + Math.random() * 2.2,
          life: 0,
          maxLife: 0.85 + Math.random() * 0.35,
        });
      }
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
      maxLife: big ? 0.5 : 0.3,
      maxScale: big ? 7.5 : 3.8,
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

  syncShells(shells) {
    const activeIds = new Set();
    for (const s of shells) {
      activeIds.add(s.id);
      let entry = this._shellMeshes.get(s.id);
      if (!entry) {
        const mat = new THREE.MeshBasicMaterial({ color: s.colorHex });
        const mesh = new THREE.Mesh(this.shellGeo, mat);
        const trailMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          transparent: true,
          opacity: 0.72,
        });
        const trail = new THREE.Mesh(this.shellTrailGeo, trailMat);
        trail.position.set(0, 0, 0.72);
        mesh.add(trail);
        this.scene.add(mesh);
        entry = { mesh, mat, trailMat };
        this._shellMeshes.set(s.id, entry);
      }
      entry.mesh.position.set(s.x, 1.62, s.z);
      entry.mesh.rotation.y = s.yaw;
    }

    for (const [id, entry] of this._shellMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.mesh);
        entry.mat.dispose();
        entry.trailMat.dispose();
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

    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.scene.remove(s.mesh);
        s.mat.dispose();
        this.smoke.splice(i, 1);
        continue;
      }
      const t = s.life / s.maxLife;
      s.mesh.position.y += s.vy * dt;
      const sc = 1 + t * 2.1;
      s.mesh.scale.setScalar(sc);
      s.mat.opacity = (1 - t) * 0.6;
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
    for (const p of this.particles) { this.scene.remove(p.mesh); p.mat.dispose(); }
    for (const s of this.smoke) { this.scene.remove(s.mesh); s.mat.dispose(); }
    for (const r of this.rings) { this.scene.remove(r.mesh); r.mat.dispose(); }
    for (const b of this.beams) { this.scene.remove(b.mesh); b.geo.dispose(); b.mat.dispose(); }
    for (const entry of this._shellMeshes.values()) {
      this.scene.remove(entry.mesh); entry.mat.dispose(); entry.trailMat.dispose();
    }
    for (const entry of this._crateMeshes.values()) {
      this.scene.remove(entry.group); entry.coreMat.dispose(); entry.frameMat.dispose();
    }
    this.particles.length = 0;
    this.smoke.length = 0;
    this.rings.length = 0;
    this.beams.length = 0;
    this._shellMeshes.clear();
    this._crateMeshes.clear();
  }
}
