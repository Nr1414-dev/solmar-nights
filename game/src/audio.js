// SOLMAR NIGHTS — audio.js
// All sound is synthesised with WebAudio: no audio files, no network.
// Every public method is a safe no-op until the player has made a gesture
// (browsers block audio before that), so calling it early can never throw.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.volume = 0.7;
    this.musicOn = true;
    this.enabled = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = 0;
    this.musicStep = 0;
    this.musicTimer = 0;
    this.noiseBuffer = null;
  }
  unlock() {
    if (this.enabled) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.32;
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.enabled = true;
    } catch { /* audio unavailable: stay silent */ }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
    if (!this.enabled) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }
  noise(dur, vol = 0.3, lowpass = 1200) {
    if (!this.enabled) return;
    try {
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lowpass;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t); src.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }
  gunshot(kind) {
    if (kind === 'shotgun') { this.noise(0.28, 0.55, 900); this.tone(90, 0.18, 'square', 0.25, 40); }
    else if (kind === 'smg') { this.noise(0.09, 0.35, 2200); }
    else { this.noise(0.14, 0.45, 1800); this.tone(220, 0.08, 'square', 0.18, 90); }
  }
  punch() { this.noise(0.08, 0.3, 500); }
  horn() { this.tone(370, 0.28, 'sawtooth', 0.16); this.tone(466, 0.28, 'sawtooth', 0.12); }
  pickup() { this.tone(660, 0.1, 'sine', 0.25); this.tone(990, 0.16, 'sine', 0.25); }
  cash() { this.tone(880, 0.09, 'triangle', 0.25); this.tone(1320, 0.14, 'triangle', 0.22); }
  phone() { this.tone(1150, 0.12, 'sine', 0.2); this.tone(1150, 0.12, 'sine', 0.2); }
  siren(dt, active) {
    if (!this.enabled || !active) return;
    this.sirenTimer += dt;
    const phase = Math.floor(this.sirenTimer * 1.6) % 2;
    if (phase !== this._sirenPhase) {
      this._sirenPhase = phase;
      this.tone(phase === 0 ? 780 : 1040, 0.55, 'sine', 0.07);
    }
  }
  engine(speedRatio, on) {
    if (!this.enabled) return;
    try {
      if (on && !this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 700;
        this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
        this.engineOsc.start();
      }
      if (this.engineOsc) {
        this.engineOsc.frequency.value = 55 + speedRatio * 130;
        this.engineGain.gain.value = on ? 0.05 + speedRatio * 0.05 : 0;
      }
    } catch { /* ignore */ }
  }
  // A laid-back synthwave bassline + hats, stepped on a timer so it costs
  // almost nothing. Chords: Am – F – C – G, one bar each.
  music(dt) {
    if (!this.enabled || !this.musicOn) return;
    this.musicTimer += dt;
    const stepDur = 0.21;
    if (this.musicTimer < stepDur) return;
    this.musicTimer -= stepDur;
    const roots = [55, 43.65, 65.41, 49];
    const bar = Math.floor(this.musicStep / 8) % 4;
    const step = this.musicStep % 8;
    const root = roots[bar];
    if (step === 0 || step === 3 || step === 6) {
      this._musicNote(root * 2, 0.18, 'triangle', 0.16);
    }
    if (step % 2 === 0) this._musicNote(root * 4, 0.05, 'sine', 0.05);
    if (step === 4) this._musicNote(root * 6, 0.12, 'sine', 0.06);
    this.musicStep++;
  }
  _musicNote(freq, dur, type, vol) {
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }
}
