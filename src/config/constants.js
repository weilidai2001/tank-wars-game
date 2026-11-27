// ============================================================================
// World, Grid, Camera & Gameplay Constants
// ============================================================================

export const APP_VERSION = 'v1.3.1';

// 26x26 sub-grid (13x13 macro tiles), each sub-cell is 3.5m x 3.5m -> 91m x 91m 3D arena
export const SUB_GRID = 26;
export const MACRO_GRID = 13;
export const CELL_SIZE = 3.5;
export const WORLD_SIZE = SUB_GRID * CELL_SIZE; // 91.0m

export const WALL_HEIGHT_BRICK = 3.8;
export const WALL_HEIGHT_CONCRETE = 3.5;
export const WALL_HEIGHT_STEEL = 4.3;
export const PERIMETER_HEIGHT = 5.4;

export const WALL_MAX_HP = 5;
export const CONCRETE_MAX_HP = 3;
export const STEEL_MAX_HP = 4; // Steel can be breached by MK-IV / Heavy Steel-Breaker rounds!

// Sub-cell terrain & wall material types
export const TILE = Object.freeze({
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  TREES: 4,
  ICE: 5,
  EAGLE: 6,
  EAGLE_DEAD: 7,
  CONCRETE: 8,        // 3-HP reinforced concrete barriers with exposed rebar
  PERM_STEEL: 9,      // Permanent gold-trimmed bastion steel (100% indestructible)
});

// Game Modes
export const GAME_MODE = Object.freeze({
  COOP: 'COOP',         // Defend Golden Eagle Base vs AI Waves (1-4P or 1P + AI Wingman)
  VERSUS: 'VERSUS',     // Split-screen PvP Deathmatch + optional AI rivals (1-4P)
});

// Camera Presets (Behind-the-Tank chase, Hood sight, High chase, and Full-Map Tactical Overview)
export const CAMERA_PRESETS = Object.freeze([
  {
    id: 'chase',
    name: 'Behind Tank',
    type: 'follow',
    distBack: 6.8,
    height: 4.2,
    lookAhead: 75.0,
    lookHeight: 4.35,
    fov: 60,
  },
  {
    id: 'hood',
    name: 'Turret Sight',
    type: 'follow',
    distBack: 1.5,
    height: 2.6,
    lookAhead: 85.0,
    lookHeight: 3.85,
    fov: 64,
  },
  {
    id: 'high',
    name: 'High Chase',
    type: 'follow',
    distBack: 10.6,
    height: 6.6,
    lookAhead: 70.0,
    lookHeight: 3.4,
    fov: 58,
  },
  {
    id: 'fullmap',
    name: 'Full Map View',
    type: 'overview',
    elevationDeg: 54,
    yawDeg: 0,
    fov: 42,
  },
]);

// Tank Physics, Directional Armor & Auto-Aim Constants
export const TANK_RADIUS = 1.92; // 3.84m diameter inside 7.0m alleys -> 3.16m clearance
export const BASE_TANK_HP = 6;   // Front = 2 dmg (3 hits), Side = 3 dmg (2 hits), Back = 6 dmg (1-hit kill!)

export const TANK_MAX_SPEED = 14.5;
export const TANK_REVERSE_SPEED = 9.5;
export const TANK_ACCEL = 34.0;
export const TANK_DECEL = 28.0;
export const TANK_TURN_SPEED = 2.3; // rad/s

// Forward-Constrained Auto-Aim Cone (+/- 28 deg front arc)
export const AUTO_AIM_HALF_ANGLE = (28 * Math.PI) / 180;
export const AUTO_AIM_MAX_RANGE = 68.0;
export const TURRET_SLEW_RATE = 6.8;

export const BONUS_ENEMY_INDICES = new Set([2, 5, 9, 13, 17]);

// Eagle Base Fortress sub-tile coordinates (around macro tile 6,12 -> sub-tiles 12..13, 24..25)
export const BASE_WALL_SUBS = Object.freeze([
  { c: 11, r: 23 }, { c: 12, r: 23 }, { c: 13, r: 23 }, { c: 14, r: 23 },
  { c: 11, r: 24 },                                     { c: 14, r: 24 },
  { c: 11, r: 25 },                                     { c: 14, r: 25 },
]);

// Player Colors, Default National Lines & Key Bindings (1P-4P)
export const PLAYER_CONFIGS = Object.freeze([
  {
    index: 0,
    tag: '1P',
    name: 'PLAYER 1',
    defaultNation: 'USA',
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
    defaultNation: 'USSR',
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
    defaultNation: 'GERMANY',
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
    defaultNation: 'USA',
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
]);

export const COOP_PLAYER_SPAWNS = Object.freeze([
  { tx: 4, ty: 12, yaw: 0 },
  { tx: 8, ty: 12, yaw: 0 },
  { tx: 4, ty: 10, yaw: 0 },
  { tx: 8, ty: 10, yaw: 0 },
]);

export const COOP_ENEMY_SPAWNS = Object.freeze([
  { tx: 0, ty: 0, yaw: Math.PI },
  { tx: 6, ty: 0, yaw: Math.PI },
  { tx: 12, ty: 0, yaw: Math.PI },
]);

export const VERSUS_SPAWNS = Object.freeze([
  { tx: 1, ty: 11, yaw: -Math.PI * 0.25 },
  { tx: 11, ty: 1, yaw: Math.PI * 0.75 },
  { tx: 11, ty: 11, yaw: Math.PI * 0.25 },
  { tx: 1, ty: 1, yaw: -Math.PI * 0.75 },
  { tx: 6, ty: 1, yaw: Math.PI },
  { tx: 6, ty: 11, yaw: 0 },
  { tx: 1, ty: 6, yaw: -Math.PI * 0.5 },
  { tx: 11, ty: 6, yaw: Math.PI * 0.5 },
]);

export const VERSUS_TARGET_FRAGS = 10;
