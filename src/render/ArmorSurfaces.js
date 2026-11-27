import * as THREE from '../../vendor/three.module.min.js';

// ============================================================================
// Vehicle Surface Toolkit: polygon camouflage, triplanar painted armor,
// running-gear textures and contact shadows.
//
// Technique notes (after Tanks3D's Godot art pass):
//  - Painted armor is matte (roughness ~0.68, no metalness); winter whitewash is
//    chalkier (~0.8). Bare metal (gun tubes, muzzle hardware, track shoes) is
//    half-metallic and smoother; rubber is fully rough with no reflection.
//  - Camouflage is a tileable polygon-blotch texture projected triplanar in the
//    vehicle's own pivot space, so patches keep one scale across hull, turret
//    and barrel instead of stretching per box face.
//  - Up-facing paint is warmed and down-facing paint cooled ("painted light"),
//    and the lowest band of each casting is darkened so tanks sit in the scene.
// ============================================================================

const CAMO_TILE_METERS = 4.0;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexCss(hex) {
  return `#${new THREE.Color(hex).getHexString()}`;
}

/** Irregular 6-9 sided blotch, drawn with wrap-around so the tile repeats seamlessly. */
function drawWrappedPolygon(ctx, size, cx, cy, radius, rnd) {
  const n = 6 + Math.floor(rnd() * 4);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.55;
    const r = radius * (0.55 + rnd() * 0.45);
    pts.push([Math.cos(a) * r * (1.0 + rnd() * 0.35), Math.sin(a) * r]);
  }
  const rot = rnd() * Math.PI;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      ctx.beginPath();
      pts.forEach(([px, py], i) => {
        const x = cx + ox + px * cr - py * sr;
        const y = cy + oy + px * sr + py * cr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
    }
  }
}

/**
 * Tileable polygon camouflage.
 * @param {{base:number, layers:Array<{color:number,count:number,min:number,max:number}>, seed:number, grain?:number}} spec
 */
export function makePolygonCamoTexture(spec) {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = hexCss(spec.base);
  ctx.fillRect(0, 0, size, size);

  const rnd = mulberry32(spec.seed || 1);
  for (const layer of spec.layers) {
    ctx.fillStyle = hexCss(layer.color);
    for (let i = 0; i < layer.count; i++) {
      const r = layer.min + rnd() * (layer.max - layer.min);
      drawWrappedPolygon(ctx, size, rnd() * size, rnd() * size, r, rnd);
    }
  }

  // Fine paint grain + faint large-scale fade so flat plates never read as plastic
  const grain = spec.grain ?? 0.05;
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const light = rnd() > 0.5;
    ctx.fillStyle = light ? `rgba(255,250,235,${grain})` : `rgba(12,16,14,${grain * 1.3})`;
    ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (let i = 0; i < 7; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const rad = 40 + rnd() * 70;
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, rnd() > 0.5 ? 'rgba(255,245,220,0.05)' : 'rgba(10,14,12,0.06)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Nation-specific camo recipes (USA woodland, Soviet winter whitewash, German panzer gray). */
export function camoSpecForPalette(palette, isWhitewash) {
  const base = new THREE.Color(palette.base);
  const dark = new THREE.Color(palette.dark);
  const light = new THREE.Color(palette.light);
  const seed = (palette.base ^ (palette.dark << 3)) >>> 0;

  if (isWhitewash) {
    // Chalky whitewash over factory green: green shows through in broken patches
    return {
      base: palette.base,
      seed,
      grain: 0.06,
      layers: [
        { color: base.clone().lerp(dark, 0.45).getHex(), count: 7, min: 22, max: 40 },
        { color: dark.getHex(), count: 8, min: 18, max: 34 },
        { color: base.clone().lerp(light, 0.5).getHex(), count: 6, min: 12, max: 22 },
      ],
    };
  }

  const hsl = {};
  base.getHSL(hsl);
  if (hsl.s < 0.12) {
    // Near-neutral (German panzer gray): mostly plain with faint tonal plates
    return {
      base: palette.base,
      seed,
      grain: 0.07,
      layers: [
        { color: base.clone().lerp(light, 0.22).getHex(), count: 7, min: 26, max: 48 },
        { color: base.clone().lerp(dark, 0.35).getHex(), count: 6, min: 20, max: 40 },
      ],
    };
  }

  // Woodland: olive base, dark green and earth-brown blotches, small black slashes
  const brown = new THREE.Color().setHSL((hsl.h + 0.93) % 1, Math.min(0.42, hsl.s * 0.9), Math.max(0.16, hsl.l * 0.72));
  return {
    base: palette.base,
    seed,
    grain: 0.05,
    layers: [
      { color: dark.getHex(), count: 8, min: 24, max: 44 },
      { color: brown.getHex(), count: 6, min: 20, max: 36 },
      { color: base.clone().lerp(light, 0.55).getHex(), count: 4, min: 12, max: 22 },
      { color: 0x22261c, count: 4, min: 8, max: 14 },
    ],
  };
}

/** Enemy/identity-color vehicles: derive a restrained 3-tone polygon camo from one hue. */
export function camoSpecForHex(hex) {
  const col = new THREE.Color(hex);
  const hsl = {};
  col.getHSL(hsl);
  const clampL = (v) => Math.max(0.07, Math.min(0.9, v));
  const main = new THREE.Color().setHSL(hsl.h, Math.min(0.62, hsl.s * 0.8), clampL(hsl.l * 0.72));
  const dark = new THREE.Color().setHSL((hsl.h + 0.02) % 1, Math.min(0.5, hsl.s * 0.62), clampL(hsl.l * 0.42));
  const light = new THREE.Color().setHSL(hsl.h, Math.min(0.46, hsl.s * 0.55), clampL(hsl.l * 0.95));
  return {
    base: main.getHex(),
    seed: hex >>> 0,
    grain: 0.05,
    layers: [
      { color: dark.getHex(), count: 7, min: 22, max: 42 },
      { color: light.getHex(), count: 5, min: 14, max: 28 },
    ],
  };
}

// ----------------------------------------------------------------------------
// Triplanar painted-armor shader patch
// ----------------------------------------------------------------------------

/**
 * Patch a MeshStandardMaterial so its `map` is sampled triplanar from the baked
 * `camoPos` / `camoNrm` attributes (pivot-space position & normal) and gets the
 * painted-light warm/cool bias plus a low grime band. Safe to call on clones.
 */
export function applyArmorShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.camoScale = { value: 1 / CAMO_TILE_METERS };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 camoPos;
attribute vec3 camoNrm;
attribute float camoH;
uniform float camoScale;
varying vec3 vCamoPos;
varying vec3 vCamoNrm;
varying float vCamoY;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vCamoPos = camoPos * camoScale + vec3(0.47, 0.19, 0.27);
vCamoNrm = camoNrm;
vCamoY = camoH;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCamoPos;
varying vec3 vCamoNrm;
varying float vCamoY;`
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec3 camoN = normalize(vCamoNrm);
  vec3 camoW = pow(abs(camoN), vec3(6.0));
  camoW /= max(camoW.x + camoW.y + camoW.z, 1e-4);
  vec4 camoTex = texture2D(map, vCamoPos.zy) * camoW.x
    + texture2D(map, vCamoPos.xz) * camoW.y
    + texture2D(map, vCamoPos.xy) * camoW.z;
  diffuseColor *= camoTex;
  // Painted light: warm sun-facing plates, cool undersides
  float camoUp = clamp(camoN.y, 0.0, 1.0);
  float camoDown = clamp(-camoN.y, 0.0, 1.0);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.09, 1.05, 0.9), camoUp * 0.55);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.72, 0.76), camoDown * 0.6);
  // Road grime / ambient occlusion toward the bottom of each casting
  diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(0.38, 0.72, vCamoY));
#endif`
      );
  };
  material.customProgramCacheKey = () => 'armor-triplanar-v1';
  return material;
}

/**
 * Bake pivot-space position/normal attributes for triplanar camo, plus the
 * vehicle-space height (camoH) that drives the grime band.
 * Returns a NEW geometry (the source geometry may be shared).
 */
export function bakeArmorAttributes(geometry, matrixToPivot, matrixToRoot) {
  const geo = geometry.clone();
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const nMat = new THREE.Matrix3().getNormalMatrix(matrixToPivot);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const outP = new Float32Array(pos.count * 3);
  const outN = new Float32Array(pos.count * 3);
  const outH = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(matrixToRoot);
    outH[i] = p.y;
    p.fromBufferAttribute(pos, i).applyMatrix4(matrixToPivot);
    outP[i * 3] = p.x; outP[i * 3 + 1] = p.y; outP[i * 3 + 2] = p.z;
    if (nrm) {
      n.fromBufferAttribute(nrm, i).applyMatrix3(nMat).normalize();
    } else {
      n.set(0, 1, 0);
    }
    outN[i * 3] = n.x; outN[i * 3 + 1] = n.y; outN[i * 3 + 2] = n.z;
  }
  geo.setAttribute('camoPos', new THREE.BufferAttribute(outP, 3));
  geo.setAttribute('camoNrm', new THREE.BufferAttribute(outN, 3));
  geo.setAttribute('camoH', new THREE.BufferAttribute(outH, 1));
  return geo;
}

// ----------------------------------------------------------------------------
// Running gear textures
// ----------------------------------------------------------------------------

/** Track run seen from above: steel shoes with grousers, rubber pads, center guide horns. */
export function makeTrackRunTexture() {
  const c = makeCanvas(128, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1b2224';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 32) {
    // Steel shoe plate
    const g = ctx.createLinearGradient(0, y, 0, y + 28);
    g.addColorStop(0, '#7d8988');
    g.addColorStop(0.45, '#5f6b6b');
    g.addColorStop(1, '#3b4545');
    ctx.fillStyle = g;
    ctx.fillRect(3, y + 2, 122, 27);
    // Rubber pads either side of the horn
    ctx.fillStyle = '#263335';
    ctx.fillRect(10, y + 7, 42, 16);
    ctx.fillRect(76, y + 7, 42, 16);
    // Grouser highlight
    ctx.fillStyle = 'rgba(214, 226, 222, 0.45)';
    ctx.fillRect(3, y + 2, 122, 2);
    // Center guide horn
    ctx.fillStyle = '#8f9c9a';
    ctx.fillRect(57, y + 4, 14, 22);
    ctx.fillStyle = '#c3cfcc';
    ctx.fillRect(57, y + 4, 14, 3);
    // Link gap
    ctx.fillStyle = '#0d1112';
    ctx.fillRect(0, y + 29, 128, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Track side / wrap: link plates with pins, links running along U. */
export function makeTrackSideTexture() {
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#20292b';
  ctx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 32) {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#6c7877');
    g.addColorStop(0.5, '#4a5555');
    g.addColorStop(1, '#2f3838');
    ctx.fillStyle = g;
    ctx.fillRect(x + 2, 6, 27, 52);
    ctx.fillStyle = '#0e1314';
    ctx.fillRect(x + 29, 0, 3, 64);
    // Link pins
    ctx.fillStyle = '#a9b5b2';
    ctx.beginPath(); ctx.arc(x + 30.5, 16, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 30.5, 48, 3, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Soft elliptical contact-shadow alpha texture (dark core, feathered rim). */
export function makeContactShadowTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 63);
  g.addColorStop(0, 'rgba(0,0,0,0.78)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.82, 'rgba(0,0,0,0.16)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
