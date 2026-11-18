// SOLMAR NIGHTS v2.3 — audio.js
// Every sound is synthesised with WebAudio — no audio files, no network.
// A tiny step sequencer plays the city radio: a minor-key bassline, hats
// and a lead that drift with the time of day. Sirens, gunshots, engine
// hum, punches and pickups are all short oscillator/noise envelopes.
// AudioContext is created lazily on the first user gesture (browsers
// require that); until then every call is a safe no-op.

function noiseBuffer(ctx) {
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let noise = null;
  let engineOsc = null;
  let engineGain = null;
  let musicTimer = null;
  let step = 0;
  let musicOn = true;
  let sfxOn = true;
  const settings = { music: 0.55, sfx: 0.8 };

  // Minor-key loop: Am – F – C – G, bass roots [57, 53, 48, 55] MIDI.
  const ROOTS = [57, 53, 48, 55];
  const LEAD = [69, 72, 76, 79, 76, 72, 69, 67, 69, 72, 76, 79, 81, 79, 76, 72];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = settings.music * 0.5;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = settings.sfx;
      sfxGain.connect(master);
      noise = noiseBuffer(ctx);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      engineOsc.connect(filt);
      filt.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch { return false; }
  }

  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ctx || !sfxOn) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function burst(dur, vol, filterFreq, when = 0) {
    if (!ctx || !sfxOn) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  function musicStep() {
    if (!ctx || !musicOn) return;
    const bar = Math.floor(step / 16) % 4;
    const root = ROOTS[bar];
    const beat = step % 16;
    const t0 = ctx.currentTime;
    if (beat % 4 === 0) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(root - 24);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.connect(g); g.connect(musicGain);
      o.start(t0); o.stop(t0 + 0.55);
    }
    if (beat % 2 === 0) burst(0.03, 0.05, 6000);
    if (beat % 8 === 6) {
      const note = LEAD[(step * 7 + bar * 3) % LEAD.length];
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midi(note);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.09, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      o.connect(g); g.connect(musicGain);
      o.start(t0); o.stop(t0 + 0.45);
    }
    step++;
  }

  return {
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!musicTimer) musicTimer = setInterval(musicStep, 150);
    },
    applySettings(s) {
      settings.music = s.music ?? settings.music;
      settings.sfx = s.sfx ?? settings.sfx;
      if (musicGain) musicGain.gain.value = settings.music * 0.5;
      if (sfxGain) sfxGain.gain.value = settings.sfx;
    },
    setMusic(on) { musicOn = on; },
    shoot() { burst(0.12, 0.5, 1800); tone(220, 0.08, 'square', 0.25, 0, 60); },
    shotgun() { burst(0.25, 0.7, 900); tone(140, 0.18, 'square', 0.3, 0, 45); },
    punch() { burst(0.09, 0.4, 500); },
    crash() { burst(0.3, 0.6, 300); tone(90, 0.25, 'sawtooth', 0.3, 0, 40); },
    explosion() { burst(0.8, 0.9, 160); tone(60, 0.7, 'sine', 0.6, 0, 30); },
    horn() { tone(370, 0.22, 'square', 0.18); tone(466, 0.22, 'square', 0.14); },
    pickup() { tone(660, 0.09, 'sine', 0.3); tone(880, 0.14, 'sine', 0.3, 0.09); },
    cash() { tone(990, 0.08, 'sine', 0.3); tone(1320, 0.16, 'sine', 0.3, 0.08); },
    denied() { tone(180, 0.18, 'square', 0.25, 0, 120); },
    siren(on) {
      if (!ctx) return;
      if (!on) { if (this._sirenTimer) { clearInterval(this._sirenTimer); this._sirenTimer = null; } return; }
      if (this._sirenTimer) return;
      let hi = false;
      this._sirenTimer = setInterval(() => {
        if (!sfxOn) return;
        hi = !hi;
        tone(hi ? 880 : 660, 0.42, 'sine', 0.06);
      }, 430);
    },
    heli() { burst(0.4, 0.12, 240); },
    engine(speed01, on) {
      if (!ctx || !engineGain) return;
      const target = on ? 0.02 + speed01 * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.1);
    },
    phone() { tone(1200, 0.12, 'sine', 0.2); tone(1200, 0.12, 'sine', 0.2, 0.2); },
    success() { [523, 659, 784].forEach((f, i) => tone(f, 0.2, 'sine', 0.3, i * 0.1)); },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.18, i * 0.12)); },
  };
}
