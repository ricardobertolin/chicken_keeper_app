// Robot allies (MK-1/2/3), exercised against the real game files. Same
// harness shape as wartime.test.mjs: state.js + helpers.js + spawning.js +
// combat.js share one scope, anything from a file we don't load resolves to a
// permissive stub, and map bounds are seeded because they live in input.js.
import vm from 'node:vm';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert';

const ROOT = new URL('../', import.meta.url);

function stub() {
  const f = function () { return stub(); };
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'length' || k === 'size') return 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return undefined;
      return stub();
    },
    has() { return true; },
  });
}

const seed = {
  Math, JSON, Object, Array, Set, Map, Number, String, Boolean, console, Symbol,
  Date, RegExp, isNaN, parseInt, parseFloat, Infinity, NaN, undefined,
  MAP_SIZE: 40, HALF_MAP: 20, TILE_W: 32, TILE_H: 16,
  playerHats: 3, hatsBought: 0, hatColors: [], shake: 0,
  // Robots take contact damage in their own update; nothing else is stubbed
  // out of their path, so the AI under test is the real one.
  spawnBlast: () => {}, spawnSmoke: () => {}, spawnScorch: () => {},
  playExplosion: () => {}, playWolfScrap: () => {}, playRobotBoot: () => {},
  playRobotShot: () => {}, playUnlockChime: () => {}, playChickenPop: () => {},
  playWoodChop: () => {}, playSparkle: () => {}, playFuseHiss: () => {},
  playParachuteDrop: () => {}, playCrateLand: () => {}, playBuild: () => {},
  toast: () => {}, toastGuest: () => {},
};
const ctxObj = vm.createContext(new Proxy(seed, {
  get(t, k) { return k in t ? t[k] : stub(); },
  has() { return true; },
  set(t, k, v) { t[k] = v; return true; },
}));
for (const f of ['js/state.js', 'js/hints.js', 'js/helpers.js', 'js/spawning.js', 'js/combat.js']) {
  vm.runInContext(fs.readFileSync(new URL(f, ROOT), 'utf8'), ctxObj, { filename: f });
}
const run = (expr) => vm.runInContext(expr, ctxObj);
const reset = () => run(`
  robots.length = 0; wolves.length = 0; chickens.length = 0; coops.length = 0;
  pellets.length = 0; fences.length = 0; wolfScrap.length = 0;
  coops.push({ x: 0, y: 0, level: 0 });
  for (const k in robotTraining) robotTraining[k] = 0;
  inMenu = false; gameOver = false; gameStarted = true; multiplayer = false; isHost = true;
  waveActive = true; bossWaveActive = false; wave = 10;
  player.x = 0; player.y = 0; player.ghost = false;
`);
// Skip the spin-up so a test can get straight to the behaviour.
const booted = (expr) => { run(`${expr}.bootT = 0;`); };

test('all three marks spawn, and the mark drives every stat', () => {
  reset();
  for (const mk of [1, 2, 3]) {
    run('robots.length = 0;');
    const r = run(`spawnRobot(${mk})`);
    assert.ok(r, 'MK-' + mk + ' failed to spawn');
    assert.equal(run('robots.length'), 1);
    assert.equal(run('robots[0].mk'), mk);
    assert.equal(run('robots[0].hp'), run(`ROBOT_HP[${mk}]`));
    assert.equal(run('robots[0].alive'), true);
  }
  // Higher marks must be strictly better at the things that matter.
  const hp = run('ROBOT_HP'), cd = run('ROBOT_FIRE_CD'), err = run('ROBOT_AIM_ERR');
  assert.ok(hp[1] < hp[2] && hp[2] < hp[3], 'plating does not rise with the mark');
  assert.ok(cd[1] > cd[2] && cd[2] > cd[3], 'fire rate does not improve with the mark');
  assert.ok(err[1] > err[2] && err[2] > err[3], 'aim does not tighten with the mark');
});

test('the mark is clamped into range and the bay has a cap', () => {
  reset();
  assert.equal(run('spawnRobot(9).mk'), 3, 'an out-of-range mark should clamp to MK-3');
  run('robots.length = 0;');
  assert.equal(run('spawnRobot(0).mk'), 1, 'mark 0 should clamp to MK-1');
  run('robots.length = 0;');
  const cap = run('ROBOT_MAX_ACTIVE');
  for (let i = 0; i < cap; i++) assert.ok(run('spawnRobot(1)'), 'spawn ' + i + ' refused early');
  assert.equal(run('spawnRobot(1)'), null, 'the bay cap is not enforced');
  assert.equal(run('robots.length'), cap);
});

test('each chassis has its own palette: rusted, gray, black', () => {
  reset();
  const p1 = run('ROBOT_PALETTE[1].plate');
  const p2 = run('ROBOT_PALETTE[2].plate');
  const p3 = run('ROBOT_PALETTE[3].plate');
  assert.ok(p1 !== p2 && p2 !== p3 && p1 !== p3, 'two marks share a chassis colour');
  // Parse to RGB and sanity-check the intent of each.
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(p1), [r2, g2, b2] = rgb(p2), [r3, g3, b3] = rgb(p3);
  assert.ok(r1 > g1 && g1 > b1, 'MK-1 should be warm/rusted, got ' + p1);
  assert.ok(Math.abs(r2 - g2) < 24 && Math.abs(g2 - b2) < 24, 'MK-2 should be neutral gray, got ' + p2);
  assert.ok(r3 < 70 && g3 < 70 && b3 < 70, 'MK-3 should be near-black, got ' + p3);
  // MK-2 must be clearly lighter than MK-3 so the two read apart.
  assert.ok(r2 + g2 + b2 > r3 + g3 + b3 + 180, 'gray and black are too close');
});

test('it spins up before acting, then engages', () => {
  reset();
  run('spawnRobot(2);');
  assert.ok(run('robots[0].bootT') > 0, 'no spin-up window');
  run('wolves.push({ x: 3, y: 0, alive: true, hp: 100, maxHp: 100 });');
  // Mid-boot it must not fire.
  run('updateRobot(robots[0], 0.1);');
  assert.equal(run('pellets.length'), 0, 'fired during spin-up');
  // Burn the boot timer, then it should open up.
  for (let i = 0; i < 200 && run('pellets.length') === 0; i++) run('updateRobot(robots[0], 0.05);');
  assert.ok(run('pellets.length') > 0, 'never fired after spin-up');
  assert.ok(run('robots[0].bootT') <= 0);
});

test('a volley is ally fire: right pellet count, damage and shooter tag', () => {
  reset();
  for (const mk of [1, 2, 3]) {
    run(`robots.length = 0; pellets.length = 0; wolves.length = 0; spawnRobot(${mk});`);
    booted('robots[0]');
    run('wolves.push({ x: 3, y: 0, alive: true, hp: 100, maxHp: 100 });');
    run('robots[0].attackT = 0;');
    run('updateRobot(robots[0], 0.016);');
    assert.equal(run('pellets.length'), run(`ROBOT_PELLETS[${mk}]`), 'wrong pellet count for MK-' + mk);
    const p = run('pellets[0]');
    assert.equal(p.shooter, 'robot', 'robot pellets must be tagged as such');
    assert.equal(p.dmg, run(`ROBOT_DMG[${mk}]`));
    assert.equal(p.robotMk, mk);
    assert.ok(run('pellets.every(p => p.shooter === "robot")'));
  }
});

test('MK-1 shoots the nearest wolf; MK-3 goes for the one stealing a chicken', () => {
  reset();
  // A wolf right next to the robot, and a distant one making off with a bird.
  const setup = (mk) => {
    run(`robots.length = 0; wolves.length = 0; spawnRobot(${mk});`);
    booted('robots[0]');
    run('robots[0].x = 0; robots[0].y = 0;');
    run('wolves.push({ x: 2, y: 0, alive: true, hp: 100, maxHp: 100, carrying: false });');
    run('wolves.push({ x: 7, y: 0, alive: true, hp: 100, maxHp: 100, carrying: true });');
  };
  setup(1);
  assert.equal(run('robotPickTarget(robots[0]) === wolves[0]'), true,
    'MK-1 should take the closest wolf, full stop');
  setup(3);
  assert.equal(run('robotPickTarget(robots[0]) === wolves[1]'), true,
    'MK-3 should prioritise the wolf carrying a chicken');
});

test('MK-3 leaves FANGUS alone while the pack is still standing', () => {
  reset();
  run('robots.length = 0; wolves.length = 0; spawnRobot(3);');
  booted('robots[0]');
  run('robots[0].x = 0; robots[0].y = 0;');
  run('wolves.push({ x: 1.5, y: 0, alive: true, hp: 2000, maxHp: 2000, boss: true });');
  run('wolves.push({ x: 6, y: 0, alive: true, hp: 100, maxHp: 100 });');
  assert.equal(run('robotPickTarget(robots[0]) === wolves[1]'), true,
    'MK-3 should shoot the pack, not the boss, while both are up');
  // With nothing else left it will take the boss rather than idle.
  run('wolves[1].alive = false;');
  assert.equal(run('robotPickTarget(robots[0]) === wolves[0]'), true,
    'with only the boss left it should still engage');
});

test('airborne and invulnerable wolves are not valid targets', () => {
  reset();
  run('spawnRobot(3);');
  booted('robots[0]');
  run('wolves.push({ x: 2, y: 0, alive: true, hp: 10, maxHp: 10, parachuting: true });');
  run('wolves.push({ x: 3, y: 0, alive: true, hp: 10, maxHp: 10, invulnT: 1 });');
  assert.equal(run('robotPickTarget(robots[0])'), null, 'shot at something it cannot reach');
});

test('it closes on a distant wolf and backs off one that gets too close', () => {
  reset();
  run('spawnRobot(2);');
  booted('robots[0]');
  run('robots[0].x = 0; robots[0].y = 0;');
  run('wolves.push({ x: 12, y: 0, alive: true, hp: 100, maxHp: 100 });');
  const d0 = run('Math.hypot(robots[0].x - wolves[0].x, robots[0].y - wolves[0].y)');
  for (let i = 0; i < 40; i++) run('updateRobot(robots[0], 0.016);');
  const d1 = run('Math.hypot(robots[0].x - wolves[0].x, robots[0].y - wolves[0].y)');
  assert.ok(d1 < d0 - 0.5, `did not advance on a distant wolf: ${d0} -> ${d1}`);
  // Now shove a wolf inside its standoff and confirm it retreats.
  run('wolves.length = 0; robots[0].x = 0; robots[0].y = 0;');
  run('wolves.push({ x: 0.9, y: 0, alive: true, hp: 100, maxHp: 100 });');
  const n0 = run('Math.hypot(robots[0].x - wolves[0].x, robots[0].y - wolves[0].y)');
  for (let i = 0; i < 30; i++) run('updateRobot(robots[0], 0.016);');
  const n1 = run('Math.hypot(robots[0].x - wolves[0].x, robots[0].y - wolves[0].y)');
  assert.ok(n1 > n0 + 0.1, `did not back-pedal from a close wolf: ${n0} -> ${n1}`);
});

test('with nothing to shoot it guards the flock instead of wandering off', () => {
  reset();
  run('chickens.push({ x: 9, y: 9, alive: true });');
  run('spawnRobot(2);');
  booted('robots[0]');
  run('robots[0].x = -9; robots[0].y = -9;');
  const d0 = run('Math.hypot(robots[0].x - 9, robots[0].y - 9)');
  for (let i = 0; i < 900; i++) run('updateRobot(robots[0], 0.016);');
  const d1 = run('Math.hypot(robots[0].x - 9, robots[0].y - 9)');
  assert.ok(d1 < d0 - 3, `did not move toward the flock: ${d0} -> ${d1}`);
  assert.equal(run('pellets.length'), 0, 'fired with no wolves on the field');
});

test('wolves mauling the chassis destroy it, leaving scrap and no corpse', () => {
  reset();
  run('spawnRobot(1);');
  booted('robots[0]');
  run('robots[0].x = 0; robots[0].y = 0;');
  // Two wolves right on top of it — contact damage, both counted.
  run('wolves.push({ x: 0.2, y: 0, alive: true, hp: 999, maxHp: 999 });');
  run('wolves.push({ x: 0, y: 0.2, alive: true, hp: 999, maxHp: 999 });');
  const hp0 = run('robots[0].hp');
  run('updateRobot(robots[0], 0.5);');
  const dropped = hp0 - run('robots[0].hp');
  const expect = run('ROBOT_HURT_DPS') * 2 * 0.5;
  assert.ok(Math.abs(dropped - expect) < 1e-6, `contact damage was ${dropped}, expected ${expect}`);
  // Keep going until the plating is gone. The robot is pinned back onto the
  // wolves each tick: left alone it successfully back-pedals out of contact
  // (which test 9 covers), so this is the surrounded-and-cannot-escape case
  // that the contact damage actually models.
  for (let i = 0; i < 200 && run('robots[0].alive'); i++) {
    run('robots[0].x = 0; robots[0].y = 0;');
    run('updateRobot(robots[0], 0.1);');
  }
  assert.equal(run('robots[0].alive'), false, 'it never died to being swarmed');
  assert.equal(run('robots[0].dying'), true, 'it should topple before being pruned');
  assert.ok(run('wolfScrap.length') > 0, 'destruction should throw metal scrap');
  assert.equal(run('corpses.length'), 0, 'a robot must not leave a flesh corpse');
  // The topple plays out, then the chassis is pruned.
  for (let i = 0; i < 100 && run('robots.length') > 0; i++) {
    run('updateRobot(robots[0], 0.05); tickRobotWrecks();');
  }
  assert.equal(run('robots.length'), 0, 'the wreck was never pruned');
});

test('training accumulates per MARK, caps at 1, and tightens aim', () => {
  reset();
  run('spawnRobot(2);');
  const errFresh = run('robotAimErr(robots[0])');
  const cdFresh = run('robotFireCd(robots[0])');
  assert.equal(run('robotSkill(2)'), 0);
  // Credit a handful of kills.
  for (let i = 0; i < 4; i++) run('robotCreditKill(robots[0]);');
  const sk = run('robotSkill(2)');
  assert.ok(Math.abs(sk - 4 * run('ROBOT_TRAIN_PER_KILL')) < 1e-9, 'skill did not accrue per kill');
  assert.ok(run('robotAimErr(robots[0])') < errFresh, 'training did not tighten the aim');
  assert.ok(run('robotFireCd(robots[0])') < cdFresh, 'training did not speed the reload');
  // Other marks are untouched — training is per mark, not global.
  assert.equal(run('robotSkill(1)'), 0, 'training leaked across marks');
  assert.equal(run('robotSkill(3)'), 0, 'training leaked across marks');
  // It survives the unit being destroyed and rebuilt.
  run('robots.length = 0;');
  run('spawnRobot(2);');
  assert.ok(Math.abs(run('robotSkill(2)') - sk) < 1e-9, 'a rebuilt MK-2 forgot its training');
  // And it caps.
  for (let i = 0; i < 200; i++) run('robotCreditKill(robots[0]);');
  assert.equal(run('robotSkill(2)'), 1, 'training should cap at 1');
  // Even fully trained, aim error never reaches zero — ROBOT_TRAIN_CAP holds
  // some wobble back so an MK is never a perfect turret.
  assert.ok(run('robotAimErr(robots[0])') > 0, 'a trained robot should still miss sometimes');
  const floor = run('ROBOT_AIM_ERR[2] * (1 - ROBOT_TRAIN_CAP)');
  assert.ok(Math.abs(run('robotAimErr(robots[0])') - floor) < 1e-9);
});

test('a trained MK-1 still aims worse than a fresh MK-3', () => {
  reset();
  run('spawnRobot(1); spawnRobot(3);');
  for (let i = 0; i < 100; i++) run('robotCreditKill(robots[0]);'); // max out the MK-1
  const mk1 = run('robotAimErr(robots.find(r => r.mk === 1))');
  const mk3 = run('robotAimErr(robots.find(r => r.mk === 3))');
  assert.ok(mk1 > mk3, `a maxed MK-1 (${mk1}) should not out-aim a fresh MK-3 (${mk3})`);
});

// ---- The typed cheat phrases -------------------------------------------
// input.js can't be loaded whole (its top level wires DOM listeners), so the
// phrase matcher is lifted out of the shipped source by text and re-wired
// against recording stubs. It is the real function body, not a copy.
const inputSrc = fs.readFileSync(new URL('js/input.js', ROOT), 'utf8');
function makeMatcher() {
  const block = inputSrc.slice(
    inputSrc.indexOf('  let debugUnlocked = false;'),
    inputSrc.indexOf('  function requestRobot(mk) {')
  );
  if (!block.includes('ROBOT_PHRASES')) throw new Error('could not lift the phrase matcher');
  const calls = { robots: [], toasts: [] };
  const sandbox = {
    DEBUG: true,
    DEBUG_PHRASE: 'debug',
    Math, Object,
    toast: (m) => calls.toasts.push(m),
    requestRobot: (mk) => calls.robots.push(mk),
    document: { getElementById: () => null },
  };
  const c = vm.createContext(sandbox);
  vm.runInContext(block + '\nglobalThis.__type = (s) => { for (const ch of s) trackDebugPhrase(ch); };'
    + '\nglobalThis.__unlocked = () => debugUnlocked;', c);
  return {
    type: (s) => vm.runInContext(`__type(${JSON.stringify(s)})`, c),
    unlocked: () => vm.runInContext('__unlocked()', c),
    calls,
  };
}

test('typing robot1 / robot2 / robot3 summons that mark', () => {
  for (const [phrase, mk] of [['robot1', 1], ['robot2', 2], ['robot3', 3]]) {
    const m = makeMatcher();
    m.type(phrase);
    assert.deepEqual(m.calls.robots, [mk], phrase + ' did not summon an MK-' + mk);
  }
});

test('digits no longer flush the buffer (the bug that made robot1 impossible)', () => {
  // Before the fix the matcher cleared on any non-letter, so a phrase ending
  // in a digit could never complete.
  assert.ok(inputSrc.includes('a-zA-Z0-9'), 'the matcher still rejects digits');
  const m = makeMatcher();
  m.type('ROBOT2'); // case-insensitive
  assert.deepEqual(m.calls.robots, [2], 'uppercase typing should still match');
});

test('a phrase matches at the end of a longer run of typing', () => {
  const m = makeMatcher();
  m.type('wasdwasdrobot3');
  assert.deepEqual(m.calls.robots, [3], 'a trailing phrase should still fire');
});

test('an interrupted phrase does not fire', () => {
  const m = makeMatcher();
  m.type('robot');
  m.type(' ');   // space flushes
  m.type('1');
  assert.deepEqual(m.calls.robots, [], 'a broken-up phrase must not count');
});

test('the phrase is consumed, so holding a key cannot spam robots', () => {
  const m = makeMatcher();
  m.type('robot1');
  m.type('1111');
  assert.deepEqual(m.calls.robots, [1], 'trailing digits re-triggered the spawn');
});

test('debug still toggles the panel, and the robot phrases do not disturb it', () => {
  const m = makeMatcher();
  m.type('debug');
  assert.equal(m.unlocked(), true, 'debug no longer unlocks the panel');
  m.type('robot2');
  assert.equal(m.unlocked(), true, 'a robot phrase toggled the debug panel');
  assert.deepEqual(m.calls.robots, [2]);
  m.type('debug');
  assert.equal(m.unlocked(), false, 'typing debug again should hide it');
});
