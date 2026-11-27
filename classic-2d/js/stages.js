import { TILE, SUB_GRID, ENEMY_TYPE, BASE_WALL_SUBS } from './constants.js';

// Map encoding: 13 rows x 13 cols of 16x16 tiles, with optional half-tile codes:
// '.' = empty
// 'B' = full brick (2x2 sub-tiles)
// 'b' = bottom-half brick
// 't' = top-half brick
// 'l' = left-half brick
// 'r' = right-half brick
// 'S' = full steel
// 's' = bottom-half steel
// 'u' = top-half steel
// 'W' = water
// 'T' = trees (forest)
// 'I' = ice

const RAW_STAGES = [
  // STAGE 1: Authentic Battle City Stage 1 (matching reference screenshot!)
  {
    name: 'STAGE 1',
    enemies: [
      ...Array(18).fill(ENEMY_TYPE.BASIC),
      ...Array(2).fill(ENEMY_TYPE.FAST),
    ],
    layout: [
      '.............',
      '.B.B.B.B.B.B.',
      '.B.B.B.B.B.B.',
      '.B.B.BSB.B.B.',
      '.B.B.B.B.B.B.',
      '.B.B.b.b.B.B.',
      's.BB.....BB.s',
      '.....B.B.....',
      '.B.B.BBB.B.B.',
      '.B.B.B.B.B.B.',
      '.B.B.....B.B.',
      '.B.B.....B.B.',
      '.............',
    ],
  },

  // STAGE 2: Steel Outposts & Forest Cover
  {
    name: 'STAGE 2',
    enemies: [
      ...Array(14).fill(ENEMY_TYPE.BASIC),
      ...Array(4).fill(ENEMY_TYPE.FAST),
      ...Array(2).fill(ENEMY_TYPE.ARMOR),
    ],
    layout: [
      '.............',
      '...S.....S...',
      '.B.S.BTB.S.B.',
      '.B...TTT...B.',
      '.B.B.BTB.B.B.',
      '..BB..S..BB..',
      'T..S.....S..T',
      'TT.B.BBB.B.TT',
      '.B.B.B.B.B.B.',
      '.B...B.B...B.',
      '.B.B.....B.B.',
      '...B.....B...',
      '.............',
    ],
  },

  // STAGE 3: River Crossing (Water Channels)
  {
    name: 'STAGE 3',
    enemies: [
      ...Array(10).fill(ENEMY_TYPE.BASIC),
      ...Array(4).fill(ENEMY_TYPE.FAST),
      ...Array(4).fill(ENEMY_TYPE.POWER),
      ...Array(2).fill(ENEMY_TYPE.ARMOR),
    ],
    layout: [
      '.............',
      '.BB..BBB..BB.',
      '.B...B.B...B.',
      '....BB.BB....',
      'WW..S...S..WW',
      'WW.BB...BB.WW',
      '..T..WWW..T..',
      '.BT..WWW..TB.',
      '.B.B.B.B.B.B.',
      '.B.B..S..B.B.',
      '...B.....B...',
      '.B.B.....B.B.',
      '.............',
    ],
  },

  // STAGE 4: Ice Arena & Steel Core
  {
    name: 'STAGE 4',
    enemies: [
      ...Array(8).fill(ENEMY_TYPE.BASIC),
      ...Array(5).fill(ENEMY_TYPE.FAST),
      ...Array(4).fill(ENEMY_TYPE.POWER),
      ...Array(3).fill(ENEMY_TYPE.ARMOR),
    ],
    layout: [
      '.............',
      '.B.IIIIIII.B.',
      '.B.I.S.S.I.B.',
      '...I.BBB.I...',
      '.S.I.B.B.I.S.',
      '.B...BBB...B.',
      '.BB.S...S.BB.',
      '...B.III.B...',
      '.B.B.III.B.B.',
      '.B...B.B...B.',
      '.B.B.....B.B.',
      '...B.....B...',
      '.............',
    ],
  },

  // STAGE 5: Forest Ambush
  {
    name: 'STAGE 5',
    enemies: [
      ...Array(6).fill(ENEMY_TYPE.BASIC),
      ...Array(6).fill(ENEMY_TYPE.FAST),
      ...Array(5).fill(ENEMY_TYPE.POWER),
      ...Array(3).fill(ENEMY_TYPE.ARMOR),
    ],
    layout: [
      '.............',
      '.TT.BBBBB.TT.',
      '.TT.B...B.TT.',
      '.BB.B.S.B.BB.',
      '....TTTTT....',
      '.WW.T.B.T.WW.',
      '.WW.TTTTT.WW.',
      '.BB..B.B..BB.',
      '.B.S.BBB.S.B.',
      '.B...B.B...B.',
      '.TTB.....BTT.',
      '.TTB.....BTT.',
      '.............',
    ],
  },

  // STAGE 6: Twin Steel Castles
  {
    name: 'STAGE 6',
    enemies: [
      ...Array(5).fill(ENEMY_TYPE.BASIC),
      ...Array(5).fill(ENEMY_TYPE.FAST),
      ...Array(5).fill(ENEMY_TYPE.POWER),
      ...Array(5).fill(ENEMY_TYPE.ARMOR),
    ],
    layout: [
      '.............',
      '.SSS..B..SSS.',
      '.S.S.BBB.S.S.',
      '.S.B..B..B.S.',
      '..BB.SSS.BB..',
      '.....B.B.....',
      'BB.WW.B.WW.BB',
      '...WW.B.WW...',
      '.B.B.BBB.B.B.',
      '.B.S.....S.B.',
      '.B.B.....B.B.',
      '...B.....B...',
      '.............',
    ],
  },

  // STAGE 7: Frozen Fortress
  {
    name: 'STAGE 7',
    enemies: [
      ...Array(4).fill(ENEMY_TYPE.BASIC),
      ...Array(6).fill(ENEMY_TYPE.FAST),
      ...Array(4).fill(ENEMY_TYPE.POWER),
      ...Array(6).fill(ENEMY_TYPE.ARMOR),
    ],
    layout: [
      '.............',
      '.II.S.B.S.II.',
      '.II.BBBBB.II.',
      '.B..I...I..B.',
      '.B.WI.S.IW.B.',
      '...WIIIIIW...',
      '.S..TTTTT..S.',
      '.B.B.TTT.B.B.',
      '.B.B.BBB.B.B.',
      '...B..S..B...',
      '.B.B.....B.B.',
      '.B.......B...',
      '.............',
    ],
  },

  // STAGE 8: Grand Citadel
  {
    name: 'STAGE 8',
    enemies: [
      ...Array(2).fill(ENEMY_TYPE.BASIC),
      ...Array(5).fill(ENEMY_TYPE.FAST),
      ...Array(6).fill(ENEMY_TYPE.POWER),
      ...Array(7).fill(ENEMY_TYPE.ARMOR),
    ],
    layout: [
      '.............',
      '.B.SS.B.SS.B.',
      '.B.B..B..B.B.',
      '..BB.SSS.BB..',
      '.WW.TTTTT.WW.',
      '.WW.T.S.T.WW.',
      '.BB.IIIII.BB.',
      '...S.BBB.S...',
      '.B.B.B.B.B.B.',
      '.B...BBB...B.',
      '.S.B.....B.S.',
      '...B.....B...',
      '.............',
    ],
  },
];

export const TOTAL_STAGES = RAW_STAGES.length;

function setFullTile(grid, tx, ty, tileType) {
  const c = tx * 2;
  const r = ty * 2;
  grid[r][c] = tileType;
  grid[r][c + 1] = tileType;
  grid[r + 1][c] = tileType;
  grid[r + 1][c + 1] = tileType;
}

export function buildStage(stageNumber) {
  const idx = (stageNumber - 1) % RAW_STAGES.length;
  const loopCount = Math.floor((stageNumber - 1) / RAW_STAGES.length);
  const template = RAW_STAGES[idx];

  // Create 26x26 sub-tile grid
  const grid = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(TILE.EMPTY));

  for (let ty = 0; ty < 13; ty++) {
    const row = template.layout[ty];
    for (let tx = 0; tx < 13; tx++) {
      const ch = row[tx] || '.';
      const c = tx * 2;
      const r = ty * 2;
      switch (ch) {
        case 'B':
          setFullTile(grid, tx, ty, TILE.BRICK);
          break;
        case 'b':
          grid[r + 1][c] = TILE.BRICK;
          grid[r + 1][c + 1] = TILE.BRICK;
          break;
        case 't':
          grid[r][c] = TILE.BRICK;
          grid[r][c + 1] = TILE.BRICK;
          break;
        case 'l':
          grid[r][c] = TILE.BRICK;
          grid[r + 1][c] = TILE.BRICK;
          break;
        case 'r':
          grid[r][c + 1] = TILE.BRICK;
          grid[r + 1][c + 1] = TILE.BRICK;
          break;
        case 'S':
          setFullTile(grid, tx, ty, TILE.STEEL);
          break;
        case 's':
          grid[r + 1][c] = TILE.STEEL;
          grid[r + 1][c + 1] = TILE.STEEL;
          break;
        case 'u':
          grid[r][c] = TILE.STEEL;
          grid[r][c + 1] = TILE.STEEL;
          break;
        case 'W':
          setFullTile(grid, tx, ty, TILE.WATER);
          break;
        case 'T':
          setFullTile(grid, tx, ty, TILE.TREES);
          break;
        case 'I':
          setFullTile(grid, tx, ty, TILE.ICE);
          break;
        default:
          break;
      }
    }
  }

  // Clear guaranteed spawn zones:
  // Enemy spawns: (0,0), (6,0), (12,0)
  setFullTile(grid, 0, 0, TILE.EMPTY);
  setFullTile(grid, 6, 0, TILE.EMPTY);
  setFullTile(grid, 12, 0, TILE.EMPTY);
  // Player spawns: (4,12), (8,12), and P3 at (6,10)
  setFullTile(grid, 4, 12, TILE.EMPTY);
  setFullTile(grid, 8, 12, TILE.EMPTY);
  setFullTile(grid, 6, 10, TILE.EMPTY);

  // Place Eagle base at (6,12) -> sub-tiles (12..13, 24..25)
  setFullTile(grid, 6, 12, TILE.EAGLE);

  // Surround Eagle with solid steel fortress on Stages 1-10, classic brick on Stages 11+
  const baseWallTile = stageNumber <= 10 ? TILE.STEEL : TILE.BRICK;
  for (const pos of BASE_WALL_SUBS) {
    grid[pos.r][pos.c] = baseWallTile;
  }

  // Build enemy queue (upgrade some basic tanks on loop 2+)
  const enemies = template.enemies.map((type, i) => {
    if (loopCount > 0 && type === ENEMY_TYPE.BASIC && i % 2 === 0) {
      return ENEMY_TYPE.ARMOR;
    }
    return type;
  });

  return { grid, enemies };
}
