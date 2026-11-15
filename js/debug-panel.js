  // ---------- DEBUG PANEL — gated by the DEBUG flag at top of the IIFE ----------
  if (DEBUG) (function setupDebugPanel() {
    const root = document.getElementById('debug');
    const toggle = document.getElementById('debug-toggle');
    const upgradesRow = document.getElementById('debug-upgrades');
    const consumablesRow = document.getElementById('debug-consumables');
    const waveAutoStartBtn = document.getElementById('debug-wave-autostart-btn');

    function refreshWaveAutoStartButton() {
      if (!waveAutoStartBtn) return;
      waveAutoStartBtn.textContent = waveAutoStartPaused ? 'Resume wave start' : 'Pause wave start';
      waveAutoStartBtn.title = waveAutoStartPaused
        ? 'Allow waves to auto-start again'
        : 'Stop automatic wave starts after the current wave ends';
    }

    refreshWaveAutoStartButton();

    const immortalBtn = document.getElementById('debug-immortal-btn');
    function refreshImmortalButton() {
      if (immortalBtn) immortalBtn.textContent = 'Immortal: ' + (immortal ? 'ON' : 'OFF');
    }
    refreshImmortalButton();

    const autoCritBtn = document.getElementById('debug-autocrit-btn');
    function refreshAutoCritButton() {
      if (autoCritBtn) autoCritBtn.textContent = 'Auto reload+crit: ' + (debugAutoReloadCrit ? 'ON' : 'OFF');
    }
    refreshAutoCritButton();

    const parryBtn = document.getElementById('debug-parry-btn');
    function refreshParryButton() {
      if (parryBtn) parryBtn.textContent = 'Parry mode: ' + (parryMode ? 'ON' : 'OFF');
    }
    refreshParryButton();

    const fastModeBtn = document.getElementById('debug-fast-mode-btn');
    function refreshFastModeButton() {
      if (fastModeBtn) fastModeBtn.textContent = 'Fast mode: ' + (debugFastMode ? 'ON' : 'OFF');
      const skipBtn = root.querySelector('button[data-debug="skip-waves-10"]');
      if (skipBtn) skipBtn.textContent = debugFastMode ? 'Skip 5 waves' : 'Skip 10 waves';
    }
    refreshFastModeButton();

    const targetBtn = document.getElementById('debug-target-btn');
    function refreshTargetButton() {
      if (!targetBtn) return;
      const labels = { p1: 'P1', p2: 'P2', both: 'BOTH' };
      targetBtn.textContent = 'Target: ' + labels[debugUpgradeTarget];
      // Tint so it's obviously a mode toggle.
      targetBtn.style.background = debugUpgradeTarget === 'p2' ? 'rgba(60,90,200,0.7)'
        : debugUpgradeTarget === 'both' ? 'rgba(100,60,160,0.7)' : '';
    }
    refreshTargetButton();

    // "Buy all upgrades" is a big, irreversible bulk-grant — require 3 presses
    // in a row to fire, with the button counting down the presses left. A few
    // seconds of inactivity disarms it so a stray click never leaves it primed.
    const buyAllBtn = root.querySelector('button[data-debug="buy-all-upgrades"]');
    const BUY_ALL_LABEL = buyAllBtn ? buyAllBtn.textContent : 'Buy all upgrades';
    let buyAllPresses = 0, buyAllResetTimer = null;
    function refreshBuyAllButton() {
      if (!buyAllBtn) return;
      if (buyAllPresses <= 0) {
        buyAllBtn.textContent = BUY_ALL_LABEL;
        buyAllBtn.style.background = '';
      } else {
        buyAllBtn.textContent = 'Press ' + (3 - buyAllPresses) + '× more…';
        buyAllBtn.style.background = 'rgba(200,120,40,0.8)';
      }
    }
    function disarmBuyAll() {
      buyAllPresses = 0;
      if (buyAllResetTimer) { clearTimeout(buyAllResetTimer); buyAllResetTimer = null; }
      refreshBuyAllButton();
    }

    toggle.addEventListener('click', () => root.classList.toggle('open'));

    const toolsRow = document.getElementById('debug-tools');

    // ---- Upgrades, grouped by the wave that unlocks them ----
    // The unlock wave is read straight out of each upgrade's available()
    // source (the `wave >= N` gate), resolving the named unlock constants.
    // An explicit opt.unlockWave wins if one is ever added. Upgrades with no
    // wave gate fall into the "Start" tier.
    const NAMED_UNLOCK_WAVES = {
      FAT_UNLOCK_WAVE, FARM_UNLOCK_WAVE, MINE_UNLOCK_WAVE,
    };
    function upgradeUnlockWave(opt) {
      if (typeof opt.unlockWave === 'number') return opt.unlockWave;
      const src = opt.available ? opt.available.toString() : '';
      let w = 1;
      const re = /wave\s*>=\s*([A-Za-z_$][\w$]*|\d+)/g;
      let m;
      while ((m = re.exec(src))) {
        const tok = m[1];
        const val = /^\d+$/.test(tok) ? parseInt(tok, 10) : NAMED_UNLOCK_WAVES[tok];
        if (typeof val === 'number') w = Math.max(w, val);
      }
      return w;
    }

    // Tools / one-off helpers that aren't tier-gated upgrades get pulled out of
    // the Upgrades list. Resurrect is handled by the Combat 'Resurrect both'
    // button (not shown here); Wolf's Blade lives in Spawns & Tools.
    const TOOL_UPGRADE_IDS = new Set(['resurrect', 'sword', 'nerdReload', 'jockReload']);
    // Repeatable / single-use buys get their own Consumables row.
    const CONSUMABLE_UPGRADE_IDS = new Set(['buyHat', 'hatPack', 'weaponOil', 'advancedOil', 'hunters', 'hunterPower', 'hunterCaravan', 'bribeWolves']);

    function makeUpgradeButton(opt) {
      const btn = document.createElement('button');
      btn.dataset.debug = 'apply-upgrade';
      btn.dataset.id = opt.id;
      btn.textContent = opt.title;
      btn.title = opt.title;
      return btn;
    }

    // Bucket the tier-gated upgrades by unlock wave (tools + consumables skipped).
    const tiers = new Map();
    for (const opt of getUpgradePool()) {
      if (TOOL_UPGRADE_IDS.has(opt.id) || CONSUMABLE_UPGRADE_IDS.has(opt.id)) continue;
      const w = upgradeUnlockWave(opt);
      if (!tiers.has(w)) tiers.set(w, []);
      tiers.get(w).push(opt);
    }
    for (const w of [...tiers.keys()].sort((a, b) => a - b)) {
      const head = document.createElement('span');
      head.className = 'debug-tier';
      head.textContent = w <= 1 ? 'Start' : 'Wave ' + w;
      upgradesRow.appendChild(head);
      for (const opt of tiers.get(w)) upgradesRow.appendChild(makeUpgradeButton(opt));
    }

    // ---- Consumables row (Buy Hat, Weapon Oil, Hunters, Hunter Gear) ----
    for (const opt of getUpgradePool()) {
      if (CONSUMABLE_UPGRADE_IDS.has(opt.id)) consumablesRow.appendChild(makeUpgradeButton(opt));
    }

    // ---- Spawns & Tools row (up top, beside the other debug controls) ----
    // Wolf's Blade is the upgrade-pool tool relocated here. Resurrect is NOT
    // shown — the Combat 'Resurrect both' button covers it.
    for (const opt of getUpgradePool()) {
      if (opt.id === 'resurrect') continue;
      if (TOOL_UPGRADE_IDS.has(opt.id)) toolsRow.appendChild(makeUpgradeButton(opt));
    }
    // Spawn-a-single-variant helpers + karma + wave skip.
    const TOOL_BUTTONS = [
      ['spawn-wolf',      'Spawn wolf',           'Spawn a single regular wolf'],
      ['spawn-chicken',   'Spawn chicken',         'Hatch a single chicken near you'],
      ['spawn-wolf-fast', 'Spawn very fast wolf',  'Spawn a single extremely fast (pale) wolf'],
      ['spawn-wolf-big',  'Spawn very big wolf',   'Spawn a single extremely big (resistant) wolf'],
      ['spawn-fox',       'Spawn fox',             'Spawn a single fox raider'],
      ['spawn-assassin',  'Spawn assassin wolf',   'Spawn a single assassin wolf'],
      ['spawn-sword',     'Spawn sword wolf',      'Spawn a single sword wolf'],
      ['spawn-bomb',      'Spawn exploding wolf',  'Spawn a single bomb wolf (wall sapper)'],
      ['spawn-breeder',   'Spawn brood wolf',      'Spawn a single brood wolf (bursts into 3 pups on death)'],
      ['spawn-ranged',    'Spawn laser wolf',      'Spawn a single laser wolf (sits and fires a red hit-scan beam)'],
      ['spawn-homer',     'Spawn ranged wolf',     'Spawn a single ranged wolf (sits and lobs slow red homing bullets)'],
      ['spawn-thing',     'Spawn thing wolf',      'Spawn a single thing wolf (its head scuttles off on death)'],
      ['spawn-missilewolf','Spawn missile wolf',   'Spawn a stationary missile wolf that bombards coops (wave 51+ enemy)'],
      ['spawn-hunterwolf', 'Spawn hunter wolf',    'Spawn the hunter-wolf cryptid (keeper reskin that shoots back)'],
      ['spawn-ghostwolf',  'Spawn ghost wolf',     'Spawn a ghost wolf (vanishes silently when shot; chance grows with player deaths)'],
      ['spawn-parachute', 'Spawn parachute wolf',  'Drop a single wolf in by parachute'],
      ['spawn-p2cameo',   'Spawn buddy cameo',        'Trigger the rare Player-2 cameo walk-through'],
      ['karma-max',       'Max karma',             'Slam karma to +' + (typeof KARMA_MAX !== 'undefined' ? KARMA_MAX : 'MAX')],
      ['karma-min',       'Min karma',             'Slam karma to -' + (typeof KARMA_MAX !== 'undefined' ? KARMA_MAX : 'MAX')],
      ['skip-waves-10',   'Skip 10 waves',         'Jump the game forward by 10 waves'],
      ['boss-wave',       'Boss wave (50)',        'Jump straight to the wave-50 boss fight'],
    ];
    for (const [action, label, tip] of TOOL_BUTTONS) {
      const btn = document.createElement('button');
      btn.dataset.debug = action;
      btn.textContent = label;
      btn.title = tip;
      toolsRow.appendChild(btn);
    }

    root.addEventListener('click', e => {
      const btn = e.target.closest('button[data-debug]');
      if (!btn) return;
      const action = btn.dataset.debug;
      // Toggle-button (open/close the panel body) runs locally on either
      // client — it's pure UI, no game state.
      // The rest of the panel mutates host-authoritative state. From the
      // guest we forward the click to the host and let them apply it; the
      // next snapshot will reflect the change on the guest's screen.
      if (multiplayer && !isHost && conn && conn.open) {
        // The target selector (P1/P2/BOTH) is pure local UI state — run it on
        // the guest so its own button reflects the choice, then fall through
        // WITHOUT forwarding. Every other action is forwarded to the host, and
        // carries the guest's chosen target so the host applies it to the right
        // keeper instead of defaulting to its own (P1) selection.
        if (action !== 'cycle-upgrade-target') {
          try {
            conn.send({
              type: 'debug-action',
              action: action,
              amount: btn.dataset.amount,
              id: btn.dataset.id,
              target: debugUpgradeTarget,
            });
          } catch (_) {}
          return;
        }
      }
      if (action === 'money-add') {
        const baseAmt = parseInt(btn.dataset.amount, 10);
        const amt = debugFastMode ? baseAmt * 5 : baseAmt;
        money += amt;
        toast('+$' + amt, 0.6);
      } else if (action === 'money-set') {
        money = parseInt(btn.dataset.amount, 10);
        toast('Money = $' + money, 0.6);
      } else if (action === 'kill-wolves') {
        let killed = 0;
        for (const w of wolves) {
          if (!w.alive || w.boss) continue; // never instakill the boss
          w.alive = false;
          kills++;
          player.kills = (player.kills || 0) + 1;
          killed++;
          onWolfKilled(w);
          corpses.push({ x: w.x, y: w.y, kind: 'wolf', t: 5 });
        }
        // The boss instead just finishes its current side (bossTick handles the
        // retreat/explode transition).
        if (boss && bossPhase === 'fight') boss.hp = 0;
        toast('Killed ' + killed + ' wolves', 0.8);
        checkWaveDefended();
      } else if (action === 'spawn-wolf') {
        spawnWolf();
      } else if (action === 'spawn-chicken') {
        // Use a real coop as home when one exists, else a transient spot by you.
        const home = coops.length
          ? coops[Math.floor(Math.random() * coops.length)]
          : { x: player.x + rand(-1, 1), y: player.y + rand(-1, 1) };
        spawnChicken(home);
      } else if (action === 'spawn-fox') {
        spawnFox();
      } else if (action === 'spawn-assassin') {
        spawnWolf();
        const wa = wolves[wolves.length - 1];
        if (wa) {
          wa.assassin = true;
          wa.speedMul = (wa.speedMul || 1) * 2; // match the 2x assassin speed
          toast('Spawned assassin wolf', 1.2);
        }
      } else if (action === 'spawn-sword') {
        spawnWolf();
        const ws = wolves[wolves.length - 1];
        if (ws) {
          ws.sword = true;
          toast('Spawned sword wolf', 1.2);
        }
      } else if (action === 'spawn-bomb') {
        spawnBombWolf();
      } else if (action === 'spawn-breeder') {
        spawnBreederWolf();
      } else if (action === 'spawn-ranged') {
        spawnRangedWolf();
      } else if (action === 'spawn-homer') {
        spawnHomerWolf();
      } else if (action === 'spawn-thing') {
        spawnThingWolf();
      } else if (action === 'spawn-missilewolf') {
        spawnMissileWolf();
      } else if (action === 'spawn-hunterwolf') {
        spawnHunterWolf();
      } else if (action === 'spawn-ghostwolf') {
        ghostWolfChance = Math.max(ghostWolfChance, 0.01); // ensure at least 1 death worth
        spawnGhostWolf();
      } else if (action === 'spawn-parachute') {
        spawnParachuteWolf();
      } else if (action === 'spawn-p2cameo') {
        // Force the cameo even if the once-per-run flag was already spent.
        p2CameoUsed = false; p2Cameo = null;
        const s = pickEdgeSpawn(); const t = p2CameoBorderTarget();
        p2CameoUsed = true;
        p2Cameo = { x: s.x, y: s.y, vx: 0, vy: 0, walkT: 0, facingLeft: false,
          lifeT: P2_CAMEO_LIFE, phase: 'wander',
          tx: t.x, ty: t.y, retargetT: rand(1.5, 3) };
      } else if (action === 'karma-max') {
        karma = KARMA_MAX;
        player.karma = KARMA_MAX;
        toast('Karma = +' + KARMA_MAX, 1.0);
      } else if (action === 'karma-min') {
        karma = -KARMA_MAX;
        player.karma = -KARMA_MAX;
        toast('Karma = -' + KARMA_MAX, 1.0);
      } else if (action === 'spawn-wolf-fast') {
        spawnWolf();
        // Boost the last spawned wolf to an extreme faster level
        const w = wolves[wolves.length - 1];
        if (w) {
          w.fasterLevel = Math.max(w.fasterLevel || 0, 50);
          w.speedMul = 1 + w.fasterLevel * 0.05;
          toast('Spawned extremely fast wolf (lvl ' + w.fasterLevel + ')', 1.2);
        }
      } else if (action === 'spawn-wolf-big') {
        spawnWolf();
        // Boost the last spawned wolf to an extreme resist level
        const w2 = wolves[wolves.length - 1];
        if (w2) {
          w2.resistLevel = Math.max(w2.resistLevel || 0, 50);
          w2.size = 1 + w2.resistLevel * 0.045;
          w2.hp = 2 + Math.floor(w2.resistLevel * 0.6);
          toast('Spawned extremely big wolf (lvl ' + w2.resistLevel + ')', 1.2);
        }
      } else if (action === 'skip-waves-10') {
        startWave(debugFastMode ? 5 : 10);
        toast('Skipped to wave ' + wave, 1.2);
      } else if (action === 'boss-wave') {
        // Clear the field and jump straight into the wave-50 boss fight.
        for (let i = wolves.length - 1; i >= 0; i--) wolves.splice(i, 1);
        pellets.length = 0; beams.length = 0; pendingSpawns = 0;
        chickenSuckers.length = 0; bossMissiles.length = 0;
        wave = BOSS_WAVE - 1;
        waveActive = false;
        startWave(1);
      } else if (action === 'toggle-wave-autostart') {
        waveAutoStartPaused = !waveAutoStartPaused;
        refreshWaveAutoStartButton();
        toast(waveAutoStartPaused ? 'Wave auto-start paused' : 'Wave auto-start resumed', 1.0);
      } else if (action === 'force-wave-start') {
        // Kick off the next wave immediately, bypassing the coop/timer gate.
        // Handy when a restart leaves the auto-start unexpectedly stuck.
        if (waveActive) {
          toast('A wave is already active', 1.0);
        } else {
          startWave(debugFastMode ? 5 : 1);
          toast('Force-started wave ' + wave, 1.0);
        }
      } else if (action === 'toggle-immortal') {
        immortal = !immortal;
        refreshImmortalButton();
        toast('Immortal ' + (immortal ? 'ON' : 'OFF'), 1.0);
      } else if (action === 'add-hat') {
        playerHats++;
        hatColors.push('#5a3825');
        toast('Hat added — ' + playerHats + ' hats', 0.6);
      } else if (action === 'add-hat-leprechaun') {
        playerHats++;
        hatColors.push(LEPRECHAUN_HAT_COLOR);
        toast('Leprechaun hat added — ' + playerHats + ' hats', 0.6);
      } else if (action === 'add-hat-witch') {
        playerHats++;
        hatColors.push(NIGHT_OF_WOLF_WITCH_HAT_COLOR);
        toast('Witch hat added — ' + playerHats + ' hats', 0.6);
      } else if (action === 'grow-mustache') {
        // Each press = finishing another run: the mustache grows one level AND
        // ages one notch (greys a little), like surviving into a fresh run.
        player.mustache = (player.mustache || 0) + 1;
        player.mustacheAge = (player.mustacheAge || 0) + 1;
        toast('Mustache level ' + player.mustache + ', age ' + player.mustacheAge, 0.8);
      } else if (action === 'reset-mustache') {
        player.mustache = 0; player.mustacheAge = 0;
        player2.mustache = 0; player2.mustacheAge = 0;
        toast('Mustache progress reset', 0.8);
      } else if (action === 'toggle-autocrit') {
        debugAutoReloadCrit = !debugAutoReloadCrit;
        refreshAutoCritButton();
        toast('Auto reload+crit ' + (debugAutoReloadCrit ? 'ON' : 'OFF'), 1.0);
      } else if (action === 'force-night') {
        nightOfWolfDebugForce = true;
        toast('Next wave will be a Night of the Wolf', 1.6);
      } else if (action === 'resurrect-both') {
        // Brings BOTH keepers back. In co-op a dead keeper is a ghost; in
        // single-player a death goes straight to game-over (no ghost), so this
        // force-revives from EITHER state — clearing ghost/dying, restoring hats,
        // and lifting the game-over screen.
        const forceRevive = (who) => {
          who.ghost = false; who.dying = false; who.downT = 0; who.hurtT = 0;
          if (who === player) {
            playerHats = Math.max(playerHats, 3);
            hatColors.length = 0;
            for (let i = 0; i < playerHats; i++) hatColors.push('#5a3825');
          } else {
            player2.hats = Math.max(player2.hats || 0, 3);
          }
        };
        let revived = 0;
        if (player.ghost || gameOver) { forceRevive(player); revived++; }
        if (player2.active && (player2.ghost || gameOver)) { forceRevive(player2); revived++; }
        if (revived > 0) {
          gameOver = false; gameOverMsg = ''; gameOverCause = ''; gameOverPanelDelayT = 0;
          paused = false;
          toast('Resurrected ' + revived + ' keeper' + (revived > 1 ? 's' : '') + '!', 1.4);
        } else {
          toast('Nobody to resurrect — nobody is down', 1.2);
        }
      } else if (action === 'cycle-upgrade-target') {
        const seq = ['p1', 'p2', 'both'];
        debugUpgradeTarget = seq[(seq.indexOf(debugUpgradeTarget) + 1) % seq.length];
        refreshTargetButton();
        toast('Debug upgrade target: ' + debugUpgradeTarget.toUpperCase(), 0.9);
      } else if (action === 'buy-all-upgrades') {
        // Confirm-by-repetition: the first two presses just arm the button and
        // update the countdown; only the third actually grants everything.
        buyAllPresses++;
        if (buyAllResetTimer) clearTimeout(buyAllResetTimer);
        if (buyAllPresses < 3) {
          refreshBuyAllButton();
          buyAllResetTimer = setTimeout(disarmBuyAll, 3000);
          const left = 3 - buyAllPresses;
          toast('Buy all — press ' + left + ' more time' + (left > 1 ? 's' : '') + ' to confirm', 0.9);
          return;
        }
        disarmBuyAll();
        // Grant every LEVELED upgrade across ALL tiers (starter, wave 15, wave
        // 30, …) up to its cap. Temporarily jump `wave` past every gate so the
        // wave-locked tiers unlock, while each upgrade's own available() still
        // blocks truly mutually-exclusive branches. Re-passes until nothing new
        // can be taken (an upgrade can unlock another). Oils are applied directly.
        const savedWave = wave;
        wave = 100000; // unlock every wave-gated tier for the bulk grant
        try {
          const _bulkGrantPool = (pool, lvlObj) => {
            let applied, passes = 0;
            do {
              applied = 0;
              for (const opt of pool) {
                if (opt.id === 'buyHat' || opt.id === 'weaponOil' || opt.id === 'advancedOil') continue;
                const lvl = lvlObj[opt.id];
                if (lvl === undefined || lvl >= MAX_LEVEL) continue;
                if (opt.available && !opt.available()) continue;
                opt.apply();
                if (lvlObj[opt.id] !== lvl) applied++;
              }
            } while (applied > 0 && ++passes < 40);
          };
          if (debugUpgradeTarget !== 'p2') _bulkGrantPool(getUpgradePool(), upgradeLevels);
          if (debugUpgradeTarget !== 'p1') _bulkGrantPool(getP2UpgradePool(), upgradeLevels2);
        } finally {
          wave = savedWave;
        }
        // Charge-based oils aren't leveled — grant them like the single-apply path.
        weaponOilCharges = 1; weaponOilWaves = WEAPON_OIL_WAVES; advancedOilWaves = 1;
        recomputeJamChance();
        toast('Bought all upgrades → ' + debugUpgradeTarget.toUpperCase(), 1.4);
      } else if (action === 'normal-reload') {
        // Undo Nerd/Jock Reload — both are P1/local-only joke reloads with no
        // in-game way back once picked. Clear the levels and abort any active
        // mini-game so the plain reload returns.
        upgradeLevels.nerdReload = 0;
        upgradeLevels.jockReload = 0;
        cancelReloadMinigame();
        toast('Reload back to normal', 1.0);
      } else if (action === 'give-upgrade') {
        // Pop the upgrade screen right now, and guarantee the bonus pick fires
        // after the first choice (resetting the once-per-wave gate + forcing it).
        bonusUpgradeShownThisWave = false;
        bonusUpgradeForce = true;
        startUpgradePhase();
        toast('Upgrade screen — bonus pick guaranteed next', 1.4);
      } else if (action === 'toggle-parry') {
        parryMode = !parryMode;
        refreshParryButton();
        toast('Parry mode ' + (parryMode ? 'ON — SHIFT to roll' : 'OFF'), 1.4);
      } else if (action === 'apply-upgrade') {
        const id = btn.dataset.id;
        // Oils gate their own apply() behind a money check, so granting them
        // from the debug panel silently no-ops when the wallet is short. Set
        // the underlying state directly so the button actually does something.
        if (id === 'weaponOil') {
          weaponOilCharges = 1;
          weaponOilWaves = WEAPON_OIL_WAVES;
          recomputeJamChance();
          toast('Weapon Oil applied', 0.8);
          return;
        }
        if (id === 'advancedOil') {
          advancedOilWaves = 1;
          toast('Advanced Oil applied', 0.8);
          return;
        }
        if (id === 'hunters') {
          // Debug: first FILL the field — pitch the first crew, then add more
          // camps (up to 3, only if Hunter Caravan is owned). Once every camp is
          // up, further presses just relocate them all to fresh spots. No fee.
          const maxCamps = upgradeLevels.hunterCaravan > 0 ? 3 : 1;
          if (huntersCamps.length === 0) {
            spawnHuntersCamp(); // pitches camp 1 (handles its own toast + sound)
          } else if (huntersCamps.length < maxCamps) {
            addHunterCamp();
            playHuntersArrive();
            toast('Hunter camp ' + huntersCamps.length + ' of ' + maxCamps + ' pitched', 0.8);
          } else {
            relocateHunterCamps();
            playHuntersArrive();
            toast('Hunter camp(s) relocated', 0.8);
          }
          return;
        }
        // Helper: apply an upgrade from a given pool to the given level object.
        function _debugApplyOpt(pool, lvlObj) {
          const o = pool.find(op => op.id === id);
          if (!o) return 0;
          const lvl = lvlObj[id];
          if (id !== 'dog' && id !== 'range' && lvl !== undefined && lvl >= MAX_LEVEL) return -1; // maxed
          const times = debugFastMode ? 5 : 1;
          let n = 0;
          for (let i = 0; i < times; i++) {
            if (id !== 'dog' && id !== 'range' && lvlObj[id] !== undefined && lvlObj[id] >= MAX_LEVEL) break;
            o.apply(); n++;
          }
          return n;
        }
        const opt = getUpgradePool().find(o => o.id === id);
        if (opt) {
          const r1 = (debugUpgradeTarget !== 'p2') ? _debugApplyOpt(getUpgradePool(), upgradeLevels) : null;
          const r2 = (debugUpgradeTarget !== 'p1') ? _debugApplyOpt(getP2UpgradePool(), upgradeLevels2) : null;
          const anyMaxed = r1 === -1 || r2 === -1;
          const anyApplied = (r1 > 0 ? r1 : 0) + (r2 > 0 ? r2 : 0);
          if (anyApplied > 0) {
            toast(opt.title + (anyApplied > 1 ? ' x' + anyApplied : '') + ' → ' + debugUpgradeTarget.toUpperCase(), 0.8);
          } else if (anyMaxed) {
            toast(opt.title + ' already maxed (for target)', 0.8);
          }
        }
      } else if (action === 'toggle-fast-mode') {
        debugFastMode = !debugFastMode;
        refreshFastModeButton();
        toast('Fast mode ' + (debugFastMode ? 'ON — upgrades x5, money x5, +5 waves per clear' : 'OFF'), 1.4);
      }
    });
  })();

