  // ---------- Spawning ----------
  // Where the current building's ghost sits, and whether it can go there.
  // Finds a coop or fence sitting exactly on tile (x,y), or null. Refund values:
  // coop $10, stone fence $10, wood fence $0.
  function findBuildingAt(x, y) {
    for (let i = 0; i < coops.length; i++) {
      if (coops[i].x === x && coops[i].y === y) {
        return { array: coops, index: i, label: 'Coop', refund: 10 };
      }
    }
    for (let i = 0; i < fences.length; i++) {
      if (fences[i].x === x && fences[i].y === y) {
        const stone = fences[i].kind === 'stone';
        return { array: fences, index: i, label: stone ? 'Stone fence' : 'Fence', refund: stone ? 10 : 0 };
      }
    }
    for (let i = 0; i < farms.length; i++) {
      if (farms[i].x === x && farms[i].y === y) {
        return { array: farms, index: i, label: 'Farm', refund: 0 };
      }
    }
    for (let i = 0; i < dummies.length; i++) {
      if (dummies[i].x === x && dummies[i].y === y) {
        return { array: dummies, index: i, label: 'Scarecrow', refund: Math.floor(DUMMY_COST * 0.4) };
      }
    }
    for (let i = 0; i < statues.length; i++) {
      if (statues[i].x === x && statues[i].y === y) {
        return { array: statues, index: i, label: 'Chicken Statue', refund: Math.floor(STATUE_COST * 0.4) };
      }
    }
    for (let i = 0; i < mines.length; i++) {
      if (mines[i].x === x && mines[i].y === y) {
        // Mines refund 60% so disarming is a useful option, not a trap.
        return { array: mines, index: i, label: 'Explosive Mine', refund: Math.floor(mineCost() * 0.6) };
      }
    }
    // Debug DPS dummies live in wolves[] (stationary, integer-tile coords).
    for (let i = 0; i < wolves.length; i++) {
      if (wolves[i].dpsDummy && wolves[i].x === x && wolves[i].y === y) {
        return { array: wolves, index: i, label: 'DPS Dummy', refund: 0 };
      }
    }
    return null;
  }

  function getBuildTarget(builder) {
    builder = builder || player;
    // builder.buildType is kept in sync with the legacy `buildType` global
    // for player1 via syncP1Weapon, and is the authoritative source for P2.
    const type = BUILD_TYPES[builder.buildType || 0];
    const range = type === 'coop' ? COOP_PLACE_RANGE : 1.8;
    const x = Math.round(builder.x + Math.cos(builder.dir) * range);
    const y = Math.round(builder.y + Math.sin(builder.dir) * range);
    let valid = inBounds(x, y);
    let reason = valid ? '' : 'Out of bounds';
    if (type === 'remove') {
      const removeTarget = valid ? findBuildingAt(x, y) : null;
      if (valid && !removeTarget) { valid = false; reason = 'Nothing to remove here'; }
      return { x, y, type, valid, reason, removeTarget };
    }
    if (valid && type === 'coop') {
      for (const c of coops) {
        if (dist2(x, y, c.x, c.y) < 4) { valid = false; reason = 'Too close to another coop'; break; }
      }
      if (valid) for (const f of fences) {
        if (f.x === x && f.y === y) { valid = false; reason = 'A fence is here'; break; }
      }
      if (valid) for (const fm of farms) {
        if (fm.x === x && fm.y === y) { valid = false; reason = 'A farm is here'; break; }
      }
      if (valid) for (const m of mines) {
        if (m.x === x && m.y === y) { valid = false; reason = 'A mine is buried here'; break; }
      }
    } else if (valid && type === 'farm') {
      // Farms need the Farm upgrade and an empty tile.
      if (upgradeLevels.farm < 1) {
        valid = false;
        reason = 'Buy the Farm upgrade to unlock farms';
      } else if (findBuildingAt(x, y)) {
        valid = false;
        reason = 'Something is already here';
      }
    } else if (valid && (type === 'dummy' || type === 'statue')) {
      const isDummy = type === 'dummy';
      const lvl = isDummy ? upgradeLevels.dummy : upgradeLevels.statue;
      if (lvl < 1) {
        valid = false;
        reason = (isDummy ? 'Scarecrow' : 'Chicken Statue') + ' locked — upgrade it first';
      } else if (findBuildingAt(x, y)) {
        valid = false;
        reason = 'Something is already here';
      }
    } else if (valid && type === 'dpsdummy') {
      if (!debugUnlocked) {
        valid = false;
        reason = 'DPS dummy is a debug tool';
      } else if (findBuildingAt(x, y)) {
        valid = false;
        reason = 'Something is already here';
      }
    } else if (valid && type === 'mine') {
      if (upgradeLevels.mine < 1) {
        valid = false;
        reason = 'Explosive Mine locked — upgrade it first';
      } else if (findBuildingAt(x, y)) {
        valid = false;
        reason = 'Something is already here';
      } else {
        for (const m of mines) {
          if (m.x === x && m.y === y) { valid = false; reason = 'A mine is already buried here'; break; }
        }
      }
    } else if (valid) { // any fence type
      // Fences are locked until their upgrade is taken (wood / stone at wave 15).
      const fenceLvl = type === 'stonefence' ? upgradeLevels.stoneWall : upgradeLevels.woodFence;
      if (fenceLvl <= 0) {
        valid = false;
        reason = type === 'stonefence' ? 'Stone Wall locked — upgrade it first'
                                       : 'Wooden Fence locked — upgrade it first';
      }
      if (valid) for (const f of fences) {
        if (f.x === x && f.y === y) { valid = false; reason = 'A fence is already here'; break; }
      }
      if (valid) for (const c of coops) {
        if (c.x === x && c.y === y) { valid = false; reason = 'A coop is here'; break; }
      }
      if (valid) for (const fm of farms) {
        if (fm.x === x && fm.y === y) { valid = false; reason = 'A farm is here'; break; }
      }
      if (valid) for (const m of mines) {
        if (m.x === x && m.y === y) { valid = false; reason = 'A mine is buried here'; break; }
      }
      if (valid) for (const dm of dummies) {
        if (dm.x === x && dm.y === y) { valid = false; reason = 'A scarecrow is here'; break; }
      }
      if (valid) for (const st of statues) {
        if (st.x === x && st.y === y) { valid = false; reason = 'A statue is here'; break; }
      }
    }
    return { x, y, type, valid, reason };
  }

  // Every 10 coops placed, the world grows by one tile in every direction.
  // Hidden-wolf tell: the forest border is tall enough to completely cover a
  // wolf skulking behind it, so the trees in front of one rustle. Same
  // front-of-point geometry as isOccludedByBuilding, run per tree.
  const TREE_RUSTLE_T = 0.45; // seconds a tree keeps swaying after the wolf moves on
  function updateTreeRustle(dt) {
    for (const t of trees) if (t.rustleT > 0) t.rustleT -= dt;
    // Trees only exist in the border band, so only wolves out near the edge
    // can be behind one — skip the rest instead of testing every wolf × tree.
    const edge = HALF_MAP - 3;
    for (const w of wolves) {
      if (!w.alive) continue;
      if (Math.abs(w.x) < edge && Math.abs(w.y) < edge) continue;
      for (const t of trees) {
        const dv = (t.x + t.y) - (w.x + w.y);
        if (dv <= 0 || dv > 2.4) continue; // tree must sit in front of the wolf
        if (Math.abs((t.x - t.y) - (w.x - w.y)) > 1.35) continue;
        t.rustleT = TREE_RUSTLE_T;
      }
    }
  }

  function expandMap() {
    const oldBorder = HALF_MAP - 1; // the inner ring that was forest before expansion
    HALF_MAP += 2;
    MAP_SIZE = HALF_MAP * 2;
    generateTrees(); // rebuild the forest border at the new edge
    // Scatter tiny cut stumps along the old forest ring and fallen twigs inside it.
    const rng = mulberry32(HALF_MAP * 7919 + 13);
    for (let x = -oldBorder; x <= oldBorder; x++) {
      for (let y = -oldBorder; y <= oldBorder; y++) {
        const onBorder = Math.abs(x) === oldBorder || Math.abs(y) === oldBorder;
        const inner = !onBorder && (Math.abs(x) >= oldBorder - 2 || Math.abs(y) >= oldBorder - 2);
        if (!onBorder && !inner) continue;
        if (onBorder && rng() < 0.5) {
          const ox = (rng() - 0.5) * 0.5;
          const oy = (rng() - 0.5) * 0.5;
          // depth +0.5 pushes them to the inner face of the old tree row (close to trees)
          stumps.push({ x: x + ox, y: y + oy, size: 0.18 + rng() * 0.14,
                        ang: rng() * Math.PI, bornWave: wave, decayWaves: 10 + Math.floor(rng() * 8) });
        }
        if (inner && rng() < 0.18) {
          twigs.push({ x: x + (rng() - 0.5) * 0.8, y: y + (rng() - 0.5) * 0.8,
                       ang: rng() * Math.PI, len: 0.25 + rng() * 0.35,
                       bornWave: wave, decayWaves: 6 + Math.floor(rng() * 6) });
        }
      }
    }
  }

  // Toast describing the currently selected building.
  function buildModeToast(builder) {
    builder = builder || player;
    const type = BUILD_TYPES[builder.buildType || 0];
    const prefix = (builder === player2) ? 'Buddy ' : '';
    const switchHint = isMobileMode ? '◄ ► to switch' : 'scroll to switch';
    const placeHint  = isMobileMode ? 'tap BUILD to place' : 'E to place';
    const removeHint = isMobileMode ? 'tap BUILD to remove' : 'E to remove';
    if (type === 'remove') return prefix + 'Remove / sell building — ' + switchHint + ', ' + removeHint;
    let label;
    if (type === 'coop') label = 'Coop ($' + coopCost() + ')';
    else if (type === 'farm') label = 'Farm ($' + farmCost() + ')' + (upgradeLevels.farm >= 1 ? '' : ' — LOCKED');
    else if (type === 'stonefence') label = 'Stone Wall ($' + STONE_FENCE_COST + ')' + (upgradeLevels.stoneWall > 0 ? '' : ' — LOCKED');
    else if (type === 'dummy') label = 'Scarecrow ($' + DUMMY_COST + ')' + (upgradeLevels.dummy > 0 ? '' : ' — LOCKED');
    else if (type === 'statue') label = 'Chicken Statue ($' + STATUE_COST + ')' + (upgradeLevels.statue > 0 ? '' : ' — LOCKED');
    else if (type === 'mine') label = 'Explosive Mine ($' + mineCost() + ')' + (upgradeLevels.mine > 0 ? '' : ' — LOCKED');
    else if (type === 'dpsdummy') label = 'DPS Dummy (debug, free)';
    else label = 'Wooden Fence ($' + FENCE_COST + ')' + (upgradeLevels.woodFence > 0 ? '' : ' — LOCKED');
    return prefix + 'Build: ' + label + ' — ' + switchHint + ', ' + placeHint;
  }

  function placeBuilding(builder) {
    builder = builder || player;
    // Host-only authoritative placement. The guest gets here for player1 in
    // single-player; for MP the guest's E press routes to the host as a
    // p2input message instead of calling this directly.
    if (multiplayer && !isHost && builder === player) {
      toast('Sending build to host…', 0.8); buildMode = false; return;
    }
    const t = BUILD_TYPES[builder.buildType || 0];
    if (t === 'fence') placeFence('wood', builder);
    else if (t === 'stonefence') placeFence('stone', builder);
    else if (t === 'farm') placeFarm(builder);
    else if (t === 'dummy') placeDummy(builder);
    else if (t === 'statue') placeStatue(builder);
    else if (t === 'mine') placeMine(builder);
    else if (t === 'dpsdummy') placeDpsDummyBuilding(builder);
    else if (t === 'remove') removeBuilding(builder);
    else placeCoop(builder);
  }

  // Host-only — invoked when the guest presses E. Either enters build mode
  // for player2 (picking the first unlocked build type) or places the
  // currently-targeted building.
  function p2BuildToggle() {
    if (gameOver || upgradeMode) return;
    if (player2.ghost) { toast('Buddy is a ghost — they can\'t build', 1.2); return; }
    if (player2.buildMode) {
      placeBuilding(player2);
    } else {
      // Keep build/reload mutually exclusive for the guest keeper too.
      if (player2.reloadingT > 0 || player2.skillCheckActive) {
        toast('Buddy can\'t build while reloading', 0.9);
        return;
      }
      player2.buildMode = true;
      for (let i = 0; i < BUILD_TYPES.length; i++) {
        const t = BUILD_TYPES[i];
        if (t === 'fence' && upgradeLevels.woodFence <= 0) continue;
        if (t === 'stonefence' && upgradeLevels.stoneWall <= 0) continue;
        if (t === 'farm' && upgradeLevels.farm < 1) continue;
        if (t === 'dummy' && upgradeLevels.dummy < 1) continue;
        if (t === 'statue' && upgradeLevels.statue < 1) continue;
        if (t === 'mine' && upgradeLevels.mine < 1) continue;
        if (t === 'dpsdummy' && !debugUnlocked) continue;
        player2.buildType = i; break;
      }
      toast(buildModeToast(player2));
    }
  }
  function p2BuildScroll(dir) {
    if (!player2.buildMode) return;
    let attempts = 0;
    let idx = player2.buildType;
    while (attempts < BUILD_TYPES.length) {
      idx = (idx + dir + BUILD_TYPES.length) % BUILD_TYPES.length;
      const t = BUILD_TYPES[idx];
      if (t === 'fence' && upgradeLevels.woodFence <= 0) { attempts++; continue; }
      if (t === 'stonefence' && upgradeLevels.stoneWall <= 0) { attempts++; continue; }
      if (t === 'farm' && upgradeLevels.farm < 1) { attempts++; continue; }
      if (t === 'dummy' && upgradeLevels.dummy < 1) { attempts++; continue; }
      if (t === 'statue' && upgradeLevels.statue < 1) { attempts++; continue; }
      if (t === 'mine' && upgradeLevels.mine < 1) { attempts++; continue; }
      if (t === 'dpsdummy' && !debugUnlocked) { attempts++; continue; }
      player2.buildType = idx; break;
    }
    toast(buildModeToast(player2));
  }

  function exitBuildModeFor(builder) {
    if (builder === player2) { player2.buildMode = false; }
    else { buildMode = false; player.buildMode = false; }
  }

  function placeFarm(builder) {
    builder = builder || player;
    const cost = farmCost();
    if (moneyOf(builder) < cost) { exitBuildModeFor(builder); buildToast(builder, 'Need $' + cost + ' to start a farm'); return; }
    const target = getBuildTarget(builder);
    if (!target.valid) { buildToast(builder, target.reason); return; }
    farms.push({ x: target.x, y: target.y, growth: 0, trampleFlash: 0, need: wavesToFinish() });
    spendMoney(builder, cost);
    playBuild();
    buildToast(builder, 'Farm started!  -$' + cost, 1.2);
  }

  function removeBuilding(builder) {
    builder = builder || player;
    const target = getBuildTarget(builder);
    if (!target.valid || !target.removeTarget) { buildToast(builder, target.reason || 'Nothing to remove'); return; }
    const b = target.removeTarget;
    b.array.splice(b.index, 1);
    // Refunds always go to whoever pulled the building down.
    if (b.refund > 0) addMoney(builder, b.refund);
    playBuild();
    buildToast(builder, b.label + ' removed' + (b.refund > 0 ? '  +$' + b.refund : '  (no refund)'), 1.0);
  }

  function placeDummy(builder) {
    builder = builder || player;
    if (upgradeLevels.dummy < 1) { buildToast(builder, 'Scarecrow upgrade needed'); return; }
    if (moneyOf(builder) < DUMMY_COST) { exitBuildModeFor(builder); buildToast(builder, 'Need $' + DUMMY_COST + ' to build a scarecrow'); return; }
    const target = getBuildTarget(builder);
    if (!target.valid) { buildToast(builder, target.reason); return; }
    const hp = DUMMY_HP_TABLE[upgradeLevels.dummy];
    dummies.push({ x: target.x, y: target.y, hp, maxHp: hp, hurtT: 0, _decoy: 'dummy' });
    spendMoney(builder, DUMMY_COST);
    playBuild();
    buildToast(builder, 'Scarecrow placed!  -$' + DUMMY_COST, 1.0);
  }

  // Debug-only build: drop an indestructible DPS readout dummy on the targeted
  // tile. It lives in wolves[] (so it reuses the damage-tally wiring) but is
  // placed/removed through the normal build system, so it can be cleared with
  // the 'remove' tool. Free — it's a debug instrument, not a real building.
  function placeDpsDummyBuilding(builder) {
    builder = builder || player;
    if (!debugUnlocked) { buildToast(builder, 'DPS dummy is a debug tool'); return; }
    const target = getBuildTarget(builder);
    if (!target.valid) { buildToast(builder, target.reason); return; }
    wolves.push({
      x: target.x, y: target.y, vx: 0, vy: 0,
      alive: true, dpsDummy: true, hp: 1e9, maxHp: 1e9, size: 1.3,
      hurtT: 0, dps: 0, dpsAccum: 0, dpsWindowT: 1, facingLeft: false,
    });
    playBuild();
    buildToast(builder, 'DPS dummy placed — shoot it!', 1.2);
  }

  function placeStatue(builder) {
    builder = builder || player;
    if (upgradeLevels.statue < 1) { buildToast(builder, 'Chicken Statue upgrade needed'); return; }
    if (moneyOf(builder) < STATUE_COST) { exitBuildModeFor(builder); buildToast(builder, 'Need $' + STATUE_COST + ' to build a statue'); return; }
    const target = getBuildTarget(builder);
    if (!target.valid) { buildToast(builder, target.reason); return; }
    const hp = STATUE_HP_TABLE[upgradeLevels.statue];
    statues.push({ x: target.x, y: target.y, hp, maxHp: hp, hurtT: 0, _decoy: 'statue' });
    spendMoney(builder, STATUE_COST);
    playBuild();
    buildToast(builder, 'Chicken statue placed!  -$' + STATUE_COST, 1.0);
  }

  function placeMine(builder) {
    builder = builder || player;
    if (upgradeLevels.mine < 1) { buildToast(builder, 'Explosive Mine upgrade needed'); return; }
    if (moneyOf(builder) < mineCost()) { exitBuildModeFor(builder); buildToast(builder, 'Need $' + mineCost() + ' to bury a mine'); return; }
    const target = getBuildTarget(builder);
    if (!target.valid) { buildToast(builder, target.reason); return; }
    // Snapshot the current mine tier — later upgrades won't retroactively
    // beef this mine up, so the player has to weigh placing now vs banking.
    mines.push({ x: target.x, y: target.y, level: upgradeLevels.mine, _decoy: 'mine' });
    spendMoney(builder, mineCost());
    playBuild();
    buildToast(builder, 'Mine buried.  -$' + mineCost(), 0.9);
  }

  // Check every buried mine for an entity standing on it. The trigger
  // radius is small (~half a tile) so wolves/players have to actually walk
  // onto the square. Detonation hands off to `detonateMine` which scales
  // damage + radius from the mine's stored level.
  function updateMines() {
    if (mines.length === 0) return;
    const trigR2 = MINE_TRIGGER_R * MINE_TRIGGER_R;
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      let trigger = false;
      for (const w of wolves) {
        if (!w.alive) continue;
        if (dist2(w.x, w.y, m.x, m.y) < trigR2) { trigger = true; break; }
      }
      // Rocket Boots: an airborne keeper coasts over mines without setting
      // them off (and won't take blast damage either, since they're flying).
      const p1Grounded = !player.ghost && (player.flightT || 0) <= 0;
      const p2Grounded = player2.active && !player2.ghost && (player2.flightT || 0) <= 0;
      if (!trigger && p1Grounded && dist2(player.x, player.y, m.x, m.y) < trigR2) trigger = true;
      if (!trigger && p2Grounded && dist2(player2.x, player2.y, m.x, m.y) < trigR2) trigger = true;
      if (trigger) {
        detonateMine(m);
        mines.splice(i, 1);
      }
    }
  }

  // Blow up a mine: spawn the visual blast, damage every wolf in the radius
  // (credited to player1 for scoreboard simplicity), knock a hat off any
  // keeper standing inside the blast, and drop a scorched hole on the tile.
  function detonateMine(m) {
    spawnBlast(m.x, m.y);
    playExplosion();
    shake = Math.max(shake, 0.35);
    spawnSmoke(m.x, m.y, 10);
    const lvl = Math.max(1, Math.min(5, m.level || 1));
    const r = MINE_RADIUS[lvl], r2 = r * r;
    const dmg = MINE_DMG[lvl];
    for (const w of wolves) {
      if (!w.alive) continue;
      if (dist2(w.x, w.y, m.x, m.y) >= r2) continue;
      const dx = w.x - m.x, dy = w.y - m.y;
      const dd = Math.hypot(dx, dy) || 1;
      // Mines are the one anti-armour tool that really bites FANGUS — laying a
      // minefield in its path is meant to be a genuine strategy, so the boss
      // eats double. (bossTakeDamage still applies its per-second cap.)
      hurtWolf(w, w.boss ? dmg * MINE_BOSS_DMG_MUL : dmg, (dx / dd) * 0.4, (dy / dd) * 0.4);
    }
    // A maxed mine is keyed to the pack and won't go off under a keeper.
    if (lvl < 5) explosionHitKeepers(m.x, m.y, r);
    openCratesInBlast(m.x, m.y, r); // a crate sat on a mine gets opened the hard way
    holes.push({ x: m.x, y: m.y });
  }

  // Explosion damage to keepers — knocks a hat off any keeper caught in the
  // blast. A cloaked Last Stand keeper is NOT exempt: invisibility hides you
  // from wolf AI, but not from an explosion you're standing in. Ghost and
  // airborne (Rocket Boots) keepers are still skipped.
  function explosionHitKeepers(x, y, radius) {
    const r2 = radius * radius;
    for (const r of robots) if (r.alive && dist2(r.x, r.y, x, y) < r2) hurtRobot(r);
    if (!player.ghost && (player.flightT || 0) <= 0 &&
        dist2(player.x, player.y, x, y) < r2) applyFriendlyFireHit(player);
    if (player2.active && !player2.ghost && (player2.flightT || 0) <= 0 &&
        dist2(player2.x, player2.y, x, y) < r2) applyFriendlyFireHit(player2);
  }

  // ---------- Wartime supply drops ----------
  // Host-authoritative: the guest sees crates through the snapshot and must
  // never roll its own, or the two clients would be looting different farms.
  let crateDropT = 0;
  // The airlift runs for the boss fight, then winds down to the odd stray
  // crate once the farm is into the endless waves.
  function crateDropsActive() {
    if (inMenu || gameOver || !gameStarted) return false;
    if (multiplayer && !isHost) return false;
    if (bossWaveActive) return true;
    return waveActive && wave > BOSS_WAVE;
  }
  function updateSupplyDrops(dt) {
    // Deferred "war footing" announcement — see startBossWave.
    if (wartimeNoticeT > 0) {
      wartimeNoticeT -= dt;
      if (wartimeNoticeT <= 0) {
        wartimeNoticeT = 0;
        toast('WARTIME EFFORT — the coops work double, and supplies are inbound', 3.4);
        toastGuest('WARTIME EFFORT — the coops work double, and supplies are inbound', 3.4);
      }
    }
    if (!crateDropsActive()) { crateDropT = 0; return; }
    // First active frame just arms the timer — otherwise a crate would land on
    // the boss's entrance, on top of the intro cutscene.
    if (crateDropT <= 0) {
      crateDropT = bossWaveActive ? rand(CRATE_DROP_MIN, CRATE_DROP_MAX)
                                  : rand(CRATE_ENDLESS_MIN, CRATE_ENDLESS_MAX);
      return;
    }
    crateDropT -= dt;
    if (crateDropT > 0) return;
    if (bossWaveActive) {
      crateDropT = rand(CRATE_DROP_MIN, CRATE_DROP_MAX);
      dropSupplyCrate();
    } else {
      // Past the boss the timer still ticks, but most of its firings come up
      // empty — that's what makes a crate rare out here instead of a rhythm.
      crateDropT = rand(CRATE_ENDLESS_MIN, CRATE_ENDLESS_MAX);
      if (Math.random() < CRATE_ENDLESS_CHANCE) dropSupplyCrate();
    }
  }
  // Put one crate in the air over a random spot in the field. Same geometry as
  // spawnParachuteWolf: (x,y) is where it will LAND, paraH is how far above
  // that it still has to fall.
  function dropSupplyCrate() {
    const r = HALF_MAP - 4;
    supplyCrates.push({
      x: rand(-r, r),
      y: rand(-r, r),
      hp: CRATE_HP,
      maxHp: CRATE_HP,
      hurtT: 0,
      para: true,
      paraT: PARACHUTE_FALL_TIME,
      paraH: PARACHUTE_START_H,
      paraSway: Math.random() * Math.PI * 2,
      landT: 0,
      // The wave it arrived on. Once the farm moves past it, whatever is inside
      // stops waiting: the crate rattles and eventually pops itself open.
      bornWave: wave,
      shakeT: 0,
    });
    playParachuteDrop();
  }
  function updateSupplyCrates(dt) {
    for (let i = supplyCrates.length - 1; i >= 0; i--) {
      const cr = supplyCrates[i];
      if (cr.hurtT > 0) cr.hurtT = Math.max(0, cr.hurtT - dt);
      if (cr.para) {
        cr.paraT -= dt;
        if (cr.paraT <= 0) {
          cr.para = false;
          cr.paraH = 0;
          cr.landT = CRATE_LAND_DUST;
          spawnSmoke(cr.x, cr.y, 4);   // dust kicked up as it touches down
          playCrateLand();
        } else {
          cr.paraH = PARACHUTE_START_H * (cr.paraT / PARACHUTE_FALL_TIME);
          cr.paraSway = (cr.paraSway || 0) + dt * 2.0;
        }
        continue;
      }
      if (cr.landT > 0) cr.landT = Math.max(0, cr.landT - dt);
      // Left unopened into the next wave, the crate starts rattling — and
      // every second of rattling is a roll to burst open on its own. That way
      // ignoring a crate isn't free: it still resolves, just not on your
      // terms, and a booby-trapped one going off unattended is the risk.
      if (cr.landT <= 0 && wave > (cr.bornWave !== undefined ? cr.bornWave : wave)) {
        cr.shakeT = (cr.shakeT || 0) + dt;
        if (Math.random() < CRATE_SELF_OPEN_PER_SEC * dt) {
          // No shooter: hatRecipientFor picks a keeper at random.
          openSupplyCrate(cr);
          continue;
        }
      }
    }
  }
  // Any damage source can crack a crate: the keeper's pellets, a stray hunter
  // round, a mine it happened to land on. Returns true if the hit landed, so a
  // pellet knows to spend itself on the wood. `shooter` is the pellet's owner
  // (1, 2, 'wolf', 'hunter', or undefined for a blast) and only matters for
  // deciding whose head a hat payload lands on.
  function hurtSupplyCrate(cr, dmg, shooter) {
    if (!cr || cr.para || cr.landT > 0 || cr.opened) return false;
    cr.hp -= dmg;
    cr.hurtT = 0.14;
    if (cr.hp > 0) { playWoodChop(); return true; }
    openSupplyCrate(cr, shooter);
    return true;
  }
  // Blasts crack crates open too, so a mine or a stray boss shell landing on
  // one does what you'd expect. Victims are collected BEFORE any of them is
  // opened: a payload can splice the array, and iterating it live while that
  // happens would skip crates.
  //
  // Deliberately not called from the crate's own blast payload — a chain
  // reaction would be fun but it's recursion through openSupplyCrate, and
  // nothing asked for it.
  function openCratesInBlast(x, y, radius) {
    if (!supplyCrates.length) return;
    const r2 = radius * radius;
    const caught = [];
    for (const cr of supplyCrates) {
      if (cr.para || cr.opened) continue; // can't shell what's still in the air
      if (dist2(cr.x, cr.y, x, y) < r2) caught.push(cr);
    }
    for (const cr of caught) if (!cr.opened) openSupplyCrate(cr);
  }
  // The crate at (x,y) that a point lands on, or null. Airborne and
  // just-landed crates are skipped — nothing can be shot out of the sky.
  function supplyCrateAt(x, y, r) {
    for (const cr of supplyCrates) {
      if (cr.para || cr.landT > 0 || cr.opened) continue;
      if (dist2(cr.x, cr.y, x, y) < r * r) return cr;
    }
    return null;
  }

  // Find the first landed crate along a shot's path. Sweeping the whole step
  // keeps fast rounds from skipping straight over a crate between frames.
  function supplyCrateAlongSegment(x1, y1, x2, y2, radius) {
    let best = null, nearest = Infinity;
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    for (const cr of supplyCrates) {
      if (cr.para || cr.landT > 0 || cr.opened) continue;
      if (segmentDist2(x1, y1, x2, y2, cr.x, cr.y) >= radius * radius) continue;
      const along = clamp(((cr.x - x1) * dx + (cr.y - y1) * dy) / len2, 0, 1);
      if (along < nearest) { nearest = along; best = cr; }
    }
    return best;
  }

  function hurtCratesAlongBeam(x1, y1, x2, y2, dmg, shooter, hit = new Set()) {
    for (const cr of supplyCrates.slice()) {
      if (hit.has(cr) || segmentDist2(x1, y1, x2, y2, cr.x, cr.y) >= 0.55 * 0.55) continue;
      if (hurtSupplyCrate(cr, dmg, shooter)) hit.add(cr);
    }
  }
  // Break it open and roll what was inside. The roll happens HERE rather than
  // at drop time so nothing about the crate on the ground can tell the player
  // whether it's worth opening — that gamble is the whole point of making them
  // shoot it.
  function openSupplyCrate(cr, shooter) {
    if (cr.opened) return;
    cr.opened = true;
    const i = supplyCrates.indexOf(cr);
    if (i >= 0) supplyCrates.splice(i, 1);
    const roll = Math.random();
    if (roll < CRATE_PAYLOAD_BOOM) {
      // It was ordnance, and the drop damaged the fuse. Hurts the pack AND
      // anyone standing too close — the keeper included.
      spawnBlast(cr.x, cr.y);
      spawnSmoke(cr.x, cr.y, 12);
      spawnScorch(cr.x, cr.y);
      playExplosion();
      shake = Math.max(shake, 0.42);
      const r2 = CRATE_BLAST_R * CRATE_BLAST_R;
      for (const w of wolves) {
        if (!w.alive) continue;
        if (dist2(w.x, w.y, cr.x, cr.y) >= r2) continue;
        const dx = w.x - cr.x, dy = w.y - cr.y;
        const m = Math.hypot(dx, dy) || 1;
        hurtWolf(w, CRATE_BLAST_DMG, (dx / m) * 0.4, (dy / m) * 0.4);
      }
      explosionHitKeepers(cr.x, cr.y, CRATE_BLAST_R);
      // (No toast — a blast at your feet announces itself.)
      return;
    }
    if (roll < CRATE_PAYLOAD_BOOM + CRATE_PAYLOAD_HATS) {
      // One hat or a three-hat pack, with the shop's rare-colour rolls, free.
      // They ARC ONTO THE KEEPER'S HEAD rather than
      // appearing on the stack. Same flight the hatted-wolf drop uses: a
      // flyHat for the visible arc, plus a pendingHatLanding that actually
      // credits the hat when the arc lands.
      //
      // They go to whoever cracked it open; a crate that popped itself picks a
      // keeper at random. The shop's Buy Hat Pack always feeds player 1, which
      // is fine for something bought from a shared wallet, but a guest
      // shooting a crate and watching the HOST get the hats reads as broken.
      const to = hatRecipientFor(shooter);
      const count = Math.random() < CRATE_SINGLE_HAT_CHANCE ? 1 : 3;
      const held = (to === player2 && player2.active)
        ? (player2.hats || 0)
        : playerHats + pendingHatLandings.length;
      let got = 0;
      for (let n = 0; n < count && held + got < MAX_HATS; n++) {
        let col = '#5a3825';
        if (to === player2 && player2.active) {
          col = GUEST_HAT_COLOR;
        } else {
          hatsBought++;
          if (Math.random() < HAT_PACK_BUDDY_CHANCE) col = GUEST_HAT_COLOR;
          else if (hatsBought >= 5 && Math.random() < LEPRECHAUN_BUY_CHANCE) col = LEPRECHAUN_HAT_COLOR;
        }
        // Staggered so three hats sail over one after another instead of
        // overlapping into a single blob.
        const delay = n * 0.16;
        spawnFlyHat(cr.x, cr.y, col, to, delay);
        pendingHatLandings.push({ delayT: delay + 0.55, color: col, to });
        got++;
      }
      spawnSmoke(cr.x, cr.y, 6);
      if (got > 0) playSparkle();
      return;
    }
    // Live cargo: a few birds of whatever kind the farm happens to breed,
    // plus a decent chance of a soldier in the mix.
    const n = Math.round(rand(CRATE_CHICKENS_MIN, CRATE_CHICKENS_MAX));
    for (let k = 0; k < n; k++) {
      if (chickens.length >= MAX_CHICKENS) break;
      spawnCrateChicken(cr.x, cr.y, Math.random() < CRATE_SOLDIER_CHANCE);
    }
    spawnSmoke(cr.x, cr.y, 6);
    playChickenPop();
  }
  // Whose head a crate's hats land on. A keeper's shot claims them; a crate
  // that rattled itself open has no owner, so it picks from whoever is
  // actually standing (a ghost can't wear a hat).
  function hatRecipientFor(shooter) {
    if (shooter === 1 && !player.ghost) return player;
    if (shooter === 2 && player2.active && !player2.ghost) return player2;
    const up = [];
    if (!player.ghost) up.push(player);
    if (player2.active && !player2.ghost) up.push(player2);
    if (!up.length) return player;
    return up[Math.floor(Math.random() * up.length)];
  }
  // A bird out of a crate. Rolls the usual fat/worker/rich variants (so crate
  // cargo looks like the rest of the farm), or comes out a soldier instead —
  // the helmet and the TNT replace every other body type.
  function spawnCrateChicken(x, y, soldier) {
    const home = coops.length
      ? coops[Math.floor(Math.random() * coops.length)]
      : { x, y };
    spawnChicken(home, true);
    const c = chickens[chickens.length - 1];
    if (!c) return null;
    c.x = x + rand(-0.6, 0.6);
    c.y = y + rand(-0.6, 0.6);
    // A few seconds where nothing can touch it — see CRATE_CHICK_SHIELD. The
    // guard lives in killChicken, so this covers jaws, pellets, blasts and the
    // siphon alike, and the two snatch sites refuse to carry a shielded bird.
    c.savedT = CRATE_CHICK_SHIELD;
    if (soldier) {
      c.soldier = true;
      c.fat = false; c.worker = false; c.rich = false;
      c.fuseT = 0;
    }
    return c;
  }
  // Debug / crate helper: drop a soldier chicken at the player's feet.
  function spawnSoldierChicken() {
    if (chickens.length >= MAX_CHICKENS) return null;
    return spawnCrateChicken(player.x + rand(-1, 1), player.y + rand(-1, 1), true);
  }

  // Spawn a "debris" pile on a destroyed fence's tile. Holds the original
  // kind and the HP a worker chicken should restore the fence to. Cleared
  // at wave end. If another debris pile already sits on the same tile we
  // just overwrite the kind, so chained destructions don't pile up.
  // A fence's full health. Older/synced fences may predate the maxHp field, so
  // fall back to the current table value (which is also what a repair restores).
  function fenceMaxHp(f) {
    return f.maxHp
        || (f.kind === 'stone' ? tableAt('stoneWall') : tableAt('woodFence'))
        || (f.hp || 1);
  }

  function spawnFenceDebris(fence) {
    const restoredHp = (fence.kind === 'stone'
        ? tableAt('stoneWall')
        : tableAt('woodFence')) || (fence.hp || 1);
    for (const d of debris) {
      if (Math.abs(d.x - fence.x) < 0.1 && Math.abs(d.y - fence.y) < 0.1) {
        d.kind = fence.kind;
        d.hp = restoredHp;
        d.t = 0;
        return;
      }
    }
    debris.push({ x: fence.x, y: fence.y, kind: fence.kind, hp: restoredHp, t: 0 });
  }

  function placeFence(kind, builder) {
    builder = builder || player;
    const target = getBuildTarget(builder);
    if (!target.valid) { buildToast(builder, target.reason); return; }
    const cost = kind === 'stone' ? STONE_FENCE_COST : FENCE_COST;
    const name = kind === 'stone' ? 'Stone wall' : 'Fence';
    if (moneyOf(builder) < cost) { exitBuildModeFor(builder); buildToast(builder, 'Need $' + cost + ' to build ' + name.toLowerCase()); return; }
    const hp = kind === 'stone' ? tableAt('stoneWall') : tableAt('woodFence');
    fences.push({ x: target.x, y: target.y, kind: kind, hp: hp, maxHp: hp, hurtT: 0 });
    spendMoney(builder, cost);
    playBuild();
    buildToast(builder, name + ' placed!  -$' + cost, 0.8);
  }

  function placeCoop(builder) {
    builder = builder || player;
    const cost = coopCost();
    if (moneyOf(builder) < cost) { exitBuildModeFor(builder); buildToast(builder, 'Need $' + cost + ' to build coop'); return; }
    const target = getBuildTarget(builder);
    if (!target.valid) { buildToast(builder, target.reason); return; }
    coops.push({ x: target.x, y: target.y, spawnT: 3, hp: 3, builtWave: wave, level: 0, dirtR: 0 });
    spendMoney(builder, cost);
    playBuild();
    if (coopsPlaced === 0) buildToast(builder, 'Coop placed!  -$' + cost + ' — a chicken will hatch here!', 3.2);
    else                   buildToast(builder, 'Coop placed!  -$' + cost);
    // Coops close out the builder's build mode (you only need one at a time).
    if (builder === player2) player2.buildMode = false;
    else                     buildMode = false;
    coopsPlaced++;
    if (coopsPlaced % 10 === 0) {
      pendingMapExpansions++;
      toast('10 coops built! The land will expand at the next upgrade', 2.6);
    }
  }

  // Centralised chicken-death sink. Every code path that sets c.alive=false
  // for a chicken should route through here so the per-wave death counter
  // stays accurate. Idempotent: a chicken that's already dead is a no-op.
  // `force` bypasses the shield below. It is for a chicken ENDING ITSELF on
  // purpose — a soldier detonating its TNT, a worker spending itself to rebuild
  // a fence. Those two call this to finish a job they have already done, so a
  // refusal doesn't save the bird, it just replays the job: a shielded soldier
  // detonated over and over, and a shielded worker became a free fence-repair
  // machine. Everything the PACK does goes through the unforced path.
  function killChicken(c, force) {
    if (!c || !c.alive) return;
    // Shielded birds simply cannot be killed. `savedT` already meant "just
    // rescued, briefly untouchable" and was honoured by the pellet paths only;
    // the guard lives HERE now so one place covers every way a chicken dies —
    // jaws, pellets, blasts, the FANGUS siphon. Crate cargo leans on it for
    // its first few seconds (CRATE_CHICK_SHIELD).
    if (!force && (c.savedT || 0) > 0) return;
    c.alive = false;
    chickenDeathsThisWave++;
    if (c.soldier) detonateSoldierChicken(c);
  }

  function spawnChicken(coop, silent = false) {
    // Bookkeeping for the wave-end bonus roll — every hatch counts so the
    // death tally is births + starting alive − ending alive.
    if (waveActive) chickensBornThisWave++;
    // A little "pop" as the chick hatches. Skipped for the initial seed so
    // the game doesn't open with six stacked pops at once.
    if (!silent) playChickenPop();
    // Roll fat/worker/rich variants. A chick can't be both fat and worker
    // (workers need to move); fat + rich is fine and both slow it down.
    const fat    = upgradeLevels.fatChicken    >= 1 && Math.random() < FAT_CHANCE;
    const worker = !fat
                && upgradeLevels.workerChicken >= 1
                && Math.random() < WORKER_HATCH_CHANCE[Math.min(5, upgradeLevels.workerChicken)];
    const rich   = upgradeLevels.richChicken  >= 1
                && Math.random() < RICH_HATCH_CHANCE[Math.min(5, upgradeLevels.richChicken)];
    chickens.push({
      x: coop.x + rand(-0.5, 0.5),
      y: coop.y + rand(-0.5, 0.5),
      vx: 0, vy: 0,
      wanderT: 0,
      home: coop,
      fleeT: 0,
      alive: true,
      bob: Math.random() * Math.PI * 2,
      facingLeft: false,
      fat,
      worker,
      rich,
    });
  }

  // Top of each wave: plain birds get a small roll to grow into whichever
  // variants the player has unlocked, so the flock keeps developing instead of
  // being fixed at whatever each chicken happened to hatch as. A bird that is
  // already fat/worker/rich is left alone, and the fat/worker exclusion from
  // spawnChicken still holds (workers need to be able to move).
  function morphChickens() {
    const fatLvl    = upgradeLevels.fatChicken    || 0;
    const workerLvl = upgradeLevels.workerChicken || 0;
    const richLvl   = upgradeLevels.richChicken   || 0;
    if (!fatLvl && !workerLvl && !richLvl) return;
    for (const c of chickens) {
      if (!c.alive) continue;
      // Rich stacks with either body type, so it rolls on its own.
      if (richLvl && !c.rich && Math.random() < CHICKEN_MORPH_CHANCE) c.rich = true;
      if (c.fat || c.worker) continue;
      if (Math.random() >= CHICKEN_MORPH_CHANCE) continue;
      // Pick between the body types the player actually owns.
      const canFat = fatLvl > 0, canWork = workerLvl > 0;
      if (canFat && canWork)   (Math.random() < 0.5 ? c.fat = true : c.worker = true);
      else if (canFat)         c.fat = true;
      else if (canWork)        c.worker = true;
    }
  }

  function spawnWolf(opts) {
    if (wolves.length >= MAX_WOLVES) return; // safety cap — never pile up enough to crash
    // Spawn on map edge
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const r = HALF_MAP - 2;
    if (side === 0) { x = -r; y = rand(-r, r); }
    else if (side === 1) { x = r; y = rand(-r, r); }
    else if (side === 2) { x = rand(-r, r); y = -r; }
    else { x = rand(-r, r); y = r; }
    // Continuous trait levels (scale with wave): after `traitStart` a wolf
    // may spawn with a `fasterLevel` and/or `resistLevel`. Levels can grow
    // arbitrarily large as waves progress (so at wave 49 you can get ~lvl30).
    const extra = Math.max(0, wave - WOLF_TRAIT_START);
    // Compute a soft max level based on wave — tuned so wave 49 => ~30
    const baseMax = Math.floor(extra * 0.68);
    // Combine deterministic base with the stochastic global cap; allow a
    // rare per-spawn bonus so ultra-high wolves can still appear unpredictably.
    let maxLevel = Math.max(baseMax, wolfLevelCap);
    if (Math.random() < 0.035) maxLevel += 1 + Math.floor(Math.random() * Math.max(1, Math.floor(maxLevel * 0.16)));

    // Draw a level from 0..maxLevel with bias toward lower values but
    // allowing rare high rolls. We use a quadratic distribution here.
    function sampleLevel(max) {
      if (max <= 0) return 0;
      // bias param: >1 biases low, <1 biases high. 1.8 is reasonable.
      const bias = 1.55;
      return Math.floor(Math.pow(Math.random(), bias) * (max + 1));
    }

    // Fast (faster-level) wolves are gated to wave 25+ so the early and mid
    // game stay about resistant wolves rather than speedy ones, and they climb
    // slower than resist (half the level cap) once they do start appearing.
    const fasterLevel = wave >= 25 ? sampleLevel(Math.ceil(maxLevel / 2)) : 0;
    const resistLevel = sampleLevel(maxLevel);

    // Assassin wolves: from wave 10 on, a growing share of the pack spawns as
    // player-hunters. The per-wolf chance climbs 1% each wave so packs slowly
    // fill with assassins, with a softer ceiling so the late game isn't a
    // wall of them.
    const assassinChance = wave >= ASSASSIN_START
      ? clamp(0.04 + (wave - ASSASSIN_START) * 0.01, 0, 0.35)
      : 0;
    const assassin = Math.random() < assassinChance;

    // Sword wolves: a very rare variant (from wave 3 on) that carries a blade
    // in its jaws — longer attack reach plus a melee-swing animation. The
    // per-wolf chance is divided by the pack size, so the rate stays flat
    // (~SWORD_WOLF_RATE per wave) no matter how big the wave gets.
    const crMul = CRYPTID_RADAR_MUL[Math.min(5, upgradeLevels.cryptidRadar || 0)];
    const sword = !swordWolfAppeared && wave >= 3
      && Math.random() < SWORD_WOLF_RATE * crMul / Math.max(1, nextWolves);
    if (sword) swordWolfAppeared = true;

    // Hatted wolves: a rare variant that drops a hat onto the player's stack
    // when killed. Rate is divided by pack size so it averages ~HAT_WOLF_RATE
    // per wave. Mutually exclusive with sword/assassin for visual clarity.
    // Hatted-wolf rate doubles past wave 25 so late runs can keep refilling
    // the keeper's hat stack as the bullet hell ramps up.
    const hatRate = (wave >= 25 ? HAT_WOLF_RATE * 2 : HAT_WOLF_RATE) * crMul;
    const hatted = (opts && opts.hatted) ? true : (!sword && !assassin && Math.random() < hatRate / Math.max(1, nextWolves));

    // Convert levels into gameplay values. Assassins roll HP/size/speed from
    // the same faster/resist levels as any wolf, but move twice as fast.
    const speedLevel = Math.min(fasterLevel, WOLF_SPEED_CAP);
    const sizeLevel = Math.min(resistLevel, WOLF_SIZE_CAP);
    let speedMul = (1 + speedLevel * 0.06) * (assassin ? 2 : 1); // each level a bit stronger (gentler progression)
    const size = 1 + sizeLevel * 0.05 / 3; // each level a bit bigger (growth kept modest)
    let hp = 2 + Math.floor(resistLevel * 1.0); // HP grows fast — resist levels are tanky
    if (assassin) hp = Math.max(1, Math.round(hp / 2)); // assassins are half as resistant
    // Night of the Wolf: every wolf spawned this wave is tougher and faster.
    if (nightOfWolf) {
      speedMul *= 1.25;
      hp = Math.max(hp, Math.ceil(hp * 1.5));
    }
    // Endless ramp: past wave 50 the whole pack gets a little beefier every
    // wave, so survival runs keep getting harder.
    // Post-boss HP ramp, cut by 25% (0.08/wave -> 0.06) — late-game wolves had
    // turned into bullet sponges.
    if (wave > 50) hp = Math.ceil(hp * (1 + (wave - 50) * 0.06));

    // Sabotage roll — applies only to plain wolves (not sword/assassin
    // specials, which already have their own personality). If they roll
    // defective AND the player is at max Sabotage, a small extra roll
    // flips them to turncoat: blue eye, attacks other wolves.
    const sabLvl = upgradeLevels.sabotage || 0;
    let defective = false, turncoat = false;
    // Rain gets into everything: most of the pack wades in already confused,
    // regardless of whether Sabotage was ever bought.
    if (!assassin && !sword && raining() && Math.random() < RAIN_CONFUSE_CHANCE) {
      defective = true;
    }
    if (!defective && !assassin && !sword && sabLvl > 0) {
      if (Math.random() < SABOTAGE_DEFECT_CHANCE[Math.min(sabLvl, 5)]) {
        defective = true;
        if (sabLvl >= 5 && Math.random() < SABOTAGE_TURNCOAT_CHANCE) {
          turncoat = true;
        }
      }
    }
    // Jumping wolves — ordinary wolves that hop around and vault clean over
    // fences. They only start appearing after wave 50 (wave 51+), and the
    // chance is flat on plain wolves; silent (no intro toast).
    const jumper = wave > 50 && !assassin && !sword && !defective && Math.random() < 0.12;
    wolves.push({
      x, y, vx: 0, vy: 0,
      target: null,
      attackT: 0,
      aggroT: 0,
      playerFocusT: 0,
      alive: true,
      hp: hp,
      hurtT: 0,
      detourT: 0,
      siegeT: 0,
      facingLeft: false,
      fasterLevel: fasterLevel,
      resistLevel: resistLevel,
      speedMul: speedMul,
      size: size,
      assassin: assassin,
      sword: sword,
      hatted: hatted,
      meleeT: 0,
      defective,
      turncoat,
      jumper,
      jumpT: 0, jumpDur: 0, hopCdT: rand(0.5, 2.5),
      wanderDir: Math.random() * Math.PI * 2,
      wanderT: 0,
    });
  }

  // A fox: a rare, small, fast orange raider. It rides in the wolves array so
  // it reuses pellet collision and rendering, but runs its own AI (updateFox).
  function spawnFox() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const r = HALF_MAP - 2;
    if (side === 0) { x = -r; y = rand(-r, r); }
    else if (side === 1) { x = r; y = rand(-r, r); }
    else if (side === 2) { x = rand(-r, r); y = -r; }
    else { x = rand(-r, r); y = r; }
    wolves.push({
      x, y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: 3, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 2.4, size: 0.65,
      fox: true, fleeing: false, bob: Math.random() * Math.PI * 2,
    });
  }

  // A ninja first watches from the forest, outside the walkable farm. A hit
  // drives it away; only its return on the following day can earn the hat.
  function ninjaEdgePosition(side, slot, raiding = false) {
    const edge = HALF_MAP + (raiding ? -2 : 0.2);
    const along = clamp(slot, -0.8, 0.8) * (HALF_MAP - 3);
    return side === 0 ? { x: -edge, y: along }
      : side === 1 ? { x: edge, y: along }
      : side === 2 ? { x: along, y: -edge } : { x: along, y: edge };
  }

  function spawnNinjaWolf(raiding = false, side, slot) {
    if (multiplayer && !isHost) return null;
    if (wolves.some(w => w.alive && w.ninja) || (!raiding && pendingNinjaReturn)) return null;
    side = side === undefined ? Math.floor(Math.random() * 4) : side;
    slot = slot === undefined ? rand(-0.8, 0.8) : slot;
    const p = ninjaEdgePosition(side, slot, raiding);
    const w = {
      x: p.x, y: p.y, vx: 0, vy: 0, alive: true, hp: NINJA_HP, maxHp: NINJA_HP,
      ninja: true, ninjaPhase: raiding ? 'raiding' : 'hidden', ninjaSide: side,
      ninjaSlot: slot, ninjaRetreatT: 0, facingLeft: side === 1,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0, hurtT: 0,
      detourT: 0, siegeT: 0, fasterLevel: 0, resistLevel: 0,
      speedMul: NINJA_SPEED_MUL, size: 0.9, fleeing: false,
      bob: Math.random() * Math.PI * 2,
    };
    wolves.push(w);
    return w;
  }

  function provokeNinjaWolf(w) {
    if (!w.alive || !w.ninja || w.ninjaPhase !== 'hidden') return;
    w.ninjaPhase = 'retreating';
    w.ninjaRetreatT = 0.7;
    w.hurtT = 0.15;
    pendingNinjaReturn = { wave: wave + 1, side: w.ninjaSide, slot: w.ninjaSlot };
    spawnSmoke(w.x, w.y, 5);
    playGhostVanish();
  }

  function advanceNinjaDay() {
    if (!pendingNinjaReturn || wave < pendingNinjaReturn.wave) return;
    const returning = pendingNinjaReturn;
    pendingNinjaReturn = null;
    // A debug wave jump can happen before the retreat animation finishes.
    for (const w of wolves) if (w.ninja && ninjaIsWatching(w)) w.alive = false;
    spawnNinjaWolf(true, returning.side, returning.slot);
  }

  function updateNinjaWolf(w, dt) {
    if (w.ninjaPhase === 'raiding') { updateFox(w, dt); return; }
    w.bob += dt * 2;
    if (w.hurtT > 0) w.hurtT -= dt;
    if (w.ninjaPhase === 'retreating') {
      w.ninjaRetreatT -= dt;
      if (w.ninjaRetreatT <= 0) w.alive = false;
      return;
    }
    // Keep the hiding spot in the treeline when building expands the farm.
    const p = ninjaEdgePosition(w.ninjaSide, w.ninjaSlot);
    w.x = p.x; w.y = p.y;
  }

  // A bomb wolf — a slow wall-sapper that beelines to the nearest wall and
  // detonates against it. Appears from wave 50 once walls are standing.
  function spawnBombWolf() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const r = HALF_MAP - 2;
    if (side === 0) { x = -r; y = rand(-r, r); }
    else if (side === 1) { x = r; y = rand(-r, r); }
    else if (side === 2) { x = rand(-r, r); y = -r; }
    else { x = rand(-r, r); y = r; }
    wolves.push({
      x, y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: BOMB_WOLF_HP, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 1.1,
      bomb: true, smokeT: 0,
    });
    toastEnemyIntroOnce('bomb', 'An explosive wolf joined the pack!', 1.8);
  }

  // Pick a random edge spawn point used by every special wolf below.
  function pickEdgeSpawn() {
    const side = Math.floor(Math.random() * 4);
    const r = HALF_MAP - 2;
    if (side === 0) return { x: -r, y: rand(-r, r) };
    if (side === 1) return { x:  r, y: rand(-r, r) };
    if (side === 2) return { x: rand(-r, r), y: -r };
    return                 { x: rand(-r, r), y:  r };
  }

  // Brood wolf — appears from wave 20. Behaves like an ordinary wolf in
  // every way; the trick is that when it dies it bursts into 3 wandering
  // pups (visual blast only — no damage to anyone nearby).
  function spawnBreederWolf() {
    const s = pickEdgeSpawn();
    wolves.push({
      x: s.x, y: s.y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: BREEDER_HP, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 1.15,
      breeder: true,
    });
    toastEnemyIntroOnce('breeder', 'A brood wolf entered the hunt!', 1.8);
  }

  // A pup — fast, non-aggressive wolf spawned when a breeder dies. Doesn't
  // attack anyone; just zigzags around the map until the player guns it down.
  function spawnPupWolf(x, y) {
    wolves.push({
      x, y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: 1, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 0.75,
      pup: true,
      wanderT: 0,
      wanderDir: Math.random() * Math.PI * 2,
      // Briefly untouchable so the shotgun blast that popped the brood wolf
      // doesn't immediately gun down the pups it just spawned.
      invulnT: PUP_SPAWN_INVULN,
    });
  }

  // Ranged wolf — appears from wave 35. Walks into the map, sits down, and
  // pelts the closest live keeper or chicken with red bullets.
  function spawnRangedWolf() {
    const s = pickEdgeSpawn();
    wolves.push({
      x: s.x, y: s.y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: RANGED_HP, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 1.05,
      ranged: true,
      phase: 'entering',
      phaseT: 0,
      fireT: rand(0.6, 1.4),
    });
    toastEnemyIntroOnce('ranged', 'A laser wolf has joined the pack!', 1.8);
  }

  // Ranged wolf — appears from wave 30. Sits and shoots like the laser wolf,
  // but instead of a hit-scan beam it lobs slow red homing bullets that chase
  // the keeper. Shares the laser wolf's sit-and-fire AI (updateRangedWolf).
  function spawnHomerWolf() {
    const s = pickEdgeSpawn();
    wolves.push({
      x: s.x, y: s.y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: HOMER_HP, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 1.05,
      homer: true,
      phase: 'entering',
      phaseT: 0,
      fireT: rand(0.6, 1.4),
    });
    toastEnemyIntroOnce('homer', 'A ranged wolf has joined the pack!', 1.8);
  }

  // Missile wolf — wave 51+. A big wolf that lumbers a short way in, plants
  // itself, and bombards coops with twin back-mounted rockets after a long,
  // telegraphed wind-up. It never chases — the threat is to the coops, not the
  // keeper — so the player has a window to run it down before each salvo.
  function spawnMissileWolf() {
    const s = pickEdgeSpawn();
    wolves.push({
      x: s.x, y: s.y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: MISSILE_WOLF_HP, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: MISSILE_WOLF_SIZE,
      missileWolf: true,
      missilePhase: 'entering', // entering → arming (charge) → firing
      missileChargeT: 0,
      missileTargetCoop: null,
      walkT: 0,
      settleT: rand(1.0, 1.8), // how long it walks in before planting
    });
    toastEnemyIntroOnce('missilewolf', 'A missile wolf is targeting your coops!', 2.2);
  }

  // Hunter wolf — a rare cryptid that's a keeper reskin: it strolls the field
  // with the same shotgun the player carries and turns it on you and the flock.
  function spawnHunterWolf() {
    const s = pickEdgeSpawn();
    const hatCount = 1 + Math.floor(Math.random() * 5); // 1..5 hats = its health
    const hp = hatCount * HUNTER_WOLF_HP_PER_HAT;
    // Copy a player's loadout: P1 always, or randomly P2 in co-op. We snapshot
    // their weapon spread/pellets, projectile colour, and top hat colour.
    const copyOf = (player2 && player2.active && Math.random() < 0.5) ? 2 : 1;
    let fireCount, fireSpread, gunColor, hatColor;
    if (copyOf === 2) {
      const ss = spreadStatsFor(player2);
      fireCount = Math.max(3, ss.count); fireSpread = ss.spread;
      gunColor = projectileColor(lvlsFor(player2), false);
      hatColor = (Array.isArray(player2.hatColors) && player2.hatColors[player2.hatColors.length - 1]) || GUEST_HAT_COLOR;
    } else {
      fireCount = Math.max(3, pelletCount); fireSpread = shotgunSpread;
      gunColor = projectileColor(upgradeLevels, false);
      hatColor = hatColors[hatColors.length - 1] || '#5a3825';
    }
    wolves.push({
      x: s.x, y: s.y, vx: 0, vy: 0,
      target: null, attackT: rand(0.6, 1.6), aggroT: 0, playerFocusT: 0,
      alive: true, hp, maxHp: hp, hatCount, spawnHats: hatCount, hurtT: 0, detourT: 0, siegeT: 0,
      hitDebounceT: 0, reactCdT: rand(0.5, 1.5), fleeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 1.0,
      hunterWolf: true, copyOf, fireCount, fireSpread, gunColor, hatColor,
      mode: 'roam', modeT: 0, aimDir: 0, walkT: 0,
      wanderDir: Math.random() * Math.PI * 2, wanderT: 0,
    });
    toastEnemyIntroOnce('hunterwolf', 'A HUNTER WOLF prowls the field — it shoots back!', 2.4);
  }

  // Ghost wolf — looks like a hunter wolf but vanishes silently when hit.
  // Spawn chance starts at 0% and grows +2% per player death.
  function spawnGhostWolf() {
    playMagic(); // the same shimmering sting the buddy cameo arrives on
    const sp = pickEdgeSpawn();
    wolves.push({
      x: sp.x, y: sp.y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: 1, maxHp: 1, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 2, size: 0.9,
      assassin: true,  // hunts the player relentlessly (same AI branch)
      ghostWolf: true, // vanishes when shot instead of dying
      ghostFleeing: false, ghostAlpha: 1.0,
      wanderDir: Math.random() * Math.PI * 2, wanderT: 0,
    });
    // No toast — ghost wolves slip in silently.
  }

  // Thing wolf — a rare cryptid. Plays like an ordinary wolf (hunts chickens,
  // attacks the keeper), but on death its body bursts and the head skitters
  // off on spider legs (see onWolfKilled → spawnThingCrawler).
  function spawnThingWolf() {
    const s = pickEdgeSpawn();
    wolves.push({
      x: s.x, y: s.y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: THING_HP, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 1.0,
      thing: true,
      wanderDir: Math.random() * Math.PI * 2, wanderT: 0,
    });
  }

  // The fleeing head-crawler a thing wolf leaves behind: a wolf head scuttling
  // on spider legs that bolts for the nearest map edge and slips away.
  function spawnThingCrawler(x, y) {
    wolves.push({
      x, y, vx: 0, vy: 0,
      target: null, attackT: 0, aggroT: 0, playerFocusT: 0,
      alive: true, hp: THING_CRAWLER_HP, hurtT: 0, detourT: 0, siegeT: 0,
      facingLeft: false,
      fasterLevel: 0, resistLevel: 0,
      speedMul: 1, size: 0.85,
      crawler: true, legPhase: Math.random() * Math.PI * 2,
      // Brief spawn invulnerability so the same shotgun blast that killed the
      // parent thing wolf can't also gun down the crawler at the same spot.
      invulnT: 0.35,
    });
  }

  // Parachute wolf — a perfectly ordinary wolf (all the usual traits) that,
  // instead of walking in from a border, is dropped onto a random spot inside
  // the field and floats down under a parachute. While airborne it can't be
  // hit and doesn't act; on landing it becomes a normal wolf.
  function spawnParachuteWolf() {
    spawnWolf();
    const w = wolves[wolves.length - 1];
    if (!w) return;
    const r = HALF_MAP - 4;
    w.x = rand(-r, r);
    w.y = rand(-r, r);
    w.parachuting = true;
    w.parachuteT = PARACHUTE_FALL_TIME;
    w.parachuteH = PARACHUTE_START_H;
    w.parachuteSway = Math.random() * Math.PI * 2;
    // (no intro toast — the parachute drop speaks for itself)
  }

  // From WOLF_SCRAP_WAVE on, a slice of kills end with the wolf bursting into
  // loose parts like a machine coming apart, instead of leaving a body behind.
  // Returns true when it fired, so the caller skips the usual corpse.
  function tryWolfDisassemble(w) {
    if (w.fox || w.boss || w.thing) return false;
    if (wave < WOLF_SCRAP_WAVE) return false;
    if (Math.random() >= WOLF_SCRAP_CHANCE) return false;
    const n = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.2, 4.0);
      wolfScrap.push({
        x: w.x, y: w.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        z: rand(0.2, 0.9), vz: rand(3.5, 7.5),
        spin: Math.random() * Math.PI * 2, spinV: rand(-14, 14),
        t: rand(2.2, 3.2),
        kind: i % 3,                      // 0 plate, 1 strut, 2 cog
        size: rand(0.7, 1.3) * (w.size || 1),
      });
    }
    spawnSmoke(w.x, w.y, 3);
    playWolfScrap();
    return true;
  }

  // Scrap arcs out, bounces once off the ground, then rusts away.
  function updateWolfScrap(dt) {
    for (let i = wolfScrap.length - 1; i >= 0; i--) {
      const s = wolfScrap[i];
      s.t -= dt;
      if (s.t <= 0) { wolfScrap.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vz -= 16 * dt;
      s.z += s.vz * dt;
      s.spin += s.spinV * dt;
      if (s.z <= 0) {
        s.z = 0;
        if (s.vz < -1.2) { s.vz = -s.vz * 0.35; } // one lazy bounce
        else { s.vz = 0; s.vx *= 0.82; s.vy *= 0.82; s.spinV *= 0.7; }
      }
    }
  }

  // Moonwalker: an ordinary wolf that ambles in facing entirely the wrong way.
  // Purely a visual oddity — it hunts exactly like any other wolf, it just
  // never turns around. drawWolf flips its sprite against its heading.
  function spawnMoonwalkWolf() {
    spawnWolf();
    const w = wolves[wolves.length - 1];
    if (!w) return;
    w.moonwalk = true;
  }

  // Brute: ten times the health and a heavy, furious brow. Slow to bring down
  // but otherwise a normal wolf — the scare is the health bar, not new tricks.
  function spawnBruteWolf() {
    spawnWolf();
    const w = wolves[wolves.length - 1];
    if (!w) return;
    w.brute = true;
    w.hp = (w.hp || 1) * BRUTE_HP_MUL;
    w.maxHp = w.hp;
    w.size = (w.size || 1) * 1.25; // visibly bigger so the HP is readable
  }

  // Player-2 cameo: in a solo run, very rarely the blue P2 keeper wanders in,
  // mooches around, then strolls back off the map. Harmless and once per run.
  // Pick a random point near the map border (a few tiles in) so the cameo
  // keeps strolling along the edge rather than wandering into the middle.
  function p2CameoBorderTarget() {
    const r = HALF_MAP - rand(2, 5);
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: -r, y: rand(-r, r) };
    if (side === 1) return { x:  r, y: rand(-r, r) };
    if (side === 2) return { x: rand(-r, r), y: -r };
    return                 { x: rand(-r, r), y:  r };
  }

  function maybeSpawnP2Cameo() {
    if (multiplayer || p2CameoUsed || p2Cameo) return;
    if (wave < 15) return; // the buddy cameo only shows up from wave 15 on
    if (Math.random() >= P2_CAMEO_CHANCE) return;
    p2CameoUsed = true;
    const s = pickEdgeSpawn();
    const t = p2CameoBorderTarget();
    p2Cameo = {
      x: s.x, y: s.y, vx: 0, vy: 0, walkT: 0, facingLeft: false,
      lifeT: P2_CAMEO_LIFE, phase: 'wander',
      tx: t.x, ty: t.y, retargetT: rand(1.5, 3),
    };
    triggerRadar(); // the radar picks up the cameo cryptid (no toast)
  }

  function updateP2Cameo(dt) {
    const c = p2Cameo;
    if (!c) return;
    const speed = 2.2;
    if (c.phase === 'wander') {
      c.lifeT -= dt;
      c.retargetT -= dt;
      if (c.retargetT <= 0) {
        const t = p2CameoBorderTarget();
        c.tx = t.x; c.ty = t.y;
        c.retargetT = rand(1.5, 3.5);
      }
      if (c.lifeT <= 0) {
        // Time to go — head for the nearest edge and leave.
        c.phase = 'leaving';
        const r = HALF_MAP;
        const dl = c.x + r, dr = r - c.x, dd = c.y + r, du = r - c.y;
        const md = Math.min(dl, dr, dd, du);
        if (md === dl)      { c.tx = -r; c.ty = c.y; }
        else if (md === dr) { c.tx = r;  c.ty = c.y; }
        else if (md === dd) { c.tx = c.x; c.ty = -r; }
        else                { c.tx = c.x; c.ty = r; }
      }
    }
    const dx = c.tx - c.x, dy = c.ty - c.y;
    const m = Math.hypot(dx, dy) || 1;
    // Once spooked into a ghost it drifts off faster and floats through walls.
    const sp = c.ghost ? speed * 1.4 : speed;
    c.vx = (dx / m) * sp;
    c.vy = (dy / m) * sp;
    if (c.ghost) { c.x += c.vx * dt; c.y += c.vy * dt; } // phase through fences
    else moveWithFences(c, dt);
    c.walkT += dt * 10;
    const sv = c.vx - c.vy;
    if (Math.abs(sv) > 0.05) c.facingLeft = sv < 0;
    if (c.phase === 'leaving' &&
        (c.x <= -HALF_MAP + 1 || c.x >= HALF_MAP - 1 ||
         c.y <= -HALF_MAP + 1 || c.y >= HALF_MAP - 1)) {
      p2Cameo = null; // gone for good this run
    }
  }

  // Shooting the buddy cameo spooks it: it turns spectral, lets out an eerie
  // moan, and drifts off the map. One-way — it never comes back this run.
  function spookCameo() {
    const c = p2Cameo;
    if (!c || c.ghost) return;
    c.ghost = true;
    c.phase = 'leaving';
    const r = HALF_MAP;
    const dl = c.x + r, dr = r - c.x, dd = c.y + r, du = r - c.y;
    const md = Math.min(dl, dr, dd, du);
    if (md === dl)      { c.tx = -r; c.ty = c.y; }
    else if (md === dr) { c.tx = r;  c.ty = c.y; }
    else if (md === dd) { c.tx = c.x; c.ty = -r; }
    else                { c.tx = c.x; c.ty = r; }
    playNightOfWolfStart(); // reuse the ominous night-start sting
  }

  // Pitch the hunter camp at a random open patch of the map and stand 3
  // shotgunners around it. Avoids the player's immediate vicinity so they
  // don't materialise on top of you.
  // Sync the rooftopper roster with the upgrade tier. Picks the tallest
  // coops first; only one rooftopper per coop. Called when the upgrade is
  // picked AND at every wave start so a freshly grown coop can host one.
  function assignRooftoppers() {
    const want = upgradeLevels.rooftopper || 0;
    // Drop rooftoppers that have died (e.g. knocked off by a missile) or whose
    // coop is gone. The paid upgrade re-staffs from here next wave start.
    for (let i = rooftoppers.length - 1; i >= 0; i--) {
      if (!rooftoppers[i].alive || !coops.includes(rooftoppers[i].coop)) rooftoppers.splice(i, 1);
    }
    if (want === 0) { rooftoppers.length = 0; return; }
    if (rooftoppers.length > want) rooftoppers.length = want;
    // Build a candidate list of coops sorted by floor count (tallest first),
    // skipping any that already host a rooftopper.
    const occupied = new Set(rooftoppers.map(r => r.coop));
    const candidates = coops.filter(c => !occupied.has(c))
                            .sort((a, b) => (b.level || 0) - (a.level || 0));
    while (rooftoppers.length < want && candidates.length) {
      const coop = candidates.shift();
      rooftoppers.push({
        x: coop.x, y: coop.y, coop,
        fireT: rand(0.4, 2.8),
        dir: 0,
        aimDir: 0,
        facingLeft: false,
        alive: true,
      });
    }
  }

  // Per-tick sniper logic: find the highest-priority wolf in range and fire
  // a single high-damage round at the end of a long cooldown.
  function updateRooftopper(r, dt) {
    if (!r.alive) return;
    // Knocked off its coop by a missile — tumble down the roof, then die.
    if (r.falling) {
      r.fallT += dt;
      r.fallVy += dt * 110;          // gravity (screen px/s)
      r.fallY += r.fallVy * dt;
      r.fallRot += dt * 7 * (r.fallSpin || 1);
      if (r.fallT > 1.0) {
        r.alive = false;
        spawnSmoke(r.x, r.y, 4);
        // A fallen sniper frees up a slot — drop the upgrade level so the
        // Rooftoppers upgrade is offered again to recruit a replacement.
        upgradeLevels.rooftopper = Math.max(0, (upgradeLevels.rooftopper || 0) - 1);
      }
      return;
    }
    if (!coops.includes(r.coop)) { r.alive = false; return; }
    r.coopLevel = r.coop.level || 0; // mirrored down for the guest's render
    if (r.fireT > 0) r.fireT -= dt;
    // Track the closest wolf inside the sniper range — assassins and rare
    // wolves are weighted as higher priority so the sniper doesn't waste
    // shots on pups when an assassin is bearing down.
    let target = null, bestScore = -Infinity;
    for (const w of wolves) {
      if (!w.alive || w.pup || w.fox || ninjaIsWatching(w)) continue;
      const d = dist2(w.x, w.y, r.x, r.y);
      if (d < ROOFTOP_MIN_RANGE2) continue; // unlimited range, but never point-blank
      // Prefer dangerous variants AND closer wolves.
      let score = -d * 0.1;
      if (w.assassin) score += 10;
      if (w.sword)    score += 8;
      if (w.bomb)     score += 6;
      if (w.ranged)   score += 5;
      if (w.homer)    score += 5;
      if (w.hatted)   score += 4;
      if (score > bestScore) { bestScore = score; target = w; }
    }
    if (!target) { r.aiming = false; return; }
    // Remember the focus so drawRooftopper can paint a thin targeting laser.
    r.aiming = true;
    r.targetX = target.x;
    r.targetY = target.y;
    const dx = target.x - r.x, dy = target.y - r.y;
    r.dir = Math.atan2(dy, dx);
    r.facingLeft = (dx - dy) < 0;
    // Screen-space aim — used by drawRooftopper to rotate the rifle so it
    // visually tracks the target the same way the ranged wolf's cannon does.
    const sdx = (dx - dy) * TILE_W / 2;
    const sdy = (dx + dy) * TILE_H / 2;
    r.aimDir = Math.atan2(sdy, sdx);
    if (r.fireT <= 0) {
      fireRooftopper(r, target);
      const floor = r.coop.level || 0;
      // Jitter ±25% so multiple snipers don't all squeeze the trigger on
      // the same frame — staggers their volleys naturally.
      r.fireT = (ROOFTOP_BASE_COOLDOWN + floor * ROOFTOP_DELAY_PER_FLOOR) * rand(0.75, 1.25);
    }
  }

  // A single rooftopper shot — a fat tracer pellet that pierces lightly,
  // tagged as a hunter shot so it can't friendly-fire the keeper crowd
  // (existing hunter-pellet handling already enforces that).
  function fireRooftopper(r, target) {
    playRooftopShot(); // its own heavy crack, not the keeper's shotgun
    const floor = r.coop.level || 0;
    const dmg = ROOFTOP_BASE_DMG * (1 + floor * ROOFTOP_DMG_PER_FLOOR);
    const ang = r.dir;
    const sp = ROOFTOP_PELLET_SPEED * 1.4;
    // A single heavy round that buries itself in the first wolf it strikes —
    // it does NOT pierce on through. Long life so the unlimited-range shot can
    // reach a wolf anywhere on the map.
    pellets.push({
      x: r.x + Math.cos(ang) * 0.3,
      y: r.y + Math.sin(ang) * 0.3,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: 3.0,
      dmg,
      pierce: 1,                // hits one wolf and stops — disappears in the target
      hit: null,
      spareChance: 0,
      r: 3.0,                   // slightly larger for visibility
      color: '#ffaa3a',
      trail: true,
      rooftop: true,            // drawn with a sniper glow
      // Fired from a rooftop, so it arcs clean over fences, walls and any
      // other ground obstacle instead of burying itself in your own wall.
      ignoreWalls: true,
      shooter: 'hunter',        // reuses the hunter friendly-fire rules
    });
  }

  // Find a fresh camp spot away from the player and from other camps.
  function pickHunterCampSpot() {
    const r = HALF_MAP - 4;
    let cx = 0, cy = 0;
    for (let tries = 0; tries < 40; tries++) {
      const tx = rand(-r, r), ty = rand(-r, r);
      if (dist2(tx, ty, player.x, player.y) < 36) continue;
      if (fenceBlocks(tx, ty)) continue;
      let tooClose = false;
      for (const c of huntersCamps) if (dist2(tx, ty, c.x, c.y) < 49) { tooClose = true; break; }
      // Keep camps well clear of coops so hunters don't crowd the henhouse.
      if (!tooClose) for (const c of coops) if (dist2(tx, ty, c.x, c.y) < 36) { tooClose = true; break; }
      if (tooClose) continue;
      cx = tx; cy = ty;
      break;
    }
    return { x: cx, y: cy, dirtR: 1.2, smokeT: 0 };
  }

  // Stand up a new, DISTINCT camp with its own group of HUNTER_COUNT hunters.
  function addHunterCamp() {
    if (huntersCamps.length >= 3) return;
    const camp = pickHunterCampSpot();
    huntersCamps.push(camp);
    const startHp = HUNTER_POWER_HP[hunterPowerLvl()];
    for (let i = 0; i < HUNTER_COUNT; i++) {
      const a = (i / HUNTER_COUNT) * Math.PI * 2;
      hunters.push({
        x: camp.x + Math.cos(a) * 1.1,
        y: camp.y + Math.sin(a) * 1.1,
        vx: 0, vy: 0,
        alive: true,
        hp: startHp,
        maxHp: startHp,
        hurtT: 0,
        facingLeft: false,
        attackT: rand(0.4, 1.4),
        dir: a,
        walkT: 0,
        weapon: hunterWeaponForTier(hunterPowerLvl()),
        burstLeft: 0, // double-barrel: pending follow-up shot
        camp,           // each hunter remembers its own camp
        sombrero: Math.random() < 0.25, // only a few wear the big hat at max gear
        _hunter: true,
      });
    }
    huntersGroups = huntersCamps.length;
  }

  // Top every standing camp back up to HUNTER_COUNT live hunters. Fresh
  // arrivals come in at the current gear tier. Called when gear is bought, so
  // the purchase rebuilds a thinned-out crew rather than only upgrading the
  // survivors. Dead bodies are left in place — only the live count matters.
  function refillHunterCamps() {
    const tier = hunterPowerLvl();
    const startHp = HUNTER_POWER_HP[tier];
    for (const camp of huntersCamps) {
      let live = 0;
      for (const h of hunters) if (h.alive && h.camp === camp) live++;
      for (let i = live; i < HUNTER_COUNT; i++) {
        const a = (i / HUNTER_COUNT) * Math.PI * 2;
        hunters.push({
          x: camp.x + Math.cos(a) * 1.1,
          y: camp.y + Math.sin(a) * 1.1,
          vx: 0, vy: 0,
          alive: true,
          hp: startHp,
          maxHp: startHp,
          hurtT: 0,
          facingLeft: false,
          attackT: rand(0.4, 1.4),
          dir: a,
          walkT: 0,
          weapon: hunterWeaponForTier(tier),
          burstLeft: 0,
          camp,
          sombrero: Math.random() < 0.25,
          _hunter: true,
        });
      }
    }
    // Fresh blood means the crew is no longer walking out at wave end.
    huntersLeavePending = false;
  }

  function spawnHuntersCamp() {
    huntersCamps = [];
    hunters.length = 0;
    huntersGroups = 0;
    huntersLeavePending = false;
    extinctCamp = null; // a new crew rebuilds the fireplace on top of any cold remains
    addHunterCamp();
    toast('Hunters set up camp — they want $' + HUNTER_FEE_PER_WAVE + '/wave', 2.4);
    playHuntersArrive();
  }

  // Move every existing hunter camp to a fresh spot and re-seat its crew in a
  // ring around the new site. The old worn dirt patch follows the camp.
  function relocateHunterCamps() {
    for (const camp of huntersCamps) {
      const spot = pickHunterCampSpot();
      camp.x = spot.x; camp.y = spot.y;
      camp.dirtR = 1.2;
      let i = 0;
      for (const h of hunters) {
        if (h.camp !== camp || !h.alive) continue;
        const a = (i / HUNTER_COUNT) * Math.PI * 2;
        h.x = camp.x + Math.cos(a) * 1.1;
        h.y = camp.y + Math.sin(a) * 1.1;
        h.dir = a;
        i++;
      }
    }
  }

  // Hunter Caravan: pitch ANOTHER distinct camp (up to 3). Calling the hunters
  // again also relocates the camps already in the field, so the whole caravan
  // repacks and moves each time.
  function callHunterReinforcements() {
    if (huntersCamps.length === 0 || huntersCamps.length >= 3) return;
    relocateHunterCamps();
    addHunterCamp();
    const fee = HUNTER_GROUP_FEE[Math.min(3, huntersGroups)];
    toast('Hunter caravan repacks and pitches camp ' + huntersGroups + ' — +$' + fee + '/wave', 2.4);
    playHuntersArrive();
  }

  // Find the closest live wolf within HUNTER_RANGE2 — used as the hunter's prey.
  // The boss is a huge, ever-present menace, so hunters lock onto it from across
  // the whole map (a normal wolf is only spotted within HUNTER_RANGE2).
  function nearestWolfTo(x, y) {
    let best = null, bd = Infinity;
    const bossReach = (HALF_MAP * 2) * (HALF_MAP * 2);
    for (const w of wolves) {
      if (!w.alive || w.fleeing || ninjaIsWatching(w)) continue;
      const reach = w.boss ? bossReach : HUNTER_RANGE2;
      const d = dist2(w.x, w.y, x, y);
      if (d <= reach && d < bd) { bd = d; best = w; }
    }
    return best;
  }

  // Hunter AI: stand near camp, face the nearest wolf in range, and rack off
  // a shotgun blast every HUNTER_FIRE_COOLDOWN seconds. They never move much —
  // a short shuffle keeps them out of stacking pile-ups if a wolf gets close.
  function updateHunter(h, dt) {
    if (!h.alive) return;
    if (h.hurtT > 0) h.hurtT -= dt;
    if (h.attackT > 0) h.attackT -= dt;
    if (h.tauntT > 0) h.tauntT -= dt;
    if (h.tauntCdT > 0) h.tauntCdT -= dt;
    // Spooked by a player kill (whole camp via huntersLeavePending) OR rattled
    // by a boss entrance (just this one, h.scared): run for the closest edge and
    // vanish (no corpse). Wave-end cleanup retires the camp.
    if (huntersLeavePending || h.scared) {
      h.burstLeft = 0;
      const r = HALF_MAP;
      const dl = h.x + r, dr = r - h.x, dd = h.y + r, du = r - h.y;
      const md = Math.min(dl, dr, dd, du);
      let tx, ty;
      if      (md === dl) { tx = -r; ty = h.y; }
      else if (md === dr) { tx = r;  ty = h.y; }
      else if (md === dd) { tx = h.x; ty = -r; }
      else                { tx = h.x; ty = r; }
      const dx = tx - h.x, dy = ty - h.y;
      const m = Math.hypot(dx, dy) || 1;
      const sp = 3.4;
      h.dir = Math.atan2(dy, dx);
      h.facingLeft = (dx - dy) < 0;
      h.x += (dx / m) * sp * dt;
      h.y += (dy / m) * sp * dt;
      h.walkT += dt * 12;
      if (h.x <= -HALF_MAP + 1 || h.x >= HALF_MAP - 1 ||
          h.y <= -HALF_MAP + 1 || h.y >= HALF_MAP - 1) {
        h.alive = false;
      }
      return;
    }
    const rateMul = HUNTER_POWER_RATE[hunterPowerLvl()];
    // Pending second barrel from a double-barrel hunter fires shortly after the first.
    if (h.burstLeft > 0 && h.attackT <= 0) {
      h.burstLeft--;
      hunterFire(h);
      h.attackT = h.burstLeft > 0 ? 0.12 : HUNTER_FIRE_COOLDOWN * 1.4 * rateMul;
      return;
    }
    const prey = nearestWolfTo(h.x, h.y);
    if (prey) {
      const dx = prey.x - h.x, dy = prey.y - h.y;
      h.dir = Math.atan2(dy, dx);
      h.facingLeft = (dx - dy) < 0;
      // Back-pedal a little if a wolf gets very close — keeps the shooter alive.
      const m2 = dx * dx + dy * dy;
      if (m2 < 1.8) {
        const m = Math.sqrt(m2) || 1;
        const sp = 1.8;
        const nx = h.x - (dx / m) * sp * dt;
        const ny = h.y - (dy / m) * sp * dt;
        if (!fenceBlocks(nx, h.y)) h.x = nx;
        if (!fenceBlocks(h.x, ny)) h.y = ny;
        h.x = clamp(h.x, -HALF_MAP + 1, HALF_MAP - 1);
        h.y = clamp(h.y, -HALF_MAP + 1, HALF_MAP - 1);
        h.walkT += dt * 12;
      }
      if (h.attackT <= 0) {
        if (h.weapon === 'mg') {
          // Machine-gun: rapid single-pellet stream.
          h.attackT = 0.16 * rateMul;
          hunterFire(h);
        } else if (h.weapon === 'minigun') {
          // Minigun: even faster than the machine-gun.
          h.attackT = 0.09 * rateMul;
          hunterFire(h);
        } else if (h.weapon === 'doubleBarrel') {
          // Double-Barrel: fires the first barrel now, schedules the second.
          h.attackT = 0.12;
          h.burstLeft = 1;
          hunterFire(h);
        } else if (h.weapon === 'laser') {
          // Laser: quick, snappy bolts.
          h.attackT = HUNTER_FIRE_COOLDOWN * 0.8 * rateMul;
          hunterFire(h);
        } else {
          // Shotgun / rocket / homing — measured single shots.
          h.attackT = HUNTER_FIRE_COOLDOWN * rateMul;
          hunterFire(h);
        }
      }
    } else if (h.camp || huntersCamps.length) {
      // No prey — drift back to this hunter's own campfire when nudged away.
      const home = h.camp || huntersCamps[0];
      const dx = home.x - h.x, dy = home.y - h.y;
      const m2 = dx * dx + dy * dy;
      if (m2 > 4) {
        const m = Math.sqrt(m2) || 1;
        const sp = 1.4;
        h.x += (dx / m) * sp * dt;
        h.y += (dy / m) * sp * dt;
        h.facingLeft = ((dx) - (dy)) < 0;
        h.walkT += dt * 10;
      } else {
        // Settled at camp with nothing to shoot — heckle a nearby keeper.
        const k = nearestKeeper(h.x, h.y);
        if (k && (h.tauntT || 0) <= 0 && (h.tauntCdT || 0) <= 0 &&
            dist2(k.x, k.y, h.x, h.y) < HUNTER_TAUNT_RANGE * HUNTER_TAUNT_RANGE &&
            Math.random() < HUNTER_TAUNT_CHANCE * dt) {
          h.tauntT = HUNTER_TAUNT_DUR;
          h.tauntCdT = rand(HUNTER_TAUNT_CD_MIN, HUNTER_TAUNT_CD_MAX);
          const kdx = k.x - h.x, kdy = k.y - h.y;
          h.facingLeft = (kdx - kdy) < 0; // turn to face the keeper it's taunting
        }
      }
    }
  }

  // One shotgun blast from a hunter: a small cone of pellets that hits both
  // wolves AND keepers/chickens, mirroring how the player's pellets work.
  // Variants: 'shotgun' = 4-pellet cone, 'mg' = single rapid pellet,
  // 'doubleBarrel' = harder-hitting cone (fired twice from updateHunter).
  function hunterFire(h) {
    const w = h.weapon || 'shotgun';
    const dmgMul = HUNTER_POWER_DMG[hunterPowerLvl()];
    const nearest = nearestWolfTo(h.x, h.y);
    // Rocket: a single slow, fat, explosive round (mirrors the keeper rocket).
    if (w === 'rocket') {
      playRocketWhoosh();
      const a = h.dir + rand(-0.03, 0.03);
      const sp = 11 + rand(-1, 1);
      pellets.push({
        x: h.x + Math.cos(a) * 0.3, y: h.y + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.7, dmg: 1.2 * dmgMul, pierce: 1, hit: null, spareChance: 0,
        r: 3.0, color: '#ffae5a', trail: true, shooter: 'hunter',
        rocket: true, rocketChance: 0.85,
      });
      return;
    }
    // Homing: a slow, hard-seeking pulsating round — mirrors the keeper's
    // maxed Homing Shots (strong turn, long life so it reliably curves home).
    if (w === 'homing') {
      playShotgun();
      const a = h.dir + rand(-0.05, 0.05);
      const sp = 11 + rand(-1, 1);
      pellets.push({
        x: h.x + Math.cos(a) * 0.3, y: h.y + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1.8, dmg: 1.1 * dmgMul, pierce: 1, hit: null, spareChance: 0,
        r: 1.6, color: '#b06fff', trail: true, shooter: 'hunter',
        homing: true, homingLvl: 5, homingTarget: nearest || null,
      });
      return;
    }
    // Laser: an actual hit-scan BEAM toward the target — same as the keeper's
    // Laser Shots, clipped at walls, burning every wolf along the line.
    if (w === 'laser') {
      playLaser();
      const a = h.dir;
      const reach = 15; // tiles
      const bx1 = h.x + Math.cos(a) * 0.3, by1 = h.y + Math.sin(a) * 0.3;
      const end = clipBeamAtWall(bx1, by1, bx1 + Math.cos(a) * reach, by1 + Math.sin(a) * reach);
      applyHunterBeam(bx1, by1, end.x, end.y, 1.6 * dmgMul);
      beams.push({ x1: bx1, y1: by1, x2: end.x, y2: end.y, t: 0, life: 0.22, color: '#ffe23d', yOff: 12 });
      return;
    }
    // Ballistic weapons: shotgun cone, machine-gun / minigun single stream.
    playShotgun();
    const single = (w === 'mg' || w === 'minigun');
    const pelletCount = single ? 1 : HUNTER_PELLETS;
    const spread = single ? 0.05 : w === 'doubleBarrel' ? HUNTER_SPREAD * 0.8 : HUNTER_SPREAD;
    const dmg = (w === 'doubleBarrel' ? 1.4 : 1) * dmgMul;
    const r = single ? 1.2 : 1.6;
    const color = single ? '#cfe8ff' : w === 'doubleBarrel' ? '#ffa848' : '#ffc878';
    for (let i = 0; i < pelletCount; i++) {
      const t = pelletCount > 1 ? (i / (pelletCount - 1)) * 2 - 1 : 0;
      const a = h.dir + t * spread + rand(-0.04, 0.04);
      const sp = (single ? (w === 'minigun' ? 22 : 20) : 16) + rand(-1.5, 1.5);
      pellets.push({
        x: h.x + Math.cos(a) * 0.3,
        y: h.y + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.45,
        dmg,
        pierce: 1,
        hit: null,
        spareChance: 0,
        r,
        color,
        trail: true,
        shooter: 'hunter',
      });
    }
  }

  // A friendly guard dog — hunts wolves to keep the chickens safe. Dogs don't
  // die; they're only ever replaced when the pack is retired for a bigger one.
  function spawnDog() {
    dogs.push({
      x: player.x + rand(-1.5, 1.5),
      y: player.y + rand(-1.5, 1.5),
      vx: 0, vy: 0,
      attackT: 0,
      bob: Math.random() * Math.PI * 2,
      facingLeft: false,
      variant: Math.floor(Math.random() * DOG_COLORS.length),
      personality: Math.floor(Math.random() * 3), // 0 follow player, 1 patrol, 2 guard chickens
      roamT: 0,
    });
  }
  // Retire any current dogs and field a fresh pack of `dogGen` of them.
  function spawnDogPack() {
    dogs.length = 0;
    for (let i = 0; i < dogGen; i++) spawnDog();
  }

  // Advance every farm by `steps` waves and harvest any that have ripened.
  // A harvested farm stays in place and restarts its growth cycle; the cash
  // it paid is returned so the wave payout can fold it into one message.
  function growFarms(steps) {
    let gold = 0;
    for (const fm of farms) {
      fm.growth += steps;
      // Each farm grows toward the stage count it locked in for this cycle
      // (fm.need). A Farm upgrade taken mid-growth therefore can't make a plot
      // pay early — the smaller stage count only takes effect on the NEXT
      // cycle (re-read below on harvest). The `fm.need > 0` guard also stops
      // an infinite loop if the level were ever pushed past its cap.
      while (fm.need > 0 && fm.growth >= fm.need) {
        gold += farmReward();
        fm.growth -= fm.need;
        fm.need = wavesToFinish(); // next cycle adopts the current upgrade level
      }
    }
    if (gold > 0) playHarvest();
    return gold;
  }

  // Anything stepping onto a farm's tile tramples the crop back to nothing.
  function updateFarms(dt) {
    for (const fm of farms) {
      if (fm.trampleFlash > 0) fm.trampleFlash -= dt;
      let intruded = dist2(player.x, player.y, fm.x, fm.y) < FARM_AREA_R2;
      if (!intruded) for (const w of wolves) {
        if (w.alive && dist2(w.x, w.y, fm.x, fm.y) < FARM_AREA_R2) { intruded = true; break; }
      }
      if (!intruded) for (const c of chickens) {
        if (c.alive && dist2(c.x, c.y, fm.x, fm.y) < FARM_AREA_R2) { intruded = true; break; }
      }
      if (intruded && fm.growth > 0) {
        // Silently restart the crop — no message. A stomp re-locks the stage
        // count too, so a Farm upgrade taken earlier applies from this cycle.
        fm.growth = 0;
        fm.need = wavesToFinish();
        fm.trampleFlash = 0.4;
      }
    }
  }

  // All three events obey the quiet boss window, the post-snow rest day and
  // a rolling five-wave cooldown, including debug-forced events.
  function eventRollFor(kind) {
    const isNight = kind === 'night';
    const st = isNight ? nightEvent : weatherEvents[kind];
    if (wave >= BOSS_WAVE - 2 && wave <= BOSS_WAVE + 1) return false;
    if (snowLeftover > 0 || wave - st.lastWave < EVENT_COOLDOWN_WAVES) return false;
    const forced = isNight ? nightOfWolfDebugForce : st.force;
    if (forced) {
      if (isNight) nightOfWolfDebugForce = false;
      else st.force = false;
      return true;
    }
    const minWave = isNight ? NIGHT_OF_WOLF_MIN_WAVE : WEATHER_MIN_WAVE;
    const maxWave = isNight ? NIGHT_OF_WOLF_MAX_WAVE : WEATHER_MAX_WAVE;
    if (wave >= minWave && wave <= maxWave) {
      const count = isNight ? nightOfWolfCount : st.count;
      const cap = isNight ? NIGHT_OF_WOLF_MAX_PER_RUN : WEATHER_MAX_PER_RUN;
      const chance = isNight ? NIGHT_OF_WOLF_PER_WAVE_CHANCE : WEATHER_PER_WAVE_CHANCE;
      return count < cap && Math.random() < Math.min(1, chance * Math.pow(2, resurrectCount));
    }
    if (wave > maxWave) {
      const blockStart = Math.floor((wave - 1) / 5) * 5 + 1;
      if (st.blockStart !== blockStart) {
        st.blockStart = blockStart;
        // Only schedule a future/remaining eligible wave. In particular, the
        // first endless block cannot accidentally select the excluded wave 51.
        const first = Math.max(wave, blockStart, st.lastWave + EVENT_COOLDOWN_WAVES);
        const remaining = blockStart + 5 - first;
        st.nextWave = remaining > 0 ? first + Math.floor(Math.random() * remaining) : -1;
      }
      return wave === st.nextWave;
    }
    return false;
  }

  function weatherRollFor(kind) { return eventRollFor(kind); }

  // Pick this wave's weather. A night wave stays clear — stacking a blizzard on
  // top of the darkness buries the one visual cue the night is built around.
  function rollWeather() {
    const prev = weather;
    weather = '';
    if (!nightOfWolf) {
      // A debug-forced event is resolved FIRST. Rain is rolled before snow, so
      // without this a random rain hit could quietly preempt a forced snow and
      // the Force Snow button would look broken perhaps one time in six.
      let pick = '';
      if (weatherEvents.rain.force)      pick = weatherRollFor('rain') ? 'rain' : '';
      else if (weatherEvents.snow.force) pick = weatherRollFor('snow') ? 'snow' : '';
      else if (weatherRollFor('rain'))   pick = 'rain';
      else if (weatherRollFor('snow'))   pick = 'snow';
      if (pick === 'rain') {
        weather = 'rain';
        weatherEvents.rain.count++;
        weatherEvents.rain.lastWave = wave;
        toast('A downpour rolls in — the pack is shorting out!', 3.2);
      } else if (pick === 'snow') {
        weather = 'snow';
        weatherEvents.snow.count++;
        weatherEvents.snow.lastWave = wave;
        giveSnowGift();
      }
    }
    if (weather !== prev) {
      // Snow repaints every tile, so the colour cache has to go both ways.
      _tileColorCache.clear();
      rainDrops.length = 0;
      snowFlakes.length = 0;
      // The map changes look wholesale here, so hide the swap behind a wipe
      // rather than popping mid-frame. Slower than the restart wipe (0.22) so
      // the change of weather lands as an event, and long enough to cover the
      // ambience fading in underneath.
      startBlackFade(null, 0.55);
    }
  }

  // Winter gift: a hand-up worth most when the player is broke, so a blizzard
  // is a lifeline on a bad run rather than a bonus on a good one. The cap
  // scales with the wave so it stays meaningful late without being free money.
  //
  //   cap  = wave * 2                 (the most anyone can get)
  //   gift = cap - money / 2          (taper), clamped to [1, cap]
  //
  // which means a player holding 2x the cap is already past the taper and
  // receives the single-coin floor. At wave 15 (cap $30): broke -> $30,
  // $30 in hand -> $15, $60 or more in hand -> $1.
  function snowGiftFor(waveNo, have) {
    const cap = Math.max(1, Math.round(waveNo * SNOW_GIFT_WAVE_MUL));
    return clamp(Math.round(cap - Math.max(0, have) / 2), 1, cap);
  }
  function giveSnowGift() {
    const gift = snowGiftFor(wave, moneyOf(player));
    addSharedMoney(gift);
    toast('Snowfall — a winter gift of $' + gift + '!', 3.2);
  }

  // The weather breaks when the wave is defended — mirrors how Night of the
  // Wolf clears itself and announces it, so an event always has a visible
  // start AND end rather than just quietly stopping at the next wave roll.
  function endWeather() {
    if (!weather) return;
    const was = weather;
    weather = '';
    rainDrops.length = 0;
    snowFlakes.length = 0;
    // A blizzard leaves the farm under a dusting for the next wave rather than
    // snapping straight back to green; snowCover() reports the lighter value
    // and startWave counts it down.
    if (was === 'snow') snowLeftover = SNOW_LEFTOVER_WAVES + 1;
    else snowTrails.length = 0;
    if (was === 'snow') startBlackFade(null, 0.55);
    _tileColorCache.clear(); // repaint the ground at the new cover level
    toast(was === 'rain'
      ? 'The rain passes — the pack steadies itself.'
      : 'The snow stops — a dusting lingers on the farm.', 3.2);
    playNightOfWolfEnd(); // the same soft "it's over" sting the night uses
  }

  // Rain: a wolf's circuits give out and it cooks off where it stands. Hurts
  // the pack around it and anyone standing too close.
  function wolfShortOut(w) {
    spawnBlast(w.x, w.y);
    playExplosion();
    shake = Math.max(shake, 0.26);
    const r2 = RAIN_BLAST_R * RAIN_BLAST_R;
    for (const o of wolves) {
      if (!o.alive || o === w) continue;
      if (dist2(o.x, o.y, w.x, w.y) < r2) {
        const dx = o.x - w.x, dy = o.y - w.y, m = Math.hypot(dx, dy) || 1;
        hurtWolf(o, RAIN_BLAST_DMG, (dx / m) * 0.35, (dy / m) * 0.35);
      }
    }
    explosionHitKeepers(w.x, w.y, RAIN_BLAST_R * 0.6); // stand clear
    w.alive = false;
    spawnSmoke(w.x, w.y, 4);
    checkWaveDefended(); // it removed itself — the wave may now be clear
  }

  // Drop a boot-print if `e` has moved far enough since its last one. Shared
  // by the keepers and the pack so everything walking the farm leaves a track.
  function markSnowTrail(e, big) {
    if (!snowing()) return;
    const lx = e._trailX, ly = e._trailY;
    if (lx !== undefined && dist2(e.x, e.y, lx, ly) < SNOW_TRAIL_STEP * SNOW_TRAIL_STEP) return;
    e._trailX = e.x; e._trailY = e.y;
    if (lx === undefined) return; // first sample just seeds the position
    if (snowTrails.length > 400) snowTrails.shift(); // hard ceiling, oldest first
    snowTrails.push({
      x: e.x, y: e.y,
      ang: Math.atan2(e.y - ly, e.x - lx),
      t: SNOW_TRAIL_LIFE, life: SNOW_TRAIL_LIFE,
      big: !!big,
    });
  }

  function updateSnowTrails(dt) {
    for (let i = snowTrails.length - 1; i >= 0; i--) {
      const s = snowTrails[i];
      s.t -= dt;
      if (s.t <= 0) snowTrails.splice(i, 1);
    }
    if (!snowing()) return;
    markSnowTrail(player, true);
    if (player2.active && !player2.ghost) markSnowTrail(player2, true);
    for (const w of wolves) if (w.alive && !w.parachuting) markSnowTrail(w, false);
  }

  // Per-frame weather tick: short-outs during rain, plus the screen particles.
  function updateWeather(dt) {
    updateSnowTrails(dt);
    if (raining()) {
      for (const w of wolves) {
        if (!w.alive || w.boss || w.parachuting) continue;
        // Only the wolves the rain actually got into cook off. Previously this
        // rolled on EVERY wolf, so even the dry two-thirds blew up and the
        // whole pack looked like it had lost its mind.
        if (!w.defective) continue;
        if (Math.random() < RAIN_SHORT_OUT_PER_SEC * dt) wolfShortOut(w);
      }
    }
    updateWeatherParticles(dt);
  }

  function startWave(skipCount = 1) {
    wave += skipCount;
    advanceNinjaDay();
    // Walls are patched up between waves — chips taken last round don't carry
    // over, so a surviving fence always starts the wave uncracked.
    for (const f of fences) {
      f.maxHp = fenceMaxHp(f);
      f.hp = f.maxHp;
    }
    // Headstones only mark the round in which someone fell (same one-wave life
    // as the hunters' burnt-out fireplace) — but they sink away rather than
    // blinking out of existence. updateGraves finishes the job.
    for (const g of graves) if (!(g.fadeT > 0)) g.fadeT = GRAVE_FADE_T;
    // Age out the post-blizzard dusting.
    if (snowLeftover > 0) {
      snowLeftover--;
      if (snowLeftover === 0) { snowTrails.length = 0; startBlackFade(null, 0.55); }
      _tileColorCache.clear();
    }
    morphChickens();
    // Prune stumps and twigs that have decayed (existed for their allotted wave count).
    for (let i = stumps.length - 1; i >= 0; i--) {
      const s = stumps[i];
      if (s.bornWave !== undefined && wave - s.bornWave >= s.decayWaves) stumps.splice(i, 1);
    }
    for (let i = twigs.length - 1; i >= 0; i--) {
      const t = twigs[i];
      if (t.bornWave !== undefined && wave - t.bornWave >= t.decayWaves) twigs.splice(i, 1);
    }
    // Snapshot the chicken roster so the bonus-screen roll can compute total
    // deaths at wave end. Births during the wave are added in spawnChicken.
    chickensAtWaveStart = 0;
    for (const c of chickens) if (c.alive) chickensAtWaveStart++;
    chickensBornThisWave = 0;
    chickenDeathsThisWave = 0;
    bonusUpgradeShownThisWave = false;
    extraPickUsedThisWave = false;
    extraPickUsedThisWave2 = false;
    // Weapon Oil lasts WEAPON_OIL_WAVES waves per purchase: tick the timer
    // down each new wave and clear all charges once it runs out, so the
    // bar's amber halo holds for several waves instead of a single shot.
    if (weaponOilCharges > 0 && weaponOilWaves > 0) {
      weaponOilWaves--;
      if (weaponOilWaves <= 0) {
        weaponOilCharges = 0;
        recomputeJamChance();
      }
    }
    // Last wave's fence wreckage gets cleared away when the next wave begins —
    // any worker chicken that didn't rebuild in time is out of luck. Same
    // story for the scorched holes left by detonated mines.
    debris.length = 0;
    holes.length = 0;
    // Re-evaluate rooftopper placement so freshly-grown coops can host the
    // sniper, and dropped coops free their slot.
    assignRooftoppers();
    // Farms grow when a wave is defended (see checkWaveDefended); a multi-wave
    // debug skip advances them for the bypassed waves too, paid out silently.
    // Routed through addSharedMoney so Fast mode's 5× (and the co-op split) apply.
    if (skipCount > 1) addSharedMoney(growFarms(skipCount - 1));
    // Night takes priority over weather, but shares its eligibility rules.
    nightOfWolf = false;
    const triggerNight = eventRollFor('night');
    if (triggerNight) {
      nightOfWolf = true;
      nightOfWolfDebugForce = false;
      nightOfWolfCount++;
      nightEvent.lastWave = wave;
      toast('Night of the Wolf — survive the dark!', 3.2);
      playNightOfWolfStart();
    }
    rollWeather();
    // Hunters bill the player at the top of each wave they're present for.
    // Short pay → they pocket what's there and pack up at the end of the wave.
    if (huntersCamps.length && hunters.some(h => h.alive)) {
      const fee = hunterTotalFee();
      if (money >= fee) {
        money -= fee;
        toast('Paid the hunters $' + fee, 1.6);
      } else {
        const taken = Math.max(0, money);
        money = 0;
        huntersLeavePending = true;
        toast('Hunters took your last $' + taken + ' — leaving after this wave', 2.6);
      }
    }
    // Wave 50 is the boss fight — no normal pack spawns; the boss controller
    // (bossTick) drives everything from here.
    if (wave === BOSS_WAVE) { startBossWave(); return; }
    // Wolf count scales with the wave, then is reduced by a factor of 1.5 (at least 1).
    // Wolf-count ramp: linear early on, then damped past wave 15 so the
    // late game doesn't drown the player. At wave 30 this saves ~12 wolves
    // vs the old curve, at wave 50 closer to 30.
    const rampInput = wave <= 15 ? wave * 2.4 : 15 * 2.4 + (wave - 15) * 1.2;
    nextWolves = Math.min(MAX_WOLVES, Math.max(1, Math.round((1 + Math.floor(rampInput)) / 1.5)) + 1);
    // Endless mode (wave 51+) ramps the pack up a little faster each wave.
    if (wave > 51) nextWolves += wave - 51;
    // Calm/Rough Waves shift the NORMAL wolf count (specials are added separately
    // below and stay untouched). Bribe Wolves layers a one-shot multiplier on top
    // for this wave, then rolls its "wave after" bonus into the next one.
    nextWolves = Math.min(MAX_WOLVES, Math.max(1, Math.round(nextWolves * waveWolfMod() * bribeNextWaveMul)));
    bribeNextWaveMul = bribeFollowWaveMul;
    bribeFollowWaveMul = 1;
    waveActive = true;
    waveElapsed = 0;
    // "March of the wolves" cue as the pack sets out. Skipped on Night of the
    // Wolf (its own howl plays) and on multi-wave debug skips.
    if (!triggerNight && skipCount === 1) playWaveStart();
    pendingSpawns += nextWolves;
    // Howl Delay upgrade delays when wolves first appear each wave.
    const spawnDelay = tableAt('wolfDelay') * 1000;
    // Stagger between spawns also stretches past wave 20 — gives the player
    // breathing room when the pack count climbs.
    const spawnStagger = 600 + Math.max(0, wave - 20) * 16;
    // Capture the current run generation — if the run is restarted before a
    // delayed spawn fires, the callback bails out instead of seeding the
    // fresh game with extra wolves.
    const gen = runGen;
    for (let i = 0; i < nextWolves; i++) {
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnWolf();
      }, spawnDelay + i * spawnStagger);
    }
    // Cryptid Radar boosts the per-wave roll for every rare wolf variant —
    // including the moonwalker and the brute (see their rolls below).
    const cryptidMul = CRYPTID_RADAR_MUL[Math.min(5, upgradeLevels.cryptidRadar || 0)];
    if (wave >= NINJA_MIN_WAVE && !pendingNinjaReturn &&
        !wolves.some(w => w.alive && w.ninja) && Math.random() < NINJA_SPAWN_CHANCE * cryptidMul) {
      spawnNinjaWolf();
    }
    // Rare: a fox slips in alongside the pack (6% per wave × cryptid mul).
    // Foxes are scarce in the opening waves (when a snatched chicken hurts
    // most) and ramp up to the full rate by ~wave 12.
    const foxWaveScale = Math.min(1, Math.max(0.12, wave / 12));
    if (Math.random() < 0.12 * cryptidMul * foxWaveScale) {
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnFox();
      }, spawnDelay + 500);
    }
    // Rare: a thing wolf joins the pack — only once Cryptid Radar is maxed.
    if (upgradeLevels.cryptidRadar >= 5 && Math.random() < THING_WOLF_RATE * cryptidMul) {
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnThingWolf();
      }, spawnDelay + 650);
    }
    // Late cryptid — with the radar in play, a lone cryptid sometimes wanders
    // in WELL INTO the wave (back half of the spawn window) rather than only in
    // the opening seconds, so the antennas crackle and beep mid/late wave too.
    // (radarScan pings it the instant it appears.)
    if (upgradeLevels.cryptidRadar > 0 && Math.random() < 0.3 * cryptidMul) {
      const windowEnd = spawnDelay + nextWolves * spawnStagger;
      const lateAt = windowEnd * (0.55 + Math.random() * 0.4); // somewhere in the back half
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnFox();
      }, lateAt);
    }
    // Bomb wolves — slow wall-sappers from wave 25, once 4+ walls stand. One
    // per wave, plus one more every 5 waves past 25.
    if (wave >= BOMB_WALL_WAVE && fences.length >= BOMB_MIN_WALLS) {
      const bombCount = Math.min(120, 1 + Math.floor((wave - BOMB_WALL_WAVE) / 5));
      for (let i = 0; i < bombCount; i++) {
        pendingSpawns++;
        setTimeout(() => {
          if (gen !== runGen) return;
          pendingSpawns--;
          if (gameOver) return;
          spawnBombWolf();
        }, spawnDelay + 800 + i * 900);
      }
    }
    // Brood wolves — from wave 20 every pack contains a brood wolf that drops
    // 3 wandering pups. One every wave, plus one more every 10 waves past start.
    if (wave >= BREEDER_WAVE) {
      const breederCount = Math.min(100, 1 + Math.floor((wave - BREEDER_WAVE) / 10));
      for (let i = 0; i < breederCount; i++) {
        pendingSpawns++;
        setTimeout(() => {
          if (gen !== runGen) return;
          pendingSpawns--;
          if (gameOver) return;
          spawnBreederWolf();
        }, spawnDelay + 1100 + i * 700);
      }
    }
    // Laser wolves — from RANGED_WAVE, a sit-and-shoot beam wolf joins each pack.
    if (wave >= RANGED_WAVE) {
      const rangedCount = Math.min(100, 1 + Math.floor((wave - RANGED_WAVE) / 10));
      for (let i = 0; i < rangedCount; i++) {
        pendingSpawns++;
        setTimeout(() => {
          if (gen !== runGen) return;
          pendingSpawns--;
          if (gameOver) return;
          spawnRangedWolf();
        }, spawnDelay + 1400 + i * 700);
      }
    }
    // Ranged wolves (homing-bullet shooters) — from wave 30, one per pack plus
    // one more every 10 waves past the start.
    if (wave >= HOMER_WAVE) {
      const homerCount = Math.min(100, 1 + Math.floor((wave - HOMER_WAVE) / 10));
      for (let i = 0; i < homerCount; i++) {
        pendingSpawns++;
        setTimeout(() => {
          if (gen !== runGen) return;
          pendingSpawns--;
          if (gameOver) return;
          spawnHomerWolf();
        }, spawnDelay + 1600 + i * 700);
      }
    }
    // Parachute wolf — occasionally one drops in from the sky mid-wave.
    if (wave >= PARACHUTE_WAVE && Math.random() < PARACHUTE_RATE) {
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnParachuteWolf();
      }, spawnDelay + rand(400, 2200));
    }
    // Moonwalker — same rarity as the parachute drop, and like every other
    // cryptid its odds climb with Cryptid Radar.
    if (wave >= MOONWALK_WAVE && Math.random() < MOONWALK_RATE * cryptidMul) {
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnMoonwalkWolf();
      }, spawnDelay + rand(400, 2200));
    }
    // Brute — same rarity again, also radar-boosted.
    if (wave >= BRUTE_WAVE && Math.random() < BRUTE_RATE * cryptidMul) {
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnBruteWolf();
      }, spawnDelay + rand(400, 2200));
    }
    // Missile wolf — wave 51+, an occasional siege brute that bombards coops.
    if (wave >= MISSILE_WOLF_WAVE && coops.length > 0 && Math.random() < MISSILE_WOLF_RATE) {
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnMissileWolf();
      }, spawnDelay + rand(600, 2600));
    }
    // Hunter wolf — a rare keeper-reskin cryptid. At most one every 10 waves.
    // Only ever shows up in a NEW-GAME-PLUS run: the player has to beat the
    // wave-50 boss and hit restart first (restartBonusTier > 0). It never
    // appears on a first playthrough.
    if (restartBonusTier > 0 && wave >= HUNTER_WOLF_MIN_WAVE
        && wave - lastHunterWolfWave >= HUNTER_WOLF_GAP_WAVES
        && Math.random() < HUNTER_WOLF_RATE) {
      lastHunterWolfWave = wave;
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnHunterWolf();
      }, spawnDelay + rand(800, 3200));
    }
    // Ghost wolf — chance grows +2% per player death; appears from wave 3+ onward.
    if (wave >= 3 && ghostWolfChance > 0 && Math.random() < ghostWolfChance) {
      pendingSpawns++;
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver) return;
        spawnGhostWolf();
      }, spawnDelay + rand(1200, 4000));
    }
    // Player-2 cameo — a vanishingly rare solo-run easter egg (see the helper).
    maybeSpawnP2Cameo();
    toast('Wave ' + wave + ': ' + nextWolves + ' wolves!');
    // Coops level up every 5 waves they've stood — each level stacks a floor.
    for (const c of coops) {
      const newLevel = Math.min(MAX_COOP_LEVEL, Math.floor((wave - (c.builtWave || 0)) / 5));
      if (newLevel > (c.level || 0)) c.level = newLevel;
    }
    // Next-wave timer: length grows with wave count
    waveTimer = 12 + wave * 3;
    // Occasionally increase the global wolf level cap so max possible levels
    // trend upward but not deterministically. Chance grows with wave, but more
    // slowly than before so late waves do not ramp speed too hard.
    if (wave > WOLF_TRAIT_START) {
      const extra = wave - WOLF_TRAIT_START;
      const incChance = Math.min(0.30, 0.03 + extra * 0.01);
      if (Math.random() < incChance) {
        // usually +1, rarely +2
        wolfLevelCap += 1 + (Math.random() < 0.08 ? 1 : 0);
        wolfLevelCap = Math.min(500, wolfLevelCap);
      }
    }
  }

  // Wave over: every surviving possessed wolf (blue eye) flips a coin. Heads
  // it burns out and detonates where it stands; tails it sticks around and
  // fights alongside the keeper through the next wave too. Host-authoritative
  // — the guest just sees the result through the wolf snapshot.
  // Returns a short note for the wave-end recap toast (which is a single slot,
  // so the counts ride along with the payout line instead of clobbering it).
  function resolveTurncoats() {
    if (multiplayer && !isHost) return '';
    let kept = 0, blew = 0;
    for (const w of wolves) {
      if (!w.alive || !w.turncoat) continue;
      if (Math.random() < 0.5) { explodeTurncoat(w); blew++; }
      else                     { kept++; }
    }
    let note = '';
    if (blew > 0) note += '  ' + blew + ' possessed burned out';
    if (kept > 0) note += '  ' + kept + ' possessed stayed';
    return note;
  }

  // A possessed wolf going up: a real blast that tears into any wolf nearby.
  // It's an ally, so unlike a pup it never knocks the keeper's hat off.
  function explodeTurncoat(w) {
    spawnBlast(w.x, w.y);
    playExplosion();
    shake = Math.max(shake, 0.28);
    const r2 = PUP_EXPLODE_R * PUP_EXPLODE_R;
    for (const o of wolves) {
      if (!o.alive || o === w || o.turncoat) continue;
      if (dist2(o.x, o.y, w.x, w.y) < r2) {
        const dx = o.x - w.x, dy = o.y - w.y, m = Math.hypot(dx, dy) || 1;
        hurtWolf(o, PUP_EXPLODE_DMG, (dx / m) * 0.35, (dy / m) * 0.35);
      }
    }
    w.alive = false;
  }

  function checkWaveDefended() {
    if (!waveActive) return;
    if (bossWaveActive) return; // the boss fight ends on its own terms (bossTick)
    if (pendingSpawns > 0) return;
    // Count live wolves explicitly (splice may not have run yet this frame).
    // Turncoats fight FOR the keeper, so they don't hold the wave open — the
    // player shouldn't have to execute their own ally to finish a round.
    let live = 0;
    for (const w of wolves) if (w.alive && !w.dpsDummy && !w.turncoat && !ninjaIsWatching(w)) live++;
    if (live > 0) return;

    waveActive = false;
    const turncoatNote = resolveTurncoats();
    if (advancedOilWaves > 0) advancedOilWaves--; // Advanced Oil lasts a single round

    // Each surviving chicken pays $1 (fat ones pay more); the shot-chicken
    // penalty doubles every 5 waves.
    let aliveChickens = 0, grossReward = 0;
    for (const c of chickens) {
      if (!c.alive) continue;
      aliveChickens++;
      grossReward += 1 + fatTierOf(c) * FAT_GOLD_PER_TIER
                       + (c.rich ? RICH_GOLD_BONUS[Math.min(5, upgradeLevels.richChicken)] : 0);
    }
    if (resurrectCount > 0) grossReward = Math.floor(grossReward * Math.max(0.1, 1 - resurrectCount * 0.1));
    // Snapshot total chicken deaths NOW (canonical wave-end moment) so the
    // bonus pick screen reads a stable value even if later cleanup splices
    // entities out before the player picks an upgrade. Uses the MAX of:
    //   - the direct per-death counter (incremented at every killChicken call)
    //   - the births-vs-survivors formula (legacy fallback)
    // — so if either signal misses an edge case, the other catches it.
    const formulaDeaths = Math.max(0, chickensAtWaveStart + chickensBornThisWave - aliveChickens);
    bonusDeathSnapshot = Math.max(chickenDeathsThisWave, formulaDeaths);
    const penaltyMul = Math.pow(2, Math.floor(wave / 5));
    // Each keeper's friendly-fire kills are tracked separately now, so the
    // shared chicken-kill tally is just their sum.
    // Birds the robots shot are in here too: the farm is out a chicken either
    // way, so the fine lands. Only the karma below stays keeper-only.
    const totalShot = chickensKilledByPlayer + (player2.chickensKilledThisWave || 0)
                    + chickensShotByRobots;
    // Farms grow one step per defended wave; ripe ones pay into this payout.
    // Compute farm income FIRST so it factors into the penalty cap below.
    const farmGold = growFarms(1);
    // The friendly-fire fine has NO upper limit anymore — shoot enough of your
    // own flock and it can wipe the whole payout. Only a MINIMUM floor remains,
    // and that floor is doubled (was max($20, 20% income) → now max($40, 40%
    // income)): any friendly fire at all costs at least that much.
    // Penalty: exactly $1 per chicken killed (scaled by wave tier); no floor so
    // it never wipes the full payout for shooting just one bird.
    const roundIncome = grossReward + farmGold;
    const penalty = totalShot * penaltyMul;
    const reward = Math.max(0, grossReward - penalty);
    const farmNote = farmGold > 0 ? '  +$' + farmGold + ' farms' : '';
    // Flag the hunter fee that'll be drawn from the player's pot next wave,
    // so the wave-end recap makes the deduction visible at end-of-wave.
    const hunterStillCamped = huntersCamps.length && hunters.some(h => h.alive) && !huntersLeavePending;
    const hunterNote = hunterStillCamped ? '  -$' + hunterTotalFee() + ' hunters' : '';
    // Night of the Wolf survivors take double pay this wave and earn a purple
    // witch hat on top of their stack. Doubling is applied to both the reward
    // and farm income before the wave-defended toast is formatted.
    // Calm/Rough Waves scale the wave reward (Rough's bonus wins if both owned).
    let payReward = Math.round(reward * waveGoldMod());
    let payFarm = farmGold;
    const nightSurvived = nightOfWolf;
    let witchHatEarned = false;
    if (nightSurvived) {
      payReward *= 2;
      payFarm *= 2;
      // The witch hat now drops on ~80% of survived nights — not a guarantee.
      witchHatEarned = Math.random() < NIGHT_OF_WOLF_WITCH_HAT_CHANCE;
      if (witchHatEarned) {
        playerHats++;
        hatColors.push(NIGHT_OF_WOLF_WITCH_HAT_COLOR);
        if (player2.active) {
          player2.hats = (player2.hats || 0) + 1;
          if (Array.isArray(player2.hatColors)) player2.hatColors.push(NIGHT_OF_WOLF_WITCH_HAT_COLOR);
        }
      }
      playNightOfWolfEnd();
      nightOfWolf = false;
    }
    const farmNote2 = payFarm > 0 ? '  +$' + payFarm + ' farms' : '';
    // In separate-money mode the wave payout splits 50/50 across both keepers;
    // otherwise the legacy single-pot behaviour stays intact.
    addSharedMoney(payReward + payFarm);
    if (payReward > 0) {
      const note = penalty > 0 ? '  (-$' + penalty + ' for ' + totalShot + ' shot' + (totalShot > 1 ? 's' : '') + ')' : '';
      toast('Wave ' + wave + ' defended!  +$' + payReward + ' (' + aliveChickens + ' chickens)' + note + farmNote2 + hunterNote + turncoatNote, 2.2);
    } else if (penalty > 0) {
      toast('Wave ' + wave + ' defended! Payout lost — ' + totalShot + ' chicken' + (totalShot > 1 ? 's' : '') + ' shot' + farmNote2 + hunterNote + turncoatNote, 2.2);
    } else if (payFarm > 0) {
      toast('Wave ' + wave + ' defended!' + farmNote2 + hunterNote + turncoatNote, 2.2);
    } else {
      toast('Wave ' + wave + ' defended! No chickens — no income' + hunterNote + turncoatNote, 2.2);
    }
    if (nightSurvived) {
      toast('Night of the Wolf survived — payout doubled!', 3.2);
    }
    endWeather(); // the rain/snow lifts with the wave, and says so
    advanceKarma(player, chickensKilledByPlayer);
    if (player2.active) advanceKarma(player2, player2.chickensKilledThisWave || 0);
    chickensKilledByPlayer = 0;
    player2.chickensKilledThisWave = 0;
    chickensShotByRobots = 0; // fined above, never fed to advanceKarma
    // Wrap up the hunter camp: if the whole crew is down OR they were short-paid
    // this wave, they break camp. Camp/fireplace transitions are deferred to
    // the wave boundary (mirrors how map expansion is queued) — the active camp
    // is replaced with an extinct fireplace that lingers for one more wave.
    if (huntersCamps.length) {
      const anyAlive = hunters.some(h => h.alive);
      if (!anyAlive || huntersLeavePending) {
        // Leave one cold fireplace behind (the primary camp's remains).
        const c0 = huntersCamps[0];
        extinctCamp = { x: c0.x, y: c0.y, dirtR: c0.dirtR || 1.2, wavesLeft: 1, smokeT: 0 };
        huntersCamps = [];
        hunters.length = 0;
        huntersGroups = 0;
        huntersLeavePending = false;
        // Hunter Gear was paid for this crew — a fresh camp arrives un-geared.
        upgradeLevels.hunterPower = 0;
        upgradeLevels2.hunterPower = 0;
        toast(anyAlive ? 'The hunters packed up and left.' : 'The hunter camps fell silent.', 2.2);
        playHuntersLeave();
      } else {
        // Camps survived the wave — the worn patch around each fireplace creeps out.
        for (const c of huntersCamps) c.dirtR = Math.min(3.0, (c.dirtR || 1.2) + 0.35);
      }
    } else if (extinctCamp) {
      // Cold fireplace ages out one wave after the camp dissolved.
      extinctCamp.wavesLeft -= 1;
      if (extinctCamp.wavesLeft <= 0) extinctCamp = null;
    }
    upgradeDelayT = 2; // game keeps running for 2s after the wave before the upgrade window opens
  }

  // Fire one burst of pellets toward the aim point (the actual discharge).
  // Shorten a beam segment so it ends just in front of the first stone wall it
  // crosses (lasers can't shoot through walls). Returns the clipped endpoint.
  function clipBeamAtWall(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return { x: x2, y: y2 };
    const steps = Math.ceil(len / 0.12);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (stoneFenceBlocks(x1 + dx * t, y1 + dy * t)) {
        const tb = (i - 1) / steps; // stop just before the wall tile
        return { x: x1 + dx * tb, y: y1 + dy * tb };
      }
    }
    return { x: x2, y: y2 };
  }

  // Player-fired beam damage along a straight segment. Hits wolves in the path
  // and friendly-fires any hunters it sweeps (unless `homing` — the bending
  // homing-laser spares allies). Used by the Laser Bullets upgrade — drops the
  // pellet system and shoots like a ranged wolf.
  function applyPlayerBeam(x1, y1, x2, y2, dmg, shooter, homing, cratesHit, robotRef) {
    const shooterObj = robotRef || (shooter === 2 ? player2 : player);
    const sLvls = lvlsFor(shooterObj);
    // Laser beam gets a bit thicker with every Laser Bullets tier — at max
    // the beam reliably clips through wolves it sweeps past.
    const laserLvl = sLvls.laser || 0;
    const thickness = 0.42 + laserLvl * 0.06;
    const t2 = thickness * thickness;
    // Rocket Launcher also owned? Each wolf the beam burns rolls the rocket
    // chance and detonates a blast at that wolf — so the laser keeps its boom.
    const rocketChance = (sLvls.rocket > 0) ? tableAtFor(shooterObj, 'rocket') : 0;
    hurtCratesAlongBeam(x1, y1, x2, y2, dmg, shooter, cratesHit);
    // A beam sweeping across the buddy cameo spooks it into a ghost too.
    if (p2Cameo && !p2Cameo.ghost && segmentDist2(x1, y1, x2, y2, p2Cameo.x, p2Cameo.y) < t2) {
      spookCameo();
    }
    for (const w of wolves) {
      if (!w.alive) continue;
      if (segmentDist2(x1, y1, x2, y2, w.x, w.y) < t2) {
        const dx = w.x - x1, dy = w.y - y1;
        const m = Math.hypot(dx, dy) || 1;
        hurtWolf(w, dmg, (dx / m) * PELLET_KNOCKBACK, (dy / m) * PELLET_KNOCKBACK, shooterObj);
        if (w.alive && rocketChance && Math.random() < rocketChance) rocketBlastAt(w.x, w.y, shooterObj);
      }
    }
    if (gameOpts.friendlyFire && !robotRef) {
      for (const r of robots) if (r.alive && segmentDist2(x1, y1, x2, y2, r.x, r.y) < t2) hurtRobot(r);
    }
    // A robot's laser is as unsafe for the flock as its pellets — though a
    // working unit cuts the beam most of the time, and the birds it does burn
    // are counted against it rather than against the keeper's karma.
    if (robotRef) {
      for (const c of chickens) {
        if (!c.alive || c.savedT > 0 || (c.carrier && c.carrier.alive)) continue;
        if (segmentDist2(x1, y1, x2, y2, c.x, c.y) < t2) {
          if (!(robotRef.crazyT > 0) && Math.random() < ROBOT_SPARE_CHANCE[robotRef.mk]) continue;
          killChicken(c); playChickenDeath(); explodeChickenMaybe(c);
          corpses.push({ x: c.x, y: c.y, kind: 'chicken', t: 4 });
          if (!c.alive) robotChickenKilled(robotRef);
        }
      }
    }
    // Friendly fire: the keeper's beam burns any hunter it sweeps across too —
    // parity with the pellet system, so spraying the laser into your own crew
    // mows them down. Only the bending homing-laser spares allies (it seeks
    // wolves, mirroring how homing pellets pass through hunters).
    // Mirrors the pellet path: the beam only burns the crew when friendly fire
    // is on, and half of the hits that do land are shrugged off.
    if (!robotRef && !homing && gameOpts.friendlyFire && hunters.length) {
      for (const h of hunters) {
        if (!h.alive) continue;
        if (segmentDist2(x1, y1, x2, y2, h.x, h.y) < t2) {
          if (Math.random() < HUNTER_DODGE_CHANCE) continue;
          h.hp -= dmg;
          h.hurtT = 0.18;
          if (h.hp <= 0) onHunterKilled(h, true); // a keeper's beam always counts as a player kill
        }
      }
    }
  }

  // A hunter's laser beam — same hit-scan as the keeper's, but it only burns
  // wolves (never other hunters / keepers). Credits the player for the kill.
  function applyHunterBeam(x1, y1, x2, y2, dmg) {
    const thickness = 0.5, t2 = thickness * thickness;
    for (const w of wolves) {
      if (!w.alive) continue;
      if (segmentDist2(x1, y1, x2, y2, w.x, w.y) < t2) {
        const dx = w.x - x1, dy = w.y - y1;
        const m = Math.hypot(dx, dy) || 1;
        hurtWolf(w, dmg, (dx / m) * PELLET_KNOCKBACK, (dy / m) * PELLET_KNOCKBACK, player);
      }
    }
  }

  // Fire one Laser Bullet shot for `who`. dmgMul scales with Double-Barrel /
  // Last Stand bonuses. The beam is hit-scan: damage resolves immediately,
  // the visual beam fades over the next ~0.22s.
  // Projectile colour. By design ONLY Soft/Hard Bullets recolour shots (and the
  // laser beam); every other upgrade — Rocket, Homing, spread tiers, Laser —
  // leaves them the default yellow.
  function projectileColor(lvls, isSlug) {
    // Late game (via Metaverse) the player can max BOTH Soft AND Hard Bullets —
    // the two tints blend into purple.
    if ((lvls.softBullet || 0) >= 5 && (lvls.hardBullet || 0) >= 5) return '#b06fff'; // purple
    if ((lvls.softBullet || 0) >= 5) return '#7ec7ff'; // pale blue
    if ((lvls.hardBullet || 0) >= 5) return '#ff6a6a'; // soft red
    return isSlug ? '#ffe680' : '#fff3a0';             // default yellow
  }

  // Critical-shot tint — keyed to the CURRENT bullet so a primed crit reads at a
  // glance: full yellow normally, red with Hard Bullet, blue with Soft Bullet,
  // purple once both max into Purple Rain.
  function critColor(lvls) {
    if ((lvls.softBullet || 0) >= 5 && (lvls.hardBullet || 0) >= 5) return '#9b30ff'; // purple rain
    if ((lvls.softBullet || 0) >= 5) return '#2a8bff'; // blue
    if ((lvls.hardBullet || 0) >= 5) return '#ff2020'; // red
    return '#ffd400'; // full yellow
  }

  // Trace a beam from (x,y) along `ang` for `reach` tiles, stopping at the first
  // stone wall. When `bounce` is on (Size Matters MAX) the beam ricochets off an
  // invisible border wall just past the map, returning a chain of segments.
  // Homing + Laser (the Metaverse "homing laser"): trace a beam that BENDS
  // toward the nearest wolf each step, so the beam snakes between enemies.
  // Stops at stone walls. Higher Homing level = sharper bend + longer seek.
  // Homing-laser trace. With `bounce` (Size Matters MAX) the snaking beam also
  // ricochets off stone walls AND the border instead of stopping — so the
  // homing laser and Size Matters ricochet stack.
  function tracedHomingBeam(x, y, ang, reach, homingLvl, bounce) {
    const segs = [];
    let dx = Math.cos(ang), dy = Math.sin(ang);
    let remaining = reach;
    const step = 0.6;
    const hl = Math.min(5, homingLvl || 1);
    const turnPerStep = 0.18 + hl * 0.06;        // sharper bend at higher level
    const seek2 = (HOMING_SEEK_BY_LVL[hl] || 6) * (HOMING_SEEK_BY_LVL[hl] || 6);
    const hitSet = new Set(); // don't keep yanking toward a wolf already swept
    // A beam aimed at a crate reaches it before bending toward the pack.
    let crateTarget = supplyCrateAlongSegment(x, y, x + dx * reach, y + dy * reach, 0.55);
    const B = HALF_MAP + SIZE_MATTERS_BOUNCE_PAD;
    let guard = 0;
    while (remaining > 0.05 && guard++ < 120) {
      // Steer toward the nearest not-yet-passed wolf in seek range.
      let best = null, bd = seek2;
      for (const w of wolves) {
        if (!w.alive || w.fox || w.parachuting || hitSet.has(w)) continue;
        const d = dist2(w.x, w.y, x, y);
        if (d < bd) { bd = d; best = w; }
      }
      if (crateTarget && !hitSet.has(crateTarget)) {
        best = crateTarget;
        bd = dist2(best.x, best.y, x, y);
        if (bd < 0.55 * 0.55) { hitSet.add(best); crateTarget = null; }
      }
      if (best) {
        if (bd < 0.7 * 0.7) hitSet.add(best); // close enough — release and seek the next
        const tAng = Math.atan2(best.y - y, best.x - x);
        const cur = Math.atan2(dy, dx);
        let diff = tAng - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const na = cur + Math.max(-turnPerStep, Math.min(turnPerStep, diff));
        dx = Math.cos(na); dy = Math.sin(na);
      }
      // Border ricochet (only when bouncing) — clip the step at the border wall.
      let segLen = Math.min(step, remaining), willBounce = false, axis = null;
      if (bounce) {
        let tBorder = Infinity;
        if (dx > 1e-6)       { const t = (B - x) / dx;  if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'x'; } }
        else if (dx < -1e-6) { const t = (-B - x) / dx; if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'x'; } }
        if (dy > 1e-6)       { const t = (B - y) / dy;  if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'y'; } }
        else if (dy < -1e-6) { const t = (-B - y) / dy; if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'y'; } }
        if (tBorder < segLen) { segLen = tBorder; willBounce = true; }
      }
      const ex = x + dx * segLen, ey = y + dy * segLen;
      const clipped = clipBeamAtWall(x, y, ex, ey);
      const hitWall = (Math.abs(clipped.x - ex) > 1e-4 || Math.abs(clipped.y - ey) > 1e-4);
      segs.push({ x1: x, y1: y, x2: clipped.x, y2: clipped.y });
      remaining -= Math.hypot(clipped.x - x, clipped.y - y);
      if (hitWall) {
        if (!bounce) break;
        const eps = 0.14;
        const blockX = stoneFenceBlocks(clipped.x + dx * eps, clipped.y);
        const blockY = stoneFenceBlocks(clipped.x, clipped.y + dy * eps);
        if (blockX) dx = -dx;
        if (blockY) dy = -dy;
        if (!blockX && !blockY) { dx = -dx; dy = -dy; }
        x = clipped.x + dx * 0.06; y = clipped.y + dy * 0.06; // step off the wall
      } else if (willBounce) {
        x = ex; y = ey;
        if (axis === 'x') dx = -dx; else dy = -dy; // ricochet off the border
        x += dx * 0.02; y += dy * 0.02;
      } else {
        x = ex; y = ey;
      }
    }
    return segs;
  }

  function tracedBeamSegments(x, y, ang, reach, bounce) {
    const segs = [];
    let dx = Math.cos(ang), dy = Math.sin(ang);
    let remaining = reach;
    const B = HALF_MAP + SIZE_MATTERS_BOUNCE_PAD;
    let guard = 0;
    while (remaining > 0.05 && guard++ < 16) {
      let tBorder = Infinity, axis = null;
      if (bounce) {
        if (dx > 1e-6)       { const t = (B - x) / dx;  if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'x'; } }
        else if (dx < -1e-6) { const t = (-B - x) / dx; if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'x'; } }
        if (dy > 1e-6)       { const t = (B - y) / dy;  if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'y'; } }
        else if (dy < -1e-6) { const t = (-B - y) / dy; if (t > 0.01 && t < tBorder) { tBorder = t; axis = 'y'; } }
      }
      let segLen = remaining, willBounce = false;
      if (bounce && tBorder < remaining) { segLen = tBorder; willBounce = true; }
      const ex = x + dx * segLen, ey = y + dy * segLen;
      const clipped = clipBeamAtWall(x, y, ex, ey);
      const hitWall = (Math.abs(clipped.x - ex) > 1e-4 || Math.abs(clipped.y - ey) > 1e-4);
      segs.push({ x1: x, y1: y, x2: clipped.x, y2: clipped.y });
      const traveled = Math.hypot(clipped.x - x, clipped.y - y);
      remaining -= traveled;
      if (hitWall) {
        // Size Matters MAX: ricochet off the stone wall instead of stopping.
        if (!bounce) break;
        const eps = 0.14;
        const blockX = stoneFenceBlocks(clipped.x + dx * eps, clipped.y);
        const blockY = stoneFenceBlocks(clipped.x, clipped.y + dy * eps);
        if (blockX) dx = -dx;
        if (blockY) dy = -dy;
        if (!blockX && !blockY) { dx = -dx; dy = -dy; }
        x = clipped.x + dx * 0.06; y = clipped.y + dy * 0.06; // step off the wall
      } else if (willBounce) {
        x = ex; y = ey;
        if (axis === 'x') dx = -dx; else dy = -dy; // ricochet off the border
        x += dx * 0.02; y += dy * 0.02;
      } else break;
    }
    return segs;
  }

  function fireLaserShot(who, dmgMul, opts) {
    dmgMul = dmgMul || 1;
    opts = opts || {};
    const lvls = lvlsFor(who);
    const lvl = Math.min(5, lvls.laser);
    // Hard Bullets and the Quickdraw double-damage shot fold into the beam,
    // mirroring how the pellet path consumes them.
    let dmgScale = dmgMul * lastStandDmgMul(who);
    if (lvls.hardBullet > 0) dmgScale *= tableAtFor(who, 'hardBullet');
    if (who.spinDmg) { dmgScale *= SPIN_DMG_MUL; who.spinDmg = false; }
    // Critical reload: harder-hitting AND longer-reaching beam.
    const isCrit = (who.critShots || 0) > 0;
    if (isCrit) { dmgScale *= RELOAD_SC_CRIT_DMG; who.critShots--; playCritShot(); }
    const baseDmg = LASER_DMG[lvl] * dmgScale;
    const baseRange = LASER_RANGE[lvl];
    // Longer Barrel still matters — adds a small reach bonus per range pick.
    // Size Matters adds a BIG flat reach bonus per level (lasers have no
    // lifetime to extend), and at MAX lets the beam ricochet off the border.
    let reach = (baseRange + (lvls.range || 0) * 0.35 + (lvls.sizeMatters || 0) * SIZE_MATTERS_LASER_RANGE) * (isCrit ? RELOAD_SC_CRIT_RANGE : 1);
    const sizeBounce = (lvls.sizeMatters || 0) >= 5;
    const homingBend = (lvls.homing || 0) > 0; // Metaverse homing laser: the beam snakes between wolves
    const aim = (who === player) ? aimAngle() : (who.dir || 0);
    if (who === player) who.dir = aim;
    // Start the beam at the visible muzzle, not the body centre.
    const muzzle = barrelTipOffset(who);
    const shooterId = who.robot ? 'robot' : who === player2 ? 2 : 1;
    const beamColor = projectileColor(lvls, false); // yOff 18 lifts it to the barrel tip
    // The spread pattern reshapes the laser, mirroring the shotgun:
    //  - Loose Pattern → a FAN of several thinner beams across the spread arc.
    //  - Tight Pattern → a single concentrated beam, longer reach + more damage.
    const ss = spreadStatsFor(who);
    const loose = (lvls.spreadUp || 0) > 0;
    const tight = (lvls.spreadDown || 0) > 0;
    const doubleHelix = loose && tight;
    const HELIX_FAN = 0.34; // radians between the three Double Helix beams
    let beamCount = 1, arc = 0, dmgPer = baseDmg, helixDirs = null;
    if (doubleHelix) {
      // Double Helix: the beam splits into THREE concentrated tight beams fanned
      // left / centre / right (mirrors the pellet Double Helix).
      reach *= 1.4;
      dmgPer = baseDmg * 1.5;
      helixDirs = [-HELIX_FAN, 0, HELIX_FAN];
      beamCount = 3;
    } else if (loose) {
      beamCount = Math.max(2, Math.min(ss.count, 7)); // a fan, capped so it stays readable
      arc = ss.spread;
      dmgPer = baseDmg * 0.6;                          // each beam is weaker
    } else if (tight) {
      reach *= 1.4;                                    // reaches further
      dmgPer = baseDmg * 1.5;                          // and hits harder
    }
    for (let i = 0; i < beamCount; i++) {
      const a = helixDirs ? (aim + helixDirs[i])
                          : aim + (beamCount > 1 ? (i / (beamCount - 1)) * 2 - 1 : 0) * arc * 0.5;
      const bx1 = who.x + Math.cos(a) * muzzle;
      const by1 = who.y + Math.sin(a) * muzzle;
      // Clip the beam at the first stone wall in its path — lasers can't pass
      // through walls (the visual + damage both stop at the wall face). At Size
      // Matters MAX the beam also ricochets off the border into a chain of
      // segments; otherwise it's a single straight segment. For Double Helix the
      // two LATERAL beams always fire straight — only the centre beam homes AND
      // ricochets.
      const isCenter = !helixDirs || helixDirs[i] === 0;
      const useHoming = homingBend && isCenter;
      const useBounce = sizeBounce && isCenter; // only the middle helix beam ricochets
      const segs = useHoming
        ? tracedHomingBeam(bx1, by1, a, reach, lvls.homing, useBounce)
        : tracedBeamSegments(bx1, by1, a, reach, useBounce);
      const cratesHit = new Set();
      for (const s of segs) {
        applyPlayerBeam(s.x1, s.y1, s.x2, s.y2, dmgPer, shooterId, useHoming, cratesHit, who.robot ? who : null);
        beams.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, t: 0, life: 0.22, color: beamColor, yOff: 18 });
      }
    }
    who.runT = 0;
    playLaser();
    shake = Math.max(shake, 0.12);
  }

  // Machine-gun magazine size — a fixed MG_MAG (machineGun level only speeds up
  // the fire rate, not the mag), plus MINIGUN_MAG_PER_LVL rounds for every
  // Minigun tier owned.
  function mgMagSize(who) {
    return MG_MAG + (lvlsFor(who).minigun || 0) * MINIGUN_MAG_PER_LVL;
  }

  // True while the keeper has held position long enough to crouch into the
  // Last Stand buff. Stealth is a strict superset (crouched + no-shoot).
  function lastStandCrouched(who) {
    const lvls = lvlsFor(who);
    return (lvls.lastStand || 0) > 0 && (who.lastStandIdleT || 0) >= LAST_STAND_CHARGE;
  }
  // Taking a hit knocks the keeper out of the Last Stand pose — the crouch
  // charge (and any cloak) resets and has to be rebuilt by standing still.
  function breakLastStand(who) {
    who.transcendStandT = 0;
    who.lastStandIdleT = 0;
    who.lastStandNoShootT = 0;
    who.lastStandStealth = false;
  }
  function lastStandDmgMul(who) {
    if (!lastStandCrouched(who)) return 1;
    const lvl = lvlsFor(who).lastStand;
    return LAST_STAND_DMG_MUL[Math.min(5, lvl)];
  }
  function lastStandFireMul(who) {
    if (!lastStandCrouched(who)) return 1;
    const lvl = lvlsFor(who).lastStand;
    return LAST_STAND_FIRE_MUL[Math.min(5, lvl)];
  }

  // World-tile distance from a keeper's body centre to the muzzle of their
  // barrel along the current aim. Mirrors the visual `barrelLength` used in
  // drawKeeperWeapon (16 + range × 0.6 screen px) so projectiles spawn at
  // the tip of the gun rather than 0.3 tiles in front of the body — and
  // the offset grows with every Longer Barrel pick.
  function barrelTipOffset(who) {
    const lvls = lvlsFor(who);
    const barrelPx = (16 + Math.min((lvls.range || 0) + (lvls.sizeMatters || 0) * SIZE_MATTERS_BARREL_MUL, MAX_RANGE_LEVEL) * 0.6) * barrelBonusMul;
    const a = who.dir || 0;
    const dirX = Math.cos(a), dirY = Math.sin(a);
    // Iso projection: 1 world tile in aim direction projects to this many
    // screen pixels. Normalise so `barrelPx / screenPerTile` lands in tiles.
    const sxv = (dirX - dirY) * TILE_W / 2;
    const syv = (dirX + dirY) * TILE_H / 2;
    const screenPerTile = Math.hypot(sxv, syv) || 1;
    return barrelPx / screenPerTile;
  }

  function fireBurst(dmgMul = 1, opts = {}) {
    player.jamFlashT = 0; // a real shot fired — clear any lingering dud-jam flash
    // Laser Bullets: the burst is replaced by a single hit-scan beam. Skips
    // the pellet spawn entirely — laser fires take precedence over Rocket
    // and Homing, since the bullet itself is gone.
    if (upgradeLevels.laser > 0) {
      fireLaserShot(player, dmgMul, opts);
      return;
    }
    playShotgun();
    player.runT = 0; // firing breaks the run — momentum has to build back up
    // At Tighter Pattern MAX it fires a single piercing slug instead of pellets.
    const isSlug = upgradeLevels.spreadDown >= MAX_LEVEL;
    const loose = upgradeLevels.spreadUp > 0;     // Loose Pattern: weaker, smaller pellets
    const tighter = upgradeLevels.spreadDown > 0; // Tighter Pattern: harder-hitting pellets
    // Double Helix (Loose + Tighter both owned): fires like a TIGHT shot — harder
    // hits, tight grouping — but tripled across three fanned directions below.
    const doubleHelix = loose && tighter;
    let pelletDmg = isSlug ? (5 + upgradeLevels.spreadDown2 * 2) : doubleHelix ? 1.3 : loose ? 0.7 : tighter ? 1.3 : 1;
    const pelletR   = isSlug ? 3.5 : doubleHelix ? TIGHT_PELLET_R : loose ? 1.3 : (tighter ? TIGHT_PELLET_R : 2);
    // Soft Bullet: per-pellet chance to pass through a chicken without harm.
    // Hard Bullet: scaling damage multiplier vs wolves. Mutually exclusive.
    const spareChance = upgradeLevels.softBullet > 0 ? tableAt('softBullet') : 0;
    if (upgradeLevels.hardBullet > 0) pelletDmg *= tableAt('hardBullet');
    // Quickdraw MAX: the shot fired right after a twirl reload hits triple as hard.
    if (player.spinDmg) { pelletDmg *= SPIN_DMG_MUL; player.spinDmg = false; }
    // Critical reload: the shot fired after hitting the centre crit zone hits
    // RELOAD_SC_CRIT_DMG× harder AND flies RELOAD_SC_CRIT_RANGE× farther. The
    // machine gun primes a whole burst (CRIT_MG_SHOTS) of these.
    const isCrit = (player.critShots || 0) > 0;
    if (isCrit) { pelletDmg *= RELOAD_SC_CRIT_DMG; player.critShots--; playCritShot(); }
    const critCol = isCrit ? critColor(upgradeLevels) : null; // crit tint keyed to current bullet
    if (upgradeLevels.doubleBarrel > 0) pelletDmg *= tableAt('doubleBarrel');
    pelletDmg *= dmgMul; // Double-Barrel passes 2 — its twin blast hits harder
    pelletDmg *= lastStandDmgMul(player); // Last Stand crouch bonus, if any
    if (upgradeLevels.machineGun > 0) pelletDmg *= MG_DMG_MUL; // softer machine-gun rounds
    // Only Soft/Hard Bullets recolour shots — everything else stays yellow.
    const pelletColor = projectileColor(upgradeLevels, isSlug);
    // Rocket Launcher: each pellet carries an explode-on-death chance. Right
    // click forces it to 1.0 via opts.rocketBoom so the burst always detonates.
    const rocketLvl = upgradeLevels.rocket;
    const rocketBoom = !!opts.rocketBoom;
    const rocketChance = rocketBoom ? 1 : (rocketLvl > 0 ? tableAt('rocket') : 0);
    if (rocketLvl > 0) playRocketWhoosh(); // launcher rounds leave with a jet whoosh
    // Homing Bullets: pellets fly slower, live longer, and each rolls a
    // chance to lock onto the nearest wolf and steer toward it.
    const homingLvl = upgradeLevels.homing;
    const aim = aimAngle();
    // Project pellets out of the visible muzzle (scales with Longer Barrel).
    player.dir = aim;
    const reach = barrelTipOffset(player);
    let speedBase = 18 * (homingLvl > 0 ? HOMING_SPEED_MUL : 1) * (rocketLvl > 0 ? ROCKET_SPEED_MUL : 1)
               * (weaponOilCharges > 0 ? WEAPON_OIL_SPEED_MUL : 1); // oil = faster rounds
    if (upgradeLevels.machineGun > 0) speedBase *= 0.5; // machine-gun rounds fly slower
    if (tighter && !isSlug) speedBase *= TIGHT_SPEED_MUL; // Tighter Pattern rounds fly faster
    const lifeMul = homingLvl > 0 ? HOMING_LIFE_MUL : 1;
    const sizeLife = sizeMattersLifeBonus(player);     // Size Matters: longer-lived shots
    const sizeBounce = (upgradeLevels.sizeMatters || 0) >= 5; // MAX: ricochet off the map edge
    const critRange = isCrit ? RELOAD_SC_CRIT_RANGE : 1;     // crit shots reach farther
    // statusPotencyMul doubles both in a blizzard (statusEffectDur does the same
    // for how long the chill/burn lasts).
    const coldChance = Math.min(1, COLD_HOT_CHANCE[Math.min(5, upgradeLevels.coldShot || 0)] * statusPotencyMul());
    const hotChance  = Math.min(1, COLD_HOT_CHANCE[Math.min(5, upgradeLevels.hotShot  || 0)] * statusPotencyMul());
    const coldDur = statusEffectDur(upgradeLevels.coldShot || 0);  // 3s → 7s at max
    const hotDur  = statusEffectDur(upgradeLevels.hotShot || 0);
    // Double Helix splits into THREE tight clusters fanned left / centre / right
    // (like the boss's 3-way laser); everything else fires a single cluster.
    const tightLvl = Math.min(upgradeLevels.spreadDown, MAX_LEVEL);
    const HELIX_FAN = 0.34; // radians between the three directions
    const clusterCount  = doubleHelix ? TIGHT_BULLETS[tightLvl] : pelletCount;
    const clusterSpread = doubleHelix ? (TIGHT_SPREAD[tightLvl] * Math.PI / 180) : shotgunSpread;
    const helixDirs     = doubleHelix ? [-HELIX_FAN, 0, HELIX_FAN] : [0];
    for (const dirOff of helixDirs) {
      const clusterAim = aim + dirOff;
      for (let i = 0; i < clusterCount; i++) {
        const t = clusterCount > 1 ? (i / (clusterCount - 1)) * 2 - 1 : 0; // -1 .. +1
        const jitter = rand(-clusterSpread, clusterSpread) * 0.12;
        const a = clusterAim + t * clusterSpread + jitter;
        const sp = speedBase + rand(-2, 2) * (homingLvl > 0 ? HOMING_SPEED_MUL : 1);
        pellets.push({
          x: player.x + Math.cos(aim) * reach,
          y: player.y + Math.sin(aim) * reach,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: (shotgunLife * lifeMul + sizeLife) * critRange,
          dmg: pelletDmg,
          pierce: isSlug ? (10 + upgradeLevels.spreadDown2 * 3) : 1,
          hit: isSlug ? new Set() : null,
          spareChance: spareChance,
          r: rocketLvl > 0 ? pelletR * ROCKET_PELLET_R_MUL : pelletR,
          color: pelletColor,
          trail: !isSlug,
          shooter: 1,
          crit: false,  // crit rounds now look like normal bullets (only damage differs)
          critCol: null,
          bounce: sizeBounce,
          cold: coldChance > 0 && Math.random() < coldChance, coldDur,
          hot: hotChance > 0 && Math.random() < hotChance, hotDur,
          rocket: rocketLvl > 0,
          rocketChance,
          rocketBoom,
          homing: homingLvl > 0,
          homingLvl,
          homingTarget: null,
        });
      }
    }
    shake = 0.15;
  }

  // Shove the player backward from their aim — double-barrel recoil.
  function knockbackPlayer(dist) {
    const nx = player.x - Math.cos(player.dir) * dist;
    const ny = player.y - Math.sin(player.dir) * dist;
    if (!fenceBlocks(nx, player.y)) player.x = nx;
    if (!fenceBlocks(player.x, ny)) player.y = ny;
    player.x = clamp(player.x, -HALF_MAP + 1, HALF_MAP - 1);
    player.y = clamp(player.y, -HALF_MAP + 1, HALF_MAP - 1);
  }

  // Rocket fire whoosh — reuses the Rocket Boots jet sound, throttled so a
  // fast machine-gun-based launcher doesn't stack a hundred whooshes a second.
  let _rocketSfxT = 0;
  function playRocketWhoosh() {
    const nowS = ((typeof performance !== 'undefined' ? performance.now() : Date.now())) / 1000;
    if (nowS - _rocketSfxT < 0.18) return;
    _rocketSfxT = nowS;
    playRocketBoots();
  }

  // Rocket Launcher: a pellet only detonates when it actually CONTACTS a wolf
  // or hunter (p.didHit). A pellet that simply flies out its range / leaves the
  // map / hits a fence does NOT explode — not even a right-click guaranteed one.
  // On a contact boom, hurt every wolf inside ROCKET_EXPLODE_R and credit the
  // shooter so kills score correctly.
  // A single rocket detonation at (x,y): the blast FX + area damage to every
  // wolf in radius, credited to `shooter`. Shared by rocket pellets and (when
  // the keeper also owns Rocket Launcher) Laser Shots that strike a wolf.
  function rocketBlastAt(x, y, shooter) {
    spawnBlast(x, y);
    playRocketExplosion(); // quieter + thinned: a burst can land a dozen of these
    const r2 = ROCKET_EXPLODE_R * ROCKET_EXPLODE_R;
    for (const w of wolves) {
      if (!w.alive) continue;
      if (dist2(w.x, w.y, x, y) >= r2) continue;
      const dx = w.x - x, dy = w.y - y;
      const m = Math.hypot(dx, dy) || 1;
      hurtWolf(w, ROCKET_EXPLODE_DMG, (dx / m) * 0.3, (dy / m) * 0.3, shooter);
    }
  }
  function maybeRocketExplode(p) {
    if (!p || !p.didHit) return; // no end-of-life detonation
    if (!(p.rocketBoom || (p.rocketChance && Math.random() < p.rocketChance))) return;
    rocketBlastAt(p.x, p.y, p.robotRef || (p.shooter === 2 ? player2 : player));
  }

  // Gunsmoke: a few drifting puffs at a world position (the gun muzzle).
  function spawnSmoke(wx, wy, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      smoke.push({
        x: wx, y: wy,
        vx: Math.cos(a) * rand(0.1, 0.5),
        vy: Math.sin(a) * rand(0.1, 0.5),
        t: 0,
        life: rand(0.45, 0.8),
        r: rand(1.8, 3.4),
      });
    }
  }

  // A hat arcing onto a keeper's head. `to` is the keeper it flies to and
  // defaults to player 1 — crate loot needs to be able to land on the buddy
  // instead, so the destination can no longer be hard-coded.
  function spawnFlyHat(wx, wy, color, to, delay) {
    flyHats.push({ fromWx: wx, fromWy: wy, color, t: -(delay || 0), life: 0.55,
                   to: to || player,
                   spin: (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 8), rot: 0 });
  }

  // Headstones sinking away after the wave they belong to ended. Host-side
  // only in multiplayer — the guest reads fadeT straight off the snapshot.
  function updateGraves(dt) {
    for (let i = graves.length - 1; i >= 0; i--) {
      const g = graves[i];
      if (!(g.fadeT > 0)) continue;
      g.fadeT -= dt;
      if (g.fadeT <= 0) graves.splice(i, 1);
    }
  }

  function updateFlyHats(dt) {
    for (let i = flyHats.length - 1; i >= 0; i--) {
      const fh = flyHats[i];
      fh.t += dt;
      fh.rot += fh.spin * dt;
      if (fh.t >= fh.life) flyHats.splice(i, 1);
    }
    for (let i = pendingHatLandings.length - 1; i >= 0; i--) {
      const ph = pendingHatLandings[i];
      ph.delayT -= dt;
      if (ph.delayT > 0) continue;
      if (ph.to === player2 && player2.active) {
        if ((player2.hats || 0) < MAX_HATS) {
          player2.hats = (player2.hats || 0) + 1;
          if (Array.isArray(player2.hatColors)) player2.hatColors.push(ph.color);
        }
        pendingHatLandings.splice(i, 1);
      } else if (playerHats < MAX_HATS) {
        playerHats++;
        hatColors.push(ph.color);
        pendingHatLandings.splice(i, 1);
      }
    }
  }

  function drawFlyHats() {
    if (!flyHats.length) return;
    for (const fh of flyHats) {
      if (fh.t < 0) continue; // staggered launch — not in the air yet
      const dest = (fh.to === player2 && player2.active) ? player2 : player;
      const pp = worldToScreen(dest.x, dest.y);
      const px = pp.x, py = pp.y + TILE_H / 2 - 34; // top-hat height on the head
      const prog = clamp(fh.t / fh.life, 0, 1);
      const fp = worldToScreen(fh.fromWx, fh.fromWy);
      const sx = fp.x, sy = fp.y + TILE_H / 2;
      // Quadratic bezier: arc over the scene with a raised control point
      const cpx = (sx + px) / 2, cpy = Math.min(sy, py) - 40;
      const bx = (1-prog)*(1-prog)*sx + 2*prog*(1-prog)*cpx + prog*prog*px;
      const by = (1-prog)*(1-prog)*sy + 2*prog*(1-prog)*cpy + prog*prog*py;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(fh.rot);
      drawHat(0, 0, fh.color, false, true);
      ctx.restore();
    }
  }

  function _scatterHatsAt(wx, wy, dashX, dashY, dashT, hatN, getColor) {
    const prog = 1 - clamp(dashT / PLAYER_DASH_DUR, 0, 1);
    const frac = Math.sin(prog * Math.PI);
    const pp = worldToScreen(wx, wy);
    const pcx = pp.x, pcy = pp.y + TILE_H / 2;
    const dxS = dashX * TILE_W / 2 - dashY * TILE_W / 2;
    const dyS = dashX * TILE_H / 2 + dashY * TILE_H / 2;
    const dLen = Math.hypot(dxS, dyS) || 1;
    for (let i = 0; i < hatN; i++) {
      const by = pcy - 34 - i * 5;
      const scatter = frac * (i + 1) * 9;
      const rise    = frac * (i + 1) * 5;
      const rot     = frac * (0.7 + i * 0.45) * ((i % 2 === 0) ? 1 : -1);
      ctx.save();
      ctx.translate(pcx - dxS / dLen * scatter, by - dyS / dLen * scatter - rise);
      ctx.rotate(rot);
      drawHat(0, 0, getColor(i), false, i === hatN - 1);
      ctx.restore();
    }
  }

  function drawDashHats() {
    // Player 1's own dash scatter.
    const dt1 = player.dashT || 0;
    if (dt1 > 0 && !player.ghost && !player.dying) {
      const isGuestSelf = multiplayer && !isHost;
      _scatterHatsAt(player.x, player.y, player.dashX || 0, player.dashY || 0, dt1,
        playerHats, i => isGuestSelf && (!hatColors[i] || hatColors[i] === '#5a3825')
          ? GUEST_HAT_COLOR : (hatColors[i] || '#5a3825'));
    }
    // Player 2's dash scatter (buddy visible on both screens via synced dashT).
    const dt2 = player2.dashT || 0;
    if (dt2 > 0 && player2.active && !player2.ghost && !player2.dying) {
      const hatCount = Math.max(0, player2.hats || 0);
      const haveColors = Array.isArray(player2.hatColors) && player2.hatColors.length > 0;
      const fallbackHat = isHost ? GUEST_HAT_COLOR : '#5a3825';
      _scatterHatsAt(player2.x, player2.y, player2.dashX || 0, player2.dashY || 0, dt2,
        hatCount, i => {
          const color = haveColors ? (player2.hatColors[i] || fallbackHat) : fallbackHat;
          return isHost && color === '#5a3825' ? GUEST_HAT_COLOR : color;
        });
    }
  }

  function updateSmoke(dt) {
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.t >= s.life) smoke.splice(i, 1);
    }
  }

  // A fat-chicken burst, shown as the white melee-swing ring. Visual only —
  // callers play `playExplosion()` themselves so the karma-resurrect sweep
  // (which spawns ~100 of these at once) can collapse to a single boom.
  // A temporary scorch mark any explosion burns into the grass — fades back to
  // green over a few seconds (the dirt mechanic, but transient). Nearby blasts
  // refresh an existing mark instead of stacking dozens of overlapping decals.
  function spawnScorch(wx, wy) {
    for (const s of scorches) {
      if (Math.abs(s.x - wx) < 0.6 && Math.abs(s.y - wy) < 0.6) { s.t = 0; return; }
    }
    if (scorches.length > 60) scorches.shift(); // safety cap
    scorches.push({ x: wx, y: wy, t: 0, life: 6, r: rand(7, 10) });
  }
  function updateScorches(dt) {
    for (let i = scorches.length - 1; i >= 0; i--) {
      scorches[i].t += dt;
      if (scorches[i].t >= scorches[i].life) scorches.splice(i, 1);
    }
  }
  function drawScorch(s) {
    const p = worldToScreen(s.x, s.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const a = (1 - s.t / s.life) * 0.5;
    ctx.fillStyle = 'rgba(30,20,10,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(cx, cy, s.r, s.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,6,3,' + (a * 0.8).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(cx, cy, s.r * 0.55, s.r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function spawnBlast(wx, wy, col) {
    spawnScorch(wx, wy);
    blasts.push({ x: wx, y: wy, t: 0, life: MELEE_ANIM_DUR, col: col || null });
    // Shove any nearby keeper away from the blast. Same kind of nudge the
    // Double-Barrel right-click gives the firer, but driven by distance from
    // the explosion centre instead of the player's aim.
    const KNOCK_R = 3.2;
    const KNOCK_MAX = 1.2;
    const candidates = player2.active ? [player, player2] : [player];
    for (const p of candidates) {
      if (!p || p.ghost) continue;
      const dx = p.x - wx, dy = p.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= KNOCK_R * KNOCK_R) continue;
      const d = Math.sqrt(d2) || 0.001;
      const t = 1 - d / KNOCK_R;
      const push = KNOCK_MAX * t;
      const nx = p.x + (dx / d) * push;
      const ny = p.y + (dy / d) * push;
      if (!fenceBlocks(nx, p.y)) p.x = nx;
      if (!fenceBlocks(p.x, ny)) p.y = ny;
      p.x = clamp(p.x, -HALF_MAP + 1, HALF_MAP - 1);
      p.y = clamp(p.y, -HALF_MAP + 1, HALF_MAP - 1);
    }
  }
  function updateBlasts(dt) {
    for (let i = blasts.length - 1; i >= 0; i--) {
      blasts[i].t += dt;
      if (blasts[i].t >= blasts[i].life) blasts.splice(i, 1);
    }
  }

  // Ranged-wolf laser beams. Each beam is a fixed straight segment that
  // fades out over its short lifetime. Damage is applied once at creation
  // (see applyBeamDamage); after that the beam is purely cosmetic.
  const beams = [];
  function updateBeams(dt) {
    for (let i = beams.length - 1; i >= 0; i--) {
      beams[i].t += dt;
      if (beams[i].t >= beams[i].life) beams.splice(i, 1);
    }
  }
  // Squared distance from point (px,py) to the line segment (x1,y1)-(x2,y2).
  function segmentDist2(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cxp = x1 + t * dx, cyp = y1 + t * dy;
    const ddx = px - cxp, ddy = py - cyp;
    return ddx * ddx + ddy * ddy;
  }
  // Apply laser damage along a beam segment. Knocks a hat off any keeper the
  // beam passes through and kills any chicken within the beam thickness.
  // A hunter dropped to 0 HP. The camp only breaks when a KEEPER is the one
  // who killed them (`byPlayer`) — a wolf chewing one down is shrugged off. At
  // max Hunter Gear the crew holds the line even on a player kill.
  function onHunterKilled(h, byPlayer) {
    h.alive = false;
    playHunterDeath();
    // Topple like a felled keeper — the corpse is dropped once the fall lands
    // (see tickHunterDeaths). It stops acting immediately (alive = false).
    h.dying = true;
    h.downT = 0;
    if (!byPlayer) { toast('A hunter is down!', 1.4); return; }
    if (upgradeLevels.hunterPower >= 5) { toast('A hunter is down — the rest hold the line.', 1.8); return; }
    if (!huntersLeavePending) {
      huntersLeavePending = true;
      toast('The hunters break camp — one of theirs is down!', 2.4);
      playHuntersLeave();
      for (const other of hunters) other.burstLeft = 0; // don't fire on the way out
    }
  }

  // Advance any toppling hunters' fall; once down, drop a corpse and remove
  // them from the roster. Mirrors the keeper death-fall.
  const HUNTER_FALL_DUR = 0.45;
  function tickHunterDeaths(dt) {
    for (let i = hunters.length - 1; i >= 0; i--) {
      const h = hunters[i];
      if (!h.dying) continue;
      h.downT = (h.downT || 0) + dt;
      if (h.downT >= HUNTER_FALL_DUR + 0.25) {
        corpses.push({ x: h.x, y: h.y, kind: 'hunter', t: 5 });
        hunters.splice(i, 1);
      }
    }
  }

  function applyBeamDamage(x1, y1, x2, y2) {
    for (const r of robots) {
      if (r.alive && segmentDist2(x1, y1, x2, y2, r.x, r.y) < 0.25) hurtRobot(r);
    }
    const thickness = 0.32;
    const t2 = thickness * thickness;
    hurtCratesAlongBeam(x1, y1, x2, y2, 1, 'wolf');
    if (!player.ghost && segmentDist2(x1, y1, x2, y2, player.x, player.y) < t2) {
      applyWolfBulletHit(player);
    }
    if (player2.active && !player2.ghost &&
        segmentDist2(x1, y1, x2, y2, player2.x, player2.y) < t2) {
      applyWolfBulletHit(player2);
    }
    for (const c of chickens) {
      if (!c.alive) continue;
      if (segmentDist2(x1, y1, x2, y2, c.x, c.y) < t2) {
        killChicken(c);
        playChickenDeath();
        corpses.push({ x: c.x, y: c.y, kind: 'chicken', t: 4 });
      }
    }
  }

  // Quickdraw instant twirl reload — rolled BEFORE the skill-check bar opens,
  // so a hit fully reloads with a flourish and skips the skill check entirely
  // (no toast — the spin animation is the cue). At max level it also primes
  // the next burst for triple damage. Shared by both keepers.
  function spinTwirlReload(who, isMG) {
    playReload();
    const maxed = lvlsFor(who).spinReload >= 5;
    if (who === player) {
      if (isMG) ammo = mgMagSize(player);
      else { shells = shotgunMagP1(); chambered = true; jamStreak = 0; }
      reloadingT = SPIN_RELOAD_TIME;
      player.spinT = SPIN_RELOAD_TIME;
      player.skillCheckActive = false;
      player.skillCheckNeedsRelease = false;
      if (maxed) player.spinDmg = true;
    } else {
      if (isMG) who.ammo = mgMagSize(who);
      else { who.shells = shotgunMagP2(); who.chambered = true; who.jamStreak = 0; }
      who.reloadingT = SPIN_RELOAD_TIME;
      who.spinT = SPIN_RELOAD_TIME;
      who.skillCheckActive = false;
      who.skillCheckNeedsRelease = false;
      if (maxed) who.spinDmg = true;
    }
  }

  // Per-shot machine-gun cadence for `who`: base rate × machineGun-level mul ×
  // Last Stand, then shortened by the Minigun spin-up (longer the trigger /
  // mag-dump is held, the faster it fires). Shared by left-click fire and the
  // right-click mag dump (the dump applies MAG_DUMP_SPEEDUP on top).
  function mgShotCooldown(who) {
    let cool = MG_BASE_COOLDOWN * tableAtFor(who, 'machineGun') * lastStandFireMul(who);
    if ((lvlsFor(who).minigun || 0) >= 5) {
      const sp = Math.min(1, (who.mgSpinT || 0) / MINIGUN_SPINUP_TIME);
      cool *= 1 - sp * (1 - MINIGUN_SPINUP_MIN);
    }
    return cool;
  }

  // Machine-gun right-click: empty the whole magazine in one unstoppable burst.
  // Begin a machine-gun reload (the twirl is handled up-front in tryReload).
  function startMGReload() {
    playReload();
    ammo = mgMagSize(player); // mag refills the instant the skill check lands — no reload wait
    reloadingT = 0; // no machine-gun reload delay after the skill check
  }

  function magDump() {
    if (multiplayer && !isHost) return;
    if (gameOver || buildMode || upgradeMode) return;
    if (player.ghost) return;
    if (reloadingT > 0 || magDumpLeft > 0) return;
    if (player.jamT > 0) return;
    if (ammo <= 0) return; // can't dump an empty mag — reload explicitly first
    magDumpLeft = ammo; // every loaded round fires — cannot be cancelled
    magDumpT = 0;
    // Rocket: tag the dump so every burst inside the loop fires guaranteed-
    // explode pellets. Cleared when the dump ends.
    player.magDumpRocket = upgradeLevels.rocket > 0;
    // Point-blank concussion on the mag-dump kickoff — same frontal-arc area
    // damage as Double-Barrel's right-click, so close wolves take a chunk too.
    const fr2 = DBL_FRONT_R * DBL_FRONT_R;
    for (const w of wolves) {
      if (!w.alive) continue;
      const dx = w.x - player.x, dy = w.y - player.y;
      if (dx * dx + dy * dy > fr2) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - player.dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.3) continue;
      const m = Math.hypot(dx, dy) || 1;
      hurtWolf(w, DBL_FRONT_DMG, (dx / m) * 0.2, (dy / m) * 0.2);
    }
  }

  // Wolf's Blade: a melee swing that replaces shooting — huge damage to every
  // wolf caught in a wide arc in front of the player.
  function swordSwing() {
    swordSwingFor(player);
  }

  // Shotgun magazine size: Double-Barrel loads two shells, everything else one.
  // Minigun adds capacity on top — so a Double-Barrel + Minigun build gets the
  // big mag too (the same MINIGUN_MAG_PER_LVL the machine gun enjoys).
  function shotgunMagFor(who) {
    const l = lvlsFor(who);
    return ((l.doubleBarrel > 0) ? 2 : 1) + (l.minigun || 0) * MINIGUN_MAG_PER_LVL;
  }
  function shotgunMagP1() { return shotgunMagFor(player); }
  function shotgunMagP2() { return shotgunMagFor(player2); }

  function tryShoot() {
    if (multiplayer && !isHost) return; // guest can't shoot yet (host is authoritative)
    if (gameOver) return;
    if ((player.danceT || 0) > 0) return; // stunned mid-dance
    if (player.ghost) return; // ghosts wander without weapons
    if (magDumpLeft > 0) return; // locked out mid mag-dump
    if (buildMode) {
      buildMode = false;
      toast('Build mode cancelled');
      return;
    }
    // Wolf's Blade: clicks swing the sword instead of firing a gun.
    if (upgradeLevels.sword >= 1) {
      if (player.reloadT <= 0) swordSwing();
      return;
    }
    // Debug "always loaded + always crit": clear any reload/jam lockout, keep the
    // magazine topped up and prime a crit on every shot. The fire-rate cooldown
    // (player.reloadT) is left alone so the cadence stays normal.
    if (debugAutoReloadCrit) {
      reloadingT = 0;
      player.jamT = 0;
      player.skillCheckActive = false;
      player.skillCheckNeedsRelease = false;
      cancelReloadMinigame();
      if (upgradeLevels.machineGun > 0) ammo = mgMagSize(player);
      else { shells = Math.max(shells, 1); chambered = true; }
      player.critShots = Math.max(player.critShots || 0, 1);
    }
    if (player.reloadT > 0) return;
    if (reloadingT > 0) return; // can't fire while reloading
    if (player.jamT > 0) return;
    // Minigun reduces every fire-cooldown by its tier multiplier.
    // Last Stand's crouch bonus shortens the cooldown further (it stacks
    // multiplicatively with the minigun ramp).
    const fireMul = ((upgradeLevels.minigun > 0) ? tableAt('minigun') : 1) * lastStandFireMul(player);
    if (upgradeLevels.machineGun > 0) {
      // Machine-gun: starts slow, faster each level. Cadence = base × the
      // machineGun-level multiplier × minigun × Last Stand. (Levels speed up
      // the fire rate now — the mag size is fixed.)
      if (ammo <= 0) { tryReload(); return; }
      // After a reload committed with the trigger held, wait for a release so
      // the commit click doesn't immediately empty the fresh mag.
      if (player.skillCheckNeedsRelease) return;
      // Every round can jam too — a rusty machine gun is cranky. Scaled down
      // since it fires far faster than the shotgun (no jam at MAX Rusty Springs).
      if (!debugAutoReloadCrit && Math.random() < jamChance * MG_JAM_MUL) { handleJam(); player.reloadT = mgShotCooldown(player); return; } // dud round — keeps the cadence, no lockout
      const wasCritMG = (player.critShots || 0) > 0;
      fireBurst();
      if (!wasCritMG) ammo--; // crit shots don't eat the magazine
      // Cadence: machine-gun level sets the base rate; Last Stand shortens it.
      // At MAX Minigun a spin-up shortens it further the longer the trigger is
      // held (player.mgSpinT ramps in update); it fires from the first round.
      player.reloadT = mgShotCooldown(player);
      return;
    }
    // Shotgun: an empty chamber also routes the click into reload.
    if (shells <= 0) { tryReload(); return; }
    if (!debugAutoReloadCrit && Math.random() < jamChance) { handleJam(); player.reloadT = shotgunCooldown * fireMul; return; } // dud shell — normal cadence, keeper keeps moving
    // Each left-click fires a single barrel. With Double-Barrel the gun holds
    // two shells, so you can fire twice before reloading (right-click fires
    // both at once — see doubleShot).
    const wasCritSG = (player.critShots || 0) > 0;
    if (!wasCritSG) { shells--; chambered = shells > 0; } // crit shots don't eat the magazine
    player.reloadT = shotgunCooldown * fireMul;
    fireBurst();
  }

  // A jam just happened: lock the gun briefly (jamT gates both shooting and
  // reloading), and — at max Rusty Springs — pay out gold, doubling for
  // every consecutive jam (capped). NOTE: jam no longer touches reloadingT,
  // since reloadingT crossing 0 refills the MG mag — using it for jams would
  // hand the player a free refill on every jam.
  // `fromShot` defaults to true. A jam mid-FIRE just eats that shot — the gun
  // coughs (jam thunk) but the keeper keeps moving and isn't locked; the
  // caller imposes the normal fire cadence so the dud doesn't re-roll every
  // frame. A botched RELOAD (`fromShot` false) still roots the gun while you
  // clear it, the way it always has.
  function handleJam(fromShot) {
    if (fromShot === undefined) fromShot = true;
    const lvls = lvlsFor(player);
    if (!fromShot) {
      player.jamT = 1.2 * ((lvls.jam >= MAX_LEVEL) ? 0.5 : 1); // max Better Springs halves stun duration
    } else {
      // A dud shot doesn't root you, but it should still LOOK (and sound) like a
      // jam — flash the gun red for the same window a reload jam would.
      player.jamFlashT = 1.2 * ((lvls.jam >= MAX_LEVEL) ? 0.5 : 1);
    }
    playReloadJam();
    // A jam (botched reload, or a random shooting jam pre-max) breaks the
    // crit streak that the max-rust golden gun pays out on. The jam sound is
    // cue enough — no toast.
    critStreak = 0;
  }

  // Double-Barrel right-click: two bursts, recoil knockback, and a jam risk.
  function doubleShot() {
    if (multiplayer && !isHost) return;
    if (gameOver || buildMode || upgradeMode) return;
    if (player.ghost) return;
    if (player.reloadT > 0 || reloadingT > 0) return;
    if (player.jamT > 0) return;
    if (shells <= 0) return; // empty — must explicitly reload first
    // Right-click discharges every loaded barrel at once — one heavy blast per
    // shell, then the gun is empty and has to be reloaded.
    const barrels = shells;
    shells = 0;
    chambered = false;
    const fireMul = (upgradeLevels.minigun > 0) ? tableAt('minigun') : 1;
    player.reloadT = shotgunCooldown * fireMul;
    // Rocket: guaranteed-explode on every pellet of this right-click burst.
    const opts = (upgradeLevels.rocket > 0) ? { rocketBoom: true } : undefined;
    for (let b = 0; b < barrels; b++) fireBurst(2, opts); // each barrel hits twice as hard
    shake = 0.3;
    // Minigun: amplify the recoil shove a little per tier so the right-click
    // really "pushes you back" the way the description promises.
    const knockMul = (upgradeLevels.minigun > 0) ? (1 + upgradeLevels.minigun * 0.25) : 1;
    knockbackPlayer(1.4 * knockMul);
    // A puff of gunsmoke off the muzzle.
    spawnSmoke(player.x + Math.cos(player.dir) * 0.6, player.y + Math.sin(player.dir) * 0.6, 6);
    // Point-blank concussion — the twin blast also wallops wolves right in front.
    const fr2 = DBL_FRONT_R * DBL_FRONT_R;
    for (const w of wolves) {
      if (!w.alive) continue;
      const dx = w.x - player.x, dy = w.y - player.y;
      if (dx * dx + dy * dy > fr2) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - player.dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.3) continue; // only the frontal arc
      const m = Math.hypot(dx, dy) || 1;
      hurtWolf(w, DBL_FRONT_DMG, (dx / m) * 0.2, (dy / m) * 0.2);
    }
  }

  // Finishes a clean shotgun reload — sets chambered + starts the lockout
  // animation. Quickdraw can swap the slow lockout for a fast twirl.
  function commitShotgunReload() {
    shells = shotgunMagP1(); // Double-Barrel loads two shells, others one
    chambered = true;
    jamStreak = 0;
    playReload();
    reloadingT = 1.0; // the twirl is rolled up-front in tryReload, before the skill check
  }

  // ---- Nerd / Jock joke reloads (P1 / local keeper only) ----
  function rndInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
  function reloadMinigameActive() { return nerdActive || jockActive; }
  function startNerdReload(isMG) {
    nerdActive = true; nerdIsMG = isMG; nerdInput = '';
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, ans;
    if (op === '+')      { a = rndInt(2, 19); b = rndInt(2, 19); ans = a + b; }
    else if (op === '-') { a = rndInt(6, 19); b = rndInt(1, a);  ans = a - b; }
    else                 { a = rndInt(2, 9);  b = rndInt(2, 9);  ans = a * b; }
    nerdQ = { text: a + ' ' + op + ' ' + b + ' = ?', answer: ans };
    playReload();
  }
  function nerdSubmit() {
    if (!nerdActive) return;
    const ok = nerdInput !== '' && parseInt(nerdInput, 10) === nerdQ.answer;
    nerdActive = false; nerdInput = '';
    if (ok) {
      if (nerdIsMG) startMGReload(); else commitShotgunReload();
      if (nerdIsMG) player.skillCheckNeedsRelease = mouse.down;
      playCritical(); toast('Correct — reloaded!', 0.6);
    } else {
      handleJam(false); toast('Wrong answer — jammed!', 0.9);
    }
  }
  function startJockReload(isMG) {
    jockActive = true; jockIsMG = isMG;
    jockTimeLeft = JOCK_RELOAD_TIME; jockPresses = 0;
    playReload();
  }
  function jockPress() {
    if (!jockActive) return;
    jockPresses++;
    if (jockPresses >= JOCK_RELOAD_PRESSES) jockResolve(true);
  }
  function jockResolve(success) {
    jockActive = false;
    if (success) {
      if (jockIsMG) startMGReload(); else commitShotgunReload();
      if (jockIsMG) player.skillCheckNeedsRelease = mouse.down;
      playCritical(); toast('Pumped it — reloaded!', 0.6);
    } else {
      handleJam(false); toast('Too slow — jammed!', 0.9);
    }
  }
  // Per-frame: drain the Jock timer; time-out is a jam. Frozen during the
  // wave-cleared upgrade screen so the player isn't jammed for not mashing.
  function updateReloadMinigame(dt) {
    if (upgradeMode) return;
    if (jockActive) {
      jockTimeLeft -= dt;
      if (jockTimeLeft <= 0) jockResolve(false);
    }
  }
  function cancelReloadMinigame() { nerdActive = false; jockActive = false; nerdInput = ''; }

  // Pressing R: the gun is only reloadable when empty. The first press opens
  // the skill-check bar; the next press snaps it. A hit inside the centre
  // band commits the reload, a miss just rocks the gun briefly and the bar
  // keeps swinging until the player nails the timing.
  function tryReload() {
    if (multiplayer && !isHost) return;
    if (gameOver) return;
    if (player.ghost) return; // ghosts have no gun — can't reload
    if ((player.danceT || 0) > 0) return; // stunned mid-dance
    if (buildMode) return; // can't reload while placing buildings
    if (upgradeLevels.sword >= 1) return; // the sword never reloads
    if (reloadingT > 0) return;
    if (player.jamT > 0) return;
    if (reloadMinigameActive()) return; // a nerd/jock reload is already running
    const isMG = upgradeLevels.machineGun > 0;
    const empty = isMG ? (ammo <= 0) : !chambered;
    if (!empty) {
      // No top-up reloads — the gun has to run dry first.
      if (player.skillCheckActive) player.skillCheckActive = false;
      player.skillCheckNeedsRelease = false;
      toast(isMG ? 'Magazine not empty' : 'Already loaded', 0.5);
      return;
    }
    if (!player.skillCheckActive) {
      // Quickdraw is rolled up-front, before the skill-check bar even opens —
      // a successful twirl reloads instantly and SKIPS the skill check entirely
      // (that's the whole point of an instant flourish reload).
      if (Math.random() < tableAt('spinReload')) { spinTwirlReload(player, isMG); return; }
      // Nerd / Jock joke reloads replace the timing bar entirely.
      if (upgradeLevels.nerdReload > 0) { startNerdReload(isMG); return; }
      if (upgradeLevels.jockReload > 0) { startJockReload(isMG); return; }
      player.skillCheckActive = true;
      player.skillCheckNeedsRelease = !!mouse.down;
      // Random starting phase (0..1) so the marker doesn't always set out from
      // the leftmost edge — keeps the timing fresh each reload attempt.
      player.skillCheckT = Math.random();
      player.skillCheckLockoutT = 0;
      return;
    }
    if (player.skillCheckNeedsRelease) return;
    if (player.skillCheckLockoutT > 0) return;
    const pos = skillCheckPos(player.skillCheckT);
    const distFromCenter = Math.abs(pos - 0.5);
    if (distFromCenter <= skillCheckHitHalf()) {
      player.skillCheckActive = false;
      player.skillCheckNeedsRelease = false;
      // Crit: dead-centre hit primes the next shot for a damage multiplier.
      // A short chime is the cue — no toast.
      if (distFromCenter <= skillCheckCritHalf()) {
        // Machine gun primes a whole burst of crit shots; everything else one.
        player.critShots = (upgradeLevels.machineGun > 0) ? CRIT_MG_SHOTS : 1;
        player.critSpeedT = CRIT_SPEED_BOOST_T; // nailing the centre also kicks in a footwork burst
        player.dashCd = 0; // …and instantly recharges the Parry Mode dodge-roll
        // Max Rusty Springs golden gun: every consecutive critical reload pays $1.
        if (upgradeLevels.rust >= 5) {
          critStreak++;
          money += GOLD_PER_CRIT;
          runMoneyEarned += GOLD_PER_CRIT;
          if (critStreak >= 10) {
            money += 10;
            runMoneyEarned += 10;
            critStreak = 0;
          }
          playMoney();
        } else {
          playCritical();
        }
      } else {
        critStreak = 0; // a successful but non-critical reload breaks the streak
      }
      if (isMG) startMGReload(); else commitShotgunReload();
      // If the reload was committed with the mouse held down, the machine gun
      // must wait for the trigger to be released before auto-firing again —
      // otherwise the commit click would immediately spray the fresh mag.
      if (isMG) player.skillCheckNeedsRelease = mouse.down;
    } else {
      // Botched timing now jams the gun — the player has to wait out the
      // jam lockout before they can try the skill check again from scratch.
      player.skillCheckActive = false;
      player.skillCheckNeedsRelease = false;
      handleJam(false); // reload-miss jam — no golden-gun payout
    }
  }

  // Aim angle in WORLD coordinates from player to mouse (converted)
  function aimAngle() {
    const w = screenToWorld(mouse.x, mouse.y);
    return Math.atan2(w.y - player.y, w.x - player.x);
  }

