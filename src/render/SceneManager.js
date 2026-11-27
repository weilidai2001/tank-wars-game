import * as THREE from '../../vendor/three.module.min.js';
import { WORLD_SIZE } from '../config/constants.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 groundColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = up > 0.0
    ? mix(horizonColor, topColor, pow(clamp(up, 0.0, 1.0), 0.55))
    : mix(horizonColor, groundColor, pow(clamp(-up, 0.0, 1.0), 0.35));
  // Broad warm glow + tight sun disc: gives metal one soft and one crisp highlight
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 6.0) * 0.55 + pow(s, 220.0) * 9.0);
  gl_FragColor = vec4(col, 1.0);
}`;

/**
 * Three.js Scene, Lighting & Multi-Viewport Renderer (Single Responsibility Principle).
 * Tanks3D-style lighting: warm key sun from behind the default camera, cool sky fill,
 * a faint opposing rim, plus a procedural sky environment map so bare metal shows a
 * continuous highlight along gun tubes while matte paint and rubber stay flat.
 */
export class SceneManager {
  constructor(glCanvas) {
    this.glCanvas = glCanvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas: glCanvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e333c);
    this.scene.fog = new THREE.FogExp2(0x223942, 0.0022);

    // Cool sky / dark ground hemisphere fill (Tanks3D: #a1bcc2 flat ambient)
    this.hemiLight = new THREE.HemisphereLight(0xa1bcc2, 0x1c2529, 0.62);
    this.hemiLight.position.set(WORLD_SIZE * 0.5, 48, WORLD_SIZE * 0.5);
    this.scene.add(this.hemiLight);

    // Warm key sun (Tanks3D rotation -54 / -28 deg, #fff2dc): it sits behind and left of the
    // default south-facing chase camera, so visible plates are lit and shadows fall away.
    const SUN_OFFSET = new THREE.Vector3(-0.28, 0.81, 0.52).normalize().multiplyScalar(78);
    this.sunOffset = SUN_OFFSET;
    this.dirLight = new THREE.DirectionalLight(0xfff2dc, 2.15);
    this.dirLight.position.set(WORLD_SIZE * 0.5 + SUN_OFFSET.x, SUN_OFFSET.y, WORLD_SIZE * 0.5 + SUN_OFFSET.z);
    this.dirLight.target.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    this.dirLight.castShadow = true;
    // Clearer shadows: 4096 map on desktop GPUs (2.7 cm texels over the arena), 2048 on phones.
    const coarse = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches;
    const maxTex = this.renderer.capabilities.maxTextureSize || 4096;
    const shadowSize = !coarse && maxTex >= 8192 ? 4096 : 2048;
    this.dirLight.shadow.mapSize.set(shadowSize, shadowSize);
    const sHalf = WORLD_SIZE * 0.6;
    this.dirLight.shadow.camera.left = -sHalf;
    this.dirLight.shadow.camera.right = sHalf;
    this.dirLight.shadow.camera.top = sHalf;
    this.dirLight.shadow.camera.bottom = -sHalf;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 160;
    this.dirLight.shadow.bias = -0.00035;
    this.dirLight.shadow.normalBias = 0.025;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Faint cool rim from the opposite side to separate tank silhouettes from their shadows
    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.34);
    this.rimLight.position.set(WORLD_SIZE * 0.5 + 30, 26, WORLD_SIZE * 0.5 - 38);
    this.rimLight.target.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // Procedural sky environment (rebuilt per arena atmosphere)
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._envTarget = null;
    this._envKey = '';
    this._skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color() },
        horizonColor: { value: new THREE.Color() },
        groundColor: { value: new THREE.Color() },
        sunColor: { value: new THREE.Color() },
        sunDir: { value: SUN_OFFSET.clone().normalize() },
      },
    });
    this._envScene = new THREE.Scene();
    this._envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), this._skyMat));
    this.scene.environmentIntensity = 0.85;
    this._rebuildEnvironment({});

    // Menu preview & Full-Map shared overview camera
    this.attractCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 260);
    this.overviewCamera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 280);
  }

  applyAtmosphere(template) {
    this.scene.background.setHex(template.skyTop || 0x1e333c);
    this.scene.fog.color.setHex(template.fogColor || 0x223942);
    this.dirLight.color.setHex(template.sunColor || 0xfff2dc);
    this.dirLight.intensity = (template.sunIntensity || 1.95) * 1.1;
    this.hemiLight.color.setHex(template.ambientColor || 0xa1bcc2);
    this._rebuildEnvironment(template);
  }

  /** Bake a small PMREM sky from the arena palette: cool zenith, bright hazy horizon, sun disc. */
  _rebuildEnvironment(template) {
    const top = template.ambientColor || 0xa1bcc2;
    const horizon = template.skyHorizon || 0x2d4b55;
    const ground = template.groundTint || 0x232931;
    const sun = template.sunColor || 0xfff2dc;
    const key = `${top}_${horizon}_${ground}_${sun}`;
    if (key === this._envKey && this._envTarget) return;
    this._envKey = key;

    const u = this._skyMat.uniforms;
    u.topColor.value.setHex(top).multiplyScalar(0.95);
    // Lift the horizon so steel picks up a broad bright band, like an overcast skyline
    u.horizonColor.value.setHex(horizon).lerp(new THREE.Color(0xd9e2e0), 0.55);
    u.groundColor.value.setHex(ground).multiplyScalar(0.8);
    u.sunColor.value.setHex(sun);

    const next = this._pmrem.fromScene(this._envScene, 0.02);
    if (this._envTarget) this._envTarget.dispose();
    this._envTarget = next;
    this.scene.environment = next.texture;
  }

  resize(cssW, cssH, dpr) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, false);
  }

  renderMenuPreview(cssW, cssH, elapsed) {
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, cssW, cssH);
    const ang = elapsed * 0.15;
    const rad = WORLD_SIZE * 0.56;
    this.attractCamera.aspect = cssW / Math.max(1, cssH);
    this.attractCamera.updateProjectionMatrix();
    this.attractCamera.position.set(
      WORLD_SIZE * 0.5 + Math.cos(ang) * rad,
      36,
      WORLD_SIZE * 0.5 + Math.sin(ang) * rad
    );
    this.attractCamera.lookAt(WORLD_SIZE * 0.5, 1.5, WORLD_SIZE * 0.5);
    this.renderer.render(this.scene, this.attractCamera);
  }

  renderFullMap(cssW, cssH, cameraSystem, maxShake = 0) {
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, cssW, cssH);
    this.renderer.clear();
    cameraSystem.updateOverviewCamera(this.overviewCamera, cssW / Math.max(1, cssH), maxShake);
    this.renderer.render(this.scene, this.overviewCamera);
  }

  renderSplitScreen(cssW, cssH, players, viewports, cameraSystem) {
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(0, 0, cssW, cssH);
    this.renderer.setViewport(0, 0, cssW, cssH);
    this.renderer.clear();

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const vp = viewports[i];
      if (!vp || vp.glW <= 0 || vp.glH <= 0) continue;

      cameraSystem.adaptViewportFov(p.camera, vp.w, vp.h);
      this.renderer.setViewport(vp.glX, vp.glY, vp.glW, vp.glH);
      this.renderer.setScissor(vp.glX, vp.glY, vp.glW, vp.glH);
      this.renderer.render(this.scene, p.camera);
    }

    this.renderer.setScissorTest(false);
  }
}
