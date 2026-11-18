  // ---------- Helpers ----------
  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx*dx + dy*dy;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // Blend two #rrggbb colours. t=0 → a, t=1 → b.
  // Blend two #rrggbb colours by t, as [r, g, b].
  function mixRGB(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = sh => {
      const ca = (pa >> sh) & 255, cb = (pb >> sh) & 255;
      return Math.round(ca + (cb - ca) * t);
    };
    return [ch(16), ch(8), ch(0)];
  }
  // Canvas-ready blend. NOTE the return is an `rgb()` string, which every
  // canvas colour slot accepts but the hex reader above does NOT: nesting
  // mixHex inside itself parsed "gb(126,199,255)" as hex, got NaN, and
  // `NaN >> 16` is 0 — so a nested blend came out pure black with no error
  // raised at all. That is what turned the whole sky black. Use mixToHex for
  // the inner blend of a two-stage mix.
  function mixHex(a, b, t) {
    const c = mixRGB(a, b, t);
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  // Same blend, returning #rrggbb so the result can be fed back in and mixed
  // again (sky = base → boss red → snow).
  function mixToHex(a, b, t) {
    const c = mixRGB(a, b, t);
    const h = v => v.toString(16).padStart(2, '0');
    return '#' + h(c[0]) + h(c[1]) + h(c[2]);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function inBounds(x, y) {
    return x > -HALF_MAP + 1 && x < HALF_MAP - 1 && y > -HALF_MAP + 1 && y < HALF_MAP - 1;
  }

  // Roman numerals for the Dog Friend generations (1 = '', 2 = 'II', ...).
  function roman(n) {
    const map = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let s = '';
    for (const [v, sym] of map) while (n >= v) { s += sym; n -= v; }
    return s;
  }
  // Title of the Dog Friend upgrade — numbered by the current pack generation.
  function dogUpgradeTitle() {
    return 'Dog Friend' + (dogGen > 1 ? ' ' + roman(dogGen) : '');
  }

  // Fades a tree/coop the player is standing behind so the player stays visible.
  // Returns 1 when no fade applies, down to 0.35 when fully behind it. A taller
  // coop casts a longer "shadow" on screen, so the fade reaches further back per
  // floor — that way the player still shows through behind the UPPER floors,
  // not just the ground floor.
  function occlusionAlpha(obj) {
    // Iso depth: a positive dv means the object is drawn in front of the player.
    const dv = (obj.x + obj.y) - (player.x + player.y);
    if (dv <= 0) return 1;
    // Screen-horizontal gap — aligned things share a similar (x - y).
    const du = Math.abs((obj.x - obj.y) - (player.x - player.y));
    const floors = (obj.level || 0) + 1;          // coops carry a floor level; trees = 1
    const halfWidth = 1.35;                       // how wide the body is (u-units)
    const reach = 2.4 + (floors - 1) * 2.6;       // how far back it still covers — taller reaches further
    if (du > halfWidth || dv > reach) return 1;   // player isn't behind it
    const MIN_A = 0.35;
    // Fade in toward opaque as the player slips out the side or the back.
    const edge = Math.max(du / halfWidth, dv / reach); // 0 = dead behind, 1 = at the edge
    return MIN_A + edge * (1 - MIN_A);
  }
  function drawWithOcclusion(obj, drawFn) {
    const a = occlusionAlpha(obj);
    if (a >= 1) { drawFn(); return; }
    ctx.save();
    ctx.globalAlpha = a;
    drawFn();
    ctx.restore();
  }

  function toast(msg, dur = 1.5) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }

  // One-shot toasts the host needs to surface on the GUEST's screen. The
  // guest's keeper (player2) resolves its builds on the host, where a plain
  // toast() would only pop on the host — so its feedback is queued here,
  // shipped in every snapshot, and replayed by the guest via its own toast().
  const pendingGuestToasts = [];
  function toastGuest(msg, dur = 1.5) {
    if (multiplayer && isHost) pendingGuestToasts.push({ msg, dur });
  }
  // Route a builder's feedback to the right screen: player2's builds run on the
  // host, so relay them to the guest; player1 / single-player just pops locally.
  function buildToast(builder, msg, dur) {
    if (builder === player2 && multiplayer && isHost) toastGuest(msg, dur);
    else toast(msg, dur);
  }

  // Enemy-intro toasts should only fire once per run.
  const enemyIntroToastShown = {
    fox: false,
    bomb: false,
    breeder: false,
    ranged: false,
    homer: false,
    thing: false,
    parachute: false,
    hunterwolf: false,
  };
  function toastEnemyIntroOnce(kind, msg, dur = 1.6) {
    if (enemyIntroToastShown[kind]) return;
    enemyIntroToastShown[kind] = true;
    toast(msg, dur);
  }

  // Persistent "press E to build a coop" hint. Shown at game start and left
  // up until the player first opens build mode with E (dismissBuildHint).
  let buildHintDismissed = false;
  function showBuildHint() {
    buildHintDismissed = false;
    const el = document.getElementById('buildhint');
    if (el) el.classList.add('show');
  }
  function dismissBuildHint() {
    if (buildHintDismissed) return;
    buildHintDismissed = true;
    const el = document.getElementById('buildhint');
    if (el) el.classList.remove('show');
  }

  function togglePause() {
    paused = !paused;
    if (paused) { pauseTab = 'status'; pauseUpgradeScroll = 0; } // always re-open on the status tab
    disarmQuit(); // a half-finished quit confirmation never survives the panel closing
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = items[i];
      items[i] = items[j];
      items[j] = temp;
    }
    return items;
  }

  // Table value at the skill's current level / at the level after one more pick.
  function tableAt(id)   { const t = SKILL_TABLES[id]; return t[Math.min(upgradeLevels[id], t.length - 1)]; }
  function tableNext(id) { const t = SKILL_TABLES[id]; return t[Math.min(upgradeLevels[id] + 1, t.length - 1)]; }

  // Effective jam chance = Better Springs' value plus the Rusty Springs penalty.
  function recomputeJamChance() {
    if (upgradeLevels.rust >= 5) { jamChance = 0; return; } // MAX Rusty Springs: no jams at all
    // Weapon Oil only helps while the gun isn't rusted (rust disables the oil).
    const oilReduce = ((upgradeLevels.rust === 0 || upgradeLevels.rust >= 5) && weaponOilCharges > 0) ? WEAPON_OIL_JAM_REDUCE : 0;
    jamChance = clamp(tableAt('jam') + tableAt('rust') - oilReduce, 0, 0.95);
  }

  // Push the current spread/pellet count from whichever pattern skill is active.
  function applySpread(which) {
    const up = upgradeLevels.spreadUp, down = upgradeLevels.spreadDown;
    if (up > 0 && down > 0) {
      // Metaverse "both": keep Loose's many pellets but Tight's grouping.
      const li = Math.min(up + upgradeLevels.spreadUp2, LOOSE_SPREAD.length - 1);
      const ti = Math.min(down, MAX_LEVEL);
      pelletCount = LOOSE_BULLETS[li];
      shotgunSpread = TIGHT_SPREAD[ti] * Math.PI / 180;
    } else if (which === 'spreadUp') {
      // Loose Pattern II carries the progression past level 5.
      const lvl = Math.min(up + upgradeLevels.spreadUp2, LOOSE_SPREAD.length - 1);
      shotgunSpread = LOOSE_SPREAD[lvl] * Math.PI / 180;
      pelletCount = LOOSE_BULLETS[lvl];
    } else {
      const lvl = Math.min(down, MAX_LEVEL);
      shotgunSpread = TIGHT_SPREAD[lvl] * Math.PI / 180;
      pelletCount = TIGHT_BULLETS[lvl];
    }
  }

  function getUpgradePool() {
    return [
      {
        id: 'jam',
        title: 'Better Springs',
        available() { return upgradeLevels.jam < MAX_LEVEL; },
        desc() {
          return upgradeLevels.jam >= MAX_LEVEL - 1
            ? 'Jam ' + Math.round(tableNext('jam') * 100) + '%, a jam only slows you'
            : 'Jam chance → ' + Math.round(tableNext('jam') * 100) + '%';
        },
        apply() { upgradeLevels.jam++; recomputeJamChance(); },
      },
      {
        id: 'range',
        title: 'Longer Barrel',
        // Always offered until maxed; afterwards it only shows up occasionally.
        available() { return upgradeLevels.range < MAX_LEVEL || Math.random() < 0.35; },
        desc() {
          if (upgradeLevels.range >= MAX_LEVEL) return 'Range maxed — barrel just gets longer';
          return 'Shotgun range → ' + tableNext('range').toFixed(2) + 's';
        },
        apply() {
          upgradeLevels.range++;
          shotgunLife = SKILL_TABLES.range[Math.min(upgradeLevels.range, MAX_LEVEL)];
        },
      },
      {
        id: 'speed',
        title: 'Fast Boots',
        available() { return upgradeLevels.speed < MAX_LEVEL; },
        desc() { return 'Move speed → ' + tableNext('speed').toFixed(1); },
        apply() { upgradeLevels.speed++; player.speed = tableAt('speed'); },
      },
      {
        id: 'fireRate',
        title: 'Trigger Work',
        available() { return upgradeLevels.fireRate < MAX_LEVEL; },
        desc() {
          const nextPinSlow = Math.round((upgradeLevels.fireRate + 1) * TRIGGER_WORK_PIN_SLOW * 100);
          return 'Reload pin ' + nextPinSlow + '% slower';
        },
        apply() { upgradeLevels.fireRate++; },
      },
      {
        id: 'spreadUp',
        title: 'Loose Pattern',
        available() { return (upgradeLevels.spreadDown === 0 || metaverseOn()) && upgradeLevels.spreadUp < MAX_LEVEL; },
        desc() {
          const i = Math.min(upgradeLevels.spreadUp + 1, MAX_LEVEL);
          return 'Spread → ' + LOOSE_SPREAD[i] + '°, ' + LOOSE_BULLETS[i] + ' pellets';
        },
        apply() { upgradeLevels.spreadUp++; applySpread('spreadUp'); },
      },
      {
        id: 'spreadDown',
        title: 'Tighter Pattern',
        available() { return (upgradeLevels.spreadUp === 0 || metaverseOn()) && upgradeLevels.spreadDown < MAX_LEVEL; },
        desc() {
          const i = Math.min(upgradeLevels.spreadDown + 1, MAX_LEVEL);
          if (i >= MAX_LEVEL) return 'MAX: one slug, pierces 10 wolves';
          return 'Spread → ' + TIGHT_SPREAD[i] + '°, ' + TIGHT_BULLETS[i] + ' pellets';
        },
        apply() { upgradeLevels.spreadDown++; applySpread('spreadDown'); },
      },
      {
        // Extreme Reload (formerly Risky Trigger) — narrows the reload bar AND
        // the green band, but widens the central critical line so well-timed
        // reloads pay off with a boosted next shot. Now a wave-50 pick.
        id: 'crazyTrigger',
        title: 'Extreme Reload',
        available() { return wave >= 25 && upgradeLevels.crazyTrigger < 5; },
        desc() {
          const n = Math.min(5, upgradeLevels.crazyTrigger + 1);
          return 'Bar/green −, critical +' + Math.round(CRAZY_TRIGGER_CRIT_BONUS[n] * 100) + '% → tier ' + n + '/5';
        },
        apply() { upgradeLevels.crazyTrigger++; },
      },
      {
        // Calm Waves — fewer normal wolves each wave (special variants are
        // unaffected), but a smaller payout to match. Locks out Rough Waves.
        id: 'calmWaves',
        title: 'Calm Waves',
        available() { return wave >= 25 && (upgradeLevels.roughWaves === 0 || metaverseOn()) && upgradeLevels.calmWaves < 5; },
        desc() {
          const pct = Math.round(WAVE_MOD[Math.min(5, upgradeLevels.calmWaves + 1)] * 100);
          return '−' + pct + '% normal wolves, −' + pct + '% wave gold';
        },
        apply() { upgradeLevels.calmWaves++; },
      },
      {
        // Rough Waves — more normal wolves each wave AND a bigger payout.
        // Locks out Calm Waves.
        id: 'roughWaves',
        title: 'Rough Waves',
        available() { return wave >= 25 && (upgradeLevels.calmWaves === 0 || metaverseOn()) && upgradeLevels.roughWaves < 5; },
        desc() {
          const pct = Math.round(WAVE_MOD[Math.min(5, upgradeLevels.roughWaves + 1)] * 100);
          return '+' + pct + '% normal wolves, +' + pct + '% wave gold';
        },
        apply() { upgradeLevels.roughWaves++; },
      },
      {
        id: 'focusUp',
        title: 'Meat Bait',
        available() { return (upgradeLevels.focusDown === 0 || metaverseOn()) && upgradeLevels.focusUp < MAX_FOCUS_LEVEL; },
        desc() { return 'Focus you ' + Math.round(tableNext('focusUp') * 100) + '%, faster rush'; },
        apply() { upgradeLevels.focusUp++; recomputeFocus(); },
      },
      {
        id: 'focusDown',
        title: 'Wolf Repellent',
        available() { return (upgradeLevels.focusUp === 0 || metaverseOn()) && upgradeLevels.focusDown < MAX_FOCUS_LEVEL; },
        desc() { return 'Focus you ' + Math.round(tableNext('focusDown') * 100) + '%, slower rush'; },
        apply() { upgradeLevels.focusDown++; recomputeFocus(); },
      },
      {
        id: 'hatchRate',
        title: 'Cozy Coops',
        available() { return wave >= 5 && upgradeLevels.hatchRate < 5; },
        desc() { return 'Chickens respawn ' + Math.round((1 - tableNext('hatchRate')) * 100) + '% faster'; },
        apply() { upgradeLevels.hatchRate++; },
      },
      {
        id: 'wolfDelay',
        title: 'Prep Time',
        available() { return wave >= 5 && upgradeLevels.wolfDelay < 5; },
        desc() { return 'Wolves wait ' + tableNext('wolfDelay') + 's after wave start'; },
        apply() { upgradeLevels.wolfDelay++; },
      },
      {
        id: 'doubleBarrel',
        title: 'Double-Barrel',
        available() { return wave >= 5 && (upgradeLevels.machineGun === 0 || metaverseOn()) && upgradeLevels.doubleBarrel < 5; },
        desc() {
          return upgradeLevels.doubleBarrel === 0
            ? 'Double-barrel: right-click fires twice'
            : 'Damage ×' + tableNext('doubleBarrel').toFixed(2);
        },
        apply() { upgradeLevels.doubleBarrel++; },
      },
      {
        id: 'machineGun',
        title: 'Machine-Gun',
        available() { return wave >= 5 && (upgradeLevels.doubleBarrel === 0 || metaverseOn()) && upgradeLevels.machineGun < 5; },
        desc() {
          return upgradeLevels.machineGun === 0
            ? 'Auto-fire (starts slow), ' + MG_MAG + '-round mag'
            : 'Faster fire rate (mag stays ' + MG_MAG + ')';
        },
        apply() { upgradeLevels.machineGun++; ammo = mgMagSize(player); },
      },
      {
        // Nerd Reload — reloading pops a math question; type the answer to
        // load, a wrong answer jams. Mutually exclusive with Jock Reload.
        id: 'nerdReload',
        title: 'Nerd Reload',
        // Debug-only now (granted via the Spawns & Tools panel); never offered in
        // normal play. Still locks out Jock Reload when applied.
        available() { return false; },
        desc() { return 'Solve a sum to reload — wrong = jam'; },
        apply() { upgradeLevels.nerdReload = 1; upgradeLevels.jockReload = 0; },
      },
      {
        // Jock Reload — reloading starts a timer; mash SPACE fast enough or it
        // jams. Mutually exclusive with Nerd Reload.
        id: 'jockReload',
        title: 'Jock Reload',
        // Debug-only now (granted via the Spawns & Tools panel); never offered in
        // normal play. Still locks out Nerd Reload when applied.
        available() { return false; },
        desc() { return 'Mash SPACE to reload — too slow = jam'; },
        apply() { upgradeLevels.jockReload = 1; upgradeLevels.nerdReload = 0; },
      },
      {
        // Cold Shot — a per-pellet chance (up to 10%) to chill a wolf: it turns
        // frosty blue and crawls at half speed. Mutually exclusive with Hot Shot.
        id: 'coldShot',
        title: 'Cold Shot',
        available() { return wave >= 5 && (upgradeLevels.hotShot === 0 || metaverseOn()) && upgradeLevels.coldShot < 5; },
        desc() { return Math.round(COLD_HOT_CHANCE[Math.min(5, upgradeLevels.coldShot + 1)] * 100) + '% chance to freeze a hit wolf (slow + blue)'; },
        apply() { upgradeLevels.coldShot++; },
      },
      {
        // Hot Shot — a per-pellet chance (up to 10%) to ignite a wolf: it catches
        // fire, taking damage over a few seconds. Mutually exclusive with Cold Shot.
        id: 'hotShot',
        title: 'Hot Shot',
        available() { return wave >= 5 && (upgradeLevels.coldShot === 0 || metaverseOn()) && upgradeLevels.hotShot < 5; },
        desc() { return Math.round(COLD_HOT_CHANCE[Math.min(5, upgradeLevels.hotShot + 1)] * 100) + '% chance to set a hit wolf ablaze (burns over time)'; },
        apply() { upgradeLevels.hotShot++; },
      },
      {
        // Rocket Launcher — wave-25 weapon evolution. Requires the keeper to
        // have ever picked Machine-Gun or Double-Barrel. Mutually exclusive
        // with Minigun. Per-level chance a pellet explodes when it HITS a wolf;
        // right-click guarantees the boom on a hit. Pellets that miss never
        // detonate (no end-of-life blast).
        id: 'rocket',
        title: 'Rocket Launcher',
        available() {
          return wave >= 25
              && (upgradeLevels.machineGun > 0 || upgradeLevels.doubleBarrel > 0)
              && (upgradeLevels.minigun === 0 || metaverseOn())
              && upgradeLevels.rocket < 5;
        },
        desc() {
          if (upgradeLevels.rocket >= 4)
            return 'MAX: ' + Math.round(tableNext('rocket') * 100) + '% boom';
          if (upgradeLevels.rocket === 0)
            return 'Pellets explode on hit (' + Math.round(tableNext('rocket') * 100) + '%)';
          return 'Boom chance → ' + Math.round(tableNext('rocket') * 100) + '%';
        },
        apply() { upgradeLevels.rocket++; },
      },
      {
        // Minigun — wave-25 weapon evolution. Requires the keeper to have
        // ever picked Machine-Gun or Double-Barrel. Mutually exclusive with
        // Rocket Launcher. Each tier adds magazine capacity; at MAX the gun
        // spins up — sustained fire keeps getting faster.
        id: 'minigun',
        title: 'Minigun',
        available() {
          return wave >= 25
              && (upgradeLevels.machineGun > 0 || upgradeLevels.doubleBarrel > 0)
              && (upgradeLevels.rocket === 0 || metaverseOn())
              && upgradeLevels.minigun < 5;
        },
        desc() {
          if (upgradeLevels.minigun >= 4)
            return 'MAX: +' + MINIGUN_MAG_PER_LVL + ' mag, spins up as you hold fire';
          return '+' + MINIGUN_MAG_PER_LVL + ' magazine size';
        },
        apply() {
          upgradeLevels.minigun++;
          // Top off the live mag so the bigger capacity is immediately usable
          // (ammo for a machine-gun base, shells for a double-barrel base), and
          // clear any pending shot cooldown so the new rate feels instant.
          if (upgradeLevels.machineGun > 0) ammo = mgMagSize(player);
          else { shells = shotgunMagP1(); chambered = true; }
          player.reloadT = 0;
        },
      },
      {
        id: 'reloadMove',
        title: 'Action Reload',
        available() { return wave >= 5 && upgradeLevels.reloadMove < MAX_LEVEL; },
        desc() { return 'Moving reload: pin ' + reloadRunMul(upgradeLevels.reloadMove + 1).toFixed(2) + '× speed'; },
        apply() { upgradeLevels.reloadMove++; },
      },
      {
        id: 'counter',
        title: 'Melee Strike',
        available() { return wave >= 5 && upgradeLevels.counter < 5; },
        desc() {
          return upgradeLevels.counter >= 4
            ? 'MAX: 50% melee + area damage'
            : 'Melee chance → ' + Math.round(tableNext('counter') * 100) + '%';
        },
        apply() { upgradeLevels.counter++; },
      },
      {
        id: 'sprint',
        title: 'Stampede',
        available() { return wave >= 15 && upgradeLevels.sprint < 5; },
        desc() {
          return upgradeLevels.sprint >= 4
            ? 'MAX: +' + Math.round(tableNext('sprint') * 100) + '% sprint, trample enemies'
            : 'Sprint speed → +' + Math.round(tableNext('sprint') * 100) + '%';
        },
        apply() { upgradeLevels.sprint++; },
      },
      {
        id: 'softBullet',
        title: 'Soft Bullets',
        available() { return wave >= 15 && (upgradeLevels.hardBullet === 0 || metaverseOn()) && upgradeLevels.softBullet < 5; },
        desc() {
          const pct = Math.round(tableNext('softBullet') * 100);
          return upgradeLevels.softBullet >= 4
            ? 'MAX: ' + pct + '% — pellets always spare chickens (bluish)'
            : 'Chance to spare a hit chicken → ' + pct + '%';
        },
        apply() { upgradeLevels.softBullet++; },
      },
      {
        id: 'hardBullet',
        title: 'Hard Bullets',
        available() { return wave >= 15 && (upgradeLevels.softBullet === 0 || metaverseOn()) && upgradeLevels.hardBullet < 5; },
        desc() {
          const mul = tableNext('hardBullet');
          const pct = Math.round((mul - 1) * 100);
          return upgradeLevels.hardBullet >= 4
            ? 'MAX: pellets do +' + pct + '% damage (reddish)'
            : 'Pellet damage → +' + pct + '%';
        },
        apply() { upgradeLevels.hardBullet++; },
      },
      {
        id: 'rust',
        title: 'Rusty Springs',
        // The final (golden) tier costs $200; the rusting tiers are free.
        available() { return wave >= 15 && upgradeLevels.rust < 5 && (upgradeLevels.rust < 4 || money >= RUST_MAX_COST); },
        desc() {
          return upgradeLevels.rust >= 4
            ? 'MAX ($' + RUST_MAX_COST + '): no jams, crit reloads pay $1'
            : 'Jam +' + Math.round(tableNext('rust') * 100) + '%, rusts gun (disables Weapon Oil)';
        },
        apply() {
          if (upgradeLevels.rust === 4) money -= RUST_MAX_COST; // golden gun tier costs $200
          upgradeLevels.rust++;
          recomputeJamChance();
        },
      },
      {
        id: 'sword',
        title: "Wolf's Blade",
        // Debug-only: never offered in normal play. The debug panel applies
        // upgrades by id directly (bypassing available()), so the sword can
        // still be granted there for testing.
        available() { return false; },
        desc() { return 'Swap your gun for a sword — huge damage'; },
        apply() { upgradeLevels.sword = 1; },
      },
      {
        id: 'spinReload',
        title: 'Quickdraw',
        available() { return wave >= 15 && upgradeLevels.spinReload < 5; },
        desc() {
          const pct = Math.round(tableNext('spinReload') * 100) + '%';
          return upgradeLevels.spinReload >= 4
            ? 'MAX: ' + pct + ' twirl reload — triples that shot'
            : pct + ' chance: reload becomes an instant twirl';
        },
        apply() { upgradeLevels.spinReload++; },
      },
      {
        id: 'snatch',
        title: 'Wolf Heist',
        available() { return wave >= 15 && upgradeLevels.snatch < 5; },
        desc() {
          const pct = Math.round(tableNext('snatch') * 100) + '%';
          return upgradeLevels.snatch >= 4
            ? 'MAX: ' + pct + ' — a fed wolf carries its kill off, slowed'
            : 'Wolf may carry its kill off the map — ' + pct;
        },
        apply() { upgradeLevels.snatch++; },
      },
      {
        id: 'fatChicken',
        title: 'Fat Chickens',
        available() { return wave >= FAT_UNLOCK_WAVE && upgradeLevels.fatChicken < 5; },
        desc() {
          return upgradeLevels.fatChicken >= 4
            ? 'MAX: 1 in 5 hatch fat — top gold'
            : '1 in 5 hatch fat — more gold, slower';
        },
        apply() { upgradeLevels.fatChicken++; },
      },
      {
        // Mutually exclusive with Rich Chickens. Hatched workers wear hardhats,
        // walk a little faster, and run to fence debris to rebuild the wall —
        // sacrificing themselves in the process.
        id: 'workerChicken',
        title: 'Worker Chickens',
        available() { return wave >= 25 && (upgradeLevels.richChicken === 0 || metaverseOn()) && upgradeLevels.workerChicken < 5; },
        desc() {
          const nxt = Math.min(5, upgradeLevels.workerChicken + 1);
          const pct = Math.round(WORKER_HATCH_CHANCE[nxt] * 100);
          if (upgradeLevels.workerChicken === 0)
            return pct + '% hatch in hardhats — they rebuild fences';
          if (upgradeLevels.workerChicken >= 4)
            return 'MAX: ' + pct + '% hardhat hatch';
          return 'Hardhat hatch chance → ' + pct + '%';
        },
        apply() { upgradeLevels.workerChicken++; },
      },
      {
        // Mutually exclusive with Worker Chickens. Top-hatted gentry waddle
        // slowly but pay an extra $' + RICH_GOLD_BONUS + ' each wave. Stacks
        // additively with Fat Chickens' per-tier gold.
        id: 'richChicken',
        title: 'Rich Chickens',
        available() { return wave >= 25 && (upgradeLevels.workerChicken === 0 || metaverseOn()) && upgradeLevels.richChicken < 5; },
        desc() {
          const nxt = Math.min(5, upgradeLevels.richChicken + 1);
          const pct = Math.round(RICH_HATCH_CHANCE[nxt] * 100);
          const gold = RICH_GOLD_BONUS[nxt];
          if (upgradeLevels.richChicken === 0)
            return pct + '% top-hat hatch — slower, pay +$' + gold + ' each';
          if (upgradeLevels.richChicken >= 4)
            return 'MAX: ' + pct + '% top-hat, +$' + gold + ' each';
          return 'Top-hat hatch → ' + pct + '%, +$' + gold + ' each';
        },
        apply() { upgradeLevels.richChicken++; },
      },
      {
        id: 'dog',
        title: dogUpgradeTitle(),
        available() { return wave >= 15; },
        desc() {
          if (upgradeLevels.dog === 0) return 'Adopt a guard dog that hunts wolves';
          if (upgradeLevels.dog >= 4) return 'Retire the pack — your dogs head home';
          return 'Train the dog pack — faster, stronger bite';
        },
        apply() {
          // Levels 1-4 adopt and train the pack; the 5th pick (level 5) retires
          // it — the dogs leave and the next Dog Friend generation unlocks.
          if (upgradeLevels.dog >= 4) {
            dogs.length = 0;        // the pack retires and heads home
            upgradeLevels.dog = 0;  // the next generation starts unadopted
            dogGen++;
          } else {
            upgradeLevels.dog++;
            if (upgradeLevels.dog === 1) spawnDogPack(); // first level — the pack arrives
          }
        },
      },
      {
        id: 'farm',
        title: 'Farm',
        available() { return wave >= FARM_UNLOCK_WAVE && upgradeLevels.farm < 5; },
        desc() {
          if (upgradeLevels.farm === 0) return 'Unlocks farms — crop plots you build for cash';
          return upgradeLevels.farm >= 4
            ? 'MAX: farms ripen in ' + FARM_WAVES[5] + ' waves + bigger harvest'
            : 'Farms ripen 1 wave sooner (now ' + (wavesToFinish() - 1) + ')';
        },
        apply() { if (upgradeLevels.farm < 5) upgradeLevels.farm++; },
      },
      {
        id: 'woodFence',
        title: 'Wooden Fence',
        available() { return upgradeLevels.woodFence < 5; },
        desc() {
          if (upgradeLevels.woodFence === 0) return 'Unlocks wooden fences (1 HP)';
          if (upgradeLevels.woodFence >= 4) return 'MAX: ' + tableNext('woodFence') + ' HP + spikes wound attackers';
          return 'Wooden fence HP → ' + tableNext('woodFence');
        },
        apply() { upgradeLevels.woodFence++; },
      },
      {
        id: 'stoneWall',
        title: 'Stone Wall',
        available() { return wave >= 15 && upgradeLevels.stoneWall < 5; },
        desc() {
          if (upgradeLevels.stoneWall === 0) return 'Unlocks stone walls (2 HP)';
          if (upgradeLevels.stoneWall >= 4) return 'MAX: ' + tableNext('stoneWall') + ' HP + spikes wound attackers';
          return 'Stone wall HP → ' + tableNext('stoneWall');
        },
        apply() { upgradeLevels.stoneWall++; },
      },
      {
        // Mutually exclusive with Chicken Statue. Wolves preferentially attack
        // dummies; HP scales with level. At max, a destroyed dummy explodes.
        id: 'dummy',
        title: 'Scarecrow',
        available() { return wave >= 25 && (upgradeLevels.statue === 0 || metaverseOn()) && upgradeLevels.dummy < 5; },
        desc() {
          if (upgradeLevels.dummy === 0) return 'Unlocks scarecrows — wolves chase them ($' + DUMMY_COST + ', ' + DUMMY_HP_TABLE[1] + ' HP)';
          if (upgradeLevels.dummy >= 4) return 'MAX: ' + DUMMY_HP_TABLE[5] + ' HP — destroyed scarecrows explode';
          return 'Scarecrow HP → ' + DUMMY_HP_TABLE[upgradeLevels.dummy + 1];
        },
        apply() { upgradeLevels.dummy++; },
      },
      {
        // Mutually exclusive with Scarecrow. Statues are tankier and each
        // level makes wolves more likely to ignore them. At max wolves never
        // bite and may be stunned just by getting close.
        id: 'statue',
        title: 'Chicken Statue',
        available() { return wave >= 25 && (upgradeLevels.dummy === 0 || metaverseOn()) && upgradeLevels.statue < 5; },
        desc() {
          if (upgradeLevels.statue === 0) return 'Unlocks statues — fake chicken ($' + STATUE_COST + ', ' + STATUE_HP_TABLE[1] + ' HP)';
          const nxt = upgradeLevels.statue + 1;
          if (upgradeLevels.statue >= 4) return 'MAX: ' + STATUE_HP_TABLE[5] + ' HP — wolves ignore & may be stunned';
          return 'Statue → ' + STATUE_HP_TABLE[nxt] + ' HP, ignored ' + Math.round(STATUE_IGNORE_CHANCE[nxt] * 100) + '%';
        },
        apply() { upgradeLevels.statue++; },
      },
      {
        // Golden Chicken — a wave-51 vanity capstone. Only surfaces once the
        // Chicken Statue line is maxed (the "golden statue" tier). Costs a
        // hefty $1000 and does nothing but plate every chicken statue in gold.
        id: 'goldenChicken',
        title: 'Golden Chicken',
        available() { return wave >= 51 && upgradeLevels.statue >= 5 && upgradeLevels.goldenChicken < 1 && money >= GOLDEN_CHICKEN_COST; },
        desc() { return 'Spend $' + GOLDEN_CHICKEN_COST + ' → your chicken statues turn solid gold'; },
        apply() { money -= GOLDEN_CHICKEN_COST; upgradeLevels.goldenChicken = 1; },
      },
      {
        // Explosive Mines — only unlocked after the player reaches wave 40.
        // Once placed, a mine is nearly invisible; only at max level does a
        // faint warning ring show. Each rank scales the blast bigger and
        // hits harder. Anyone — wolf or keeper — stepping on the tile sets
        // it off. A placed mine doesn't change tier if you upgrade later;
        // it keeps the level it had at place-time.
        id: 'mine',
        title: 'Explosive Mine',
        available() { return wave >= MINE_UNLOCK_WAVE && upgradeLevels.mine < 5; },
        desc() {
          const nxt = upgradeLevels.mine + 1;
          if (upgradeLevels.mine === 0) return 'Unlocks mines — buried bombs ($' + MINE_COST + ', dmg ' + MINE_DMG[1] + ', r ' + MINE_RADIUS[1].toFixed(1) + ')';
          if (upgradeLevels.mine >= 4) return 'MAX: dmg ' + MINE_DMG[5] + ', r ' + MINE_RADIUS[5].toFixed(1) + ' — barely visible';
          return 'Mine → dmg ' + MINE_DMG[nxt] + ', radius ' + MINE_RADIUS[nxt].toFixed(1);
        },
        apply() { upgradeLevels.mine++; },
      },
      {
        // Sabotage — late-game wolf debuff. Per-level chance every spawned
        // wolf hatches "defective": eye flickers and it just wanders. At max
        // a defective wolf has a small chance to turn turncoat (blue eye)
        // and start picking off other wolves.
        id: 'sabotage',
        title: 'Sabotage',
        available() { return wave >= MINE_UNLOCK_WAVE && upgradeLevels.sabotage < 5; },
        desc() {
          const nxt = SABOTAGE_DEFECT_CHANCE[Math.min(5, upgradeLevels.sabotage + 1)];
          if (upgradeLevels.sabotage >= 4)
            return 'MAX: ' + Math.round(nxt * 100) + '% defective, some turncoat';
          return 'Wolves hatch defective → ' + Math.round(nxt * 100) + '% chance';
        },
        apply() { upgradeLevels.sabotage++; },
      },
      {
        // "Size Matters" — second utility for Longer Barrel. Wolves focusing
        // the keeper roll a tiny per-tick freeze chance scaled by the
        // longest barrel they've ever seen (range upgrade level × upgrade
        // level). At max, they also roll a chance to break and run for the
        // map edge. Funny title leans into the barrel-envy joke.
        id: 'sizeMatters',
        title: 'Size Matters',
        available() {
          return wave >= MINE_UNLOCK_WAVE
              && upgradeLevels.range > 0
              && upgradeLevels.sizeMatters < 5;
        },
        desc() {
          if (upgradeLevels.sizeMatters >= 4)
            return 'MAX: ~10s shots, huge reach, edge ricochet';
          if (upgradeLevels.sizeMatters === 0)
            return '×2 barrel growth, much longer-lived shots';
          return 'Tier ' + (upgradeLevels.sizeMatters + 1) + '/5 — bigger barrel, longer shots';
        },
        apply() { upgradeLevels.sizeMatters++; },
      },
      {
        // Rocket Boots — mutually exclusive with Last Stand. While at a full
        // sprint, a per-second roll launches the keeper into a short flight.
        // Flying = no fence collision, melee bites miss, mines ignore them.
        id: 'rocketBoots',
        title: 'Rocket Boots',
        available() {
          return wave >= MINE_UNLOCK_WAVE
              && (upgradeLevels.lastStand === 0 || metaverseOn())
              && upgradeLevels.rocketBoots < 5;
        },
        desc() {
          const nxt = upgradeLevels.rocketBoots + 1;
          if (upgradeLevels.rocketBoots === 0)
            return 'Rare lift-off when sprinting (' + ROCKET_BOOTS_DURATION[1].toFixed(1) + 's)';
          if (upgradeLevels.rocketBoots >= 4)
            return 'MAX: ' + ROCKET_BOOTS_DURATION[5].toFixed(1) + 's flight, phases walls';
          return 'Lift-off chance up, flight ' + ROCKET_BOOTS_DURATION[nxt].toFixed(1) + 's, trample ' + ROCKET_BOOTS_TRAMPLE[nxt].toFixed(1) + ' dmg/s';
        },
        apply() { upgradeLevels.rocketBoots++; },
      },
      {
        // Last Stand — mutually exclusive with Rocket Boots. Crouch buff
        // after a beat of stillness; max-level adds a cloak once the keeper
        // also holds fire for an extra window.
        id: 'lastStand',
        title: 'Last Stand',
        available() {
          return wave >= MINE_UNLOCK_WAVE
              && (upgradeLevels.rocketBoots === 0 || metaverseOn())
              && upgradeLevels.lastStand < 5;
        },
        desc() {
          const nxt = upgradeLevels.lastStand + 1;
          if (upgradeLevels.lastStand >= 4) return 'MAX: ×' + LAST_STAND_DMG_MUL[5].toFixed(1) + ' dmg, cloaks you';
          if (upgradeLevels.lastStand === 0) return 'Stand still → crouch up: ×' + LAST_STAND_DMG_MUL[1].toFixed(2) + ' dmg, faster fire';
          return 'Crouch buff → ×' + LAST_STAND_DMG_MUL[nxt].toFixed(2) + ' dmg, ×' + (1 / LAST_STAND_FIRE_MUL[nxt]).toFixed(2) + ' rate';
        },
        apply() { upgradeLevels.lastStand++; },
      },
      {
        // Homing Shots — mutually exclusive with Laser Shots. Per pellet
        // chance to lock onto a wolf within range and steer toward it.
        // Pellets fly noticeably slower in exchange for the tracking.
        id: 'homing',
        title: 'Homing Shots',
        available() {
          return wave >= MINE_UNLOCK_WAVE
              && (upgradeLevels.laser === 0 || metaverseOn())
              && upgradeLevels.homing < 5;
        },
        desc() {
          if (upgradeLevels.homing >= 4) return 'MAX: sharpest turn, longest seek';
          if (upgradeLevels.homing === 0) return 'Slow pellets seek the nearest wolf';
          return 'Sharper turn + longer seek range';
        },
        apply() { upgradeLevels.homing++; },
      },
      {
        // Laser Shots — mutually exclusive with Homing Shots. Every shot
        // becomes a hit-scan beam (like the ranged wolf's), damaging every
        // wolf/hunter it passes through.
        id: 'laser',
        title: 'Laser Shots',
        available() {
          return wave >= MINE_UNLOCK_WAVE
              && (upgradeLevels.homing === 0 || metaverseOn())
              && upgradeLevels.laser < 5;
        },
        desc() {
          const nxt = upgradeLevels.laser + 1;
          if (upgradeLevels.laser >= 4) return 'MAX: ' + LASER_DMG[5] + ' dmg, ' + LASER_RANGE[5].toFixed(1) + ' tile beam — instant hit';
          if (upgradeLevels.laser === 0) return 'Shots become a beam: ' + LASER_DMG[1] + ' dmg, ' + LASER_RANGE[1].toFixed(1) + ' tiles';
          return 'Beam → ' + LASER_DMG[nxt] + ' dmg, ' + LASER_RANGE[nxt].toFixed(1) + ' tile range';
        },
        apply() { upgradeLevels.laser++; },
      },
      {
        // Cryptid Radar — fits an antenna onto every coop and bumps the rare
        // wolf variants' spawn chance per level. Foxes, sword wolves, hatted
        // wolves all roll more often.
        id: 'cryptidRadar',
        title: 'Cryptid Radar',
        available() { return wave >= MINE_UNLOCK_WAVE && upgradeLevels.cryptidRadar < 5; },
        desc() {
          const cur = upgradeLevels.cryptidRadar;
          if (cur >= 4) return 'MAX: ×2 rare wolves, full-map range';
          if (cur === 0) return 'Antennas on coops — detect cryptids, ' + CRYPTID_RADAR_RANGE[1] + '-tile range';
          return 'Longer radar range → ' + CRYPTID_RADAR_RANGE[cur + 1] + ' tiles';
        },
        apply() { upgradeLevels.cryptidRadar++; },
      },
      {
        // Rooftopper — one sniper ally per level, perched on the tallest
        // coops. Slow heavy shots; the taller the coop, the heavier the
        // round (and the longer between trigger pulls).
        id: 'rooftopper',
        title: 'Rooftoppers',
        available() {
          // A new sniper needs an empty coop to perch on. Gating on the live
          // coop count means the level can never outrun the coops (so it won't
          // silently max out with one coop and then block adding more later).
          return wave >= MINE_UNLOCK_WAVE
              && upgradeLevels.rooftopper < coops.length
              && upgradeLevels.rooftopper < 5;
        },
        desc() {
          const nxt = upgradeLevels.rooftopper + 1;
          if (upgradeLevels.rooftopper >= 4) return 'MAX: ' + nxt + ' rooftop snipers — heavier on taller coops';
          if (upgradeLevels.rooftopper === 0) return '1 sniper on your tallest coop';
          return nxt + ' snipers — higher coop hits harder';
        },
        // Re-check the coop count at apply time too, so even the debug panel
        // (which calls apply() directly) can't push the level past the coops.
        apply() {
          if (upgradeLevels.rooftopper < coops.length) {
            upgradeLevels.rooftopper++;
            assignRooftoppers();
          }
        },
      },
      {
        id: 'buyHat',
        title: 'Buy Hat',
        // Still offered when broke (so it's always a visible option) — the
        // wallet is only checked at purchase time via affordable().
        available() { return playerHats < MAX_HATS; },
        affordable() { return money >= hatPrice; },
        desc() { return 'Spend $' + hatPrice + ' → +1 hat (now ' + playerHats + ')'; },
        apply() {
          money -= hatPrice;
          hatPrice += 5;
          // After 5 purchases, each new hat has a ~6% chance to come in
          // leprechaun green — losing one pays a $100 jackpot.
          const green = hatsBought >= 5 && Math.random() < LEPRECHAUN_BUY_CHANCE;
          hatsBought++;
          playerHats++;
          hatColors.push(green ? LEPRECHAUN_HAT_COLOR : '#5a3825');
        },
      },
      {
        // Buy Hat Pack (wave 40+) — three hats in one go, price ratchets like
        // Buy Hat. Each hat rolls a small leprechaun chance and a very small
        // chance to come in the buddy's straw colour.
        id: 'hatPack',
        title: 'Buy Hat Pack',
        available() { return wave >= 40 && playerHats < MAX_HATS; },
        affordable() { return money >= hatPackPrice; },
        desc() { return '$' + hatPackPrice + ' → +3 hats (rare colours)'; },
        apply() {
          money -= hatPackPrice;
          hatPackPrice += 30;
          for (let i = 0; i < 3 && playerHats < MAX_HATS; i++) {
            hatsBought++;
            playerHats++;
            let col = '#5a3825';
            if (Math.random() < HAT_PACK_BUDDY_CHANCE) col = GUEST_HAT_COLOR;
            else if (hatsBought >= 5 && Math.random() < LEPRECHAUN_BUY_CHANCE) col = LEPRECHAUN_HAT_COLOR;
            hatColors.push(col);
          }
        },
      },
      {
        // Weapon Oil — single-tier. One pick widens the reload skill-check
        // accept zone with an amber halo around the green core for
        // WEAPON_OIL_WAVES waves. It only re-appears in the shop once the
        // previous oil has fully worn off — it never stacks higher.
        id: 'weaponOil',
        title: 'Weapon Oil',
        available() {
          // Disabled only while the gun is RUSTY (rust 1–4) — a rusted gun
          // can't be oiled. The golden gun (max rust) oils fine, as does a
          // clean gun. Otherwise only offered when the last oil wore off.
          if (upgradeLevels.rust > 0 && upgradeLevels.rust < 5) return false;
          return weaponOilCharges === 0; // shown even when broke (affordable() gates the buy)
        },
        affordable() { return money >= weaponOilCostFromMoney(money); },
        desc() {
          const price = weaponOilCostFromMoney(money);
          const after = Math.min(WEAPON_OIL_MAX_BAND, RELOAD_SC_HIT_HALF + WEAPON_OIL_PER_CHARGE);
          const pct = Math.round(after * 100 * 2); // bar-width pct of accept zone
          return '$' + price + ' → ' + pct + '% reload band, ' + WEAPON_OIL_WAVES + ' waves';
        },
        apply() {
          if (weaponOilCharges > 0) return;
          const price = weaponOilCostFromMoney(money);
          if (money < price) return;
          money -= price;
          weaponOilCharges = 1;
          weaponOilBought++;
          weaponOilWaves = WEAPON_OIL_WAVES; // refresh the lifetime on every buy
          recomputeJamChance();
        },
      },
      {
        // Advanced Oil (wave 40+) — a premium one-round oil that floods the
        // accept band almost full AND fattens the crit line. Same rust rule as
        // Weapon Oil; costs a bit more.
        id: 'advancedOil',
        title: 'Advanced Oil',
        available() {
          if (upgradeLevels.rust > 0 && upgradeLevels.rust < 5) return false;
          return wave >= 40 && advancedOilWaves === 0; // shown even when broke (affordable() gates the buy)
        },
        affordable() { return money >= advancedOilCost(); },
        desc() { return '$' + advancedOilCost() + ' → near-full band, 1 round'; },
        apply() {
          const price = advancedOilCost();
          if (money < price) return;
          money -= price;
          advancedOilBought++;
          advancedOilWaves = 1; // active for the single upcoming round
        },
      },
      {
        // Hunter camp — unlocks the first time the player has ever held the
        // unlock gold. No upfront fee: the per-wave bill is simply collected at
        // the start of every following wave.
        id: 'hunters',
        title: 'Call the Hunters',
        available() {
          if (!everReachedHunterGold) return false;
          if (huntersCamps.length === 0) return money >= HUNTER_FEE_PER_WAVE; // first crew
          // Hunter Caravan: pitch more camps (up to 3).
          return upgradeLevels.hunterCaravan > 0 && huntersCamps.length < 3
              && hunters.some(h => h.alive) && !huntersLeavePending;
        },
        desc() {
          if (huntersCamps.length === 0) return '3 shotgunners pitch in — $' + HUNTER_FEE_PER_WAVE + '/wave';
          return 'Pitch camp ' + (huntersCamps.length + 1) + ' of 3 — +$' + HUNTER_GROUP_FEE[Math.min(3, huntersCamps.length + 1)] + '/wave';
        },
        apply() {
          if (huntersCamps.length === 0) spawnHuntersCamp();
          else callHunterReinforcements();
        },
      },
      {
        // Hunter Caravan (wave 51+, one-time) — lets Call the Hunters be picked
        // again while a camp is up, fielding up to three groups at once.
        id: 'hunterCaravan',
        title: 'Hunter Caravan',
        available() { return wave >= 51 && everReachedHunterGold && upgradeLevels.hunterCaravan < 1; },
        desc() { return 'Up to 3 hunter groups (2nd +$200, 3rd +$300/wave)'; },
        apply() { upgradeLevels.hunterCaravan = 1; },
      },
      {
        // Bribe Wolves (wave 51+) — pay off the pack: this wave runs 20%
        // lighter, but the next swells 10%. Price ratchets up each buy.
        id: 'bribeWolves',
        title: 'Bribe Wolves',
        available() { return wave >= 51 && money >= bribePrice; },
        desc() { return '$' + bribePrice + ' → −20% wolves, +10% after'; },
        apply() {
          money -= bribePrice;
          bribePrice += 100;
          bribeNextWaveMul *= 0.8;
          bribeFollowWaveMul *= 1.1;
        },
      },
      {
        // Metaverse (wave 51+, one-time) — the run-defining capstone. Once
        // taken, every either/or lock dissolves: both halves of every mutually
        // exclusive pair become buyable, so they can be stacked together.
        id: 'metaverse',
        title: 'Metaverse',
        available() { return wave >= 51 && upgradeLevels.metaverse < 1; },
        desc() { return 'Buy BOTH sides of every either/or upgrade'; },
        apply() { upgradeLevels.metaverse = 1; playMetaverse(); },
      },
      {
        // Hunter Gear — only on offer while the camp is active. Each tier
        // bumps every hunter's HP cap, blast damage and fire rate. Costs $200.
        id: 'hunterPower',
        title: 'Hunter Gear',
        available() {
          return huntersCamps.length > 0
              && hunters.some(h => h.alive)
              && !huntersLeavePending
              && upgradeLevels.hunterPower < 5
              && money >= hunterGearCost();
        },
        desc() {
          const next = upgradeLevels.hunterPower + 1;
          const cost = hunterGearCost();
          if (next >= 5) return 'MAX: ' + HUNTER_POWER_HP[5] + ' HP, ×' + HUNTER_POWER_DMG[5].toFixed(1)
               + ' dmg, crew stays — $' + cost;
          return 'Tier ' + next + '/5: ' + HUNTER_POWER_HP[next] + ' HP, ×'
               + HUNTER_POWER_DMG[next].toFixed(1) + ' dmg — $' + cost;
        },
        apply() {
          money -= hunterGearCost();
          upgradeLevels.hunterPower++;
          const newLvl = hunterPowerLvl();
          const newHP = HUNTER_POWER_HP[newLvl];
          // New kit patches everyone up: survivors go to FULL health on the new
          // cap (they were only topped up by the delta before, so a battered
          // crew stayed battered) and re-arm to the tier's weapon ladder.
          for (const h of hunters) {
            if (!h.alive) continue;
            h.maxHp = newHP;
            h.hp = newHP;
            h.weapon = hunterWeaponForTier(newLvl);
            h.burstLeft = 0;
          }
          // …and the camp is brought back up to strength, so buying gear after
          // losing people actually rebuilds the crew instead of just upgrading
          // the handful still standing.
          refillHunterCamps();
        },
      },
      {
        // Offered whenever exactly one keeper is down — the survivor's pot
        // pays the price (same ladder as Buy Hat), and the ghost returns with
        // 3 hats. The price ratchets up just like Buy Hat does.
        id: 'resurrect',
        title: 'Resurrect Buddy',
        available() {
          if (!multiplayer || !player2.active) return false;
          const onlyOne = (player.ghost && !player2.ghost) || (!player.ghost && player2.ghost);
          return onlyOne;
        },
        desc() {
          const who = player.ghost ? 'You' : 'Buddy';
          return firstReviveFree
            ? 'FREE (first one) → ' + who + ' rises with 3 hats'
            : 'Spend $' + revivePrice + ' → ' + who + ' rises with 3 hats';
        },
        affordable() {
          if (!multiplayer || !player2.active) return false;
          const onlyOne = (player.ghost && !player2.ghost) || (!player.ghost && player2.ghost);
          if (!onlyOne) return false;
          if (firstReviveFree) return true;
          return survivorWallet().balance() >= revivePrice;
        },
        apply() {
          // The first resurrection of the run is free — it doesn't touch the
          // wallet or ratchet the price, so the buddy comeback always lands once.
          if (firstReviveFree) {
            firstReviveFree = false;
          } else {
            const wallet = survivorWallet();
            wallet.spend(revivePrice);
            revivePrice += 10; // $10 more expensive each resurrection
          }
          if (player.ghost) reviveKeeper(player);
          else              reviveKeeper(player2);
        },
      },
      {
        // Knowledge Scroll — the one card in the pool that buys no power at
        // all. It reads out a piece of farm lore (js/hints.js) on a parchment
        // overlay, never the same one twice in a session.
        //
        // Before endless play it belongs to the third (bonus) pick. From
        // wave 51 onward it can also appear on either regular pick.
        id: 'scroll',
        title: 'Knowledge Scroll',
        available() {
          return wave >= SCROLL_UNLOCK_WAVE
              && (bonusUpgradeAvailable || wave >= SCROLL_NORMAL_PICK_WAVE)
              && hintsLeft() > 0;
        },
        desc() {
          const left = hintsLeft();
          return left === 1
            ? 'The last secret on the farm — read it'
            : 'Read a farm secret (' + left + ' of ' + GAME_HINTS.length + ' unread)';
        },
        apply() { readKnowledgeScroll(); },
      },
    ];
  }

  // Filler shown when fewer than 3 real upgrades are available.
  // The payout scales with progress: one third of the current wave.
  function cashReward() { return Math.max(2, wave); }
  function makeCashOption() {
    return {
      id: 'cash',
      title: 'Pocket Money',
      desc() { return 'Get cash — take $' + cashReward(); },
      apply() { const r = cashReward(); money += r; runMoneyEarned += r; },
    };
  }

  // Easter-egg filler — when the pool is so dry there isn't even a third real
  // option to show, this keeps the card grid full (3 slots) so the screen never
  // renders an undefined option and freezes. Picking it just clucks at you.
  function makeChickenOption() {
    return {
      id: 'chicken',
      title: 'Chicken',
      desc() { return 'Cluck. (just a chicken)'; },
      apply() { playChickenDeath(); }, // the chicken squawk — no gameplay effect
    };
  }

  // Take up to `n` DISTINCT options (by id) from a (possibly bias-duplicated)
  // pool, then pad with at most ONE Pocket Money. Prevents the same upgrade —
  // or Pocket Money — from appearing twice when the pool is short.
  // Mutually-exclusive upgrade pairs — picking one permanently locks the other
  // out. Hoisted to module scope so BOTH the upgrade-card renderer and the
  // pick builder can read it (the builder uses it to avoid railroading a broke
  // player into a forced lock).
  const LOCKS_OUT = {
    spreadUp: 'Tighter Pattern', spreadDown: 'Loose Pattern',
    focusUp: 'Wolf Repellent', focusDown: 'Meat Bait',
    doubleBarrel: 'Machine-Gun', machineGun: 'Double-Barrel',
    softBullet: 'Hard Bullets', hardBullet: 'Soft Bullets',
    dummy: 'Chicken Statue', statue: 'Scarecrow',
    nerdReload: 'Jock Reload', jockReload: 'Nerd Reload',
    coldShot: 'Hot Shot', hotShot: 'Cold Shot',
    calmWaves: 'Rough Waves', roughWaves: 'Calm Waves',
    // The late-game pairs are just as exclusive (their available() gates each
    // other the same way) — they were missing here, so their cards used to
    // lock the counterpart out with no warning printed on the card.
    rocket: 'Minigun', minigun: 'Rocket Launcher',
    homing: 'Laser Shots', laser: 'Homing Shots',
    rocketBoots: 'Last Stand', lastStand: 'Rocket Boots',
    workerChicken: 'Rich Chickens', richChicken: 'Worker Chickens',
  };
  // The counterpart's ID for each exclusive pair (LOCKS_OUT holds display
  // names; the skill tree needs the ID to read the other side's level).
  const PAIRED_WITH = {
    spreadUp: 'spreadDown', spreadDown: 'spreadUp',
    focusUp: 'focusDown', focusDown: 'focusUp',
    doubleBarrel: 'machineGun', machineGun: 'doubleBarrel',
    softBullet: 'hardBullet', hardBullet: 'softBullet',
    dummy: 'statue', statue: 'dummy',
    coldShot: 'hotShot', hotShot: 'coldShot',
    calmWaves: 'roughWaves', roughWaves: 'calmWaves',
    rocket: 'minigun', minigun: 'rocket',
    homing: 'laser', laser: 'homing',
    rocketBoots: 'lastStand', lastStand: 'rocketBoots',
    workerChicken: 'richChicken', richChicken: 'workerChicken',
  };
  // True when picking `option` right now would FRESHLY lock out its counterpart:
  // it's a paired upgrade, the Metaverse hasn't dissolved the locks, and it's
  // still at level 0 (a higher level means that lock already happened earlier).
  function optionLocksOut(option, levels) {
    return !!(option && !metaverseOn() && LOCKS_OUT[option.id] && ((levels || upgradeLevels)[option.id] || 0) === 0);
  }

