// World & Grid Dimensions
// 26x26 sub-grid (13x13 macro tiles), each sub-cell is 3.5m x 3.5m -> 91m x 91m 3D arena
export const SUB_GRID = 26;
export const MACRO_GRID = 13;
export const CELL_SIZE = 3.5;
export const WORLD_SIZE = SUB_GRID * CELL_SIZE; // 91.0m

export const WALL_HEIGHT_BRICK = 3.8;
export const WALL_HEIGHT_STEEL = 4.3;
export const PERIMETER_HEIGHT = 5.4;
export const WALL_MAX_HP = 5; // Walls sustain 5x hits with progressive 3D deterioration after each shot!

// Sub-cell terrain types
export const TILE = {
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  TREES: 4,
  ICE: 5,
  EAGLE: 6,
  EAGLE_DEAD: 7,
};

// Game Modes
export const GAME_MODE = {
  COOP: 'COOP',     // Defend Golden Eagle Base vs AI Waves (1-4P)
  VERSUS: 'VERSUS', // Split-screen PvP Deathmatch + optional AI rivals (1-4P)
};

// Camera Presets (Behind-the-tank views pitched toward the horizon to see far down-range)
export const CAMERA_PRESETS = [
  {
    name: 'Behind Tank',
    distBack: 6.6,
    height: 4.15,
    lookAhead: 75.0,
    lookHeight: 4.45,
    fov: 60,
  },
  {
    name: 'Turret Sight (1P Hood)',
    distBack: 1.45,
    height: 2.55,
    lookAhead: 85.0,
    lookHeight: 3.9,
    fov: 64,
  },
  {
    name: 'High Chase',
    distBack: 10.2,
    height: 6.4,
    lookAhead: 70.0,
    lookHeight: 3.6,
    fov: 58,
  },
];

// Tank Physics, Directional Armor & Auto-Aim Constants
export const TANK_RADIUS = 1.95; // 3.9m diameter inside 7.0m alleys -> 3.1m clearance!
export const BASE_TANK_HP = 6;  // Front = 2 dmg (3 hits), Side = 3 dmg (2 hits), Back = 6 dmg (1-hit kill!)

// Classify which armor zone an incoming shot/sightline hits on a victim tank.
// (inX, inZ) points FROM victim center TOWARD the incoming shot/attacker.
export function classifyArmorHit(inX, inZ, victimYaw) {
  const len = Math.hypot(inX, inZ) || 1;
  const nx = inX / len;
  const nz = inZ / len;
  const vfx = -Math.sin(victimYaw);
  const vfz = -Math.cos(victimYaw);
  const cosTheta = nx * vfx + nz * vfz;

  if (cosTheta >= 0.58) {
    return { zone: 'FRONT', damage: 2, hitsLabel: 'FRONT 3×', color: '#60a5fa', sparkHex: 0x93c5fd };
  }
  if (cosTheta <= -0.58) {
    return { zone: 'BACK', damage: BASE_TANK_HP, hitsLabel: 'BACK 1-HIT!', color: '#f43f5e', sparkHex: 0xf43f5e };
  }
  return { zone: 'SIDE', damage: 3, hitsLabel: 'SIDE 2×', color: '#fbbf24', sparkHex: 0xfbbf24 };
}

export const TANK_MAX_SPEED = 14.5;
export const TANK_REVERSE_SPEED = 9.5;
export const TANK_ACCEL = 34.0;
export const TANK_DECEL = 28.0;
export const TANK_TURN_SPEED = 2.25; // rad/s

// Forward-Constrained Auto-Aim Cone
// Turret faces forward and auto-locks onto nearest target within +/- 28 deg front arc
export const AUTO_AIM_HALF_ANGLE = (28 * Math.PI) / 180; // ~0.4887 rad (56 deg cone)
export const AUTO_AIM_MAX_RANGE = 68.0; // meters
export const TURRET_SLEW_RATE = 6.5; // rad/s smooth servo tracking

// Enemy AI Classes
export const ENEMY_TYPE = {
  SCOUT: 0,
  INTERCEPTOR: 1,
  STRIKER: 2,
  GOLIATH: 3,
};

export const ENEMY_STATS = {
  [ENEMY_TYPE.SCOUT]: {
    name: 'SCOUT',
    speed: 7.2,
    turnSpeed: 1.25,
    shellSpeed: 23,
    reload: 2.6,
    hp: BASE_TANK_HP,
    points: 100,
    color: 0xd9534f,
    accent: 0xff8a80,
    scale: 0.94,
  },
  [ENEMY_TYPE.INTERCEPTOR]: {
    name: 'INTERCEPTOR',
    speed: 10.8,
    turnSpeed: 1.65,
    shellSpeed: 26,
    reload: 2.3,
    hp: BASE_TANK_HP,
    points: 200,
    color: 0xe67e22,
    accent: 0xffcc80,
    scale: 0.9,
  },
  [ENEMY_TYPE.STRIKER]: {
    name: 'STRIKER',
    speed: 8.4,
    turnSpeed: 1.4,
    shellSpeed: 32,
    reload: 1.95,
    hp: BASE_TANK_HP,
    points: 300,
    color: 0x9b59b6,
    accent: 0xe1bee7,
    scale: 1.0,
  },
  [ENEMY_TYPE.GOLIATH]: {
    name: 'GOLIATH',
    speed: 6.6,
    turnSpeed: 1.15,
    shellSpeed: 25,
    reload: 2.4,
    hp: BASE_TANK_HP,
    points: 500,
    color: 0x455a64,
    accent: 0x80deea,
    scale: 1.12,
  },
};

// Power-Up Crate Varieties (10 types, inspired by classic + 3D tactical upgrades)
export const POWERUP = {
  SHIELD: 0,   // Energy bubble shield (12s invulnerability)
  FREEZE: 1,   // EMP blast freezes enemy tanks (9s)
  FORTIFY: 2,  // Reinforces Eagle fortress with Steel walls (or deploys cover ring in PvP)
  STAR: 3,     // Weapon tier upgrade (MK-I -> MK-II -> MK-III -> MK-IV Steel-Breaker)
  BOOM: 4,     // Orbital strike damages/destroys active AI enemies
  REPAIR: 5,   // +1 Extra Life & full hull HP repair
  MAX_GUN: 6,  // Instant MK-IV Heavy Plasma Cannon (breaks Steel!)
  ARMOR: 7,    // +2 Reactive Armor plates
  HOVER: 8,    // Amphibious Hover-Skirt (crosses Water + +1 Armor)
  RAPID: 9,    // Overdrive Rapid-Fire autoloader (12s)
};

export const POWERUP_INFO = [
  { id: POWERUP.SHIELD,  label: 'SHIELD',   short: 'SHD', color: '#38bdf8', hex: 0x38bdf8 },
  { id: POWERUP.FREEZE,  label: 'EMP HOLD', short: 'EMP', color: '#818cf8', hex: 0x818cf8 },
  { id: POWERUP.FORTIFY, label: 'FORTIFY',  short: 'FRT', color: '#cbd5e1', hex: 0xcbd5e1 },
  { id: POWERUP.STAR,    label: 'UPGRADE',  short: 'UPG', color: '#facc15', hex: 0xfacc15 },
  { id: POWERUP.BOOM,    label: 'AIRSTRIKE',short: 'BOM', color: '#f97316', hex: 0xf97316 },
  { id: POWERUP.REPAIR,  label: '1UP + FIX',short: '1UP', color: '#4ade80', hex: 0x4ade80 },
  { id: POWERUP.MAX_GUN, label: 'MAX GUN',  short: 'MAX', color: '#f43f5e', hex: 0xf43f5e },
  { id: POWERUP.ARMOR,   label: 'ARMOR +2', short: 'ARM', color: '#22d3ee', hex: 0x22d3ee },
  { id: POWERUP.HOVER,   label: 'PONTOON',  short: 'HVR', color: '#2dd4bf', hex: 0x2dd4bf },
  { id: POWERUP.RAPID,   label: 'OVERDRIVE',short: 'RPD', color: '#fbbf24', hex: 0xfbbf24 },
];

export const BONUS_ENEMY_INDICES = new Set([2, 5, 9, 13, 17]);

// Eagle Base Fortress sub-tile coordinates (around macro tile 6,12 -> sub-tiles 12..13, 24..25)
export const BASE_WALL_SUBS = [
  { c: 11, r: 23 }, { c: 12, r: 23 }, { c: 13, r: 23 }, { c: 14, r: 23 },
  { c: 11, r: 24 },                                     { c: 14, r: 24 },
  { c: 11, r: 25 },                                     { c: 14, r: 25 },
];

// Player Colors & Identity (1P-4P)
export const PLAYER_CONFIGS = [
  {
    index: 0,
    tag: '1P',
    name: 'PLAYER 1',
    colorHex: 0xf59e0b,
    turretHex: 0xfbbf24,
    cssColor: '#f59e0b',
    keys: {
      forward: ['ArrowUp'],
      backward: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      fire: ['Enter', 'Slash', 'ShiftRight'],
      action: ['ControlRight', 'Backslash', 'Period'],
    },
    controlsHint: 'Arrows Move · Enter/LMB Fire · RMB/R-Ctrl Grab',
  },
  {
    index: 1,
    tag: '2P',
    name: 'PLAYER 2',
    colorHex: 0x22c55e,
    turretHex: 0x4ade80,
    cssColor: '#22c55e',
    keys: {
      forward: ['KeyW'],
      backward: ['KeyS'],
      left: ['KeyA'],
      right: ['KeyD'],
      fire: ['Space', 'KeyF'],
      action: ['KeyE', 'KeyQ'],
    },
    controlsHint: 'WASD Move · Space/F Fire · E Grab/Drop',
  },
  {
    index: 2,
    tag: '3P',
    name: 'PLAYER 3',
    colorHex: 0x0ea5e9,
    turretHex: 0x38bdf8,
    cssColor: '#38bdf8',
    keys: {
      forward: ['KeyU'],
      backward: ['KeyJ'],
      left: ['KeyH'],
      right: ['KeyK'],
      fire: ['KeyI'],
      action: ['KeyO', 'KeyY'],
    },
    controlsHint: 'UHJK Move · I Fire · O Grab/Drop',
  },
  {
    index: 3,
    tag: '4P',
    name: 'PLAYER 4',
    colorHex: 0xec4899,
    turretHex: 0xf472b6,
    cssColor: '#f472b6',
    keys: {
      forward: ['Numpad8'],
      backward: ['Numpad5'],
      left: ['Numpad4'],
      right: ['Numpad6'],
      fire: ['Numpad0', 'NumpadAdd'],
      action: ['NumpadEnter', 'NumpadDecimal'],
    },
    controlsHint: 'Num 8456 Move · Num0 Fire · NumEnter Grab',
  },
];

// Co-op Spawn Coordinates (in Macro Tile indices 0..12, converted to world meters)
export const COOP_PLAYER_SPAWNS = [
  { tx: 4, ty: 12, yaw: 0 },
  { tx: 8, ty: 12, yaw: 0 },
  { tx: 4, ty: 10, yaw: 0 },
  { tx: 8, ty: 10, yaw: 0 },
];

export const COOP_ENEMY_SPAWNS = [
  { tx: 0, ty: 0, yaw: Math.PI },
  { tx: 6, ty: 0, yaw: Math.PI },
  { tx: 12, ty: 0, yaw: Math.PI },
];

// Versus Corner Spawns (4 symmetric corners + mid-flank spawns for bots)
export const VERSUS_SPAWNS = [
  { tx: 1, ty: 11, yaw: -Math.PI * 0.25 },  // SW facing NE
  { tx: 11, ty: 1, yaw: Math.PI * 0.75 },   // NE facing SW
  { tx: 11, ty: 11, yaw: Math.PI * 0.25 },  // SE facing NW
  { tx: 1, ty: 1, yaw: -Math.PI * 0.75 },   // NW facing SE
  { tx: 6, ty: 1, yaw: Math.PI },           // N-mid facing S
  { tx: 6, ty: 11, yaw: 0 },                // S-mid facing N
  { tx: 1, ty: 6, yaw: -Math.PI * 0.5 },    // W-mid facing E
  { tx: 11, ty: 6, yaw: Math.PI * 0.5 },    // E-mid facing W
];

export const VERSUS_TARGET_FRAGS = 10;
