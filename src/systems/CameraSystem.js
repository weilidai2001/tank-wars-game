import {
  SUB_GRID, WORLD_SIZE, CAMERA_PRESETS,
} from '../config/constants.js';
import { clamp, worldToSub } from '../core/MathUtils.js';
import { ArenaGrid } from '../world/ArenaGrid.js';

/**
 * Multi-Mode CameraSystem (Single Responsibility Principle).
 * Supports:
 *  - Behind Tank (Chase), Turret Sight (1P Hood), High Chase with smooth exponential
 *    damping and anti-wall-clipping raycast
 *  - Full Map Tactical Overview (inspired by Tanks3D's BattlefieldCamera.overview),
 *    which auto-frames the entire 91m x 91m arena with user-adjustable yaw & elevation!
 *  - Hor+ FOV adaptation for narrow split-screen viewports.
 */
export class CameraSystem {
  constructor(arenaGrid) {
    this.arenaGrid = arenaGrid;
    this.presetIndex = 0;
    this.pitchOffset = 0;       // Follow-mode vertical look offset ([ / ])
    this.overviewYawDeg = 0;    // Full-Map rotation (-45..+45 deg, , / .)
    this.overviewElevDeg = 54;  // Full-Map elevation (38..72 deg, [ / ])
  }

  getPreset() {
    return CAMERA_PRESETS[this.presetIndex];
  }

  isFullMapMode() {
    return this.getPreset().type === 'overview';
  }

  cyclePreset(players) {
    this.presetIndex = (this.presetIndex + 1) % CAMERA_PRESETS.length;
    const preset = this.getPreset();
    for (const p of players) {
      if (p.camera) {
        p.camera.fov = preset.fov;
        p.camera.updateProjectionMatrix();
      }
    }
    return preset;
  }

  adjustPitch(delta) {
    if (this.isFullMapMode()) {
      this.overviewElevDeg = clamp(this.overviewElevDeg + delta * 1.5, 38, 74);
    } else {
      this.pitchOffset = clamp(this.pitchOffset + delta, -10, 18);
    }
  }

  adjustOverviewYaw(deltaDeg) {
    this.overviewYawDeg = clamp(this.overviewYawDeg + deltaDeg, -45, 45);
  }

  updatePlayerCamera(p, dt) {
    const preset = this.getPreset();
    if (!p.camera) return;

    if (preset.type === 'overview') {
      this._updateOverviewCamera(p.camera, p.shake || 0);
      return;
    }

    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);

    const anchorX = p.x;
    const anchorY = 2.45;
    const anchorZ = p.z;

    const idealX = p.x - fx * preset.distBack;
    const idealY = preset.height;
    const idealZ = p.z - fz * preset.distBack;

    // Anti-wall-clipping raycast backward from tank turret to ideal camera
    let safeT = 1.0;
    const samples = 14;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const sx = anchorX + (idealX - anchorX) * t;
      const sy = anchorY + (idealY - anchorY) * t;
      const sz = anchorZ + (idealZ - anchorZ) * t;

      const outOfBounds = sx < -3.8 || sx > WORLD_SIZE + 3.8 || sz < -3.8 || sz > WORLD_SIZE + 3.8;
      let hitsWall = false;
      if (sx >= 0 && sx <= WORLD_SIZE && sz >= 0 && sz <= WORLD_SIZE) {
        const { c, r } = worldToSub(sx, sz);
        if (c >= 0 && c < SUB_GRID && r >= 0 && r < SUB_GRID) {
          const tile = this.arenaGrid.getTile(c, r);
          if (ArenaGrid.isWallTile(tile)) {
            const maxHp = ArenaGrid.maxHpForTile(tile) || 1;
            const hpFrac = (this.arenaGrid.getHp(c, r) || maxHp) / maxHp;
            const fullH = ArenaGrid.heightForTile(tile);
            hitsWall = sy < fullH * hpFrac + 0.35;
          }
        }
      }
      if (outOfBounds || hitsWall) {
        safeT = Math.max(0.2, (i - 1) / samples - 0.04);
        break;
      }
    }

    const targetCamX = anchorX + (idealX - anchorX) * safeT;
    const targetCamY = anchorY + (idealY - anchorY) * safeT;
    const targetCamZ = anchorZ + (idealZ - anchorZ) * safeT;

    const lookYaw = p.yaw + p.turretOffset * 0.25;
    const lfx = -Math.sin(lookYaw);
    const lfz = -Math.cos(lookYaw);
    const targetLookX = p.x + lfx * preset.lookAhead;
    const targetLookY = preset.lookHeight + this.pitchOffset;
    const targetLookZ = p.z + lfz * preset.lookAhead;

    if (!p.camInitialized) {
      p.camPos.set(targetCamX, targetCamY, targetCamZ);
      p.camLook.set(targetLookX, targetLookY, targetLookZ);
      p.camInitialized = true;
    } else {
      const k = 1 - Math.exp(-15 * dt);
      p.camPos.x += (targetCamX - p.camPos.x) * k;
      p.camPos.y += (targetCamY - p.camPos.y) * k;
      p.camPos.z += (targetCamZ - p.camPos.z) * k;

      p.camLook.x += (targetLookX - p.camLook.x) * k;
      p.camLook.y += (targetLookY - p.camLook.y) * k;
      p.camLook.z += (targetLookZ - p.camLook.z) * k;
    }

    const shakeMag = (p.shake || 0) * 0.22;
    const sx = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;
    const sy = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;

    p.camera.position.set(p.camPos.x + sx, p.camPos.y + sy, p.camPos.z);
    p.camera.lookAt(p.camLook);
  }

  /**
   * Fixed-center Full Map Tactical Overview camera framing the entire 91m arena.
   */
  updateOverviewCamera(camera, aspect, shake = 0) {
    const preset = this.getPreset();
    const fov = preset.fov || 42;
    const elev = (this.overviewElevDeg * Math.PI) / 180;
    const yaw = (this.overviewYawDeg * Math.PI) / 180;

    // Fit full 91m + perimeter into viewport regardless of aspect ratio
    const halfSpan = WORLD_SIZE * 0.54;
    const vHalfRad = (fov * 0.5 * Math.PI) / 180;
    const hHalfRad = Math.atan(Math.tan(vHalfRad) * Math.max(0.6, aspect));
    const distV = halfSpan / Math.tan(vHalfRad);
    const distH = halfSpan / Math.tan(hHalfRad);
    const dist = Math.max(distV, distH) * 1.12;

    const cx = WORLD_SIZE * 0.5;
    const cz = WORLD_SIZE * 0.5;
    const shakeMag = shake * 0.35;
    const sx = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;
    const sy = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;

    camera.aspect = aspect;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.position.set(
      cx + Math.sin(yaw) * Math.cos(elev) * dist + sx,
      Math.sin(elev) * dist + sy,
      cz + Math.cos(yaw) * Math.cos(elev) * dist
    );
    camera.lookAt(cx, 1.5, cz);
  }

  _updateOverviewCamera(camera, shake) {
    this.updateOverviewCamera(camera, camera.aspect || 16 / 9, shake);
  }

  adaptViewportFov(camera, vpW, vpH) {
    const aspect = vpW / Math.max(1, vpH);
    const preset = this.getPreset();
    if (preset.type === 'overview') {
      this.updateOverviewCamera(camera, aspect, 0);
      return;
    }
    const baseFov = preset.fov;
    const adaptedFov = aspect < 1.15
      ? Math.min(76, (2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / Math.max(0.72, aspect * 0.85)) * 180) / Math.PI)
      : baseFov;
    if (camera.aspect !== aspect || Math.abs(camera.fov - adaptedFov) > 0.05) {
      camera.aspect = aspect;
      camera.fov = adaptedFov;
      camera.updateProjectionMatrix();
    }
  }
}
