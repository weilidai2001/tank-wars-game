import { EVENTS } from '../core/EventBus.js';
import { TILE } from '../config/constants.js';

// Events browsers accept as a user gesture that may start audio. On iOS, touchstart and a touch's
// pointerdown do not count, so a tap on the touch Fire button only unlocks audio on touchend.
const UNLOCK_EVENTS = ['touchend', 'mousedown', 'click', 'keydown'];

/**
 * Event-Driven Synthesized Web Audio Engine (SRP + DIP).
 * Subscribes to domain events on EventBus — zero audio calls inside simulation code.
 */
export class SoundEngine {
  constructor(bus) {
    this.ctx = null;
    this.muted = false;
    this.lastLockTime = 0;
    this._resuming = false;
    if (bus) this.bindBus(bus);
    if (typeof window !== 'undefined') this.bindUnlockEvents(window);
  }

  /**
   * Browsers (iOS Safari strictest) only let audio start or resume inside a user gesture, and iOS
   * suspends or "interrupts" the context again after a call, Siri, a screen lock or an app switch.
   * So every gesture for the page's lifetime gets a chance to bring audio back.
   */
  bindUnlockEvents(win) {
    const unlock = () => this.unlock();
    for (const type of UNLOCK_EVENTS) {
      win.addEventListener(type, unlock, { capture: true, passive: true });
    }
    // Back from the background: resume straight away where the browser allows it without a tap.
    const doc = win.document;
    doc.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (doc.visibilityState !== 'visible' || this.muted || !ctx) return;
      if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    });
  }

  bindBus(bus) {
    bus.on(EVENTS.TANK_FIRED, ({ tank }) => {
      if (tank.isPlayer && !tank.isAIControlled) {
        this.playCannon(tank.weaponTier || 0, 0.25);
      } else {
        this.playCannon(0, 0.11);
      }
    });
    bus.on(EVENTS.LOCK_ACQUIRED, () => this.playLockOn());
    bus.on(EVENTS.WALL_DAMAGED, ({ tile }) => {
      if (tile === TILE.STEEL) this.playArmorHit();
      else this.playBrickBreak();
    });
    bus.on(EVENTS.WALL_BREACHED, () => this.playBrickBreak());
    bus.on(EVENTS.WALL_RICOCHET, () => this.playSteelRicochet());
    bus.on(EVENTS.SHELL_CANCELLED, () => this.playShellCancel());
    bus.on(EVENTS.TANK_HIT, ({ hitInfo, absorbedBy }) => {
      if (!absorbedBy && hitInfo && hitInfo.zone === 'FRONT') this.playSteelRicochet();
      else this.playArmorHit();
    });
    bus.on(EVENTS.TANK_DESTROYED, () => this.playExplosion(true));
    bus.on(EVENTS.PICKUP_COLLECTED, () => this.playPowerup());
    bus.on(EVENTS.TRACTOR_USED, ({ grab }) => this.playTractor(grab));
    bus.on(EVENTS.STAGE_STARTED, () => this.playStageStart());
    bus.on(EVENTS.STAGE_CLEARED, () => this.playPowerup());
    bus.on(EVENTS.EAGLE_DESTROYED, () => {
      this.playExplosion(true);
      this.playGameOver();
    });
    bus.on(EVENTS.GAME_OVER, ({ isVictory }) => {
      if (isVictory) this.playStageStart();
      else this.playGameOver();
    });
  }

  _context() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      // iOS plays Web Audio as "ambient" sound, which the Ring/Silent switch mutes, and plenty of
      // iPhones live on silent. "playback" makes the game audible the way a video is.
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  /** Starts or resumes audio. Only works when called from inside a user gesture. */
  unlock() {
    if (this.muted) return;
    const ctx = this._context();
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    // Not a gesture after all (e.g. Escape): resume() would only sit pending until the next one.
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    this._resuming = true;
    ctx.resume().catch(() => {}).finally(() => { this._resuming = false; });
  }

  /** The context to schedule a sound on, or null while sound is muted or not playing. */
  ensure() {
    if (this.muted) return null;
    const ctx = this._context();
    if (!ctx) return null;
    // A gesture resumes the clock asynchronously, so sounds from that same tap (the stage-start
    // jingle on Deploy) still get scheduled. Otherwise, while suspended (no tap yet) or in Safari's
    // "interrupted" state (call, Siri, screen lock), skip the sound: with the clock frozen, every
    // queued sound would fire at once when audio comes back.
    if (ctx.state === 'running' || (this._resuming && ctx.state === 'suspended')) return ctx;
    return null;
  }

  toggleMute() {
    this.muted = !this.muted;
    // Muting releases the audio session so other apps' audio can play; unmuting happens on a click
    // or the M key, which is a gesture, so audio can resume right away.
    if (this.muted) this.ctx?.suspend().catch(() => {});
    else this.unlock();
    return this.muted;
  }

  noiseBuffer(duration = 0.25) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  playCannon(tier = 0, volume = 0.28) {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tier >= 3 ? 'sawtooth' : 'triangle';
    const startFreq = tier >= 3 ? 210 : 155 + tier * 15;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.19);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.12);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(tier >= 3 ? 1400 : 900, now);
    filter.Q.value = 1.4;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * 0.65, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(filter).connect(nGain).connect(ctx.destination);
    src.start(now);
  }

  playLockOn() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastLockTime < 0.22) return;
    this.lastLockTime = now;

    [880, 1320].forEach((freq, idx) => {
      const t = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.045);
    });
  }

  playBrickBreak() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(680, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);
  }

  playSteelRicochet() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1680, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.11);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playShellCancel() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1120, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.09);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playArmorHit() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(130, now + 0.14);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playExplosion(big = false) {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = big ? 0.65 : 0.38;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(big ? 520 : 720, now);
    filter.frequency.exponentialRampToValueAtTime(55, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(big ? 0.38 : 0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(now);

    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(big ? 95 : 120, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + dur * 0.85);
    subGain.gain.setValueAtTime(big ? 0.34 : 0.22, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.85);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + dur);
  }

  playPowerup() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const t = now + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  playTractor(grab = true) {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(grab ? 260 : 620, now);
    osc.frequency.exponentialRampToValueAtTime(grab ? 680 : 240, now + 0.16);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playStageStart() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 523.25];
    const times = [0, 0.1, 0.2, 0.32, 0.46, 0.58];
    notes.forEach((freq, i) => {
      const t = now + times[i];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  playGameOver() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    [392.0, 369.99, 349.23, 311.13, 261.63].forEach((freq, i) => {
      const t = now + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }
}
