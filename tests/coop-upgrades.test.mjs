// The co-op upgrade picker: two keepers choosing from cards that were dealt
// before either of them clicked. Loads the real files into one shared scope
// (as index.html does) with a permissive stub for anything runtime-only.
import vm from 'node:vm';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

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

function game() {
  const sent = [];
  const sandbox = {
    Math, JSON, Object, Array, Set, Map, Number, String, Boolean, console,
    Symbol, Date, RegExp, isNaN, parseInt, parseFloat, Infinity, NaN, undefined,
    MAP_SIZE: 40, HALF_MAP: 20, TILE_W: 32, TILE_H: 16,
    toast() {}, toastGuest() {}, playCantBuy() {}, playCashRegister() {},
    sendP2Input(action, extra) { sent.push({ action, ...extra }); },
  };
  const ctxObj = vm.createContext(new Proxy(sandbox, {
    get(t, k) { return k in t ? t[k] : stub(); },
    has() { return true; },
    set(t, k, v) { t[k] = v; return true; },
  }));
  // net.js is deliberately NOT loaded: its sendP2Input would shadow the spy.
  for (const f of ['js/state.js', 'js/hints.js', 'js/helpers.js', 'js/upgrades.js']) {
    vm.runInContext(fs.readFileSync(new URL(f, ROOT), 'utf8'), ctxObj, { filename: f });
  }
  const run = expr => vm.runInContext(expr, ctxObj);
  run(`inMenu = false; multiplayer = true; isHost = true; player2.active = true;
       gameOpts.individualUpgrades = true; wave = 30; upgradeMode = true;
       debugFastMode = false; extraPickUsedThisWave2 = true;`);
  return { run, sent };
}

// A card the host and the guest can both be dealt, writing to one ladder.
const SHARED = 'hatchRate'; // Cozy Coops: a world upgrade, max 5
const PERSONAL = 'speed';   // Fast Boots: each keeper has their own ladder

test('world upgrades are shared ladders; gun/movement ones are per keeper', () => {
  const { run } = game();
  assert.equal(run(`upgradeIsShared('${SHARED}')`), true);
  assert.equal(run(`upgradeIsShared('${PERSONAL}')`), false);
  assert.equal(run("upgradeIsShared('machineGun')"), false);
  assert.equal(run("upgradeIsShared('dog')"), true);
});

test('a pick is bounced when the buddy already took the last shared level', () => {
  const { run } = game();
  // 4 of 5 at deal time, maxed by the buddy before this click lands.
  run(`upgradeLevels.${SHARED} = 5`);
  assert.equal(run(`coopPickStale(getUpgradePool().find(o => o.id === '${SHARED}'))`), true);
  run(`upgradeLevels.${SHARED} = 4`);
  assert.equal(run(`coopPickStale(getUpgradePool().find(o => o.id === '${SHARED}'))`), false);
  // Personal ladders can't collide — each keeper has their own copy.
  run('upgradeLevels2.speed = 5; upgradeLevels.speed = 5');
  assert.equal(run("coopPickStale(getUpgradePool().find(o => o.id === 'speed'))"), false);
});

test('upgrades that deliberately run past their cap are never bounced', () => {
  const { run } = game();
  // Dog Friend wraps at 4 (the pack retires), so a capped ladder that is still
  // being offered must stay pickable.
  run('upgradeLevels.dog = 4');
  assert.equal(run("coopPickStale(getUpgradePool().find(o => o.id === 'dog'))"), false);
  // Longer Barrel is personal AND flagged overflow — doubly safe.
  run('upgradeLevels.range = 5');
  assert.equal(run("coopPickStale(getUpgradePool().find(o => o.id === 'range'))"), false);
});

test('either/or halves of a shared pair cannot both be taken in one phase', () => {
  const { run } = game();
  run('upgradeLevels.dummy = 1; upgradeLevels.statue = 0');
  assert.equal(run("coopPickStale({ id: 'statue' })"), true);
  // The Metaverse dissolves every lock, so the counterpart is fair game again.
  run('upgradeLevels.metaverse = 1');
  assert.equal(run("coopPickStale({ id: 'statue' })"), false);
});

test("a maxed shared ladder refuses the host's click and deals fresh cards", () => {
  const { run } = game();
  run(`upgradeLevels.${SHARED} = 5;
       upgradeOptions = [getUpgradePool().find(o => o.id === '${SHARED}')];
       upgradePicked = false; player.ghost = false;`);
  run('selectUpgrade(0)');
  assert.equal(run('upgradePicked'), false, 'a bounced pick is not consumed');
  assert.equal(run(`upgradeLevels.${SHARED}`), 5, 'the cap was not overshot');
  assert.equal(run('upgradeOptions.length'), 3, 'fresh cards were dealt');
});

test("the guest's pick is matched to the hand it was shown", () => {
  const { run } = game();
  run(`upgradePicked2 = false;
       setUpgradeOptions2([
         getP2UpgradePool().find(o => o.id === '${SHARED}'),
         getP2UpgradePool().find(o => o.id === 'jam'),
       ]);`);
  const seq = run('upgradeOptions2Seq');
  // Right card, right deal: applied.
  run(`selectUpgradeP2OnHost(1, 'jam', ${seq})`);
  assert.equal(run('upgradeLevels2.jam'), 1);
  assert.equal(run('upgradePicked2'), true);
  // A click from a replaced deal, or on a slot that now holds something else,
  // is ignored instead of being applied to whatever sits there now.
  run('upgradePicked2 = false');
  run(`selectUpgradeP2OnHost(1, 'jam', ${seq - 1})`);
  run(`selectUpgradeP2OnHost(1, 'machineGun', ${seq})`);
  assert.equal(run('upgradeLevels2.jam'), 1, 'a stale click must not stack another level');
  assert.equal(run('upgradePicked2'), false);
});

test("a bounced guest pick re-offers its cards so the picker comes back live", () => {
  const { run } = game();
  run(`upgradeLevels.${SHARED} = 5; upgradePicked2 = false;
       setUpgradeOptions2([getP2UpgradePool().find(o => o.id === '${SHARED}')]);`);
  const seq = run('upgradeOptions2Seq');
  run(`selectUpgradeP2OnHost(0, '${SHARED}', ${seq})`);
  assert.equal(run(`upgradeLevels.${SHARED}`), 5, 'the cap was not overshot');
  assert.equal(run('upgradePicked2'), false);
  assert.ok(run('upgradeOptions2Seq') > seq, 'a new deal number re-arms the guest');
});

test('the guest only sends one pick per deal, whatever the optimistic flag says', () => {
  const { run, sent } = game();
  run(`isHost = false; upgradePicked2 = false; player.ghost = false;
       upgradeOptions2 = [{ id: 'jam', title: 'Better Springs', desc: () => '' },
                          { id: 'speed', title: 'Fast Boots', desc: () => '' }];
       upgradeOptions2Seq = 7; p2PickSentSeq = -1;`);
  run('selectUpgradeP2(0)');
  // A snapshot that was already in flight clears the optimistic lock...
  run('upgradePicked2 = false');
  run('selectUpgradeP2(1)');
  assert.equal(sent.length, 1, 'the deal number is what stops the double pick');
  assert.deepEqual(sent[0], { action: 'upgrade', index: 0, id: 'jam', seq: 7 });
  // ...and a fresh deal from the host re-arms it.
  run('upgradeOptions2Seq = 8');
  run('selectUpgradeP2(1)');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].id, 'speed');
});

test("the guest's cards carry the level, the buddy's level and the lock warning", () => {
  const { run } = game();
  run(`upgradeLevels.${SHARED} = 3; upgradeLevels2.speed = 2; upgradeLevels.speed = 4;
       upgradeLevels.dummy = 0; upgradeLevels.statue = 0; upgradeLevels.metaverse = 0;`);
  const shared = run(`JSON.stringify(p2CardPayload(getP2UpgradePool().find(o => o.id === '${SHARED}')))`);
  assert.deepEqual(JSON.parse(shared).level, 3, 'a shared card reads the shared ladder');
  assert.equal(JSON.parse(shared).shared, true);
  const personal = JSON.parse(run("JSON.stringify(p2CardPayload(getP2UpgradePool().find(o => o.id === 'speed')))"));
  assert.equal(personal.level, 2, "a personal card reads P2's own ladder");
  assert.equal(personal.buddyLevel, 4, "...and reports the host's for the card footnote");
  assert.equal(personal.shared, false);
  const pair = JSON.parse(run("JSON.stringify(p2CardPayload(getP2UpgradePool().find(o => o.id === 'dummy')))"));
  assert.equal(pair.locksOut, 'Chicken Statue');
});

test('every P2 card ships with the data its renderer needs', () => {
  const { run } = game();
  run('upgradePicked2 = false; setUpgradeOptions2(buildP2UpgradePicks())');
  const cards = JSON.parse(run('JSON.stringify(upgradeOptions2.map(p2CardPayload))'));
  assert.equal(cards.length, 3);
  for (const card of cards) {
    assert.ok(card.id && card.title && typeof card.desc === 'string');
    assert.equal(typeof card.level, 'number');
    assert.equal(typeof card.shared, 'boolean');
  }
});
