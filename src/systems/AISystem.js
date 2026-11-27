import { CELL_SIZE, TILE, GAME_MODE } from '../config/constants.js';
import { wrapAngle, clamp } from '../core/MathUtils.js';

/**
 * Tactical AISystem (Single Responsibility Principle).
 * Drives BOTH:
 *  1. Enemy Waves & Versus AI Rival Bots
 *  2. Autonomous Co-op AI Wingman (P2 AI Teammate, inspired by Tanks3D!)
 *     — produces a standard { throttle, turn, fire, action } command frame
 *     with zero cheat stats and an Eagle Base friendly-fire guard.
 */
export class AISystem {
  constructor(arenaGrid, movementSystem, combatSystem) {
    this.arenaGrid = arenaGrid;
    this.movement = movementSystem;
    this.combat = combatSystem;
  }

  /**
   * Compute a fair normalized command frame for an AI-controlled teammate tank (P2 AI).
   */
  computeWingmanCommand(p, enemies, crates, dt) {
    p.aiDecisionTimer = (p.aiDecisionTimer || 0) - dt;
    const eagleX = 13 * CELL_SIZE;
    const eagleZ = 25 * CELL_SIZE;

    // Pick highest-priority goal: nearby supply crate -> enemy threatening Eagle -> nearest enemy
    let goalX = eagleX;
    let goalZ = eagleZ - 14;
    let bestScore = Infinity;

    for (const cr of crates) {
      const d = Math.hypot(cr.x - p.x, cr.z - p.z);
      if (d < 22 && d * 0.7 < bestScore) {
        bestScore = d * 0.7;
        goalX = cr.x;
        goalZ = cr.z;
      }
    }

    for (const e of enemies) {
      if (!e.alive) continue;
      const distToMe = Math.hypot(e.x - p.x, e.z - p.z);
      const distToEagle = Math.hypot(e.x - eagleX, e.z - eagleZ);
      // Prioritize enemies close to the Eagle Core
      const score = distToMe * 0.65 + distToEagle * 0.45;
      if (score < bestScore) {
        bestScore = score;
        goalX = e.x;
        goalZ = e.z;
      }
    }

    const prevX = p._aiPrevX ?? p.x;
    const prevZ = p._aiPrevZ ?? p.z;
    const moved = Math.hypot(p.x - prevX, p.z - prevZ);
    p._aiPrevX = p.x;
    p._aiPrevZ = p.z;

    if (moved < 0.03) {
      p.aiStuckTimer = (p.aiStuckTimer || 0) + dt;
    } else {
      p.aiStuckTimer = Math.max(0, (p.aiStuckTimer || 0) - dt * 1.5);
    }

    if (p.aiDecisionTimer <= 0 || (p.aiStuckTimer || 0) > 0.4) {
      const desiredYaw = Math.atan2(-(goalX - p.x), -(goalZ - p.z));
      if ((p.aiStuckTimer || 0) > 0.4) {
        const offsets = [Math.PI * 0.5, -Math.PI * 0.5, Math.PI * 0.75, -Math.PI * 0.75];
        let picked = wrapAngle(p.yaw + offsets[Math.floor(Math.random() * offsets.length)]);
        for (const off of offsets) {
          const testYaw = wrapAngle(desiredYaw + off);
          const tile = this.arenaGrid.getTileAtWorld(
            p.x - Math.sin(testYaw) * 5.0,
            p.z - Math.cos(testYaw) * 5.0
          );
          if (!this.arenaGrid.isBlockingTankTile(tile, p.hasHover)) {
            picked = testYaw;
            break;
          }
        }
        p.aiGoalYaw = picked;
        p.aiStuckTimer = 0;
        p.aiDecisionTimer = 0.75;
      } else {
        p.aiGoalYaw = desiredYaw;
        p.aiDecisionTimer = 0.2; // 5 Hz smooth steering update
      }
    }

    const yawDiff = wrapAngle((p.aiGoalYaw ?? p.yaw) - p.yaw);
    const turn = Math.abs(yawDiff) > 0.08 ? clamp(yawDiff * 2.2, -1, 1) : 0;
    const throttle = Math.abs(yawDiff) < 1.05 ? 1 : 0.25;

    // Safe-fire check: fire when locked on OR breaching brick wall, but NEVER shoot toward Eagle!
    let fire = false;
    const aimYaw = p.yaw + p.turretOffset;
    const afx = -Math.sin(aimYaw);
    const afz = -Math.cos(aimYaw);
    const toEagleYaw = Math.atan2(-(eagleX - p.x), -(eagleZ - p.z));
    const aimingAtEagle = Math.abs(wrapAngle(toEagleYaw - aimYaw)) < 0.22 &&
      Math.hypot(eagleX - p.x, eagleZ - p.z) < 28;

    if (!aimingAtEagle) {
      if (p.lockedTarget) {
        fire = true;
      } else {
        const ahead = this.arenaGrid.getTileAtWorld(p.x + afx * 4.6, p.z + afz * 4.6);
        if (ahead === TILE.BRICK || ahead === TILE.CONCRETE) {
          fire = true;
        }
      }
    }

    return { throttle, turn, fire, action: false };
  }

  /**
   * Update an Enemy Wave tank or Versus Rival Bot.
   */
  updateEnemy(e, players, enemies, allTanks, mode, freezeTimer, dt, elapsed) {
    if (!e.alive) return;

    if (e.shieldTimer > 0) e.shieldTimer = Math.max(0, e.shieldTimer - dt);
    if (e.reloadTimer > 0) e.reloadTimer = Math.max(0, e.reloadTimer - dt);

    // Frozen by EMP power-up in Co-op
    if (freezeTimer > 0 && mode === GAME_MODE.COOP) {
      return;
    }

    const rivals = this.combat.getValidTargetsFor(e, players, enemies, mode);
    let goalX = 13 * CELL_SIZE;
    let goalZ = 25 * CELL_SIZE;
    let nearestDist = Infinity;

    for (const r of rivals) {
      const d = Math.hypot(r.x - e.x, r.z - e.z);
      if (d < nearestDist) {
        nearestDist = d;
        goalX = r.x;
        goalZ = r.z;
      }
    }

    // Co-op bias toward pushing south to Eagle Core
    if (mode === GAME_MODE.COOP && Math.random() < 0.025) {
      goalX = 13 * CELL_SIZE;
      goalZ = 25 * CELL_SIZE;
    }

    e.aiTurnTimer -= dt;
    const prevX = e.x;
    const prevZ = e.z;

    if (e.aiTurnTimer <= 0 || e.stuckTimer > 0.34) {
      const toGoalYaw = Math.atan2(-(goalX - e.x), -(goalZ - e.z));
      if (e.stuckTimer > 0.34) {
        const offsets = [Math.PI * 0.5, -Math.PI * 0.5, Math.PI * 0.75, -Math.PI * 0.75, Math.PI];
        let picked = wrapAngle(e.yaw + offsets[Math.floor(Math.random() * offsets.length)]);
        for (const off of offsets) {
          const testYaw = wrapAngle(toGoalYaw + off * (Math.random() < 0.5 ? 1 : -1));
          const checkTile = this.arenaGrid.getTileAtWorld(
            e.x - Math.sin(testYaw) * 5.2,
            e.z - Math.cos(testYaw) * 5.2
          );
          if (!this.arenaGrid.isBlockingTankTile(checkTile, e.hasHover)) {
            picked = testYaw;
            break;
          }
        }
        e.aiGoalYaw = picked;
        e.stuckTimer = 0;
        e.aiTurnTimer = 1.5 + Math.random() * 1.2;
      } else {
        const wander = Math.random() < 0.34
          ? Math.floor(Math.random() * 4) * Math.PI * 0.5
          : wrapAngle(toGoalYaw + (Math.random() - 0.5) * 0.8);
        e.aiGoalYaw = wander;
        e.aiTurnTimer = 1.3 + Math.random() * 1.4;
      }
    }

    const yawDiff = wrapAngle(e.aiGoalYaw - e.yaw);
    const turnInput = Math.abs(yawDiff) > 0.05 ? clamp(yawDiff * 2.4, -1, 1) : 0;
    const throttleInput = Math.abs(yawDiff) < 0.9 ? 1.0 : 0.25;

    this.movement.updateTank(e, { throttle: throttleInput, turn: turnInput }, allTanks, dt, elapsed);

    const moved = Math.hypot(e.x - prevX, e.z - prevZ);
    if (moved < e.stats.speed * dt * 0.3) {
      e.stuckTimer += dt;
    } else {
      e.stuckTimer = Math.max(0, e.stuckTimer - dt);
    }

    // Enemy turrets stay fixed straight ahead (must line up hull to shoot)
    e.turretOffset = 0;
    e.lockedTarget = null;
    e.obstructedTarget = null;

    let targetDeadAhead = false;
    for (const r of rivals) {
      const dx = r.x - e.x;
      const dz = r.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 54) continue;
      const rel = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - e.yaw));
      if (rel < 0.16 && this.arenaGrid.hasClearLineOfSight(e.x, e.z, r.x, r.z)) {
        targetDeadAhead = true;
        break;
      }
    }

    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    const aheadTile = this.arenaGrid.getTileAtWorld(e.x + fx * 4.5, e.z + fz * 4.5);
    const shouldBreach = aheadTile === TILE.BRICK || aheadTile === TILE.CONCRETE || aheadTile === TILE.EAGLE;

    if (e.reloadTimer <= 0 && (targetDeadAhead || shouldBreach)) {
      this.combat.fireCannon(e, mode);
    }
  }
}
