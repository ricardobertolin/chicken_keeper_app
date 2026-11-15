  // ---------- Audio (Web Audio synthesized) ----------
  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // ---- Multiplayer audio relay ----
  // Sounds normally fire on the host (where the sim runs) so the guest stays
  // silent. Each play*() function calls queueNetSound() at the top; the host
  // ships the queue inside every snapshot, the guest replays each entry
  // locally via playSoundByName() — so both clients hear shots, reloads,
  // chicken squawks, dog barks, etc.
  const pendingNetSounds = [];
  function queueNetSound(name) {
    if (multiplayer && isHost) pendingNetSounds.push(name);
  }
  function playSoundByName(name) {
    switch (name) {
      case 'shotgun':      playShotgun(); break;
      case 'reload':       playReload(); break;
      case 'reloadJam':    playReloadJam(); break;
      case 'chickenDeath': playChickenDeath(); break;
      case 'dogBark':      playDogBark(); break;
      case 'swordSwing':   playSwordSwing(); break;
      case 'money':        playMoney(); break;
      case 'harvest':      playHarvest(); break;
      case 'build':        playBuild(); break;
      case 'explosion':    playExplosion(); break;
      case 'huntersArrive': playHuntersArrive(); break;
      case 'huntersLeave':  playHuntersLeave(); break;
      case 'nightOfWolfStart': playNightOfWolfStart(); break;
      case 'nightOfWolfEnd':   playNightOfWolfEnd(); break;
      case 'laser':            playLaser(); break;
      case 'magic':            playMagic(); break;
      case 'chickenPop':       playChickenPop(); break;
      case 'waveStart':        playWaveStart(); break;
      case 'keeperDeath':      playKeeperDeath(); break;
      case 'radarPing':        playRadarPing(); break;
      case 'rocketBoots':      playRocketBoots(); break;
      case 'critical':         playCritical(); break;
      case 'critShot':         playCritShot(); break;
      case 'sparkle':          playSparkle(); break;
      case 'bossSpawn':        playBossSpawn(); break;
      case 'wilhelm':          playWilhelm(); break;
    }
  }

  // Parry Mode: a tiny twinkly chime when a wolf's eye sparkles before it lunges.
  function playSparkle() {
    queueNetSound('sparkle');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Two quick rising sine blips — a glassy "tink-tink".
    [0, 0.06].forEach((off, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800 + i * 600, now + off);
      osc.frequency.exponentialRampToValueAtTime(3200 + i * 700, now + off + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now + off);
      g.gain.exponentialRampToValueAtTime(0.06, now + off + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.09);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + off); osc.stop(now + off + 0.1);
    });
  }

  // Parry Mode: a soft airy whoosh when the keeper dodge-rolls. Local-only
  // (each client plays its own roll) — no net queue.
  function playDash() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.16;
    const sz = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / sz);
    const src = ctx.createBufferSource(); src.buffer = b;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900, now);
    bp.frequency.exponentialRampToValueAtTime(2600, now + dur);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(now); src.stop(now + dur);
  }

  // A hammer striking twice — the building/placement sound.
  function playBuild() {
    queueNetSound('build');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    function hit(at) {
      // Sharp noise transient — the crack of contact.
      const dur = 0.08;
      const sz = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(1, sz, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < sz; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 90);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = b;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      const ng = ctx.createGain();
      ng.gain.value = 0.5;
      noise.connect(lp); lp.connect(ng); ng.connect(ctx.destination);
      noise.start(at); noise.stop(at + dur);
      // Woody thunk — a short low tone dropping in pitch.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, at);
      osc.frequency.exponentialRampToValueAtTime(120, at + 0.06);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.5, at);
      og.gain.exponentialRampToValueAtTime(0.001, at + 0.10);
      osc.connect(og); og.connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.12);
    }
    hit(now);
    hit(now + 0.14);
  }

  function playShotgun() {
    queueNetSound('shotgun');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Noise burst (the "blast")
    const dur = 0.35;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 18);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, now);
    lp.frequency.exponentialRampToValueAtTime(280, now + 0.25);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(lp);
    lp.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur);

    // Low thump (body of the blast)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    // High-frequency crack at the very start
    const crack = ctx.createOscillator();
    crack.type = 'square';
    crack.frequency.setValueAtTime(2400, now);
    crack.frequency.exponentialRampToValueAtTime(800, now + 0.04);
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.12, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    crack.connect(crackGain);
    crackGain.connect(ctx.destination);
    crack.start(now);
    crack.stop(now + 0.06);
  }

  function playReload() {
    queueNetSound('reload');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    function click(at, centerFreq, vol) {
      const dur = 0.07;
      const sz = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(1, sz, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < sz; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 80);
      }
      const src = ctx.createBufferSource();
      src.buffer = b;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = centerFreq;
      bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(bp); bp.connect(g); g.connect(ctx.destination);
      src.start(at);
      src.stop(at + dur);
    }
    // "ka-chunk" — pump action
    click(now,        1600, 0.5);
    click(now + 0.13, 1100, 0.55);
  }

  function playReloadJam() {
    queueNetSound('reloadJam');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    // A weak metallic click then a dull thunk (action wouldn't budge)
    function thunk(at, lp, vol, dur) {
      const sz = Math.floor(ctx.sampleRate * dur);
      const b = ctx.createBuffer(1, sz, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < sz; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 50);
      }
      const src = ctx.createBufferSource();
      src.buffer = b;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(filt); filt.connect(g); g.connect(ctx.destination);
      src.start(at);
      src.stop(at + dur);
    }
    thunk(now,        2200, 0.35, 0.05); // weak metallic click
    thunk(now + 0.07, 350,  0.5,  0.16); // dull thunk
  }

  // A short descending two-tone "nope" buzz — feedback for clicking an upgrade
  // the player can't afford. Local only (it's the clicker's own UI feedback).
  function playCantBuy() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    function tone(at, f0, f1, dur, vol) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f0, at);
      osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + dur);
    }
    tone(now,        320, 200, 0.12, 0.16);
    tone(now + 0.12, 220, 120, 0.16, 0.16);
  }

  function playChickenDeath() {
    queueNetSound('chickenDeath');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Squawk: sawtooth with rapid pitch drop, two quick syllables ("ba-gawk!")
    function squawk(at, startFreq, endFreq, dur, vol) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(startFreq, at);
      osc.frequency.exponentialRampToValueAtTime(endFreq, at + dur);

      // Vibrato for that warbling chicken quality
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 22;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 35;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 2;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);

      osc.connect(bp); bp.connect(g); g.connect(ctx.destination);
      osc.start(at); lfo.start(at);
      osc.stop(at + dur); lfo.stop(at + dur);
    }
    // Short bark, then longer wail downward
    squawk(now,        900,  600, 0.08, 0.35);
    squawk(now + 0.10, 1300, 280, 0.28, 0.4);

    // Feather-puff noise overlay
    const dur = 0.25;
    const sz = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < sz; i++) {
      const t = i / ctx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 10);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    src.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
    src.start(now + 0.08);
    src.stop(now + 0.08 + dur);
  }

  // A short dog "woof" — played when a guard dog bites a wolf.
  function playDogBark() {
    queueNetSound('dogBark');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.10);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.28, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(bp); bp.connect(g); g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  // A quick rising whoosh — the player's sword swing (Wolf's Blade).
  function playSwordSwing() {
    queueNetSound('swordSwing');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.18;
    const sz = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) {
      const env = Math.sin((i / sz) * Math.PI); // swell then fade
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700, now);
    bp.frequency.exponentialRampToValueAtTime(2600, now + dur);
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0.32;
    noise.connect(bp); bp.connect(g); g.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur);
  }

  // A bright two-note coin "ka-ching" — played on a golden-gun jackpot.
  // Quiet single-note coin clink — played whenever the player earns money.
  function playMoneySmall() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 1397; // F6 — bright little coin chime
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.18, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.15);
  }

  function playMoney() {
    queueNetSound('money');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    function chime(at, freq, vol) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.24);
    }
    chime(now,        988, 0.30);  // B5
    chime(now + 0.07, 1319, 0.32); // E6
  }

  // A shimmering arpeggio — the "poof" of a witch-hat teleport. A short
  // rising sweep through a high triangle stack with a hint of reverb-y tail.
  function playMagic() {
    queueNetSound('magic');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    function shimmer(at, freq, vol, dur) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, at);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.8, at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + dur + 0.02);
    }
    shimmer(now,        660, 0.18, 0.45);
    shimmer(now + 0.06, 880, 0.18, 0.40);
    shimmer(now + 0.12, 1175,0.18, 0.36);
    shimmer(now + 0.20, 1568,0.20, 0.46);
  }

  // A brass fanfare — the hunters arriving at camp. Two ascending sawtooth
  // notes give it a horn-call feel, distinct from the money chime.
  function playHuntersArrive() {
    queueNetSound('huntersArrive');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    function note(at, freq, vol, dur) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + dur + 0.02);
    }
    note(now,        392, 0.22, 0.18); // G4
    note(now + 0.12, 523, 0.24, 0.34); // C5
    note(now + 0.30, 659, 0.22, 0.34); // E5 — top of the fanfare
  }

  // Night of the Wolf — start: a sustained low rumble + a slow, hollow
  // wolf-howl glide. Distinctively ominous so it reads as "things just got
  // bad" without being a single jump scare.
  function playNightOfWolfStart() {
    queueNetSound('nightOfWolfStart');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Low rumble drone — sub-bass sine pad sustained for a moment.
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(55, now);
    drone.frequency.exponentialRampToValueAtTime(38, now + 1.6);
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.001, now);
    dg.gain.exponentialRampToValueAtTime(0.32, now + 0.15);
    dg.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
    drone.connect(dg); dg.connect(ctx.destination);
    drone.start(now); drone.stop(now + 2.3);
    // Howl glide — sawtooth gliding up then slowly back down through a
    // bandpass, giving it that hollow wolf-cry shape.
    const howl = ctx.createOscillator();
    howl.type = 'sawtooth';
    howl.frequency.setValueAtTime(170, now + 0.25);
    howl.frequency.exponentialRampToValueAtTime(360, now + 0.85);
    howl.frequency.exponentialRampToValueAtTime(120, now + 2.0);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 5;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.001, now + 0.25);
    hg.gain.exponentialRampToValueAtTime(0.22, now + 0.45);
    hg.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
    howl.connect(bp); bp.connect(hg); hg.connect(ctx.destination);
    howl.start(now + 0.25); howl.stop(now + 2.2);
  }

  // Night of the Wolf — end: a relieved, bright two-note chime over a faint
  // residual howl tail, signalling sunrise / safety.
  function playNightOfWolfEnd() {
    queueNetSound('nightOfWolfEnd');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    function chime(at, freq, vol, dur) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + dur + 0.02);
    }
    chime(now,        523, 0.30, 0.5);   // C5
    chime(now + 0.12, 784, 0.32, 0.55);  // G5
    chime(now + 0.28, 1047, 0.34, 0.65); // C6
  }

  // Ranged-wolf laser — a brief sci-fi zap: a fast descending square-wave
  // sweep through a bandpass, with a short noise crack at the very front.
  function playLaser() {
    queueNetSound('laser');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Quick noise crack at the front so the beam has a transient bite.
    const dur = 0.05;
    const sz = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / sz);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const ng = ctx.createGain();
    ng.gain.value = 0.18;
    noise.connect(hp); hp.connect(ng); ng.connect(ctx.destination);
    noise.start(now); noise.stop(now + dur);
    // Square-wave sweep from high to mid — the "pew".
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.18);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(bp); bp.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.24);
  }

  // Hunters leaving — same brass timbre but descending, slightly slower and
  // a touch lower so it reads as "they're moving on".
  function playHuntersLeave() {
    queueNetSound('huntersLeave');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    function note(at, freq, vol, dur) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + dur + 0.02);
    }
    note(now,        523, 0.22, 0.28); // C5
    note(now + 0.18, 392, 0.22, 0.32); // G4
    note(now + 0.38, 294, 0.20, 0.42); // D4 — sad fade
  }

  // A crop being gathered — a soft grain rustle under a warm rising chime.
  // Played when a farm plot ripens and pays out.
  function playHarvest() {
    queueNetSound('harvest');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Grain rustle — band-limited noise that swells and fades like a handful
    // of crop being scooped up.
    const dur = 0.34;
    const sz = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < sz; i++) {
      const env = Math.sin((i / sz) * Math.PI); // gentle swell
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.16;
    noise.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    noise.start(now); noise.stop(now + dur);
    // Warm rising three-note chime — the reward.
    function note(at, freq, vol) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.26);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.28);
    }
    note(now,        523, 0.24); // C5
    note(now + 0.09, 659, 0.24); // E5
    note(now + 0.18, 784, 0.26); // G5
  }

  // A synthesized fallback "scream" — a falling, vibrato-wobbled vocal-ish
  // wail. Used when the streamed Wilhelm clip can't be reached.
  function playSynthScream() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.7;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(950, now + 0.12); // a startled jump up
    osc.frequency.exponentialRampToValueAtTime(260, now + dur);  // then a falling wail
    const vib = ctx.createOscillator();
    vib.frequency.value = 14;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 38;
    vib.connect(vibGain); vibGain.connect(osc.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(bp); bp.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + dur);
    vib.start(now); vib.stop(now + dur);
  }

  // The classic Wilhelm scream — a streamed MP3, played when a rooftopper
  // tumbles off a coop. Lazily created and reused (cloned for overlap). If the
  // stream can't be reached, fall back to a synthesized scream.
  let wilhelmAudio = null;
  let wilhelmFailed = false;
  function playWilhelm() {
    queueNetSound('wilhelm');
    if (wilhelmFailed) { playSynthScream(); return; }
    try {
      if (!wilhelmAudio) {
        wilhelmAudio = new Audio('https://cdn.freesound.org/previews/13/13797_40835-hq.mp3');
        wilhelmAudio.volume = 0.55;
        wilhelmAudio.addEventListener('error', () => { wilhelmFailed = true; });
      }
      const a = wilhelmAudio.cloneNode();
      a.volume = 0.55;
      const pr = a.play();
      if (pr && pr.catch) pr.catch(() => { wilhelmFailed = true; playSynthScream(); });
    } catch (e) { wilhelmFailed = true; playSynthScream(); }
  }

  // FANGUS spawn roar — an external sample played from the CDN when the boss
  // (re)appears. Fails silently if the file can't load (offline / blocked).
  let bossSpawnAudio = null;
  let bossSpawnFailed = false;
  function playBossSpawn() {
    queueNetSound('bossSpawn'); // host → guest, so the buddy hears it too
    if (bossSpawnFailed) return;
    try {
      if (!bossSpawnAudio) {
        bossSpawnAudio = new Audio('https://cdn.freesound.org/previews/858/858826_18150200-hq.mp3');
        bossSpawnAudio.volume = 0.6;
        bossSpawnAudio.addEventListener('error', () => { bossSpawnFailed = true; });
      }
      const a = bossSpawnAudio.cloneNode();
      a.volume = 0.6;
      const pr = a.play();
      if (pr && pr.catch) pr.catch(() => {});
    } catch (e) {}
  }

  // A meaty explosion — used by fat-chicken bursts, bomb-wolf detonations and
  // the karma-resurrect map sweep. A low body-thump under a wide noise blast
  // tail so it reads as "boom" rather than "shotgun blast".
  let lastExplosionAudioT = 0; // throttle for stacked blasts (rocket + laser bursts)
  function playExplosion() {
    // A laser shot that detonates a whole row of rocket-tipped pellets can fire
    // a dozen explosions on the same frame — collapse those into one sound so
    // the audio doesn't stack into a clipped, bugged roar.
    const nowMs = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    if (nowMs - lastExplosionAudioT < 70) return;
    lastExplosionAudioT = nowMs;
    queueNetSound('explosion');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Wide noise tail — lowpass swept down for the rumble.
    const dur = 0.55;
    const sz = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 5);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(120, now + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(lp); lp.connect(ng); ng.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + dur);
    // Low body-thump — a fast sine drop for the punch.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(og); og.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.30);
    // Snappy high-frequency crack right at the start.
    const crack = ctx.createOscillator();
    crack.type = 'square';
    crack.frequency.setValueAtTime(2200, now);
    crack.frequency.exponentialRampToValueAtTime(500, now + 0.05);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.18, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    crack.connect(cg); cg.connect(ctx.destination);
    crack.start(now);
    crack.stop(now + 0.08);
  }

  // A soft, bubbly "pop" — a chicken hatching out of its coop. A quick
  // upward pitch blip with a tiny noise lip so it reads as a cork-pop.
  function playChickenPop() {
    queueNetSound('chickenPop');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Body: sine blipping up in pitch, very short.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.001, now);
    og.gain.exponentialRampToValueAtTime(0.26, now + 0.012);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(og); og.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.14);
    // Lip: a tiny filtered noise tick for the "p" of the pop.
    const dur = 0.04;
    const sz = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < sz; i++) {
      const t = i / ctx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 140);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    const ng = ctx.createGain();
    ng.gain.value = 0.18;
    noise.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    noise.start(now); noise.stop(now + dur);
  }

  // "March of the wolves" — the cue that fires when a wave begins. A low,
  // marching staccato pulse on the beat plus a short rising minor-third
  // horn call, so it lands as "here they come" without the dread of the
  // Night-of-the-Wolf howl.
  function playWaveStart() {
    queueNetSound('waveStart');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Marching low pulses — four square-wave stomps on the beat.
    function stomp(at, freq) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(0.22, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + 0.18);
    }
    const beat = 0.18;
    stomp(now,            73);  // D2
    stomp(now + beat,     73);
    stomp(now + beat * 2, 98);  // G2
    stomp(now + beat * 3, 98);
    // Horn call over the top — a rising minor third, sawtooth through a
    // lowpass so it growls rather than blares.
    function horn(at, freq, dur) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, at);
      g.gain.exponentialRampToValueAtTime(0.2, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      osc.connect(lp); lp.connect(g); g.connect(ctx.destination);
      osc.start(at); osc.stop(at + dur + 0.02);
    }
    horn(now + beat * 2, 196, 0.22); // G3
    horn(now + beat * 3, 233, 0.4);  // A#3 — the call resolves up a minor third
    // Late-game intensity: the march gains extra brass as the waves climb.
    // Wave 25+ extends the call one note higher; wave 50+ piles on a blaring
    // climax over a low war-drone so each tier feels more menacing.
    if (wave >= 25) {
      stomp(now + beat * 4, 110);      // A2 — an extra marching beat
      horn(now + beat * 4, 277, 0.32); // C#4 — pushes the call higher
    }
    if (wave >= 50) {
      stomp(now + beat * 5, 123);        // B2
      horn(now + beat * 4.5, 330, 0.30); // E4
      horn(now + beat * 5,   392, 0.52); // G4 — a blaring climax
      // Low sustained war-drone underneath it all.
      const drone = ctx.createOscillator();
      drone.type = 'sawtooth';
      drone.frequency.value = 55;        // A1
      const dlp = ctx.createBiquadFilter();
      dlp.type = 'lowpass'; dlp.frequency.value = 300;
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.001, now);
      dg.gain.exponentialRampToValueAtTime(0.12, now + 0.1);
      dg.gain.exponentialRampToValueAtTime(0.001, now + beat * 6);
      drone.connect(dlp); dlp.connect(dg); dg.connect(ctx.destination);
      drone.start(now); drone.stop(now + beat * 6 + 0.1);
    }
  }

  // The keeper falling — a heavy body thud plus a short downward groan, so a
  // death lands with weight before the game-over screen fades in.
  function playKeeperDeath() {
    queueNetSound('keeperDeath');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Body thud — a low sine dropping in pitch under a filtered noise impact.
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(180, now);
    thud.frequency.exponentialRampToValueAtTime(50, now + 0.18);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.0001, now);
    tg.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    thud.connect(tg); tg.connect(ctx.destination);
    thud.start(now); thud.stop(now + 0.32);
    // Impact dust — a burst of lowpassed noise for the hit on the ground.
    const dur = 0.16;
    const sz = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < sz; i++) {
      const t = i / ctx.sampleRate;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 30);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = b;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.value = 0.3;
    noise.connect(lp); lp.connect(ng); ng.connect(ctx.destination);
    noise.start(now); noise.stop(now + dur);
    // Groan — a brief sawtooth sliding down through a lowpass, the keeper's "oof".
    const groan = ctx.createOscillator();
    groan.type = 'sawtooth';
    groan.frequency.setValueAtTime(220, now + 0.02);
    groan.frequency.exponentialRampToValueAtTime(110, now + 0.34);
    const gp = ctx.createBiquadFilter();
    gp.type = 'lowpass';
    gp.frequency.value = 1100;
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0.0001, now + 0.02);
    gg.gain.exponentialRampToValueAtTime(0.16, now + 0.07);
    gg.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    groan.connect(gp); gp.connect(gg); gg.connect(ctx.destination);
    groan.start(now + 0.02); groan.stop(now + 0.4);
  }

  // Cryptid Radar alarm — an aggressive klaxon: three rapid, harsh sawtooth
  // blasts with a dissonant overtone, so a cryptid lock reads as a warning,
  // not a gentle sonar ping. No toast — this is the only cue.
  function playRadarPing() {
    queueNetSound('radarPing');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // One harsh klaxon blast: a sawtooth tone that snaps up in pitch, doubled
    // a tritone apart through a sharp bandpass for a grating, alarming edge.
    function blast(at, freq, vol) {
      for (const mul of [1, 1.41]) { // root + tritone = dissonant bite
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * mul * 0.85, at);
        osc.frequency.linearRampToValueAtTime(freq * mul, at + 0.05);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = freq * mul * 1.5;
        bp.Q.value = 3.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
        g.gain.setValueAtTime(vol, at + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
        osc.connect(bp); bp.connect(g); g.connect(ctx.destination);
        osc.start(at); osc.stop(at + 0.15);
      }
    }
    blast(now,        660, 0.16);
    blast(now + 0.14, 660, 0.16);
    blast(now + 0.28, 660, 0.16);
  }

  // Rocket Boots lift-off — a jet whoosh: a band of filtered noise that swells
  // then fades over a low descending rumble, so a launch reads as a thruster.
  function playRocketBoots() {
    queueNetSound('rocketBoots');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.7;
    // Jet noise — white noise through a sweeping bandpass.
    const sz = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, now);
    bp.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
    bp.frequency.exponentialRampToValueAtTime(700, now + dur);
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.28, now + 0.06);
    ng.gain.setValueAtTime(0.28, now + 0.18);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    noise.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    noise.start(now); noise.stop(now + dur);
    // Low thruster rumble — a sine dropping in pitch under the whoosh.
    const rum = ctx.createOscillator();
    rum.type = 'sine';
    rum.frequency.setValueAtTime(140, now);
    rum.frequency.exponentialRampToValueAtTime(60, now + dur);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, now);
    rg.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
    rg.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    rum.connect(rg); rg.connect(ctx.destination);
    rum.start(now); rum.stop(now + dur + 0.02);
  }

  // Critical reload — a beefy, badass "ka-CHING": a punchy sub thump under a
  // bright rising metallic shing, with a noise bite on the attack.
  // Metaverse — a shimmering ascending arpeggio with a swelling pad, so the
  // run-bending capstone announces itself when it's clicked.
  // Boss dash — a guttural engine roar: a falling sawtooth growl under a
  // swelling band of filtered noise.
  function playBossDash() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    o.connect(lp); lp.connect(og); og.connect(ctx.destination);
    o.start(now); o.stop(now + 0.6);
    // Noise whoosh.
    const dur = 0.45, sz = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / sz);
    const ns = ctx.createBufferSource(); ns.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0.16;
    ns.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    ns.start(now); ns.stop(now + dur);
  }

  // Boss crushing a wall — a short crunchy debris burst with a low thud.
  function playBossCrush() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.16, sz = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < sz; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 28); }
    const ns = ctx.createBufferSource(); ns.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    ns.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
    ns.start(now); ns.stop(now + dur);
    // Low thud.
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, now); o.frequency.exponentialRampToValueAtTime(50, now + 0.14);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.3, now); og.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    o.connect(og); og.connect(ctx.destination);
    o.start(now); o.stop(now + 0.18);
  }

  // Short rising bell for the "new upgrades unlocked" banner — deliberately
  // lighter than the Metaverse fanfare so it doesn't steal the wave-start cue.
  function playUnlockChime() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    [659, 880, 1175].forEach((f, i) => {
      const t = now + i * 0.09;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.36);
    });
  }

  function playMetaverse() {
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [392, 523, 659, 784, 988, 1175]; // G-major-ish rising run
    notes.forEach((f, i) => {
      const t = now + i * 0.08;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.45);
    });
    // Shimmering pad swell underneath.
    const pad = ctx.createOscillator();
    pad.type = 'sawtooth';
    pad.frequency.setValueAtTime(196, now);
    pad.frequency.exponentialRampToValueAtTime(392, now + 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1200;
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, now);
    pg.gain.exponentialRampToValueAtTime(0.1, now + 0.25);
    pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    pad.connect(lp); lp.connect(pg); pg.connect(ctx.destination);
    pad.start(now); pad.stop(now + 1.0);
  }

  function playCritical() {
    queueNetSound('critical');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Punchy sub thump for weight.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(170, now);
    sub.frequency.exponentialRampToValueAtTime(58, now + 0.18);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.32, now + 0.01);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    sub.connect(sg); sg.connect(ctx.destination);
    sub.start(now); sub.stop(now + 0.24);
    // Metallic "shing" — two detuned saws sweeping up through a bandpass.
    for (const det of [1, 1.5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520 * det, now);
      osc.frequency.exponentialRampToValueAtTime(1040 * det, now + 0.09);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1700 * det; bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      osc.connect(bp); bp.connect(g); g.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.28);
    }
    // Noise transient for the attack bite.
    const dur = 0.05;
    const sz = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, sz, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < sz; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / sz * 6);
    const noise = ctx.createBufferSource(); noise.buffer = b;
    const nbp = ctx.createBiquadFilter(); nbp.type = 'highpass'; nbp.frequency.value = 2200;
    const ng = ctx.createGain(); ng.gain.value = 0.2;
    noise.connect(nbp); nbp.connect(ng); ng.connect(ctx.destination);
    noise.start(now); noise.stop(now + dur);
  }

  // The crit SHOT itself — distinct from the crit reload "ka-CHING". A bright,
  // zippy laser-like "pew" with a quick downward pitch sweep so every primed
  // round that leaves the barrel pings differently from a normal shot.
  function playCritShot() {
    queueNetSound('critShot');
    const ctx = getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Sharp descending square — the "zip".
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1650, now);
    osc.frequency.exponentialRampToValueAtTime(430, now + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.16, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
    osc.connect(hp); hp.connect(g); g.connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.16);
    // A bright sine sparkle on top for the "ping".
    const spk = ctx.createOscillator();
    spk.type = 'sine';
    spk.frequency.setValueAtTime(2600, now);
    spk.frequency.exponentialRampToValueAtTime(3400, now + 0.05);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.08, now + 0.004);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    spk.connect(sg); sg.connect(ctx.destination);
    spk.start(now); spk.stop(now + 0.1);
  }

