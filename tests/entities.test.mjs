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

test('a hidden ninja can be shot outside the map, retreats once, and returns next wave', () => {
  const { run } = game();
  run('spawnNinjaWolf(false, 1, 0)');
  assert.ok(run('wolves[0].x > HALF_MAP'));
  run(`updatePellet({x:HALF_MAP+0.2,y:0,vx:0,vy:0,life:1,dmg:999,pierce:1,shooter:2}, 0.01)`);
  assert.equal(run('wolves[0].ninjaPhase'), 'retreating');
  assert.equal(run('wolves[0].hp'), run('NINJA_HP'));
  assert.equal(run('pendingNinjaReturn.wave'), 11);
  run('hurtWolf(wolves[0],999,0,0); updateNinjaWolf(wolves[0],1); advanceNinjaDay()');
  assert.equal(run('wolves.filter(w => w.alive).length'), 0);
  run('startWave()');
  assert.equal(run('wave'), 11);
  assert.equal(run('wolves.filter(w => w.alive && w.ninjaPhase === "raiding").length'), 1);
  assert.equal(run('pendingNinjaReturn'), null);
  assert.equal(run('!!player2.hatColors?.includes(NINJA_STRAW_HAT_COLOR)'), false);
});

test('hidden ninja watches passively, is ignored by allies, and cannot stall wave defense', () => {
  const { run } = game();
  run('spawnNinjaWolf(false, 1, 0); spawnRobot(3, 18, 0)');
  assert.equal(run('robotPickTarget(robots[0])'), null);
  assert.equal(run('nearestWolfTo(18,0)'), null);
  run('updateWolf(wolves[0],10)');
  assert.equal(run('wolves[0].ninjaPhase'), 'hidden');
  run('waveActive = true; pendingSpawns = 0; checkWaveDefended()');
  assert.equal(run('waveActive'), false);
});

test('raiding ninja runs like a fox, snatches chickens and drops its hat for either killer', () => {
  for (const who of ['player', 'player2']) {
    const { run } = game();
    run(`spawnNinjaWolf(true,1,0); spawnChicken({x:0,y:0});
      wolves[0].x=0; wolves[0].y=0; chickens[0].x=1.5; chickens[0].y=0;
      chickens[0].fat=false; chickens[0].savedT=0; updateWolf(wolves[0],0.01);`);
    assert.ok(run('wolves[0].vx > 4'), 'ninja should run quickly toward a chicken');
    run('chickens[0].x=wolves[0].x+0.1; updateWolf(wolves[0],0.01)');
    assert.equal(run('!!wolves[0].carriedChicken'), true);
    run(`hurtWolf(wolves[0],999,0,0,${who}); updateFlyHats(1)`);
    assert.equal(run('wolves[0].alive'), false);
    assert.equal(run(who === 'player' ? 'hatColors.at(-1)' : 'player2.hatColors.at(-1)'), run('NINJA_STRAW_HAT_COLOR'));
    assert.equal(run('chickens[0].carrier'), null);
  }
});

test('robots lose one hat per hit, flicker red, and remain vulnerable throughout reboot', () => {
  const { run } = game();
  run('spawnRobot(1,0,0); robots[0].bootT=15; spawnWolf(); wolves[0].x=0.2; wolves[0].y=0;');
  run('updateRobot(robots[0],0.1)');
  assert.equal(run('robots[0].hats'), 2);
  assert.equal(run('robots[0].hp'), 2);
  assert.ok(run('robots[0].eyeFlashT > 0'));
  assert.equal(run('pellets.length'), 0);
  assert.equal(run('robots[0].x'), 0);
  run('hurtRobot(robots[0])');
  assert.equal(run('robots[0].hats'), 2, 'same-volley hits must not strip the whole stack');
  run('wolves.length=0; updateRobot(robots[0],1.3)');
  assert.equal(run('robots[0].eyeFlashT'), 0);
  run('hurtRobot(robots[0]); robots[0].wolfHitT=0; hurtRobot(robots[0])');
  assert.equal(run('robots[0].alive'), false);
  assert.ok(run('wolfScrap.length >= 10'));
});

test('each training milestone reboots that mark for 15/10/5 seconds, without disabling damage', () => {
  for (const [mk, seconds] of [[1,15],[2,10],[3,5]]) {
    const { run } = game();
    run(`spawnRobot(${mk},0,0); robots[0].bootT=0; robotTraining[${mk}]=0.245; robotCreditKill(robots[0]);`);
    assert.equal(run('robots[0].bootT'), seconds);
    run('robots[0].attackT=0; robotFire(robots[0],{x:1,y:0})');
    assert.equal(run('pellets.length'), 0);
    run('hurtRobot(robots[0])');
    assert.equal(run('robots[0].hats'), mk+1);
    run(`updateRobot(robots[0],${seconds});`);
    assert.equal(run('robots[0].bootT'), 0);
  }
});

test('robot inherits bullet upgrades, spread, range, minigun capacity, machine gun and laser', () => {
  const { run, math } = game(); math.random = () => 0;
  run(`spawnRobot(2,0,0); robots[0].bootT=0;
    upgradeLevels.rust=5;
    upgradeLevels.hardBullet=5; upgradeLevels.homing=3; upgradeLevels.rocket=2;
    upgradeLevels.spreadUp=2; upgradeLevels.range=4; upgradeLevels.coldShot=5;
    robotFire(robots[0],{x:3,y:0});`);
  assert.ok(run('pellets.length > 5'));
  assert.equal(run('pellets[0].robotRef === robots[0]'), true);
  assert.equal(run('pellets[0].homing && pellets[0].rocket && pellets[0].cold'), true);
  assert.equal(run('pellets[0].color'), '#ff6a6a');
  run(`upgradeLevels.minigun=2; robots[0].shells=0; robotFire(robots[0],{x:3,y:0});`);
  assert.equal(run('robots[0].shells'), run('shotgunMagFor(robots[0])'));
  run(`robots[0].reloadingT=0; upgradeLevels.machineGun=3; upgradeLevels.laser=2;
    spawnWolf(); wolves[0].x=2; wolves[0].y=0; wolves[0].hp=100;
    robotFire(robots[0],{x:3,y:0});`);
  assert.ok(run('beams.length > 0'));
  assert.ok(run('wolves[0].hp < 100'));
});

test('robot receives hats and training from pellet, laser, sword and rocket kills', () => {
  for (const weapon of ['pellet','laser','sword','rocket']) {
    const { run } = game();
    run('spawnRobot(2,0,0); robots[0].bootT=0; spawnWolf(); wolves[0].x=2; wolves[0].y=0; wolves[0].hp=0.1; wolves[0].hatted=true;');
    if (weapon === 'pellet') run(`updatePellet({x:2,y:0,vx:0,vy:0,life:1,dmg:10,pierce:1,shooter:'robot',robotRef:robots[0]},0.01)`);
    if (weapon === 'laser') run("upgradeLevels.laser=1; applyPlayerBeam(0,0,4,0,10,'robot',false,new Set(),robots[0])");
    if (weapon === 'sword') run('wolves[0].x=1; robots[0].dir=0; swordSwingFor(robots[0])');
    if (weapon === 'rocket') run('rocketBlastAt(2,0,robots[0])');
    assert.equal(run('robots[0].hats'), 5, weapon);
    assert.ok(run('robotSkill(2) > 0'), weapon);
    assert.equal(run('playerHats'), 3, 'robot loot must not go to the keeper');
  }
});

test('robots can accidentally kill chickens without changing the keeper karma', () => {
  const { run } = game();
  run(`spawnRobot(2,0,0); spawnChicken({x:0,y:0}); chickens[0].x=2; chickens[0].y=0; chickens[0].savedT=0;
    updatePellet({x:2,y:0,vx:0,vy:0,life:1,dmg:1,pierce:1,shooter:'robot',robotRef:robots[0]},0.01)`);
  assert.equal(run('chickens[0].alive'), false);
  assert.equal(run('chickensKilledByPlayer'), 0);
});

test('player pellets, lasers and swords hurt robots only with friendly fire; enemies always can', () => {
  for (const ff of [false,true]) {
    const { run } = game();
    run(`gameOpts.friendlyFire=${ff}; spawnRobot(3,2,0); player.x=0; player.y=0; player.dir=0;`);
    for (const hit of [
      'updatePellet({x:2,y:0,vx:0,vy:0,life:1,dmg:2,pierce:1,shooter:1},0.01)',
      'applyPlayerBeam(0,0,4,0,2,1,false)', 'robots[0].x=1; swordSwing()'
    ]) {
      run('robots[0].wolfHitT=0');
      const hats = run('robots[0].hats');
      run(hit);
      assert.equal(run('robots[0].hats'), hats - (ff ? 1 : 0), hit);
    }
  }
  for (const hit of [
    "updatePellet({x:2,y:0,vx:0,vy:0,life:1,dmg:0,pierce:1,shooter:'wolf'},0.01)",
    'applyBeamDamage(0,0,4,0)', 'explosionHitKeepers(2,0,2)'
  ]) {
    const { run } = game(); run('spawnRobot(2,2,0); player.x=-10; player2.x=-10; gameOpts.friendlyFire=false;');
    run(hit);
    assert.equal(run('robots[0].hats'), 3, hit);
    assert.ok(run('robots[0].eyeFlashT > 0'));
  }
});

test('wolves pursue robots only at much closer range than the keeper', () => {
  const { run } = game();
  run('spawnRobot(2,3,0); spawnWolf(); wolves[0].x=0; wolves[0].y=0; player.x=-3; player.y=0; player2.ghost=true;');
  run('updateWolf(wolves[0],0.01)');
  assert.ok(run('wolves[0].vx < 0'), 'same-distance keeper should take priority');
  run('wolves[0].x=0; wolves[0].y=0; robots[0].x=0.2; wolves[0].attackT=0; updateWolf(wolves[0],0.01)');
  assert.equal(run('robots[0].hats'), 3, 'close robot should be bitten');
});

test('malfunction rolls once per wave, doubles in rain, and never affects MK3', () => {
  for (const [mk, rain, roll, expected] of [[1,false,.099,true],[1,false,.1,false],[2,false,.049,true],[2,false,.05,false],[1,true,.199,true],[2,true,.099,true],[3,true,0,false]]) {
    const { run, math } = game();
    run(`spawnRobot(${mk},0,0); robots[0].bootT=0; weather=${rain ? "'rain'" : "''"}; waveActive=true;`);
    let first = true;
    math.random = () => { if (first) { first=false; return roll; } return .99; };
    run('updateRobot(robots[0],0.01)');
    assert.equal(run('robots[0].crazyT > 0'), expected, `MK${mk}, rain=${rain}, roll=${roll}`);
    if (expected) {
      assert.ok(run('pellets.length > 0'), 'malfunction fires without a target');
      run('robots[0].crazyT=0; pellets.length=0; updateRobot(robots[0],0.01)');
      assert.equal(run('robots[0].crazyT'), 0, 'must not reroll within a wave');
    }
  }
});

test('snow to dusting and dusting to grass restore the black transition', () => {
  const { run } = game();
  run("weather='snow'; endWeather()");
  assert.equal(run('snowCover()'), run('SNOW_PATCH_KEEP'));
  assert.equal(run('fade.phase'), 'out');
  run('fade=null; snowLeftover=1; startWave()');
  assert.equal(run('snowLeftover'), 0);
  assert.equal(run('fade.phase'), 'out');
});

test('both rescue polarities open a personal two-wave transcendence window even with nonzero karma', () => {
  for (const who of ['player','player2']) for (const polarity of [-25,25]) for (const age of [0,1,2,3]) {
    const { run } = game();
    run(`${who}.karma=${polarity}; tryKarmaResurrect(${who}); wave+=${age};
      ${who}.karma=-7; upgradeLevels.metaverse=upgradeLevels2.metaverse=1;
      upgradeLevels.lastStand=upgradeLevels2.lastStand=1;
      ${who}.lastStandIdleT=LAST_STAND_CHARGE; updateTranscendentKarma(${who},30);`);
    assert.equal(run(`${who}.transcendentKarma`), age <= 2, `${who} age=${age}`);
    if (age <= 2) assert.equal(run(`${who}.karma`), 0);
  }
});

test('snapshots carry ninja phases, robot hats/eyes/reboots, scrap, snow and personal rescue history', () => {
  const { run, seed } = game(); let snapshot;
  seed.testConnection = { open: true, send(msg) { snapshot=msg; } };
  run(`spawnNinjaWolf(); spawnRobot(2,0,0); robots[0].bootT=10; hurtRobot(robots[0]);
    player.lastKarmaRescueWave=8; player2.lastKarmaRescueWave=9;
    snowLeftover=1; wolfScrap.push({x:1,y:2,vx:3,vy:4,z:1,vz:2,spin:0,spinV:1,t:3,kind:0,size:1});
    conn=testConnection; netSendSnapshot()`);
  assert.ok(snapshot);
  assert.equal(snapshot.wolves[0].ninjaPhase, 'hidden');
  assert.equal(snapshot.robots[0].hats, 3);
  assert.equal(snapshot.robots[0].bootT, 10);
  assert.equal(snapshot.robots[0].eyeFlashT, 1.2);
  assert.equal(snapshot.wolfScrap.length, 1);
  assert.equal(snapshot.snowLeftover, 1);
  seed.incomingSnapshot = snapshot;
  run('isHost=false; robots.length=0; wolves.length=0; snowLeftover=0; applySnapshot(incomingSnapshot)');
  assert.equal(run('robots[0].hats'), 3);
  assert.equal(run('wolves[0].ninja'), true);
  assert.equal(run('player.lastKarmaRescueWave'), 9);
  assert.equal(run('player2.lastKarmaRescueWave'), 8);
  run('resetRunState()');
  assert.equal(run('player.lastKarmaRescueWave'), null);
  assert.equal(run('pendingNinjaReturn'), null);
});

test('robot lenses and possessed-wolf eyes are painted above the night mask in blue', () => {
  const { run, seed } = game();
  const colors = [];
  seed.ctx = { save() {}, restore() {}, translate() {}, scale() {}, fillRect() { colors.push(this.fillStyle); } };
  seed.worldToScreen = (x,y) => ({x,y});
  run('spawnRobot(3,0,0); robots[0].bootT=0; wolves.push({alive:true,turncoat:true,x:0,y:0}); drawWolfEyesOverlay()');
  assert.equal(colors.filter(c => c === '#57caff').length, 2);
  assert.ok(colors.includes('#3aa8ff'));
});

test('hunter and robot readouts only appear within four tiles of either living keeper', () => {
  const { run } = game();
  run('player.x=0; player.y=0; player2.x=10; player2.y=0');
  assert.equal(run('allyReadoutVisible({x:3.9,y:0})'), true);
  assert.equal(run('allyReadoutVisible({x:5,y:0})'), false);
  assert.equal(run('allyReadoutVisible({x:10,y:0})'), true);
  run('player2.ghost=true');
  assert.equal(run('allyReadoutVisible({x:10,y:0})'), false);
});

test('robot shots use the same yellow/red/blue/purple colors as the keeper weapon', () => {
  for (const [soft,hard,color] of [[0,0,'#fff3a0'],[0,5,'#ff6a6a'],[5,0,'#7ec7ff'],[5,5,'#b06fff']]) {
    const { run } = game();
    run(`spawnRobot(3); upgradeLevels.softBullet=${soft}; upgradeLevels.hardBullet=${hard}; fireBurstFor(robots[0]);`);
    assert.equal(run('pellets[0].color'), color);
    assert.equal(run('pellets[0].color === projectileColor(lvlsFor(player),false)'), true);
  }
});

test('Respawn and buddy revival protect against melee, bullets, lasers and blasts for five seconds', () => {
  for (const who of ['player','player2']) {
    const { run, math } = game(); math.random = () => .99;
    run(`${who}.ghost=true; reviveKeeper(${who});`);
    assert.equal(run(`${who}.wolfHitT`), 5);
    assert.equal(run(`${who}.bulletHitT`), 5);
    run(`applyWolfBulletHit(${who}); applyFriendlyFireHit(${who}); pupBiteKeeper(${who});
      applyBeamDamage(-10,0,10,0); explosionHitKeepers(0,0,30)`);
    assert.equal(run(who === 'player' ? 'playerHats' : 'player2.hats'), 3);
    run(`${who}.wolfHitT=0; ${who}.bulletHitT=0; applyWolfBulletHit(${who})`);
    assert.equal(run(who === 'player' ? 'playerHats' : 'player2.hats'), 2);
  }
  const { run } = game();
  run('multiplayer=false; gameOver=true; activateResurrect()');
  assert.equal(run('gameOver'), false);
  assert.equal(run('player.wolfHitT'), 5);
  assert.equal(run('player.bulletHitT'), 5);
  assert.equal(run('playerHats'), 1);
});

