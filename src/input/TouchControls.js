import { clamp, applyDeadzone } from '../core/MathUtils.js';

const STICK_AXIS_DEADZONE = 0.14;
// How far the knob may travel from the ring's center, as a fraction of the ring's diameter.
const STICK_TRAVEL = 0.36;
// Ignore stage taps this long after the controls hide, so a thumb still hammering Fire when the
// match ends cannot instantly restart it.
const STAGE_TAP_GRACE_MS = 900;

// Keeps a finger's move/up events on the control it started on, even if it slides off.
// Throws if the pointer already ended (or is synthetic), which must not break the handler.
function capturePointer(el, pointerId) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // Pointer is gone; its pointerup / pointercancel still clears the state.
  }
}

/** iPhone / iPod / iPad, including iPadOS 13+ which reports a desktop "Macintosh" user agent. */
export function isAppleTouchDevice(nav = navigator) {
  const ua = nav.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1;
}

export function hasTouchScreen(nav = navigator) {
  return (nav.maxTouchPoints || 0) > 0;
}

/**
 * Whether to show the on-screen joystick & buttons. `?touch=1` / `?touch=0` overrides detection
 * (handy with a desktop browser's device emulation). To enable touch controls on every touch
 * device (Android phones & tablets, touch laptops), return `hasTouchScreen()` instead.
 */
export function shouldUseTouchControls(search = window.location.search) {
  const override = new URLSearchParams(search).get('touch');
  if (override === '1') return true;
  if (override === '0') return false;
  return isAppleTouchDevice();
}

/**
 * On-screen touch controls for the primary local player (Single Responsibility).
 * A floating analog joystick (left thumb) plus held Fire and edge-triggered Grab buttons
 * (right thumb). Every finger is tracked by its own pointerId, so steering, holding Fire and
 * tapping Grab all work at once. InputManager reads it like any other input source.
 */
export class TouchControls {
  constructor(root, { stage } = {}) {
    this.root = root;
    this.stage = stage || root.parentElement;
    this.stickZone = root.querySelector('[data-touch="stick"]');
    this.stickBase = root.querySelector('.touch-stick-base');
    this.stickKnob = root.querySelector('.touch-stick-knob');
    this.fireBtn = root.querySelector('[data-touch="fire"]');
    this.grabBtn = root.querySelector('[data-touch="grab"]');

    this.active = false;
    this.onStageTap = null;
    this.onPortrait = null;

    this._stick = { x: 0, y: 0 };
    this._stickPointer = null;
    this._stickCenter = { x: 0, y: 0 };
    this._stickTravel = 1;
    this._firePointers = new Set();
    this._grabPointers = new Set();
    this._fireJustPressed = false;
    this._grabJustPressed = false;
    this._hiddenAt = 0;
    this._hudReserve = { bottom: 0, bottomLeft: 0 };

    document.documentElement.classList.add('touch-ui');
    this.root.hidden = false;
    this._bindEvents();
    this._measure();
  }

  // ==========================================================================
  // Input source API (read by InputManager once per frame)
  // ==========================================================================
  read() {
    return {
      throttle: -this._stick.y,
      turn: -this._stick.x,
      fire: this._firePointers.size > 0 || this._fireJustPressed,
      action: this._grabJustPressed,
    };
  }

  endFrame() {
    this._fireJustPressed = false;
    this._grabJustPressed = false;
  }

  reset() {
    this._releaseStick();
    this._firePointers.clear();
    this._grabPointers.clear();
    this._fireJustPressed = false;
    this._grabJustPressed = false;
    this.fireBtn.classList.remove('is-pressed');
    this.grabBtn.classList.remove('is-pressed');
  }

  /** Shown only while a match is actually being played (not in menus, intros or while paused). */
  setActive(active) {
    if (active === this.active) return;
    this.active = active;
    this.root.classList.toggle('is-active', active);
    if (active) {
      this._measure();
    } else {
      this.reset();
      this._hiddenAt = performance.now();
    }
  }

  /** CSS px the HUD should keep clear: the home-indicator strip, and the joystick while shown. */
  getHudReserve() {
    return {
      bottom: this._hudReserve.bottom,
      bottomLeft: this.active ? this._hudReserve.bottomLeft : 0,
    };
  }

  // ==========================================================================
  // DOM Events
  // ==========================================================================
  _bindEvents() {
    const stick = this.stickZone;
    stick.addEventListener('pointerdown', (e) => this._onStickDown(e));
    stick.addEventListener('pointermove', (e) => this._onStickMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      stick.addEventListener(type, (e) => {
        if (e.pointerId === this._stickPointer) this._releaseStick();
      });
    }

    this._bindButton(this.fireBtn, this._firePointers, () => { this._fireJustPressed = true; });
    this._bindButton(this.grabBtn, this._grabPointers, () => { this._grabJustPressed = true; });

    // Block iOS long-press callouts, text-selection loupes, double-tap zoom and the emulated mouse
    // events (which would otherwise reach the canvas' mouse-fire handler) on the controls & 3D view.
    const blockTouchDefaults = (e) => e.preventDefault();
    for (const el of [stick, this.fireBtn, this.grabBtn]) {
      el.addEventListener('touchstart', blockTouchDefaults, { passive: false });
      el.addEventListener('contextmenu', blockTouchDefaults);
    }
    const glCanvas = this.stage.querySelector('#gl-canvas');
    if (glCanvas) {
      glCanvas.addEventListener('touchstart', blockTouchDefaults, { passive: false });
      glCanvas.addEventListener('pointerdown', (e) => {
        if (this.active || !this.onStageTap) return;
        if (performance.now() - this._hiddenAt < STAGE_TAP_GRACE_MS) return;
        this.onStageTap(e);
      });
    }
    // iOS Safari pinch gesture events (not covered by touch-action on older WebKit)
    document.addEventListener('gesturestart', (e) => {
      if (this.active) e.preventDefault();
    });

    window.addEventListener('resize', () => this._measure());
    window.addEventListener('blur', () => this.reset());

    const portrait = window.matchMedia('(orientation: portrait)');
    const onOrientation = () => {
      this._measure();
      if (portrait.matches && this.onPortrait) this.onPortrait();
    };
    if (portrait.addEventListener) portrait.addEventListener('change', onOrientation);
    else if (portrait.addListener) portrait.addListener(onOrientation);
  }

  _bindButton(btn, pointers, onPress) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!this.active) return;
      capturePointer(btn, e.pointerId);
      if (pointers.size === 0) onPress();
      pointers.add(e.pointerId);
      btn.classList.add('is-pressed');
    });
    const release = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      if (pointers.size === 0) btn.classList.remove('is-pressed');
    };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  }

  _onStickDown(e) {
    e.preventDefault();
    if (!this.active || this._stickPointer !== null) return;
    this._stickPointer = e.pointerId;
    capturePointer(this.stickZone, e.pointerId);

    // Floating origin: the ring jumps under the thumb, so a touch that lands off-center starts
    // neutral instead of instantly steering. It never drifts left of / below its resting spot
    // (screen edge, home indicator) or out of the zone.
    const zone = this.stickZone.getBoundingClientRect();
    const ring = this.stickBase.offsetWidth;
    const half = ring * 0.5;
    const rest = this._restCenter();
    const cx = clamp(e.clientX, rest.x, Math.max(rest.x, zone.right - half));
    const cy = clamp(e.clientY, Math.min(rest.y, zone.top + half), rest.y);
    this._stickCenter = { x: cx, y: cy };
    this._stickTravel = Math.max(1, ring * STICK_TRAVEL);
    this.stickBase.style.transform = `translate(${cx - rest.x}px, ${cy - rest.y}px)`;
    this.stickZone.classList.add('is-engaged');
    this._updateStick(e.clientX, e.clientY);
  }

  _onStickMove(e) {
    if (e.pointerId !== this._stickPointer) return;
    e.preventDefault();
    this._updateStick(e.clientX, e.clientY);
  }

  _updateStick(clientX, clientY) {
    let dx = clientX - this._stickCenter.x;
    let dy = clientY - this._stickCenter.y;
    const dist = Math.hypot(dx, dy);
    const travel = this._stickTravel;
    if (dist > travel) {
      dx *= travel / dist;
      dy *= travel / dist;
    }
    this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    this._stick.x = applyDeadzone(dx / travel, STICK_AXIS_DEADZONE);
    this._stick.y = applyDeadzone(dy / travel, STICK_AXIS_DEADZONE);
  }

  _releaseStick() {
    this._stickPointer = null;
    this._stick.x = 0;
    this._stick.y = 0;
    this.stickKnob.style.transform = '';
    this.stickBase.style.transform = '';
    this.stickZone.classList.remove('is-engaged');
  }

  _restCenter() {
    // Rest position = the ring's layout box, ignoring any floating-origin transform.
    const zone = this.stickZone.getBoundingClientRect();
    const base = this.stickBase;
    return {
      x: zone.left + base.offsetLeft + base.offsetWidth * 0.5,
      y: zone.top + base.offsetTop + base.offsetHeight * 0.5,
    };
  }

  _measure() {
    const stageRect = this.stage.getBoundingClientRect();
    const ringHeight = this.stickBase.offsetHeight;
    const ringTop = this._restCenter().y - ringHeight * 0.5;
    // The root's padding-bottom is env(safe-area-inset-bottom) (see style.css).
    const safeBottom = parseFloat(getComputedStyle(this.root).paddingBottom) || 0;
    this._hudReserve = {
      bottom: safeBottom,
      bottomLeft: ringHeight > 0 ? Math.max(0, stageRect.bottom - ringTop) : 0,
    };
  }
}
