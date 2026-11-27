import { GAME_MODE, APP_VERSION } from '../config/constants.js';
import { ARENA_TEMPLATES } from '../config/arenas.js';

// Icon and label live in separate spans so the touch layout can collapse the toolbar to icons
// (the label stays in the accessible name). On desktop the button text is unchanged.
function setToolbarLabel(el, icon, label) {
  const iconEl = document.createElement('span');
  iconEl.className = 'tb-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon;
  const labelEl = document.createElement('span');
  labelEl.className = 'tb-label';
  labelEl.textContent = ` ${label}`;
  el.replaceChildren(iconEl, labelEl);
}

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
    this.game.onNetworkStatusChanged = () => {
      this.syncNetworkUI();
    };
    this.game.onRemoteLobbyUpdated = () => {
      this.syncMenuUI();
    };

    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = APP_VERSION;

    this._bindToolbar();
    this._bindMenuOptions();
    this._bindNetworkControls();
    this.syncMenuUI();
    this.syncNetworkUI();
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
    const btnNetStatus = document.getElementById('btn-net-status');
    if (btnNetStatus) {
      btnNetStatus.addEventListener('click', (e) => {
        if (this.game.state !== 'MENU') this.game.openMenu();
        e.currentTarget.blur();
      });
    }
  }

  _bindMenuOptions() {
    document.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.game.network.isGuest()) return;
        this.game.mode = btn.dataset.mode;
        if (this.game.mode === GAME_MODE.VERSUS) {
          this.game.aiWingman = false;
          if (this.game.playerCount === 1 && this.game.versusBotCount === 0) {
            this.game.versusBotCount = 3;
          }
        }
        this.syncMenuUI();
        this.game.loadMenuPreviewArena();
        this.game.syncLobbyToGuest();
      });
    });

    document.querySelectorAll('[data-players]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.players;
        if (val === 'LAN') {
          this.game.networkMode = true;
          this.game.playerCount = 2;
          this.game.aiWingman = false;
        } else {
          this.game.networkMode = false;
          if (this.game.network.isNetworked()) {
            this.game.network.disconnect();
          }
          if (val === '1AI') {
            this.game.playerCount = 1;
            this.game.aiWingman = true;
            this.game.mode = GAME_MODE.COOP;
          } else {
            this.game.playerCount = parseInt(val, 10);
            this.game.aiWingman = false;
          }
        }
        if (this.game.mode === GAME_MODE.VERSUS && this.game.playerCount === 1 && this.game.versusBotCount === 0) {
          this.game.versusBotCount = 3;
        }
        this.syncMenuUI();
        this.syncNetworkUI();
      });
    });

    document.querySelectorAll('[data-p1-nation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.game.network.isGuest()) return;
        this.game.playerNations[0] = btn.dataset.p1Nation;
        this.syncMenuUI();
        this.game.loadMenuPreviewArena();
        this.game.syncLobbyToGuest();
      });
    });

    document.querySelectorAll('[data-p2-nation]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.game.network.isGuest()) {
          const slot = this.game.network.localPlayerIndex || 1;
          this.game.playerNations[slot] = btn.dataset.p2Nation;
          this.syncMenuUI();
          if (this.game.network.isConnected()) {
            this.game.network.send({ type: 'guest_nation', nation: this.game.playerNations[slot] });
          }
        } else {
          this.game.playerNations[1] = btn.dataset.p2Nation;
          this.syncMenuUI();
          this.game.syncLobbyToGuest();
        }
      });
    });

    document.querySelectorAll('[data-bots]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.game.network.isGuest()) return;
        this.game.versusBotCount = parseInt(btn.dataset.bots, 10);
        if (this.game.mode === GAME_MODE.VERSUS && this.game.playerCount === 1 && this.game.versusBotCount === 0) {
          this.game.versusBotCount = 2;
        }
        this.syncMenuUI();
        this.game.syncLobbyToGuest();
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
      if (this.game.network.isGuest()) {
        stageSelect.value = String(this.game.selectedStage);
        return;
      }
      this.game.selectedStage = parseInt(stageSelect.value, 10);
      this.game.loadMenuPreviewArena();
      this.game.syncLobbyToGuest();
    });

    document.getElementById('btn-launch').addEventListener('click', () => {
      this.game.startMatch();
    });
  }

  _bindNetworkControls() {
    const btnHost = document.getElementById('btn-net-host');
    const btnJoin = document.getElementById('btn-net-join');
    const btnDisconnect = document.getElementById('btn-net-disconnect');
    const btnCopy = document.getElementById('btn-copy-invite');
    const roomInput = document.getElementById('net-room-input');

    if (btnHost) {
      btnHost.addEventListener('click', () => {
        this.game.networkMode = true;
        this.game.playerCount = 2;
        this.game.aiWingman = false;
        this.game.network.hostRoom();
        this.syncMenuUI();
        this.syncNetworkUI();
      });
    }

    const doJoin = () => {
      const code = roomInput ? roomInput.value : '';
      this.game.networkMode = true;
      this.game.playerCount = 2;
      this.game.aiWingman = false;
      this.game.network.joinRoom(code);
      this.syncMenuUI();
      this.syncNetworkUI();
    };

    if (btnJoin) {
      btnJoin.addEventListener('click', doJoin);
    }
    if (roomInput) {
      roomInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doJoin();
      });
    }
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => {
        this.game.network.disconnect();
        this.syncNetworkUI();
      });
    }
    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const url = this.game.network.getInviteUrl();
        if (!url) return;
        try {
          await navigator.clipboard.writeText(url);
          btnCopy.textContent = '✅ Link Copied!';
          setTimeout(() => { btnCopy.textContent = '📋 Copy Invite Link'; }, 1800);
        } catch {
          window.prompt('Copy and share this invite link:', url);
        }
      });
    }
  }

  openLanJoinFromUrl(code) {
    const clean = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean) return;
    this.game.networkMode = true;
    this.game.playerCount = 2;
    this.game.aiWingman = false;
    const roomInput = document.getElementById('net-room-input');
    if (roomInput) roomInput.value = clean;
    this.syncMenuUI();
    this.game.network.joinRoom(clean);
    this.syncNetworkUI();
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
      const active = this.game.networkMode
        ? b.dataset.players === 'LAN'
        : this.game.aiWingman
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
    const guestSlot = this.game.network.isGuest() ? (this.game.network.localPlayerIndex || 1) : 1;
    document.querySelectorAll('[data-p2-nation]').forEach((b) => {
      const active = b.dataset.p2Nation === this.game.playerNations[guestSlot];
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

    const lanPanel = document.getElementById('lan-panel');
    if (lanPanel) {
      lanPanel.hidden = !this.game.networkMode;
    }
  }

  syncNetworkUI() {
    const net = this.game.network;
    const lanPanel = document.getElementById('lan-panel');
    const hostBox = document.getElementById('net-host-box');
    const codeDisplay = document.getElementById('net-code-display');
    const statusText = document.getElementById('net-status-text');
    const btnDisconnect = document.getElementById('btn-net-disconnect');
    const btnLaunch = document.getElementById('btn-launch');
    const btnNetBadge = document.getElementById('btn-net-status');

    if (lanPanel) lanPanel.hidden = !this.game.networkMode;
    if (btnDisconnect) btnDisconnect.hidden = !net.isNetworked();
    if (hostBox) hostBox.hidden = !net.isHost() || !net.roomCode;
    if (codeDisplay && net.roomCode) codeDisplay.textContent = net.roomCode;

    if (statusText) {
      statusText.classList.remove('connected', 'error');
      if (net.status === 'connected') {
        const pingTag = net.pingMs !== null ? ` (${net.pingMs} ms)` : '';
        statusText.textContent = `✅ ${net.statusMessage}${pingTag}`;
        statusText.classList.add('connected');
      } else if (net.status === 'error') {
        statusText.textContent = `⚠️ ${net.statusMessage}`;
        statusText.classList.add('error');
      } else if (net.statusMessage) {
        statusText.textContent = `⏳ ${net.statusMessage}`;
      } else {
        statusText.textContent = 'Click Host Room on PC 1, then enter the code (or open the invite link) on PCs 2-4.';
      }
    }

    if (btnLaunch) {
      if (!this.game.networkMode) {
        btnLaunch.disabled = false;
        btnLaunch.textContent = 'DEPLOY TO BATTLEFIELD ▶';
      } else if (net.isHost() && net.isConnected()) {
        const count = net.getConnectedTotalPlayers();
        btnLaunch.disabled = false;
        btnLaunch.textContent = `DEPLOY ${count}P LAN MATCH ▶`;
      } else if (net.isHost()) {
        btnLaunch.disabled = true;
        btnLaunch.textContent = `WAITING FOR PLAYERS (ROOM ${net.roomCode || '...'})`;
      } else if (net.isGuest() && net.isConnected()) {
        btnLaunch.disabled = true;
        btnLaunch.textContent = `CONNECTED AS ${net.localPlayerIndex + 1}P · WAITING FOR HOST...`;
      } else {
        btnLaunch.disabled = true;
        btnLaunch.textContent = 'HOST OR JOIN A ROOM ABOVE TO DEPLOY';
      }
    }

    if (btnNetBadge) {
      if (net.isNetworked()) {
        btnNetBadge.hidden = false;
        const ping = net.pingMs !== null ? ` · ${net.pingMs}ms` : '';
        const roleTag = net.isHost()
          ? `1P HOST (${net.getConnectedTotalPlayers()}P)`
          : `${net.localPlayerIndex + 1}P GUEST`;
        btnNetBadge.textContent = net.isConnected()
          ? `🌐 ${roleTag} · ${net.roomCode}${ping}`
          : `🌐 ${roleTag} · ${net.roomCode || '...'}`;
        btnNetBadge.classList.toggle('connected', net.isConnected());
      } else {
        btnNetBadge.hidden = true;
      }
    }
  }

  syncHeaderButtons() {
    const preset = this.game.cameraSystem.getPreset();
    setToolbarLabel(document.getElementById('btn-camera'), '🎥', `${preset.name} (V)`);
    setToolbarLabel(
      document.getElementById('btn-gps'), '🧭',
      this.game.gpsHeadingUp ? 'GPS: Heading-Up (Tab)' : 'GPS: North-Up (Tab)'
    );
    setToolbarLabel(document.getElementById('btn-hud'), '📋', this.game.showStatusCards ? 'HUD: On (H)' : 'HUD: Off (H)');
    const muted = this.game.sound.muted;
    setToolbarLabel(document.getElementById('btn-mute'), muted ? '🔇' : '🔊', muted ? 'Muted (M)' : 'Sound (M)');
    const paused = this.game.paused;
    setToolbarLabel(document.getElementById('btn-pause'), paused ? '▶' : '⏸', paused ? 'Resume (P)' : 'Pause (P)');
    setToolbarLabel(document.getElementById('btn-menu'), '🏠', 'Menu (Esc)');
  }

  updateGamepadStatusUI(pads, targetTag) {
    const btnJoy = document.getElementById('btn-joystick');
    const menuHint = document.getElementById('menu-joy-status');
    if (btnJoy) {
      if (pads.length > 0) {
        setToolbarLabel(btnJoy, '🎮', `${pads.length}x Pad → ${targetTag}`);
        btnJoy.classList.add('connected');
        btnJoy.title = `Connected: ${pads.map((p) => p.id).join(', ')} (Click to switch 1P/2P)`;
      } else {
        setToolbarLabel(btnJoy, '🎮', 'Joystick: Press Button');
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
