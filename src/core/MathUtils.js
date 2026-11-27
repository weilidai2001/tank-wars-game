import { BASE_TANK_HP, CELL_SIZE } from '../config/constants.js';

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function applyDeadzone(val, deadzone = 0.16) {
  const mag = Math.abs(val);
  if (mag <= deadzone) return 0;
  return Math.sign(val) * Math.min(1, (mag - deadzone) / (1 - deadzone));
}

export function macroToWorld(tx, ty) {
  return {
    x: (tx * 2 + 1) * CELL_SIZE,
    z: (ty * 2 + 1) * CELL_SIZE,
  };
}

export function subToWorld(c, r) {
  return {
    x: (c + 0.5) * CELL_SIZE,
    z: (r + 0.5) * CELL_SIZE,
  };
}

export function worldToSub(x, z) {
  return {
    c: Math.floor(x / CELL_SIZE),
    r: Math.floor(z / CELL_SIZE),
  };
}

/**
 * Classify which directional armor zone an incoming shot or sightline hits on a tank.
 * (inX, inZ) points FROM victim center TOWARD the incoming shot/attacker.
 */
export function classifyArmorHit(inX, inZ, victimYaw, maxHp = BASE_TANK_HP) {
  const len = Math.hypot(inX, inZ) || 1;
  const nx = inX / len;
  const nz = inZ / len;
  const vfx = -Math.sin(victimYaw);
  const vfz = -Math.cos(victimYaw);
  const cosTheta = nx * vfx + nz * vfz;

  if (cosTheta >= 0.58) {
    return {
      zone: 'FRONT',
      damage: 2,
      hitsLabel: 'FRONT 3×',
      color: '#60a5fa',
      sparkHex: 0x93c5fd,
    };
  }
  if (cosTheta <= -0.58) {
    return {
      zone: 'BACK',
      damage: maxHp,
      hitsLabel: 'BACK 1-HIT!',
      color: '#f43f5e',
      sparkHex: 0xf43f5e,
    };
  }
  return {
    zone: 'SIDE',
    damage: 3,
    hitsLabel: 'SIDE 2×',
    color: '#fbbf24',
    sparkHex: 0xfbbf24,
  };
}
