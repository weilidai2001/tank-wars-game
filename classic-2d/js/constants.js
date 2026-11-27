// Native NES-style resolution & grid constants
export const SCREEN_W = 256;
export const SCREEN_H = 224;

// Playfield: 13x13 full tiles (each 16x16 px) = 208x208 px
// Sub-tile grid: 26x26 sub-tiles (each 8x8 px) for brick/steel precision
export const FIELD_X = 16;
export const FIELD_Y = 8;
export const FIELD_SIZE = 208;
export const TILE_SIZE = 16;
export const SUB_SIZE = 8;
export const GRID_TILES = 13;
export const SUB_GRID = 26;

export const DIR = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
};

export const DIR_VEC = [
  { x: 0, y: -1 }, // UP
  { x: 1, y: 0 },  // RIGHT
  { x: 0, y: 1 },  // DOWN
  { x: -1, y: 0 }, // LEFT
];

// Sub-tile terrain types
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

// Enemy types
export const ENEMY_TYPE = {
  BASIC: 0,
  FAST: 1,
  POWER: 2,
  ARMOR: 3,
};

export const ENEMY_STATS = {
  [ENEMY_TYPE.BASIC]: { name: 'BASIC', speed: 0.55, bulletSpeed: 2.0, hp: 1, points: 100 },
  [ENEMY_TYPE.FAST]:  { name: 'FAST',  speed: 1.05, bulletSpeed: 2.2, hp: 1, points: 200 },
  [ENEMY_TYPE.POWER]: { name: 'POWER', speed: 0.65, bulletSpeed: 3.1, hp: 1, points: 300 },
  [ENEMY_TYPE.ARMOR]: { name: 'ARMOR', speed: 0.55, bulletSpeed: 2.2, hp: 4, points: 400 },
};

// Power-up types
export const POWERUP = {
  HELMET: 0,  // Temporary invulnerability shield
  CLOCK: 1,   // Freeze all enemies
  SHOVEL: 2,  // Steel fortress around Eagle base
  STAR: 3,    // Upgrade tank weapon tier (0 -> 1 -> 2 -> 3)
  GRENADE: 4, // Destroy all active enemies
  TANK: 5,    // +1 Extra life
  GUN: 6,     // Instant Max Weapon (Tier 3 steel-breaker)
  ARMOR: 7,   // +2 Tank Armor HP (absorbs hits)
  BOAT: 8,    // Drive across water + absorbs 1 hit
  RAPID: 9,   // Temporary rapid-fire overdrive (3 shots)
};

export const POWERUP_COUNT = 10;

export const POWERUP_NAMES = [
  'SHIELD', 'FREEZE', 'FORTIFY', 'STAR', 'BOOM', '1UP',
  'MAX GUN', 'ARMOR+2', 'BOAT', 'RAPID',
];

// Flashing bonus enemy indices (more frequent so players see all crate varieties!)
export const BONUS_ENEMY_INDICES = new Set([2, 6, 10, 14, 17]);

// Player spawn points (in playfield pixel coords)
export const P1_SPAWN = { x: 4 * TILE_SIZE, y: 12 * TILE_SIZE };
export const P2_SPAWN = { x: 8 * TILE_SIZE, y: 12 * TILE_SIZE };
export const P3_SPAWN = { x: 6 * TILE_SIZE, y: 10 * TILE_SIZE };
export const PLAYER_SPAWNS = [P1_SPAWN, P2_SPAWN, P3_SPAWN];

// Enemy spawn points (top-left, top-center, top-right)
export const ENEMY_SPAWNS = [
  { x: 0 * TILE_SIZE, y: 0 },
  { x: 6 * TILE_SIZE, y: 0 },
  { x: 12 * TILE_SIZE, y: 0 },
];

// Base fortress sub-tile coordinates around Eagle (sub-tiles 12..13, 24..25)
export const BASE_WALL_SUBS = [
  { c: 11, r: 23 }, { c: 12, r: 23 }, { c: 13, r: 23 }, { c: 14, r: 23 },
  { c: 11, r: 24 },                                     { c: 14, r: 24 },
  { c: 11, r: 25 },                                     { c: 14, r: 25 },
];

// Controls
export const P1_KEYS = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  fire: ['Space', 'KeyF', 'KeyG'],
  grab: ['KeyE', 'KeyQ'],
};

export const P2_KEYS = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  fire: ['Enter', 'Slash', 'ShiftRight', 'Numpad0', 'Period'],
  grab: ['ControlRight', 'Backslash', 'BracketRight', 'Quote', 'Numpad1'],
};

export const P3_KEYS = {
  up: ['KeyU'],
  down: ['KeyJ'],
  left: ['KeyH'],
  right: ['KeyK'],
  fire: ['KeyI'],
  grab: ['KeyO', 'KeyY'],
};

export const PLAYER_KEY_MAPS = [P1_KEYS, P2_KEYS, P3_KEYS];

export const COLORS = {
  BORDER_GREY: '#636363',
  BLACK: '#000000',
  WHITE: '#ffffff',
  RED: '#d82800',
  ORANGE: '#f47c20',
  YELLOW: '#f7d65a',
  GOLD: '#e79c21',
};
