import {
  TILE, SUB_GRID, CELL_SIZE, ENEMY_TYPE, BASE_WALL_SUBS, GAME_MODE,
  COOP_PLAYER_SPAWNS, COOP_ENEMY_SPAWNS, VERSUS_SPAWNS,
} from './constants.js';

// 8 Handcrafted 3D Combat Arenas (13x13 macro tiles -> 26x26 sub-cells)
// Codes:
// '.' = open street / asphalt lane
// 'B' = full brick wall (2x2 sub-blocks)
// 'b' = south half brick, 't' = north half brick, 'l' = west half brick, 'r' = east half brick
// 'S' = full steel wall (2x2 sub-blocks)
// 's' = south half steel, 'u' = north half steel
// 'W' = water canal
// 'T' = 3D forest cover
// 'I' = ice traction zone
export const ARENA_TEMPLATES = [
  {
    id: 1,
    name: 'URBAN BRICKYARD',
    subtitle: 'Classic brick alleys & central steel bunker',
    skyTop: 0x0b132b,
    skyHorizon: 0x1c2541,
    fogColor: 0x162038,
    groundTint: 0x1f242d,
    enemies: [
      ...Array(12).fill(ENEMY_TYPE.SCOUT),
      ...Array(4).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(2).fill(ENEMY_TYPE.STRIKER),
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
  {
    id: 2,
    name: 'STEEL BASTION',
    subtitle: 'Armored pillboxes & central forest ambush',
    skyTop: 0x0f172a,
    skyHorizon: 0x1e3a5f,
    fogColor: 0x172b46,
    groundTint: 0x1e262c,
    enemies: [
      ...Array(8).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(3).fill(ENEMY_TYPE.STRIKER),
      ...Array(2).fill(ENEMY_TYPE.GOLIATH),
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
  {
    id: 3,
    name: 'CANAL CROSSING',
    subtitle: 'Twin bridgeheads over deep water trenches',
    skyTop: 0x091e2c,
    skyHorizon: 0x164e63,
    fogColor: 0x123849,
    groundTint: 0x1d262b,
    enemies: [
      ...Array(6).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(5).fill(ENEMY_TYPE.STRIKER),
      ...Array(2).fill(ENEMY_TYPE.GOLIATH),
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
  {
    id: 4,
    name: 'GLACIER CITADEL',
    subtitle: 'Low-friction ice lanes & heavy steel core',
    skyTop: 0x0c192c,
    skyHorizon: 0x284b63,
    fogColor: 0x1d3649,
    groundTint: 0x222c35,
    enemies: [
      ...Array(5).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(5).fill(ENEMY_TYPE.STRIKER),
      ...Array(3).fill(ENEMY_TYPE.GOLIATH),
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
  {
    id: 5,
    name: 'TIMBER AMBUSH',
    subtitle: 'Dense woodland canopy & flanking rivers',
    skyTop: 0x0a1f1c,
    skyHorizon: 0x1b4332,
    fogColor: 0x143125,
    groundTint: 0x1c251e,
    enemies: [
      ...Array(4).fill(ENEMY_TYPE.SCOUT),
      ...Array(6).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(5).fill(ENEMY_TYPE.STRIKER),
      ...Array(4).fill(ENEMY_TYPE.GOLIATH),
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
  {
    id: 6,
    name: 'TWIN FORTRESSES',
    subtitle: 'Dual steel castles & contested center bridge',
    skyTop: 0x1a1423,
    skyHorizon: 0x3d2645,
    fogColor: 0x2b1c33,
    groundTint: 0x241f29,
    enemies: [
      ...Array(4).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(5).fill(ENEMY_TYPE.STRIKER),
      ...Array(6).fill(ENEMY_TYPE.GOLIATH),
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
  {
    id: 7,
    name: 'PERMAFROST CORE',
    subtitle: 'Frozen moat surrounding central timber bunker',
    skyTop: 0x0b1628,
    skyHorizon: 0x1e3f66,
    fogColor: 0x152c4a,
    groundTint: 0x1f2833,
    enemies: [
      ...Array(3).fill(ENEMY_TYPE.SCOUT),
      ...Array(6).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(5).fill(ENEMY_TYPE.STRIKER),
      ...Array(6).fill(ENEMY_TYPE.GOLIATH),
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
  {
    id: 8,
    name: 'OMEGA STRONGHOLD',
    subtitle: 'Heavy Goliath assault through fortified citadel',
    skyTop: 0x1f1118,
    skyHorizon: 0x4a1c24,
    fogColor: 0x33141b,
    groundTint: 0x261d20,
    enemies: [
      ...Array(2).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(6).fill(ENEMY_TYPE.STRIKER),
      ...Array(7).fill(ENEMY_TYPE.GOLIATH),
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

function setMacroTile(grid, tx, ty, tileType) {
  const c = tx * 2;
  const r = ty * 2;
  if (r < 0 || r + 1 >= SUB_GRID || c < 0 || c + 1 >= SUB_GRID) return;
  grid[r][c] = tileType;
  grid[r][c + 1] = tileType;
  grid[r + 1][c] = tileType;
  grid[r + 1][c + 1] = tileType;
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

export function buildArena(stageNumber, mode = GAME_MODE.COOP) {
  const idx = (stageNumber - 1) % ARENA_TEMPLATES.length;
  const loopCount = Math.floor((stageNumber - 1) / ARENA_TEMPLATES.length);
  const template = ARENA_TEMPLATES[idx];

  const grid = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(TILE.EMPTY));

  for (let ty = 0; ty < 13; ty++) {
    const row = template.layout[ty];
    for (let tx = 0; tx < 13; tx++) {
      const ch = row[tx] || '.';
      const c = tx * 2;
      const r = ty * 2;
      switch (ch) {
        case 'B':
          setMacroTile(grid, tx, ty, TILE.BRICK);
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
          setMacroTile(grid, tx, ty, TILE.STEEL);
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
          setMacroTile(grid, tx, ty, TILE.WATER);
          break;
        case 'T':
          setMacroTile(grid, tx, ty, TILE.TREES);
          break;
        case 'I':
          setMacroTile(grid, tx, ty, TILE.ICE);
          break;
        default:
          break;
      }
    }
  }

  if (mode === GAME_MODE.COOP) {
    // Clear enemy & player spawns
    for (const sp of COOP_ENEMY_SPAWNS) setMacroTile(grid, sp.tx, sp.ty, TILE.EMPTY);
    for (const sp of COOP_PLAYER_SPAWNS) setMacroTile(grid, sp.tx, sp.ty, TILE.EMPTY);

    // Eagle Core Monument at (6, 12)
    setMacroTile(grid, 6, 12, TILE.EAGLE);

    // Solid Steel protection on Stages 1-8, Brick on loop 2+ (honoring classic progression!)
    const wallType = stageNumber <= 8 ? TILE.STEEL : TILE.BRICK;
    for (const sub of BASE_WALL_SUBS) {
      grid[sub.r][sub.c] = wallType;
    }
  } else {
    // Versus Deathmatch: clear all 8 symmetric arena spawn pads & center crate pad
    for (const sp of VERSUS_SPAWNS) {
      setMacroTile(grid, sp.tx, sp.ty, TILE.EMPTY);
    }
    setMacroTile(grid, 6, 6, TILE.EMPTY);
  }

  const enemies = template.enemies.map((type, i) => {
    if (loopCount > 0 && type === ENEMY_TYPE.SCOUT && i % 2 === 0) {
      return ENEMY_TYPE.GOLIATH;
    }
    return type;
  });

  return {
    template,
    grid,
    enemies,
  };
}
