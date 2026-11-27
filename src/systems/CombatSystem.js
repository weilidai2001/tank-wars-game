import {
  SUB_GRID, WORLD_SIZE, TILE, GAME_MODE, TANK_RADIUS,
  AUTO_AIM_HALF_ANGLE, AUTO_AIM_MAX_RANGE, TURRET_SLEW_RATE,
  CELL_SIZE,
} from '../config/constants.js';
import { wrapAngle, clamp, classifyArmorHit, subToWorld, worldToSub } from '../core/MathUtils.js';
import { EVENTS } from '../core/EventBus.js';
import { ArenaGrid } from '../world/ArenaGrid.js';

/**
 * Pure simulation CombatSystem (Single Responsibility Principle).
 * Owns:
 *  - Forward-constrained auto-aim turret tracking with velocity lead
 *  - Shell spawning, adaptive micro-step ballistic travel, & opposing shell cancellation
 *  - Directional armor damage (Front 3x / Side 2x / Back 1-Hit)
 *  - Progressive wall destruction (Brick 5 HP, Concrete 3 HP, Steel 4 HP w/ Tier-IV)
 *  - Tractor-beam wall grab & redeploy
 */
export class CombatSystem {
  constructor(arenaGrid, collisionSystem, bus) {
    this.arenaGrid = arenaGrid;
    this.collision = collisionSystem;
    this.bus = bus;
    this.shells = [];
  }

  clear() {
    this.shells.length = 0;
  }

  getValidTargetsFor(shooter, players, enemies, mode) {
    const targets = [];
    if (mode === GAME_MODE.COOP) {
      if (shooter.isPlayer) {
        for (const e of enemies) if (e.alive) targets.push(e);
      } else {
        for (const p of players) if (p.alive) targets.push(p);
      }
    } else {
      for (const p of players) if (p !== shooter && p.alive) targets.push(p);
      for (const e of enemies) if (e !== shooter && e.alive) targets.push(e);
    }
    return targets;
  }

  getShellSpeed(tank) {
    if (tank.vehicleSpec && tank.vehicleSpec.shellSpeed) {
      return tank.vehicleSpec.shellSpeed;
    }
    if (!tank.isPlayer && tank.stats) return tank.stats.shellSpeed;
    return [40, 46, 53, 60][tank.weaponTier] || 40;
  }

  updateAutoAimTurret(tank, players, enemies, mode, dt) {
    const candidates = this.getValidTargetsFor(tank, players, enemies, mode);
    let bestClear = null;
    let bestClearDist = Infinity;
    let bestBlocked = null;
    let bestBlockedDist = Infinity;

    for (const target of candidates) {
      const dx = target.x - tank.x;
      const dz = target.z - tank.z;
      const dist = Math.hypot(dx, dz);
      if (dist > AUTO_AIM_MAX_RANGE || dist < 0.2) continue;

      const desiredWorldYaw = Math.atan2(-dx, -dz);
      const relAngle = wrapAngle(desiredWorldYaw - tank.yaw);

      if (Math.abs(relAngle) <= AUTO_AIM_HALF_ANGLE) {
        if (this.arenaGrid.hasClearLineOfSight(tank.x, tank.z, target.x, target.z)) {
          if (dist < bestClearDist) {
            bestClearDist = dist;
            bestClear = target;
          }
        } else if (dist < bestBlockedDist) {
          bestBlockedDist = dist;
          bestBlocked = target;
        }
      }
    }

    const prevLock = tank.lockedTarget;
    tank.lockedTarget = bestClear;
    tank.lockedDist = bestClear ? bestClearDist : 0;
    tank.obstructedTarget = bestClear ? null : bestBlocked;

    if (bestClear && bestClear !== prevLock && tank.isPlayer && !tank.isAIControlled) {
      this.bus.emit(EVENTS.LOCK_ACQUIRED, { tank, target: bestClear });
    }

    let desiredOffset = 0;
    if (bestClear) {
      const tFx = -Math.sin(bestClear.yaw);
      const tFz = -Math.cos(bestClear.yaw);
      const shellSpeed = this.getShellSpeed(tank);
      const leadTime = Math.min(0.45, (bestClearDist / shellSpeed) * 0.55);
      const aimX = bestClear.x + tFx * (bestClear.actualSpeed || bestClear.speed || 0) * leadTime;
      const aimZ = bestClear.z + tFz * (bestClear.actualSpeed || bestClear.speed || 0) * leadTime;
      const aimYaw = Math.atan2(-(aimX - tank.x), -(aimZ - tank.z));
      desiredOffset = clamp(wrapAngle(aimYaw - tank.yaw), -AUTO_AIM_HALF_ANGLE, AUTO_AIM_HALF_ANGLE);
    }

    const delta = desiredOffset - tank.turretOffset;
    const maxStep = TURRET_SLEW_RATE * dt;
    if (Math.abs(delta) <= maxStep) {
      tank.turretOffset = desiredOffset;
    } else {
      tank.turretOffset += Math.sign(delta) * maxStep;
    }
    tank.turretOffset = clamp(tank.turretOffset, -AUTO_AIM_HALF_ANGLE, AUTO_AIM_HALF_ANGLE);
  }

  fireCannon(tank, mode) {
    const totalYaw = tank.yaw + tank.turretOffset;
    const fx = -Math.sin(totalYaw);
    const fz = -Math.cos(totalYaw);

    const muzzleDist = 3.15;
    const mx = tank.x + fx * muzzleDist;
    const mz = tank.z + fz * muzzleDist;
    const speed = this.getShellSpeed(tank);
    const breaksSteel = Boolean(
      (tank.vehicleSpec && tank.vehicleSpec.breaksSteel) || tank.weaponTier >= 3
    );

    const colorHex = breaksSteel
      ? 0xf43f5e
      : tank.isPlayer
      ? tank.colorHex
      : 0xfb923c;

    const shell = {
      id: `${tank.id}_${Math.random().toString(36).slice(2, 7)}`,
      owner: tank,
      friendlyFire: mode === GAME_MODE.VERSUS,
      x: mx,
      z: mz,
      yaw: totalYaw,
      vx: fx * speed,
      vz: fz * speed,
      speed,
      colorHex,
      breaksSteel,
      wallDamage: breaksSteel ? 2 : (tank.isPlayer && tank.weaponTier >= 2 ? 2 : 1),
      life: 0,
      maxLife: 2.6,
      alive: true,
    };

    this.shells.push(shell);

    // Recoil + suspension kick
    tank.recoil = 0.48;
    tank.muzzleTimer = 0.075;
    tank.pitchVel = (tank.pitchVel || 0) + 0.36;

    if (tank.isPlayer) {
      tank.shake = Math.max(tank.shake || 0, 0.34);
      const baseReload = (tank.vehicleSpec && tank.vehicleSpec.reload)
        || [0.56, 0.46, 0.36, 0.3][tank.weaponTier]
        || 0.56;
      tank.reloadTimer = tank.rapidTimer > 0 ? baseReload * 0.52 : baseReload;
    } else {
      tank.reloadTimer = tank.stats.reload * (0.85 + Math.random() * 0.35);
    }

    this.bus.emit(EVENTS.TANK_FIRED, { tank, shell });
    return shell;
  }

  handleWallGrabDrop(p, allTanks) {
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);

    if (p.carriedTile === TILE.EMPTY) {
      for (let dist = 2.2; dist <= 6.8; dist += 0.65) {
        const sx = p.x + fx * dist;
        const sz = p.z + fz * dist;
        const { c, r } = worldToSub(sx, sz);
        if (!this.arenaGrid.inBounds(c, r)) break;
        const t = this.arenaGrid.getTile(c, r);
        if (t === TILE.BRICK || t === TILE.CONCRETE || t === TILE.STEEL) {
          p.carriedTile = t;
          p.carriedTileHp = this.arenaGrid.getHp(c, r) || ArenaGrid.maxHpForTile(t);
          this.arenaGrid.setCell(c, r, TILE.EMPTY, 0);
          const wPos = subToWorld(c, r);
          const label = t === TILE.STEEL ? 'GRABBED STEEL'
            : t === TILE.CONCRETE ? 'GRABBED CONCRETE'
            : 'GRABBED BRICK';
          this.bus.emit(EVENTS.TRACTOR_USED, {
            grab: true,
            fromX: p.x, fromZ: p.z,
            toX: wPos.x, toZ: wPos.z,
            colorHex: 0x38bdf8,
          });
          this.bus.emit(EVENTS.POPUP_SPAWNED, {
            x: wPos.x, y: 3.2, z: wPos.z, text: label, color: '#38bdf8',
          });
          return;
        }
      }
    } else {
      const dropX = p.x + fx * 4.5;
      const dropZ = p.z + fz * 4.5;
      const { c, r } = worldToSub(dropX, dropZ);
      if (!this.arenaGrid.inBounds(c, r)) return;
      const existing = this.arenaGrid.getTile(c, r);
      if (existing !== TILE.EMPTY && existing !== TILE.ICE && existing !== TILE.TREES) return;

      const wPos = subToWorld(c, r);
      if (this.collision.isPointOccupiedByTank(wPos.x, wPos.z, CELL_SIZE * 0.42, allTanks)) return;

      const placed = p.carriedTile;
      const placedHp = p.carriedTileHp || ArenaGrid.maxHpForTile(placed);
      p.carriedTile = TILE.EMPTY;
      p.carriedTileHp = 0;
      this.arenaGrid.setCell(c, r, placed, placedHp);

      this.bus.emit(EVENTS.TRACTOR_USED, {
        grab: false,
        fromX: p.x, fromZ: p.z,
        toX: wPos.x, toZ: wPos.z,
        colorHex: 0xfbbf24,
      });
      this.bus.emit(EVENTS.POPUP_SPAWNED, {
        x: wPos.x, y: 3.4, z: wPos.z, text: 'DEPLOYED WALL', color: '#fbbf24',
      });
    }
  }

  /**
   * Adaptive micro-stepped ballistic update (inspired by Tanks3D's CombatSystem):
   * guarantees no fast shell tunnels through thin walls or opposing shells.
   */
  updateShells(dt, state) {
    const { players, enemies, mode, eagleAlive, onEagleDestroyed, onBonusHit } = state;

    // Determine micro-step count from fastest active shell (max ~0.55m per sub-step)
    let maxSpeed = 30;
    for (const s of this.shells) {
      if (s.speed > maxSpeed) maxSpeed = s.speed;
    }
    const steps = Math.max(2, Math.min(8, Math.ceil((maxSpeed * dt) / 0.55)));
    const subDt = dt / steps;

    for (let step = 0; step < steps; step++) {
      // 1. Advance shells & resolve arena / wall / eagle / tank collisions
      for (let i = 0; i < this.shells.length; i++) {
        const s = this.shells[i];
        if (!s.alive) continue;

        s.life += subDt;
        if (s.life >= s.maxLife) {
          s.alive = false;
          continue;
        }

        s.x += s.vx * subDt;
        s.z += s.vz * subDt;

        // Arena boundary check
        if (s.x <= 0.2 || s.x >= WORLD_SIZE - 0.2 || s.z <= 0.2 || s.z >= WORLD_SIZE - 0.2) {
          this.bus.emit(EVENTS.WALL_RICOCHET, { x: s.x, y: 1.6, z: s.z, colorHex: 0x94a3b8 });
          s.alive = false;
          continue;
        }

        // Grid wall / eagle check
        const { c, r } = worldToSub(s.x, s.z);
        if (this.arenaGrid.inBounds(c, r)) {
          const tile = this.arenaGrid.getTile(c, r);
          if (tile === TILE.BRICK || tile === TILE.CONCRETE) {
            const maxHp = ArenaGrid.maxHpForTile(tile);
            const remHp = this.arenaGrid.damageWallFace(c, r, s.vx, s.vz, tile, s.wallDamage);
            const isBrick = tile === TILE.BRICK;
            this.bus.emit(remHp === 0 ? EVENTS.WALL_BREACHED : EVENTS.WALL_DAMAGED, {
              x: s.x,
              y: 1.5,
              z: s.z,
              tile,
              colorHex: isBrick ? 0xc2593f : 0x9ca3af,
              breached: remHp === 0,
            });
            if (s.owner && s.owner.isPlayer && !s.owner.isAIControlled) {
              const wPos = subToWorld(c, r);
              this.bus.emit(EVENTS.POPUP_SPAWNED, {
                x: wPos.x,
                y: 2.6,
                z: wPos.z,
                text: remHp === 0 ? 'BREACHED!' : `${isBrick ? 'BRICK' : 'CONCRETE'} ${remHp}/${maxHp}`,
                color: remHp === 0 ? '#4ade80' : '#fdba74',
              });
            }
            s.alive = false;
            continue;
          } else if (tile === TILE.STEEL) {
            if (s.breaksSteel) {
              const maxHp = ArenaGrid.maxHpForTile(TILE.STEEL);
              const remHp = this.arenaGrid.damageWallFace(c, r, s.vx, s.vz, TILE.STEEL, 2);
              this.bus.emit(remHp === 0 ? EVENTS.WALL_BREACHED : EVENTS.WALL_DAMAGED, {
                x: s.x,
                y: 1.7,
                z: s.z,
                tile: TILE.STEEL,
                colorHex: 0x7dd3fc,
                breached: remHp === 0,
              });
              if (s.owner && s.owner.isPlayer && !s.owner.isAIControlled) {
                const wPos = subToWorld(c, r);
                this.bus.emit(EVENTS.POPUP_SPAWNED, {
                  x: wPos.x,
                  y: 2.7,
                  z: wPos.z,
                  text: remHp === 0 ? 'STEEL BREACHED!' : `STEEL ${remHp}/${maxHp}`,
                  color: '#38bdf8',
                });
              }
            } else {
              this.bus.emit(EVENTS.WALL_RICOCHET, { x: s.x, y: 1.7, z: s.z, colorHex: 0xe2e8f0 });
            }
            s.alive = false;
            continue;
          } else if (tile === TILE.PERM_STEEL) {
            this.bus.emit(EVENTS.WALL_RICOCHET, { x: s.x, y: 1.7, z: s.z, colorHex: 0xfef08a });
            s.alive = false;
            continue;
          } else if (tile === TILE.EAGLE && eagleAlive) {
            if (!s.owner.isPlayer) {
              onEagleDestroyed();
            } else {
              this.bus.emit(EVENTS.WALL_RICOCHET, { x: s.x, y: 1.8, z: s.z, colorHex: 0xfef08a });
            }
            s.alive = false;
            continue;
          }
        }

        // Tank impact check
        const hitTank = this._findHitTank(s, players, enemies, mode);
        if (hitTank) {
          this._applyShellDamage(s, hitTank, mode, onBonusHit);
          s.alive = false;
          continue;
        }
      }

      // 2. Opposing shell-vs-shell mid-air cancellation (Tanks3D mechanic!)
      for (let i = 0; i < this.shells.length; i++) {
        const a = this.shells[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < this.shells.length; j++) {
          const b = this.shells[j];
          if (!b.alive) continue;
          if (this.collision.shellsCancel(a, b)) {
            a.alive = false;
            b.alive = false;
            this.bus.emit(EVENTS.SHELL_CANCELLED, {
              x: (a.x + b.x) * 0.5,
              y: 1.62,
              z: (a.z + b.z) * 0.5,
            });
            break;
          }
        }
      }
    }

    // Prune dead shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      if (!this.shells[i].alive) {
        this.shells.splice(i, 1);
      }
    }
  }

  _findHitTank(shell, players, enemies, mode) {
    const hitRadius = TANK_RADIUS + 0.34;
    if (mode === GAME_MODE.COOP) {
      if (shell.owner.isPlayer) {
        for (const e of enemies) {
          if (e.alive && Math.hypot(e.x - shell.x, e.z - shell.z) < hitRadius) return e;
        }
      } else {
        for (const p of players) {
          if (p.alive && Math.hypot(p.x - shell.x, p.z - shell.z) < hitRadius) return p;
        }
      }
    } else {
      for (const p of players) {
        if (p !== shell.owner && p.alive && Math.hypot(p.x - shell.x, p.z - shell.z) < hitRadius) {
          return p;
        }
      }
      for (const e of enemies) {
        if (e !== shell.owner && e.alive && Math.hypot(e.x - shell.x, e.z - shell.z) < hitRadius) {
          return e;
        }
      }
    }
    return null;
  }

  _applyShellDamage(shell, victim, mode, onBonusHit) {
    if (victim.shieldTimer > 0) {
      this.bus.emit(EVENTS.WALL_RICOCHET, { x: shell.x, y: 1.8, z: shell.z, colorHex: 0x38bdf8 });
      return;
    }

    if (!victim.isPlayer && victim.isBonus) {
      victim.isBonus = false;
      if (onBonusHit) onBonusHit(victim);
    }

    // Directional Armor Calculation
    const sSpeed = Math.hypot(shell.vx, shell.vz) || 1;
    const trajX = -shell.vx / sSpeed;
    const trajZ = -shell.vz / sSpeed;
    const offX = shell.x - victim.x;
    const offZ = shell.z - victim.z;
    const offLen = Math.hypot(offX, offZ) || 1;
    const inX = trajX * 0.7 + (offX / offLen) * 0.3;
    const inZ = trajZ * 0.7 + (offZ / offLen) * 0.3;
    const hitInfo = classifyArmorHit(inX, inZ, victim.yaw, victim.maxHp);

    if (victim.isPlayer) {
      victim.hitFlash = hitInfo.zone === 'BACK' ? 0.95 : 0.55;
      victim.shake = hitInfo.zone === 'BACK' ? 1.15 : 0.75;
    }

    // Absorb with Hover-Pontoon or Reactive Armor (unless Backstab!)
    if (hitInfo.zone !== 'BACK') {
      if (victim.hasHover) {
        victim.hasHover = false;
        this.bus.emit(EVENTS.TANK_HIT, {
          victim,
          shell,
          hitInfo,
          absorbedBy: 'PONTOON',
          x: victim.x,
          y: 1.4,
          z: victim.z,
          colorHex: 0x2dd4bf,
        });
        this.bus.emit(EVENTS.POPUP_SPAWNED, {
          x: victim.x, y: 2.8, z: victim.z, text: 'PONTOON LOST', color: '#2dd4bf',
        });
        return;
      }
      if (victim.armor > 0) {
        victim.armor = Math.max(0, victim.armor - 1);
        this.bus.emit(EVENTS.TANK_HIT, {
          victim,
          shell,
          hitInfo,
          absorbedBy: 'ARMOR',
          x: victim.x,
          y: 1.6,
          z: victim.z,
          colorHex: 0x38bdf8,
        });
        this.bus.emit(EVENTS.POPUP_SPAWNED, {
          x: victim.x, y: 2.8, z: victim.z, text: 'REACTIVE PLATE', color: '#38bdf8',
        });
        return;
      }
    }

    victim.hp -= hitInfo.damage;
    if (victim.hp > 0) {
      this.bus.emit(EVENTS.TANK_HIT, {
        victim,
        shell,
        hitInfo,
        absorbedBy: null,
        x: shell.x,
        y: 1.7,
        z: shell.z,
        colorHex: hitInfo.sparkHex,
      });
      const tag = hitInfo.zone === 'FRONT' ? 'FRONT ARMOR (3×)' : 'SIDE FLANK! (2×)';
      this.bus.emit(EVENTS.POPUP_SPAWNED, {
        x: victim.x, y: 2.9, z: victim.z, text: tag, color: hitInfo.color,
      });
      return;
    }

    // Destroyed!
    victim.alive = false;
    const attacker = shell.owner;
    let pts = 0;

    if (attacker) {
      attacker.frags = (attacker.frags || 0) + 1;
      if (attacker.isPlayer) {
        const backstabBonus = hitInfo.zone === 'BACK' ? 150 : 0;
        pts = (victim.points || 250) + backstabBonus;
        attacker.score += pts;
        const killText = hitInfo.zone === 'BACK'
          ? (mode === GAME_MODE.VERSUS ? `${attacker.tag} BACKSTAB!` : `BACKSTAB! +${pts}`)
          : (mode === GAME_MODE.VERSUS ? `${attacker.tag} +1 FRAG!` : `+${pts}`);
        this.bus.emit(EVENTS.POPUP_SPAWNED, {
          x: victim.x,
          y: 3.1,
          z: victim.z,
          text: killText,
          color: hitInfo.zone === 'BACK' ? '#f43f5e' : attacker.cssColor,
        });
      }
    }

    if (victim.isPlayer) {
      if (mode === GAME_MODE.COOP) {
        victim.lives -= 1;
        victim.weaponTier = Math.max(0, victim.weaponTier - 1);
        if (victim.lives > 0) {
          victim.respawnTimer = 2.2;
        } else {
          victim.eliminated = true;
        }
      } else {
        victim.respawnTimer = 2.5;
      }
    } else if (mode === GAME_MODE.VERSUS) {
      victim.respawnTimer = 3.0;
    }

    this.bus.emit(EVENTS.TANK_DESTROYED, {
      victim,
      attacker,
      hitInfo,
      x: victim.x,
      y: 1.5,
      z: victim.z,
    });
  }
}
