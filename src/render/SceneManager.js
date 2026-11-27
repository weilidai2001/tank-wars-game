import * as THREE from '../../vendor/three.module.min.js';
import { WORLD_SIZE } from '../config/constants.js';

/**
 * Three.js Scene, Lighting & Multi-Viewport Renderer (Single Responsibility Principle).
 * Applies Tanks3D-inspired warm key sun + cool sky ambient fill + subtle rim light
 * so painted armor planes, steel highlights, and shadows read crisply at every distance.
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
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e333c);
    this.scene.fog = new THREE.FogExp2(0x223942, 0.0022);

    // Cool sky / warm ground hemisphere fill (Tanks3D: #a1bcc2 sky fill)
    this.hemiLight = new THREE.HemisphereLight(0xa1bcc2, 0x222c33, 0.92);
    this.hemiLight.position.set(WORLD_SIZE * 0.5, 48, WORLD_SIZE * 0.5);
    this.scene.add(this.hemiLight);

    // Warm key directional sun (Tanks3D angle: ~54 deg elev, -28 deg azimuth, #fff2dc)
    this.dirLight = new THREE.DirectionalLight(0xfff2dc, 1.95);
    this.dirLight.position.set(WORLD_SIZE * 0.78, 62, WORLD_SIZE * 0.22);
    this.dirLight.target.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    const sHalf = WORLD_SIZE * 0.6;
    this.dirLight.shadow.camera.left = -sHalf;
    this.dirLight.shadow.camera.right = sHalf;
    this.dirLight.shadow.camera.top = sHalf;
    this.dirLight.shadow.camera.bottom = -sHalf;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 148;
    this.dirLight.shadow.bias = -0.0006;
    this.dirLight.shadow.normalBias = 0.04;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Subtle cool rim backlight to separate tank silhouettes from dark shadows
    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.42);
    this.rimLight.position.set(WORLD_SIZE * 0.15, 28, WORLD_SIZE * 0.92);
    this.rimLight.target.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // Menu preview & Full-Map shared overview camera
    this.attractCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 260);
    this.overviewCamera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 280);
  }

  applyAtmosphere(template) {
    this.scene.background.setHex(template.skyTop || 0x1e333c);
    this.scene.fog.color.setHex(template.fogColor || 0x223942);
    this.dirLight.color.setHex(template.sunColor || 0xfff2dc);
    this.dirLight.intensity = template.sunIntensity || 1.95;
    this.hemiLight.color.setHex(template.ambientColor || 0xa1bcc2);
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
