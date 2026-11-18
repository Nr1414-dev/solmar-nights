// SOLMAR NIGHTS — audio.js
// Every sound is synthesised with WebAudio — no audio files, no network.
// A tiny step sequencer plays the city's radio: a minor-key bassline, hats and
// a lead over a 16-step loop. Sirens and engines are live oscillators whose
// pitch and gain follow the world.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 500;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineOsc.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      sirenLfo.start();
    } catch {
      ctx = null;
      return false;
    }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type = 'lowpass') {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  // A minor-key loop: Am – F – C – G over 16 steps, bass on the beat, a
  // plucky lead every other bar, hats ticking eighths.
  const BASS = [55, 55, 43.65, 49];
  const LEAD = [220, 261.63, 329.63, 261.63, 293.66, 329.63, 392, 329.63];
  function musicStep() {
    if (!ctx || muted) return;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    if (s % 4 === 0) blip(BASS[bar], 0.5, 'triangle', 0.5, BASS[bar] * 0.99);
    if (s % 2 === 0) noise(0.03, 0.06, 8000, 'highpass');
    if (bar % 2 === 0 && s % 4 === 2) blip(LEAD[(step / 4) % 8 | 0] * 2, 0.18, 'square', 0.1);
    if (s === 0 && bar === 3) blip(196, 0.4, 'sine', 0.25, 98);
    step++;
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && !musicTimer) musicTimer = window.setInterval(musicStep, 150);
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shoot() { noise(0.12, 0.5, 1800); blip(220, 0.08, 'square', 0.25, 60); },
    punch() { noise(0.09, 0.4, 300); },
    hit() { blip(140, 0.1, 'square', 0.3, 70); },
    pickup() { blip(660, 0.09, 'sine', 0.35); window.setTimeout(() => blip(990, 0.14, 'sine', 0.35), 70); },
    cash() { blip(880, 0.08, 'sine', 0.3); window.setTimeout(() => blip(1174, 0.08, 'sine', 0.3), 60); window.setTimeout(() => blip(1568, 0.16, 'sine', 0.3), 120); },
    crash() { noise(0.3, 0.6, 500); },
    explosion() { noise(0.7, 0.8, 240); blip(60, 0.6, 'sine', 0.6, 30); },
    horn() { blip(311, 0.22, 'square', 0.2); blip(370, 0.22, 'square', 0.15); },
    sirenNear(v) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.05 * v, ctx.currentTime, 0.2);
    },
    engine(speedRatio, on) {
      if (!ctx) return;
      engineGain.gain.setTargetAtTime(muted || !on ? 0 : 0.05 + 0.05 * speedRatio, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + 140 * speedRatio, ctx.currentTime, 0.1);
    },
    missionStart() { [523, 659, 784].forEach((f, i) => window.setTimeout(() => blip(f, 0.16, 'triangle', 0.35), i * 90)); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => blip(f, 0.2, 'triangle', 0.35), i * 100)); },
    missionFail() { [392, 330, 262].forEach((f, i) => window.setTimeout(() => blip(f, 0.25, 'sawtooth', 0.25), i * 120)); },
    busted() { [330, 262, 196, 131].forEach((f, i) => window.setTimeout(() => blip(f, 0.3, 'sawtooth', 0.3), i * 160)); },
    door() { blip(180, 0.12, 'triangle', 0.3, 90); },
    denied() { blip(160, 0.15, 'square', 0.25, 110); },
  };
}
