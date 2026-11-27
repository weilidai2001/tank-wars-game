// Web Audio API NES-style chiptune synthesizer

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this._createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  _createNoiseBuffer(ctx) {
    const length = ctx.sampleRate * 1.0;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _tone(freq, startOffset, duration, type = 'square', volume = 0.09, freqEnd = null) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  _noise(startOffset, duration, volume = 0.14, filterFreq = 900) {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime + startOffset;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  playShoot() {
    this._tone(680, 0, 0.075, 'square', 0.07, 170);
  }

  playBrickHit() {
    this._noise(0, 0.06, 0.10, 700);
    this._tone(160, 0, 0.05, 'triangle', 0.08, 80);
  }

  playSteelHit() {
    this._tone(980, 0, 0.04, 'square', 0.08, 720);
    this._tone(1320, 0.03, 0.05, 'square', 0.06, 880);
  }

  playArmorHit() {
    this._tone(520, 0, 0.05, 'square', 0.08, 300);
    this._tone(780, 0.04, 0.05, 'square', 0.07, 500);
  }

  playExplosion(big = false) {
    if (big) {
      this._noise(0, 0.36, 0.20, 1100);
      this._tone(140, 0, 0.30, 'sawtooth', 0.10, 38);
    } else {
      this._noise(0, 0.16, 0.14, 1000);
      this._tone(210, 0, 0.12, 'triangle', 0.08, 60);
    }
  }

  playPowerupSpawn() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => this._tone(f, i * 0.045, 0.06, 'square', 0.07));
  }

  playPowerupPickup() {
    const notes = [440, 554, 659, 880, 1108];
    notes.forEach((f, i) => this._tone(f, i * 0.05, 0.07, 'square', 0.08));
  }

  playExtraLife() {
    const notes = [523, 659, 784, 1046, 784, 1046];
    notes.forEach((f, i) => this._tone(f, i * 0.07, 0.09, 'square', 0.08));
  }

  playTick() {
    this._tone(740, 0, 0.03, 'square', 0.06);
  }

  playMenuMove() {
    this._tone(520, 0, 0.035, 'square', 0.06);
  }

  playGrab() {
    // Rising tractor-beam suction chirp
    this._tone(240, 0, 0.11, 'triangle', 0.10, 760);
    this._tone(480, 0.04, 0.08, 'square', 0.05, 920);
  }

  playDrop() {
    // Solid block placement thud
    this._tone(360, 0, 0.07, 'square', 0.08, 130);
    this._noise(0.02, 0.06, 0.09, 550);
  }

  playStageStart() {
    // Classic Battle City stage-start fanfare inspired melody
    const melody = [
      [262, 0.00, 0.11],
      [330, 0.12, 0.11],
      [392, 0.24, 0.11],
      [262, 0.36, 0.11],
      [330, 0.48, 0.11],
      [392, 0.60, 0.11],
      [440, 0.72, 0.11],
      [392, 0.84, 0.11],
      [349, 0.96, 0.11],
      [330, 1.08, 0.11],
      [294, 1.20, 0.11],
      [262, 1.32, 0.24],
    ];
    for (const [f, t, d] of melody) {
      this._tone(f, t, d, 'square', 0.075);
      this._tone(f / 2, t, d, 'triangle', 0.06);
    }
  }

  playGameOver() {
    const notes = [
      [392, 0.00, 0.16],
      [370, 0.18, 0.16],
      [349, 0.36, 0.16],
      [330, 0.54, 0.16],
      [294, 0.72, 0.22],
      [262, 0.96, 0.42],
    ];
    for (const [f, t, d] of notes) {
      this._tone(f, t, d, 'square', 0.08);
      this._tone(f / 2, t, d, 'triangle', 0.07);
    }
  }
}

export const sound = new SoundEngine();
