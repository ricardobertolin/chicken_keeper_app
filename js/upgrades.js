  // ---------- Skill tree ----------
  // The upgrade pool as a top-down progression map: every pickable upgrade,
  // the wave that unlocks it, what it grows out of, and the counterpart it
  // locks out. Drives both the in-menu tree overlay and the "new upgrades
  // unlocked" notice, so the two can never drift apart.
  //   tier   — wave the upgrade first becomes offerable (1 = from the start)
  //   max    — levels the upgrade can reach (used for the x/y unlocked counter)
  //   links  — ids this one branches off (drawn as connector lines)
  //   needs  — extra requirement beyond the wave gate; false = still blocked
  //   supply — repeatable/consumable buy, excluded from the level counter
  const SKILL_TREE = [
    // ----- Available from wave 1 -----
    { id: 'jam',        tier: 1,  max: 5, note: 'Fewer jams when you reload' },
    // Longer Barrel is the one upgrade that keeps being offered past its cap
    // (further picks only grow the barrel visually), so it can run above max.
    { id: 'range',      tier: 1,  max: 5, overflow: true, note: 'Longer barrel, shots live longer' },
    { id: 'speed',      tier: 1,  max: 5, note: 'Move faster around the farm' },
    { id: 'fireRate',   tier: 1,  max: 5, note: 'Slower reload pin — easier crits' },
    { id: 'spreadUp',   tier: 1,  max: 5, note: 'Wider cone, more pellets' },
    { id: 'spreadDown', tier: 1,  max: 5, note: 'Tighter cone, ends as a piercing slug' },
    { id: 'focusUp',    tier: 1,  max: 5, note: 'Wolves come for you, and fast' },
    { id: 'focusDown',  tier: 1,  max: 5, note: 'Wolves lose interest in you' },
    { id: 'woodFence',  tier: 1,  max: 5, note: 'Unlocks wooden fences' },
    // Consumables aren't a ladder, so instead of a level they carry held():
    // null until the player has actually bought one, then whatever the live
    // in-game status is. The tree hides the row until held() says otherwise.
    { id: 'buyHat',     tier: 1,  max: 1, supply: true, note: 'One more hat — one more life',
      held: () => hatPrice > 5 ? playerHats + ' hats' : null },
    { id: 'weaponOil',  tier: 1,  max: 1, supply: true, note: 'Wider reload band for a few waves',
      held: () => !weaponOilBought ? null
                : weaponOilCharges > 0 ? weaponOilWaves + ' waves left' : 'worn off' },
    // The hunter line isn't wave-gated at all — it opens the first time the
    // player has ever held HUNTER_UNLOCK_GOLD. Listing it under "from the
    // start" read as if it were available at wave 1, so it gets its own row
    // (see SKILL_GROUPS). `tier` still drives the wave gate for caravan.
    { id: 'hunters',    tier: 1,  max: 1, supply: true, group: 'hunters',
      note: 'Hire shotgunners — needs the unlock gold once',
      needs: () => everReachedHunterGold,
      held: () => huntersCamps.length
        ? huntersCamps.length + '/3 camps, ' + hunters.filter(h => h.alive).length + ' alive'
        : null },
    { id: 'hunterPower', tier: 1, max: 5, links: ['hunters'], group: 'hunters',
      note: 'Better hunter HP, damage and guns',
      needs: () => huntersCamps.length > 0 },

    // ----- Wave 5 -----
    { id: 'hatchRate',   tier: 5, max: 5, note: 'Chickens hatch back faster' },
    { id: 'wolfDelay',   tier: 5, max: 5, note: 'Wolves hold off at wave start' },
    { id: 'farm',        tier: 5, max: 5, note: 'Unlocks crop plots that pay out' },
    { id: 'doubleBarrel', tier: 5, max: 5, note: 'Two shells — right-click fires both' },
    { id: 'machineGun',  tier: 5, max: 5, note: 'Auto-fire with a real magazine' },
    { id: 'coldShot',    tier: 5, max: 5, note: 'Pellets may freeze a wolf solid' },
    { id: 'hotShot',     tier: 5, max: 5, note: 'Pellets may set a wolf ablaze' },
    { id: 'reloadMove',  tier: 5, max: 5, note: 'Reload while running' },
    { id: 'counter',     tier: 5, max: 5, note: 'Chance to melee a biting wolf' },

    // ----- Wave 15 -----
    { id: 'sprint',     tier: 15, max: 5, note: 'Faster sprint, trample at max' },
    { id: 'softBullet', tier: 15, max: 5, note: 'Pellets may spare your chickens' },
    { id: 'hardBullet', tier: 15, max: 5, note: 'Pellets hit noticeably harder' },
    { id: 'rust',       tier: 15, max: 5, note: 'More jams — then a jam-proof golden gun' },
    { id: 'spinReload', tier: 15, max: 5, note: 'Reload sometimes becomes an instant twirl' },
    { id: 'snatch',     tier: 15, max: 5, note: 'Fed wolves carry the kill away, slowed' },
    { id: 'fatChicken', tier: 15, max: 5, note: 'Fat chickens — slower, worth more' },
    { id: 'dog',        tier: 15, max: 4, note: 'Adopt and train a guard-dog pack' },
    { id: 'stoneWall',  tier: 15, max: 5, links: ['woodFence'], note: 'Unlocks stone walls (2 HP)' },

    // ----- Wave 25 -----
    { id: 'crazyTrigger', tier: 25, max: 5, links: ['fireRate'], note: 'Narrow bar, fat critical line' },
    { id: 'calmWaves',    tier: 25, max: 5, note: 'Fewer wolves, smaller payout' },
    { id: 'roughWaves',   tier: 25, max: 5, note: 'More wolves, bigger payout' },
    { id: 'rocket',       tier: 25, max: 5, links: ['doubleBarrel', 'machineGun'], note: 'Pellets explode on hit',
      needs: () => upgradeLevels.machineGun > 0 || upgradeLevels.doubleBarrel > 0 },
    { id: 'minigun',      tier: 25, max: 5, links: ['doubleBarrel', 'machineGun'], note: 'Huge mag, spins up at max',
      needs: () => upgradeLevels.machineGun > 0 || upgradeLevels.doubleBarrel > 0 },
    { id: 'workerChicken', tier: 25, max: 5, links: ['hatchRate'], note: 'Hardhat chickens rebuild your fences' },
    { id: 'richChicken',  tier: 25, max: 5, links: ['hatchRate'], note: 'Top-hat chickens pay extra each wave' },
    { id: 'dummy',        tier: 25, max: 5, note: 'Scarecrows pull wolves off your flock' },
    { id: 'statue',       tier: 25, max: 5, note: 'Tanky decoy statues wolves learn to ignore' },

    // ----- Wave 40 -----
    { id: 'mine',        tier: 40, max: 5, note: 'Buried bombs — anyone can set them off' },
    { id: 'sabotage',    tier: 40, max: 5, note: 'Wolves hatch defective, some turn traitor' },
    { id: 'sizeMatters', tier: 40, max: 5, links: ['range'], note: 'Double barrel growth, much longer shots',
      needs: () => upgradeLevels.range > 0 },
    { id: 'rocketBoots', tier: 40, max: 5, links: ['sprint'], note: 'Sprint can launch you into flight' },
    { id: 'lastStand',   tier: 40, max: 5, links: ['sprint'], note: 'Stand still to crouch up damage and rate' },
    { id: 'homing',      tier: 40, max: 5, note: 'Slow pellets that chase the nearest wolf' },
    { id: 'laser',       tier: 40, max: 5, note: 'Shots become an instant piercing beam' },
    { id: 'cryptidRadar', tier: 40, max: 5, note: 'Coop antennas pull in rare wolf variants' },
    { id: 'rooftopper',  tier: 40, max: 5, note: 'Station snipers on your coop roofs',
      needs: () => coops.length > 0 },
    { id: 'hatPack',     tier: 40, max: 1, supply: true, links: ['buyHat'], note: 'Three hats at once, rare colours',
      held: () => hatPackPrice > 100 ? playerHats + ' hats' : null },
    { id: 'advancedOil', tier: 40, max: 1, supply: true, links: ['weaponOil'], note: 'Premium one-round oil',
      held: () => !advancedOilBought ? null
                : advancedOilWaves > 0 ? 'active this round' : 'used up' },

    // ----- Wave 51 (endless) -----
    { id: 'goldenChicken', tier: 51, max: 1, links: ['statue'], note: 'Plate every statue in solid gold',
      needs: () => upgradeLevels.statue >= 5 },
    { id: 'hunterCaravan', tier: 51, max: 1, links: ['hunters'], group: 'hunters',
      note: 'Field up to three hunter camps (wave 51+)',
      needs: () => everReachedHunterGold },
    { id: 'bribeWolves',   tier: 51, max: 1, supply: true, note: 'Pay the pack off for one lighter wave',
      held: () => bribePrice > 300 ? 'next costs $' + bribePrice : null },
    { id: 'metaverse',     tier: 51, max: 1, note: 'Dissolves every either/or lock — buy both sides' },
    // Only ever offered on the bonus (third) pick, so the note says so — the
    // tree is where a player goes to work out why they've never seen a card.
    { id: 'scroll',        tier: 51, max: 1, supply: true,
      note: 'Farm lore, one scroll at a time — bonus pick only',
      held: () => hintsRead.size ? hintsRead.size + '/' + GAME_HINTS.length + ' read' : null },
  ];
  const SKILL_TREE_BY_ID = (() => {
    const m = Object.create(null);
    for (const n of SKILL_TREE) m[n.id] = n;
    return m;
  })();
  // Rows that aren't wave tiers — they hang off a condition instead, so they
  // render after the numeric tiers with their own heading.
  const SKILL_GROUPS = [
    { key: 'hunters', label: 'Hunter Camp' },
  ];
  // Human-readable tier labels, in display order. Grouped nodes are pulled out
  // of the wave tiers so they only appear in their own row.
  const SKILL_TIERS = [...new Set(SKILL_TREE.filter(n => !n.group).map(n => n.tier))].sort((a, b) => a - b);
  // Total upgrade LEVELS the tree can hold (consumables don't count — they're
  // repeatable buys, not progression).
  const SKILL_TREE_TOTAL = SKILL_TREE.reduce((sum, n) => sum + (n.supply ? 0 : n.max), 0);

  // Titles come from the live pool so the tree never drifts from the cards.
  // Built once and cached — getUpgradePool() allocates the whole pool on every
  // call, and the tree asks for ~55 titles per open.
  let _skillTitleCache = null;
  function skillTitle(id) {
    // Dog Friend's pool title changes with the generation ("Dog Friend II",
    // "Retire the pack", …) — the tree wants the stable line name.
    if (id === 'dog') return 'Dog Friend';
    if (!_skillTitleCache) {
      _skillTitleCache = Object.create(null);
      for (const o of getUpgradePool()) _skillTitleCache[o.id] = o.title;
    }
    return _skillTitleCache[id] || id;
  }
  // Levels the player currently holds across the whole tree.
  function skillTreeOwnedLevels() {
    let owned = 0;
    for (const n of SKILL_TREE) {
      if (n.supply) continue;
      owned += Math.min(n.max, upgradeLevels[n.id] || 0);
    }
    return owned;
  }
  // The wave the tree should judge against. `wave` is 0 in the title menu (no
  // run yet) — reading it literally would grey out even the from-the-start
  // upgrades, so a not-yet-started run counts as wave 1.
  function skillTreeWave() { return Math.max(1, wave || 0); }
  // One of: over | maxed | owned | open | pairlocked | blocked | locked.
  //   over       — past its cap (Longer Barrel only); further picks are cosmetic
  //   pairlocked — the other half of an either/or the player already committed
  //                to; permanent unless the Metaverse dissolves the locks
  //   locked     — the wave gate hasn't been reached yet
  //   blocked    — reachable wave-wise, but a prerequisite isn't met
  function skillNodeState(node) {
    const lvl = upgradeLevels[node.id] || 0;
    if (node.overflow && lvl >= node.max) return 'over';
    if (lvl >= node.max && !node.supply) return 'maxed';
    const pair = PAIRED_WITH[node.id];
    if (pair && lvl === 0 && !metaverseOn() && (upgradeLevels[pair] || 0) > 0) {
      // Only call it out once the tier is actually reachable — before that
      // it's still just an unreached tier and mustn't be revealed.
      return skillTreeWave() >= node.tier ? 'pairlocked' : 'locked';
    }
    if (skillTreeWave() < node.tier) return lvl > 0 ? 'owned' : 'locked';
    if (node.needs && !node.needs()) return lvl > 0 ? 'owned' : 'blocked';
    return lvl > 0 ? 'owned' : 'open';
  }

  // ---------- "New upgrades unlocked" notice ----------
  // A banner that heads the player up one wave BEFORE a tier opens, then
  // announces it when it lands. Driven off the local `wave` value changing
  // rather than startWave() so the guest gets it too (its wave arrives in the
  // host's snapshot and never runs startWave locally).
  let unlockNoticeT = 0;        // seconds of banner left
  let unlockNoticeTitle = '';
  let unlockNoticeSub = '';
  let unlockNoticeAhead = false; // true = "next wave" heads-up, false = "unlocked"
  let unlockNoticeSeenWave = -1; // last wave the tier check ran for
  const UNLOCK_NOTICE_DUR = 5.0;

  function upgradesUnlockingAt(fromWaveExclusive, toWaveInclusive) {
    return SKILL_TREE.filter(n =>
      n.tier > 1 && n.tier > fromWaveExclusive && n.tier <= toWaveInclusive);
  }

  function tickUnlockNotice(dt) {
    const w = wave || 0;
    if (w !== unlockNoticeSeenWave) {
      const prev = unlockNoticeSeenWave;
      unlockNoticeSeenWave = w;
      // A restart (or the menu demo) rewinds the wave — resync silently.
      if (!gameStarted || w <= 0 || prev < 0 || w < prev) {
        unlockNoticeT = 0;
        return;
      }
      // Everything that opened up between the last wave we looked at and now
      // (a debug multi-wave skip can cross more than one tier at once).
      // No names and no count: announcing WHAT unlocked spoils the pool the
      // upgrade screen is about to offer, and the count was just noise. There
      // is deliberately no "next wave will unlock…" heads-up any more either.
      const landed = upgradesUnlockingAt(prev, w);
      if (landed.length) {
        unlockNoticeAhead = false;
        unlockNoticeTitle = 'NEW UPGRADES UNLOCKED';
        unlockNoticeSub = 'Check the upgrade tree when you pause';
        unlockNoticeT = UNLOCK_NOTICE_DUR;
        playUnlockChime();
      }
      return;
    }
    if (unlockNoticeT > 0 && !paused && !upgradeMode) {
      unlockNoticeT = Math.max(0, unlockNoticeT - dt);
    }
  }

  function drawUnlockNotice() {
    if (unlockNoticeT <= 0 || !unlockNoticeTitle) return;
    // Fade in over the first 0.25s, out over the last 0.6s.
    const inA  = Math.min(1, (UNLOCK_NOTICE_DUR - unlockNoticeT) / 0.25);
    const outA = Math.min(1, unlockNoticeT / 0.6);
    const alpha = Math.min(inA, outA);
    if (alpha <= 0) return;

    const accent = unlockNoticeAhead ? '#7fd0ff' : '#ffd166';

    ctx.save();
    if (document.body.classList.contains('pixelate-all')) ctx.filter = 'url(#pixelate)';
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    let boxW = ctx.measureText(unlockNoticeTitle).width;
    ctx.font = '11px "Lucida Console", Consolas, monospace';
    boxW = Math.max(boxW, ctx.measureText(unlockNoticeSub).width);
    boxW = Math.min(W - 24, Math.max(190, boxW + 28));
    const boxH = 44;
    const bx = Math.round((W - boxW) / 2);
    // Sits below the #toast / #buildhint strip (both are fixed at top:12px in
    // CSS pixels) so a wave-start toast and this banner don't stack on top of
    // each other. Slides down into place as it fades in.
    const by = Math.round(44 + (1 - inA) * -8);

    ctx.fillStyle = 'rgba(15, 18, 24, 0.94)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, boxW - 2, boxH - 2);

    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    ctx.fillText(unlockNoticeTitle, bx + boxW / 2, by + 19);

    ctx.fillStyle = '#9aa0a8';
    ctx.font = '11px "Lucida Console", Consolas, monospace';
    ctx.fillText(unlockNoticeSub, bx + boxW / 2, by + 34);
    ctx.restore();
  }

  function pickDistinct(pool, n, cashFn, levels) {
    cashFn = cashFn || makeCashOption;
    const seen = new Set();
    const out = [];
    for (const o of pool) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      out.push(o);
      if (out.length >= n) break;
    }
    if (out.length < n) out.push(cashFn()); // one Pocket Money filler
    // Still short? Pad the remaining slots with the chicken easter egg so the
    // grid is always full — an undefined option in a card slot used to crash
    // the upgrade screen (toast fired but the screen never left).
    while (out.length < n) out.push(makeChickenOption());
    // Don't railroad a broke player into a permanent lock: if two or more of
    // the picks cost money, none of the remaining (free) picks may be a
    // mutually-exclusive lock-out — otherwise a player with no cash is forced
    // to take it. Swap any such lock for a safe free option from the pool, or
    // Pocket Money (which never locks anything) as a last resort.
    const costsMoney = o => !!o.affordable;
    if (out.filter(costsMoney).length >= 2) {
      for (let i = 0; i < out.length; i++) {
        if (costsMoney(out[i]) || !optionLocksOut(out[i], levels)) continue;
        const repl = pool.find(o => !seen.has(o.id) && !costsMoney(o) && !optionLocksOut(o, levels));
        if (repl) { seen.add(repl.id); out[i] = repl; }
        else out[i] = cashFn(); // free filler — never forces a lock
      }
    }
    return out;
  }

  // Helper — builds a fresh batch of 3 upgrade options for the host's keeper,
  // applying the same filters startUpgradePhase uses. Reused by the bonus
  // pick screen so a second roll uses the same pool minus already-picked
  // options that may now be unavailable.
  // Down to the last hat (one hit from death) — nudge the hat lifelines toward
  // the front of the already-shuffled pool so they're a bit more likely to be
  // offered. Buy Hat is bumped after Hat Pack so it lands ahead of it.
  function biasLowHatPicks(pool) {
    if (playerHats > 1) return;
    const bump = (id, chance) => {
      if (Math.random() >= chance) return;
      const idx = pool.findIndex(o => o.id === id);
      if (idx > 0) { const o = pool.splice(idx, 1)[0]; pool.unshift(o); }
    };
    bump('hatPack', 0.4);
    bump('buyHat', 0.6);
  }

  function buildUpgradePicks(favorId, favorChance = 0.75) {
    const availableUpgrades = shuffle(getUpgradePool().filter(option => {
      if (upgradeLevels.sword >= 1 && GUN_UPGRADES.has(option.id)) return false;
      return !option.available || option.available();
    }));
    biasLowHatPicks(availableUpgrades);
    // Small bias: slightly increase the chance Longer Barrel ('range') appears
    // by duplicating its entry once in the temporary pool. This modestly raises
    // its selection probability without changing its apply logic.
    const rangeIdx = availableUpgrades.findIndex(o => o.id === 'range');
    if (rangeIdx >= 0) availableUpgrades.push(availableUpgrades[rangeIdx]);
    const resIdx = availableUpgrades.findIndex(o => o.id === 'resurrect');
    if (resIdx > 0) {
      const r = availableUpgrades.splice(resIdx, 1)[0];
      availableUpgrades.unshift(r);
    }
    const picks = pickDistinct(availableUpgrades, 3);
    // Bonus round bias: most of the time, guarantee Pocket Money is one of
    // the three picks if it didn't already roll in.
    if (favorId === 'cash' && !picks.some(o => o.id === 'cash') && Math.random() < favorChance) {
      picks[Math.floor(Math.random() * picks.length)] = makeCashOption();
    }
    return picks;
  }

  // Probability of the second bonus pick screen showing up after the regular
  // pick. 100% with no dead chickens, halving with each death:
  // 0→100, 1→50, 2→25, 3→12, 4→6, 5→3, 6+→0.
  function bonusUpgradeChance(deaths) {
    if (deaths <= 0) return 1.0;
    if (deaths >= 6) return 0;
    const table = [1.0, 0.50, 0.25, 0.12, 0.06, 0.03];
    return table[deaths] || 0;
  }

  // Total chicken deaths this wave: starting roster + births − survivors.
  function chickensDiedThisWave() {
    let alive = 0;
    for (const c of chickens) if (c.alive) alive++;
    return Math.max(0, chickensAtWaveStart + chickensBornThisWave - alive);
  }

  function startUpgradePhase() {
    buildMode = false;
    paused = false; // can't be paused and in upgrade mode simultaneously
    // Apply any deferred map growth now — hidden behind the upgrade overlay.
    if (pendingMapExpansions > 0) {
      while (pendingMapExpansions > 0) { expandMap(); pendingMapExpansions--; }
      playWoodChop(); // the old tree ring was felled to make room
      toast('The land has expanded!', 2);
    }
    upgradeMode = true;
    // A ghost keeper skips their own pick — they have no gun to upgrade. The
    // alive buddy picks normally (and can still pick Resurrect from the
    // host's pool to bring the ghost back).
    upgradePicked = !!player.ghost;
    if (upgradePicked) {
      upgradeOptions = [];
    } else {
      const availableUpgrades = shuffle(getUpgradePool().filter(option => {
        // Once Wolf's Blade is taken, gun/reload upgrades stop being offered.
        if (upgradeLevels.sword >= 1 && GUN_UPGRADES.has(option.id)) return false;
        return !option.available || option.available();
      }));
      // Slightly bias host pool towards Longer Barrel so players see it more.
      const rIdx = availableUpgrades.findIndex(o => o.id === 'range');
      if (rIdx >= 0) availableUpgrades.push(availableUpgrades[rIdx]);
      biasLowHatPicks(availableUpgrades); // last-hat lifeline nudge
      // If a resurrection is in reach, always surface it — pull it to the front.
      const resIdx = availableUpgrades.findIndex(o => o.id === 'resurrect');
      if (resIdx > 0) {
        const r = availableUpgrades.splice(resIdx, 1)[0];
        availableUpgrades.unshift(r);
      }
      upgradeOptions = pickDistinct(availableUpgrades, 3);
    }
    // Individual-upgrades mode: also generate a parallel pool for player2.
    if (multiplayer && isHost && gameOpts.individualUpgrades) {
      upgradePicked2 = !!player2.ghost; // dead buddy skips their pick too
      if (upgradePicked2) {
        upgradeOptions2 = [];
      } else {
        upgradeOptions2 = buildP2UpgradePicks();
      }
    } else {
      // Otherwise the buddy just spectates the host's pick.
      upgradeOptions2 = [];
      upgradePicked2 = true;
    }
    // If everyone is already done (e.g. host ghost in shared mode with no
    // buddy pick), close the phase straight away.
    maybeFinishUpgradePhase();
  }

  // P2's three options for the individual-upgrades picker — same filtering,
  // Longer-Barrel bias and Resurrect-surfacing as the host pool, read against
  // P2's own ladder. Shared by the wave-start screen and the second pick.
  function buildP2UpgradePicks() {
    const p2Avail = shuffle(getP2UpgradePool().filter(option => {
      // Same sword-locks-out-the-gun rule as the host pool.
      if (upgradeLevels2.sword >= 1 && GUN_UPGRADES.has(option.id)) return false;
      return !option.available || option.available();
    }));
    const r2 = p2Avail.findIndex(o => o.id === 'range');
    if (r2 >= 0) p2Avail.push(p2Avail[r2]);
    const resIdx = p2Avail.findIndex(o => o.id === 'resurrect');
    if (resIdx > 0) {
      const r = p2Avail.splice(resIdx, 1)[0];
      p2Avail.unshift(r);
    }
    return pickDistinct(p2Avail, 3, makeP2CashOption, upgradeLevels2);
  }

  function finishUpgradePhase() {
    upgradeMode = false;
    upgradeOptions = [];
    upgradeOptions2 = [];
    upgradePicked2 = false;
    waveTimer = 6;
    postUpgradeLockT = 1.0; // brief input lock so a fast pick-click doesn't carry into a shot
  }
  // Personal-to-P2 versions of the gun/movement upgrades — their apply()
  // pokes upgradeLevels2 (player2's ladder) instead of the shared
  // upgradeLevels. Used to swap entries in P2's pool below.
  function makeP2PersonalOptions() {
    const l = upgradeLevels2;
    return {
      jam: { id: 'jam', title: 'Better Springs', available: () => l.jam < MAX_LEVEL,
        desc: () => 'Jam chance → ' + Math.round(SKILL_TABLES.jam[Math.min(l.jam+1, MAX_LEVEL)] * 100) + '%',
        apply: () => { l.jam++; } },
      range: { id: 'range', title: 'Longer Barrel',
        available: () => l.range < MAX_LEVEL || Math.random() < 0.35,
        desc: () => l.range >= MAX_LEVEL ? 'Range maxed — barrel just gets longer'
                                          : 'Shotgun range → ' + SKILL_TABLES.range[Math.min(l.range+1, MAX_LEVEL)].toFixed(2) + 's',
        apply: () => { l.range++; } },
      speed: { id: 'speed', title: 'Fast Boots', available: () => l.speed < MAX_LEVEL,
        desc: () => 'Move speed → ' + SKILL_TABLES.speed[Math.min(l.speed+1, MAX_LEVEL)].toFixed(1),
        apply: () => { l.speed++; player2.speed = SKILL_TABLES.speed[Math.min(l.speed, MAX_LEVEL)]; } },
      fireRate: { id: 'fireRate', title: 'Trigger Work', available: () => l.fireRate < MAX_LEVEL,
        desc: () => 'Shot cooldown → ' + SKILL_TABLES.fireRate[Math.min(l.fireRate+1, MAX_LEVEL)].toFixed(2) + 's, reload pin ' + Math.round((l.fireRate + 1) * TRIGGER_WORK_PIN_SLOW * 100) + '% slower',
        apply: () => { l.fireRate++; } },
      spreadUp: { id: 'spreadUp', title: 'Loose Pattern',
        available: () => (l.spreadDown === 0 || metaverseOn()) && l.spreadUp < MAX_LEVEL,
        desc: () => 'Spread → ' + LOOSE_SPREAD[Math.min(l.spreadUp+1, MAX_LEVEL)] + '°, ' + LOOSE_BULLETS[Math.min(l.spreadUp+1, MAX_LEVEL)] + ' pellets',
        apply: () => { l.spreadUp++; } },
      spreadDown: { id: 'spreadDown', title: 'Tighter Pattern',
        available: () => (l.spreadUp === 0 || metaverseOn()) && l.spreadDown < MAX_LEVEL,
        desc: () => l.spreadDown+1 >= MAX_LEVEL ? 'MAX: slug, pierces 10 wolves' : 'Spread → ' + TIGHT_SPREAD[Math.min(l.spreadDown+1, MAX_LEVEL)] + '°',
        apply: () => { l.spreadDown++; } },
      crazyTrigger: { id: 'crazyTrigger', title: 'Extreme Reload',
        available: () => wave >= 25 && l.crazyTrigger < 5,
        desc: () => 'Narrows bar/green, widens critical line',
        apply: () => { l.crazyTrigger++; } },
      doubleBarrel: { id: 'doubleBarrel', title: 'Double-Barrel',
        available: () => wave >= 5 && (l.machineGun === 0 || metaverseOn()) && l.doubleBarrel < 5,
        desc: () => l.doubleBarrel === 0 ? '2-shell mag: left = one barrel, right = both' : 'Damage ×' + SKILL_TABLES.doubleBarrel[Math.min(l.doubleBarrel+1, 5)].toFixed(2),
        apply: () => { l.doubleBarrel++; } },
      machineGun: { id: 'machineGun', title: 'Machine-Gun',
        available: () => wave >= 5 && (l.doubleBarrel === 0 || metaverseOn()) && l.machineGun < 5,
        desc: () => l.machineGun === 0 ? 'Auto-fire (starts slow), ' + MG_MAG + '-round mag' : 'Faster fire rate (mag stays ' + MG_MAG + ')',
        apply: () => { l.machineGun++; player2.ammo = mgMagSize(player2); } },
      reloadMove: { id: 'reloadMove', title: 'Action Reload',
        available: () => wave >= 5 && l.reloadMove < MAX_LEVEL,
        desc: () => 'Moving reload: pin ' + reloadRunMul(l.reloadMove + 1).toFixed(2) + '× speed',
        apply: () => { l.reloadMove++; } },
      counter: { id: 'counter', title: 'Melee Strike',
        available: () => wave >= 5 && l.counter < 5,
        desc: () => l.counter >= 4 ? 'MAX: 50% melee + area damage'
                                   : 'Melee chance → ' + Math.round(SKILL_TABLES.counter[Math.min(l.counter+1, 5)] * 100) + '%',
        apply: () => { l.counter++; } },
      sprint: { id: 'sprint', title: 'Stampede', available: () => wave >= 15 && l.sprint < 5,
        desc: () => '+' + Math.round(SKILL_TABLES.sprint[Math.min(l.sprint+1, 5)] * 100) + '% sprint',
        apply: () => { l.sprint++; } },
      softBullet: { id: 'softBullet', title: 'Soft Bullets',
        available: () => wave >= 15 && (l.hardBullet === 0 || metaverseOn()) && l.softBullet < 5,
        desc: () => 'Spare chicken → ' + Math.round(SKILL_TABLES.softBullet[Math.min(l.softBullet+1, 5)] * 100) + '%',
        apply: () => { l.softBullet++; } },
      hardBullet: { id: 'hardBullet', title: 'Hard Bullets',
        available: () => wave >= 15 && (l.softBullet === 0 || metaverseOn()) && l.hardBullet < 5,
        desc: () => 'Pellet damage +' + Math.round((SKILL_TABLES.hardBullet[Math.min(l.hardBullet+1, 5)] - 1) * 100) + '%',
        apply: () => { l.hardBullet++; } },
      rust: { id: 'rust', title: 'Rusty Springs',
        available: () => wave >= 15 && l.rust < 5 && (l.rust < 4 || moneyOf(player2) >= RUST_MAX_COST),
        desc: () => l.rust >= 4 ? 'MAX ($' + RUST_MAX_COST + '): no jams — crits pay $1 each' : 'Jam +' + Math.round(SKILL_TABLES.rust[Math.min(l.rust+1, 5)] * 100) + '%, rusts gun',
        apply: () => { if (l.rust === 4) spendMoney(player2, RUST_MAX_COST); l.rust++; } },
      spinReload: { id: 'spinReload', title: 'Quickdraw', available: () => wave >= 15 && l.spinReload < 5,
        desc: () => Math.round(SKILL_TABLES.spinReload[Math.min(l.spinReload+1, 5)] * 100) + '% twirl reload',
        apply: () => { l.spinReload++; } },
      rocket: { id: 'rocket', title: 'Rocket Launcher',
        available: () => wave >= 25 && (l.machineGun > 0 || l.doubleBarrel > 0) && (l.minigun === 0 || metaverseOn()) && l.rocket < 5,
        desc: () => {
          const nxt = SKILL_TABLES.rocket[Math.min(l.rocket + 1, 5)];
          return l.rocket >= 4
            ? 'MAX: ' + Math.round(nxt * 100) + '% boom on hit — right click = guaranteed'
            : 'Boom-on-hit chance → ' + Math.round(nxt * 100) + '%';
        },
        apply: () => { l.rocket++; } },
      coldShot: { id: 'coldShot', title: 'Cold Shot',
        available: () => wave >= 5 && (l.hotShot === 0 || metaverseOn()) && l.coldShot < 5,
        desc: () => Math.round(COLD_HOT_CHANCE[Math.min(5, l.coldShot + 1)] * 100) + '% chance to freeze a hit wolf (slow + blue)',
        apply: () => { l.coldShot++; } },
      hotShot: { id: 'hotShot', title: 'Hot Shot',
        available: () => wave >= 5 && (l.coldShot === 0 || metaverseOn()) && l.hotShot < 5,
        desc: () => Math.round(COLD_HOT_CHANCE[Math.min(5, l.hotShot + 1)] * 100) + '% chance to set a hit wolf ablaze (burns over time)',
        apply: () => { l.hotShot++; } },
      minigun: { id: 'minigun', title: 'Minigun',
        available: () => wave >= 25 && (l.machineGun > 0 || l.doubleBarrel > 0) && (l.rocket === 0 || metaverseOn()) && l.minigun < 5,
        desc: () => l.minigun >= 4
            ? 'MAX: +' + MINIGUN_MAG_PER_LVL + ' mag — and it spins up: hold fire to shoot faster'
            : '+' + MINIGUN_MAG_PER_LVL + ' magazine size',
        apply: () => {
          l.minigun++;
          if (l.machineGun > 0) player2.ammo = mgMagSize(player2);
          else { player2.shells = shotgunMagP2(); player2.chambered = true; }
          player2.reloadT = 0;
        } },
      sabotage: { id: 'sabotage', title: 'Sabotage',
        available: () => wave >= MINE_UNLOCK_WAVE && l.sabotage < 5,
        desc: () => {
          const nxt = SABOTAGE_DEFECT_CHANCE[Math.min(l.sabotage + 1, 5)];
          return l.sabotage >= 4
            ? 'MAX: ' + Math.round(nxt * 100) + '% defective — some turn turncoat'
            : 'Wolves hatch defective → ' + Math.round(nxt * 100) + '% chance';
        },
        apply: () => { l.sabotage++; } },
      sizeMatters: { id: 'sizeMatters', title: 'Size Matters',
        available: () => wave >= MINE_UNLOCK_WAVE && l.range > 0 && l.sizeMatters < 5,
        desc: () => l.sizeMatters >= 4
          ? 'MAX: ~10s shots + huge laser reach — ricochet off the map edge'
          : '×2 Longer-Barrel growth + longer-lived shots (lasers reach further)',
        apply: () => { l.sizeMatters++; } },
      rocketBoots: { id: 'rocketBoots', title: 'Rocket Boots',
        available: () => wave >= MINE_UNLOCK_WAVE && (l.lastStand === 0 || metaverseOn()) && l.rocketBoots < 5,
        desc: () => l.rocketBoots >= 4
          ? 'MAX: ' + ROCKET_BOOTS_DURATION[5].toFixed(1) + 's flight, trample under jets'
          : 'Lift-off + ' + ROCKET_BOOTS_TRAMPLE[Math.min(l.rocketBoots + 1, 5)].toFixed(1) + ' dmg/s trample',
        apply: () => { l.rocketBoots++; } },
      lastStand: { id: 'lastStand', title: 'Last Stand',
        available: () => wave >= MINE_UNLOCK_WAVE && (l.rocketBoots === 0 || metaverseOn()) && l.lastStand < 5,
        desc: () => l.lastStand >= 4
          ? 'MAX: ×' + LAST_STAND_DMG_MUL[5].toFixed(1) + ' dmg, ×' + (1 / LAST_STAND_FIRE_MUL[5]).toFixed(1) + ' rate — cloak'
          : 'Crouch buff → ×' + LAST_STAND_DMG_MUL[Math.min(l.lastStand + 1, 5)].toFixed(2) + ' dmg, faster fire',
        apply: () => { l.lastStand++; } },
      homing: { id: 'homing', title: 'Homing Shots',
        available: () => wave >= MINE_UNLOCK_WAVE && (l.laser === 0 || metaverseOn()) && l.homing < 5,
        desc: () => l.homing >= 4
          ? 'MAX: slow pellets that hunt wolves — sharpest turn + longest seek'
          : 'Auto-seek slow pellets — sharper turn + longer seek range',
        apply: () => { l.homing++; } },
      laser: { id: 'laser', title: 'Laser Shots',
        available: () => wave >= MINE_UNLOCK_WAVE && (l.homing === 0 || metaverseOn()) && l.laser < 5,
        desc: () => l.laser >= 4
          ? 'MAX: ' + LASER_DMG[5] + ' dmg, ' + LASER_RANGE[5].toFixed(1) + ' tile beam'
          : 'Beam → ' + LASER_DMG[Math.min(l.laser + 1, 5)] + ' dmg, ' + LASER_RANGE[Math.min(l.laser + 1, 5)].toFixed(1) + ' tile range',
        apply: () => { l.laser++; } },
      cryptidRadar: { id: 'cryptidRadar', title: 'Cryptid Radar',
        available: () => wave >= MINE_UNLOCK_WAVE && l.cryptidRadar < 5,
        desc: () => { const nxt = l.cryptidRadar + 1; return nxt >= 5 ? 'MAX: rare-wolf chance ×2, full-map range' : 'Longer radar range → ' + CRYPTID_RADAR_RANGE[nxt] + ' tiles'; },
        apply: () => { l.cryptidRadar++; } },
      rooftopper: { id: 'rooftopper', title: 'Rooftoppers',
        available: () => wave >= MINE_UNLOCK_WAVE && l.rooftopper < coops.length && l.rooftopper < 5,
        desc: () => (l.rooftopper + 1) + ' snipers on coops — heavier on taller coops',
        apply: () => { if (l.rooftopper < coops.length) { l.rooftopper++; assignRooftoppers(); } } },
      sword: { id: 'sword', title: "Wolf's Blade",
        // Debug-only — never offered to player 2 in normal play either.
        available: () => false,
        desc: () => 'Trade your gun for a sword — clicks swing for huge damage',
        apply: () => { l.sword = 1; } },
      // Buy Hat is "personal" — adds to YOUR hat stack. P2's version pays
      // from P2's wallet and bumps player2.hats. Hat colour for P2 stays
      // the role-default (drawPlayer2's fallback) since the guest doesn't
      // get the rare green-hat roll.
      buyHat: { id: 'buyHat', title: 'Buy Hat',
        available: () => (player2.hats || 0) < MAX_HATS,
        affordable: () => moneyOf(player2) >= hatPrice,
        desc: () => 'Spend $' + hatPrice + ' → +1 hat (now ' + (player2.hats || 0) + ')',
        apply: () => {
          spendMoney(player2, hatPrice);
          hatPrice += 5;
          hatsBought++;
          player2.hats = (player2.hats || 0) + 1;
        } },
      weaponOil: { id: 'weaponOil', title: 'Weapon Oil',
        available: () => (l.rust === 0 || l.rust >= 5) && weaponOilCharges === 0,
        affordable: () => moneyOf(player2) >= weaponOilCostFromMoney(moneyOf(player2)),
        desc: () => {
          const price = weaponOilCostFromMoney(moneyOf(player2));
          return 'Spend $' + price + ' → wider reload band +10% shot speed, ' + WEAPON_OIL_WAVES + ' waves';
        },
        apply: () => {
          if (weaponOilCharges > 0) return;
          const price = weaponOilCostFromMoney(moneyOf(player2));
          if (moneyOf(player2) < price) return;
          spendMoney(player2, price);
          weaponOilCharges = 1;
          weaponOilWaves = WEAPON_OIL_WAVES; // refresh the lifetime on every buy
          recomputeJamChance();
        } },
    };
  }
  // P2's full pool: every option the host can see, with personal entries
  // re-targeted to upgradeLevels2 and shared world entries (Cozy Coops,
  // Howl Delay, Dog Friend, Farm, Fences, Snatch, Fat Chickens, focus
  // bait/repellent, etc.) reused as-is — picking those bumps the single
  // shared ladder, not a separate copy, so they stay "shared, not stacked".
  function getP2UpgradePool() {
    const personal = makeP2PersonalOptions();
    // Nerd/Jock reloads are a local-keeper-only gag (their apply() pokes P1's
    // ladder and the mini-game only runs for the host keeper), so keep them out
    // of the guest's pool. Knowledge Scroll is out for the same reason: the
    // guest's pick is applied ON THE HOST, so its parchment would open on the
    // host's screen and the guest would spend a pick on nothing.
    return getUpgradePool()
      .filter(opt => opt.id !== 'nerdReload' && opt.id !== 'jockReload' && opt.id !== 'scroll')
      .map(opt => personal[opt.id] || opt);
  }
  function makeP2CashOption() {
    const r = Math.max(2, Math.floor(wave * 2 / 3));
    return {
      id: 'cash', title: 'Cash',
      desc: () => 'Pick up $' + r,
      apply: () => { addMoney(player2, r); },
    };
  }

  // Apply a picked upgrade once — or up to 5 stacked levels in Fast mode,
  // stopping at the upgrade's cap (available()) or when the wallet runs dry.
  function applyPickedUpgrade(option) {
    option.apply();
    if (!debugFastMode) return;
    for (let i = 1; i < 5; i++) {
      if (option.available && !option.available()) break;   // hit the level cap / a lock
      if (option.affordable && !option.affordable()) break; // out of money
      option.apply();
    }
  }

  function selectUpgrade(index) {
    if (multiplayer && !isHost) return; // host picks; guest only watches
    if (player.ghost) return; // ghosts sit out the upgrade phase
    if (!upgradeMode || upgradePicked) return;
    const option = upgradeOptions[index];
    if (!option) return;
    // Money-gated picks (hats, oils) are always shown, even when broke. Clicking
    // one you can't afford just buzzes — it doesn't consume your pick.
    if (option.affordable && !option.affordable()) { playCantBuy(); return; }
    const _hatPricePaid = option.id === 'buyHat' ? hatPrice : 0; // capture before apply() changes it
    applyPickedUpgrade(option);
    playCashRegister(); // ka-ching — every pick is a "purchase"
    upgradePicked = true;
    toast(option.id === 'cash' ? 'Picked up $10'
        : option.id === 'chicken' ? 'Bock bock bagawk!'
        // The scroll puts its own parchment up — a toast over the top of it
        // would just be the same beat twice.
        : option.id === 'scroll' ? 'You unroll the scroll…'
        : option.id === 'buyHat' ? ('Bought a hat!  -$' + _hatPricePaid)
        : option.id === 'dog' ? (
            upgradeLevels.dog === 0 ? 'The dogs retire — they head home'
            : upgradeLevels.dog === 1 ? (dogGen + (dogGen === 1 ? ' dog joins you!' : ' dogs join you!'))
            : 'Dog pack trained')
        : option.title + ' upgraded');
    // Second guaranteed pick — every wave hands out two upgrades now that the
    // run is squashed to 50 waves. Options are re-rolled so the fresh levels
    // from the first pick are reflected (and the same card can't be re-shown
    // at its old level).
    if (!extraPickUsedThisWave && !bonusUpgradeAvailable) {
      extraPickUsedThisWave = true;
      upgradePicked = false;
      upgradeOptions = buildUpgradePicks();
      toast('Pick one more!', 1.6);
      return;
    }
    // Bonus upgrade screen: rolls once per wave, before the phase closes.
    // Death-count probability table is in bonusUpgradeChance(). Ghost buddys
    // and individual-upgrade mode skip the bonus to keep the flow simple.
    // Reads the wave-end snapshot so any post-wave splicing of dead entities
    // can't accidentally flip a "deaths > 0" wave into a "deaths == 0" roll.
    if (!bonusUpgradeShownThisWave && !bonusUpgradeAvailable) {
      const deaths = bonusDeathSnapshot;
      const chance = bonusUpgradeChance(deaths);
      const forced = bonusUpgradeForce; // debug "give upgrade" guarantees the roll
      bonusUpgradeForce = false;
      if (forced || (chance > 0 && Math.random() < chance)) {
        bonusUpgradeShownThisWave = true;
        bonusUpgradeAvailable = true;
        upgradePicked = false;
        upgradeOptions = buildUpgradePicks('cash'); // bonus round favours Pocket Money
        playMoney(); // celebratory chime when the second screen pops
        toast(deaths === 0
          ? 'Flock survived intact — bonus pick!'
          : 'Bonus pick! (' + Math.round(chance * 100) + '% — ' + deaths + ' chicken' + (deaths > 1 ? 's' : '') + ' lost)', 2.4);
        return;
      }
    }
    maybeFinishUpgradePhase();
  }

  // Both players must have picked in individual-upgrades mode before the next
  // wave begins. In any other mode only the host's pick matters.
  function maybeFinishUpgradePhase() {
    const needP2 = multiplayer && isHost && gameOpts.individualUpgrades;
    if (!upgradePicked) return;
    if (needP2 && !upgradePicked2) return;
    upgradeMode = false;
    upgradeOptions = [];
    upgradeOptions2 = [];
    bonusUpgradeAvailable = false;
    waveTimer = 6;
    postUpgradeLockT = 1.0;
  }

  // Host-side handler: the guest forwarded its upgrade pick.
  function selectUpgradeP2OnHost(index) {
    if (!multiplayer || !isHost) return;
    if (!gameOpts.individualUpgrades) return;
    if (player2.ghost) return; // ghost sits out
    if (upgradePicked2) return;
    const option = upgradeOptions2[index];
    if (!option) return;
    if (option.affordable && !option.affordable()) { playCantBuy(); return; }
    applyPickedUpgrade(option); // Fast mode stacks 5 levels here too
    upgradePicked2 = true;
    toast('Buddy picked ' + option.title, 1.4);
    // The buddy gets the same second guaranteed pick the host gets. Fresh
    // options + picked=false ride the next snapshot, which reopens the
    // guest's picker (guestUpgradePicked is host-authoritative there).
    if (!extraPickUsedThisWave2) {
      extraPickUsedThisWave2 = true;
      upgradePicked2 = false;
      upgradeOptions2 = buildP2UpgradePicks();
      return;
    }
    maybeFinishUpgradePhase();
  }

  // Guest-side click on a P2 upgrade card.
  function selectUpgradeP2(index) {
    if (!multiplayer || isHost) return;
    if (!gameOpts.individualUpgrades) return;
    if (player.ghost) return; // ghost guest doesn't pick
    if (upgradePicked2) return;
    sendP2Input('upgrade', { index });
    upgradePicked2 = true; // optimistic — host's snapshot will confirm
  }
  function selectUpgradeP2At(x, y) {
    const rects = getUpgradeOptionRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        selectUpgradeP2(i);
        return true;
      }
    }
    return false;
  }

  function selectUpgradeAt(x, y) {
    const rects = getUpgradeOptionRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        selectUpgrade(i);
        return true;
      }
    }
    return false;
  }

  function getUpgradeOptionRects() {
    const gap    = 10;
    const margin = 16;
    // Card width scales down so 3 cards always fit any screen width.
    const panelW = Math.min(170, Math.floor((W - margin * 2 - gap * 2) / 3));
    const panelH = 106;
    const totalW = panelW * 3 + gap * 2;
    const startX = Math.round((W - totalW) / 2);
    const y = (H - panelH) / 2 + 26;
    return [0, 1, 2].map(i => ({ x: startX + i * (panelW + gap), y, w: panelW, h: panelH }));
  }

