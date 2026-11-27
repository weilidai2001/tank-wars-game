import { DIR, ENEMY_TYPE, POWERUP, TILE } from './constants.js';

// High-Resolution 3x Arcade Pixel-Art Renderer (768x672 physical canvas, 256x224 logical coords)
export const SCALE = 3;

function px(v) {
  return Math.round(v * SCALE);
}

// 24x24 physical px brick sub-tile (8x8 logical)
export function drawBrickSubTile(ctx, x, y) {
  const X = px(x);
  const Y = px(y);

  // Dark mortar base
  ctx.fillStyle = '#4a1804';
  ctx.fillRect(X, Y, 24, 24);

  // Classic grey/tan mortar lines (2px wide at 3x)
  ctx.fillStyle = '#8e8e8e';
  ctx.fillRect(X, Y + 10, 24, 2);
  ctx.fillRect(X, Y + 22, 24, 2);
  ctx.fillRect(X + 10, Y, 2, 10);
  ctx.fillRect(X + 22, Y + 12, 2, 10);

  // Helper for a beveled brick face
  const brick = (bx, by, bw, bh) => {
    ctx.fillStyle = '#c8480c';
    ctx.fillRect(bx, by, bw, bh);
    // Top & left bright highlight (VS. Battle City punchy orange)
    ctx.fillStyle = '#f07828';
    ctx.fillRect(bx, by, bw, 2);
    ctx.fillRect(bx, by, 2, bh);
    // Subtle inner highlight
    ctx.fillStyle = '#dc5e18';
    ctx.fillRect(bx + 2, by + 2, bw - 4, 2);
    // Bottom & right bevel shadow
    ctx.fillStyle = '#8c2804';
    ctx.fillRect(bx, by + bh - 2, bw, 2);
    ctx.fillRect(bx + bw - 2, by, 2, bh);
  };

  // Top row: two staggered bricks
  brick(X, Y, 10, 10);
  brick(X + 12, Y, 12, 10);
  // Bottom row: wide offset brick
  brick(X, Y + 12, 22, 10);
}

// 24x24 physical px riveted metallic steel sub-tile
export function drawSteelSubTile(ctx, x, y) {
  const X = px(x);
  const Y = px(y);

  // Outer dark metallic seam
  ctx.fillStyle = '#404850';
  ctx.fillRect(X, Y, 24, 24);

  // Light top-left bevel
  ctx.fillStyle = '#dce4ec';
  ctx.fillRect(X + 1, Y + 1, 22, 22);

  // Mid-tone steel body
  ctx.fillStyle = '#a8b4c0';
  ctx.fillRect(X + 3, Y + 3, 20, 20);

  // Bottom-right bevel shadow
  ctx.fillStyle = '#5c6670';
  ctx.fillRect(X + 1, Y + 21, 22, 2);
  ctx.fillRect(X + 21, Y + 1, 2, 22);
  ctx.fillStyle = '#74808c';
  ctx.fillRect(X + 3, Y + 19, 18, 2);
  ctx.fillRect(X + 19, Y + 3, 2, 18);

  // Inner bright specular plate
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(X + 6, Y + 6, 12, 12);
  ctx.fillStyle = '#e8f0f8';
  ctx.fillRect(X + 8, Y + 8, 9, 9);

  // Tiny corner rivets
  ctx.fillStyle = '#505a64';
  ctx.fillRect(X + 3, Y + 3, 2, 2);
  ctx.fillRect(X + 19, Y + 3, 2, 2);
  ctx.fillRect(X + 3, Y + 19, 2, 2);
  ctx.fillRect(X + 19, Y + 19, 2, 2);
}

// 24x24 physical px animated water sub-tile
export function drawWaterSubTile(ctx, x, y, frame) {
  const X = px(x);
  const Y = px(y);

  // Deep arcade ocean blue
  ctx.fillStyle = '#1430d8';
  ctx.fillRect(X, Y, 24, 24);

  // Mid-blue depth bands
  ctx.fillStyle = '#1c44ec';
  ctx.fillRect(X, Y + 3, 24, 5);
  ctx.fillRect(X, Y + 14, 24, 5);

  // Smoothly cycling wave crests
  const phase = Math.floor(frame / 16) % 3;
  const off = phase * 3;
  ctx.fillStyle = '#74c4ff';
  ctx.fillRect(X + ((2 + off) % 18), Y + 4, 8, 2);
  ctx.fillRect(X + ((11 + off) % 16), Y + 12, 9, 2);
  ctx.fillRect(X + ((5 + off) % 17), Y + 19, 7, 2);

  // White sparkle glints
  ctx.fillStyle = '#d8f0ff';
  ctx.fillRect(X + ((4 + off) % 18), Y + 4, 3, 1);
  ctx.fillRect(X + ((14 + off) % 16), Y + 12, 3, 1);
}

// 24x24 physical px lush forest canopy sub-tile (drawn OVER tanks)
export function drawTreesSubTile(ctx, x, y) {
  const X = px(x);
  const Y = px(y);

  // Deep forest base clusters (leaving tiny dark edge gaps so silhouettes hint underneath)
  ctx.fillStyle = '#004800';
  ctx.fillRect(X + 2, Y + 1, 20, 22);
  ctx.fillRect(X + 1, Y + 3, 22, 18);

  // Mid foliage lobes
  ctx.fillStyle = '#008400';
  ctx.fillRect(X + 2, Y + 2, 10, 10);
  ctx.fillRect(X + 11, Y + 4, 11, 10);
  ctx.fillRect(X + 3, Y + 11, 11, 10);
  ctx.fillRect(X + 12, Y + 13, 10, 9);

  // Bright green leaves
  ctx.fillStyle = '#20b810';
  ctx.fillRect(X + 3, Y + 3, 7, 6);
  ctx.fillRect(X + 13, Y + 5, 7, 6);
  ctx.fillRect(X + 4, Y + 13, 7, 6);
  ctx.fillRect(X + 14, Y + 14, 6, 5);

  // Sunlit lime highlights
  ctx.fillStyle = '#88e820';
  ctx.fillRect(X + 4, Y + 3, 4, 3);
  ctx.fillRect(X + 15, Y + 6, 3, 3);
  ctx.fillRect(X + 6, Y + 14, 3, 2);
  ctx.fillRect(X + 15, Y + 15, 3, 2);
}

// 24x24 physical px glossy ice sub-tile
export function drawIceSubTile(ctx, x, y) {
  const X = px(x);
  const Y = px(y);

  ctx.fillStyle = '#b4cee4';
  ctx.fillRect(X, Y, 24, 24);

  // Subtle tile border
  ctx.fillStyle = '#86a4be';
  ctx.fillRect(X, Y + 22, 24, 2);
  ctx.fillRect(X + 22, Y, 2, 24);
  ctx.fillStyle = '#d4e8f8';
  ctx.fillRect(X, Y, 24, 2);
  ctx.fillRect(X, Y, 2, 24);

  // Diagonal crystal sheen streaks
  ctx.fillStyle = '#f2faff';
  ctx.fillRect(X + 4, Y + 4, 6, 2);
  ctx.fillRect(X + 6, Y + 6, 6, 2);
  ctx.fillRect(X + 13, Y + 13, 6, 2);
  ctx.fillRect(X + 11, Y + 15, 6, 2);
  ctx.fillStyle = '#92b0c8';
  ctx.fillRect(X + 4, Y + 16, 4, 2);
  ctx.fillRect(X + 15, Y + 5, 4, 2);
}

// 48x48 physical px Eagle HQ emblem (16x16 logical)
export function drawEagle(ctx, x, y, alive) {
  const X = px(x);
  const Y = px(y);
  ctx.fillStyle = '#000000';
  ctx.fillRect(X, Y, 48, 48);

  if (!alive) {
    // Ruined stone rubble + white surrender flag
    ctx.fillStyle = '#50545c';
    ctx.fillRect(X + 6, Y + 32, 36, 12);
    ctx.fillStyle = '#787e88';
    ctx.fillRect(X + 10, Y + 27, 28, 8);
    ctx.fillRect(X + 4, Y + 38, 40, 6);
    ctx.fillStyle = '#383c42';
    ctx.fillRect(X + 12, Y + 34, 8, 6);
    ctx.fillRect(X + 28, Y + 36, 10, 5);
    // Flagpole & tattered white flag
    ctx.fillStyle = '#c8d0d8';
    ctx.fillRect(X + 18, Y + 8, 3, 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X + 21, Y + 9, 18, 12);
    ctx.fillStyle = '#d0d8e0';
    ctx.fillRect(X + 21, Y + 18, 15, 3);
    ctx.fillStyle = '#000000';
    ctx.fillRect(X + 36, Y + 12, 3, 3);
    return;
  }

  // Crisp 16x16 eagle rendered at 3x with extra inner bevel highlights
  const pixels = [
    '......2222......',
    '.....211132.....',
    '....2113312.....',
    '22..2211122..22.',
    '232..21112..232.',
    '2132.21312.2312.',
    '211322111223112.',
    '211131131131112.',
    '.2112111112112..',
    '..22.21312.22...',
    '.....21112......',
    '....2113112.....',
    '...212222212....',
    '..232.....232...',
    '..22.......22...',
    '................',
  ];
  const pal = { '1': '#b8c4d0', '2': '#58626e', '3': '#ffffff' };
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const ch = pixels[r][c];
      if (!pal[ch]) continue;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(X + c * 3, Y + r * 3, 3, 3);
      if (ch === '1') {
        ctx.fillStyle = '#d8e4f0';
        ctx.fillRect(X + c * 3, Y + r * 3, 2, 1);
      }
    }
  }
}

// Helper: draw rotated 16x16 matrix at 3x scale (48x48 physical px) with subtle bevel shading
function drawRotatedMatrixHD(ctx, x, y, dir, matrix, palette) {
  const X = px(x);
  const Y = px(y);
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const ch = matrix[r][c];
      const color = palette[ch];
      if (!color) continue;
      let dx = c;
      let dy = r;
      if (dir === DIR.RIGHT) {
        dx = 15 - r;
        dy = c;
      } else if (dir === DIR.DOWN) {
        dx = 15 - c;
        dy = 15 - r;
      } else if (dir === DIR.LEFT) {
        dx = r;
        dy = 15 - c;
      }
      const rx = X + dx * 3;
      const ry = Y + dy * 3;
      ctx.fillStyle = color;
      ctx.fillRect(rx, ry, 3, 3);
      // Subtle specular glint on highlight pixels
      if (ch === '2' && palette.shine) {
        ctx.fillStyle = palette.shine;
        ctx.fillRect(rx, ry, 2, 1);
      }
    }
  }
}

function getPlayerTankMatrix(tier, treadFrame) {
  const tA = treadFrame ? '4' : '5';
  const tB = treadFrame ? '5' : '4';

  if (tier === 0) {
    return [
      '.......22.......',
      '.......12.......',
      '.......12.......',
      '.3' + tA + '3...12...3' + tA + '3.',
      '.3' + tB + '3..2112..3' + tB + '3.',
      '.3' + tA + '3.211112.3' + tA + '3.',
      '.3' + tB + '311222113' + tB + '3.',
      '.3' + tA + '311211113' + tA + '3.',
      '.3' + tB + '311213113' + tB + '3.',
      '.3' + tA + '311133113' + tA + '3.',
      '.3' + tB + '311111113' + tB + '3.',
      '.3' + tA + '313111313' + tA + '3.',
      '.3' + tB + '333333333' + tB + '3.',
      '.3' + tA + '3........3' + tA + '3.',
      '.333........333.',
      '................',
    ];
  }

  if (tier === 1) {
    return [
      '.......22.......',
      '.......12.......',
      '.......12.......',
      '.3' + tA + '3...12...3' + tA + '3.',
      '.3' + tB + '3..2112..3' + tB + '3.',
      '.3' + tA + '3.221122.3' + tA + '3.',
      '.3' + tB + '312222113' + tB + '3.',
      '.3' + tA + '312111113' + tA + '3.',
      '.3' + tB + '312133113' + tB + '3.',
      '.3' + tA + '311333113' + tA + '3.',
      '.3' + tB + '311111113' + tB + '3.',
      '.3' + tA + '313222313' + tA + '3.',
      '.3' + tB + '333333333' + tB + '3.',
      '.3' + tA + '3........3' + tA + '3.',
      '.333........333.',
      '................',
    ];
  }

  if (tier === 2) {
    return [
      '......2222......',
      '.......12.......',
      '.......12.......',
      '.3' + tA + '3..2112..3' + tA + '3.',
      '.3' + tB + '3.211112.3' + tB + '3.',
      '.3' + tA + '3112222113' + tA + '3.',
      '.3' + tB + '3122112113' + tB + '3.',
      '.3' + tA + '3121131113' + tA + '3.',
      '.3' + tB + '3121331113' + tB + '3.',
      '.3' + tA + '3111331113' + tA + '3.',
      '.3' + tB + '3112222113' + tB + '3.',
      '.3' + tA + '3131111313' + tA + '3.',
      '.3' + tB + '333333333' + tB + '3.',
      '.3' + tA + '3..3333..3' + tA + '3.',
      '.333........333.',
      '................',
    ];
  }

  // Tier 3 (Heavy steel-breaker tank)
  return [
    '......2222......',
    '......2112......',
    '.3' + tA + '3...12...3' + tA + '3.',
    '.3' + tB + '3..2112..3' + tB + '3.',
    '.3' + tA + '3122222213' + tA + '3.',
    '.3' + tB + '3121111213' + tB + '3.',
    '.3' + tA + '3121221113' + tA + '3.',
    '.3' + tB + '3121231113' + tB + '3.',
    '.3' + tA + '3111331113' + tA + '3.',
    '.3' + tB + '3112222113' + tB + '3.',
    '.3' + tA + '3121111213' + tA + '3.',
    '.3' + tB + '3131111313' + tB + '3.',
    '.3' + tA + '333333333' + tA + '3.',
    '.3' + tB + '333333333' + tB + '3.',
    '.333........333.',
    '................',
  ];
}

function getEnemyTankMatrix(type, treadFrame) {
  const tA = treadFrame ? '4' : '5';
  const tB = treadFrame ? '5' : '4';

  if (type === ENEMY_TYPE.FAST) {
    return [
      '.......22.......',
      '.......12.......',
      '......2112......',
      '.3' + tA + '3..2112..3' + tA + '3.',
      '.3' + tB + '3.212212.3' + tB + '3.',
      '.3' + tA + '3.121121.3' + tA + '3.',
      '.3' + tB + '311213113' + tB + '3.',
      '.3' + tA + '311133113' + tA + '3.',
      '.3' + tB + '3.111111.3' + tB + '3.',
      '.3' + tA + '3.131131.3' + tA + '3.',
      '.3' + tB + '3..3333..3' + tB + '3.',
      '.3' + tA + '3..1111..3' + tA + '3.',
      '.3' + tB + '333333333' + tB + '3.',
      '.3' + tA + '3........3' + tA + '3.',
      '.333........333.',
      '................',
    ];
  }

  if (type === ENEMY_TYPE.POWER) {
    return [
      '......2222......',
      '.......12.......',
      '.......12.......',
      '.......12.......',
      '.3' + tA + '3..2112..3' + tA + '3.',
      '.3' + tB + '3122112213' + tB + '3.',
      '.3' + tA + '3121111113' + tA + '3.',
      '.3' + tB + '3121221113' + tB + '3.',
      '.3' + tA + '3111231113' + tA + '3.',
      '.3' + tB + '3111331113' + tB + '3.',
      '.3' + tA + '3131111313' + tA + '3.',
      '.3' + tB + '333333333' + tB + '3.',
      '.3' + tA + '3..3333..3' + tA + '3.',
      '.3' + tB + '3........3' + tB + '3.',
      '.333........333.',
      '................',
    ];
  }

  if (type === ENEMY_TYPE.ARMOR) {
    return [
      '.......22.......',
      '......2112......',
      '.3' + tA + '3..2112..3' + tA + '3.',
      '.3' + tB + '3122222213' + tB + '3.',
      '.3' + tA + '3121111213' + tA + '3.',
      '.3' + tB + '3121221213' + tB + '3.',
      '.3' + tA + '3121231113' + tA + '3.',
      '.3' + tB + '3111331113' + tB + '3.',
      '.3' + tA + '3112222113' + tA + '3.',
      '.3' + tB + '3121111213' + tB + '3.',
      '.3' + tA + '3131111313' + tA + '3.',
      '.3' + tB + '3133333313' + tB + '3.',
      '.3' + tA + '333333333' + tA + '3.',
      '.3' + tB + '333333333' + tB + '3.',
      '.333........333.',
      '................',
    ];
  }

  return [
    '.......22.......',
    '.......12.......',
    '.......12.......',
    '.3' + tA + '3...12...3' + tA + '3.',
    '.3' + tB + '3..2112..3' + tB + '3.',
    '.3' + tA + '3.211112.3' + tA + '3.',
    '.3' + tB + '311222113' + tB + '3.',
    '.3' + tA + '311213113' + tA + '3.',
    '.3' + tB + '311133113' + tB + '3.',
    '.3' + tA + '311111113' + tA + '3.',
    '.3' + tB + '313111313' + tB + '3.',
    '.3' + tA + '333333333' + tA + '3.',
    '.3' + tB + '3........3' + tB + '3.',
    '.3' + tA + '3........3' + tA + '3.',
    '.333........333.',
    '................',
  ];
}

export function drawPlayerTank(ctx, x, y, dir, playerIndex, tier, treadFrame, shieldTimer, stunTimer, frame, extras = null) {
  if (stunTimer > 0 && Math.floor(frame / 4) % 2 === 0) return;

  const X = px(x);
  const Y = px(y);

  // Boat amphibious pontoon under/around tank
  if (extras && extras.hasBoat) {
    ctx.fillStyle = '#2070d8';
    ctx.fillRect(X - 2, Y - 2, 52, 52);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(X - 1, Y - 1, 50, 50);
  }

  const palette = playerIndex === 0
    ? { '1': '#e89c18', '2': '#fae070', '3': '#7c4400', '4': '#f8d050', '5': '#844c00', shine: '#fff8c8' }
    : playerIndex === 1
      ? { '1': '#08a828', '2': '#78f898', '3': '#004c14', '4': '#50e070', '5': '#005818', shine: '#d0ffd8' }
      : { '1': '#1898f8', '2': '#88e0ff', '3': '#084488', '4': '#58c8ff', '5': '#084c90', shine: '#e8faff' };

  const mat = getPlayerTankMatrix(tier, treadFrame);
  drawRotatedMatrixHD(ctx, x, y, dir, mat, palette);

  // Armor plating indicator pips (bright cyan/gold)
  if (extras && extras.armor > 0) {
    const pips = Math.min(4, extras.armor);
    for (let i = 0; i < pips; i++) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(X + 4 + i * 10, Y - 5, 8, 5);
      ctx.fillStyle = '#40e8ff';
      ctx.fillRect(X + 5 + i * 10, Y - 4, 6, 3);
    }
  }

  // Rapid-fire golden aura
  if (extras && extras.rapidTimer > 0 && Math.floor(frame / 4) % 2 === 0) {
    ctx.strokeStyle = '#ffe050';
    ctx.lineWidth = 2;
    ctx.strokeRect(X + 2, Y + 2, 44, 44);
  }

  // Carried wall block indicator (mini brick or steel cube tucked on tank)
  if (extras && extras.carriedBlock) {
    const bx = X + 30;
    const by = Y + 30;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx - 1, by - 1, 18, 18);
    if (extras.carriedBlock === TILE.STEEL) {
      ctx.fillStyle = '#dce4ec';
      ctx.fillRect(bx, by, 16, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + 4, by + 4, 8, 8);
      ctx.fillStyle = '#5c6670';
      ctx.fillRect(bx, by + 14, 16, 2);
      ctx.fillRect(bx + 14, by, 2, 16);
    } else {
      ctx.fillStyle = '#c8480c';
      ctx.fillRect(bx, by, 16, 16);
      ctx.fillStyle = '#8e8e8e';
      ctx.fillRect(bx, by + 7, 16, 2);
      ctx.fillRect(bx + 7, by, 2, 7);
      ctx.fillStyle = '#f07828';
      ctx.fillRect(bx, by, 7, 2);
      ctx.fillRect(bx + 9, by, 7, 2);
    }
  }

  // Pulsing forcefield shield
  if (shieldTimer > 0) {
    const phase = Math.floor(frame / 3) % 2;
    ctx.strokeStyle = phase === 0 ? '#ffffff' : '#64c0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(X + 1, Y + 1, 46, 46);
    ctx.strokeStyle = phase === 0 ? 'rgba(100,192,255,0.65)' : 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(X + 4, Y + 4, 40, 40);
    // Corner sparks
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(X, Y, 5, 5);
    ctx.fillRect(X + 43, Y, 5, 5);
    ctx.fillRect(X, Y + 43, 5, 5);
    ctx.fillRect(X + 43, Y + 43, 5, 5);
  }
}

export function drawEnemyTank(ctx, x, y, dir, type, hp, isBonus, treadFrame, frame) {
  let palette;

  if (isBonus && Math.floor(frame / 8) % 2 === 0) {
    palette = { '1': '#dc2010', '2': '#ff88b8', '3': '#6c0408', '4': '#ff5c80', '5': '#740810', shine: '#ffd8e8' };
  } else if (type === ENEMY_TYPE.ARMOR) {
    if (hp >= 4) {
      palette = Math.floor(frame / 6) % 2 === 0
        ? { '1': '#009040', '2': '#98f8b0', '3': '#004820', '4': '#80e090', '5': '#004820', shine: '#e0ffe8' }
        : { '1': '#d09418', '2': '#fae880', '3': '#684400', '4': '#e8c448', '5': '#684400', shine: '#fff8c8' };
    } else if (hp === 3) {
      palette = { '1': '#009040', '2': '#98f8b0', '3': '#004820', '4': '#80e090', '5': '#004820', shine: '#e0ffe8' };
    } else if (hp === 2) {
      palette = { '1': '#d09418', '2': '#fae880', '3': '#684400', '4': '#e8c448', '5': '#684400', shine: '#fff8c8' };
    } else {
      palette = { '1': '#a4b6c8', '2': '#ffffff', '3': '#425262', '4': '#d4e2f0', '5': '#485868', shine: '#ffffff' };
    }
  } else {
    palette = { '1': '#a4b6c8', '2': '#ffffff', '3': '#425262', '4': '#d4e2f0', '5': '#485868', shine: '#ffffff' };
  }

  const mat = getEnemyTankMatrix(type, treadFrame);
  drawRotatedMatrixHD(ctx, x, y, dir, mat, palette);
}

export function drawBullet(ctx, x, y, dir, armorPiercing = false) {
  const X = px(x);
  const Y = px(y);
  const outer = armorPiercing ? '#ff8800' : '#d8e4f0';
  const core = armorPiercing ? '#fff080' : '#ffffff';

  if (dir === DIR.UP || dir === DIR.DOWN) {
    ctx.fillStyle = outer;
    ctx.fillRect(X - 4, Y - 6, 8, 12);
    ctx.fillStyle = core;
    ctx.fillRect(X - 2, Y - 4, 4, 8);
  } else {
    ctx.fillStyle = outer;
    ctx.fillRect(X - 6, Y - 4, 12, 8);
    ctx.fillStyle = core;
    ctx.fillRect(X - 4, Y - 2, 8, 4);
  }
}

export function drawSpawnStar(ctx, x, y, timer) {
  const phase = Math.floor(timer / 4) % 4;
  const cx = px(x + 8);
  const cy = px(y + 8);
  const radii = [6, 15, 21, 12];
  const r = radii[phase];

  ctx.fillStyle = '#c8e0ff';
  ctx.fillRect(cx - r, cy - 3, r * 2, 6);
  ctx.fillRect(cx - 3, cy - r, 6, r * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - r + 2, cy - 2, Math.max(2, r * 2 - 4), 4);
  ctx.fillRect(cx - 2, cy - r + 2, 4, Math.max(2, r * 2 - 4));
  if (r >= 15) {
    ctx.fillRect(cx - 7, cy - 7, 14, 14);
  }
}

export function drawExplosion(ctx, x, y, progress, big) {
  const cx = px(x);
  const cy = px(y);
  const maxR = big ? 48 : 20;
  const r = Math.max(6, Math.round(Math.sin(progress * Math.PI) * maxR));

  // Outer fiery red/crimson burst
  ctx.fillStyle = '#d82000';
  ctx.fillRect(cx - r, cy - Math.floor(r * 0.62), r * 2, Math.floor(r * 1.24));
  ctx.fillRect(cx - Math.floor(r * 0.62), cy - r, Math.floor(r * 1.24), r * 2);

  // Mid orange/magenta arcade plasma (matching VS. Battle City Screenshot 2!)
  const r2 = Math.max(4, Math.floor(r * 0.74));
  ctx.fillStyle = big && progress > 0.45 ? '#ff9ad8' : '#f87818';
  ctx.fillRect(cx - r2, cy - Math.floor(r2 * 0.8), r2 * 2, Math.floor(r2 * 1.6));
  ctx.fillRect(cx - Math.floor(r2 * 0.8), cy - r2, Math.floor(r2 * 1.6), r2 * 2);

  // Yellow inner ring
  const r3 = Math.max(3, Math.floor(r * 0.48));
  ctx.fillStyle = '#ffe050';
  ctx.fillRect(cx - r3, cy - r3, r3 * 2, r3 * 2);

  // White-hot core
  const r4 = Math.max(2, Math.floor(r * 0.28));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - r4, cy - r4, r4 * 2, r4 * 2);

  // Flying pixel sparks
  if (big) {
    const d = Math.floor(r * 0.92);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - d, cy - d, 5, 5);
    ctx.fillRect(cx + d - 5, cy - d, 5, 5);
    ctx.fillRect(cx - d, cy + d - 5, 5, 5);
    ctx.fillRect(cx + d - 5, cy + d - 5, 5, 5);
    ctx.fillStyle = '#f8a8d8';
    ctx.fillRect(cx - Math.floor(d * 0.5), cy - d - 3, 4, 4);
    ctx.fillRect(cx + Math.floor(d * 0.5), cy + d, 4, 4);
  }
}

export function drawPowerup(ctx, x, y, type, frame) {
  if (Math.floor(frame / 10) % 2 === 0) return;
  const X = px(x);
  const Y = px(y);

  // Crisp 48x48 beveled arcade badge
  ctx.fillStyle = '#000000';
  ctx.fillRect(X, Y, 48, 48);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(X + 3, Y + 3, 42, 42);
  ctx.fillStyle = '#485870';
  ctx.fillRect(X + 6, Y + 42, 39, 3);
  ctx.fillRect(X + 42, Y + 6, 3, 39);
  ctx.fillStyle = '#ccd8e6';
  ctx.fillRect(X + 6, Y + 6, 36, 36);

  switch (type) {
    case POWERUP.STAR:
      ctx.fillStyle = '#d82000';
      ctx.fillRect(X + 21, Y + 9, 6, 30);
      ctx.fillRect(X + 9, Y + 18, 30, 6);
      ctx.fillRect(X + 15, Y + 15, 18, 12);
      ctx.fillRect(X + 12, Y + 30, 9, 6);
      ctx.fillRect(X + 27, Y + 30, 9, 6);
      ctx.fillStyle = '#ffe050';
      ctx.fillRect(X + 18, Y + 18, 12, 9);
      break;
    case POWERUP.HELMET:
      ctx.fillStyle = '#184498';
      ctx.fillRect(X + 12, Y + 12, 24, 18);
      ctx.fillRect(X + 9, Y + 21, 30, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X + 15, Y + 15, 9, 6);
      break;
    case POWERUP.CLOCK:
      ctx.fillStyle = '#142448';
      ctx.fillRect(X + 18, Y + 7, 12, 5);
      ctx.fillRect(X + 12, Y + 12, 24, 27);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X + 15, Y + 15, 18, 21);
      ctx.fillStyle = '#d82000';
      ctx.fillRect(X + 22, Y + 18, 3, 9);
      ctx.fillRect(X + 22, Y + 24, 9, 3);
      break;
    case POWERUP.SHOVEL:
      ctx.fillStyle = '#184498';
      ctx.fillRect(X + 12, Y + 24, 15, 15);
      ctx.fillRect(X + 24, Y + 15, 6, 12);
      ctx.fillRect(X + 27, Y + 9, 9, 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X + 15, Y + 27, 6, 6);
      break;
    case POWERUP.GRENADE:
      ctx.fillStyle = '#142448';
      ctx.fillRect(X + 15, Y + 15, 18, 24);
      ctx.fillRect(X + 12, Y + 18, 24, 18);
      ctx.fillStyle = '#d82000';
      ctx.fillRect(X + 21, Y + 9, 6, 6);
      ctx.fillRect(X + 27, Y + 7, 6, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X + 17, Y + 21, 6, 6);
      break;
    case POWERUP.TANK:
      ctx.fillStyle = '#d86800';
      ctx.fillRect(X + 21, Y + 9, 6, 12);
      ctx.fillRect(X + 12, Y + 18, 24, 18);
      ctx.fillStyle = '#fae070';
      ctx.fillRect(X + 18, Y + 21, 12, 12);
      break;
    case POWERUP.GUN:
      // Heavy weapon / pistol upgrade (Max Tier 3)
      ctx.fillStyle = '#182438';
      ctx.fillRect(X + 10, Y + 14, 28, 9);
      ctx.fillRect(X + 12, Y + 23, 9, 13);
      ctx.fillStyle = '#f8a018';
      ctx.fillRect(X + 34, Y + 15, 5, 7);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X + 13, Y + 16, 16, 3);
      break;
    case POWERUP.ARMOR:
      // Reinforced cyan/blue armor vest shield
      ctx.fillStyle = '#0c4080';
      ctx.fillRect(X + 11, Y + 10, 26, 20);
      ctx.fillRect(X + 14, Y + 30, 20, 6);
      ctx.fillRect(X + 18, Y + 36, 12, 3);
      ctx.fillStyle = '#40e8ff';
      ctx.fillRect(X + 14, Y + 13, 20, 14);
      ctx.fillRect(X + 18, Y + 27, 12, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X + 17, Y + 15, 6, 8);
      break;
    case POWERUP.BOAT:
      // Amphibious patrol boat
      ctx.fillStyle = '#1850b8';
      ctx.fillRect(X + 9, Y + 24, 30, 10);
      ctx.fillRect(X + 13, Y + 34, 22, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(X + 15, Y + 14, 16, 10);
      ctx.fillStyle = '#d82000';
      ctx.fillRect(X + 11, Y + 26, 26, 4);
      break;
    case POWERUP.RAPID:
      // Golden lightning bolt rapid-fire overdrive
      ctx.fillStyle = '#d84000';
      ctx.fillRect(X + 22, Y + 9, 10, 12);
      ctx.fillRect(X + 14, Y + 18, 18, 9);
      ctx.fillRect(X + 18, Y + 27, 10, 12);
      ctx.fillStyle = '#ffe840';
      ctx.fillRect(X + 24, Y + 10, 6, 10);
      ctx.fillRect(X + 16, Y + 20, 14, 6);
      ctx.fillRect(X + 20, Y + 26, 6, 11);
      break;
    default:
      break;
  }
}

export function drawTractorBeam(ctx, x1, y1, x2, y2, progress, isGrab) {
  const X1 = px(x1);
  const Y1 = px(y1);
  const X2 = px(x2);
  const Y2 = px(y2);
  const alpha = Math.max(0, 1 - progress);
  ctx.save();
  ctx.strokeStyle = isGrab ? `rgba(64, 232, 255, ${alpha})` : `rgba(255, 210, 80, ${alpha})`;
  ctx.lineWidth = 6 * (1 - progress * 0.5);
  ctx.beginPath();
  ctx.moveTo(X1, Y1);
  ctx.lineTo(X2, Y2);
  ctx.stroke();

  // Pulsing energy ring at block position
  const r = Math.round((isGrab ? (1 - progress) : progress) * 20) + 4;
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(X2 - r, Y2 - r, r * 2, r * 2);
  ctx.restore();
}

export function drawHudEnemyIcon(ctx, x, y) {
  const X = px(x);
  const Y = px(y);
  ctx.fillStyle = '#000000';
  ctx.fillRect(X + 3, Y, 6, 21);
  ctx.fillRect(X + 15, Y, 6, 21);
  ctx.fillRect(X + 6, Y + 3, 12, 15);
  ctx.fillRect(X + 9, Y + 15, 6, 6);
  ctx.fillStyle = '#d82800';
  ctx.fillRect(X + 9, Y + 6, 6, 6);
}

export function drawHudLifeIcon(ctx, x, y) {
  const X = px(x);
  const Y = px(y);
  ctx.fillStyle = '#e79c21';
  ctx.fillRect(X + 9, Y, 6, 9);
  ctx.fillRect(X + 3, Y + 6, 18, 15);
  ctx.fillStyle = '#8c5200';
  ctx.fillRect(X + 6, Y + 9, 12, 9);
  ctx.fillStyle = '#f7d65a';
  ctx.fillRect(X + 9, Y + 12, 6, 3);
}

export function drawHudFlagIcon(ctx, x, y) {
  const X = px(x);
  const Y = px(y);
  ctx.fillStyle = '#000000';
  ctx.fillRect(X + 3, Y, 5, 42);
  ctx.fillRect(X, Y + 39, 11, 3);
  ctx.fillStyle = '#f08018';
  ctx.fillRect(X + 8, Y + 3, 28, 21);
  ctx.fillStyle = '#c8480c';
  ctx.fillRect(X + 8, Y + 18, 28, 6);
}

export function drawTileSubGrid(ctx, grid, fieldX, fieldY, frame, layer) {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      const t = grid[r][c];
      if (t === TILE.EMPTY) continue;
      const gx = fieldX + c * 8;
      const gy = fieldY + r * 8;

      if (layer === 'trees') {
        if (t === TILE.TREES) drawTreesSubTile(ctx, gx, gy);
        continue;
      }

      if (t === TILE.BRICK) {
        drawBrickSubTile(ctx, gx, gy);
      } else if (t === TILE.STEEL) {
        drawSteelSubTile(ctx, gx, gy);
      } else if (t === TILE.WATER) {
        drawWaterSubTile(ctx, gx, gy, frame);
      } else if (t === TILE.ICE) {
        drawIceSubTile(ctx, gx, gy);
      }
    }
  }
}

// High-resolution crisp arcade text (rendered natively at 3x resolution)
export function drawPixelText(ctx, text, x, y, color = '#000000', size = 8, align = 'left', shadowColor = null) {
  const X = px(x);
  const Y = px(y);
  ctx.font = `900 ${Math.round(size * SCALE)}px "Courier New", ui-monospace, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  if (shadowColor) {
    ctx.fillStyle = shadowColor;
    ctx.fillRect && ctx.fillText(text, X + 2, Y + 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, X, Y);
}

export function fillLogicalRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(px(x), px(y), px(w), px(h));
}
