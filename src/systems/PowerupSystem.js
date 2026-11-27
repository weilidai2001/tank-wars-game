import { SUB_GRID, TILE, TANK_RADIUS } from '../config/constants.js';
import { subToWorld } from '../core/MathUtils.js';
import { getPowerupDef, pickRandomPowerupType, emitPickupEvent } from '../config/powerups.js';
import { EVENTS } from '../core/EventBus.js';

/**
 * Pure simulation PowerupSystem (Single Responsibility Principle + Strategy Pattern).
 * Spawns crates, tracks lifetimes, detects collection, and delegates effect execution
 * to the Strategy handler registered in `src/config/powerups.js`.
 */
export class PowerupSystem {
  constructor(arenaGrid, collisionSystem, bus) {
    this.arenaGrid = arenaGrid;
    this.collision = collisionSystem;
    this.bus = bus;
    this.crates = [];
    this._nextId = 1;
  }

  clear() {
    this.crates.length = 0;
  }

  spawnRandomCrate(mode, allTanks) {
    for (let tries = 0; tries < 32; tries++) {
      const c = 2 + Math.floor(Math.random() * (SUB_GRID - 4));
      const r = 2 + Math.floor(Math.random() * (SUB_GRID - 4));
      if (this.arenaGrid.getTile(c, r) !== TILE.EMPTY) continue;
      const pos = subToWorld(c, r);
      if (this.collision.isPointOccupiedByTank(pos.x, pos.z, 3.0, allTanks)) continue;

      const type = pickRandomPowerupType(mode);
      const crate = {
        id: this._nextId++,
        type,
        x: pos.x,
        z: pos.z,
        life: 0,
        maxLife: 22.0,
      };
      this.crates.push(crate);
      if (this.bus) this.bus.emit(EVENTS.PICKUP_SPAWNED, { x: crate.x, z: crate.z, type });
      return crate;
    }
    return null;
  }

  update(dt, players, powerupContext) {
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const cr = this.crates[i];
      cr.life += dt;
      if (cr.life >= cr.maxLife) {
        this.crates.splice(i, 1);
        continue;
      }

      for (const p of players) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - cr.x, p.z - cr.z) < TANK_RADIUS + 1.55) {
          const def = getPowerupDef(cr.type);
          p.score += 500;
          def.apply(powerupContext, p);
          emitPickupEvent(this.bus, p, def);
          this.crates.splice(i, 1);
          break;
        }
      }
    }
  }
}
