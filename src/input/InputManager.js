import { clamp, applyDeadzone } from '../core/MathUtils.js';
import { PLAYER_CONFIGS } from '../config/constants.js';

const PREVENT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab',
]);

/**
 * Unified InputManager (Interface Segregation + Single Responsibility).
 * Abstracts 4P Keyboard, P1 Mouse, and HTML5 Gamepad API (analog stick deadzones,
 * D-Pad, USB flight-stick POV hat, dual-rumble haptics) into a clean per-player
 * Command { throttle, turn, fire, action } interface.
 */
export class InputManager {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.keysDown = new Set();
    this.keysJustPressed = new Set();
    this.mouseDown = new Set();
    this.mouseJustPressed = new Set();

    this.joystickOffset = 0; // 0 => Pad 1 -> 1P; 1 => Pad 1 -> 2P
    this._gpStartLatch = false;
    this._gpViewLatch = false;
    this._lastJoySignature = '';
    this._actionLatches = new Map();

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (PREVENT_KEYS.has(e.code)) {
        e.preventDefault();
      }
      if (!this.keysDown.has(e.code)) {
        this.keysJustPressed.add(e.code);
      }
      this.keysDown.add(e.code);

      if (this.callbacks.onKeyDown) {
        this.callbacks.onKeyDown(e.code);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.clearAll();
    });

    if (this.canvas) {
      this.canvas.addEventListener('mousedown', (e) => {
        if (this.callbacks.isPlaying && !this.callbacks.isPlaying()) return;
        if (e.button === 0 || e.button === 2) {
          e.preventDefault();
          if (!this.mouseDown.has(e.button)) {
            this.mouseJustPressed.add(e.button);
          }
          this.mouseDown.add(e.button);
        }
      });

      this.canvas.addEventListener('contextmenu', (e) => {
        if (this.callbacks.isPlaying && this.callbacks.isPlaying()) {
          e.preventDefault();
        }
      });
    }

    window.addEventListener('mouseup', (e) => {
      this.mouseDown.delete(e.button);
    });

    window.addEventListener('gamepadconnected', () => {
      this._lastJoySignature = '';
      this.pollGlobalGamepad();
    });
    window.addEventListener('gamepaddisconnected', () => {
      this._lastJoySignature = '';
      this.pollGlobalGamepad();
    });
  }

  clearAll() {
    this.keysDown.clear();
    this.keysJustPressed.clear();
    this.mouseDown.clear();
    this.mouseJustPressed.clear();
  }

  endFrame() {
    this.keysJustPressed.clear();
    this.mouseJustPressed.clear();
  }

  isAnyDown(codes) {
    for (const code of codes) {
      if (this.keysDown.has(code)) return true;
    }
    return false;
  }

  isAnyJustPressed(codes) {
    for (const code of codes) {
      if (this.keysJustPressed.has(code)) return true;
    }
    return false;
  }

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

  triggerRumble(playerIndex, durationMs = 75, strong = 0.45, weak = 0.25) {
    const gp = this.getGamepadForPlayer(playerIndex);
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

  setJoystickOffset(offset) {
    this.joystickOffset = offset ? 1 : 0;
    this._lastJoySignature = '';
    this.pollGlobalGamepad();
  }

  pollGlobalGamepad() {
    const pads = this.getConnectedGamepads();
    const targetTag = this.joystickOffset === 0 ? '1P' : '2P';
    const sig = `${pads.length}:${pads.map((g) => g.id).join('|')}:${targetTag}`;
    if (sig !== this._lastJoySignature) {
      this._lastJoySignature = sig;
      if (this.callbacks.onGamepadStatusChanged) {
        this.callbacks.onGamepadStatusChanged(pads, targetTag);
      }
    }

    if (pads.length > 0) {
      const p0 = pads[0];
      const startPressed = Boolean(p0.buttons[9]?.pressed);
      if (startPressed && !this._gpStartLatch) {
        this._gpStartLatch = true;
        if (this.callbacks.onGamepadStart) this.callbacks.onGamepadStart();
      } else if (!startPressed) {
        this._gpStartLatch = false;
      }

      const viewPressed = Boolean(p0.buttons[8]?.pressed || p0.buttons[11]?.pressed);
      if (viewPressed && !this._gpViewLatch) {
        this._gpViewLatch = true;
        if (this.callbacks.onGamepadView) this.callbacks.onGamepadView();
      } else if (!viewPressed) {
        this._gpViewLatch = false;
      }
    }
  }

  readPlayerCommand(player, usePrimaryControls = false) {
    let throttle = 0;
    let turn = 0;
    let fire = false;
    let action = false;

    const keys = usePrimaryControls ? PLAYER_CONFIGS[0].keys : player.keys;
    if (this.isAnyDown(keys.forward)) throttle += 1;
    if (this.isAnyDown(keys.backward)) throttle -= 1;
    if (this.isAnyDown(keys.left)) turn += 1;
    if (this.isAnyDown(keys.right)) turn -= 1;
    if (this.isAnyDown(keys.fire)) fire = true;
    if (this.isAnyJustPressed(keys.action)) action = true;

    // Convenient Space/E fallback when using single-screen primary controls (e.g. LAN Guest)
    if (usePrimaryControls) {
      if (this.keysDown.has('Space')) fire = true;
      if (this.keysJustPressed.has('KeyE')) action = true;
    }

    // Primary Player Mouse controls (P1 local, or Guest in full-screen LAN mode)
    if (usePrimaryControls || player.index === 0) {
      if (this.mouseDown.has(0) || this.mouseJustPressed.has(0)) fire = true;
      if (this.mouseJustPressed.has(2)) action = true;
    }

    // Universal Gamepad / Flight-Stick support
    const padPlayerIdx = usePrimaryControls ? 0 : player.index;
    const gp = this.getGamepadForPlayer(padPlayerIdx);
    if (gp) {
      const stickX = applyDeadzone(gp.axes[0] || 0, 0.16);
      const stickY = applyDeadzone(gp.axes[1] || 0, 0.16);
      if (stickY !== 0) throttle = clamp(-stickY, -1, 1);
      if (stickX !== 0) turn = clamp(-stickX, -1, 1);

      if (gp.buttons[12]?.pressed) throttle = 1;
      if (gp.buttons[13]?.pressed) throttle = -1;
      if (gp.buttons[14]?.pressed) turn = 1;
      if (gp.buttons[15]?.pressed) turn = -1;

      if (typeof gp.axes[9] === 'number' && Math.abs(gp.axes[9]) <= 1.05) {
        const hat = gp.axes[9];
        const angle = (hat + 1) * 0.875 * Math.PI;
        const hx = Math.sin(angle);
        const hy = Math.cos(angle);
        if (Math.abs(hy) > 0.35) throttle = Math.sign(hy);
        if (Math.abs(hx) > 0.35) turn = -Math.sign(hx);
      }

      if (
        gp.buttons[0]?.pressed ||
        gp.buttons[2]?.pressed ||
        gp.buttons[5]?.pressed ||
        (gp.buttons[7] && (gp.buttons[7].pressed || gp.buttons[7].value > 0.45))
      ) {
        fire = true;
      }

      const grabPressed = Boolean(
        gp.buttons[1]?.pressed ||
        gp.buttons[3]?.pressed ||
        gp.buttons[4]?.pressed ||
        (gp.buttons[6] && (gp.buttons[6].pressed || gp.buttons[6].value > 0.55))
      );
      const prevLatch = this._actionLatches.get(padPlayerIdx) || false;
      if (grabPressed && !prevLatch) {
        action = true;
      }
      this._actionLatches.set(padPlayerIdx, grabPressed);
    }

    return {
      throttle: clamp(throttle, -1, 1),
      turn: clamp(turn, -1, 1),
      fire,
      action,
    };
  }
}
