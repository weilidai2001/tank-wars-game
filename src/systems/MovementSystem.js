import {
  TILE, TANK_MAX_SPEED, TANK_REVERSE_SPEED,
  TANK_ACCEL, TANK_DECEL, TANK_TURN_SPEED,
} from '../config/constants.js';
import { wrapAngle, clamp } from '../core/MathUtils.js';

const ICE_SLIP_DURATION = 0.38; // Matches Tanks3D kIceSlipDuration
// Reverse speed (m/s) over which steering eases from forward (+1) to car-style reverse (-1).
const REVERSE_STEER_BLEND = 2.0;

/**
 * Pure simulation MovementSystem (Single Responsibility Principle).
 * Computes vehicle propulsion, reverse-steering inversion, terrain traction
 * (asphalt / ice momentum carry / forest drag), damped spring suspension
 * (squat, dive, roll, breathing), and displacement-driven track/wheel motion.
 */
export class MovementSystem {
  constructor(arenaGrid, collisionSystem) {
    this.arenaGrid = arenaGrid;
    this.collision = collisionSystem;
  }

  /**
   * Step a tank's physics & suspension from a normalized command { throttle, turn }.
   */
  updateTank(tank, input, allTanks, dt, elapsed) {
    const tileUnder = this.arenaGrid.getTileAtWorld(tank.x, tank.z);
    const onIce = tileUnder === TILE.ICE;
    const inTrees = tileUnder === TILE.TREES;

    const specSpeedMul = tank.speedMul || 1.0;
    const specTurnMul = tank.turnMul || 1.0;
    const rapidMul = tank.rapidTimer > 0 ? 1.12 : 1.0;
    const terrainMul = inTrees ? 0.92 : 1.0;

    const maxFwd = (tank.baseMaxSpeed || TANK_MAX_SPEED) * specSpeedMul * rapidMul * terrainMul;
    const maxRev = (tank.baseRevSpeed || TANK_REVERSE_SPEED) * specSpeedMul * terrainMul;
    const accel = onIce ? TANK_ACCEL * 0.52 : TANK_ACCEL;
    const decel = onIce ? TANK_DECEL * 0.24 : TANK_DECEL;

    const prevSpeed = tank.speed;

    // Throttle against the direction of travel brakes at least as hard as letting go, so a
    // shallow analog pull-back stops the tank instead of letting it roll on for seconds.
    if (input.throttle > 0.02) {
      const rate = tank.speed < 0 ? Math.max(decel, accel * input.throttle) : accel * input.throttle;
      tank.speed = Math.min(maxFwd, tank.speed + rate * dt);
    } else if (input.throttle < -0.02) {
      const rate = tank.speed > 0 ? Math.max(decel, -accel * input.throttle) : -accel * input.throttle;
      tank.speed = Math.max(-maxRev, tank.speed - rate * dt);
    } else {
      if (tank.speed > 0) tank.speed = Math.max(0, tank.speed - decel * dt);
      else if (tank.speed < 0) tank.speed = Math.min(0, tank.speed + decel * dt);
    }

    // Car-style reverse steering (feels like a real vehicle!), keyed off the way the hull is
    // actually rolling rather than the throttle: braking out of a forward turn keeps turning the
    // same way until the tank stops, then the turn eases across a small reverse-speed band
    // instead of snapping. Pivoting in place is unaffected.
    const steerSign = clamp(1 + (2 * tank.speed) / REVERSE_STEER_BLEND, -1, 1);
    const steerDir = input.turn * steerSign;
    const turnRate = (tank.baseTurnSpeed || TANK_TURN_SPEED) * specTurnMul;
    const prevYaw = tank.yaw;
    tank.yaw = wrapAngle(tank.yaw + steerDir * turnRate * dt);
    const deltaYaw = wrapAngle(tank.yaw - prevYaw);

    // Ice momentum carry (Tanks3D-inspired): brief drift along prior vector when on ice
    const fx = -Math.sin(tank.yaw);
    const fz = -Math.cos(tank.yaw);
    let moveX = fx * tank.speed;
    let moveZ = fz * tank.speed;

    if (onIce) {
      if (Math.abs(input.throttle) > 0.05) {
        tank.iceSlipVx = moveX;
        tank.iceSlipVz = moveZ;
        tank.iceSlipTimer = ICE_SLIP_DURATION;
      } else if ((tank.iceSlipTimer || 0) > 0) {
        tank.iceSlipTimer = Math.max(0, tank.iceSlipTimer - dt);
        const slipRatio = tank.iceSlipTimer / ICE_SLIP_DURATION;
        moveX = (tank.iceSlipVx || 0) * slipRatio * 0.65 + moveX * 0.35;
        moveZ = (tank.iceSlipVz || 0) * slipRatio * 0.65 + moveZ * 0.35;
      }
    } else {
      tank.iceSlipTimer = 0;
    }

    const res = this.collision.moveTank(
      tank,
      tank.x + moveX * dt,
      tank.z + moveZ * dt,
      allTanks
    );

    if (res.hitWall) {
      tank.iceSlipTimer = 0;
    }

    // Displacement projected onto heading (prevents tread spinning when pushing into walls!)
    const forwardDisp = res.dx * fx + res.dz * fz;
    const turnArc = deltaYaw * 1.45;
    tank.leftTrackTravel = (tank.leftTrackTravel || 0) + (forwardDisp - turnArc);
    tank.rightTrackTravel = (tank.rightTrackTravel || 0) + (forwardDisp + turnArc);
    tank.actualSpeed = dt > 0 ? forwardDisp / dt : 0;

    // Damped spring suspension (pitch squat/dive + turning roll + idle engine breathing)
    const speedDelta = tank.speed - prevSpeed;
    if (Math.abs(speedDelta) > 0.12) {
      tank.pitchVel = (tank.pitchVel || 0) + clamp(speedDelta * 0.045, -0.42, 0.42);
    }
    tank.rollVel = (tank.rollVel || 0) + steerDir * 0.22 * dt * 14;

    // Spring-damper integration (stiffness 105, damping 10)
    const pStiff = 105;
    const pDamp = 10.5;
    tank.pitchVel = (tank.pitchVel || 0) + (-pStiff * (tank.pitch || 0) - pDamp * (tank.pitchVel || 0)) * dt;
    tank.pitch = clamp((tank.pitch || 0) + tank.pitchVel * dt, -0.085, 0.085);

    const rStiff = 115;
    const rDamp = 11.0;
    tank.rollVel = (tank.rollVel || 0) + (-rStiff * (tank.roll || 0) - rDamp * (tank.rollVel || 0)) * dt;
    tank.roll = clamp((tank.roll || 0) + tank.rollVel * dt, -0.065, 0.065);

    // Subtle idle engine breathing (Tanks3D: sin(t * 2.15) * 0.018 when stationary)
    const moving = Math.abs(tank.actualSpeed) > 0.35;
    tank.idleBob = moving
      ? Math.sin(elapsed * 16.0) * 0.012
      : Math.sin(elapsed * 2.15 + (tank.index || 0) * 1.7) * 0.016;
  }
}
