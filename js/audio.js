// Audio semplice generato con WebAudio: nessun file esterno.
const Sound = (() => {
  let ctx = null, master = null, sfxGain = null, musicGain = null;
  let enabled = true, musicOn = true;
  let musicTimer = null, nextNoteTime = 0, step = 0;

  try {
    enabled = localStorage.getItem('fdt_audio') !== '0';
    musicOn = localStorage.getItem('fdt_music') !== '0';
  } catch (e) {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 1 : 0; master.connect(ctx.destination);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.12; musicGain.connect(master);
  }

  function tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, delay = 0, dest = null) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  let noiseBuf = null;
  function noise(dur, vol = 0.3, filterFreq = 1200, delay = 0, q = 1) {
    if (!ctx || !enabled) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filterFreq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxGain);
    s.start(t); s.stop(t + dur + 0.02);
  }

  const sfx = {
    click() { tone(660, 0.06, 'square', 0.15); },
    pickup() { tone(880, 0.08, 'square', 0.2); tone(1320, 0.12, 'square', 0.2, null, 0.07); },
    eat() { noise(0.08, 0.5, 400, 0, 2); noise(0.08, 0.5, 300, 0.12, 2); tone(140, 0.15, 'sawtooth', 0.2, 90, 0.05); },
    smoke() { noise(0.7, 0.35, 700, 0, 0.6); tone(220, 0.5, 'sine', 0.1, 110); },
    cough() { for (let i = 0; i < 3; i++) noise(0.12, 0.45, 900 - i * 120, i * 0.18, 3); },
    sprint() { tone(300, 0.12, 'triangle', 0.12, 600); },
    count() { tone(520, 0.12, 'square', 0.2); },
    go() { tone(1040, 0.3, 'square', 0.22); },
    caught() {
      tone(600, 0.15, 'square', 0.25, 300);
      noise(0.1, 0.6, 350, 0.15, 2); noise(0.1, 0.6, 280, 0.3, 2); noise(0.12, 0.6, 250, 0.45, 2);
      tone(90, 0.4, 'sawtooth', 0.2, 60, 0.55);
    },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.2, null, i * 0.13)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.28, 'triangle', 0.25, null, i * 0.18)); },
    hide() { tone(400, 0.1, 'sine', 0.15, 250); },
    tick() { tone(1200, 0.04, 'square', 0.08); },
  };

  // Musichetta in loop: basso + melodia semplice, stile giungla scherzosa.
  const bass = [110, 0, 110, 0, 147, 0, 131, 0, 110, 0, 110, 0, 165, 0, 147, 131];
  const mel  = [440, 0, 523, 0, 587, 523, 0, 440, 392, 0, 440, 0, 0, 0, 330, 0,
                440, 0, 523, 0, 659, 587, 0, 523, 494, 0, 440, 0, 0, 0, 0, 0];
  function scheduleMusic() {
    if (!ctx) return;
    const stepDur = 0.16;
    while (nextNoteTime < ctx.currentTime + 0.3) {
      const b = bass[step % bass.length];
      const m = mel[step % mel.length];
      const d = nextNoteTime - ctx.currentTime;
      if (b) tone(b, 0.14, 'triangle', 0.5, null, d, musicGain);
      if (m) tone(m, 0.12, 'square', 0.18, null, d, musicGain);
      if (step % 4 === 0) { /* cassa */ tone(80, 0.08, 'sine', 0.6, 40, d, musicGain); }
      step++; nextNoteTime += stepDur;
    }
  }
  function startMusic() {
    if (!ctx || !musicOn || musicTimer) return;
    nextNoteTime = ctx.currentTime + 0.05; step = 0;
    musicTimer = setInterval(scheduleMusic, 80);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  return {
    init, sfx, startMusic, stopMusic,
    get enabled() { return enabled; },
    get musicOn() { return musicOn; },
    toggle() {
      enabled = !enabled;
      try { localStorage.setItem('fdt_audio', enabled ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = enabled ? 1 : 0;
      return enabled;
    },
    toggleMusic() {
      musicOn = !musicOn;
      try { localStorage.setItem('fdt_music', musicOn ? '1' : '0'); } catch (e) {}
      if (!musicOn) stopMusic();
      return musicOn;
    },
  };
})();
