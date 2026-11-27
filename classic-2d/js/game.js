import {
  SCREEN_W, SCREEN_H, FIELD_X, FIELD_Y, FIELD_SIZE, TILE_SIZE, SUB_SIZE, SUB_GRID,
  DIR, DIR_VEC, TILE, ENEMY_TYPE, ENEMY_STATS, POWERUP, POWERUP_COUNT, POWERUP_NAMES,
  BONUS_ENEMY_INDICES, PLAYER_SPAWNS, ENEMY_SPAWNS, BASE_WALL_SUBS,
  PLAYER_KEY_MAPS, COLORS,
} from './constants.js';
import { buildStage, TOTAL_STAGES } from './stages.js';
import { sound } from './audio.js';
import {
  drawTileSubGrid, drawEagle, drawPlayerTank, drawEnemyTank, drawBullet,
  drawSpawnStar, drawExplosion, drawPowerup, drawTractorBeam, drawHudEnemyIcon,
  drawHudLifeIcon, drawHudFlagIcon, drawPixelText, fillLogicalRect,
} from './sprites.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const btnMute = document.getElementById('btn-mute');
const btnPause = document.getElementById('btn-pause');
const btnMenu = document.getElementById('btn-menu');

const STATE = {
  TITLE: 'TITLE',
  STAGE_INTRO: 'STAGE_INTRO',
  PLAYING: 'PLAYING',
  STAGE_CLEAR: 'STAGE_CLEAR',
  GAME_OVER: 'GAME_OVER',
};

// Track pressed keys & single-press triggers
const keysDown = new Set();
const keysJustPressed = new Set();

const PREVENT_DEFAULT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

window.addEventListener('keydown', (e) => {
  if (PREVENT_DEFAULT_KEYS.has(e.code)) {
    e.preventDefault();
  }
  if (!keysDown.has(e.code)) {
    keysJustPressed.add(e.code);
  }
  keysDown.add(e.code);

  // Global hotkeys
  if (e.code === 'KeyM') {
    toggleMuteUI();
  } else if (e.code === 'KeyP' || e.code === 'Escape') {
    if (game.state === STATE.PLAYING && !game.gameOverTriggered) {
      game.paused = !game.paused;
      updatePauseUI();
    }
  }
});

window.addEventListener('keyup', (e) => {
  keysDown.delete(e.code);
});

window.addEventListener('blur', () => {
  keysDown.clear();
});

function isAnyDown(codes) {
  for (const c of codes) {
    if (keysDown.has(c)) return true;
  }
  return false;
}

function isAnyPressed(codes) {
  for (const c of codes) {
    if (keysJustPressed.has(c)) return true;
  }
  return false;
}

function toggleMuteUI() {
  const muted = sound.toggleMute();
  btnMute.textContent = muted ? '🔇 Sound: OFF' : '🔊 Sound: ON';
}

function updatePauseUI() {
  btnPause.textContent = game.paused ? '▶ Resume' : '⏸ Pause';
}

btnMute.addEventListener('click', () => {
  toggleMuteUI();
  btnMute.blur();
});

btnPause.addEventListener('click', () => {
  if (game.state === STATE.PLAYING) {
    game.paused = !game.paused;
    updatePauseUI();
  }
  btnPause.blur();
});

btnMenu.addEventListener('click', () => {
  game.returnToTitle();
  btnMenu.blur();
});

function loadHiScore() {
  try {
    const val = parseInt(localStorage.getItem('battle_city_hiscore') || '20000', 10);
    return Number.isFinite(val) ? Math.max(20000, val) : 20000;
  } catch {
    return 20000;
  }
}

function saveHiScore(score) {
  try {
    localStorage.setItem('battle_city_hiscore', String(score));
  } catch {
    // ignore storage errors
  }
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

class BattleCityGame {
  constructor() {
    this.frame = 0;
    this.state = STATE.TITLE;
    this.paused = false;

    this.hiScore = loadHiScore();
    this.menuIndex = 0; // 0 = 1P, 1 = 2P, 2 = 3P, 3 = STAGE SELECT
    this.selectedStartStage = 1;
    this.playerCount = 1;

    this.stage = 1;
    this.stageTimer = 0;

    this.grid = [];
    this.eagleAlive = true;
    this.baseFortifyTimer = 0;
    this.freezeTimer = 0;

    this.players = [];
    this.enemyQueue = [];
    this.enemySpawnIndex = 0;
    this.enemySpawnTimer = 0;
    this.totalEnemiesSpawned = 0;
    this.enemies = [];
    this.spawns = []; // { x, y, timer, kind: 'player'|'enemy', payload }
    this.bullets = [];
    this.explosions = [];
    this.beams = [];
    this.popups = [];
    this.powerup = null;

    this.stageClearDelay = 0;
    this.gameOverBannerY = SCREEN_H;
    this.gameOverTriggered = false;
    this.gameOverTimer = 0;

    this.tallyTimer = 0;
    this.tallyRow = 0;
    this.tallyStep = 0;
  }

  returnToTitle() {
    this.state = STATE.TITLE;
    this.paused = false;
    updatePauseUI();
  }

  createPlayer(index) {
    const spawn = PLAYER_SPAWNS[index] || PLAYER_SPAWNS[0];
    return {
      index,
      x: spawn.x,
      y: spawn.y,
      dir: DIR.UP,
      lives: 10,
      score: 0,
      tier: 0,
      armor: 0,
      hasBoat: false,
      rapidTimer: 0,
      carriedBlock: null,
      alive: false,
      spawning: false,
      respawnTimer: 0,
      shieldTimer: 0,
      stunTimer: 0,
      shootCooldown: 0,
      treadFrame: 0,
      treadTick: 0,
      slideTimer: 0,
      slideDir: DIR.UP,
      kills: [0, 0, 0, 0], // kills this stage by ENEMY_TYPE
      nextExtraLifeScore: 20000,
    };
  }

  startNewGame(playerCount) {
    this.playerCount = playerCount;
    this.stage = this.selectedStartStage;
    this.players = [];
    for (let i = 0; i < playerCount; i++) {
      this.players.push(this.createPlayer(i));
    }
    this.startStage(this.stage);
  }

  startStage(stageNum) {
    this.stage = stageNum;
    this.state = STATE.STAGE_INTRO;
    this.stageTimer = 0;
    this.paused = false;
    updatePauseUI();

    const built = buildStage(stageNum);
    this.grid = built.grid;
    this.enemyQueue = built.enemies;
    this.enemySpawnIndex = 0;
    this.enemySpawnTimer = 40;
    this.totalEnemiesSpawned = 0;

    this.eagleAlive = true;
    this.baseFortifyTimer = 0;
    this.freezeTimer = 0;

    this.enemies = [];
    this.spawns = [];
    this.bullets = [];
    this.explosions = [];
    this.beams = [];
    this.popups = [];
    this.powerup = null;

    this.stageClearDelay = 0;
    this.gameOverTriggered = false;
    this.gameOverBannerY = SCREEN_H;
    this.gameOverTimer = 0;

    // Reset per-stage player state (keep lives, score, tier!)
    for (const p of this.players) {
      p.kills = [0, 0, 0, 0];
      p.alive = false;
      p.spawning = false;
      p.stunTimer = 0;
      p.slideTimer = 0;
      p.shootCooldown = 0;
      if (p.lives > 0) {
        this.queuePlayerSpawn(p);
      }
    }

    sound.playStageStart();
  }

  queuePlayerSpawn(player) {
    const pos = PLAYER_SPAWNS[player.index] || PLAYER_SPAWNS[0];
    player.spawning = true;
    player.alive = false;
    this.spawns.push({
      x: pos.x,
      y: pos.y,
      timer: 42,
      kind: 'player',
      payload: player,
    });
  }

  addScore(player, pts, popupX = null, popupY = null) {
    if (!player) return;
    player.score += pts;
    if (player.score > this.hiScore) {
      this.hiScore = player.score;
      saveHiScore(this.hiScore);
    }
    if (player.score >= player.nextExtraLifeScore) {
      player.lives = Math.min(99, player.lives + 1);
      player.nextExtraLifeScore += 20000;
      sound.playExtraLife();
      this.popups.push({ x: player.x, y: player.y - 4, text: '1UP', timer: 55, color: '#58f898' });
    }
    if (popupX !== null && popupY !== null) {
      this.popups.push({ x: popupX, y: popupY, text: String(pts), timer: 45, color: '#ffffff' });
    }
  }

  update() {
    this.frame++;

    switch (this.state) {
      case STATE.TITLE:
        this.updateTitle();
        break;
      case STATE.STAGE_INTRO:
        this.updateStageIntro();
        break;
      case STATE.PLAYING:
        if (!this.paused) this.updatePlaying();
        break;
      case STATE.STAGE_CLEAR:
        this.updateStageClear();
        break;
      case STATE.GAME_OVER:
        this.updateGameOver();
        break;
      default:
        break;
    }

    keysJustPressed.clear();
  }

  updateTitle() {
    if (isAnyPressed(['ArrowUp', 'KeyW', 'KeyU'])) {
      this.menuIndex = (this.menuIndex + 3) % 4;
      sound.playMenuMove();
    } else if (isAnyPressed(['ArrowDown', 'KeyS', 'KeyJ'])) {
      this.menuIndex = (this.menuIndex + 1) % 4;
      sound.playMenuMove();
    }

    if (this.menuIndex === 3) {
      if (isAnyPressed(['ArrowLeft', 'KeyA', 'KeyH'])) {
        this.selectedStartStage = this.selectedStartStage > 1 ? this.selectedStartStage - 1 : TOTAL_STAGES;
        sound.playMenuMove();
      } else if (isAnyPressed(['ArrowRight', 'KeyD', 'KeyK'])) {
        this.selectedStartStage = this.selectedStartStage < TOTAL_STAGES ? this.selectedStartStage + 1 : 1;
        sound.playMenuMove();
      }
    }

    if (isAnyPressed(['Enter', 'Space', 'KeyI'])) {
      if (this.menuIndex === 0) {
        this.startNewGame(1);
      } else if (this.menuIndex === 1) {
        this.startNewGame(2);
      } else if (this.menuIndex === 2) {
        this.startNewGame(3);
      } else {
        this.selectedStartStage = this.selectedStartStage < TOTAL_STAGES ? this.selectedStartStage + 1 : 1;
        sound.playMenuMove();
      }
    }
  }

  updateStageIntro() {
    this.stageTimer++;
    if (this.stageTimer >= 105) {
      this.state = STATE.PLAYING;
    }
  }

  updatePlaying() {
    // Timers
    if (this.freezeTimer > 0) this.freezeTimer--;

    if (this.baseFortifyTimer > 0) {
      this.baseFortifyTimer--;
      const defaultWall = this.stage <= 10 ? TILE.STEEL : TILE.BRICK;
      if (this.baseFortifyTimer === 0) {
        this.setBaseWalls(defaultWall);
      } else if (this.baseFortifyTimer < 180 && defaultWall === TILE.BRICK) {
        // Blink warning between steel & brick (on stages 11+ where walls revert to brick)
        const tile = Math.floor(this.baseFortifyTimer / 12) % 2 === 0 ? TILE.STEEL : TILE.BRICK;
        this.setBaseWalls(tile);
      }
    }

    // Spawning stars
    for (let i = this.spawns.length - 1; i >= 0; i--) {
      const sp = this.spawns[i];
      sp.timer--;
      if (sp.timer <= 0) {
        if (sp.kind === 'player') {
          const p = sp.payload;
          p.x = sp.x;
          p.y = sp.y;
          p.dir = DIR.UP;
          p.alive = true;
          p.spawning = false;
          p.shieldTimer = 180; // 3s spawn shield
        } else if (sp.kind === 'enemy') {
          const { type, isBonus } = sp.payload;
          const stats = ENEMY_STATS[type];
          this.enemies.push({
            x: sp.x,
            y: sp.y,
            dir: DIR.DOWN,
            type,
            hp: stats.hp,
            speed: stats.speed,
            bulletSpeed: stats.bulletSpeed,
            points: stats.points,
            isBonus,
            treadFrame: 0,
            treadTick: 0,
            aiTurnTimer: 40 + Math.floor(Math.random() * 80),
            shootTimer: 35 + Math.floor(Math.random() * 70),
          });
        }
        this.spawns.splice(i, 1);
      }
    }

    // Enemy spawning
    const maxEnemies = this.playerCount >= 3 ? 7 : this.playerCount === 2 ? 6 : 4;
    const activeEnemySpawns = this.spawns.filter((s) => s.kind === 'enemy').length;
    if (this.enemyQueue.length > 0 && this.enemies.length + activeEnemySpawns < maxEnemies) {
      this.enemySpawnTimer--;
      if (this.enemySpawnTimer <= 0) {
        const spawnSpot = ENEMY_SPAWNS[this.enemySpawnIndex % ENEMY_SPAWNS.length];
        if (!this.isSpotOccupiedByTank(spawnSpot.x, spawnSpot.y)) {
          const type = this.enemyQueue.shift();
          const isBonus = BONUS_ENEMY_INDICES.has(this.totalEnemiesSpawned);
          this.totalEnemiesSpawned++;
          this.enemySpawnIndex++;
          this.spawns.push({
            x: spawnSpot.x,
            y: spawnSpot.y,
            timer: 48,
            kind: 'enemy',
            payload: { type, isBonus },
          });
          this.enemySpawnTimer = this.playerCount >= 3 ? 95 : this.playerCount === 2 ? 110 : 145;
        } else {
          this.enemySpawnIndex++;
          this.enemySpawnTimer = 25;
        }
      }
    }

    // Update players
    for (const p of this.players) {
      this.updatePlayer(p);
    }

    // Update enemies
    if (this.freezeTimer === 0) {
      for (const e of this.enemies) {
        this.updateEnemy(e);
      }
    }

    // Update bullets
    this.updateBullets();

    // Update power-up
    if (this.powerup) {
      this.powerup.timer--;
      if (this.powerup.timer <= 0) {
        this.powerup = null;
      } else {
        for (const p of this.players) {
          if (p.alive && rectsOverlap(p.x, p.y, 16, 16, this.powerup.x, this.powerup.y, 16, 16)) {
            this.collectPowerup(p, this.powerup);
            this.powerup = null;
            break;
          }
        }
      }
    }

    // Update explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.timer++;
      if (ex.timer >= ex.duration) {
        this.explosions.splice(i, 1);
      }
    }

    // Update tractor beams
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.timer++;
      if (bm.timer >= bm.duration) {
        this.beams.splice(i, 1);
      }
    }

    // Update score popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.timer--;
      if (pop.timer <= 0) this.popups.splice(i, 1);
    }

    // Check Game Over condition (Eagle destroyed or all players out of lives)
    if (!this.gameOverTriggered) {
      const anyPlayerRemaining = this.players.some((p) => p.alive || p.spawning || p.lives > 0);
      if (!this.eagleAlive || !anyPlayerRemaining) {
        this.gameOverTriggered = true;
        this.gameOverBannerY = SCREEN_H;
        this.gameOverTimer = 0;
        sound.playGameOver();
      }
    }

    if (this.gameOverTriggered) {
      if (this.gameOverBannerY > FIELD_Y + FIELD_SIZE / 2 - 12) {
        this.gameOverBannerY -= 1.5;
      } else {
        this.gameOverTimer++;
        if (this.gameOverTimer >= 130) {
          this.state = STATE.GAME_OVER;
          this.stageTimer = 0;
        }
      }
      return;
    }

    // Check Stage Clear condition
    const activeEnemySpawnsNow = this.spawns.filter((s) => s.kind === 'enemy').length;
    if (this.enemyQueue.length === 0 && this.enemies.length === 0 && activeEnemySpawnsNow === 0) {
      this.stageClearDelay++;
      if (this.stageClearDelay >= 120) {
        this.state = STATE.STAGE_CLEAR;
        this.tallyTimer = 0;
        this.tallyRow = 0;
        this.tallyStep = 0;
      }
    }
  }

  updatePlayer(p) {
    if (!p.alive) {
      if (!p.spawning && p.lives > 0) {
        p.respawnTimer--;
        if (p.respawnTimer <= 0) {
          this.queuePlayerSpawn(p);
        }
      }
      return;
    }

    if (p.shieldTimer > 0) p.shieldTimer--;
    if (p.rapidTimer > 0) p.rapidTimer--;
    if (p.shootCooldown > 0) p.shootCooldown--;
    if (p.stunTimer > 0) {
      p.stunTimer--;
      return;
    }

    if (this.gameOverTriggered) return;

    const map = PLAYER_KEY_MAPS[p.index] || PLAYER_KEY_MAPS[0];
    let moveDir = null;
    if (isAnyDown(map.up)) moveDir = DIR.UP;
    else if (isAnyDown(map.down)) moveDir = DIR.DOWN;
    else if (isAnyDown(map.left)) moveDir = DIR.LEFT;
    else if (isAnyDown(map.right)) moveDir = DIR.RIGHT;

    const speed = 1.15;
    const onIce = this.isTankOnIce(p.x, p.y);

    if (moveDir !== null) {
      // Grid alignment assist when changing axis (authentic Battle City cornering!)
      const turningAxis = (p.dir % 2) !== (moveDir % 2);
      if (turningAxis) {
        if (moveDir === DIR.UP || moveDir === DIR.DOWN) {
          const snappedX = Math.round(p.x / SUB_SIZE) * SUB_SIZE;
          if (Math.abs(snappedX - p.x) <= 5) p.x = snappedX;
        } else {
          const snappedY = Math.round(p.y / SUB_SIZE) * SUB_SIZE;
          if (Math.abs(snappedY - p.y) <= 5) p.y = snappedY;
        }
      }
      p.dir = moveDir;
      this.tryMoveTank(p, moveDir, speed, p.hasBoat);
      p.treadTick++;
      if (p.treadTick >= 4) {
        p.treadTick = 0;
        p.treadFrame ^= 1;
      }
      if (onIce) {
        p.slideDir = moveDir;
        p.slideTimer = 18;
      } else {
        p.slideTimer = 0;
      }
    } else if (p.slideTimer > 0 && onIce) {
      p.slideTimer--;
      this.tryMoveTank(p, p.slideDir, speed * 0.85, p.hasBoat);
    }

    // Grab / Drop protection wall block
    if (isAnyPressed(map.grab)) {
      this.tryGrabOrDropWall(p);
    }

    // Firing
    if (isAnyPressed(map.fire) || (isAnyDown(map.fire) && p.shootCooldown === 0)) {
      this.tryFirePlayer(p);
    }
  }

  tryGrabOrDropWall(p) {
    const vec = DIR_VEC[p.dir];
    // Target 16x16 block directly in front of tank, aligned to 8px sub-grid
    const targetX = Math.round((p.x + vec.x * TILE_SIZE) / SUB_SIZE) * SUB_SIZE;
    const targetY = Math.round((p.y + vec.y * TILE_SIZE) / SUB_SIZE) * SUB_SIZE;
    const c0 = Math.floor(targetX / SUB_SIZE);
    const r0 = Math.floor(targetY / SUB_SIZE);

    if (c0 < 0 || r0 < 0 || c0 + 1 >= SUB_GRID || r0 + 1 >= SUB_GRID) return;

    const cells = [
      { c: c0, r: r0 },
      { c: c0 + 1, r: r0 },
      { c: c0, r: r0 + 1 },
      { c: c0 + 1, r: r0 + 1 },
    ];

    if (p.carriedBlock === null) {
      // SUCK / GRAB a brick or steel wall in front of the tank
      let grabbedType = null;
      const toClear = [];

      for (const cell of cells) {
        const t = this.grid[cell.r][cell.c];
        const isLockedBase = this.stage <= 10 && BASE_WALL_SUBS.some((bw) => bw.c === cell.c && bw.r === cell.r);
        if (isLockedBase) continue;
        if (t === TILE.STEEL || t === TILE.BRICK) {
          toClear.push(cell);
          if (t === TILE.STEEL || grabbedType === null) grabbedType = t;
        }
      }

      if (grabbedType !== null && toClear.length > 0) {
        for (const cell of toClear) {
          this.grid[cell.r][cell.c] = TILE.EMPTY;
        }
        p.carriedBlock = grabbedType;
        sound.playGrab();
        this.beams.push({
          x1: p.x + 8,
          y1: p.y + 8,
          x2: targetX + 8,
          y2: targetY + 8,
          timer: 0,
          duration: 14,
          isGrab: true,
        });
        this.popups.push({
          x: p.x - 2,
          y: p.y - 6,
          text: grabbedType === TILE.STEEL ? 'STEEL!' : 'BRICK!',
          timer: 38,
          color: '#40e8ff',
        });
      }
    } else {
      // DROP / PLACE the carried wall block right in front of the tank
      // Ensure target area doesn't overlap Eagle or any alive tank
      for (const cell of cells) {
        const t = this.grid[cell.r][cell.c];
        if (t === TILE.EAGLE || t === TILE.EAGLE_DEAD) return;
      }
      const allTanks = [...this.players.filter((pl) => pl.alive), ...this.enemies];
      for (const tk of allTanks) {
        if (rectsOverlap(targetX + 1, targetY + 1, 14, 14, tk.x + 1, tk.y + 1, 14, 14)) {
          return;
        }
      }

      let placed = false;
      for (const cell of cells) {
        const t = this.grid[cell.r][cell.c];
        if (t === TILE.EMPTY || t === TILE.ICE || t === TILE.TREES) {
          this.grid[cell.r][cell.c] = p.carriedBlock;
          placed = true;
        }
      }

      if (placed) {
        p.carriedBlock = null;
        sound.playDrop();
        this.beams.push({
          x1: p.x + 8,
          y1: p.y + 8,
          x2: targetX + 8,
          y2: targetY + 8,
          timer: 0,
          duration: 14,
          isGrab: false,
        });
        this.popups.push({
          x: targetX,
          y: targetY - 4,
          text: 'DROP!',
          timer: 32,
          color: '#ffe050',
        });
      }
    }
  }

  tryFirePlayer(p) {
    if (p.shootCooldown > 0) return;
    const rapid = p.rapidTimer > 0;
    const maxBullets = rapid ? 3 : p.tier >= 2 ? 2 : 1;
    const ownBullets = this.bullets.filter((b) => b.ownerType === 'player' && b.owner === p).length;
    if (ownBullets >= maxBullets) return;

    const baseSpeed = p.tier === 0 ? 2.4 : p.tier === 3 ? 3.6 : 3.3;
    const speed = rapid ? baseSpeed + 0.5 : baseSpeed;
    const vec = DIR_VEC[p.dir];
    const bx = p.x + 8 + vec.x * 8;
    const by = p.y + 8 + vec.y * 8;

    this.bullets.push({
      x: bx,
      y: by,
      dir: p.dir,
      speed,
      ownerType: 'player',
      owner: p,
      canBreakSteel: p.tier >= 3,
    });
    p.shootCooldown = rapid ? 6 : 12;
    sound.playShoot();
  }

  updateEnemy(e) {
    const moved = this.tryMoveTank(e, e.dir, e.speed);
    if (moved) {
      e.treadTick++;
      if (e.treadTick >= 5) {
        e.treadTick = 0;
        e.treadFrame ^= 1;
      }
    }

    e.aiTurnTimer--;
    if (!moved || e.aiTurnTimer <= 0) {
      // Snap to 8px track before turning
      e.x = Math.round(e.x / SUB_SIZE) * SUB_SIZE;
      e.y = Math.round(e.y / SUB_SIZE) * SUB_SIZE;

      // Bias slightly toward bottom / Eagle base
      const roll = Math.random();
      if (roll < 0.36) {
        e.dir = DIR.DOWN;
      } else if (roll < 0.56) {
        e.dir = e.x < 6 * TILE_SIZE ? DIR.RIGHT : DIR.LEFT;
      } else {
        e.dir = Math.floor(Math.random() * 4);
      }
      e.aiTurnTimer = 45 + Math.floor(Math.random() * 95);
    }

    // Enemy firing
    e.shootTimer--;
    if (e.shootTimer <= 0) {
      const ownBullets = this.bullets.filter((b) => b.ownerType === 'enemy' && b.owner === e).length;
      if (ownBullets === 0) {
        const vec = DIR_VEC[e.dir];
        this.bullets.push({
          x: e.x + 8 + vec.x * 8,
          y: e.y + 8 + vec.y * 8,
          dir: e.dir,
          speed: e.bulletSpeed,
          ownerType: 'enemy',
          owner: e,
          canBreakSteel: false,
        });
      }
      e.shootTimer = e.type === ENEMY_TYPE.POWER
        ? 30 + Math.floor(Math.random() * 45)
        : 55 + Math.floor(Math.random() * 75);
    }
  }

  tryMoveTank(tank, dir, speed, canCrossWater = false) {
    const vec = DIR_VEC[dir];
    const nx = tank.x + vec.x * speed;
    const ny = tank.y + vec.y * speed;

    // Playfield boundaries
    if (nx < 0 || ny < 0 || nx + TILE_SIZE > FIELD_SIZE || ny + TILE_SIZE > FIELD_SIZE) {
      // Clamp neatly to wall
      tank.x = Math.max(0, Math.min(FIELD_SIZE - TILE_SIZE, nx));
      tank.y = Math.max(0, Math.min(FIELD_SIZE - TILE_SIZE, ny));
      return false;
    }

    // Terrain collision (inset by 1px for smooth corridor fit)
    if (this.collidesTerrain(nx + 1, ny + 1, 14, 14, canCrossWater)) {
      return false;
    }

    // Tank-vs-tank collision (allow separating if already overlapping)
    if (this.collidesOtherTanks(tank, nx + 1, ny + 1, 14, 14)) {
      return false;
    }

    tank.x = nx;
    tank.y = ny;
    return true;
  }

  collidesTerrain(x, y, w, h, canCrossWater = false) {
    const c0 = Math.max(0, Math.floor(x / SUB_SIZE));
    const c1 = Math.min(SUB_GRID - 1, Math.floor((x + w - 0.01) / SUB_SIZE));
    const r0 = Math.max(0, Math.floor(y / SUB_SIZE));
    const r1 = Math.min(SUB_GRID - 1, Math.floor((y + h - 0.01) / SUB_SIZE));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.grid[r][c];
        if (t === TILE.BRICK || t === TILE.STEEL || t === TILE.EAGLE || t === TILE.EAGLE_DEAD) {
          return true;
        }
        if (t === TILE.WATER && !canCrossWater) {
          return true;
        }
      }
    }
    return false;
  }

  isTankOnIce(x, y) {
    const cx = Math.floor((x + 8) / SUB_SIZE);
    const cy = Math.floor((y + 8) / SUB_SIZE);
    if (cy < 0 || cy >= SUB_GRID || cx < 0 || cx >= SUB_GRID) return false;
    return this.grid[cy][cx] === TILE.ICE;
  }

  collidesOtherTanks(self, nx, ny, w, h) {
    const all = [...this.players.filter((p) => p.alive), ...this.enemies];
    for (const other of all) {
      if (other === self) continue;
      // If already overlapping, allow moving away
      const already = rectsOverlap(self.x + 1, self.y + 1, 14, 14, other.x + 1, other.y + 1, 14, 14);
      if (already) continue;
      if (rectsOverlap(nx, ny, w, h, other.x + 1, other.y + 1, 14, 14)) {
        return true;
      }
    }
    return false;
  }

  isSpotOccupiedByTank(x, y) {
    for (const p of this.players) {
      if (p.alive && rectsOverlap(x, y, 16, 16, p.x, p.y, 16, 16)) return true;
    }
    for (const e of this.enemies) {
      if (rectsOverlap(x, y, 16, 16, e.x, e.y, 16, 16)) return true;
    }
    for (const s of this.spawns) {
      if (rectsOverlap(x, y, 16, 16, s.x, s.y, 16, 16)) return true;
    }
    return false;
  }

  updateBullets() {
    const toRemove = new Set();

    for (let i = 0; i < this.bullets.length; i++) {
      if (toRemove.has(i)) continue;
      const b = this.bullets[i];
      const vec = DIR_VEC[b.dir];
      b.x += vec.x * b.speed;
      b.y += vec.y * b.speed;

      // Playfield edge
      if (b.x < 0 || b.y < 0 || b.x > FIELD_SIZE || b.y > FIELD_SIZE) {
        toRemove.add(i);
        this.spawnExplosion(Math.max(2, Math.min(FIELD_SIZE - 2, b.x)), Math.max(2, Math.min(FIELD_SIZE - 2, b.y)), false);
        if (b.ownerType === 'player') sound.playSteelHit();
        continue;
      }

      // Bullet vs Bullet cancellation
      let hitBullet = false;
      for (let j = i + 1; j < this.bullets.length; j++) {
        if (toRemove.has(j)) continue;
        const other = this.bullets[j];
        if (other.ownerType === b.ownerType) continue;
        if (Math.abs(b.x - other.x) <= 5 && Math.abs(b.y - other.y) <= 5) {
          toRemove.add(i);
          toRemove.add(j);
          this.spawnExplosion((b.x + other.x) / 2, (b.y + other.y) / 2, false);
          hitBullet = true;
          break;
        }
      }
      if (hitBullet) continue;

      // Bullet vs Terrain (check 2 sub-tiles wide along perpendicular axis so a centered shot carves a 16px tunnel)
      if (this.checkBulletTerrain(b)) {
        toRemove.add(i);
        continue;
      }

      // Bullet vs Tanks
      if (b.ownerType === 'player') {
        // Hit enemy tanks
        let hitEnemy = false;
        for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
          const e = this.enemies[ei];
          if (rectsOverlap(b.x - 2, b.y - 2, 4, 4, e.x + 1, e.y + 1, 14, 14)) {
            toRemove.add(i);
            hitEnemy = true;

            if (e.isBonus) {
              e.isBonus = false;
              this.spawnPowerup();
            }

            e.hp--;
            if (e.hp <= 0) {
              this.enemies.splice(ei, 1);
              b.owner.kills[e.type]++;
              this.addScore(b.owner, e.points, e.x + 2, e.y + 4);
              this.spawnExplosion(e.x + 8, e.y + 8, true);
              sound.playExplosion(true);
            } else {
              this.spawnExplosion(b.x, b.y, false);
              sound.playArmorHit();
            }
            break;
          }
        }
        if (hitEnemy) continue;

        // Friendly fire: stuns teammate briefly (authentic Battle City!)
        for (const p of this.players) {
          if (!p.alive || p === b.owner) continue;
          if (rectsOverlap(b.x - 2, b.y - 2, 4, 4, p.x + 1, p.y + 1, 14, 14)) {
            toRemove.add(i);
            if (p.shieldTimer <= 0) {
              p.stunTimer = 90;
            }
            this.spawnExplosion(b.x, b.y, false);
            break;
          }
        }
      } else {
        // Enemy bullet vs Player tanks
        for (const p of this.players) {
          if (!p.alive) continue;
          if (rectsOverlap(b.x - 2, b.y - 2, 4, 4, p.x + 1, p.y + 1, 14, 14)) {
            toRemove.add(i);
            if (p.shieldTimer > 0) {
              this.spawnExplosion(b.x, b.y, false);
              sound.playSteelHit();
            } else if (p.armor > 0) {
              p.armor--;
              p.shieldTimer = 30; // Brief hit-flash invulnerability
              this.spawnExplosion(b.x, b.y, false);
              sound.playArmorHit();
              this.popups.push({ x: p.x - 2, y: p.y - 5, text: 'ARMOR!', timer: 35, color: '#40e8ff' });
            } else if (p.hasBoat) {
              p.hasBoat = false;
              p.shieldTimer = 30;
              this.spawnExplosion(b.x, b.y, false);
              sound.playArmorHit();
              this.popups.push({ x: p.x - 4, y: p.y - 5, text: 'SAVED!', timer: 35, color: '#64c0ff' });
            } else {
              this.killPlayer(p);
            }
            break;
          }
        }
      }
    }

    if (toRemove.size > 0) {
      this.bullets = this.bullets.filter((_, idx) => !toRemove.has(idx));
    }
  }

  checkBulletTerrain(b) {
    // Check a small 4x4 box around bullet nose, widening to 10px perpendicular so centered shots break 2 adjacent sub-tiles
    const isVert = b.dir === DIR.UP || b.dir === DIR.DOWN;
    const halfW = isVert ? 5 : 2;
    const halfH = isVert ? 2 : 5;

    const c0 = Math.max(0, Math.floor((b.x - halfW) / SUB_SIZE));
    const c1 = Math.min(SUB_GRID - 1, Math.floor((b.x + halfW) / SUB_SIZE));
    const r0 = Math.max(0, Math.floor((b.y - halfH) / SUB_SIZE));
    const r1 = Math.min(SUB_GRID - 1, Math.floor((b.y + halfH) / SUB_SIZE));

    let hitSomething = false;
    let brokeBrick = false;
    let hitSteel = false;
    let hitEagle = false;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.grid[r][c];
        if (t === TILE.BRICK) {
          this.grid[r][c] = TILE.EMPTY;
          hitSomething = true;
          brokeBrick = true;
        } else if (t === TILE.STEEL) {
          hitSomething = true;
          const isProtectedBase = this.stage <= 10 && BASE_WALL_SUBS.some((p) => p.c === c && p.r === r);
          if (b.canBreakSteel && !isProtectedBase) {
            this.grid[r][c] = TILE.EMPTY;
            brokeBrick = true;
          } else {
            hitSteel = true;
          }
        } else if (t === TILE.EAGLE) {
          hitSomething = true;
          hitEagle = true;
        }
      }
    }

    if (hitEagle && this.eagleAlive) {
      this.eagleAlive = false;
      for (let r = 24; r <= 25; r++) {
        for (let c = 12; c <= 13; c++) {
          this.grid[r][c] = TILE.EAGLE_DEAD;
        }
      }
      this.spawnExplosion(6 * TILE_SIZE + 8, 12 * TILE_SIZE + 8, true);
      sound.playExplosion(true);
      return true;
    }

    if (hitSomething) {
      this.spawnExplosion(b.x, b.y, false);
      if (b.ownerType === 'player') {
        if (brokeBrick) sound.playBrickHit();
        else if (hitSteel) sound.playSteelHit();
      }
      return true;
    }

    return false;
  }

  killPlayer(p) {
    p.alive = false;
    p.lives = Math.max(0, p.lives - 1);
    p.tier = 0;
    p.armor = 0;
    p.hasBoat = false;
    p.rapidTimer = 0;
    p.carriedBlock = null;
    p.respawnTimer = 60;
    this.spawnExplosion(p.x + 8, p.y + 8, true);
    sound.playExplosion(true);
  }

  spawnExplosion(x, y, big) {
    this.explosions.push({
      x,
      y,
      big,
      timer: 0,
      duration: big ? 28 : 12,
    });
  }

  spawnPowerup() {
    // Pick a random crate variety (all 10 power-up types!) away from the Eagle
    const type = Math.floor(Math.random() * POWERUP_COUNT);
    const tx = 1 + Math.floor(Math.random() * 11);
    const ty = 1 + Math.floor(Math.random() * 10);
    this.powerup = {
      type,
      x: tx * TILE_SIZE,
      y: ty * TILE_SIZE,
      timer: 720, // 12 seconds
    };
    sound.playPowerupSpawn();
  }

  collectPowerup(player, pu) {
    this.addScore(player, 500);
    const label = POWERUP_NAMES[pu.type] || '+500';
    this.popups.push({ x: pu.x - 4, y: pu.y + 2, text: label, timer: 55, color: '#ffe050' });

    switch (pu.type) {
      case POWERUP.STAR:
        player.tier = Math.min(3, player.tier + 1);
        sound.playPowerupPickup();
        break;
      case POWERUP.GUN:
        // Instant Max Weapon (Tier 3 steel-breaker!)
        player.tier = 3;
        sound.playPowerupPickup();
        break;
      case POWERUP.ARMOR:
        // Reinforced Armor Plating (+2 hits absorbed, max 4)
        player.armor = Math.min(4, player.armor + 2);
        sound.playPowerupPickup();
        break;
      case POWERUP.BOAT:
        // Amphibious water-crossing + absorbs 1 hit
        player.hasBoat = true;
        sound.playPowerupPickup();
        break;
      case POWERUP.RAPID:
        // 12 seconds of 3-shot rapid-fire overdrive
        player.rapidTimer = 720;
        sound.playPowerupPickup();
        break;
      case POWERUP.HELMET:
        player.shieldTimer = 600; // 10s
        sound.playPowerupPickup();
        break;
      case POWERUP.CLOCK:
        this.freezeTimer = 600; // 10s
        sound.playPowerupPickup();
        break;
      case POWERUP.SHOVEL:
        this.setBaseWalls(TILE.STEEL);
        this.baseFortifyTimer = 900; // 15s
        sound.playPowerupPickup();
        break;
      case POWERUP.GRENADE:
        for (const e of this.enemies) {
          this.spawnExplosion(e.x + 8, e.y + 8, true);
        }
        this.enemies = [];
        sound.playExplosion(true);
        break;
      case POWERUP.TANK:
        player.lives = Math.min(99, player.lives + 1);
        sound.playExtraLife();
        break;
      default:
        break;
    }
  }

  setBaseWalls(tileType) {
    for (const pos of BASE_WALL_SUBS) {
      this.grid[pos.r][pos.c] = tileType;
    }
  }

  updateStageClear() {
    this.tallyTimer++;

    // Animate row-by-row tallying
    if (this.tallyRow < 4) {
      if (this.tallyTimer % 10 === 0) {
        const maxKills = Math.max(...this.players.map((p) => p.kills[this.tallyRow]));
        if (this.tallyStep < maxKills) {
          this.tallyStep++;
          sound.playTick();
        } else {
          this.tallyRow++;
          this.tallyStep = 0;
        }
      }
    } else if (this.tallyRow === 4 && this.tallyTimer % 30 === 0) {
      // Award multiplayer top-killer bonus (+1000 PTS)
      if (this.playerCount >= 2) {
        const totals = this.players.map((p) => p.kills.reduce((a, b) => a + b, 0));
        const maxTotal = Math.max(...totals);
        const winners = this.players.filter((_, idx) => totals[idx] === maxTotal);
        if (winners.length === 1 && maxTotal > 0) {
          this.addScore(winners[0], 1000);
        }
      }
      this.tallyRow = 5;
      this.tallyTimer = 0;
    } else if (this.tallyRow >= 5) {
      if (this.tallyTimer >= 140 || isAnyPressed(['Enter', 'Space'])) {
        this.startStage(this.stage + 1);
      }
    }

    if (this.tallyRow < 5 && isAnyPressed(['Enter', 'Space'])) {
      this.tallyRow = 4;
    }
  }

  updateGameOver() {
    this.stageTimer++;
    if (this.stageTimer >= 160 || isAnyPressed(['Enter', 'Space'])) {
      this.returnToTitle();
    }
  }

  // ==================== RENDERING ====================
  render() {
    fillLogicalRect(ctx, 0, 0, SCREEN_W, SCREEN_H, COLORS.BLACK);

    switch (this.state) {
      case STATE.TITLE:
        this.renderTitle();
        break;
      case STATE.STAGE_INTRO:
        this.renderStageIntro();
        break;
      case STATE.PLAYING:
        this.renderPlaying();
        break;
      case STATE.STAGE_CLEAR:
        this.renderStageClear();
        break;
      case STATE.GAME_OVER:
        this.renderGameOver();
        break;
      default:
        break;
    }
  }

  renderTitle() {
    // Top score header
    drawPixelText(ctx, `I-${String(this.players[0]?.score || 0).padStart(6, '0')}`, 14, 12, '#ffffff', 8);
    drawPixelText(ctx, `HI-${String(this.hiScore).padStart(6, '0')}`, 96, 12, '#ffffff', 8);
    if (this.players[1]) {
      drawPixelText(ctx, `II-${String(this.players[1].score).padStart(6, '0')}`, 178, 12, '#ffffff', 8);
    }

    // Brick-styled BATTLE CITY title banner
    fillLogicalRect(ctx, 28, 34, 200, 62, '#c84c0c');
    for (let y = 38; y < 96; y += 6) {
      fillLogicalRect(ctx, 28, y, 200, 1, '#5a2008');
    }
    fillLogicalRect(ctx, 32, 38, 192, 54, '#000000');

    drawPixelText(ctx, 'BATTLE', 128, 41, '#f48c30', 22, 'center', '#8a2204');
    drawPixelText(ctx, 'CITY', 128, 65, '#f48c30', 22, 'center', '#8a2204');

    // Menu options
    const menuY = 104;
    const options = [
      '1 PLAYER',
      '2 PLAYERS',
      '3 PLAYERS',
      `STAGE  < ${this.selectedStartStage} >`,
    ];
    options.forEach((label, idx) => {
      const y = menuY + idx * 16;
      const color = idx === this.menuIndex ? '#f7d65a' : '#ffffff';
      drawPixelText(ctx, label, 92, y + 3, color, 8.5);
    });

    // Animated tank cursor
    const cursorY = menuY + this.menuIndex * 16 - 1;
    drawPlayerTank(ctx, 68, cursorY, DIR.RIGHT, this.menuIndex === 2 ? 2 : this.menuIndex === 1 ? 1 : 0, 1, Math.floor(this.frame / 6) % 2, 0, 0, this.frame);

    // Controls hint
    drawPixelText(ctx, '1P: WASD+SPC   2P: ARROWS+ENT', 128, 174, '#e79c21', 6.5, 'center');
    drawPixelText(ctx, '3P: UHJK+I  (GRAB: E / R-CTRL / O)', 128, 186, '#58c8ff', 6.5, 'center');
    drawPixelText(ctx, 'PRESS ENTER OR SPACE TO START', 128, 204, '#a0a8b8', 7, 'center');
  }

  renderStageIntro() {
    // Classic grey curtain opening
    this.renderPlaying();
    const progress = this.stageTimer / 105;
    let coverH = SCREEN_H / 2;
    if (progress < 0.2) {
      coverH = (progress / 0.2) * (SCREEN_H / 2);
    } else if (progress > 0.78) {
      coverH = ((1 - progress) / 0.22) * (SCREEN_H / 2);
    }

    fillLogicalRect(ctx, 0, 0, SCREEN_W, Math.ceil(coverH), COLORS.BORDER_GREY);
    fillLogicalRect(ctx, 0, Math.floor(SCREEN_H - coverH), SCREEN_W, Math.ceil(coverH) + 1, COLORS.BORDER_GREY);

    if (progress >= 0.2 && progress <= 0.78) {
      drawPixelText(ctx, `STAGE  ${this.stage}`, SCREEN_W / 2, SCREEN_H / 2 - 5, '#000000', 10, 'center');
    }
  }

  renderPlaying() {
    // Grey outer frame
    fillLogicalRect(ctx, 0, 0, SCREEN_W, SCREEN_H, COLORS.BORDER_GREY);

    // Black playfield
    fillLogicalRect(ctx, FIELD_X, FIELD_Y, FIELD_SIZE, FIELD_SIZE, COLORS.BLACK);

    // Ground terrain layer (brick, steel, water, ice)
    drawTileSubGrid(ctx, this.grid, FIELD_X, FIELD_Y, this.frame, 'ground');

    // Eagle base
    drawEagle(ctx, FIELD_X + 6 * TILE_SIZE, FIELD_Y + 12 * TILE_SIZE, this.eagleAlive);

    // Spawning stars
    for (const sp of this.spawns) {
      drawSpawnStar(ctx, FIELD_X + sp.x, FIELD_Y + sp.y, sp.timer);
    }

    // Player tanks
    for (const p of this.players) {
      if (!p.alive) continue;
      drawPlayerTank(
        ctx,
        FIELD_X + p.x,
        FIELD_Y + p.y,
        p.dir,
        p.index,
        p.tier,
        p.treadFrame,
        p.shieldTimer,
        p.stunTimer,
        this.frame,
        {
          armor: p.armor,
          hasBoat: p.hasBoat,
          rapidTimer: p.rapidTimer,
          carriedBlock: p.carriedBlock,
        }
      );
    }

    // Enemy tanks
    for (const e of this.enemies) {
      drawEnemyTank(
        ctx,
        FIELD_X + e.x,
        FIELD_Y + e.y,
        e.dir,
        e.type,
        e.hp,
        e.isBonus,
        e.treadFrame,
        this.frame
      );
    }

    // Bullets
    for (const b of this.bullets) {
      drawBullet(ctx, FIELD_X + b.x, FIELD_Y + b.y, b.dir, b.canBreakSteel);
    }

    // Trees layer (drawn ON TOP of tanks & bullets for authentic ambush cover!)
    drawTileSubGrid(ctx, this.grid, FIELD_X, FIELD_Y, this.frame, 'trees');

    // Power-up
    if (this.powerup) {
      drawPowerup(ctx, FIELD_X + this.powerup.x, FIELD_Y + this.powerup.y, this.powerup.type, this.frame);
    }

    // Explosions
    for (const ex of this.explosions) {
      drawExplosion(ctx, FIELD_X + ex.x, FIELD_Y + ex.y, ex.timer / ex.duration, ex.big);
    }

    // Tractor beams (Grab / Drop wall effects)
    for (const bm of this.beams) {
      drawTractorBeam(
        ctx,
        FIELD_X + bm.x1,
        FIELD_Y + bm.y1,
        FIELD_X + bm.x2,
        FIELD_Y + bm.y2,
        bm.timer / bm.duration,
        bm.isGrab
      );
    }

    // Score popups
    for (const pop of this.popups) {
      drawPixelText(ctx, pop.text, FIELD_X + pop.x, FIELD_Y + pop.y, pop.color, 7, 'left', '#000000');
    }

    // Right sidebar HUD (matching Screenshot 1!)
    this.renderSidebar();

    // Pause banner
    if (this.paused) {
      if (Math.floor(this.frame / 20) % 2 === 0) {
        drawPixelText(ctx, 'PAUSE', FIELD_X + FIELD_SIZE / 2, FIELD_Y + FIELD_SIZE / 2 - 5, '#d82800', 11, 'center', '#000000');
      }
    }

    // Rising GAME OVER banner
    if (this.gameOverTriggered) {
      const cx = FIELD_X + FIELD_SIZE / 2;
      fillLogicalRect(ctx, cx - 32, Math.round(this.gameOverBannerY) - 2, 64, 24, 'rgba(0, 0, 0, 0.78)');
      drawPixelText(ctx, 'GAME', cx, this.gameOverBannerY, '#d82800', 10, 'center');
      drawPixelText(ctx, 'OVER', cx, this.gameOverBannerY + 11, '#d82800', 10, 'center');
    }
  }

  renderSidebar() {
    const sx = FIELD_X + FIELD_SIZE + 6;

    // Remaining enemies grid (2 cols x 10 rows)
    const remaining = this.enemyQueue.length;
    for (let i = 0; i < remaining; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      drawHudEnemyIcon(ctx, sx + 2 + col * 8, FIELD_Y + 8 + row * 8);
    }

    // 1P / 2P / 3P lives (compactly stacked above stage flag)
    const labels = ['IP', 'IIP', 'IIIP'];
    for (let i = 0; i < this.playerCount; i++) {
      const p = this.players[i];
      if (!p) continue;
      const py = 104 + i * 22;
      drawPixelText(ctx, labels[i], sx + 2, py, '#000000', 7.5);
      drawHudLifeIcon(ctx, sx, py + 8);
      drawPixelText(ctx, String(p.lives), sx + 9, py + 8, '#000000', 7.5);
    }

    // Stage flag & number
    const flagY = 180;
    drawHudFlagIcon(ctx, sx + 2, flagY);
    drawPixelText(ctx, String(this.stage), sx + 14, flagY + 12, '#000000', 8, 'right');
  }

  renderStageClear() {
    fillLogicalRect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000');

    drawPixelText(ctx, 'HI-SCORE', 54, 10, '#d84315', 8);
    drawPixelText(ctx, String(this.hiScore), 154, 10, '#f7d65a', 8);
    drawPixelText(ctx, `STAGE  ${this.stage}`, 128, 24, '#ffffff', 9, 'center');

    // Player headers (supports 1P, 2P, and 3P)
    const headerColors = ['#f7d65a', '#58f898', '#58c8ff'];
    const headerNames = ['1P', '2P', '3P'];
    const colXs = this.playerCount === 3
      ? [72, 152, 232]
      : this.playerCount === 2
        ? [88, 224]
        : [104];

    for (let i = 0; i < this.playerCount; i++) {
      const p = this.players[i];
      drawPixelText(ctx, `${headerNames[i]}-PLAYER`, colXs[i], 42, headerColors[i], 7.5, 'right');
      drawPixelText(ctx, String(p.score), colXs[i], 53, '#ffffff', 7.5, 'right');
    }

    // 4 enemy rows
    const types = [ENEMY_TYPE.BASIC, ENEMY_TYPE.FAST, ENEMY_TYPE.POWER, ENEMY_TYPE.ARMOR];
    types.forEach((type, idx) => {
      const y = 72 + idx * 24;
      const pts = ENEMY_STATS[type].points;
      const iconX = this.playerCount === 3 ? 8 : 120;
      drawEnemyTank(ctx, iconX, y - 3, DIR.UP, type, 1, false, 0, this.frame);

      if (idx <= this.tallyRow) {
        for (let i = 0; i < this.playerCount; i++) {
          const k = idx < this.tallyRow
            ? this.players[i].kills[type]
            : Math.min(this.tallyStep, this.players[i].kills[type]);
          drawPixelText(ctx, `${k}x${pts}`, colXs[i], y + 2, '#ffffff', 7, 'right');
        }
      }
    });

    // Divider + Total
    fillLogicalRect(ctx, 20, 170, 216, 2, '#ffffff');
    drawPixelText(ctx, 'TOTAL', 12, 176, '#ffffff', 8);
    if (this.tallyRow >= 4) {
      const totals = this.players.map((p) => p.kills.reduce((a, b) => a + b, 0));
      for (let i = 0; i < this.playerCount; i++) {
        drawPixelText(ctx, String(totals[i]), colXs[i], 176, headerColors[i], 8, 'right');
      }
      if (this.playerCount >= 2) {
        const maxTotal = Math.max(...totals);
        const winners = totals.map((t, i) => (t === maxTotal ? i : -1)).filter((i) => i >= 0);
        if (winners.length === 1 && maxTotal > 0) {
          const w = winners[0];
          drawPixelText(ctx, `${headerNames[w]} BONUS +1000 PTS`, 128, 196, headerColors[w], 8, 'center');
        }
      }
    }
  }

  renderGameOver() {
    fillLogicalRect(ctx, 0, 0, SCREEN_W, SCREEN_H, '#000000');

    drawPixelText(ctx, 'GAME', 128, 48, '#d82800', 26, 'center', '#500800');
    drawPixelText(ctx, 'OVER', 128, 78, '#d82800', 26, 'center', '#500800');

    const colors = ['#f7d65a', '#58f898', '#58c8ff'];
    for (let i = 0; i < this.playerCount; i++) {
      const p = this.players[i];
      drawPixelText(ctx, `${i + 1}P SCORE: ${p?.score || 0}`, 128, 122 + i * 13, colors[i], 8, 'center');
    }
    drawPixelText(ctx, `HI-SCORE: ${this.hiScore}`, 128, 168, '#ffffff', 8, 'center');
    drawPixelText(ctx, 'PRESS ENTER OR SPACE', 128, 196, '#a0a8b8', 7, 'center');
  }
}

const game = new BattleCityGame();

// Fixed-timestep 60fps loop
let lastTime = performance.now();
let accumulator = 0;
const STEP = 1000 / 60;

function loop(now) {
  const dt = Math.min(100, now - lastTime);
  lastTime = now;
  accumulator += dt;

  while (accumulator >= STEP) {
    game.update();
    accumulator -= STEP;
  }

  game.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
