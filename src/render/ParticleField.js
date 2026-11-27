import * as THREE from '../../vendor/three.module.min.js';

// ============================================================================
// GPU-instanced camera-facing particle field (one draw call per field).
// Each particle is a billboard quad sampling a 2x2 atlas tile; particles with a
// stretch factor are aligned to their screen-space velocity (sparks, tracers).
// Works unchanged in split-screen: orientation is resolved per camera in the
// vertex shader.
// ============================================================================

export const TILE_GLOW = 0;
export const TILE_SMOKE = 1;
export const TILE_STREAK = 2;
export const TILE_FLAME = 3;

const VERT = `
attribute vec3 iPos;
attribute vec2 iSize;
attribute vec4 iColor;
attribute float iRot;
attribute float iTile;
attribute vec3 iDir;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 ax;
  vec2 size = iSize;
  if (dot(iDir, iDir) > 1e-6) {
    vec3 vd = (modelViewMatrix * vec4(iDir, 0.0)).xyz;
    float l2 = length(vd.xy);
    ax = l2 > 1e-5 ? vd.xy / l2 : vec2(1.0, 0.0);
    // Foreshorten streaks flying toward/away from the camera so they collapse to a dot
    float f = l2 / max(length(vd), 1e-5);
    size.x = mix(size.y, size.x, f);
  } else {
    ax = vec2(cos(iRot), sin(iRot));
  }
  vec2 ay = vec2(-ax.y, ax.x);
  mv.xy += ax * position.x * size.x + ay * position.y * size.y;
  gl_Position = projectionMatrix * mv;
  vUv = (uv + vec2(mod(iTile, 2.0), floor(iTile * 0.5))) * 0.5;
  vColor = iColor;
}`;

const FRAG = `
uniform sampler2D atlas;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(atlas, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
}`;

function makeAtlas() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 2;
  c.height = S * 2;
  const ctx = c.getContext('2d');

  // Canvas y grows downward but UV v grows upward: tile row 0 (iTile 0,1) is the BOTTOM half.
  const tileOrigin = (tile) => [(tile % 2) * S, (1 - Math.floor(tile / 2)) * S];

  // 0: soft glow
  {
    const [ox, oy] = tileOrigin(TILE_GLOW);
    const g = ctx.createRadialGradient(ox + S / 2, oy + S / 2, 0, ox + S / 2, oy + S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, S, S);
  }

  // 1: billowy smoke puff (overlapping lobes, lit from the top)
  {
    const [ox, oy] = tileOrigin(TILE_SMOKE);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * S * 0.2;
      const x = ox + S / 2 + Math.cos(a) * d;
      const y = oy + S / 2 + Math.sin(a) * d;
      const r = S * (0.16 + rnd() * 0.18);
      const shade = 200 + Math.floor((1 - (y - oy) / S) * 55);
      const g = ctx.createRadialGradient(x, y - r * 0.25, 0, x, y, r);
      g.addColorStop(0, `rgba(${shade},${shade},${shade},0.55)`);
      g.addColorStop(0.6, `rgba(${shade - 30},${shade - 30},${shade - 30},0.32)`);
      g.addColorStop(1, 'rgba(160,160,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, S, S);
    }
  }

  // 2: streak — hot head at +x (right), tapering tail to the left
  {
    const [ox, oy] = tileOrigin(TILE_STREAK);
    const g = ctx.createLinearGradient(ox, 0, ox + S, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.88, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, S, S);
    ctx.clip();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox, oy + S / 2);
    ctx.quadraticCurveTo(ox + S * 0.7, oy + S * 0.3, ox + S * 0.95, oy + S / 2);
    ctx.quadraticCurveTo(ox + S * 0.7, oy + S * 0.7, ox, oy + S / 2);
    ctx.fill();
    const core = ctx.createRadialGradient(ox + S * 0.86, oy + S / 2, 0, ox + S * 0.86, oy + S / 2, S * 0.16);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = core;
    ctx.fillRect(ox, oy, S, S);
    ctx.restore();
  }

  // 3: flame tongue (teardrop, tip pointing +y in UV = up on screen)
  {
    const [ox, oy] = tileOrigin(TILE_FLAME);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, S, S);
    ctx.clip();
    const g = ctx.createRadialGradient(ox + S / 2, oy + S * 0.68, 0, ox + S / 2, oy + S * 0.62, S * 0.42);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox + S / 2, oy + S * 0.06);
    ctx.bezierCurveTo(ox + S * 0.68, oy + S * 0.4, ox + S * 0.88, oy + S * 0.7, ox + S / 2, oy + S * 0.94);
    ctx.bezierCurveTo(ox + S * 0.12, oy + S * 0.7, ox + S * 0.32, oy + S * 0.4, ox + S / 2, oy + S * 0.06);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  return tex;
}

let _sharedAtlas = null;

export class ParticleField {
  /**
   * @param {THREE.Scene} scene
   * @param {{capacity:number, additive:boolean, renderOrder?:number}} opts
   */
  constructor(scene, { capacity, additive, renderOrder = 10 }) {
    if (!_sharedAtlas) _sharedAtlas = makeAtlas();
    this.capacity = capacity;
    this.count = 0;

    // Simulation state (struct of arrays)
    const n = capacity;
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.aspect = new Float32Array(n);
    this.rot = new Float32Array(n); this.rotV = new Float32Array(n);
    this.c0 = new Float32Array(n * 3); this.c1 = new Float32Array(n * 3);
    this.a0 = new Float32Array(n); this.fadeIn = new Float32Array(n);
    this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    this.tile = new Float32Array(n); this.stretch = new Float32Array(n);

    // GPU attributes
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.aTile = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    this.aDir = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (const a of [this.aPos, this.aSize, this.aColor, this.aRot, this.aTile, this.aDir]) {
      a.setUsage(THREE.DynamicDrawUsage);
    }
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iRot', this.aRot);
    geo.setAttribute('iTile', this.aTile);
    geo.setAttribute('iDir', this.aDir);
    geo.instanceCount = 0;
    this.geo = geo;

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { atlas: { value: _sharedAtlas } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    scene.add(this.mesh);

    // One-frame sprites (shell tracers): rebuilt every simulation tick
    this._imm = [];
    this._dirty = true;
    this.mesh.onBeforeRender = () => this._flush();
  }

  /**
   * Spawn a particle. Colors are display-space [r,g,b] 0..1 (additive fields may exceed 1).
   */
  spawn(o) {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.age[i] = o.delay ? -o.delay : 0;
    this.life[i] = o.life;
    this.s0[i] = o.size; this.s1[i] = o.sizeEnd ?? o.size;
    this.aspect[i] = o.aspect || 1;
    this.rot[i] = o.rot ?? Math.random() * Math.PI * 2;
    this.rotV[i] = o.rotV || 0;
    const c0 = o.color; const c1 = o.colorEnd || o.color;
    this.c0[i * 3] = c0[0]; this.c0[i * 3 + 1] = c0[1]; this.c0[i * 3 + 2] = c0[2];
    this.c1[i * 3] = c1[0]; this.c1[i * 3 + 1] = c1[1]; this.c1[i * 3 + 2] = c1[2];
    this.a0[i] = o.alpha ?? 1;
    this.fadeIn[i] = o.fadeIn || 0;
    this.drag[i] = o.drag || 0;
    this.grav[i] = o.gravity || 0;
    this.tile[i] = o.tile || 0;
    this.stretch[i] = o.stretch || 0;
    this._dirty = true;
    return i;
  }

  /** One-frame sprite (tracer streak / head glow). */
  pushImmediate(o) {
    this._imm.push(o);
    this._dirty = true;
  }

  clearImmediate() {
    if (this._imm.length) {
      this._imm.length = 0;
      this._dirty = true;
    }
  }

  _kill(i) {
    const j = --this.count;
    if (i === j) return;
    const f = (arr) => { arr[i] = arr[j]; };
    f(this.px); f(this.py); f(this.pz); f(this.vx); f(this.vy); f(this.vz);
    f(this.age); f(this.life); f(this.s0); f(this.s1); f(this.aspect); f(this.rot); f(this.rotV);
    f(this.a0); f(this.fadeIn); f(this.drag); f(this.grav); f(this.tile); f(this.stretch);
    for (let k = 0; k < 3; k++) {
      this.c0[i * 3 + k] = this.c0[j * 3 + k];
      this.c1[i * 3 + k] = this.c1[j * 3 + k];
    }
  }

  update(dt) {
    for (let i = this.count - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this._kill(i);
        continue;
      }
      if (this.age[i] < 0) continue;
      const damp = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= damp; this.vz[i] *= damp;
      this.vy[i] = this.vy[i] * damp + this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.05 && this.vy[i] < 0) {
        this.py[i] = 0.05;
        this.vy[i] *= -0.3;
        this.vx[i] *= 0.6; this.vz[i] *= 0.6;
      }
      this.rot[i] += this.rotV[i] * dt;
    }
    this._dirty = true;
  }

  _flush() {
    if (!this._dirty) return;
    this._dirty = false;
    const P = this.aPos.array; const S = this.aSize.array; const C = this.aColor.array;
    const R = this.aRot.array; const T = this.aTile.array; const D = this.aDir.array;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] < 0) continue;
      const t = this.age[i] / this.life[i];
      const sz = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      let a = this.a0[i] * (1 - t);
      if (this.fadeIn[i] > 0 && t < this.fadeIn[i]) a *= t / this.fadeIn[i];
      P[w * 3] = this.px[i]; P[w * 3 + 1] = this.py[i]; P[w * 3 + 2] = this.pz[i];
      if (this.stretch[i] > 0) {
        const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]);
        S[w * 2] = sz + sp * this.stretch[i];
        S[w * 2 + 1] = sz * 0.35;
        D[w * 3] = this.vx[i]; D[w * 3 + 1] = this.vy[i]; D[w * 3 + 2] = this.vz[i];
      } else {
        S[w * 2] = sz;
        S[w * 2 + 1] = sz * this.aspect[i];
        D[w * 3] = 0; D[w * 3 + 1] = 0; D[w * 3 + 2] = 0;
      }
      C[w * 4] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      C[w * 4 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      C[w * 4 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
      C[w * 4 + 3] = a;
      R[w] = this.rot[i];
      T[w] = this.tile[i];
      w++;
    }
    for (const o of this._imm) {
      if (w >= this.capacity) break;
      P[w * 3] = o.x; P[w * 3 + 1] = o.y; P[w * 3 + 2] = o.z;
      S[w * 2] = o.w; S[w * 2 + 1] = o.h;
      const d = o.dir;
      D[w * 3] = d ? d[0] : 0; D[w * 3 + 1] = d ? d[1] : 0; D[w * 3 + 2] = d ? d[2] : 0;
      C[w * 4] = o.color[0]; C[w * 4 + 1] = o.color[1]; C[w * 4 + 2] = o.color[2]; C[w * 4 + 3] = o.alpha ?? 1;
      R[w] = o.rot || 0;
      T[w] = o.tile || 0;
      w++;
    }
    this.geo.instanceCount = w;
    for (const a of [this.aPos, this.aSize, this.aColor, this.aRot, this.aTile, this.aDir]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, w * a.itemSize);
      a.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this._imm.length = 0;
    this._dirty = true;
  }
}
