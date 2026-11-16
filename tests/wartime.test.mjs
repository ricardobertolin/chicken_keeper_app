// Wartime effort / supply crates / soldier chickens, exercised against the
// real game files. state.js + helpers.js + spawning.js + combat.js are loaded
// into one shared scope the way index.html loads them; anything they reach for
// that lives in a file we haven't loaded resolves to a permissive stub, and the
// handful of cross-file globals the tests actually assert on are seeded as real
// values so writes to them stick.
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

// Damage the blasts deal, so a test can assert who got hit and for how much.
const hits = { wolves: [], keepers: [] };
const seed = {
  Math, JSON, Object, Array, Set, Map, Number, String, Boolean, console, Symbol,
  Date, RegExp, isNaN, parseInt, parseFloat, Infinity, NaN, undefined,
  // Cross-file globals the tests read or write. Only names NOT declared in a
  // loaded file land here — a `let`/`const`/`function` in state.js, helpers.js,
  // spawning.js or combat.js shadows anything seeded, so e.g. `player` and
  // `applyFriendlyFireHit` are the game's real ones and the tests assert on
  // their real effects instead of stubbing them.
  playerHats: 3,
  hatsBought: 0,
  hatColors: [],
  shake: 0,
  // Map bounds live in input.js, which this harness doesn't load (it wires up
  // DOM listeners at the top level). Without these the movement clamps get
  // garbage bounds and pin every chicken to a corner.
  MAP_SIZE: 40,
  HALF_MAP: 20,
  TILE_W: 32,
  TILE_H: 16,
  hurtWolf: (w, dmg) => { hits.wolves.push({ w, dmg }); w.hp = (w.hp || 10) - dmg; },
  // Effects and sound are not under test — swallow them.
  spawnBlast: () => {}, spawnSmoke: () => {}, spawnScorch: () => {},
  playExplosion: () => {}, playWoodChop: () => {}, playSparkle: () => {},
  playChickenPop: () => {}, playParachuteDrop: () => {}, playCrateLand: () => {},
  playFuseHiss: () => {}, playBuild: () => {},
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
// Put the world into a known state: mid-wave, one coop, nothing in the air.
const reset = () => run(`
  supplyCrates.length = 0; chickens.length = 0; wolves.length = 0; coops.length = 0;
  coops.push({ x: 0, y: 0, level: 0 });
  inMenu = false; gameOver = false; gameStarted = true; multiplayer = false; isHost = true;
  waveActive = true; bossWaveActive = false; wave = 10; wartimeNoticeT = 0;
`);

test('wartime effort is +50% hatch rate, and only during the boss fight', () => {
  reset();
  assert.equal(run('WARTIME_HATCH_MUL'), 1.5);
  assert.equal(run('wartimeEffort()'), false);
  assert.equal(run('wartimeHatchMul()'), 1, 'no buff outside the boss fight');
  run('bossWaveActive = true;');
  assert.equal(run('wartimeEffort()'), true);
  // The coop timer is an INTERVAL, so +50% rate means the wait is divided.
  const mul = run('wartimeHatchMul()');
  assert.ok(Math.abs(mul - 1 / 1.5) < 1e-9, 'expected 1/1.5, got ' + mul);
  assert.ok(Math.abs(1 / mul - 1.5) < 1e-9, 'inverted interval is not a 1.5x rate');
});

test('the airlift runs during the boss, is rare past it, and is off before it', () => {
  reset();
  assert.equal(run('crateDropsActive()'), false, 'no drops on an ordinary wave');
  run('bossWaveActive = true;');
  assert.equal(run('crateDropsActive()'), true, 'drops during the boss fight');
  run('bossWaveActive = false; wave = 51;');
  assert.equal(run('crateDropsActive()'), true, 'rare drops in the endless waves');
  run('wave = 50;');
  assert.equal(run('crateDropsActive()'), false, 'the boss wave itself only drops via bossWaveActive');
  // A guest must never roll its own drops — the host owns the world.
  run('bossWaveActive = true; multiplayer = true; isHost = false;');
  assert.equal(run('crateDropsActive()'), false, 'guest must not roll drops');
  run('multiplayer = false; isHost = true;');
});

test('the first active frame arms the timer instead of dropping instantly', () => {
  reset();
  run('bossWaveActive = true; crateDropT = 0;');
  run('updateSupplyDrops(0.016);');
  assert.equal(run('supplyCrates.length'), 0, 'a crate landed on the boss intro');
  const armed = run('crateDropT');
  assert.ok(armed >= run('CRATE_DROP_MIN') && armed <= run('CRATE_DROP_MAX'),
    'timer armed outside the 15-30s window: ' + armed);
});

test('boss-fight drops land on the 15-30s cadence', () => {
  reset();
  run('bossWaveActive = true; crateDropT = 0;');
  run('updateSupplyDrops(0.016);'); // arm
  // Burn the armed timer, then confirm each expiry produces exactly one crate.
  for (let drop = 1; drop <= 3; drop++) {
    let t = 0;
    while (run('supplyCrates.length') < drop && t < 60) { run('updateSupplyDrops(0.25);'); t += 0.25; }
    assert.equal(run('supplyCrates.length'), drop, `drop ${drop} never came`);
    assert.ok(t >= 15 && t <= 31, `drop ${drop} waited ${t}s, outside 15-30`);
  }
});

test('a crate falls under canopy and cannot be shot out of the sky', () => {
  reset();
  run('dropSupplyCrate();');
  assert.equal(run('supplyCrates.length'), 1);
  assert.equal(run('supplyCrates[0].para'), true);
  assert.equal(run('supplyCrates[0].paraH'), run('PARACHUTE_START_H'));
  // In the air: no hit registers and the HP is untouched.
  assert.equal(run('hurtSupplyCrate(supplyCrates[0], 99)'), false, 'shot a crate in mid-air');
  assert.equal(run('supplyCrates[0].hp'), run('CRATE_HP'));
  assert.equal(run('supplyCrateAt(supplyCrates[0].x, supplyCrates[0].y, 1)'), null);
  // Fall the whole way down.
  for (let i = 0; i < 300 && run('supplyCrates[0].para'); i++) run('updateSupplyCrates(0.016);');
  assert.equal(run('supplyCrates[0].para'), false, 'crate never landed');
  assert.equal(run('supplyCrates[0].paraH'), 0);
  // Still settling — a brief grace so a shot already in flight can't open it.
  assert.ok(run('supplyCrates[0].landT') > 0);
  assert.equal(run('hurtSupplyCrate(supplyCrates[0], 1)'), false, 'opened mid-settle');
  for (let i = 0; i < 100 && run('supplyCrates[0].landT') > 0; i++) run('updateSupplyCrates(0.016);');
  assert.equal(run('hurtSupplyCrate(supplyCrates[0], 1)'), true, 'a landed crate must take hits');
  assert.equal(run('supplyCrates[0].hp'), run('CRATE_HP') - 1);
});

// Drop a crate and put it straight on the ground, ready to be opened.
function landedCrate() {
  run('supplyCrates.length = 0; dropSupplyCrate();');
  run('supplyCrates[0].para = false; supplyCrates[0].paraH = 0; supplyCrates[0].landT = 0;');
  run('supplyCrates[0].x = 0; supplyCrates[0].y = 0;');
}

test('breaking a crate open removes it and yields one of exactly three payloads', () => {
  reset();
  const seen = { boom: 0, hats: 0, cargo: 0 };
  for (let i = 0; i < 400; i++) {
    run('chickens.length = 0; wolves.length = 0; playerHats = 3; hatColors.length = 0;');
    landedCrate();
    const hatsBefore = run('playerHats');
    run(`hurtSupplyCrate(supplyCrates[0], ${run('CRATE_HP')});`);
    assert.equal(run('supplyCrates.length'), 0, 'an opened crate was left in the array');
    const gotHats = run('playerHats') - hatsBefore;
    const gotBirds = run('chickens.length');
    if (gotHats > 0) { seen.hats++; assert.equal(gotHats, 3, 'hat pack must be 3 hats'); }
    else if (gotBirds > 0) {
      seen.cargo++;
      assert.ok(gotBirds >= run('CRATE_CHICKENS_MIN') && gotBirds <= run('CRATE_CHICKENS_MAX'),
        'live cargo was ' + gotBirds + ' birds');
    } else seen.boom++;
  }
  assert.ok(seen.boom > 0 && seen.hats > 0 && seen.cargo > 0,
    'not every payload is reachable: ' + JSON.stringify(seen));
  // Weights should be in the right ballpark over 400 rolls.
  assert.ok(Math.abs(seen.boom / 400 - run('CRATE_PAYLOAD_BOOM')) < 0.08, 'boom rate off: ' + seen.boom);
  assert.ok(Math.abs(seen.hats / 400 - run('CRATE_PAYLOAD_HATS')) < 0.08, 'hat rate off: ' + seen.hats);
});

// Open a landed crate with the payload roll pinned to `roll`.
function openWithRoll(roll) {
  const realRandom = Math.random;
  Math.random = () => roll;
  try { run(`hurtSupplyCrate(supplyCrates[0], ${run('CRATE_HP')});`); }
  finally { Math.random = realRandom; }
}

test('the booby-trapped payload hurts the pack AND the keeper', () => {
  reset();
  hits.wolves.length = 0;
  run('wolves.push({ x: 0.5, y: 0, alive: true, hp: 100 });');  // inside the blast
  run('wolves.push({ x: 20,  y: 0, alive: true, hp: 100 });');  // well outside it
  // The real keeper object, stood right on the crate. hurtT/bulletHitT are what
  // applyFriendlyFireHit sets unconditionally once a keeper is caught.
  run('player.x = 0.5; player.y = 0; player.ghost = false; player.flightT = 0;');
  run('player.bulletHitT = 0; player.hurtT = 0;');
  landedCrate();
  openWithRoll(0); // 0 < CRATE_PAYLOAD_BOOM
  assert.equal(hits.wolves.length, 1, 'blast should catch exactly the near wolf');
  assert.equal(hits.wolves[0].dmg, run('CRATE_BLAST_DMG'));
  assert.ok(run('player.hurtT') > 0, 'the keeper standing on it must take the hit');
});

test('a keeper clear of the blast is untouched by it', () => {
  reset();
  hits.wolves.length = 0;
  run('player.x = 25; player.y = 25; player.ghost = false; player.flightT = 0;');
  run('player.bulletHitT = 0; player.hurtT = 0;');
  landedCrate(); // sits at 0,0
  openWithRoll(0);
  assert.equal(run('player.hurtT'), 0, 'a keeper across the farm got hit by a crate');
  run('player.x = 0; player.y = 0;');
});

test('live cargo can include soldier chickens, and they are not fat/worker/rich', () => {
  reset();
  let soldiers = 0, plain = 0;
  for (let i = 0; i < 300; i++) {
    run('chickens.length = 0;');
    run('spawnCrateChicken(0, 0, true);');
    const c = run('chickens[0]');
    assert.equal(c.soldier, true);
    assert.equal(c.fat, false); assert.equal(c.worker, false); assert.equal(c.rich, false);
    soldiers++;
    run('chickens.length = 0; spawnCrateChicken(0, 0, false);');
    if (!run('chickens[0].soldier')) plain++;
  }
  assert.equal(soldiers, 300);
  assert.equal(plain, 300, 'a non-soldier crate bird came out armed');
});

test('a soldier chicken charges the nearest wolf, lights a fuse, then detonates', () => {
  reset();
  hits.wolves.length = 0; hits.keepers.length = 0;
  run('wolves.push({ x: 6, y: 0, alive: true, hp: 100 });');
  run('spawnCrateChicken(0, 0, true);');
  // It should close the distance rather than flee.
  const d0 = run('Math.hypot(chickens[0].x - wolves[0].x, chickens[0].y - wolves[0].y)');
  for (let i = 0; i < 20; i++) run('updateChicken(chickens[0], 0.016);');
  const d1 = run('Math.hypot(chickens[0].x - wolves[0].x, chickens[0].y - wolves[0].y)');
  assert.ok(d1 < d0 - 0.4, `soldier did not charge: ${d0} -> ${d1}`);
  // Run until the fuse is lit.
  for (let i = 0; i < 600 && !(run('chickens[0].fuseT') > 0); i++) run('updateChicken(chickens[0], 0.016);');
  assert.ok(run('chickens[0].fuseT') > 0, 'fuse never lit');
  assert.ok(run('chickens[0].alive'), 'it blew up before the fuse burned');
  // ...and then it goes off, taking itself with it.
  for (let i = 0; i < 200 && run('chickens[0].alive'); i++) run('updateChicken(chickens[0], 0.016);');
  assert.equal(run('chickens[0].alive'), false, 'the fuse burned out without detonating');
  assert.equal(hits.wolves.length, 1, 'the blast missed the wolf it charged');
  assert.equal(hits.wolves[0].dmg, run('SOLDIER_BLAST_DMG'));
  assert.ok(run("player.hurtT") === 0 || run("player.x") > 10, "a soldier must not hit the keeper");
});

test('with no wolves on the field a soldier behaves like an ordinary bird', () => {
  reset();
  run('spawnCrateChicken(0, 0, true);');
  // No wolves: updateSoldierChicken hands back control, so the normal wander
  // path runs and nothing detonates.
  for (let i = 0; i < 300; i++) run('updateChicken(chickens[0], 0.016);');
  assert.equal(run('chickens[0].alive'), true, 'a soldier self-destructed with no target');
  assert.equal(run('chickens[0].fuseT || 0'), 0, 'fuse lit with nothing to charge');
});

test('one blast opens every crate inside it without skipping any', () => {
  reset();
  // Three crates clustered inside the blast, one far outside.
  run('supplyCrates.length = 0;');
  for (const [x, y] of [[0, 0], [0.4, 0.2], [-0.3, 0.3], [30, 30]]) {
    run(`dropSupplyCrate();`);
    run(`(() => { const c = supplyCrates[supplyCrates.length-1];
         c.x = ${x}; c.y = ${y}; c.para = false; c.paraH = 0; c.landT = 0; })();`);
  }
  assert.equal(run('supplyCrates.length'), 4);
  run('openCratesInBlast(0, 0, 2);');
  assert.equal(run('supplyCrates.length'), 1, 'a clustered crate was skipped by the blast');
  assert.ok(run('Math.abs(supplyCrates[0].x) > 10'), 'the wrong crate survived');
});
