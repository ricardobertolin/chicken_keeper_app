import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const files = ['state', 'helpers', 'spawning', 'combat', 'boss', 'wolf-overlay', 'net'];
const sources = files.map(name => [name, fs.readFileSync(new URL('../js/' + name + '.js', import.meta.url), 'utf8')]);

function stub() {
  return new Proxy(function () { return stub(); }, {
    get(_t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'length' || k === 'size') return 0;
      if (k === 'then') return undefined;
      return stub();
    },
  });
}

function game() {
  let sounds = 0;
  let buddySounds = 0;
  const math = Object.create(Math);
  math.random = () => 0.99;
  const seed = {
    Math: math, JSON, Object, Array, Set, Map, Number, String, Boolean,
    Date, RegExp, Symbol, Infinity, NaN, undefined, console,
    MAP_SIZE: 40, HALF_MAP: 20, TILE_W: 32, TILE_H: 16,
    isHost: true, shake: 0,
    playKarma() { sounds++; },
    playBuddyResurrect() { buddySounds++; },
    toast() {}, toastGuest() {},
  };
  const ctx = vm.createContext(new Proxy(seed, {
    get(t, k) { return k in t ? t[k] : stub(); },
    set(t, k, v) { t[k] = v; return true; },
  }));
  const run = expr => vm.runInContext(expr, ctx);
  for (const [name, code] of sources) vm.runInContext(code, ctx, { filename: name + '.js' });
  run(`inMenu = false; multiplayer = true; isHost = true; player2.active = true;
    gameOpts.individualUpgrades = true; wave = 10; pendingSpawns = 0;
    bossWaveActive = false; waveActive = false;`);
  return { run, seed, math, sounds: () => sounds, buddySounds: () => buddySounds };
}

test('buddy revival sounds once for either keeper and stays silent when no revival happens', () => {
  for (const who of ['player', 'player2']) {
    const g = game();
    g.run(`reviveKeeper(${who})`);
    assert.equal(g.buddySounds(), 0, 'living keepers must not trigger the resurrection sound');
    g.run(`${who}.ghost = true; reviveKeeper(${who})`);
    assert.equal(g.buddySounds(), 1);
    assert.equal(g.run(`${who}.ghost`), false);
    assert.equal(g.run(who === 'player' ? 'playerHats' : 'player2.hats'), 3);
    g.run(`reviveKeeper(${who})`);
    assert.equal(g.buddySounds(), 1, 'repeat calls must not replay the cue');
  }
});

test('all events exclude waves 48–51, the post-snow wave and their own cooldown, even when forced', () => {
  for (const kind of ['night', 'rain', 'snow']) {
    const { run, math } = game();
    math.random = () => 0;
    run(kind === 'night' ? 'nightOfWolfDebugForce = true' : `weatherEvents.${kind}.force = true`);
    for (let wave = 48; wave <= 51; wave++) {
      run(`wave = ${wave}`);
      assert.equal(run(`eventRollFor('${kind}')`), false);
    }
    run('wave = 52; snowLeftover = 1');
    assert.equal(run(`eventRollFor('${kind}')`), false);
    run('snowLeftover = 0');
    const state = kind === 'night' ? 'nightEvent' : `weatherEvents.${kind}`;
    run(`${state}.lastWave = 49`);
    assert.equal(run(`eventRollFor('${kind}')`), false);
    run(`${state}.lastWave = 47`);
    assert.equal(run(`eventRollFor('${kind}')`), true);
  }
});

test('the rolling cooldown applies before wave 48 and across endless block boundaries', () => {
  for (const kind of ['night', 'rain', 'snow']) {
    const { run, math } = game();
    math.random = () => 0;
    const state = kind === 'night' ? 'nightEvent' : `weatherEvents.${kind}`;
    run(`${state}.lastWave = 14; wave = 15`);
    assert.equal(run(`eventRollFor('${kind}')`), false);
    run('wave = 19');
    assert.equal(run(`eventRollFor('${kind}')`), true);
    run(`${state}.lastWave = 55; wave = 56`);
    assert.equal(run(`eventRollFor('${kind}')`), false);
    run('wave = 60');
    assert.equal(run(`eventRollFor('${kind}')`), true);
    assert.equal(run(`${state}.nextWave`), 60);
  }
});

test('early odds and per-type caps are retained; endless scheduling cannot select excluded wave 51', () => {
  const { run, math } = game();
  math.random = () => 0.159;
  assert.equal(run("eventRollFor('rain')"), true);
  math.random = () => 0.16;
  assert.equal(run("eventRollFor('rain')"), false);
  run('resurrectCount = 1');
  assert.equal(run("eventRollFor('rain')"), true);
  run('weatherEvents.rain.count = 3');
  assert.equal(run("eventRollFor('rain')"), false);
  run('wave = 52'); math.random = () => 0;
  assert.equal(run("eventRollFor('rain')"), true);
  assert.equal(run('weatherEvents.rain.nextWave'), 52);
});

test('snow leaves exactly one quiet following wave, then events become eligible again', () => {
  const { run, math } = game(); math.random = () => 0;
  run("wave = 20; weather = 'snow'; weatherEvents.snow.lastWave = wave; endWeather();");
  run('wave = 21; snowLeftover--'); // startWave ages the leftover before rolling
  for (const kind of ['night', 'rain', 'snow']) assert.equal(run(`eventRollFor('${kind}')`), false);
  run('wave = 22; snowLeftover--');
  assert.equal(run("eventRollFor('night')"), true);
  assert.equal(run("eventRollFor('rain')"), true);
});

test('karma is independent per keeper, caps at ±25 and freezes at zero after transcendence', () => {
  const { run } = game();
  run('player.karma = 24; player2.karma = -24; advanceKarma(player, 0); advanceKarma(player2, 12)');
  assert.equal(run('karma'), 25);
  assert.equal(run('player2.karma'), -25);
  run('advanceKarma(player, 0); advanceKarma(player2, 1)');
  assert.equal(run('player.karma'), 25);
  assert.equal(run('player2.karma'), -25);
  run('player.transcendentKarma = true; advanceKarma(player, 10); advanceKarma(player, 0)');
  assert.equal(run('karma'), 0);
});

test('starting real waves records event history and ages snow before choosing the next event', () => {
  for (const kind of ['night', 'rain', 'snow']) {
    const { run } = game();
    run(`wave = 19; ${kind === 'night' ? 'nightOfWolfDebugForce' : `weatherEvents.${kind}.force`} = true; startWave()`);
    const state = kind === 'night' ? 'nightEvent' : `weatherEvents.${kind}`;
    assert.equal(run(`${state}.lastWave`), 20);
    assert.equal(run(kind === 'night' ? 'nightOfWolf' : `weather === '${kind}'`), true);
    if (kind === 'snow') {
      run('endWeather(); nightOfWolfDebugForce = true; startWave()');
      assert.equal(run('wave'), 21);
      assert.equal(run('nightOfWolf'), false);
      assert.equal(run('weather'), '');
      run('startWave()');
      assert.equal(run('wave'), 22);
      assert.equal(run('nightOfWolf'), true);
    }
  }
});

test('a real wave clear freezes transcendent karma and still updates the other keeper independently', () => {
  const { run } = game();
  run(`player.transcendentKarma = true; player.karma = 0; karma = 0;
    player2.karma = -24; chickensKilledByPlayer = 8; player2.chickensKilledThisWave = 1;
    waveActive = true; pendingSpawns = 0; checkWaveDefended();`);
  assert.equal(run('player.karma'), 0);
  assert.equal(run('karma'), 0);
  assert.equal(run('player2.karma'), -25);
});

test('shooting a soldier counts its death and bad karma before its blast clears the wave', () => {
  const { run, seed } = game();
  seed.inBounds = () => true;
  run(`waveActive = true; pendingSpawns = 0; player2.active = false;
    player.karma = 0; karma = 0; chickensKilledByPlayer = 0;
    chickens.push({alive:true, soldier:true, savedT:0, x:0, y:0});
    wolves.push({alive:true, hp:1, x:1, y:0, size:1});
    updatePellet({x:0,y:0,vx:0,vy:0,life:1,dmg:1,pierce:1,shooter:1}, 0.016);`);
  assert.equal(run('waveActive'), false);
  assert.equal(run('bonusDeathSnapshot'), 1);
  assert.equal(run('player.karma'), -1);
  assert.equal(run('chickensKilledByPlayer'), 0, 'wave completion must consume the friendly-fire tally');
});

test('good/bad hat avoidance uses the doubled per-point bonus', () => {
  const { run, math } = game();
  run('player.karma = 25'); math.random = () => 0.149;
  assert.equal(run('keeperDodgesHatLoss(player)'), true);
  math.random = () => 0.151;
  assert.equal(run('keeperDodgesHatLoss(player)'), false);
  run('player.karma = -25'); math.random = () => 0.199;
  assert.equal(run('keeperDodgesHatLoss(player)'), true);
  math.random = () => 0.201;
  assert.equal(run('keeperDodgesHatLoss(player)'), false);
});

test('fatal hits rescue either keeper at either extreme with three hats, own karma reset and sound', () => {
  for (const who of ['player', 'player2']) for (const sign of [1, -1]) {
    const g = game(); const { run } = g;
    run(`player.karma = 8; player2.karma = 9; ${who}.karma = ${sign * 25};
      playerHats = 1; player2.hats = 1; player.wolfHitT = 0; player2.wolfHitT = 0;
      chickens.push({alive:true, x:10, y:10, savedT:0});
      applyWolfBulletHit(${who});`);
    assert.equal(run(who === 'player' ? 'playerHats' : 'player2.hats'), 3);
    assert.equal(run(`${who}.karma`), 0);
    assert.equal(run(`!!${who}.dying`), false);
    assert.equal(run(`${who}.ghost`), false);
    assert.equal(run(who === 'player' ? 'player2.karma' : 'player.karma'), who === 'player' ? 9 : 8);
    assert.equal(run('chickens[0].alive'), sign > 0);
    assert.equal(run(who === 'player' ? 'hatColors[0]' : 'player2.hatColors[0]'), sign > 0 ? '#f4f4f4' : '#161616');
    assert.equal(g.sounds(), 1);
  }
});

test('rescue applies to boss contact, parry dash and pup bites for player 2', () => {
  for (const hit of ['bossTouchHit(player2)', 'parryDashHitKeeper({}, player2)', 'pupBiteKeeper(player2)']) {
    const { run } = game();
    run(`player2.karma = 25; player2.hats = 1; ${hit}`);
    assert.equal(run('player2.hats'), 3);
    assert.equal(run('player2.karma'), 0);
    assert.equal(run('!!player2.dying'), false);
  }
});

test('transcendence needs personal Metaverse, a recent rescue and 30 continuous seconds of active Last Stand', () => {
  for (const who of ['player', 'player2']) {
    const g = game(); const { run } = g;
    const levels = who === 'player' ? 'upgradeLevels' : 'upgradeLevels2';
    run(`${who}.lastStandIdleT = LAST_STAND_CHARGE; ${levels}.lastStand = 1;
      updateTranscendentKarma(${who}, 30);`);
    assert.equal(run(`${who}.transcendentKarma`), false);
    run(`${levels}.metaverse = 1; ${who}.karma = 1; updateTranscendentKarma(${who}, 30)`);
    assert.equal(run(`${who}.transcendentKarma`), false);
    run(`${who}.lastKarmaRescueWave = wave; updateTranscendentKarma(${who}, 20); breakLastStand(${who});
      updateTranscendentKarma(${who}, 30)`);
    assert.equal(run(`${who}.transcendentKarma`), false);
    run(`${who}.lastStandIdleT = LAST_STAND_CHARGE; updateTranscendentKarma(${who}, 29.9)`);
    assert.equal(run(`${who}.transcendentKarma`), false);
    run(`updateTranscendentKarma(${who}, 0.1)`);
    assert.equal(run(`${who}.transcendentKarma`), true);
    assert.equal(g.sounds(), 1);
    run(`updateTranscendentKarma(${who}, 30)`);
    assert.equal(g.sounds(), 1);
  }
});

test('transcendent avoidance and wolf sweep are independent, and clear protected variants without spawning offspring', () => {
  for (const dodged of [true, false]) {
    const { run, math } = game();
    const rolls = [dodged ? 0.749 : 0.75, 0.249];
    math.random = () => rolls.length ? rolls.shift() : 0.99;
    run(`player.transcendentKarma = true;
      for (const flag of ['ghostWolf','hunterWolf','parachuting','breeder','thing','bomb']) {
        wolves.push({alive:true, hp:100, x:10, y:10, invulnT:5, [flag]:true});
      }
      chickens.push({alive:true, x:12, y:12});`);
    assert.equal(run('keeperDodgesHatLoss(player)'), dodged);
    assert.equal(run('wolves.filter(w => w.alive).length'), 0);
    assert.equal(run('chickens[0].alive'), true);
    assert.equal(run('playerHats'), 3);
  }
});

test('a failed transcendence sweep roll leaves the pack alive; invulnerability windows double', () => {
  const { run, math } = game();
  const rolls = [0.749, 0.25]; math.random = () => rolls.length ? rolls.shift() : 0.99;
  run('player.transcendentKarma = true; player2.transcendentKarma = true; wolves.push({alive:true})');
  assert.equal(run('keeperDodgesHatLoss(player)'), true);
  assert.equal(run('wolves[0].alive'), true);
  assert.equal(run('iframesFor(player)'), 5);
  assert.equal(run('iframesFor(player2)'), 7);
  run('applyWolfBulletHit(player2)');
  assert.equal(run('player2.bulletHitT'), 0.36);
});

test('both transcendent keepers glow purple at night and a new run clears the buff and event history', () => {
  const { run } = game();
  run('player.transcendentKarma = true; player2.transcendentKarma = true');
  assert.equal(run('collectNightLights().filter(l => l.color.join() === "180,70,255").length'), 2);
  run('nightEvent.lastWave = 65; weatherEvents.snow.lastWave = 64; resetRunState()');
  assert.equal(run('player.transcendentKarma || player2.transcendentKarma'), false);
  assert.equal(run('nightEvent.lastWave'), -5);
  assert.equal(run('weatherEvents.snow.lastWave'), -5);
});

test('host snapshots carry both transcendence states and the guest restores them on the correct keeper', () => {
  const { run, seed } = game();
  let snapshot;
  seed.testConnection = { open: true, send(msg) { snapshot = msg; } };
  run('conn = testConnection; player.transcendentKarma = true; player2.transcendentKarma = false; netSendSnapshot()');
  assert.equal(snapshot.host.transcendentKarma, true);
  assert.equal(snapshot.guestWeapon.transcendentKarma, false);
  snapshot.guestWeapon.hatColors = ['#161616', '#161616', '#161616'];
  snapshot.guest.hats = 3;
  seed.snapshot = snapshot;
  run('isHost = false; player.transcendentKarma = true; player2.transcendentKarma = false; applySnapshot(snapshot)');
  assert.equal(run('player.transcendentKarma'), false);
  assert.equal(run('player2.transcendentKarma'), true);
  assert.equal(run('hatColors.join()'), '#161616,#161616,#161616');
});

test('karma sound queues once and replays through the normal multiplayer sound dispatcher', () => {
  const src = fs.readFileSync(new URL('../js/audio.js', import.meta.url), 'utf8');
  const calls = [];
  const ctx = vm.createContext({ queueNetSound: name => calls.push(name), playMetaverse: () => calls.push('shimmer') });
  vm.runInContext(src.slice(src.indexOf('  function playKarma()'), src.indexOf('  function playMetaverse()')), ctx);
  vm.runInContext(src.slice(src.indexOf('  function playSoundByName('), src.indexOf('\n  function ', src.indexOf('  function playSoundByName(') + 4)), ctx);
  vm.runInContext("playSoundByName('karma')", ctx);
  assert.deepEqual(calls, ['karma', 'shimmer']);
});
