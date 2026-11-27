import { GAME_MODE } from '../config/constants.js';
import { ARENA_TEMPLATES } from '../config/arenas.js';

/**
 * DOM Menu & Toolbar UI Controller (Single Responsibility Principle).
 * Owns all DOM event listeners and keeps `aria-pressed` / visual states synced
 * with GameEngine without mixing DOM manipulation into simulation code.
 */
export class MenuController {
  constructor(game) {
    this.game = game;
    this.menuOverlay = document.getElementById('menu-overlay');

    this.game.onStateChanged = () => {
      this.syncHeaderButtons();
      this.syncMenuOverlayVisibility();
    };
    this.game.onGamepadStatusChanged = (pads, targetTag) => {
      this.updateGamepadStatusUI(pads, targetTag);
    };

    this._bindToolbar();
    this._bindMenuOptions();
    this.syncMenuUI();
    this.syncHeaderButtons();
  }

  _bindToolbar() {
    document.getElementById('btn-joystick').addEventListener('click', (e) => {
      this.game.input.setJoystickOffset(this.game.input.joystickOffset === 0 ? 1 : 0);
      this.syncMenuUI();
      e.currentTarget.blur();
    });
    document.getElementById('btn-camera').addEventListener('click', (e) => {
      this.game.cycleCameraPreset();
      e.currentTarget.blur();
    });
    document.getElementById('btn-gps').addEventListener('click', (e) => {
      this.game.toggleGpsMode();
      e.currentTarget.blur();
    });
    document.getElementById('btn-hud').addEventListener('click', (e) => {
      this.game.toggleStatusCards();
      e.currentTarget.blur();
    });
    document.getElementById('btn-mute').addEventListener('click', (e) => {
      this.game.toggleMute();
      e.currentTarget.blur();
    });
    document.getElementById('btn-pause').addEventListener('click', (e) => {
      this.game.togglePause();
      e.currentTarget.blur();
    });
    document.getElementById('btn-menu').addEventListener('click', (e) => {
      this.game.openMenu();
      e.currentTarget.blur();
    });
  }

  _bindMenuOptions() {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.mode = btn.dataset.mode;
        if (this.game.mode === GAME_MODE.VERSUS) {
          this.game.aiWingman = false;
          if (this.game.playerCount === 1 && this.game.versusBotCount === 0) {
            this.game.versusBotCount = 3;
          }
        }
        this.syncMenuUI();
        this.game.loadMenuPreviewArena();
      });
    });

    document.querySelectorAll('[data-players]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.players;
        if (val === '1AI') {
          this.game.playerCount = 1;
          this.game.aiWingman = true;
          this.game.mode = GAME_MODE.COOP;
        } else {
          this.game.playerCount = parseInt(val, 10);
          this.game.aiWingman = false;
        }
        if (this.game.mode === GAME_MODE.VERSUS && this.game.playerCount === 1 && this.game.versusBotCount === 0) {
          this.game.versusBotCount = 3;
        }
        this.syncMenuUI();
      });
    });

    document.querySelectorAll('[data-p1-nation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.playerNations[0] = btn.dataset.p1Nation;
        this.syncMenuUI();
        this.game.loadMenuPreviewArena();
      });
    });

    document.querySelectorAll('[data-p2-nation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.playerNations[1] = btn.dataset.p2Nation;
        this.syncMenuUI();
      });
    });

    document.querySelectorAll('[data-bots]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.versusBotCount = parseInt(btn.dataset.bots, 10);
        if (this.game.mode === GAME_MODE.VERSUS && this.game.playerCount === 1 && this.game.versusBotCount === 0) {
          this.game.versusBotCount = 2;
        }
        this.syncMenuUI();
      });
    });

    document.querySelectorAll('[data-joy-offset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.input.setJoystickOffset(parseInt(btn.dataset.joyOffset, 10) || 0);
        this.syncMenuUI();
      });
    });

    const stageSelect = document.getElementById('stage-select');
    stageSelect.innerHTML = ARENA_TEMPLATES.map(
      (a) => `<option value="${a.id}">Arena ${a.id}: ${a.name}</option>`
    ).join('');
    stageSelect.addEventListener('change', () => {
      this.game.selectedStage = parseInt(stageSelect.value, 10);
      this.game.loadMenuPreviewArena();
    });

    document.getElementById('btn-launch').addEventListener('click', () => {
      this.game.startMatch();
    });
  }

  syncMenuOverlayVisibility() {
    this.menuOverlay.hidden = this.game.state !== 'MENU';
  }

  syncMenuUI() {
    document.querySelectorAll('[data-mode]').forEach((b) => {
      const active = b.dataset.mode === this.game.mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-players]').forEach((b) => {
      const active = this.game.aiWingman
        ? b.dataset.players === '1AI'
        : parseInt(b.dataset.players, 10) === this.game.playerCount;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-p1-nation]').forEach((b) => {
      const active = b.dataset.p1Nation === this.game.playerNations[0];
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-p2-nation]').forEach((b) => {
      const active = b.dataset.p2Nation === this.game.playerNations[1];
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-bots]').forEach((b) => {
      const active = parseInt(b.dataset.bots, 10) === this.game.versusBotCount;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-joy-offset]').forEach((b) => {
      const active = parseInt(b.dataset.joyOffset, 10) === this.game.input.joystickOffset;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });

    document.getElementById('versus-bots-row').hidden = this.game.mode !== GAME_MODE.VERSUS;
    document.getElementById('stage-select').value = String(this.game.selectedStage);
  }

  syncHeaderButtons() {
    const preset = this.game.cameraSystem.getPreset();
    document.getElementById('btn-camera').textContent = `🎥 ${preset.name} (V)`;
    document.getElementById('btn-gps').textContent = this.game.gpsHeadingUp
      ? '🧭 GPS: Heading-Up (Tab)'
      : '🧭 GPS: North-Up (Tab)';
    document.getElementById('btn-hud').textContent = this.game.showStatusCards
      ? '📋 HUD: On (H)'
      : '📋 HUD: Off (H)';
    document.getElementById('btn-mute').textContent = this.game.sound.muted
      ? '🔇 Muted (M)'
      : '🔊 Sound (M)';
    document.getElementById('btn-pause').textContent = this.game.paused
      ? '▶ Resume (P)'
      : '⏸ Pause (P)';
  }

  updateGamepadStatusUI(pads, targetTag) {
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
        menuHint.textContent = `Connected: ${shortName} (${pads.length} active — mapped starting at ${targetTag}. Press Start to deploy!)`;
        menuHint.classList.add('connected');
      } else {
        menuHint.textContent = 'Plug in any USB/Bluetooth joystick or gamepad & press a button to wake it.';
        menuHint.classList.remove('connected');
      }
    }
  }
}
