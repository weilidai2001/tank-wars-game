import {
  SUB_GRID, CELL_SIZE, TILE,
  WALL_MAX_HP, CONCRETE_MAX_HP, STEEL_MAX_HP,
  WALL_HEIGHT_BRICK, WALL_HEIGHT_CONCRETE, WALL_HEIGHT_STEEL,
  BASE_WALL_SUBS,
} from '../config/constants.js';

/**
 * Pure simulation arena grid manager (Single Responsibility Principle).
 * Owns tile types, wall HP, line-of-sight queries, wall damage, and base walls.
 * Zero rendering dependencies — notifies an optional listener on cell mutations.
 */
export class ArenaGrid {
  constructor() {
    this.grid = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(TILE.EMPTY));
    this.wallHp = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(0));
    this.onCellChanged = null;
  }

  static maxHpForTile(tile) {
    if (tile === TILE.BRICK) return WALL_MAX_HP;
    if (tile === TILE.CONCRETE) return CONCRETE_MAX_HP;
    if (tile === TILE.STEEL || tile === TILE.PERM_STEEL) return STEEL_MAX_HP;
    return 0;
  }

  static heightForTile(tile) {
    if (tile === TILE.STEEL || tile === TILE.PERM_STEEL) return WALL_HEIGHT_STEEL;
    if (tile === TILE.CONCRETE) return WALL_HEIGHT_CONCRETE;
    return WALL_HEIGHT_BRICK;
  }

  static isWallTile(tile) {
    return (
      tile === TILE.BRICK ||
      tile === TILE.CONCRETE ||
      tile === TILE.STEEL ||
      tile === TILE.PERM_STEEL
    );
  }

  load(rawGrid) {
    for (let r = 0; r < SUB_GRID; r++) {
      for (let c = 0; c < SUB_GRID; c++) {
        const t = rawGrid[r][c];
        this.grid[r][c] = t;
        this.wallHp[r][c] = ArenaGrid.maxHpForTile(t);
      }
    }
  }

  inBounds(c, r) {
    return c >= 0 && c < SUB_GRID && r >= 0 && r < SUB_GRID;
  }

  getTile(c, r) {
    if (!this.inBounds(c, r)) return TILE.PERM_STEEL;
    return this.grid[r][c];
  }

  getHp(c, r) {
    if (!this.inBounds(c, r)) return 0;
    return this.wallHp[r][c];
  }

  getTileAtWorld(x, z) {
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(z / CELL_SIZE);
    return this.getTile(c, r);
  }

  isBlockingTankTile(tile, hasHover = false) {
    if (
      tile === TILE.BRICK ||
      tile === TILE.CONCRETE ||
      tile === TILE.STEEL ||
      tile === TILE.PERM_STEEL ||
      tile === TILE.EAGLE ||
      tile === TILE.EAGLE_DEAD
    ) {
      return true;
    }
    if (tile === TILE.WATER && !hasHover) {
      return true;
    }
    return false;
  }

  setCell(c, r, tileType, hp = null) {
    if (!this.inBounds(c, r)) return;
    const resolvedHp = hp !== null ? hp : ArenaGrid.maxHpForTile(tileType);
    this.grid[r][c] = tileType;
    this.wallHp[r][c] = ArenaGrid.isWallTile(tileType) ? resolvedHp : 0;
    if (this.onCellChanged) {
      this.onCellChanged(c, r, tileType, this.wallHp[r][c]);
    }
  }

  setBaseWalls(tileType) {
    const hp = ArenaGrid.maxHpForTile(tileType);
    for (const sub of BASE_WALL_SUBS) {
      this.setCell(sub.c, sub.r, tileType, hp);
    }
  }

  markEagleDead() {
    this.grid[24][12] = TILE.EAGLE_DEAD;
    this.grid[24][13] = TILE.EAGLE_DEAD;
    this.grid[25][12] = TILE.EAGLE_DEAD;
    this.grid[25][13] = TILE.EAGLE_DEAD;
  }

  /**
   * Damage a single wall cell by `amount`. Returns remaining HP (0 = breached).
   */
  damageSingleCell(c, r, expectedTile, amount = 1) {
    if (!this.inBounds(c, r)) return 0;
    if (this.grid[r][c] !== expectedTile) return 0;
    const nextHp = Math.max(0, (this.wallHp[r][c] || 1) - amount);
    if (nextHp <= 0) {
      this.setCell(c, r, TILE.EMPTY, 0);
      return 0;
    }
    this.setCell(c, r, expectedTile, nextHp);
    return nextHp;
  }

  /**
   * Damage a wall cell and its twin sub-block along the impact face so breaching
   * carves a full tank-width lane.
   */
  damageWallFace(c, r, vx, vz, expectedTile, amount = 1) {
    const remHp = this.damageSingleCell(c, r, expectedTile, amount);
    if (Math.abs(vz) >= Math.abs(vx)) {
      this.damageSingleCell(c ^ 1, r, expectedTile, amount);
    } else {
      this.damageSingleCell(c, r ^ 1, expectedTile, amount);
    }
    return remHp;
  }

  /**
   * DDA-style fine-stepped line-of-sight check (walls block LOS; water/trees/ice do not).
   */
  hasClearLineOfSight(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;
    const steps = Math.ceil(dist / 0.8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const tile = this.getTileAtWorld(x1 + dx * t, z1 + dz * t);
      if (ArenaGrid.isWallTile(tile)) {
        return false;
      }
    }
    return true;
  }
}
