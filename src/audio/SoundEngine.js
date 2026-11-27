import { EVENTS } from '../core/EventBus.js';
import { TILE } from '../config/constants.js';
import { POWERUP } from '../config/powerups.js';

// ============================================================================
// Sample bank (assets/audio, from Tanks3D — see assets/ASSET_LICENSES.md).
// Gains, overlap falloff and single-voice cues follow Tanks3D's audio_bank.gd:
// each extra simultaneous voice of a cue plays at gain * overlap^activeVoices.
// ============================================================================
const CUES = Object.freeze({
  stageStart: { file: 'stage_start_up', gain: 1.0, single: true, duck: true },
  pause: { file: 'pause', gain: 1.0, single: true },
  gameOver: { file: 'game_over', gain: 1.0, single: true, duck: true },
  victory: { file: 'highscore_beaten', gain: 1.0, single: true, duck: true },
  menu: { file: 'menu_item_selected', gain: 0.7 },
  bonusAppeared: { file: 'bonus_appeared', gain: 0.9, overlap: 0.9 },
  bonusObtained: { file: 'bonus_obtained', gain: 0.9, overlap: 0.9 },
  hitBrick: { file: 'bullet_hit_brick', gain: 0.4, overlap: 0.7 },
  hitBoundary: { file: 'bullet_hit_map_boundaries', gain: 0.4 },
  hitStone: { file: 'bullet_hit_stone', gain: 0.4 },
  hitBullet: { file: 'bullet_hit_bullet', gain: 0.4 },
  eagleDestroyed: { file: 'eagle_destroyed', gain: 0.7 },
  enemyDestroyed: { file: 'enemy_destroyed', gain: 1.0, overlap: 0.7 },
  enemyHit: { file: 'enemy_hit', gain: 0.7 },
  playerDestroyed: { file: 'player_destroyed', gain: 0.6 },
  playerFired: { file: 'player_fired', gain: 0.6 },
  playerHit: { file: 'player_hit', gain: 1.0 },
  engineIdle: { file: 'player_idle', gain: 0.5 },
  lifeUp: { file: 'player_life_up', gain: 1.0, single: true },
  engineMoving: { file: 'player_moving', gain: 0.5 },
  respawn: { file: 'player_respawn', gain: 1.0, single: true },
  scoreTick: { file: 'score_point_counted', gain: 0.8 },
});

// Events browsers accept as a user gesture that may start audio. On iOS, touchstart and a touch's
// pointerdown do not count, so a tap on the touch Fire button only unlocks audio on touchend.
const UNLOCK_EVENTS = ['touchend', 'mousedown', 'click', 'keydown'];

const MAX_VOICES = 12;
const MASTER_GAIN = 0.75;
const AUDIO_BASE = new URL('../../assets/audio/', import.meta.url);

/** Leading/trailing near-silence (AAC priming/padding) so loops stay gapless and hits stay tight. */
function measureTrim(buf) {
  const data = buf.getChannelData(0);
  const thr = 0.0025;
  let a = 0;
  while (a < data.length && Math.abs(data[a]) < thr) a++;
  let b = data.length - 1;
  while (b > a && Math.abs(data[b]) < thr) b--;
  if (b <= a) return { start: 0, end: buf.duration };
  return { start: a / buf.sampleRate, end: (b + 1) / buf.sampleRate };
}

function pickFormat() {
  try {
    const probe = document.createElement('audio');
    if (probe.canPlayType('audio/ogg; codecs="vorbis"')) return 'ogg';
  } catch (_) { /* fall through */ }
  return 'm4a';
}

/**
 * Event-Driven Web Audio Engine (SRP + DIP).
 * Subscribes to domain events on EventBus — zero audio calls inside simulation code.
 * Plays the Tanks3D sample set (Battle City stage-start / game-over cues, cannon,
 * impacts, pickups) with distance attenuation, ducks under the jingles, and runs a
 * looping idle/moving engine bed. Falls back to procedural synthesis for any cue
 * whose sample is missing or still loading.
 */
export class SoundEngine {
  constructor(bus) {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.lastLockTime = 0;
    this.buffers = new Map();
    this.trim = new Map();
    this.voices = new Map(); // cue -> Set of { src, gain }
    this.duckUntil = 0;
    this.engine = null;
    this.listenerProvider = null; // () => [{x, z}] or null (no attenuation)
    this._preloadedData = new Map();
    this._waiting = [];
    this._resuming = false;
    this._decoder = null;
    this._format = typeof document !== 'undefined' ? pickFormat() : 'ogg';
    this._preload();
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

  _flushWaiting(file) {
    if (!this._waiting.length || !this.ctx) return;
    const now = this.ctx.currentTime;
    const keep = [];
    for (const w of this._waiting) {
      if (CUES[w.name].file !== file) {
        keep.push(w);
      } else if (now <= w.until) {
        this.play(w.name, w.opts);
      }
    }
    this._waiting = keep;
  }

  // --------------------------------------------------------------------------
  // Loading
  // --------------------------------------------------------------------------
  _preload() {
    if (typeof fetch !== 'function') return;
    const files = new Set(Object.values(CUES).map((c) => c.file));
    for (const file of files) {
      this._fetchFile(file, this._format)
        .catch(() => (this._format === 'ogg' ? this._fetchFile(file, 'm4a') : null))
        .catch(() => null);
    }
  }

  _fetchFile(file, ext) {
    return fetch(new URL(`${file}.${ext}`, AUDIO_BASE))
      .then((r) => {
        if (!r.ok) throw new Error(`${file}.${ext}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => {
        this._preloadedData.set(file, { data, ext });
        this._decodeAll();
      });
  }

  /** Decode with the live context, or an offline one so samples are ready before the first tap. */
  _decoderContext() {
    if (this.ctx) return this.ctx;
    if (!this._decoder && typeof window !== 'undefined') {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (Offline) {
        try { this._decoder = new Offline(1, 1, 44100); } catch (_) { this._decoder = null; }
      }
    }
    return this._decoder;
  }

  _decodeAll() {
    const decoder = this._decoderContext();
    if (!decoder) return;
    for (const [file, entry] of this._preloadedData) {
      if (this.buffers.has(file) || entry.pending) continue;
      entry.pending = true;
      const copy = entry.data.slice(0);
      let settled = false;
      const done = (buf) => {
        if (settled) return;
        settled = true;
        this.trim.set(file, measureTrim(buf));
        this.buffers.set(file, buf);
        this._flushWaiting(file);
      };
      const retry = () => {
        if (settled) return;
        settled = true;
        // Codec claimed but failed (e.g. partial Ogg support): try the AAC twin once
        if (entry.ext !== 'm4a') {
          this._preloadedData.delete(file);
          this._fetchFile(file, 'm4a').catch(() => {});
        }
      };
      try {
        const p = decoder.decodeAudioData(copy, done, retry);
        if (p && typeof p.then === 'function') p.then(done, retry);
      } catch (_) {
        retry();
      }
    }
  }

  // --------------------------------------------------------------------------
  // Event wiring
  // --------------------------------------------------------------------------
  bindBus(bus) {
    bus.on(EVENTS.TANK_FIRED, ({ tank }) => {
      if (!tank) return;
      if (tank.isPlayer && !tank.isAIControlled) {
        // Own tank is a listener (distance 0); a LAN teammate's gun is attenuated
        this.play('playerFired', { at: tank, minGain: 0.6, rate: 1.0 - (tank.weaponTier || 0) * 0.04 });
      } else {
        this.play('playerFired', { at: tank, gain: 0.5, rate: tank.isPlayer ? 0.96 : 0.84 });
      }
    });
    bus.on(EVENTS.LOCK_ACQUIRED, () => this.playLockOn());
    bus.on(EVENTS.WALL_DAMAGED, (e) => {
      this.play(e.tile === TILE.STEEL ? 'hitStone' : 'hitBrick', { at: e });
    });
    bus.on(EVENTS.WALL_BREACHED, (e) => this.play('hitBrick', { at: e, gain: 1.4, rate: 0.85 }));
    bus.on(EVENTS.WALL_RICOCHET, (e) => {
      this.play(e.colorHex === 0x94a3b8 ? 'hitBoundary' : 'hitStone', { at: e });
    });
    bus.on(EVENTS.SHELL_CANCELLED, (e) => this.play('hitBullet', { at: e }));
    bus.on(EVENTS.TANK_HIT, (e) => {
      const victim = e.victim;
      if (victim && victim.isPlayer && !victim.isAIControlled) {
        this.play('playerHit', { at: e, minGain: 0.6 });
      } else {
        this.play('enemyHit', { at: e });
      }
      if (!e.absorbedBy && e.hitInfo && e.hitInfo.zone === 'FRONT') this.play('hitStone', { at: e, gain: 0.8 });
    });
    bus.on(EVENTS.TANK_DESTROYED, (e) => {
      const victim = e.victim;
      if (victim && victim.isPlayer) this.play('playerDestroyed', { at: e, minGain: 0.6 });
      else this.play('enemyDestroyed', { at: e });
    });
    bus.on(EVENTS.PICKUP_SPAWNED, () => this.play('bonusAppeared'));
    bus.on(EVENTS.PICKUP_COLLECTED, (e) => {
      const id = e && e.def ? e.def.id : e && e.defId;
      this.play(id === POWERUP.REPAIR ? 'lifeUp' : 'bonusObtained');
    });
    bus.on(EVENTS.PLAYER_RESPAWNED, () => this.play('respawn', { gain: 0.8 }));
    bus.on(EVENTS.TRACTOR_USED, ({ grab }) => this.playTractor(grab));
    bus.on(EVENTS.STAGE_STARTED, () => this.play('stageStart'));
    bus.on(EVENTS.STAGE_CLEARED, () => this.playScoreTally());
    bus.on(EVENTS.EAGLE_DESTROYED, () => {
      this.play('eagleDestroyed');
      this.play('gameOver', { delay: 0.95 });
    });
    bus.on(EVENTS.GAME_OVER, ({ isVictory }) => {
      this.play(isVictory ? 'victory' : 'gameOver');
    });
  }

  // --------------------------------------------------------------------------
  // Context / master chain
  // --------------------------------------------------------------------------
  _context() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      // iOS plays Web Audio as "ambient" sound, which the Ring/Silent switch mutes, and plenty of
      // iPhones live on silent. "playback" makes the game audible the way a video is.
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_GAIN;
      // Gentle bus compressor so stacked explosions don't clip
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      this.master.connect(comp).connect(this.ctx.destination);
      this._decodeAll();
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

  get out() {
    return this.master || (this.ctx && this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    // Muting releases the audio session so other apps' audio can play; unmuting happens on a click
    // or the M key, which is a gesture, so audio can resume right away.
    if (this.muted) {
      this._stopEngine();
      this.stopAll();
      this.ctx?.suspend().catch(() => {});
    } else {
      this.unlock();
    }
    return this.muted;
  }

  stopAll() {
    for (const set of this.voices.values()) {
      for (const v of set) {
        try { v.src.stop(); } catch (_) { /* already stopped */ }
      }
      set.clear();
    }
  }

  // --------------------------------------------------------------------------
  // Playback
  // --------------------------------------------------------------------------
  _attenuation(at) {
    if (!at || typeof at.x !== 'number' || typeof at.z !== 'number') return 1;
    const listeners = this.listenerProvider ? this.listenerProvider() : null;
    if (!listeners || listeners.length === 0) return 1;
    let best = Infinity;
    for (const l of listeners) {
      const d = Math.hypot(l.x - at.x, l.z - at.z);
      if (d < best) best = d;
    }
    // Full volume within 14 m, fading to 25% by ~70 m (arena is 91 m across)
    return Math.max(0.25, Math.min(1, 1 - (best - 14) / 75));
  }

  /**
   * Play a cue from the sample bank (synth fallback if not decoded yet).
   * @param {keyof typeof CUES} name
   * @param {{at?:{x:number,z:number}, gain?:number, rate?:number, delay?:number, minGain?:number}} [opts]
   */
  play(name, opts = {}) {
    const ctx = this.ensure();
    if (!ctx) return;
    const cue = CUES[name];
    if (!cue) return;
    const buf = this.buffers.get(cue.file);
    if (!buf) {
      // Still fetching/decoding: hold jingles briefly rather than playing the synth stand-in
      if (cue.single && this._waiting.length < 8) {
        this._waiting.push({ name, opts, until: ctx.currentTime + 1.5 });
      } else {
        this._synthFallback(name);
      }
      return;
    }

    let set = this.voices.get(name);
    if (!set) {
      set = new Set();
      this.voices.set(name, set);
    }
    if (cue.single) {
      for (const v of set) {
        try { v.src.stop(); } catch (_) { /* noop */ }
      }
      set.clear();
    } else if (set.size >= MAX_VOICES) {
      return;
    }

    const now = ctx.currentTime;
    const when = now + (opts.delay || 0);
    let gain = cue.gain * (opts.gain ?? 1) * Math.pow(cue.overlap ?? 1, set.size);
    gain *= Math.max(opts.minGain || 0, this._attenuation(opts.at));
    // Duck everything else under the stage-start / game-over jingles
    if (!cue.duck && when < this.duckUntil) gain *= 0.55;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate || 1) * (cue.single ? 1 : 1 + (Math.random() - 0.5) * 0.04);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.out);
    const voice = { src, gain: g };
    set.add(voice);
    src.onended = () => set.delete(voice);
    const tr = this.trim.get(cue.file);
    src.start(when, tr ? tr.start : 0);

    if (cue.duck) this.duckUntil = Math.max(this.duckUntil, when + buf.duration);
  }

  playScoreTally() {
    for (let i = 0; i < 8; i++) this.play('scoreTick', { delay: 0.25 + i * 0.09 });
    this.play('bonusObtained', { delay: 0.25 + 8 * 0.09 + 0.05 });
  }

  // --------------------------------------------------------------------------
  // Engine bed: looping idle / moving samples, cross-faded by player motion.
  // --------------------------------------------------------------------------
  /**
   * @param {{active:boolean, moving:boolean, speedFrac:number}} state
   */
  updateEngine(state) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') {
      if (!state.active) this._stopEngine();
      return;
    }
    if (!state.active) {
      this._stopEngine();
      return;
    }
    const idleBuf = this.buffers.get(CUES.engineIdle.file);
    const moveBuf = this.buffers.get(CUES.engineMoving.file);
    if (!idleBuf || !moveBuf) return;

    const ctx = this.ctx;
    if (!this.engine) {
      const mk = (buf, file) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const tr = this.trim.get(file);
        if (tr) {
          src.loopStart = tr.start;
          src.loopEnd = tr.end;
        }
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(g).connect(this.out);
        src.start(0, tr ? tr.start : 0);
        return { src, g };
      };
      this.engine = {
        idle: mk(idleBuf, CUES.engineIdle.file),
        moving: mk(moveBuf, CUES.engineMoving.file),
      };
    }

    const now = ctx.currentTime;
    const duck = now < this.duckUntil ? 0.35 : 1;
    const f = Math.max(0, Math.min(1, state.speedFrac || 0));
    const idleTarget = (state.moving ? 0.15 : 1) * CUES.engineIdle.gain * duck;
    const moveTarget = (state.moving ? 0.75 + 0.25 * f : 0) * CUES.engineMoving.gain * duck;
    this.engine.idle.g.gain.setTargetAtTime(idleTarget, now, 0.06);
    this.engine.moving.g.gain.setTargetAtTime(moveTarget, now, 0.06);
    this.engine.moving.src.playbackRate.setTargetAtTime(0.92 + 0.16 * f, now, 0.12);
  }

  _stopEngine() {
    if (!this.engine) return;
    const ctx = this.ctx;
    for (const part of [this.engine.idle, this.engine.moving]) {
      try {
        if (ctx) {
          part.g.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
          part.src.stop(ctx.currentTime + 0.2);
        } else {
          part.src.stop();
        }
      } catch (_) { /* noop */ }
    }
    this.engine = null;
  }

  // --------------------------------------------------------------------------
  // Procedural cues (no sample in the bank) and fallbacks
  // --------------------------------------------------------------------------
  _synthFallback(name) {
    switch (name) {
      case 'playerFired': this.playCannon(0, 0.2); break;
      case 'hitBrick': this.playBrickBreak(); break;
      case 'hitStone':
      case 'hitBoundary': this.playSteelRicochet(); break;
      case 'hitBullet': this.playShellCancel(); break;
      case 'enemyHit':
      case 'playerHit': this.playArmorHit(); break;
      case 'enemyDestroyed':
      case 'playerDestroyed':
      case 'eagleDestroyed': this.playExplosion(true); break;
      case 'bonusObtained':
      case 'lifeUp':
      case 'bonusAppeared': this.playPowerup(); break;
      case 'stageStart':
      case 'victory': this.playStageStart(); break;
      case 'gameOver': this.playGameOver(); break;
      default: break;
    }
  }

  noiseBuffer(duration = 0.25) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(type, f0, f1, dur, vol, t0 = 0) {
    const ctx = this.ctx;
    const now = ctx.currentTime + t0;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, now + dur * 0.9);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(this.out);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  _noise(filterType, f0, f1, dur, vol) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(now);
  }

  playCannon(tier = 0, volume = 0.28) {
    if (!this.ensure()) return;
    this._tone(tier >= 3 ? 'sawtooth' : 'triangle', tier >= 3 ? 210 : 155 + tier * 15, 36, 0.21, volume);
    this._noise('bandpass', tier >= 3 ? 1400 : 900, tier >= 3 ? 1400 : 900, 0.12, volume * 0.65);
  }

  playLockOn() {
    const ctx = this.ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastLockTime < 0.22) return;
    this.lastLockTime = now;
    this._tone('sine', 880, 880, 0.04, 0.08, 0);
    this._tone('sine', 1320, 1320, 0.04, 0.08, 0.045);
  }

  playBrickBreak() {
    if (!this.ensure()) return;
    this._noise('lowpass', 680, 140, 0.18, 0.22);
  }

  playSteelRicochet() {
    if (!this.ensure()) return;
    this._tone('square', 1680, 620, 0.12, 0.11);
  }

  playShellCancel() {
    if (!this.ensure()) return;
    this._tone('triangle', 1120, 340, 0.1, 0.14);
  }

  playArmorHit() {
    if (!this.ensure()) return;
    this._tone('triangle', 420, 130, 0.15, 0.2);
  }

  playExplosion(big = false) {
    if (!this.ensure()) return;
    const dur = big ? 0.65 : 0.38;
    this._noise('lowpass', big ? 520 : 720, 55, dur, big ? 0.38 : 0.26);
    this._tone('sine', big ? 95 : 120, 24, dur * 0.85, big ? 0.34 : 0.22);
  }

  playPowerup() {
    if (!this.ensure()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone('triangle', f, f, 0.14, 0.16, i * 0.055));
  }

  playTractor(grab = true) {
    if (!this.ensure()) return;
    this._tone('sine', grab ? 260 : 620, grab ? 680 : 240, 0.17, 0.16);
  }

  playStageStart() {
    if (!this.ensure()) return;
    const notes = [261.63, 329.63, 392.0, 523.25, 392.0, 523.25];
    const times = [0, 0.1, 0.2, 0.32, 0.46, 0.58];
    notes.forEach((f, i) => this._tone('sawtooth', f, f, 0.14, 0.1, times[i]));
  }

  playGameOver() {
    if (!this.ensure()) return;
    [392.0, 369.99, 349.23, 311.13, 261.63].forEach((f, i) => this._tone('sawtooth', f, f, 0.22, 0.12, i * 0.16));
  }

  playUiSelect() {
    this.play('menu');
  }

  playPause() {
    this.play('pause');
  }
}
