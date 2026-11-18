// Loads the real game files into one shared scope (as index.html does) and
// exercises the Knowledge Scroll: its gate, the no-repeat bag, and the
// double-apply guard. Unknown globals resolve to a permissive stub so the
// files that only matter at runtime don't have to be loaded.
import vm from 'node:vm';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert';

// Resolve the repo root from this file so the suite runs from anywhere.
const ROOT = new URL('../', import.meta.url);

// Anything the loaded files reach for that we haven't defined becomes a
// callable no-op that also answers property reads, so e.g. `coops.length`,
// `ctx.measureText(..).width` and `player.x` all resolve harmlessly.
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
    has() { return true },
  });
}

const sandbox = { Math, JSON, Object, Array, Set, Map, Number, String, Boolean, console, Symbol, Date, RegExp, isNaN, parseInt, parseFloat, Infinity, NaN, undefined };
const ctxObj = vm.createContext(new Proxy(sandbox, {
  get(t, k) { return k in t ? t[k] : stub(); },
  has() { return true; },               // keeps bare identifiers from throwing
  set(t, k, v) { t[k] = v; return true; },
}));

// Same order index.html loads them in. Only the files the scroll touches.
for (const f of ['js/state.js', 'js/hints.js', 'js/helpers.js']) {
  vm.runInContext(fs.readFileSync(new URL(f, ROOT), 'utf8'), ctxObj, { filename: f });
}
const run = (expr) => vm.runInContext(expr, ctxObj);

test('the hint table is all unique, non-empty strings', () => {
  // Deliberately NOT pinned to an exact count — the list is meant to be edited
  // freely, and nothing in the game hardcodes its length either.
  const total = run('GAME_HINTS.length');
  assert.ok(total >= 20, 'suspiciously few hints: ' + total);
  assert.equal(run('new Set(GAME_HINTS).size'), total, 'a hint is duplicated in the table');
  assert.ok(run('GAME_HINTS.every(h => typeof h === "string" && h.trim().length > 20)'));
});

test('the scroll is bonus-only before wave 51, then available on all picks', () => {
  const avail = (wave, bonus) => run(`
    wave = ${wave}; bonusUpgradeAvailable = ${bonus};
    getUpgradePool().find(o => o.id === 'scroll').available();
  `);
  assert.equal(run('SCROLL_NORMAL_PICK_WAVE'), 51);
  assert.equal(run('SCROLL_UNLOCK_WAVE'), 1);
  assert.equal(avail(0, true), false, 'no upgrades before the first wave');
  for (const wave of [1, 10, 40, 49, 50]) {
    assert.equal(avail(wave, false), false, 'normal picks are gated before wave 51');
    assert.equal(avail(wave, true), true, 'early bonus picks can offer a scroll');
  }
  for (const wave of [51, 52, 120]) {
    assert.equal(avail(wave, false), true, 'first and second picks can offer a scroll in endless');
    assert.equal(avail(wave, true), true, 'bonus picks still offer scrolls in endless');
  }
});

test('reading the whole bag never repeats a hint, and one more is refused', () => {
  run('hintsRead.clear(); wave = 51; bonusUpgradeAvailable = true;');
  const total = run('GAME_HINTS.length');
  const seen = [];
  for (let i = 0; i < total; i++) {
    run('scrollNote = null; readKnowledgeScroll();');
    const text = run('scrollNote && scrollNote.text');
    assert.ok(typeof text === 'string' && text.length > 0, `read ${i + 1} produced no hint`);
    seen.push(text);
    assert.equal(run('scrollNote.n'), i + 1, 'the footer counter tracks the bag');
  }
  assert.equal(new Set(seen).size, total, 'a hint repeated inside one session');
  // Bag empty: the card stops being offered and a forced read is a no-op.
  assert.equal(run('hintsLeft()'), 0);
  assert.equal(run("getUpgradePool().find(o => o.id === 'scroll').available()"), false);
  run('bonusUpgradeAvailable = false');
  assert.equal(run("getUpgradePool().find(o => o.id === 'scroll').available()"), false);
  run('scrollNote = null; readKnowledgeScroll();');
  assert.equal(run('scrollNote'), null, 'an exhausted bag must not open a blank scroll');
});

test('a second apply while the parchment is open costs no hint (Fast mode)', () => {
  run('hintsRead.clear(); scrollNote = null; wave = 51; bonusUpgradeAvailable = true;');
  run('readKnowledgeScroll();');
  const first = run('scrollNote.text');
  assert.equal(run('hintsRead.size'), 1);
  // applyPickedUpgrade stacks up to 5 in Fast mode; all four extras must no-op.
  for (let i = 0; i < 4; i++) run('readKnowledgeScroll();');
  assert.equal(run('hintsRead.size'), 1, 'Fast mode burned hints out of the bag');
  assert.equal(run('scrollNote.text'), first, 'the open parchment was replaced');
});

test('the scroll costs nothing and is not a gun upgrade', () => {
  assert.equal(run("!!getUpgradePool().find(o => o.id === 'scroll').affordable"), false);
  assert.equal(run("GUN_UPGRADES.has('scroll')"), false);
  // The bonus round swaps out options that lock a broke player in; a free
  // option must not report itself as locking anything.
  assert.equal(run("!!getUpgradePool().find(o => o.id === 'scroll').apply"), true);
});

test('desc() reads sensibly at both ends of the bag', () => {
  run('hintsRead.clear();');
  const total = run('GAME_HINTS.length');
  const desc = () => run("getUpgradePool().find(o => o.id === 'scroll').desc()");
  assert.match(desc(), new RegExp(total + ' of ' + total + ' unread'));
  run(`for (let i = 0; i < ${total - 1}; i++) hintsRead.add(i);`);
  assert.match(desc(), /last secret/, 'the final scroll should read as the last one');
});
