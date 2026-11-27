import {
  TILE, SUB_GRID, BASE_WALL_SUBS, GAME_MODE,
  COOP_PLAYER_SPAWNS, COOP_ENEMY_SPAWNS, VERSUS_SPAWNS,
} from './constants.js';
import { ENEMY_TYPE } from './vehicles.js';

// ============================================================================
// 12 Curated 3D Combat Arenas (13x13 macro tiles -> 26x26 sub-cells)
// Tile Codes:
// '.' = open street / asphalt lane
// 'B' = full brick wall (5 HP, progressive 3D deterioration)
// 'b' = south half brick, 't' = north half brick, 'l' = west half, 'r' = east half
// 'C' = full reinforced concrete barrier (3 HP, rebar-exposed rubble)
// 'c' = south half concrete
// 'S' = full steel wall (4 HP, vulnerable only to Tier IV Steel-Breaker shells)
// 's' = south half steel, 'u' = north half steel
// 'P' = permanent gold-trimmed bastion steel (100% indestructible)
// 'W' = water canal
// 'T' = 3D forest cover
// 'I' = ice traction zone
// ============================================================================

export const ARENA_TEMPLATES = Object.freeze([
  {
    id: 1,
    name: 'URBAN BRICKYARD',
    subtitle: 'Classic brick alleys & central steel bunker',
    skyTop: 0x1e333c,
    skyHorizon: 0x2d4b55,
    fogColor: 0x223942,
    groundTint: 0x232931,
    sunColor: 0xfff2dc,
    sunIntensity: 1.95,
    ambientColor: 0xa1bcc2,
    enemies: [
      ...Array(10).fill(ENEMY_TYPE.SCOUT),
      ...Array(4).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(2).fill(ENEMY_TYPE.STRIKER),
      ...Array(2).fill(ENEMY_TYPE.GOLIATH),
    ],
    layout: [
      '.............',
      '.B.B.B.B.B.B.',
      '.B.B.B.B.B.B.',
      '.B.B.BSB.B.B.',
      '.B.B.B.B.B.B.',
      '.B.C.b.b.C.B.',
      's.BB.....BB.s',
      '.....B.B.....',
      '.B.B.BBB.B.B.',
      '.B.C.B.B.C.B.',
      '.B.B.....B.B.',
      '.B.B.....B.B.',
      '.............',
    ],
  },
  {
    id: 2,
    name: 'STEEL BASTION',
    subtitle: 'Armored pillboxes & central forest ambush',
    skyTop: 0x1a2e3b,
    skyHorizon: 0x2d4d61,
    fogColor: 0x1e3645,
    groundTint: 0x21292f,
    sunColor: 0xfff4e0,
    sunIntensity: 1.9,
    ambientColor: 0x9eb9c4,
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
      '.B.C.BTB.C.B.',
      '..BB..P..BB..',
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
    skyTop: 0x142c3a,
    skyHorizon: 0x22546a,
    fogColor: 0x183c4c,
    groundTint: 0x1f2a30,
    sunColor: 0xfff5e4,
    sunIntensity: 1.95,
    ambientColor: 0x99c2cf,
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
      '....CC.CC....',
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
    skyTop: 0x1a2d42,
    skyHorizon: 0x385e7a,
    fogColor: 0x254259,
    groundTint: 0x26313b,
    sunColor: 0xf4f8ff,
    sunIntensity: 2.0,
    ambientColor: 0xb6d3e6,
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
      '...I.BCB.I...',
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
    skyTop: 0x162e29,
    skyHorizon: 0x285443,
    fogColor: 0x1c3d32,
    groundTint: 0x202b22,
    sunColor: 0xfff0d4,
    sunIntensity: 1.9,
    ambientColor: 0x9ec4b0,
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
      '.BB.C.S.C.BB.',
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
    name: 'CONCRETE DEPOT',
    subtitle: 'Reinforced concrete barricades & supply lanes',
    skyTop: 0x242c34,
    skyHorizon: 0x424d59,
    fogColor: 0x2e3842,
    groundTint: 0x25282c,
    sunColor: 0xffeccf,
    sunIntensity: 1.95,
    ambientColor: 0xb0bac4,
    enemies: [
      ...Array(5).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(6).fill(ENEMY_TYPE.STRIKER),
      ...Array(3).fill(ENEMY_TYPE.GOLIATH),
    ],
    layout: [
      '.............',
      '.CC..B.B..CC.',
      '.C...CCC...C.',
      '.C.S..B..S.C.',
      '..BB.C.C.BB..',
      '.CC..B.B..CC.',
      '...S.P.P.S...',
      '.CC..B.B..CC.',
      '.B.C.BBB.C.B.',
      '.B...C.C...B.',
      '.C.B.....B.C.',
      '...B.....B...',
      '.............',
    ],
  },
  {
    id: 7,
    name: 'TWIN FORTRESSES',
    subtitle: 'Dual steel castles & contested center bridge',
    skyTop: 0x241d30,
    skyHorizon: 0x4b3357,
    fogColor: 0x352540,
    groundTint: 0x28232e,
    sunColor: 0xffe6cc,
    sunIntensity: 1.85,
    ambientColor: 0xb8a6c7,
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
      '..CC.SPS.CC..',
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
    id: 8,
    name: 'PERMAFROST CORE',
    subtitle: 'Frozen moat surrounding central timber bunker',
    skyTop: 0x16253b,
    skyHorizon: 0x2b507a,
    fogColor: 0x1e3859,
    groundTint: 0x222c38,
    sunColor: 0xf2f7ff,
    sunIntensity: 1.95,
    ambientColor: 0xaec9e0,
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
      '.B.C.BBB.C.B.',
      '...B..S..B...',
      '.B.B.....B.B.',
      '.B.......B...',
      '.............',
    ],
  },
  {
    id: 9,
    name: 'CANYON BRIDGEHEAD',
    subtitle: 'Narrow fortified causeways & crossfire alleys',
    skyTop: 0x2e211b,
    skyHorizon: 0x5c3c2e,
    fogColor: 0x422b21,
    groundTint: 0x2c2420,
    sunColor: 0xffdfc2,
    sunIntensity: 2.0,
    ambientColor: 0xc9b09e,
    enemies: [
      ...Array(3).fill(ENEMY_TYPE.SCOUT),
      ...Array(6).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(6).fill(ENEMY_TYPE.STRIKER),
      ...Array(5).fill(ENEMY_TYPE.GOLIATH),
    ],
    layout: [
      '.............',
      '.B.C.BBB.C.B.',
      '.B.C..S..C.B.',
      'WW...CCC...WW',
      'WWW.B...B.WWW',
      'WW..B.P.B..WW',
      '..T..B.B..T..',
      '.BT.CC.CC.TB.',
      '.B.S.B.B.S.B.',
      '.B...BBB...B.',
      '.C.B.....B.C.',
      '...B.....B...',
      '.............',
    ],
  },
  {
    id: 10,
    name: 'IRON FOUNDRY',
    subtitle: 'Heavy steel bulkheads & close-quarters killboxes',
    skyTop: 0x291a1c,
    skyHorizon: 0x572c2a,
    fogColor: 0x3d1f20,
    groundTint: 0x292122,
    sunColor: 0xffd9b8,
    sunIntensity: 1.9,
    ambientColor: 0xc29e9a,
    enemies: [
      ...Array(2).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(7).fill(ENEMY_TYPE.STRIKER),
      ...Array(6).fill(ENEMY_TYPE.GOLIATH),
    ],
    layout: [
      '.............',
      '.S.B.CCC.B.S.',
      '.S.B..S..B.S.',
      '..CC.B.B.CC..',
      '.B.S.P.P.S.B.',
      '.B...CCC...B.',
      '.CC.S...S.CC.',
      '...B.BBB.B...',
      '.S.B.C.C.B.S.',
      '.B...B.B...B.',
      '.B.C.....C.B.',
      '...B.....B...',
      '.............',
    ],
  },
  {
    id: 11,
    name: 'CITADEL CORE',
    subtitle: 'Concentric brick, concrete & steel defense rings',
    skyTop: 0x162433,
    skyHorizon: 0x2a455e,
    fogColor: 0x1e3245,
    groundTint: 0x212933,
    sunColor: 0xfff3de,
    sunIntensity: 1.95,
    ambientColor: 0xa2b9cc,
    enemies: [
      ...Array(2).fill(ENEMY_TYPE.SCOUT),
      ...Array(5).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(6).fill(ENEMY_TYPE.STRIKER),
      ...Array(7).fill(ENEMY_TYPE.GOLIATH),
    ],
    layout: [
      '.............',
      '.BB.CCCCC.BB.',
      '.B..C...C..B.',
      '.B.CS.B.SC.B.',
      '..TC.B.B.CT..',
      '..T..B.B..T..',
      '.S.B.P.P.B.S.',
      '..I..B.B..I..',
      '.BI.CCCCC.IB.',
      '.B...B.B...B.',
      '.B.S.....S.B.',
      '...B.....B...',
      '.............',
    ],
  },
  {
    id: 12,
    name: 'OMEGA STRONGHOLD',
    subtitle: 'Heavy Goliath assault through fortified citadel',
    skyTop: 0x26151c,
    skyHorizon: 0x54222c,
    fogColor: 0x3b1820,
    groundTint: 0x292023,
    sunColor: 0xffd8bf,
    sunIntensity: 1.95,
    ambientColor: 0xc299a2,
    enemies: [
      ...Array(2).fill(ENEMY_TYPE.SCOUT),
      ...Array(4).fill(ENEMY_TYPE.INTERCEPTOR),
      ...Array(6).fill(ENEMY_TYPE.STRIKER),
      ...Array(8).fill(ENEMY_TYPE.GOLIATH),
    ],
    layout: [
      '.............',
      '.B.SS.C.SS.B.',
      '.B.B..B..B.B.',
      '..CC.SPS.CC..',
      '.WW.TTTTT.WW.',
      '.WW.T.S.T.WW.',
      '.BB.IIIII.BB.',
      '...S.BCB.S...',
      '.B.B.B.B.B.B.',
      '.B...BBB...B.',
      '.S.B.....B.S.',
      '...B.....B...',
      '.............',
    ],
  },
]);

function setMacroTile(grid, tx, ty, tileType) {
  const c = tx * 2;
  const r = ty * 2;
  if (r < 0 || r + 1 >= SUB_GRID || c < 0 || c + 1 >= SUB_GRID) return;
  grid[r][c] = tileType;
  grid[r][c + 1] = tileType;
  grid[r + 1][c] = tileType;
  grid[r + 1][c + 1] = tileType;
}

export function buildArenaData(stageNumber, mode = GAME_MODE.COOP) {
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
        case 'C':
          setMacroTile(grid, tx, ty, TILE.CONCRETE);
          break;
        case 'c':
          grid[r + 1][c] = TILE.CONCRETE;
          grid[r + 1][c + 1] = TILE.CONCRETE;
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
        case 'P':
          setMacroTile(grid, tx, ty, TILE.PERM_STEEL);
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
    for (const sp of COOP_ENEMY_SPAWNS) setMacroTile(grid, sp.tx, sp.ty, TILE.EMPTY);
    for (const sp of COOP_PLAYER_SPAWNS) setMacroTile(grid, sp.tx, sp.ty, TILE.EMPTY);
    setMacroTile(grid, 6, 12, TILE.EAGLE);

    const wallType = stageNumber <= 6 ? TILE.STEEL : TILE.BRICK;
    for (const sub of BASE_WALL_SUBS) {
      grid[sub.r][sub.c] = wallType;
    }
  } else {
    for (const sp of VERSUS_SPAWNS) setMacroTile(grid, sp.tx, sp.ty, TILE.EMPTY);
    setMacroTile(grid, 6, 6, TILE.EMPTY);
  }

  const enemies = template.enemies.map((type, i) => {
    if (loopCount > 0 && type === ENEMY_TYPE.SCOUT && i % 2 === 0) {
      return ENEMY_TYPE.GOLIATH;
    }
    return type;
  });

  return { template, grid, enemies };
}
