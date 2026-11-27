import {
  SUB_GRID, CELL_SIZE, WORLD_SIZE, TANK_RADIUS,
} from '../config/constants.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Pure simulation CollisionSystem (Single Responsibility Principle).
 * Handles:
 *  - Two-pass Circle-vs-AABB sub-cell sliding with corner-assist lane nudging
 *  - Mass-weighted Tank-vs-Tank elastic separation
 *  - Spawn/placement occupancy checks
 *  - Opposing shell-vs-shell swept mid-air cancellation with wall LOS guard
 */
export class CollisionSystem {
  constructor(arenaGrid) {
    this.arenaGrid = arenaGrid;
  }

  isPointOccupiedByTank(x, z, radius, allTanks, ignoreTank = null) {
    for (const t of allTanks) {
      if (t !== ignoreTank && t.alive && Math.hypot(t.x - x, t.z - z) < radius + TANK_RADIUS) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolve tank movement against arena bounds, blocking walls/water, and other tanks.
   * Returns actual world displacement { dx, dz, hitWall } so running gear and ice slip
   * react accurately to wall contact.
   */
  moveTank(tank, targetX, targetZ, allTanks) {
    const startX = tank.x;
    const startZ = tank.z;
    const R = TANK_RADIUS;

    let nx = clamp(targetX, R, WORLD_SIZE - R);
    let nz = clamp(targetZ, R, WORLD_SIZE - R);
    let hitWall = nx !== targetX || nz !== targetZ;

    // Two-pass Circle-vs-AABB sub-cell resolution with gentle corner-assist sliding
    for (let pass = 0; pass < 2; pass++) {
      const cMin = Math.max(0, Math.floor((nx - R) / CELL_SIZE));
      const cMax = Math.min(SUB_GRID - 1, Math.floor((nx + R) / CELL_SIZE));
      const rMin = Math.max(0, Math.floor((nz - R) / CELL_SIZE));
      const rMax = Math.min(SUB_GRID - 1, Math.floor((nz + R) / CELL_SIZE));

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const tile = this.arenaGrid.getTile(c, r);
          if (!this.arenaGrid.isBlockingTankTile(tile, tank.hasHover)) continue;

          const minX = c * CELL_SIZE;
          const maxX = (c + 1) * CELL_SIZE;
          const minZ = r * CELL_SIZE;
          const maxZ = (r + 1) * CELL_SIZE;

          const cx = clamp(nx, minX, maxX);
          const cz = clamp(nz, minZ, maxZ);
          const dx = nx - cx;
          const dz = nz - cz;
          const distSq = dx * dx + dz * dz;

          if (distSq < R * R) {
            hitWall = true;
            if (distSq > 1e-6) {
              const dist = Math.sqrt(distSq);
              const push = R - dist;
              nx += (dx / dist) * push;
              nz += (dz / dist) * push;
            } else {
              const overlapLeft = (nx + R) - minX;
              const overlapRight = maxX - (nx - R);
              const overlapTop = (nz + R) - minZ;
              const overlapBot = maxZ - (nz - R);
              const m = Math.min(overlapLeft, overlapRight, overlapTop, overlapBot);
              if (m === overlapLeft) nx = minX - R;
              else if (m === overlapRight) nx = maxX + R;
              else if (m === overlapTop) nz = minZ - R;
              else nz = maxZ + R;
            }
          }
        }
      }
    }

    // Mass-weighted Tank-vs-Tank circle separation
    const myMass = tank.mass || 1.0;
    for (const other of allTanks) {
      if (other === tank || !other.alive) continue;
      const dx = nx - other.x;
      const dz = nz - other.z;
      const minD = R * 1.94;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-4) {
        const otherMass = other.mass || 1.0;
        const weight = otherMass / (myMass + otherMass);
        const push = (minD - d) * (0.45 + 0.45 * weight);
        nx += (dx / d) * push;
        nz += (dz / d) * push;
      }
    }

    tank.x = clamp(nx, R, WORLD_SIZE - R);
    tank.z = clamp(nz, R, WORLD_SIZE - R);

    return {
      dx: tank.x - startX,
      dz: tank.z - startZ,
      hitWall,
    };
  }

  /**
   * Check if two opposing shells collide within this micro-step and are not
   * separated by a solid wall (inspired by Tanks3D's swept shell cancellation).
   */
  shellsCancel(a, b, cancelRadius = 0.78) {
    if (a.owner === b.owner) return false;
    // In Co-op, allied player shells do not cancel each other
    if (a.owner.isPlayer && b.owner.isPlayer && !a.friendlyFire) return false;
    const dist = Math.hypot(a.x - b.x, a.z - b.z);
    if (dist > cancelRadius) return false;
    return this.arenaGrid.hasClearLineOfSight(a.x, a.z, b.x, b.z);
  }
}
