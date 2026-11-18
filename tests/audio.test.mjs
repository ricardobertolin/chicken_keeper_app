import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');

function audioGame() {
  const nodes = [];
  function param(value = 0) {
    return { value, events: [],
      setValueAtTime(v, t) { this.events.push(['set', v, t]); },
      linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); },
      exponentialRampToValueAtTime(v, t) { this.events.push(['exponential', v, t]); },
      cancelScheduledValues(t) { this.events.push(['cancel', t]); },
    };
  }
  function node(kind) {
    const n = { kind, connections: [], stops: [], gain: param(1),
      frequency: param(440), Q: param(1),
      connect(target) { this.connections.push(target); },
      start(at = 0) { this.started = at; },
      stop(at) { this.stops.push(at); },
    };
    nodes.push(n); return n;
  }
  const audio = {
    sampleRate: 22050, currentTime: 0, destination: {},
    createGain: () => node('gain'),
    createOscillator: () => node('oscillator'),
    createBiquadFilter: () => node('filter'),
    createBufferSource: () => node('source'),
    createBuffer(channels, length, sampleRate) {
      const data = Array.from({length: channels}, () => new Float32Array(length));
      return {numberOfChannels: channels, length, sampleRate, getChannelData: i => data[i]};
    },
  };
  const math = Object.create(Math);
  let seed = 972431;
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples = [];
  class FakeAudio {
    constructor(url) { this.url = url; samples.push(this); }
    addEventListener() {}
    cloneNode() { return new FakeAudio(this.url); }
    play() { this.played = true; return Promise.resolve(); }
  }
  const ctx = vm.createContext({Math:math, Map, audio, Audio:FakeAudio,
    multiplayer:false, isHost:true, nightOfWolf:false});
  vm.runInContext(code + '\naudioCtx = audio;', ctx);
  return {run: expr => vm.runInContext(expr, ctx), audio, nodes, samples};
}

test('switching and stopping events fades and stops every source, including bell loops', () => {
  const {run, audio} = audioGame();
  run("startAmbience('snow')");
  const original = run('ambSrcs.slice()');
  const bells = original.find(n => n.buffer?.numberOfChannels === 2);
  assert.ok(bells?.loop, 'snow must have a continuous stereo bell source');
  run("startAmbience('snow')");
  assert.equal(run('ambSrcs.length'), original.length, 'same event must not layer up duplicate audio');
  audio.currentTime = 10;
  run("startAmbience('night')");
  assert.ok(original.every(n => n.stops.includes(10.85)), 'outgoing sources leaked across a switch');
  const current = run('ambSrcs.slice()');
  assert.equal(current.filter(n => n.kind === 'source').length, 1, 'night should only have its cricket source');
  assert.ok(current.filter(n => n.kind === 'source').every(n => n.buffer.numberOfChannels === 1));
  const master = run('ambGain');
  function reaches(node, target) {
    return node === target || (node.connections || []).some(next => reaches(next, target));
  }
  assert.ok(current.filter(n => n.kind === 'source').every(n => reaches(n, master)),
    'noise and bells must share the event fade');
  run('stopAmbience()');
  assert.ok(current.every(n => n.stops.includes(10.85)));
  assert.equal(run('ambSrcs.length'), 0);
  assert.equal(run('ambGain'), null);
  assert.equal(run('ambKind'), '');
  assert.ok(master.gain.events.some(e => e[0] === 'linear' && e[1] === 0.0001 && e[2] === 10.8));
});

test('new night crickets have substantial quiet gaps instead of a continuous chorus', () => {
  const {run, audio} = audioGame();
  const sparse = run("ambNoiseBuffer(audio, 12, 'cricketsSparse')").getChannelData(0);
  const dense = run("ambNoiseBuffer(audio, 12, 'crickets')").getChannelData(0);
  const active = data => data.reduce((sum, value) => sum + (Math.abs(value) > 0.035 ? 1 : 0), 0);
  assert.ok(active(sparse) < active(dense) * 0.15, 'the night chorus is still too dense');
  let gap = 0, longest = 0;
  for (const value of sparse) {
    gap = Math.abs(value) <= 0.035 ? gap + 1 : 0;
    longest = Math.max(longest, gap);
  }
  assert.ok(longest / audio.sampleRate > 1, 'there should be audible pauses between calls');
});

test('musical loops are cached, stereo, and have smooth wrapped tails', () => {
  const {run} = audioGame();
  for (const kind of ['snow']) {
    const a = run(`ambChimeBuffer(audio, '${kind}')`);
    const b = run(`ambChimeBuffer(audio, '${kind}')`);
    assert.equal(a, b, 'restarting an event should reuse the buffer');
    assert.equal(a.numberOfChannels, 2);
    let differs = false, energy = 0;
    const left = a.getChannelData(0), right = a.getChannelData(1);
    for (let i = 0; i < left.length; i++) {
      assert.ok(Number.isFinite(left[i]) && Number.isFinite(right[i]));
      energy += left[i] * left[i] + right[i] * right[i];
      if (Math.abs(left[i] - right[i]) > 0.0001) differs = true;
    }
    assert.ok(energy > 1, 'musical loop is silent');
    assert.ok(differs, 'the selected bell panning was lost');
    assert.ok(Math.abs(left[0] - left.at(-1)) < 0.001, 'loop seam can click');
  }
});

test('the night event has no opening or closing cue while FANGUS retains its warning cue', () => {
  const {run, nodes} = audioGame();
  run('playNightOfWolfStart()');
  assert.ok(nodes.some(n => n.kind === 'oscillator' && n.type === 'sawtooth'));
  nodes.length = 0;
  run('nightOfWolf = true; playNightOfWolfStart(); playNightOfWolfEnd()');
  const oscillators = nodes.filter(n => n.kind === 'oscillator');
  assert.equal(oscillators.length, 0, 'night should have no howl or chime cue');
});

test('music, effects and ambience share one output bus with the new 20% volume cut', () => {
  const {run, nodes, audio} = audioGame();
  run("musicNodes(audio); playShotgun(); startAmbience('rain')");
  const outputs = nodes.filter(n => n.connections.includes(audio.destination));
  assert.equal(outputs.length, 1, 'a sound bypassed the shared volume bus');
  assert.equal(outputs[0].gain.value, 0.8);
  assert.equal(run('audioOutput(audio)'), outputs[0], 'repeated sounds must reuse the bus');
});

test('streamed scream is quieter while the FANGUS roar keeps its established volume', () => {
  const {run, samples} = audioGame();
  run('playWilhelm(); playBossSpawn()');
  const played = samples.filter(s => s.played);
  assert.equal(played.length, 2);
  assert.ok(Math.abs(played[0].volume - 0.44) < 1e-12);
  assert.equal(played[1].volume, 0.6);
});

test('buddy resurrection plays a short soft chime and relays once without echoing from the guest', () => {
  const {run, nodes} = audioGame();
  run('multiplayer = true; isHost = true; playBuddyResurrect()');
  assert.equal(run('pendingNetSounds.join()'), 'buddyResurrect');
  const voices = nodes.filter(n => n.kind === 'oscillator');
  assert.ok(voices.length > 0);
  assert.ok(voices.every(n => n.type === 'sine'));
  assert.ok(voices.every(n => n.stops.length === 1 && n.stops[0] < 1.8), 'chime should end by itself');
  assert.ok(nodes.filter(n => n.kind === 'gain').every(n =>
    n.gain.events.filter(e => e[0] === 'exponential').every(e => e[1] < 0.06)), 'chime should stay gentle');
  run("pendingNetSounds.length = 0; isHost = false; playSoundByName('buddyResurrect')");
  assert.equal(nodes.filter(n => n.kind === 'oscillator').length, voices.length * 2, 'guest did not play the cue');
  assert.equal(run('pendingNetSounds.length'), 0, 'guest must not send the sound back');
});
