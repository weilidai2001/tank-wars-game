import * as THREE from '../../vendor/three.module.min.js';
import {
  CELL_SIZE, WORLD_SIZE, TILE, GAME_MODE,
  TANK_RADIUS, BASE_TANK_HP, BONUS_ENEMY_INDICES,
  PLAYER_CONFIGS, COOP_PLAYER_SPAWNS, COOP_ENEMY_SPAWNS,
  VERSUS_SPAWNS, VERSUS_TARGET_FRAGS,
} from '../config/constants.js';
import { ARENA_TEMPLATES, buildArenaData } from '../config/arenas.js';
import { ENEMY_TYPE, ENEMY_STATS, NATIONS, getPlayerVehicleSpec } from '../config/vehicles.js';
import { EVENTS } from '../core/EventBus.js';
import { macroToWorld } from '../core/MathUtils.js';
import { ArenaGrid } from '../world/ArenaGrid.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { AISystem } from '../systems/AISystem.js';
import { PowerupSystem } from '../systems/PowerupSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { MaterialLibrary } from '../render/MaterialLibrary.js';
import { TankMeshBuilder } from '../render/TankMeshBuilder.js';
import { ArenaRenderer } from '../render/ArenaRenderer.js';
import { EffectsRenderer } from '../render/EffectsRenderer.js';
import { SceneManager } from '../render/SceneManager.js';
import { HudRenderer, computeViewports } from '../render/HudRenderer.js';
import { InputManager } from '../input/InputManager.js';
import { SoundEngine } from '../audio/SoundEngine.js';

/**
 * GameEngine Coordinator / Facade (SOLID Architecture).
 * Composes independent simulation, rendering, input, and audio subsystems via
 * Dependency Injection and the EventBus. Contains zero low-level WebGL/material
 * code, zero physics math, and zero DOM menu boilerplate.
 */
export class GameEngine {
  constructor({ glCanvas, hudCanvas, stageWrap, bus, onStateChanged }) {
    this.glCanvas = glCanvas;
    this.hudCanvas = hudCanvas;
    this.stageWrap = stageWrap;
    this.bus = bus;
    this.onStateChanged = onStateChanged || (() => {});

    // Pure Simulation Subsystems
    this.arenaGrid = new ArenaGrid();
    this.collision = new CollisionSystem(this.arenaGrid);
    this.movement = new MovementSystem(this.arenaGrid, this.collision);
    this.combat = new CombatSystem(this.arenaGrid, this.collision, this.bus);
    this.ai = new AISystem(this.arenaGrid, this.movement, this.combat);
    this.powerups = new PowerupSystem(this.arenaGrid, this.collision, this.bus);
    this.cameraSystem = new CameraSystem(this.arenaGrid);

    // Presentation Subsystems
    this.sceneManager = new SceneManager(glCanvas);
    this.mats = new MaterialLibrary();
    this.tankBuilder = new TankMeshBuilder(this.mats);
    this.arenaRenderer = new ArenaRenderer(this.sceneManager.scene, this.mats);
    this.effects = new EffectsRenderer(this.sceneManager.scene, this.bus);
    this.hud = new HudRenderer(hudCanvas);

    // Audio & Input Subsystems
    this.sound = new SoundEngine(this.bus);
    this.input = new InputManager(glCanvas, {
      isPlaying: () => this.state === 'PLAYING' && !this.paused,
      onKeyDown: (code) => this._handleGlobalKey(code),
      onGamepadStart: () => this._handleGamepadStart(),
      onGamepadView: () => this.cycleCameraPreset(),
      onGamepadStatusChanged: (pads, tag) => {
        if (this.onGamepadStatusChanged) this.onGamepadStatusChanged(pads, tag);
      },
    });

    // Bridge grid mutations -> 3D arena meshes
    this.arenaGrid.onCellChanged = (c, r, tile, hp) => {
      this.arenaRenderer.setCellMesh(c, r, tile, hp);
    };

    // Subscribe to domain events for popups & gamepad haptics
    this.popups = [];
    this.bus.on(EVENTS.POPUP_SPAWNED, ({ x, y, z, text, color }) => {
      this.popups.push({ x, y, z, text, color, life: 0, maxLife: 1.35 });
    });
    this.bus.on(EVENTS.TANK_FIRED, ({ tank }) => {
      if (tank.isPlayer && !tank.isAIControlled) {
        this.input.triggerRumble(tank.index, 65, 0.36, 0.2);
      }
    });
    this.bus.on(EVENTS.TANK_HIT, ({ victim }) => {
      if (victim.isPlayer && !victim.isAIControlled) {
        this.input.triggerRumble(victim.index, 180, 0.8, 0.5);
      }
    });
    this.bus.on(EVENTS.TANK_DESTROYED, ({ victim }) => {
      if (victim.rig) victim.rig.root.visible = false;
      if (victim.isPlayer && !victim.isAIControlled) {
        this.input.triggerRumble(victim.index, 260, 0.95, 0.7);
      }
    });

    // Match Configuration
    this.state = 'MENU'; // MENU | STAGE_INTRO | PLAYING | STAGE_CLEAR | GAME_OVER
    this.paused = false;
    this.mode = GAME_MODE.COOP;
    this.playerCount = 2;
    this.aiWingman = false; // True when 1P + AI Teammate (P2 AI) is selected!
    this.playerNations = ['USA', 'USSR', 'GERMANY', 'USA'];
    this.selectedStage = 1;
    this.versusBotCount = 2;

    this.gpsHeadingUp = true;
    this.showStatusCards = true;

    // Active Match State
    this.stage = 1;
    this.arenaTemplate = ARENA_TEMPLATES[0];
    this.eagleAlive = true;
    this.fortifyTimer = 0;
    this.freezeTimer = 0;
    this.versusCrateTimer = 7.0;

    this.players = [];
    this.enemies = [];
    this.enemyQueue = [];
    this.enemySpawnTimer = 0;
    this.totalEnemiesSpawned = 0;

    this.stateTimer = 0;
    this.victoryBanner = '';
    this.isVictory = false;
    this.elapsed = 0;
    this.cssW = 800;
    this.cssH = 600;
    this.dpr = 1;

    this._powerupCtx = {
      get mode() { return self.mode; },
      setFreezeTimer: (sec) => { this.freezeTimer = sec; },
      fortifyBase: (sec) => {
        this.arenaGrid.setBaseWalls(TILE.STEEL);
        this.fortifyTimer = sec;
      },
      upgradePlayerTier: (p, nextTier) => this._setPlayerTier(p, nextTier),
      triggerAirstrike: (p) => this._triggerAirstrike(p),
    };
    const self = this;

    // Resize listener
    const ro = new ResizeObserver(() => this.handleResize());
    ro.observe(this.stageWrap);
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
    this.loadMenuPreviewArena();

    this._lastFrameTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  getAllTanks() {
    return [...this.players, ...this.enemies];
  }

  getViewportPlayers() {
    // In 1P + AI Wingman mode, only 1P gets a full viewport while P2 AI fights alongside!
    if (this.aiWingman && this.mode === GAME_MODE.COOP) {
      return this.players.slice(0, 1);
    }
    return this.players;
  }

  // ==========================================================================
  // Public Controls & UI Actions
  // ==========================================================================
  handleResize() {
    const rect = this.stageWrap.getBoundingClientRect();
    this.cssW = Math.max(320, Math.floor(rect.width));
    this.cssH = Math.max(240, Math.floor(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.sceneManager.resize(this.cssW, this.cssH, this.dpr);
    this.hudCanvas.width = Math.round(this.cssW * this.dpr);
    this.hudCanvas.height = Math.round(this.cssH * this.dpr);
  }

  toggleMute() {
    this.sound.toggleMute();
    this.onStateChanged();
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.paused = !this.paused;
      this.onStateChanged();
    }
  }

  cycleCameraPreset() {
    this.cameraSystem.cyclePreset(this.players);
    this.onStateChanged();
  }

  toggleGpsMode() {
    this.gpsHeadingUp = !this.gpsHeadingUp;
    this.onStateChanged();
  }

  toggleStatusCards() {
    this.showStatusCards = !this.showStatusCards;
    this.onStateChanged();
  }

  openMenu() {
    this.state = 'MENU';
    this.paused = false;
    this.input.clearAll();
    this.loadMenuPreviewArena();
    this.onStateChanged();
  }

  _handleGlobalKey(code) {
    if (code === 'KeyM') this.toggleMute();
    else if (code === 'KeyV') this.cycleCameraPreset();
    else if (code === 'KeyH') this.toggleStatusCards();
    else if (code === 'BracketRight') this.cameraSystem.adjustPitch(2.4);
    else if (code === 'BracketLeft') this.cameraSystem.adjustPitch(-2.4);
    else if (code === 'Comma') this.cameraSystem.adjustOverviewYaw(-5);
    else if (code === 'Period' && this.cameraSystem.isFullMapMode()) this.cameraSystem.adjustOverviewYaw(5);
    else if (code === 'Tab') this.toggleGpsMode();
    else if (code === 'KeyP') this.togglePause();
    else if (code === 'Escape' && this.state !== 'MENU') this.openMenu();
    else if (this.state === 'GAME_OVER' && (code === 'Enter' || code === 'Space')) this.startMatch();
  }

  _handleGamepadStart() {
    if (this.state === 'MENU' || this.state === 'GAME_OVER') this.startMatch();
    else if (this.state === 'PLAYING') this.togglePause();
  }

  // ==========================================================================
  // Match & Stage Setup
  // ==========================================================================
  clearEntities() {
    for (const p of this.players) {
      if (p.rig) this.sceneManager.scene.remove(p.rig.root);
    }
    for (const e of this.enemies) {
      if (e.rig) this.sceneManager.scene.remove(e.rig.root);
    }
    this.players.length = 0;
    this.enemies.length = 0;
    this.combat.clear();
    this.powerups.clear();
    this.effects.clear();
    this.popups.length = 0;
  }

  loadMenuPreviewArena() {
    this.clearEntities();
    const built = buildArenaData(this.selectedStage, this.mode);
    this.arenaTemplate = built.template;
    this.arenaGrid.load(built.grid);
    this.sceneManager.applyAtmosphere(built.template);
    const hqStyle = (NATIONS[this.playerNations[0]] || NATIONS.USA).hqStyle;
    this.arenaRenderer.build(this.arenaGrid, built.template, this.mode === GAME_MODE.COOP, hqStyle);
  }

  startMatch() {
    this.sound.ensure();
    this.paused = false;
    this.stage = this.selectedStage;
    this.isVictory = false;
    this.victoryBanner = '';
    this.clearEntities();

    const totalPlayers = (this.mode === GAME_MODE.COOP && this.aiWingman) ? 2 : this.playerCount;
    const preset = this.cameraSystem.getPreset();

    for (let i = 0; i < totalPlayers; i++) {
      const cfg = PLAYER_CONFIGS[i];
      const nationId = this.playerNations[i] || cfg.defaultNation;
      const spec = getPlayerVehicleSpec(nationId, 0);
      const rig = this.tankBuilder.createRig({
        vehicleSpec: spec,
        palette: spec.nation.palette,
        identityColor: cfg.colorHex,
        scale: 1.0,
        isPlayer: true,
      });
      this.sceneManager.scene.add(rig.root);

      const cam = new THREE.PerspectiveCamera(preset.fov || 60, 16 / 9, 0.4, 240);
      this.players.push({
        isPlayer: true,
        isAIControlled: this.mode === GAME_MODE.COOP && this.aiWingman && i === 1,
        id: `P${i + 1}`,
        index: i,
        tag: cfg.tag,
        label: cfg.tag,
        nationId,
        vehicleSpec: spec,
        speedMul: spec.speedMul,
        turnMul: spec.turnMul,
        mass: spec.mass,
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
        actualSpeed: 0,
        pitch: 0,
        pitchVel: 0,
        roll: 0,
        rollVel: 0,
        idleBob: 0,
        leftTrackTravel: 0,
        rightTrackTravel: 0,
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
        carriedTileHp: 0,
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
    this.onStateChanged();
  }

  _setPlayerTier(p, newTier) {
    const clamped = Math.max(0, Math.min(3, newTier));
    if (clamped === p.weaponTier && p.rig) return;
    p.weaponTier = clamped;
    const spec = getPlayerVehicleSpec(p.nationId, clamped);
    p.vehicleSpec = spec;
    p.speedMul = spec.speedMul;
    p.turnMul = spec.turnMul;
    p.mass = spec.mass;

    // Hot-swap the 3D tank rig to the upgraded national vehicle model!
    if (p.rig) {
      this.sceneManager.scene.remove(p.rig.root);
    }
    p.rig = this.tankBuilder.createRig({
      vehicleSpec: spec,
      palette: spec.nation.palette,
      identityColor: p.colorHex,
      scale: 1.0,
      isPlayer: true,
    });
    this.sceneManager.scene.add(p.rig.root);
    this.tankBuilder.syncRig(p, 0);

    this.bus.emit(EVENTS.POPUP_SPAWNED, {
      x: p.x, y: 3.6, z: p.z, text: `DEPLOYED: ${spec.shortName}!`, color: '#facc15',
    });
  }

  _triggerAirstrike(p) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.alive = false;
      if (e.rig) e.rig.root.visible = false;
      this.bus.emit(EVENTS.TANK_DESTROYED, { victim: e, attacker: p, hitInfo: null, x: e.x, y: 1.5, z: e.z });
      if (this.mode === GAME_MODE.VERSUS) {
        e.respawnTimer = 3.5;
        p.frags += 1;
      }
      p.score += e.points || 200;
    }
  }

  loadStage(stageNum, isFreshMatch = false) {
    for (const e of this.enemies) {
      if (e.rig) this.sceneManager.scene.remove(e.rig.root);
    }
    this.enemies.length = 0;
    this.combat.clear();
    this.powerups.clear();
    this.effects.clear();
    this.popups.length = 0;

    this.stage = stageNum;
    const built = buildArenaData(stageNum, this.mode);
    this.arenaTemplate = built.template;
    this.arenaGrid.load(built.grid);
    this.enemyQueue = built.enemies.slice();
    this.totalEnemiesSpawned = 0;
    this.enemySpawnTimer = 0.8;
    this.eagleAlive = true;
    this.fortifyTimer = 0;
    this.freezeTimer = 0;
    this.versusCrateTimer = 6.0;

    this.sceneManager.applyAtmosphere(built.template);
    const hqStyle = (NATIONS[this.playerNations[0]] || NATIONS.USA).hqStyle;
    this.arenaRenderer.build(this.arenaGrid, built.template, this.mode === GAME_MODE.COOP, hqStyle);

    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (isFreshMatch) {
        p.lives = 5;
        p.score = 0;
        p.frags = 0;
        p.armor = 0;
        p.hasHover = false;
        p.carriedTile = TILE.EMPTY;
        p.eliminated = false;
        this._setPlayerTier(p, 0);
      }
      if (!p.eliminated) {
        this.spawnPlayerAtPad(p, i, true);
      }
    }

    if (this.mode === GAME_MODE.VERSUS) {
      const botTypes = [ENEMY_TYPE.STRIKER, ENEMY_TYPE.INTERCEPTOR, ENEMY_TYPE.GOLIATH, ENEMY_TYPE.SCOUT];
      for (let b = 0; b < this.versusBotCount; b++) {
        const sp = VERSUS_SPAWNS[(this.players.length + b) % VERSUS_SPAWNS.length];
        const pos = macroToWorld(sp.tx, sp.ty);
        this.spawnEnemyEntity(botTypes[b % botTypes.length], pos.x, pos.z, sp.yaw, false, `BOT-${b + 1}`);
      }
    }

    this.state = 'STAGE_INTRO';
    this.stateTimer = 1.9;
    this.bus.emit(EVENTS.STAGE_STARTED, { stage: this.stage });
  }

  spawnPlayerAtPad(p, padIndex, snapCamera = false) {
    const sp = this.mode === GAME_MODE.COOP
      ? COOP_PLAYER_SPAWNS[padIndex % COOP_PLAYER_SPAWNS.length]
      : this._pickFarthestVersusSpawn(p);
    const pos = macroToWorld(sp.tx, sp.ty);
    p.x = pos.x;
    p.z = pos.z;
    p.yaw = sp.yaw;
    p.speed = 0;
    p.actualSpeed = 0;
    p.pitch = 0;
    p.pitchVel = 0;
    p.roll = 0;
    p.rollVel = 0;
    p.turretOffset = 0;
    p.hp = p.maxHp;
    p.shieldTimer = 3.5;
    p.reloadTimer = 0;
    p.lockedTarget = null;
    p.obstructedTarget = null;
    p.alive = true;
    p.respawnTimer = 0;
    if (p.rig) p.rig.root.visible = true;
    this.tankBuilder.syncRig(p, 0);
    if (snapCamera) p.camInitialized = false;
    this.cameraSystem.updatePlayerCamera(p, 0.016);
  }

  _pickFarthestVersusSpawn(excludeEntity) {
    let best = VERSUS_SPAWNS[0];
    let bestMinDist = -1;
    const all = this.getAllTanks();
    for (const sp of VERSUS_SPAWNS) {
      const pos = macroToWorld(sp.tx, sp.ty);
      let minDist = 9999;
      for (const t of all) {
        if (t !== excludeEntity && t.alive) {
          minDist = Math.min(minDist, Math.hypot(t.x - pos.x, t.z - pos.z));
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
    const rig = this.tankBuilder.createRig({
      vehicleSpec: stats,
      palette: null,
      identityColor: isBonus ? 0xe11d48 : stats.color,
      scale: stats.scale,
      isPlayer: false,
    });
    this.sceneManager.scene.add(rig.root);

    const enemy = {
      isPlayer: false,
      id: customLabel || `E${++this.totalEnemiesSpawned}`,
      label: customLabel || stats.shortName,
      type,
      stats,
      vehicleSpec: stats,
      baseMaxSpeed: stats.speed,
      baseRevSpeed: stats.speed * 0.65,
      baseTurnSpeed: stats.turnSpeed,
      speedMul: 1.0,
      turnMul: 1.0,
      mass: stats.mass || 1.0,
      isBonus,
      rig,
      x,
      z,
      yaw,
      speed: 0,
      actualSpeed: 0,
      pitch: 0,
      pitchVel: 0,
      roll: 0,
      rollVel: 0,
      idleBob: 0,
      leftTrackTravel: 0,
      rightTrackTravel: 0,
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
    this.tankBuilder.syncRig(enemy, 0);
    this.enemies.push(enemy);
    this.bus.emit(EVENTS.TANK_SPAWNED, { tank: enemy, x, z });
    return enemy;
  }

  enemiesRemainingCount() {
    let activeAlive = 0;
    for (const e of this.enemies) if (e.alive) activeAlive++;
    return this.enemyQueue.length + activeAlive;
  }

  // ==========================================================================
  // Main Loop
  // ==========================================================================
  _loop(now) {
    const rawDt = (now - this._lastFrameTime) / 1000;
    this._lastFrameTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    this.input.pollGlobalGamepad();

    if (!this.paused) {
      this.elapsed += dt;
      this._update(dt);
    }

    this._render();
    this.input.endFrame();
    requestAnimationFrame((t) => this._loop(t));
  }

  _update(dt) {
    this.arenaRenderer.update(this.elapsed);
    this.effects.update(dt);

    if (this.state === 'MENU') return;

    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].life += dt;
      this.popups[i].y += 2.2 * dt;
      if (this.popups[i].life >= this.popups[i].maxLife) this.popups.splice(i, 1);
    }

    if (this.state === 'STAGE_INTRO') {
      this.stateTimer -= dt;
      for (const p of this.players) {
        this.tankBuilder.syncRig(p, dt);
        this.cameraSystem.updatePlayerCamera(p, dt);
      }
      if (this.stateTimer <= 0) this.state = 'PLAYING';
      return;
    }

    if (this.state === 'STAGE_CLEAR') {
      this.stateTimer -= dt;
      for (const p of this.players) this.cameraSystem.updatePlayerCamera(p, dt);
      if (this.stateTimer <= 0) this.loadStage(this.stage + 1, false);
      return;
    }

    if (this.state === 'GAME_OVER') {
      for (const p of this.players) this.cameraSystem.updatePlayerCamera(p, dt);
      return;
    }

    // PLAYING Update
    if (this.freezeTimer > 0) this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    if (this.fortifyTimer > 0) {
      this.fortifyTimer -= dt;
      if (this.fortifyTimer <= 0 && this.mode === GAME_MODE.COOP && this.stage > 6) {
        this.arenaGrid.setBaseWalls(TILE.BRICK);
      }
    }

    const allTanks = this.getAllTanks();

    if (this.mode === GAME_MODE.COOP) {
      const maxSimultaneous = 3 + this.players.length;
      let activeCount = 0;
      for (const e of this.enemies) if (e.alive) activeCount++;

      if (this.enemyQueue.length > 0 && activeCount < maxSimultaneous) {
        this.enemySpawnTimer -= dt;
        if (this.enemySpawnTimer <= 0) {
          const sp = COOP_ENEMY_SPAWNS[this.totalEnemiesSpawned % COOP_ENEMY_SPAWNS.length];
          const pos = macroToWorld(sp.tx, sp.ty);
          if (!this.collision.isPointOccupiedByTank(pos.x, pos.z, TANK_RADIUS * 1.4, allTanks)) {
            const nextIdx = this.totalEnemiesSpawned;
            const type = this.enemyQueue.shift();
            this.spawnEnemyEntity(type, pos.x, pos.z, sp.yaw, BONUS_ENEMY_INDICES.has(nextIdx));
            this.enemySpawnTimer = Math.max(1.6, 3.4 - this.players.length * 0.35);
          } else {
            this.enemySpawnTimer = 0.5;
          }
        }
      }
    } else {
      this.versusCrateTimer -= dt;
      if (this.versusCrateTimer <= 0 && this.powerups.crates.length < 3) {
        this.powerups.spawnRandomCrate(this.mode, allTanks);
        this.versusCrateTimer = 9.5;
      }
    }

    // Update Players (human or AI Wingman)
    for (const p of this.players) {
      this._updatePlayer(p, allTanks, dt);
    }

    // Update Enemies / Bots
    for (const e of this.enemies) {
      if (!e.alive) {
        if (this.mode === GAME_MODE.VERSUS && e.respawnTimer > 0) {
          e.respawnTimer -= dt;
          if (e.respawnTimer <= 0) {
            const sp = this._pickFarthestVersusSpawn(e);
            const pos = macroToWorld(sp.tx, sp.ty);
            e.x = pos.x; e.z = pos.z; e.yaw = sp.yaw;
            e.hp = e.maxHp; e.shieldTimer = 2.0; e.alive = true;
            if (e.rig) e.rig.root.visible = true;
            this.bus.emit(EVENTS.TANK_SPAWNED, { tank: e, x: e.x, z: e.z });
          }
        }
        continue;
      }

      if (e.isBonus && e.rig) {
        const flash = Math.floor(this.elapsed * 7) % 2 === 0;
        e.rig.hullMat.color.setHex(flash ? 0xf43f5e : 0xfacc15);
      }

      this.ai.updateEnemy(e, this.players, this.enemies, allTanks, this.mode, this.freezeTimer, dt, this.elapsed);
      this.tankBuilder.syncRig(e, dt);
    }

    // Update Shells & Sync Shell Meshes
    this.combat.updateShells(dt, {
      players: this.players,
      enemies: this.enemies,
      mode: this.mode,
      eagleAlive: this.eagleAlive,
      onEagleDestroyed: () => this._destroyEagleBase(),
      onBonusHit: (victim) => {
        if (victim.rig) victim.rig.hullMat.color.setHex(0xffffff);
        this.powerups.spawnRandomCrate(this.mode, this.getAllTanks());
      },
    });
    this.effects.syncShells(this.combat.shells);

    // Update Powerup Crates & Sync Crate Meshes
    this.powerups.update(dt, this.players, this._powerupCtx);
    this.effects.syncCrates(this.powerups.crates, dt, this.elapsed);

    // Check Win / Loss Outcomes
    this._checkMatchOutcomes();
  }

  _updatePlayer(p, allTanks, dt) {
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt * 2.4);
    if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 3.5);

    if (!p.alive) {
      if (!p.eliminated) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          this._setPlayerTier(p, p.weaponTier); // ensure rig matches tier after death penalty
          this.spawnPlayerAtPad(p, p.index, false);
        }
      }
      this.cameraSystem.updatePlayerCamera(p, dt);
      return;
    }

    if (p.shieldTimer > 0) p.shieldTimer = Math.max(0, p.shieldTimer - dt);
    if (p.rapidTimer > 0) p.rapidTimer = Math.max(0, p.rapidTimer - dt);
    if (p.reloadTimer > 0) p.reloadTimer = Math.max(0, p.reloadTimer - dt);

    const cmd = p.isAIControlled
      ? this.ai.computeWingmanCommand(p, this.enemies, this.powerups.crates, dt)
      : this.input.readPlayerCommand(p);

    this.movement.updateTank(p, cmd, allTanks, dt, this.elapsed);
    this.combat.updateAutoAimTurret(p, this.players, this.enemies, this.mode, dt);

    if (cmd.fire && p.reloadTimer <= 0) {
      this.combat.fireCannon(p, this.mode);
    }
    if (cmd.action) {
      this.combat.handleWallGrabDrop(p, allTanks);
    }

    this.tankBuilder.syncRig(p, dt);
    this.cameraSystem.updatePlayerCamera(p, dt);
  }

  _destroyEagleBase() {
    if (!this.eagleAlive) return;
    this.eagleAlive = false;
    this.arenaGrid.markEagleDead();
    this.arenaRenderer.buildEagleMonument(false);

    const cx = 13 * CELL_SIZE;
    const cz = 25 * CELL_SIZE;
    this.bus.emit(EVENTS.EAGLE_DESTROYED, { x: cx, z: cz });

    this.isVictory = false;
    this.victoryBanner = 'EAGLE CORE DESTROYED — GAME OVER';
    this.state = 'GAME_OVER';
  }

  _checkMatchOutcomes() {
    if (this.mode === GAME_MODE.COOP) {
      if (!this.players.some((p) => !p.eliminated)) {
        this.isVictory = false;
        this.victoryBanner = 'ALL TANKS DESTROYED — GAME OVER';
        this.state = 'GAME_OVER';
        this.bus.emit(EVENTS.GAME_OVER, { isVictory: false });
        return;
      }
      if (this.enemiesRemainingCount() === 0) {
        this.state = 'STAGE_CLEAR';
        this.stateTimer = 2.6;
        this.bus.emit(EVENTS.STAGE_CLEARED, { stage: this.stage });
      }
    } else {
      for (const p of this.players) {
        if (p.frags >= VERSUS_TARGET_FRAGS) {
          this.isVictory = true;
          this.victoryBanner = `${p.tag} WINS THE ARENA! (${p.frags} FRAGS)`;
          this.state = 'GAME_OVER';
          this.bus.emit(EVENTS.GAME_OVER, { isVictory: true });
          return;
        }
      }
      for (const e of this.enemies) {
        if (e.frags >= VERSUS_TARGET_FRAGS) {
          this.isVictory = false;
          this.victoryBanner = `${e.label} WINS THE ARENA!`;
          this.state = 'GAME_OVER';
          this.bus.emit(EVENTS.GAME_OVER, { isVictory: false });
          return;
        }
      }
    }
  }

  _render() {
    const { cssW, cssH, dpr } = this;
    if (this.state === 'MENU') {
      this.sceneManager.renderMenuPreview(cssW, cssH, this.elapsed);
      this.hud.render(this, [], cssW, cssH, dpr);
      return;
    }

    if (this.cameraSystem.isFullMapMode()) {
      let maxShake = 0;
      for (const p of this.players) maxShake = Math.max(maxShake, p.shake || 0);
      this.sceneManager.renderFullMap(cssW, cssH, this.cameraSystem, maxShake);
      this.hud.render(this, [], cssW, cssH, dpr);
      return;
    }

    const activeViewPlayers = this.getViewportPlayers();
    const viewports = computeViewports(activeViewPlayers.length, cssW, cssH);
    this.sceneManager.renderSplitScreen(cssW, cssH, activeViewPlayers, viewports, this.cameraSystem);
    this.hud.render(this, viewports, cssW, cssH, dpr);
  }
}
