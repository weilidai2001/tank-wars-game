import * as THREE from '../vendor/three.module.min.js';
import {
  SUB_GRID, CELL_SIZE, WORLD_SIZE, TILE, GAME_MODE, WALL_MAX_HP,
  WALL_HEIGHT_BRICK, WALL_HEIGHT_STEEL,
  CAMERA_PRESETS, TANK_RADIUS, BASE_TANK_HP, classifyArmorHit,
  TANK_MAX_SPEED, TANK_REVERSE_SPEED, TANK_ACCEL, TANK_DECEL, TANK_TURN_SPEED,
  AUTO_AIM_HALF_ANGLE, AUTO_AIM_MAX_RANGE, TURRET_SLEW_RATE,
  ENEMY_TYPE, ENEMY_STATS, POWERUP, POWERUP_INFO, BONUS_ENEMY_INDICES,
  BASE_WALL_SUBS, PLAYER_CONFIGS, COOP_PLAYER_SPAWNS, COOP_ENEMY_SPAWNS,
  VERSUS_SPAWNS, VERSUS_TARGET_FRAGS,
} from './constants.js';
import { ARENA_TEMPLATES, buildArena, macroToWorld, subToWorld, worldToSub } from './arenas.js';
import { createProceduralMaterials, Arena3D, createTankRig, Effects3D, createCrateMesh } from './assets3d.js';
import { computeViewports, HudRenderer } from './hud.js';
import { sound } from './audio.js';

// ============================================================================
// Math Helpers
// ============================================================================
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function applyDeadzone(val, deadzone = 0.16) {
  const mag = Math.abs(val);
  if (mag <= deadzone) return 0;
  return Math.sign(val) * Math.min(1, (mag - deadzone) / (1 - deadzone));
}

// ============================================================================
// Input Manager (4-Player Keyboard + Optional Gamepad API)
// ============================================================================
const keysDown = new Set();
const keysJustPressed = new Set();

const PREVENT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
]);

function isAnyDown(codes) {
  for (const code of codes) {
    if (keysDown.has(code)) return true;
  }
  return false;
}

function isAnyJustPressed(codes) {
  for (const code of codes) {
    if (keysJustPressed.has(code)) return true;
  }
  return false;
}

// ============================================================================
// Main 3D Split-Screen Tank Wars Engine
// ============================================================================
class TankWars3DGame {
  constructor() {
    this.glCanvas = document.getElementById('gl-canvas');
    this.hudCanvas = document.getElementById('hud-canvas');
    this.stageWrap = document.getElementById('stage-wrap');
    this.menuOverlay = document.getElementById('menu-overlay');

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.glCanvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    // 3D Scene & Lighting (low fog so players can see clearly all the way across the 91m arena!)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b132b);
    this.scene.fog = new THREE.FogExp2(0x162038, 0.0024);

    this.hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x1e293b, 1.05);
    this.hemiLight.position.set(WORLD_SIZE * 0.5, 45, WORLD_SIZE * 0.5);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.dirLight.position.set(WORLD_SIZE * 0.82, 58, WORLD_SIZE * 0.25);
    this.dirLight.target.position.set(WORLD_SIZE * 0.5, 0, WORLD_SIZE * 0.5);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.set(2048, 2048);
    const sHalf = WORLD_SIZE * 0.62;
    this.dirLight.shadow.camera.left = -sHalf;
    this.dirLight.shadow.camera.right = sHalf;
    this.dirLight.shadow.camera.top = sHalf;
    this.dirLight.shadow.camera.bottom = -sHalf;
    this.dirLight.shadow.camera.near = 8;
    this.dirLight.shadow.camera.far = 145;
    this.dirLight.shadow.bias = -0.0008;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    // Procedural 3D Materials, Arena & FX
    this.mats = createProceduralMaterials();
    this.arena3d = new Arena3D(this.scene, this.mats);
    this.effects = new Effects3D(this.scene);
    this.hud = new HudRenderer(this.hudCanvas);

    // Shared Shell Geometries
    this.shellGeo = new THREE.SphereGeometry(0.28, 10, 10);
    this.shellTrailGeo = new THREE.ConeGeometry(0.22, 1.25, 8);
    this.shellTrailGeo.rotateX(-Math.PI / 2);

    // Match Config & State
    this.state = 'MENU'; // MENU | STAGE_INTRO | PLAYING | STAGE_CLEAR | GAME_OVER
    this.paused = false;
    this.mode = GAME_MODE.COOP;
    this.playerCount = 2; // Default 2P split-screen!
    this.selectedStage = 1;
    this.versusBotCount = 2;

    this.cameraPresetIndex = 0; // 0 = Behind Tank (default)
    this.cameraPitchOffset = 0; // Adjustable with [ and ] keys
    this.gpsHeadingUp = true;   // Rotating Sat-Nav GPS by default!
    this.joystickOffset = 0;    // 0 => Joystick 1 controls 1P (+WASD); 1 => Joystick 1 controls 2P
    this._gpStartLatch = false;
    this._gpViewLatch = false;
    this._lastJoySignature = '';

    this.stage = 1;
    this.arenaTemplate = ARENA_TEMPLATES[0];
    this.grid = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(TILE.EMPTY));
    this.wallHp = Array.from({ length: SUB_GRID }, () => Array(SUB_GRID).fill(0));
    this.eagleAlive = true;
    this.fortifyTimer = 0;
    this.freezeTimer = 0;

    this.players = [];
    this.enemies = [];
    this.enemyQueue = [];
    this.enemySpawnTimer = 0;
    this.totalEnemiesSpawned = 0;
    this.shells = [];
    this.crates = [];
    this.popups = [];
    this.versusCrateTimer = 7.0;

    this.stateTimer = 0;
    this.victoryBanner = '';
    this.isVictory = false;
    this.elapsed = 0;
    this.cssW = 800;
    this.cssH = 600;
    this.dpr = 1;

    // Preview attract camera when on Title Menu
    this.attractCamera = new THREE.PerspectiveCamera(52, 16 / 9, 0.5, 220);

    this.bindEvents();
    this.handleResize();
    this.loadMenuPreviewArena();

    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ==========================================================================
  // UI & Event Wiring
  // ==========================================================================
  bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (PREVENT_KEYS.has(e.code)) {
        e.preventDefault();
      }
      if (!keysDown.has(e.code)) {
        keysJustPressed.add(e.code);
      }
      keysDown.add(e.code);

      if (e.code === 'KeyM') {
        this.toggleMute();
      } else if (e.code === 'KeyV') {
        this.cycleCameraPreset();
      } else if (e.code === 'BracketRight') {
        this.cameraPitchOffset = clamp(this.cameraPitchOffset + 2.2, -10, 18);
      } else if (e.code === 'BracketLeft') {
        this.cameraPitchOffset = clamp(this.cameraPitchOffset - 2.2, -10, 18);
      } else if (e.code === 'Tab') {
        this.toggleGpsMode();
      } else if (e.code === 'KeyP') {
        if (this.state === 'PLAYING') {
          this.paused = !this.paused;
          this.syncHeaderButtons();
        }
      } else if (e.code === 'Escape') {
        if (this.state !== 'MENU') {
          this.openMenu();
        }
      } else if (this.state === 'GAME_OVER' && (e.code === 'Enter' || e.code === 'Space')) {
        this.startMatch();
      }
    });

    window.addEventListener('keyup', (e) => {
      keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      keysDown.clear();
    });

    const ro = new ResizeObserver(() => this.handleResize());
    ro.observe(this.stageWrap);
    window.addEventListener('resize', () => this.handleResize());

    // Top Header Toolbar Buttons
    document.getElementById('btn-joystick').addEventListener('click', (e) => {
      this.joystickOffset = this.joystickOffset === 0 ? 1 : 0;
      this._lastJoySignature = '';
      this.syncMenuUI();
      this.pollGlobalGamepadUI();
      e.currentTarget.blur();
    });
    document.getElementById('btn-camera').addEventListener('click', (e) => {
      this.cycleCameraPreset();
      e.currentTarget.blur();
    });
    document.getElementById('btn-gps').addEventListener('click', (e) => {
      this.toggleGpsMode();
      e.currentTarget.blur();
    });
    document.getElementById('btn-mute').addEventListener('click', (e) => {
      this.toggleMute();
      e.currentTarget.blur();
    });
    document.getElementById('btn-pause').addEventListener('click', (e) => {
      if (this.state === 'PLAYING') {
        this.paused = !this.paused;
        this.syncHeaderButtons();
      }
      e.currentTarget.blur();
    });
    document.getElementById('btn-menu').addEventListener('click', (e) => {
      this.openMenu();
      e.currentTarget.blur();
    });

    // Menu Option Pills
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode;
        if (this.mode === GAME_MODE.VERSUS && this.playerCount === 1 && this.versusBotCount === 0) {
          this.versusBotCount = 3;
        }
        this.syncMenuUI();
        this.loadMenuPreviewArena();
      });
    });

    document.querySelectorAll('[data-players]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.playerCount = parseInt(btn.dataset.players, 10);
        if (this.mode === GAME_MODE.VERSUS && this.playerCount === 1 && this.versusBotCount === 0) {
          this.versusBotCount = 3;
        }
        this.syncMenuUI();
      });
    });

    document.querySelectorAll('[data-bots]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.versusBotCount = parseInt(btn.dataset.bots, 10);
        if (this.mode === GAME_MODE.VERSUS && this.playerCount === 1 && this.versusBotCount === 0) {
          this.versusBotCount = 2;
        }
        this.syncMenuUI();
      });
    });

    document.querySelectorAll('[data-joy-offset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.joystickOffset = parseInt(btn.dataset.joyOffset, 10) || 0;
        this._lastJoySignature = '';
        this.syncMenuUI();
        this.pollGlobalGamepadUI();
      });
    });

    window.addEventListener('gamepadconnected', () => {
      this._lastJoySignature = '';
      this.pollGlobalGamepadUI();
    });
    window.addEventListener('gamepaddisconnected', () => {
      this._lastJoySignature = '';
      this.pollGlobalGamepadUI();
    });

    const stageSelect = document.getElementById('stage-select');
    stageSelect.innerHTML = ARENA_TEMPLATES.map(
      (a) => `<option value="${a.id}">Arena ${a.id}: ${a.name}</option>`
    ).join('');
    stageSelect.addEventListener('change', () => {
      this.selectedStage = parseInt(stageSelect.value, 10);
      this.loadMenuPreviewArena();
    });

    document.getElementById('btn-launch').addEventListener('click', () => {
      this.startMatch();
    });

    this.syncMenuUI();
    this.syncHeaderButtons();
  }

  syncMenuUI() {
    document.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === this.mode);
    });
    document.querySelectorAll('[data-players]').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.players, 10) === this.playerCount);
    });
    document.querySelectorAll('[data-bots]').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.bots, 10) === this.versusBotCount);
    });
    document.querySelectorAll('[data-joy-offset]').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.joyOffset, 10) === this.joystickOffset);
    });
    const botRow = document.getElementById('versus-bots-row');
    botRow.hidden = this.mode !== GAME_MODE.VERSUS;
    document.getElementById('stage-select').value = String(this.selectedStage);
  }

  syncHeaderButtons() {
    const preset = CAMERA_PRESETS[this.cameraPresetIndex];
    document.getElementById('btn-camera').textContent = `🎥 ${preset.name} (V)`;
    document.getElementById('btn-gps').textContent = this.gpsHeadingUp
      ? '🧭 GPS: Heading-Up (Tab)'
      : '🧭 GPS: North-Up (Tab)';
    document.getElementById('btn-mute').textContent = sound.muted ? '🔇 Muted (M)' : '🔊 Sound (M)';
    document.getElementById('btn-pause').textContent = this.paused ? '▶ Resume (P)' : '⏸ Pause (P)';
  }

  toggleMute() {
    sound.toggleMute();
    this.syncHeaderButtons();
  }

  cycleCameraPreset() {
    this.cameraPresetIndex = (this.cameraPresetIndex + 1) % CAMERA_PRESETS.length;
    const preset = CAMERA_PRESETS[this.cameraPresetIndex];
    for (const p of this.players) {
      p.camera.fov = preset.fov;
      p.camera.updateProjectionMatrix();
    }
    this.syncHeaderButtons();
  }

  toggleGpsMode() {
    this.gpsHeadingUp = !this.gpsHeadingUp;
    this.syncHeaderButtons();
  }

  openMenu() {
    this.state = 'MENU';
    this.paused = false;
    this.menuOverlay.hidden = false;
    this.syncHeaderButtons();
    this.loadMenuPreviewArena();
  }

  handleResize() {
    const rect = this.stageWrap.getBoundingClientRect();
    this.cssW = Math.max(320, Math.floor(rect.width));
    this.cssH = Math.max(240, Math.floor(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.cssW, this.cssH, false);

    this.hudCanvas.width = Math.round(this.cssW * this.dpr);
    this.hudCanvas.height = Math.round(this.cssH * this.dpr);
  }

  // ==========================================================================
  // Match & Stage Initialization
  // ==========================================================================
  clearEntities() {
    for (const p of this.players) {
      this.scene.remove(p.rig.root);
    }
    for (const e of this.enemies) {
      this.scene.remove(e.rig.root);
    }
    for (const s of this.shells) {
      this.scene.remove(s.mesh);
      s.mat.dispose();
    }
    for (const c of this.crates) {
      this.scene.remove(c.rig.group);
      c.rig.coreMat.dispose();
      c.rig.frameMat.dispose();
    }
    this.players.length = 0;
    this.enemies.length = 0;
    this.shells.length = 0;
    this.crates.length = 0;
    this.popups.length = 0;
    this.effects.clear();
  }

  applyAtmosphere(template) {
    this.scene.background.setHex(template.skyTop);
    this.scene.fog.color.setHex(template.fogColor);
  }

  initWallHpFromGrid() {
    this.wallHp = Array.from({ length: SUB_GRID }, (_, r) =>
      Array.from({ length: SUB_GRID }, (__, c) => {
        const t = this.grid[r][c];
        return t === TILE.BRICK || t === TILE.STEEL ? WALL_MAX_HP : 0;
      })
    );
  }

  loadMenuPreviewArena() {
    this.clearEntities();
    const built = buildArena(this.selectedStage, this.mode);
    this.arenaTemplate = built.template;
    this.grid = built.grid;
    this.initWallHpFromGrid();
    this.applyAtmosphere(built.template);
    this.arena3d.build(this.grid, built.template, this.mode === GAME_MODE.COOP);
  }

  startMatch() {
    sound.ensure();
    this.menuOverlay.hidden = true;
    this.paused = false;
    this.stage = this.selectedStage;
    this.isVictory = false;
    this.victoryBanner = '';
    this.syncHeaderButtons();

    this.clearEntities();

    // Create Split-Screen Players (1 to 4)
    const preset = CAMERA_PRESETS[this.cameraPresetIndex];
    for (let i = 0; i < this.playerCount; i++) {
      const cfg = PLAYER_CONFIGS[i];
      const rig = createTankRig(this.mats, {
        hullColor: cfg.colorHex,
        turretColor: cfg.turretHex,
        scale: 1.0,
        isPlayer: true,
      });
      this.scene.add(rig.root);

      const cam = new THREE.PerspectiveCamera(preset.fov, 16 / 9, 0.4, 210);
      this.players.push({
        isPlayer: true,
        id: `P${i + 1}`,
        index: i,
        tag: cfg.tag,
        label: cfg.tag,
        cssColor: cfg.cssColor,
        colorHex: cfg.colorHex,
        keys: cfg.keys,
        camera: cam,
        camPos: new THREE.Vector3(),
        camLook: new THREE.Vector3(),
        camInitialized: false,
        rig,
        x: WORLD_SIZE * 0.5,
        z: WORLD_SIZE * 0.8,
        yaw: 0,
        speed: 0,
        pitch: 0,
        turretOffset: 0,
        recoil: 0,
        muzzleTimer: 0,
        hp: BASE_TANK_HP,
        maxHp: BASE_TANK_HP,
        armor: 0,
        lives: 5,
        score: 0,
        frags: 0,
        weaponTier: 0,
        reloadTimer: 0,
        shieldTimer: 0,
        rapidTimer: 0,
        hasHover: false,
        carriedTile: TILE.EMPTY,
        lockedTarget: null,
        lockedDist: 0,
        obstructedTarget: null,
        hitFlash: 0,
        shake: 0,
        alive: true,
        eliminated: false,
        respawnTimer: 0,
      });
    }

    this.loadStage(this.stage, true);
  }

  loadStage(stageNum, isFreshMatch = false) {
    // Clear active enemies, shells, crates
    for (const e of this.enemies) this.scene.remove(e.rig.root);
    for (const s of this.shells) {
      this.scene.remove(s.mesh);
      s.mat.dispose();
    }
    for (const c of this.crates) {
      this.scene.remove(c.rig.group);
      c.rig.coreMat.dispose();
      c.rig.frameMat.dispose();
    }
    this.enemies.length = 0;
    this.shells.length = 0;
    this.crates.length = 0;
    this.popups.length = 0;
    this.effects.clear();

    this.stage = stageNum;
    const built = buildArena(stageNum, this.mode);
    this.arenaTemplate = built.template;
    this.grid = built.grid;
    this.initWallHpFromGrid();
    this.enemyQueue = built.enemies.slice();
    this.totalEnemiesSpawned = 0;
    this.enemySpawnTimer = 0.8;
    this.eagleAlive = true;
    this.fortifyTimer = 0;
    this.freezeTimer = 0;
    this.versusCrateTimer = 6.0;

    this.applyAtmosphere(built.template);
    this.arena3d.build(this.grid, built.template, this.mode === GAME_MODE.COOP);

    // Position players at mode spawn pads
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (isFreshMatch) {
        p.lives = 5;
        p.score = 0;
        p.frags = 0;
        p.weaponTier = 0;
        p.armor = 0;
        p.hasHover = false;
        p.carriedTile = TILE.EMPTY;
        p.eliminated = false;
      }
      if (!p.eliminated) {
        this.spawnPlayerAtPad(p, i, true);
      }
    }

    // In Versus mode, spawn configured AI Rival Bots immediately!
    if (this.mode === GAME_MODE.VERSUS) {
      const botTypes = [
        ENEMY_TYPE.STRIKER,
        ENEMY_TYPE.INTERCEPTOR,
        ENEMY_TYPE.GOLIATH,
        ENEMY_TYPE.SCOUT,
      ];
      for (let b = 0; b < this.versusBotCount; b++) {
        const spIdx = (this.players.length + b) % VERSUS_SPAWNS.length;
        const sp = VERSUS_SPAWNS[spIdx];
        const pos = macroToWorld(sp.tx, sp.ty);
        this.spawnEnemyEntity(botTypes[b % botTypes.length], pos.x, pos.z, sp.yaw, false, `BOT-${b + 1}`);
      }
    }

    this.state = 'STAGE_INTRO';
    this.stateTimer = 1.9;
    sound.playStageStart();
  }

  spawnPlayerAtPad(p, padIndex, snapCamera = false) {
    let sp;
    if (this.mode === GAME_MODE.COOP) {
      sp = COOP_PLAYER_SPAWNS[padIndex % COOP_PLAYER_SPAWNS.length];
    } else {
      sp = this.pickFarthestVersusSpawn(p);
    }
    const pos = macroToWorld(sp.tx, sp.ty);
    p.x = pos.x;
    p.z = pos.z;
    p.yaw = sp.yaw;
    p.speed = 0;
    p.pitch = 0;
    p.turretOffset = 0;
    p.hp = p.maxHp;
    p.shieldTimer = 3.5;
    p.reloadTimer = 0;
    p.lockedTarget = null;
    p.obstructedTarget = null;
    p.alive = true;
    p.respawnTimer = 0;
    p.rig.root.visible = true;
    this.syncTankRigVisuals(p, 0);
    if (snapCamera) {
      p.camInitialized = false;
    }
    this.updatePlayerCamera(p, 0.016);
  }

  pickFarthestVersusSpawn(excludeEntity) {
    let best = VERSUS_SPAWNS[0];
    let bestMinDist = -1;
    for (const sp of VERSUS_SPAWNS) {
      const pos = macroToWorld(sp.tx, sp.ty);
      let minDist = 9999;
      for (const pl of this.players) {
        if (pl !== excludeEntity && pl.alive) {
          minDist = Math.min(minDist, Math.hypot(pl.x - pos.x, pl.z - pos.z));
        }
      }
      for (const en of this.enemies) {
        if (en !== excludeEntity && en.alive) {
          minDist = Math.min(minDist, Math.hypot(en.x - pos.x, en.z - pos.z));
        }
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        best = sp;
      }
    }
    return best;
  }

  spawnEnemyEntity(type, x, z, yaw, isBonus = false, customLabel = null) {
    const stats = ENEMY_STATS[type] || ENEMY_STATS[ENEMY_TYPE.SCOUT];
    const rig = createTankRig(this.mats, {
      hullColor: isBonus ? 0xe11d48 : stats.color,
      turretColor: isBonus ? 0xfda4af : stats.accent,
      scale: stats.scale,
      isPlayer: false,
    });
    this.scene.add(rig.root);

    const enemy = {
      isPlayer: false,
      id: customLabel || `E${++this.totalEnemiesSpawned}`,
      label: customLabel || stats.name,
      type,
      stats,
      isBonus,
      rig,
      x,
      z,
      yaw,
      speed: 0,
      pitch: 0,
      turretOffset: 0,
      recoil: 0,
      muzzleTimer: 0,
      hp: stats.hp,
      maxHp: stats.hp,
      armor: 0,
      points: stats.points,
      frags: 0,
      weaponTier: type === ENEMY_TYPE.STRIKER ? 2 : 0,
      reloadTimer: 0.6 + Math.random() * 0.6,
      shieldTimer: this.mode === GAME_MODE.VERSUS ? 2.0 : 0,
      rapidTimer: 0,
      hasHover: false,
      carriedTile: TILE.EMPTY,
      lockedTarget: null,
      lockedDist: 0,
      obstructedTarget: null,
      aiTurnTimer: 0.5 + Math.random() * 1.2,
      aiGoalYaw: yaw,
      stuckTimer: 0,
      alive: true,
      respawnTimer: 0,
    };
    this.syncTankRigVisuals(enemy, 0);
    this.enemies.push(enemy);
    this.effects.spawnExplosion(x, 1.0, z, 0x38bdf8, 8, false);
    return enemy;
  }

  enemiesRemainingCount() {
    let activeAlive = 0;
    for (const e of this.enemies) {
      if (e.alive) activeAlive++;
    }
    return this.enemyQueue.length + activeAlive;
  }

  // ==========================================================================
  // Main Loop
  // ==========================================================================
  loop(now) {
    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    this.pollGlobalGamepadUI();

    if (!this.paused) {
      this.elapsed += dt;
      this.update(dt);
    }

    this.render();
    keysJustPressed.clear();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.arena3d.update(dt, this.elapsed);
    this.effects.update(dt);

    if (this.state === 'MENU') {
      return;
    }

    // Update popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].life += dt;
      this.popups[i].y += 2.2 * dt;
      if (this.popups[i].life >= this.popups[i].maxLife) {
        this.popups.splice(i, 1);
      }
    }

    if (this.state === 'STAGE_INTRO') {
      this.stateTimer -= dt;
      for (const p of this.players) {
        this.syncTankRigVisuals(p, dt);
        this.updatePlayerCamera(p, dt);
      }
      if (this.stateTimer <= 0) {
        this.state = 'PLAYING';
      }
      return;
    }

    if (this.state === 'STAGE_CLEAR') {
      this.stateTimer -= dt;
      for (const p of this.players) {
        this.updatePlayerCamera(p, dt);
      }
      if (this.stateTimer <= 0) {
        this.loadStage(this.stage + 1, false);
      }
      return;
    }

    if (this.state === 'GAME_OVER') {
      for (const p of this.players) {
        this.updatePlayerCamera(p, dt);
      }
      return;
    }

    // ========================================================================
    // PLAYING State Update
    // ========================================================================
    if (this.freezeTimer > 0) {
      this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    }
    if (this.fortifyTimer > 0) {
      this.fortifyTimer -= dt;
      if (this.fortifyTimer <= 0 && this.mode === GAME_MODE.COOP && this.stage > 8) {
        this.setBaseWalls(TILE.BRICK);
      }
    }

    // Spawn Co-op Wave Enemies or Periodic Versus Supply Crates
    if (this.mode === GAME_MODE.COOP) {
      const maxSimultaneous = 3 + this.playerCount;
      let activeCount = 0;
      for (const e of this.enemies) if (e.alive) activeCount++;

      if (this.enemyQueue.length > 0 && activeCount < maxSimultaneous) {
        this.enemySpawnTimer -= dt;
        if (this.enemySpawnTimer <= 0) {
          const sp = COOP_ENEMY_SPAWNS[this.totalEnemiesSpawned % COOP_ENEMY_SPAWNS.length];
          const pos = macroToWorld(sp.tx, sp.ty);
          if (!this.isPointOccupiedByTank(pos.x, pos.z, TANK_RADIUS * 1.4)) {
            const nextIdx = this.totalEnemiesSpawned;
            const type = this.enemyQueue.shift();
            const isBonus = BONUS_ENEMY_INDICES.has(nextIdx);
            this.spawnEnemyEntity(type, pos.x, pos.z, sp.yaw, isBonus);
            this.enemySpawnTimer = Math.max(1.6, 3.4 - this.playerCount * 0.35);
          } else {
            this.enemySpawnTimer = 0.5;
          }
        }
      }
    } else {
      // Versus Deathmatch: periodic supply crate drops & bot respawns
      this.versusCrateTimer -= dt;
      if (this.versusCrateTimer <= 0 && this.crates.length < 3) {
        this.spawnRandomCrate();
        this.versusCrateTimer = 9.5;
      }
    }

    // Update Players
    for (const p of this.players) {
      this.updatePlayer(p, dt);
    }

    // Update Enemy AI / Versus Bots
    for (const e of this.enemies) {
      this.updateEnemy(e, dt);
    }

    // Update Shells
    this.updateShells(dt);

    // Update Supply Crates
    this.updateCrates(dt);

    // Check Win / Loss Conditions
    this.checkMatchOutcomes(dt);
  }

  // ==========================================================================
  // Player Controls, Physics, Auto-Aim Cone & Camera
  // ==========================================================================
  // ==========================================================================
  // Browser Joystick / Gamepad Discovery, Haptics & Player Input
  // ==========================================================================
  getConnectedGamepads() {
    if (!navigator.getGamepads) return [];
    const raw = navigator.getGamepads();
    const list = [];
    if (!raw) return list;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].connected) list.push(raw[i]);
    }
    return list;
  }

  getGamepadForPlayer(playerIndex) {
    const pads = this.getConnectedGamepads();
    const padSlot = playerIndex - this.joystickOffset;
    if (padSlot < 0 || padSlot >= pads.length) return null;
    return pads[padSlot];
  }

  triggerGamepadRumble(player, durationMs = 75, strong = 0.45, weak = 0.25) {
    if (!player || !player.isPlayer) return;
    const gp = this.getGamepadForPlayer(player.index);
    const actuator = gp && gp.vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      actuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: weak,
        strongMagnitude: strong,
      }).catch(() => {});
    }
  }

  pollGlobalGamepadUI() {
    const pads = this.getConnectedGamepads();
    const targetTag = this.joystickOffset === 0 ? '1P' : '2P';
    const sig = `${pads.length}:${pads.map((g) => g.id).join('|')}:${targetTag}`;
    if (sig === this._lastJoySignature) {
      // Still check Start/View global buttons on primary pad!
    } else {
      this._lastJoySignature = sig;
      const btnJoy = document.getElementById('btn-joystick');
      const menuHint = document.getElementById('menu-joy-status');
      if (btnJoy) {
        if (pads.length > 0) {
          btnJoy.textContent = `🎮 ${pads.length}x Pad → ${targetTag}`;
          btnJoy.classList.add('connected');
          btnJoy.title = `Connected: ${pads.map((p) => p.id).join(', ')} (Click to switch 1P/2P)`;
        } else {
          btnJoy.textContent = '🎮 Joystick: Press Button';
          btnJoy.classList.remove('connected');
        }
      }
      if (menuHint) {
        if (pads.length > 0) {
          const shortName = (pads[0].id || 'Controller').slice(0, 42);
          menuHint.textContent = `Connected: ${shortName} (${pads.length} active — mapped starting at ${targetTag}. Press Start or Fire to deploy!)`;
          menuHint.classList.add('connected');
        } else {
          menuHint.textContent = 'Plug in any USB/Bluetooth joystick or gamepad & press a button to wake it.';
          menuHint.classList.remove('connected');
        }
      }
    }

    if (pads.length > 0) {
      const p0 = pads[0];
      const startPressed = Boolean(p0.buttons[9]?.pressed);
      if (startPressed && !this._gpStartLatch) {
        this._gpStartLatch = true;
        if (this.state === 'MENU' || this.state === 'GAME_OVER') {
          this.startMatch();
        } else if (this.state === 'PLAYING') {
          this.paused = !this.paused;
          this.syncHeaderButtons();
        }
      } else if (!startPressed) {
        this._gpStartLatch = false;
      }

      const viewPressed = Boolean(p0.buttons[8]?.pressed || p0.buttons[11]?.pressed);
      if (viewPressed && !this._gpViewLatch) {
        this._gpViewLatch = true;
        this.cycleCameraPreset();
      } else if (!viewPressed) {
        this._gpViewLatch = false;
      }
    }
  }

  readPlayerInput(p) {
    let throttle = 0;
    let turn = 0;
    let fire = false;
    let action = false;

    if (isAnyDown(p.keys.forward)) throttle += 1;
    if (isAnyDown(p.keys.backward)) throttle -= 1;
    if (isAnyDown(p.keys.left)) turn += 1;  // +yaw = Left!
    if (isAnyDown(p.keys.right)) turn -= 1; // -yaw = Right!
    if (isAnyDown(p.keys.fire)) fire = true;
    if (isAnyJustPressed(p.keys.action)) action = true;

    // Universal Browser Joystick / Gamepad / Flight-Stick support!
    const gp = this.getGamepadForPlayer(p.index);
    if (gp) {
      // Analog stick X (axes[0]) and Y (axes[1]) with smooth deadzone rescaling
      const stickX = applyDeadzone(gp.axes[0] || 0, 0.16);
      const stickY = applyDeadzone(gp.axes[1] || 0, 0.16);
      if (stickY !== 0) throttle = clamp(-stickY, -1, 1);
      if (stickX !== 0) turn = clamp(-stickX, -1, 1);

      // Standard Gamepad D-Pad (buttons 12..15)
      if (gp.buttons[12]?.pressed) throttle = 1;
      if (gp.buttons[13]?.pressed) throttle = -1;
      if (gp.buttons[14]?.pressed) turn = 1;
      if (gp.buttons[15]?.pressed) turn = -1;

      // USB Flight-Stick 8-way POV Hat Switch (commonly exposed on axes[9])
      if (typeof gp.axes[9] === 'number' && Math.abs(gp.axes[9]) <= 1.05) {
        const hat = gp.axes[9];
        // Neutral hat on HID flight sticks is > 1.1 (e.g., 1.2857 or 3.2857); active is [-1..+1]
        if (hat >= -1.05 && hat <= 1.05) {
          const angle = ((hat + 1) * 0.875) * Math.PI; // 0 = Up, PI/2 = Right, PI = Down, 3PI/2 = Left
          const hx = Math.sin(angle);
          const hy = Math.cos(angle);
          if (Math.abs(hy) > 0.35) throttle = Math.sign(hy);
          if (Math.abs(hx) > 0.35) turn = -Math.sign(hx);
        }
      }

      // Fire Cannon: Trigger / A / Cross (0), X / Square (2), RB / R1 (5), RT / R2 (7)
      if (
        gp.buttons[0]?.pressed ||
        gp.buttons[2]?.pressed ||
        gp.buttons[5]?.pressed ||
        (gp.buttons[7] && (gp.buttons[7].pressed || gp.buttons[7].value > 0.45))
      ) {
        fire = true;
      }

      // Tractor-Beam Wall Grab/Drop: B / Circle (1), Y / Triangle (3), LB / L1 (4), LT / L2 (6)
      const grabPressed = Boolean(
        gp.buttons[1]?.pressed ||
        gp.buttons[3]?.pressed ||
        gp.buttons[4]?.pressed ||
        (gp.buttons[6] && (gp.buttons[6].pressed || gp.buttons[6].value > 0.55))
      );
      if (grabPressed) {
        if (!p._gpActionLatch) {
          action = true;
          p._gpActionLatch = true;
        }
      } else {
        p._gpActionLatch = false;
      }
    }

    return { throttle: clamp(throttle, -1, 1), turn: clamp(turn, -1, 1), fire, action };
  }

  updatePlayer(p, dt) {
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt * 2.4);
    if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 3.5);

    if (!p.alive) {
      if (!p.eliminated) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          this.spawnPlayerAtPad(p, p.index, false);
        }
      }
      this.updatePlayerCamera(p, dt);
      return;
    }

    if (p.shieldTimer > 0) p.shieldTimer = Math.max(0, p.shieldTimer - dt);
    if (p.rapidTimer > 0) p.rapidTimer = Math.max(0, p.rapidTimer - dt);
    if (p.reloadTimer > 0) p.reloadTimer = Math.max(0, p.reloadTimer - dt);

    const input = this.readPlayerInput(p);

    // Steering & Acceleration (invert Left/Right steering when reversing, like a real vehicle!)
    const onIce = this.getTileAtWorld(p.x, p.z) === TILE.ICE;
    const turnMul = p.weaponTier >= 1 ? 1.06 : 1.0;
    const isReversing = input.throttle < 0 || (input.throttle === 0 && p.speed < -0.4);
    const steerDir = isReversing ? -input.turn : input.turn;
    p.yaw = wrapAngle(p.yaw + steerDir * TANK_TURN_SPEED * turnMul * dt);

    const maxFwd = TANK_MAX_SPEED * (p.rapidTimer > 0 ? 1.12 : 1.0);
    const accel = onIce ? TANK_ACCEL * 0.55 : TANK_ACCEL;
    const decel = onIce ? TANK_DECEL * 0.28 : TANK_DECEL;

    if (input.throttle > 0) {
      p.speed = Math.min(maxFwd, p.speed + accel * input.throttle * dt);
      p.pitch = THREE.MathUtils.lerp(p.pitch, 0.045, 10 * dt);
    } else if (input.throttle < 0) {
      p.speed = Math.max(-TANK_REVERSE_SPEED, p.speed + accel * input.throttle * dt);
      p.pitch = THREE.MathUtils.lerp(p.pitch, -0.045, 10 * dt);
    } else {
      if (p.speed > 0) p.speed = Math.max(0, p.speed - decel * dt);
      else if (p.speed < 0) p.speed = Math.min(0, p.speed + decel * dt);
      p.pitch = THREE.MathUtils.lerp(p.pitch, 0, 8 * dt);
    }

    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    this.moveTankWithCollision(p, p.x + fx * p.speed * dt, p.z + fz * p.speed * dt);

    // Scroll caterpillar tread UVs accurately with left/right differential velocity!
    const leftVel = p.speed - steerDir * 4.5;
    const rightVel = p.speed + steerDir * 4.5;
    p.rig.leftTreadTex.offset.y = (p.rig.leftTreadTex.offset.y + leftVel * dt * 0.35) % 1;
    p.rig.rightTreadTex.offset.y = (p.rig.rightTreadTex.offset.y + rightVel * dt * 0.35) % 1;

    // Forward-Constrained Auto-Aim Turret Lock-On!
    const prevLock = p.lockedTarget;
    this.updateAutoAimTurret(p, dt);
    if (p.lockedTarget && p.lockedTarget !== prevLock) {
      sound.playLockOn();
    }

    // Fire Cannon
    if (input.fire && p.reloadTimer <= 0) {
      this.fireTankCannon(p);
    }

    // Tractor-Beam Wall Grab / Drop
    if (input.action) {
      this.handleWallGrabDrop(p);
    }

    this.syncTankRigVisuals(p, dt);
    this.updatePlayerCamera(p, dt);
  }

  // ==========================================================================
  // Forward-Constrained Auto-Aim System (+/-28 deg Front Cone + Wall LOS Check)
  // ==========================================================================
  getValidTargetsFor(shooter) {
    const targets = [];
    if (this.mode === GAME_MODE.COOP) {
      if (shooter.isPlayer) {
        for (const e of this.enemies) if (e.alive) targets.push(e);
      } else {
        for (const p of this.players) if (p.alive) targets.push(p);
      }
    } else {
      // Versus Free-for-All: all other living players and bots are valid targets!
      for (const p of this.players) {
        if (p !== shooter && p.alive) targets.push(p);
      }
      for (const e of this.enemies) {
        if (e !== shooter && e.alive) targets.push(e);
      }
    }
    return targets;
  }

  hasClearLineOfSight(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;
    const steps = Math.ceil(dist / 0.85);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = x1 + dx * t;
      const sz = z1 + dz * t;
      const tile = this.getTileAtWorld(sx, sz);
      // Brick and Steel walls block line-of-sight!
      if (tile === TILE.BRICK || tile === TILE.STEEL) {
        return false;
      }
    }
    return true;
  }

  updateAutoAimTurret(tank, dt) {
    const candidates = this.getValidTargetsFor(tank);
    let bestClear = null;
    let bestClearDist = Infinity;
    let bestBlocked = null;
    let bestBlockedDist = Infinity;

    for (const target of candidates) {
      const dx = target.x - tank.x;
      const dz = target.z - tank.z;
      const dist = Math.hypot(dx, dz);
      if (dist > AUTO_AIM_MAX_RANGE || dist < 0.2) continue;

      const desiredWorldYaw = Math.atan2(-dx, -dz);
      const relAngle = wrapAngle(desiredWorldYaw - tank.yaw);

      // Must be within forward +/-28 deg cone ("roughly in the same direction")!
      if (Math.abs(relAngle) <= AUTO_AIM_HALF_ANGLE) {
        if (this.hasClearLineOfSight(tank.x, tank.z, target.x, target.z)) {
          if (dist < bestClearDist) {
            bestClearDist = dist;
            bestClear = target;
          }
        } else if (dist < bestBlockedDist) {
          bestBlockedDist = dist;
          bestBlocked = target;
        }
      }
    }

    tank.lockedTarget = bestClear;
    tank.lockedDist = bestClear ? bestClearDist : 0;
    tank.obstructedTarget = bestClear ? null : bestBlocked;

    let desiredOffset = 0;
    if (bestClear) {
      // Subtle velocity lead prediction for moving targets!
      const tFx = -Math.sin(bestClear.yaw);
      const tFz = -Math.cos(bestClear.yaw);
      const shellSpeed = this.getShellSpeed(tank);
      const leadTime = Math.min(0.45, (bestClearDist / shellSpeed) * 0.55);
      const aimX = bestClear.x + tFx * (bestClear.speed || 0) * leadTime;
      const aimZ = bestClear.z + tFz * (bestClear.speed || 0) * leadTime;
      const aimYaw = Math.atan2(-(aimX - tank.x), -(aimZ - tank.z));
      desiredOffset = clamp(
        wrapAngle(aimYaw - tank.yaw),
        -AUTO_AIM_HALF_ANGLE,
        AUTO_AIM_HALF_ANGLE
      );
    }

    // Smoothly slew turret within forward cone; return to dead-ahead (0) when unlocked
    const delta = desiredOffset - tank.turretOffset;
    const maxStep = TURRET_SLEW_RATE * dt;
    if (Math.abs(delta) <= maxStep) {
      tank.turretOffset = desiredOffset;
    } else {
      tank.turretOffset += Math.sign(delta) * maxStep;
    }
    tank.turretOffset = clamp(tank.turretOffset, -AUTO_AIM_HALF_ANGLE, AUTO_AIM_HALF_ANGLE);
  }

  // ==========================================================================
  // Behind-the-Tank Camera with Smart Anti-Wall-Clipping
  // ==========================================================================
  updatePlayerCamera(p, dt) {
    const preset = CAMERA_PRESETS[this.cameraPresetIndex];
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);

    const anchorX = p.x;
    const anchorY = 2.45;
    const anchorZ = p.z;

    const idealX = p.x - fx * preset.distBack;
    const idealY = preset.height;
    const idealZ = p.z - fz * preset.distBack;

    // Raycast backward from tank turret to camera so walls never block your view!
    let safeT = 1.0;
    const samples = 14;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const sx = anchorX + (idealX - anchorX) * t;
      const sy = anchorY + (idealY - anchorY) * t;
      const sz = anchorZ + (idealZ - anchorZ) * t;

      const outOfBounds = sx < -3.8 || sx > WORLD_SIZE + 3.8 || sz < -3.8 || sz > WORLD_SIZE + 3.8;
      const inArena = sx >= 0 && sx <= WORLD_SIZE && sz >= 0 && sz <= WORLD_SIZE;
      let hitsWall = false;
      if (inArena) {
        const { c, r } = worldToSub(sx, sz);
        if (c >= 0 && c < SUB_GRID && r >= 0 && r < SUB_GRID) {
          const tile = this.grid[r][c];
          if (tile === TILE.BRICK || tile === TILE.STEEL) {
            const hpFrac = (this.wallHp[r][c] || WALL_MAX_HP) / WALL_MAX_HP;
            const fullH = tile === TILE.STEEL ? WALL_HEIGHT_STEEL : WALL_HEIGHT_BRICK;
            hitsWall = sy < fullH * hpFrac + 0.35;
          }
        }
      }
      if (outOfBounds || hitsWall) {
        safeT = Math.max(0.2, (i - 1) / samples - 0.04);
        break;
      }
    }

    const targetCamX = anchorX + (idealX - anchorX) * safeT;
    const targetCamY = anchorY + (idealY - anchorY) * safeT;
    const targetCamZ = anchorZ + (idealZ - anchorZ) * safeT;

    // Aim camera far down-range & pitched up so the viewer sees all the way down the battlefield
    const lookYaw = p.yaw + p.turretOffset * 0.25;
    const lfx = -Math.sin(lookYaw);
    const lfz = -Math.cos(lookYaw);
    const targetLookX = p.x + lfx * preset.lookAhead;
    const targetLookY = preset.lookHeight + this.cameraPitchOffset;
    const targetLookZ = p.z + lfz * preset.lookAhead;

    if (!p.camInitialized) {
      p.camPos.set(targetCamX, targetCamY, targetCamZ);
      p.camLook.set(targetLookX, targetLookY, targetLookZ);
      p.camInitialized = true;
    } else {
      const k = 1 - Math.exp(-16 * dt);
      p.camPos.x += (targetCamX - p.camPos.x) * k;
      p.camPos.y += (targetCamY - p.camPos.y) * k;
      p.camPos.z += (targetCamZ - p.camPos.z) * k;

      p.camLook.x += (targetLookX - p.camLook.x) * k;
      p.camLook.y += (targetLookY - p.camLook.y) * k;
      p.camLook.z += (targetLookZ - p.camLook.z) * k;
    }

    const shakeMag = p.shake * 0.22;
    const sx = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;
    const sy = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;

    p.camera.position.set(p.camPos.x + sx, p.camPos.y + sy, p.camPos.z);
    p.camera.lookAt(p.camLook);
  }

  // ==========================================================================
  // Collision Detection & Movement
  // ==========================================================================
  getTileAtWorld(x, z) {
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(z / CELL_SIZE);
    if (c < 0 || c >= SUB_GRID || r < 0 || r >= SUB_GRID) return TILE.STEEL;
    return this.grid[r][c];
  }

  isBlockingTankTile(tile, hasHover) {
    if (tile === TILE.BRICK || tile === TILE.STEEL || tile === TILE.EAGLE || tile === TILE.EAGLE_DEAD) {
      return true;
    }
    if (tile === TILE.WATER && !hasHover) {
      return true;
    }
    return false;
  }

  isPointOccupiedByTank(x, z, radius, ignoreTank = null) {
    for (const p of this.players) {
      if (p !== ignoreTank && p.alive && Math.hypot(p.x - x, p.z - z) < radius + TANK_RADIUS) {
        return true;
      }
    }
    for (const e of this.enemies) {
      if (e !== ignoreTank && e.alive && Math.hypot(e.x - x, e.z - z) < radius + TANK_RADIUS) {
        return true;
      }
    }
    return false;
  }

  moveTankWithCollision(tank, nextX, nextZ) {
    const R = TANK_RADIUS;
    let nx = clamp(nextX, R, WORLD_SIZE - R);
    let nz = clamp(nextZ, R, WORLD_SIZE - R);

    // Two-pass circle-vs-AABB sub-cell resolution for silky corner sliding
    for (let pass = 0; pass < 2; pass++) {
      const cMin = Math.max(0, Math.floor((nx - R) / CELL_SIZE));
      const cMax = Math.min(SUB_GRID - 1, Math.floor((nx + R) / CELL_SIZE));
      const rMin = Math.max(0, Math.floor((nz - R) / CELL_SIZE));
      const rMax = Math.min(SUB_GRID - 1, Math.floor((nz + R) / CELL_SIZE));

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          if (!this.isBlockingTankTile(this.grid[r][c], tank.hasHover)) continue;

          const minX = c * CELL_SIZE;
          const maxX = (c + 1) * CELL_SIZE;
          const minZ = r * CELL_SIZE;
          const maxZ = (r + 1) * CELL_SIZE;

          const cx = clamp(nx, minX, maxX);
          const cz = clamp(nz, minZ, maxZ);
          const dx = nx - cx;
          const dz = nz - cz;
          const distSq = dx * dx + dz * dz;

          if (distSq < R * R) {
            if (distSq > 1e-6) {
              const dist = Math.sqrt(distSq);
              const push = R - dist;
              nx += (dx / dist) * push;
              nz += (dz / dist) * push;
            } else {
              const overlapLeft = (nx + R) - minX;
              const overlapRight = maxX - (nx - R);
              const overlapTop = (nz + R) - minZ;
              const overlapBot = maxZ - (nz - R);
              const m = Math.min(overlapLeft, overlapRight, overlapTop, overlapBot);
              if (m === overlapLeft) nx = minX - R;
              else if (m === overlapRight) nx = maxX + R;
              else if (m === overlapTop) nz = minZ - R;
              else nz = maxZ + R;
            }
          }
        }
      }
    }

    // Tank-vs-Tank circle separation
    const allTanks = [...this.players, ...this.enemies];
    for (const other of allTanks) {
      if (other === tank || !other.alive) continue;
      const dx = nx - other.x;
      const dz = nz - other.z;
      const minD = R * 1.95;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-4) {
        const push = (minD - d) * 0.65;
        nx += (dx / d) * push;
        nz += (dz / d) * push;
      }
    }

    tank.x = clamp(nx, R, WORLD_SIZE - R);
    tank.z = clamp(nz, R, WORLD_SIZE - R);
  }

  // ==========================================================================
  // Weapons, Shells & Tractor-Beam Wall Grab/Drop
  // ==========================================================================
  getShellSpeed(tank) {
    if (!tank.isPlayer && tank.stats) return tank.stats.shellSpeed;
    const speeds = [38, 46, 52, 58];
    return speeds[tank.weaponTier] || 38;
  }

  fireTankCannon(tank) {
    const totalYaw = tank.yaw + tank.turretOffset;
    const fx = -Math.sin(totalYaw);
    const fz = -Math.cos(totalYaw);

    const muzzleDist = 3.15;
    const mx = tank.x + fx * muzzleDist;
    const mz = tank.z + fz * muzzleDist;
    const speed = this.getShellSpeed(tank);
    const breaksSteel = tank.weaponTier >= 3;

    const colorHex = breaksSteel
      ? 0xf43f5e
      : tank.isPlayer
      ? tank.colorHex
      : 0xfb923c;

    const mat = new THREE.MeshBasicMaterial({ color: colorHex });
    const mesh = new THREE.Mesh(this.shellGeo, mat);
    mesh.position.set(mx, 1.62, mz);

    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.68,
    });
    const trail = new THREE.Mesh(this.shellTrailGeo, trailMat);
    trail.position.set(0, 0, 0.72);
    mesh.add(trail);
    mesh.rotation.y = totalYaw;

    this.scene.add(mesh);
    this.shells.push({
      owner: tank,
      mesh,
      mat,
      trailMat,
      x: mx,
      z: mz,
      vx: fx * speed,
      vz: fz * speed,
      breaksSteel,
      damage: tank.isPlayer && tank.weaponTier >= 2 ? 2 : 1,
      life: 0,
      maxLife: 2.6,
    });

    tank.recoil = 0.45;
    tank.muzzleTimer = 0.07;
    // Slight upward muzzle kick (+X rotation lifts -Z nose slightly up, never down into floor!)
    tank.pitch = clamp((tank.pitch || 0) + 0.04, -0.06, 0.08);
    if (tank.isPlayer) {
      tank.shake = Math.max(tank.shake, 0.35);
      const baseReload = [0.58, 0.46, 0.36, 0.3][tank.weaponTier] || 0.58;
      tank.reloadTimer = tank.rapidTimer > 0 ? baseReload * 0.52 : baseReload;
      sound.playCannon(tank.weaponTier, 0.25);
      this.triggerGamepadRumble(tank, 65, 0.38, 0.2);
    } else {
      tank.reloadTimer = tank.stats.reload * (0.85 + Math.random() * 0.35);
      sound.playCannon(0, 0.11);
    }
  }

  handleWallGrabDrop(p) {
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);

    if (p.carriedTile === TILE.EMPTY) {
      // Scan forward 2.0m..6.8m for a Brick or Steel block to tractor-grab!
      for (let dist = 2.2; dist <= 6.8; dist += 0.7) {
        const sx = p.x + fx * dist;
        const sz = p.z + fz * dist;
        const { c, r } = worldToSub(sx, sz);
        if (c < 0 || c >= SUB_GRID || r < 0 || r >= SUB_GRID) break;
        const t = this.grid[r][c];
        if (t === TILE.BRICK || t === TILE.STEEL) {
          p.carriedTile = t;
          p.carriedTileHp = this.wallHp[r][c] || WALL_MAX_HP;
          this.setCell(c, r, TILE.EMPTY, 0);
          const wPos = subToWorld(c, r);
          this.effects.spawnTractorBeam(p.x, 1.8, p.z, wPos.x, 2.0, wPos.z, 0x38bdf8);
          sound.playTractor(true);
          this.addPopup(wPos.x, 3.2, wPos.z, t === TILE.STEEL ? 'GRABBED STEEL' : 'GRABBED BRICK', '#38bdf8');
          return;
        }
      }
    } else {
      // Deploy carried wall block right in front of tank!
      const dropX = p.x + fx * 4.5;
      const dropZ = p.z + fz * 4.5;
      const { c, r } = worldToSub(dropX, dropZ);
      if (c < 0 || c >= SUB_GRID || r < 0 || r >= SUB_GRID) return;
      const existing = this.grid[r][c];
      if (existing !== TILE.EMPTY && existing !== TILE.ICE && existing !== TILE.TREES) return;

      const wPos = subToWorld(c, r);
      if (this.isPointOccupiedByTank(wPos.x, wPos.z, CELL_SIZE * 0.42)) return;

      const placed = p.carriedTile;
      const placedHp = p.carriedTileHp || WALL_MAX_HP;
      p.carriedTile = TILE.EMPTY;
      p.carriedTileHp = 0;
      this.setCell(c, r, placed, placedHp);
      this.effects.spawnTractorBeam(p.x, 1.8, p.z, wPos.x, 2.0, wPos.z, 0xfbbf24);
      sound.playTractor(false);
      this.addPopup(wPos.x, 3.4, wPos.z, 'DEPLOYED WALL', '#fbbf24');
    }
  }

  setCell(c, r, tileType, hp = WALL_MAX_HP) {
    if (c < 0 || c >= SUB_GRID || r < 0 || r >= SUB_GRID) return;
    this.grid[r][c] = tileType;
    this.wallHp[r][c] = tileType === TILE.BRICK || tileType === TILE.STEEL ? hp : 0;
    this.arena3d.setCellMesh(c, r, tileType, this.wallHp[r][c]);
  }

  setBaseWalls(tileType) {
    for (const sub of BASE_WALL_SUBS) {
      this.setCell(sub.c, sub.r, tileType, WALL_MAX_HP);
    }
  }

  updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        this.removeShell(i);
        continue;
      }

      const steps = 2;
      const subDt = dt / steps;
      let destroyed = false;

      for (let step = 0; step < steps && !destroyed; step++) {
        s.x += s.vx * subDt;
        s.z += s.vz * subDt;
        s.mesh.position.set(s.x, 1.62, s.z);

        // 1. Arena Perimeter check
        if (s.x <= 0.2 || s.x >= WORLD_SIZE - 0.2 || s.z <= 0.2 || s.z >= WORLD_SIZE - 0.2) {
          this.effects.spawnExplosion(s.x, 1.6, s.z, 0x94a3b8, 6, false);
          sound.playSteelRicochet();
          this.removeShell(i);
          destroyed = true;
          break;
        }

        // 2. Grid Terrain check (5-HP progressive wall deterioration!)
        const { c, r } = worldToSub(s.x, s.z);
        if (c >= 0 && c < SUB_GRID && r >= 0 && r < SUB_GRID) {
          const tile = this.grid[r][c];
          if (tile === TILE.BRICK) {
            const remHp = this.damageWallAt(c, r, s, TILE.BRICK);
            this.effects.spawnExplosion(s.x, 1.5, s.z, 0xc2593f, remHp === 0 ? 18 : 9, remHp === 0);
            sound.playBrickBreak();
            if (s.owner && s.owner.isPlayer) {
              const wPos = subToWorld(c, r);
              this.addPopup(
                wPos.x,
                2.6,
                wPos.z,
                remHp === 0 ? 'BREACHED!' : `WALL ${remHp}/${WALL_MAX_HP}`,
                remHp === 0 ? '#4ade80' : '#fdba74'
              );
            }
            this.removeShell(i);
            destroyed = true;
            break;
          } else if (tile === TILE.STEEL) {
            // Steel blocks are always 100% indestructible!
            this.effects.spawnExplosion(s.x, 1.7, s.z, 0xe2e8f0, 8, false);
            sound.playSteelRicochet();
            this.removeShell(i);
            destroyed = true;
            break;
          } else if (tile === TILE.EAGLE && this.eagleAlive) {
            if (!s.owner.isPlayer) {
              this.destroyEagleBase();
            } else {
              this.effects.spawnExplosion(s.x, 1.8, s.z, 0xfef08a, 6, false);
              sound.playSteelRicochet();
            }
            this.removeShell(i);
            destroyed = true;
            break;
          }
        }

        // 3. Shell-vs-Tank impact check
        const hitTank = this.findHitTank(s);
        if (hitTank) {
          this.applyShellDamage(s, hitTank);
          this.removeShell(i);
          destroyed = true;
          break;
        }
      }
    }
  }

  damageSingleWallCell(c, r, expectedTile) {
    if (c < 0 || c >= SUB_GRID || r < 0 || r >= SUB_GRID) return 0;
    if (this.grid[r][c] !== expectedTile) return 0;
    const nextHp = Math.max(0, (this.wallHp[r][c] || WALL_MAX_HP) - 1);
    if (nextHp <= 0) {
      this.setCell(c, r, TILE.EMPTY, 0);
      return 0;
    }
    this.setCell(c, r, expectedTile, nextHp);
    return nextHp;
  }

  damageWallAt(c, r, shell, expectedTile) {
    const remHp = this.damageSingleWallCell(c, r, expectedTile);
    // Damage adjacent twin sub-block along impact face so 5 shots carve a full tank-width breach!
    if (Math.abs(shell.vz) >= Math.abs(shell.vx)) {
      const twinC = c ^ 1;
      this.damageSingleWallCell(twinC, r, expectedTile);
    } else {
      const twinR = r ^ 1;
      this.damageSingleWallCell(c, twinR, expectedTile);
    }
    return remHp;
  }

  findHitTank(shell) {
    const hitRadius = TANK_RADIUS + 0.35;
    if (this.mode === GAME_MODE.COOP) {
      if (shell.owner.isPlayer) {
        for (const e of this.enemies) {
          if (e.alive && Math.hypot(e.x - shell.x, e.z - shell.z) < hitRadius) return e;
        }
      } else {
        for (const p of this.players) {
          if (p.alive && Math.hypot(p.x - shell.x, p.z - shell.z) < hitRadius) return p;
        }
      }
    } else {
      // Versus Free-for-All
      for (const p of this.players) {
        if (p !== shell.owner && p.alive && Math.hypot(p.x - shell.x, p.z - shell.z) < hitRadius) {
          return p;
        }
      }
      for (const e of this.enemies) {
        if (e !== shell.owner && e.alive && Math.hypot(e.x - shell.x, e.z - shell.z) < hitRadius) {
          return e;
        }
      }
    }
    return null;
  }

  applyShellDamage(shell, victim) {
    if (victim.shieldTimer > 0) {
      this.effects.spawnExplosion(shell.x, 1.8, shell.z, 0x38bdf8, 8, false);
      sound.playSteelRicochet();
      return;
    }

    // Bonus enemy drops a 3D Supply Crate on hit!
    if (!victim.isPlayer && victim.isBonus) {
      victim.isBonus = false;
      victim.rig.hullMat.color.setHex(victim.stats.color);
      this.spawnRandomCrate();
    }

    // Directional Armor Calculation:
    // Blend incoming shell trajectory (-vx, -vz) with impact offset from tank center
    const sSpeed = Math.hypot(shell.vx, shell.vz) || 1;
    const trajX = -shell.vx / sSpeed;
    const trajZ = -shell.vz / sSpeed;
    const offX = shell.x - victim.x;
    const offZ = shell.z - victim.z;
    const offLen = Math.hypot(offX, offZ) || 1;
    const inX = trajX * 0.7 + (offX / offLen) * 0.3;
    const inZ = trajZ * 0.7 + (offZ / offLen) * 0.3;
    const hitInfo = classifyArmorHit(inX, inZ, victim.yaw);

    if (victim.isPlayer) {
      victim.hitFlash = hitInfo.zone === 'BACK' ? 0.95 : 0.55;
      victim.shake = hitInfo.zone === 'BACK' ? 1.1 : 0.75;
      this.triggerGamepadRumble(victim, 190, 0.85, 0.55);
    }

    // Absorb with Hover-Pontoon or extra Reactive Armor (unless hit directly in Rear Weakspot!)
    if (hitInfo.zone !== 'BACK') {
      if (victim.hasHover) {
        victim.hasHover = false;
        this.effects.spawnExplosion(victim.x, 1.4, victim.z, 0x2dd4bf, 12, false);
        sound.playArmorHit();
        this.addPopup(victim.x, 2.8, victim.z, 'PONTOON LOST', '#2dd4bf');
        return;
      }
      if (victim.armor > 0) {
        victim.armor = Math.max(0, victim.armor - 1);
        this.effects.spawnExplosion(victim.x, 1.6, victim.z, 0x38bdf8, 12, false);
        sound.playArmorHit();
        this.addPopup(victim.x, 2.8, victim.z, 'REACTIVE PLATE', '#38bdf8');
        return;
      }
    }

    // Apply Directional Armor Damage:
    // FRONT = 2 dmg (3 hits to kill), SIDE = 3 dmg (2 hits to kill), BACK = 6 dmg (1-hit instant kill!)
    victim.hp -= hitInfo.damage;
    if (victim.hp > 0) {
      this.effects.spawnExplosion(shell.x, 1.7, shell.z, hitInfo.sparkHex, 11, false);
      if (hitInfo.zone === 'FRONT') sound.playSteelRicochet();
      else sound.playArmorHit();

      const tag = hitInfo.zone === 'FRONT' ? 'FRONT ARMOR (3×)' : 'SIDE FLANK! (2×)';
      this.addPopup(victim.x, 2.9, victim.z, tag, hitInfo.color);
      return;
    }

    // Tank Destroyed!
    victim.alive = false;
    victim.rig.root.visible = false;
    this.effects.spawnExplosion(
      victim.x,
      1.5,
      victim.z,
      hitInfo.zone === 'BACK' ? 0xf43f5e : 0xf97316,
      hitInfo.zone === 'BACK' ? 36 : 28,
      true
    );
    sound.playExplosion(true);

    const attacker = shell.owner;
    if (attacker) {
      attacker.frags = (attacker.frags || 0) + 1;
      if (attacker.isPlayer) {
        const backstabBonus = hitInfo.zone === 'BACK' ? 150 : 0;
        const pts = (victim.points || 250) + backstabBonus;
        attacker.score += pts;
        const killText = hitInfo.zone === 'BACK'
          ? (this.mode === GAME_MODE.VERSUS ? `${attacker.tag} BACKSTAB!` : `BACKSTAB! +${pts}`)
          : (this.mode === GAME_MODE.VERSUS ? `${attacker.tag} +1 FRAG!` : `+${pts}`);
        this.addPopup(
          victim.x,
          3.1,
          victim.z,
          killText,
          hitInfo.zone === 'BACK' ? '#f43f5e' : attacker.cssColor
        );
      }
    }

    if (victim.isPlayer) {
      if (this.mode === GAME_MODE.COOP) {
        victim.lives -= 1;
        victim.weaponTier = Math.max(0, victim.weaponTier - 1);
        if (victim.lives > 0) {
          victim.respawnTimer = 2.2;
        } else {
          victim.eliminated = true;
        }
      } else {
        victim.respawnTimer = 2.5;
      }
    } else if (this.mode === GAME_MODE.VERSUS) {
      // Versus Bot respawns after delay!
      victim.respawnTimer = 3.0;
    }
  }

  removeShell(idx) {
    const s = this.shells[idx];
    this.scene.remove(s.mesh);
    s.mat.dispose();
    s.trailMat.dispose();
    this.shells.splice(idx, 1);
  }

  destroyEagleBase() {
    if (!this.eagleAlive) return;
    this.eagleAlive = false;
    this.grid[24][12] = TILE.EAGLE_DEAD;
    this.grid[24][13] = TILE.EAGLE_DEAD;
    this.grid[25][12] = TILE.EAGLE_DEAD;
    this.grid[25][13] = TILE.EAGLE_DEAD;
    this.arena3d.buildEagleMonument(false);

    const cx = 13 * CELL_SIZE;
    const cz = 25 * CELL_SIZE;
    this.effects.spawnExplosion(cx, 2.2, cz, 0xef4444, 42, true);
    sound.playExplosion(true);
    sound.playGameOver();

    this.isVictory = false;
    this.victoryBanner = 'EAGLE CORE DESTROYED — GAME OVER';
    this.state = 'GAME_OVER';
  }

  // ==========================================================================
  // AI Enemy & Versus Bot Brains
  // ==========================================================================
  updateEnemy(e, dt) {
    if (!e.alive) {
      if (this.mode === GAME_MODE.VERSUS && e.respawnTimer > 0) {
        e.respawnTimer -= dt;
        if (e.respawnTimer <= 0) {
          const sp = this.pickFarthestVersusSpawn(e);
          const pos = macroToWorld(sp.tx, sp.ty);
          e.x = pos.x;
          e.z = pos.z;
          e.yaw = sp.yaw;
          e.pitch = 0;
          e.hp = e.maxHp;
          e.shieldTimer = 2.0;
          e.alive = true;
          e.rig.root.visible = true;
          this.effects.spawnExplosion(e.x, 1.0, e.z, 0x38bdf8, 8, false);
        }
      }
      return;
    }

    if (e.shieldTimer > 0) e.shieldTimer = Math.max(0, e.shieldTimer - dt);
    if (e.reloadTimer > 0) e.reloadTimer = Math.max(0, e.reloadTimer - dt);

    // Bonus enemy flashing pulse
    if (e.isBonus) {
      const flash = Math.floor(this.elapsed * 7) % 2 === 0;
      e.rig.hullMat.color.setHex(flash ? 0xf43f5e : 0xfacc15);
    }

    // Frozen by EMP power-up!
    if (this.freezeTimer > 0 && this.mode === GAME_MODE.COOP) {
      this.syncTankRigVisuals(e, dt);
      return;
    }

    // Choose AI navigation target (nearest living rival/player or Eagle Base in Co-op)
    const rivals = this.getValidTargetsFor(e);
    let goalX = 13 * CELL_SIZE;
    let goalZ = 25 * CELL_SIZE;
    let nearestDist = Infinity;

    for (const r of rivals) {
      const d = Math.hypot(r.x - e.x, r.z - e.z);
      if (d < nearestDist) {
        nearestDist = d;
        goalX = r.x;
        goalZ = r.z;
      }
    }
    // In Co-op, 35% of steering decisions bias toward pushing South to the Eagle Base!
    if (this.mode === GAME_MODE.COOP && Math.random() < 0.02) {
      goalX = 13 * CELL_SIZE;
      goalZ = 25 * CELL_SIZE;
    }

    e.aiTurnTimer -= dt;
    const prevX = e.x;
    const prevZ = e.z;

    if (e.aiTurnTimer <= 0 || e.stuckTimer > 0.32) {
      const toGoalYaw = Math.atan2(-(goalX - e.x), -(goalZ - e.z));
      if (e.stuckTimer > 0.32) {
        // Pick an open cardinal/diagonal corridor direction!
        const candidateOffsets = [Math.PI * 0.5, -Math.PI * 0.5, Math.PI * 0.75, -Math.PI * 0.75, Math.PI];
        let picked = wrapAngle(e.yaw + candidateOffsets[Math.floor(Math.random() * candidateOffsets.length)]);
        for (const off of candidateOffsets) {
          const testYaw = wrapAngle(toGoalYaw + off * (Math.random() < 0.5 ? 1 : -1));
          const tfx = -Math.sin(testYaw);
          const tfz = -Math.cos(testYaw);
          const checkTile = this.getTileAtWorld(e.x + tfx * 5.2, e.z + tfz * 5.2);
          if (!this.isBlockingTankTile(checkTile, e.hasHover)) {
            picked = testYaw;
            break;
          }
        }
        e.aiGoalYaw = picked;
        e.stuckTimer = 0;
        e.aiTurnTimer = 1.6 + Math.random() * 1.2;
      } else {
        // Patrol corridors with generous wander angle so AI doesn't laser-home onto players
        const wander = (Math.random() < 0.35)
          ? (Math.floor(Math.random() * 4) * Math.PI * 0.5)
          : wrapAngle(toGoalYaw + (Math.random() - 0.5) * 0.85);
        e.aiGoalYaw = wander;
        e.aiTurnTimer = 1.4 + Math.random() * 1.5;
      }
    }

    const yawDiff = wrapAngle(e.aiGoalYaw - e.yaw);
    const maxTurn = e.stats.turnSpeed * dt;
    e.yaw = wrapAngle(e.yaw + clamp(yawDiff, -maxTurn, maxTurn));

    // Drive forward when roughly aligned with chosen heading
    const alignFactor = Math.abs(yawDiff) < 0.9 ? 1.0 : 0.25;
    e.speed = e.stats.speed * alignFactor;
    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    this.moveTankWithCollision(e, e.x + fx * e.speed * dt, e.z + fz * e.speed * dt);

    const moved = Math.hypot(e.x - prevX, e.z - prevZ);
    if (moved < e.speed * dt * 0.35) {
      e.stuckTimer += dt;
    } else {
      e.stuckTimer = Math.max(0, e.stuckTimer - dt);
    }

    e.rig.leftTreadTex.offset.y = (e.rig.leftTreadTex.offset.y + e.speed * dt * 0.35) % 1;
    e.rig.rightTreadTex.offset.y = (e.rig.rightTreadTex.offset.y + e.speed * dt * 0.35) % 1;

    // Enemy tanks have NO turret auto-lock (turret stays fixed straight ahead!)
    // They must physically line up their hull (~9 deg) with clear LOS to shoot a rival.
    e.turretOffset = 0;
    e.lockedTarget = null;
    e.obstructedTarget = null;

    let targetDeadAhead = false;
    for (const r of rivals) {
      const dx = r.x - e.x;
      const dz = r.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 52) continue;
      const rel = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - e.yaw));
      if (rel < 0.16 && this.hasClearLineOfSight(e.x, e.z, r.x, r.z)) {
        targetDeadAhead = true;
        break;
      }
    }

    // Fire when hull is lined up straight at a target OR breaching a Brick wall / Eagle
    const aheadTile = this.getTileAtWorld(e.x + fx * 4.5, e.z + fz * 4.5);
    const shouldBreachBrick = aheadTile === TILE.BRICK || aheadTile === TILE.EAGLE;
    if (e.reloadTimer <= 0 && (targetDeadAhead || shouldBreachBrick)) {
      this.fireTankCannon(e);
    }

    this.syncTankRigVisuals(e, dt);
  }

  // ==========================================================================
  // Supply Crates & Power-Ups
  // ==========================================================================
  spawnRandomCrate() {
    for (let tries = 0; tries < 30; tries++) {
      const c = 2 + Math.floor(Math.random() * (SUB_GRID - 4));
      const r = 2 + Math.floor(Math.random() * (SUB_GRID - 4));
      if (this.grid[r][c] !== TILE.EMPTY) continue;
      const pos = subToWorld(c, r);
      if (this.isPointOccupiedByTank(pos.x, pos.z, 3.0)) continue;

      let type = Math.floor(Math.random() * POWERUP_INFO.length);
      if (this.mode === GAME_MODE.VERSUS && (type === POWERUP.FREEZE || type === POWERUP.REPAIR)) {
        type = POWERUP.ARMOR;
      }

      const rig = createCrateMesh(type);
      rig.group.position.set(pos.x, 1.35, pos.z);
      this.scene.add(rig.group);
      this.crates.push({
        type,
        x: pos.x,
        z: pos.z,
        rig,
        life: 0,
        maxLife: 22.0,
      });
      return;
    }
  }

  updateCrates(dt) {
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const cr = this.crates[i];
      cr.life += dt;
      if (cr.life >= cr.maxLife) {
        this.removeCrate(i);
        continue;
      }
      cr.rig.group.rotation.y += 1.8 * dt;
      cr.rig.box.rotation.x += 0.9 * dt;
      cr.rig.group.position.y = 1.35 + Math.sin(this.elapsed * 3.5 + i) * 0.25;

      // Player pickup check
      for (const p of this.players) {
        if (!p.alive) continue;
        if (Math.hypot(p.x - cr.x, p.z - cr.z) < TANK_RADIUS + 1.55) {
          this.applyPowerup(p, cr.type);
          this.removeCrate(i);
          break;
        }
      }
    }
  }

  applyPowerup(p, type) {
    const info = POWERUP_INFO[type] || POWERUP_INFO[0];
    sound.playPowerup();
    p.score += 500;
    this.addPopup(p.x, 3.2, p.z, info.label, info.color);

    switch (type) {
      case POWERUP.SHIELD:
        p.shieldTimer = 12.0;
        break;
      case POWERUP.FREEZE:
        this.freezeTimer = 9.0;
        break;
      case POWERUP.FORTIFY:
        if (this.mode === GAME_MODE.COOP) {
          this.setBaseWalls(TILE.STEEL);
          this.fortifyTimer = 20.0;
        } else {
          p.carriedTile = TILE.STEEL;
        }
        break;
      case POWERUP.STAR:
        p.weaponTier = Math.min(3, p.weaponTier + 1);
        break;
      case POWERUP.MAX_GUN:
        p.weaponTier = 3;
        break;
      case POWERUP.BOOM:
        for (const e of this.enemies) {
          if (!e.alive) continue;
          e.alive = false;
          e.rig.root.visible = false;
          this.effects.spawnExplosion(e.x, 1.5, e.z, 0xf97316, 22, true);
          if (this.mode === GAME_MODE.VERSUS) {
            e.respawnTimer = 3.5;
            p.frags += 1;
          }
          p.score += e.points || 200;
        }
        sound.playExplosion(true);
        break;
      case POWERUP.REPAIR:
        p.lives += 1;
        p.hp = p.maxHp;
        break;
      case POWERUP.ARMOR:
        p.armor = Math.min(4, p.armor + 2);
        p.hp = p.maxHp;
        break;
      case POWERUP.HOVER:
        p.hasHover = true;
        break;
      case POWERUP.RAPID:
        p.rapidTimer = 12.0;
        break;
      default:
        break;
    }
  }

  removeCrate(idx) {
    const cr = this.crates[idx];
    this.scene.remove(cr.rig.group);
    cr.rig.coreMat.dispose();
    cr.rig.frameMat.dispose();
    this.crates.splice(idx, 1);
  }

  addPopup(x, y, z, text, color) {
    this.popups.push({ x, y, z, text, color, life: 0, maxLife: 1.35 });
  }

  // ==========================================================================
  // 3D Rig Visual Synchronization
  // ==========================================================================
  syncTankRigVisuals(tank, dt) {
    const rig = tank.rig;
    rig.root.position.set(tank.x, 0, tank.z);
    rig.root.rotation.y = tank.yaw;

    // Smoothly settle hull pitch back to level for both players and AI tanks!
    if (!tank.isPlayer) {
      tank.pitch = THREE.MathUtils.lerp(tank.pitch || 0, 0, 8 * dt);
    }
    tank.pitch = clamp(tank.pitch || 0, -0.08, 0.08);
    rig.bodyPivot.rotation.x = tank.pitch;
    rig.turretPivot.rotation.y = tank.turretOffset;

    // Spin 3D caterpillar road wheels with movement
    if (rig.wheels && dt > 0) {
      const spin = (tank.speed || 0) * dt * 2.2;
      for (const w of rig.wheels) {
        w.group.rotation.x -= spin;
      }
    }

    if (tank.recoil > 0) {
      tank.recoil = Math.max(0, tank.recoil - dt * 2.8);
    }
    rig.barrelPivot.position.z = -0.95 + tank.recoil;

    if (tank.muzzleTimer > 0) {
      tank.muzzleTimer = Math.max(0, tank.muzzleTimer - dt);
      rig.muzzleFlash.visible = true;
    } else {
      rig.muzzleFlash.visible = false;
    }

    rig.heavyShroud.visible = tank.weaponTier >= 2;
    rig.pontoonGroup.visible = Boolean(tank.hasHover);
    rig.carriedBrick.visible = tank.carriedTile === TILE.BRICK;
    rig.carriedSteel.visible = tank.carriedTile === TILE.STEEL;

    if (tank.shieldTimer > 0) {
      rig.shieldMesh.visible = true;
      rig.shieldMesh.rotation.y += 2.2 * dt;
    } else {
      rig.shieldMesh.visible = false;
    }

    // Sensor optic & forward laser sight when locked onto target!
    if (tank.lockedTarget) {
      rig.sensorMat.color.setHex(0x4ade80);
      if (tank.isPlayer) {
        rig.laserLine.visible = true;
        const scaleZ = Math.max(0.2, (tank.lockedDist - 2.85) / (24.0 - 2.85));
        rig.laserLine.scale.set(1, 1, scaleZ);
      }
    } else {
      rig.sensorMat.color.setHex(tank.isPlayer ? 0x38bdf8 : 0xef4444);
      rig.laserLine.visible = false;
    }
  }

  // ==========================================================================
  // Match Outcome Checks
  // ==========================================================================
  checkMatchOutcomes() {
    if (this.mode === GAME_MODE.COOP) {
      // Loss if all players eliminated
      const anyPlayerActive = this.players.some((p) => !p.eliminated);
      if (!anyPlayerActive) {
        sound.playGameOver();
        this.isVictory = false;
        this.victoryBanner = 'ALL TANKS DESTROYED — GAME OVER';
        this.state = 'GAME_OVER';
        return;
      }

      // Stage Clear if enemy queue empty and all enemies destroyed
      if (this.enemiesRemainingCount() === 0) {
        this.state = 'STAGE_CLEAR';
        this.stateTimer = 2.6;
        sound.playPowerup();
      }
    } else {
      // Versus Deathmatch: first player or bot to reach VERSUS_TARGET_FRAGS wins!
      for (const p of this.players) {
        if (p.frags >= VERSUS_TARGET_FRAGS) {
          this.isVictory = true;
          this.victoryBanner = `${p.tag} WINS THE ARENA! (${p.frags} FRAGS)`;
          this.state = 'GAME_OVER';
          sound.playStageStart();
          return;
        }
      }
      for (const e of this.enemies) {
        if (e.frags >= VERSUS_TARGET_FRAGS) {
          this.isVictory = false;
          this.victoryBanner = `${e.label} WINS THE ARENA!`;
          this.state = 'GAME_OVER';
          sound.playGameOver();
          return;
        }
      }
    }
  }

  // ==========================================================================
  // Multi-Viewport Split-Screen WebGL + 2D HUD Render
  // ==========================================================================
  render() {
    const cssW = this.cssW;
    const cssH = this.cssH;
    const dpr = this.dpr;

    if (this.state === 'MENU') {
      // Orbiting 3D Arena Preview in background behind Menu!
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, cssW, cssH);
      const ang = this.elapsed * 0.16;
      const rad = WORLD_SIZE * 0.56;
      this.attractCamera.aspect = cssW / Math.max(1, cssH);
      this.attractCamera.updateProjectionMatrix();
      this.attractCamera.position.set(
        WORLD_SIZE * 0.5 + Math.cos(ang) * rad,
        36,
        WORLD_SIZE * 0.5 + Math.sin(ang) * rad
      );
      this.attractCamera.lookAt(WORLD_SIZE * 0.5, 1.5, WORLD_SIZE * 0.5);
      this.renderer.render(this.scene, this.attractCamera);
      this.hud.render(this, [], cssW, cssH, dpr);
      return;
    }

    const viewports = computeViewports(this.players.length, cssW, cssH, dpr);
    const baseFov = CAMERA_PRESETS[this.cameraPresetIndex].fov;
    this.renderer.setScissorTest(true);

    // Clear full canvas first in CSS logical coords (Three.js scales by pixelRatio internally)
    this.renderer.setScissor(0, 0, cssW, cssH);
    this.renderer.setViewport(0, 0, cssW, cssH);
    this.renderer.clear();

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const vp = viewports[i];
      if (!vp || vp.glW <= 0 || vp.glH <= 0) continue;

      const aspect = vp.w / Math.max(1, vp.h);
      // Hor+ FOV adaptation so narrow side-by-side split-screen keeps wide peripheral & vertical view
      const adaptedFov = aspect < 1.15
        ? Math.min(76, (2 * Math.atan(Math.tan((baseFov * Math.PI) / 360) / Math.max(0.72, aspect * 0.85)) * 180) / Math.PI)
        : baseFov;
      if (p.camera.aspect !== aspect || Math.abs(p.camera.fov - adaptedFov) > 0.05) {
        p.camera.aspect = aspect;
        p.camera.fov = adaptedFov;
        p.camera.updateProjectionMatrix();
      }

      this.renderer.setViewport(vp.glX, vp.glY, vp.glW, vp.glH);
      this.renderer.setScissor(vp.glX, vp.glY, vp.glW, vp.glH);
      this.renderer.render(this.scene, p.camera);
    }

    this.renderer.setScissorTest(false);
    this.hud.render(this, viewports, cssW, cssH, dpr);
  }
}

window.tankGame = new TankWars3DGame();
if (new URLSearchParams(window.location.search).get('autostart') === '1') {
  window.tankGame.startMatch();
  window.tankGame.state = 'PLAYING';
}

