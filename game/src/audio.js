// SOLMAR NIGHTS — audio.js
// Synthesised WebAudio: siren, gunshots, engine hum, footsteps-free ambient
// music loop and UI blips. Everything is generated — no audio files, no
// network. All methods are safe no-ops until the user has gestured (the
// AudioContext is created lazily on first user input), so autoplay policies
// never throw.

export function createAudio() {
  const audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null,
    muted: false, musicOn: true, sfxOn: true,
    engineOsc: null, engineGain: null, sirenOsc: null, sirenGain: null,
    musicTimer: 0, musicStep: 0,

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.16;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.5;
        this.sfxGain.connect(this.master);
      } catch {
        this.ctx = null;
      }
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },

    // Short filtered noise burst: gunshot. `near` = the player's own weapon.
    shoot(near = true) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const t = this.ctx.currentTime;
      const dur = near ? 0.14 : 0.2;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = near ? 3200 : 1400;
      const g = this.ctx.createGain();
      g.gain.value = near ? 0.5 : 0.22;
      src.connect(filter).connect(g).connect(this.sfxGain);
      src.start(t);
    },

    thud() {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g).connect(this.sfxGain);
      o.start(t); o.stop(t + 0.15);
    },

    blip(freq = 660) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = 'square'; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g).connect(this.sfxGain);
      o.start(t); o.stop(t + 0.1);
    },

    cash() {
      this.blip(880);
      setTimeout(() => this.blip(1320), 90);
    },

    // Engine hum that follows the player's car speed (0..1).
    engine(speedNorm) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      if (!this.engineOsc) {
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 420;
        this.engineOsc.connect(f).connect(this.engineGain).connect(this.sfxGain);
        this.engineOsc.start();
      }
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(speedNorm > 0.03 ? 0.05 + speedNorm * 0.05 : 0, t, 0.1);
    },

    // Two-tone police siren while any chase is active.
    siren(on) {
      if (!this.ctx || this.muted || !this.sfxOn) {
        if (this.sirenGain) this.sirenGain.gain.value = 0;
        return;
      }
      if (on && !this.sirenOsc) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.05;
        this.sirenOsc.connect(this.sirenGain).connect(this.sfxGain);
        this.sirenOsc.start();
      }
      if (!this.sirenOsc) return;
      const t = this.ctx.currentTime;
      if (on) {
        const phase = (t % 1.2) < 0.6 ? 720 : 960;
        this.sirenOsc.frequency.setTargetAtTime(phase, t, 0.05);
        this.sirenGain.gain.setTargetAtTime(0.045, t, 0.1);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, t, 0.1);
      }
    },

    // Tiny chiptune loop: a laid-back bass + lead over a I–vi–IV–V walk.
    // Called every frame with dt; steps advance on a timer.
    music(dt) {
      if (!this.ctx || this.muted || !this.musicOn || this.ctx.state !== 'running') return;
      this.musicTimer -= dt;
      if (this.musicTimer > 0) return;
      this.musicTimer = 0.24;
      const chords = [
        [130.81, 164.81, 196.0], [110.0, 130.81, 164.81],
        [87.31, 110.0, 130.81], [98.0, 123.47, 146.83],
      ];
      const chord = chords[Math.floor(this.musicStep / 4) % 4];
      const beat = this.musicStep % 4;
      this.note(chord[beat % 3], 0.22, 'triangle', 0.5);
      if (beat === 0) this.note(chord[0] / 2, 0.22, 'sine', 0.6);
      if (this.musicStep % 8 === 6) this.note(chord[2] * 2, 0.2, 'square', 0.12);
      this.musicStep += 1;
    },

    note(freq, dur, type, vol) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.02);
    },
  };
  return audio;
}
