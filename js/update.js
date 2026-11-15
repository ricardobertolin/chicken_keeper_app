  // ---------- Update ----------
  const TARGET_FRAME_MS = 16; // cap at ~62fps; skips render on 90/120Hz screens
  let last = performance.now();
  function loop(now) {
    if (now - last < TARGET_FRAME_MS) { requestAnimationFrame(loop); return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // A single bad frame must never permanently freeze the game. Any uncaught
    // exception here would stop the rAF chain dead (the reschedule is the last
    // line), hard-locking the client — this bit the guest occasionally right
    // after it was killed. Catch, log, and keep the loop alive so at worst one
    // frame is skipped instead of the whole game hanging.
    try {
      update(dt);
      // The cutscene + wipe are host-authoritative in co-op: the guest mirrors
      // them from the snapshot (rocketLaunch / fade), so it must NOT advance them
      // locally or it would double-drive the animation.
      if (!(multiplayer && !isHost)) {
        updateRocketLaunch(dt); // post-boss restart cutscene (ticks even when frozen)
        updateFade(dt);         // black screen wipe — ticks even when frozen
      }
      // Refresh player1's weapon-mirror on the player object so the keeper-draw
      // helpers can read everything from one place.
      syncP1Weapon();
      // Net sync runs even when update() bails out (paused / upgrade / gameOver)
      // so the guest keeps receiving fresh state and game-over propagates.
      if (gameStarted && multiplayer && conn && conn.open) {
        netSendT -= dt;
        if (netSendT <= 0) {
          netSendT = 0.05;
          if (isHost) netSendSnapshot();
          else        netSendPosition();
        }
        if (!isHost) lastSnapshotReceivedT += dt;
        // Silence-timeout fallback: if no message has arrived for a while the
        // buddy is presumed gone (tab close often skips conn.close).
        if (!netDisconnected && performance.now() - netLastRecv > NET_TIMEOUT_MS) {
          handlePeerGone('timeout');
        }
      }
      render();
    } catch (err) {
      console.error('[loop] frame error — skipped, loop kept alive:', err);
    }
    requestAnimationFrame(loop);
  }

  function update(dt) {
    _tileColorInvalidateT -= dt;
    if (_tileColorInvalidateT <= 0) { _tileColorCache.clear(); _tileColorInvalidateT = 1; }
    if (!gameStarted) return;
    // Frozen while the post-boss rocket cutscene plays or while fading to black
    // before the world swaps in — this keeps the host's snapshot stable so the
    // guest mirrors a clean cutscene, and stops any upgrade screen mid-transition.
    if (rocketLaunch) return;
    if (fade && fade.phase === 'out') return;
    if (gameOver && gameOverPanelDelayT > 0) {
      gameOverPanelDelayT = Math.max(0, gameOverPanelDelayT - dt);
    }
    // Keeper death-falls keep animating even after the sim freezes on gameOver.
    tickKeeperDeaths(dt);
    // Watches the wave counter for a tier boundary — runs before the pause /
    // upgrade-screen bailouts so a wave change is never missed.
    tickUnlockNotice(dt);
    if (gameOver) return;
    if (paused) return;
    if (upgradeMode) return;
    // After a wave clears, the game keeps running for a couple of seconds
    // (no freeze) — then the upgrade window opens once the timer expires.
    if (upgradeDelayT > 0) {
      upgradeDelayT -= dt;
      if (upgradeDelayT <= 0) {
        upgradeDelayT = 0;
        startUpgradePhase();
        return;
      }
    }

    // Player movement (screen-axis aligned WASD)
    // Convert screen-up "W" to a world vector. In iso, screen-up = (-1,-1) in world.
    // While the title/lobby menu is up, the keeper just stands still so the
    // world ticks as an ambient backdrop without responding to game keys.
    let mx = 0, my = 0;
    if (!inMenu) {
    if (keys['w'] || keys['arrowup'])    { mx -= 1; my -= 1; }
    if (keys['s'] || keys['arrowdown'])  { mx += 1; my += 1; }
    if (keys['a'] || keys['arrowleft'])  { mx -= 1; my += 1; }
    if (keys['d'] || keys['arrowright']) { mx += 1; my -= 1; }
    }
    // A keeper mid-fall is rooted — no sliding the corpse around.
    if (player.dying) { mx = 0; my = 0; }
    // Dance stun (W+D mash) — rooted in place while the jig plays out.
    if ((player.danceT || 0) > 0) {
      player.danceT -= dt;
      player.danceAnimT = (player.danceAnimT || 0) + dt;
      mx = 0; my = 0;
    }
    // ---- Experimental Parry Mode: SHIFT dodge-roll ----
    // A queued roll launches the keeper a short hop along the current input
    // heading (or the aim direction when standing still). The roll overrides
    // input + the reload/jam slow for its brief duration — it's an escape move.
    if ((player.dashCd || 0) > 0) player.dashCd -= dt;
    if (player.dashQueued) {
      player.dashQueued = false;
      if ((player.dashT || 0) <= 0 && (player.dashCd || 0) <= 0
          && !player.ghost && !player.dying && (player.danceT || 0) <= 0) {
        let hx = mx, hy = my;
        if (hx === 0 && hy === 0) { const a = aimAngle(); hx = Math.cos(a); hy = Math.sin(a); }
        const hl = Math.hypot(hx, hy) || 1;
        player.dashX = hx / hl; player.dashY = hy / hl;
        player.dashT = PLAYER_DASH_DUR;
        player.dashCd = PLAYER_DASH_CD;
        player.dashPartT = 0;
        playDash();
      }
    }
    let dashing = false;
    if ((player.dashT || 0) > 0 && !player.dying && (player.danceT || 0) <= 0) {
      player.dashT -= dt;
      mx = player.dashX; my = player.dashY;
      dashing = true;
      player.dashPartT = (player.dashPartT || 0) - dt;
      if (player.dashPartT <= 0) {
        player.dashPartT = 0.025;
        spawnSmoke(player.x + rand(-0.25, 0.25), player.y + rand(-0.15, 0.15), 1);
      }
    }
    // Reloading slows you to half speed; a jam roots you in place. At max
    // Better Springs the stun duration is halved so jams are shorter, but
    // they still stun (you remain rooted while `jamT > 0`).
    // Movement reads the LOCAL keeper's ladder AND the LOCAL reload state —
    // the global `reloadingT` is host's keeper only, so reading it on the
    // guest used to slow the guest's keeper whenever the host reloaded.
    const myLvls = lvlsFor(player);
    const myReloadingT = player.reloadingT || 0;
    let moveMul = 1;
    if ((player.danceT || 0) > 0) moveMul = 0; // dance stun roots you
    else if (player.jamT > 0)   moveMul = 0;
    else if (myReloadingT > 0)  moveMul = RELOAD_MOVE_SLOW; // fixed half-speed shuffle while reloading
    if (dashing) moveMul = PLAYER_DASH_MUL; // the dodge-roll overrides the reload/jam slow
    else if (parryMode && (player.dashCd || 0) > 0) {
      // Winded after a roll — drag the move speed down, strongest right after
      // the dash and easing back to normal as the roll recharges.
      moveMul *= 1 - DASH_RECOVER_SLOW * clamp(player.dashCd / PLAYER_DASH_CD, 0, 1);
    }
    player.moving = !!(mx || my) && moveMul > 0;
    // Run mechanic: walking uninterrupted (no firing, no reload, no jam)
    // builds momentum, ramping move speed up at a full sprint. The Stampede
    // upgrade raises that bonus per level (sprint table, index 0 = base).
    const sprinting = player.moving && myReloadingT <= 0 && !player.skillCheckActive && player.reloadT <= 0 && player.jamT <= 0;
    player.runT = sprinting ? player.runT + dt : 0;
    const runMul = 1 + clamp((player.runT - RUN_WARMUP) / RUN_RAMP, 0, 1) * tableAtFor(player, 'sprint');
    // Critical-reload footwork burst — a brief flat speed bump that drains here
    // (set on a centre-band reload; synced to the guest so its keeper feels it).
    const critBoost = (player.critSpeedT || 0) > 0 ? CRIT_SPEED_BOOST_MUL : 1;
    if ((player.critSpeedT || 0) > 0) player.critSpeedT -= dt;
    // Rocket Boots: while at a full sprint, roll a per-second chance to
    // launch the player into a short flight. Flying = no fence collision,
    // mine immunity, melee bites miss. Tail off naturally when the timer
    // expires; running is still respected so the flight propels you forward.
    const rbLvl = myLvls.rocketBoots || 0;
    if (rbLvl > 0 && (player.flightT || 0) <= 0 && sprinting && player.runT > RUN_WARMUP) {
      if (Math.random() < ROCKET_BOOTS_CHANCE[rbLvl] * dt) {
        player.flightT = ROCKET_BOOTS_DURATION[rbLvl];
        player.flightPartT = 0;
        playRocketBoots();
      }
    }
    const flying = (player.flightT || 0) > 0;
    if (flying) {
      player.flightT = Math.max(0, player.flightT - dt);
      player.flightPartT = (player.flightPartT || 0) - dt;
      if (player.flightPartT <= 0) {
        player.flightPartT = ROCKET_BOOTS_PARTICLE;
        // Two angled exhaust puffs — read as boot jets behind the feet.
        spawnSmoke(player.x + rand(-0.3, 0.3), player.y - 0.2 + rand(-0.1, 0.1), 1);
      }
      // Trample: any wolf the flying keeper passes over takes a small
      // chunk of damage from the boot exhaust. Compensates for how rare
      // the lift-off is — the player gets a free strafing pass.
      const trampleDps = ROCKET_BOOTS_TRAMPLE[Math.min(5, rbLvl)];
      if (trampleDps > 0) {
        const trampleR2 = ROCKET_BOOTS_TRAMPLE_R * ROCKET_BOOTS_TRAMPLE_R;
        const tick = trampleDps * dt;
        for (const w of wolves) {
          if (!w.alive) continue;
          if (dist2(w.x, w.y, player.x, player.y) >= trampleR2) continue;
          const dx = w.x - player.x, dy = w.y - player.y;
          const dd = Math.hypot(dx, dy) || 1;
          hurtWolf(w, tick, (dx / dd) * 0.05, (dy / dd) * 0.05);
          // The boot exhaust sets wolves ablaze — a hot-shot-style burn-over-time.
          if (w.alive && !w.boss) { w.burnT = 3; if (!(w.burnTickT > 0)) w.burnTickT = BURN_TICK; }
        }
      }
    }
    if (player.moving) {
      const m = Math.hypot(mx, my);
      mx /= m; my /= m;
      // Fences block the player too — slide along them (axis-separated).
      // Flying skips fence collision entirely so the player can soar over
      // walls / fence pens for the duration.
      const flyMul = flying ? ROCKET_BOOTS_SPEED : 1;
      const sp = player.speed * moveMul * runMul * flyMul * critBoost;
      const pInside = fenceBlocks(player.x, player.y);
      const pStepX = player.x + mx * sp * dt;
      const pStepY = player.y + my * sp * dt;
      if (flying) {
        player.x = pStepX;
        player.y = pStepY;
      } else {
        if (pInside || !fenceBlocks(pStepX, player.y)) player.x = pStepX;
        if (pInside || !fenceBlocks(player.x, pStepY)) player.y = pStepY;
      }
      player.x = clamp(player.x, -HALF_MAP + 1, HALF_MAP - 1);
      player.y = clamp(player.y, -HALF_MAP + 1, HALF_MAP - 1);
      player.walkT += dt * 12 * runMul; // legs cycle faster the harder you sprint
    }
    // Last Stand: charge the crouch buff while the keeper is standing still
    // (no movement input, no reload/jam window). Active firing should not
    // break the crouch (only walking does), but a max-level cloak also needs
    // the keeper to hold fire — see the `noShoot` accumulator below.
    const lsLvl = myLvls.lastStand || 0;
    if (lsLvl > 0 && !player.moving && player.jamT <= 0) {
      // Reloading no longer cancels Last Stand charging; allow the keeper
      // to keep building the crouch buff while performing a reload.
      player.lastStandIdleT = (player.lastStandIdleT || 0) + dt;
    } else {
      player.lastStandIdleT = 0;
      player.lastStandStealth = false;
    }
    // noShoot ticks whenever the gun isn't actively recoiling AND the
    // crouch is up. A recent shot resets it (player.reloadT > 0 implies the
    // gun fired within the last cooldown window).
    const lsCrouched = lsLvl > 0 && player.lastStandIdleT >= LAST_STAND_CHARGE;
    if (lsCrouched && player.reloadT <= 0 && (player.lastStandIdleT || 0) > LAST_STAND_CHARGE) {
      player.lastStandNoShootT = (player.lastStandNoShootT || 0) + dt;
    } else if (!lsCrouched || player.reloadT > 0) {
      player.lastStandNoShootT = 0;
    }
    player.lastStandStealth = lsLvl >= 5 && lsCrouched
        && (player.lastStandNoShootT || 0) >= LAST_STAND_STEALTH_DELAY;
    // Stampede (maxed): a running player tramples wolves it barges into.
    if (player.moving && myLvls.sprint >= 5 && player.runT > RUN_WARMUP) {
      for (const w of wolves) {
        if (!w.alive) continue;
        if (dist2(w.x, w.y, player.x, player.y) < 0.4 && Math.random() < TRAMPLE_RATE * dt) {
          const tdx = w.x - player.x, tdy = w.y - player.y;
          const tm = Math.hypot(tdx, tdy) || 1;
          hurtWolf(w, TRAMPLE_DMG, (tdx / tm) * 0.3, (tdy / tm) * 0.3);
          shake = Math.max(shake, 0.12);
        }
      }
    }
    // Player facing = aim
    player.dir = aimAngle();
    if (player.reloadT > 0) player.reloadT -= dt;
    if (player.spinT > 0) player.spinT -= dt;
    if (player.jamT > 0) player.jamT -= dt;
    if (player.jamFlashT > 0) player.jamFlashT -= dt; // cosmetic dud-shot flash
    if (player.hurtT > 0) player.hurtT -= dt;
    if (player.meleeT > 0) player.meleeT -= dt;
    // Reload skill-check sweep — only advances while the bar is up. Accumulate
    // the PHASE (rate × dt), so a mid-sweep speed change never jumps the pin.
    if (player.skillCheckActive) {
      player.skillCheckT += dt * pinSpeed(player);
      if (player.skillCheckLockoutT > 0) player.skillCheckLockoutT -= dt;
    } else {
      player.skillCheckLockoutT = 0;
    }
    if (!mouse.down) player.skillCheckNeedsRelease = false;
    updateReloadMinigame(dt); // drain the Jock mash timer
    if (player2.hurtT > 0) player2.hurtT -= dt;
    // Friendly-fire pellet-blast debounce — ticks down on both keepers.
    if (player.bulletHitT > 0) player.bulletHitT -= dt;
    if (player2.bulletHitT > 0) player2.bulletHitT -= dt;
    // Wolf-bite invulnerability window — same idea, but longer so a pack
    // can't strip every hat in a single second.
    if (player.wolfHitT > 0) player.wolfHitT -= dt;
    if (player2.wolfHitT > 0) player2.wolfHitT -= dt;
    if (postUpgradeLockT > 0) postUpgradeLockT -= dt;
    if (!player2.mouseDown) player2.skillCheckNeedsRelease = false;

    if (keys['r']) { keys['r'] = false; tryReload(); }
    if (reloadingT > 0) {
      reloadingT -= dt;
      // A finished machine-gun reload refills the magazine.
      if (reloadingT <= 0 && upgradeLevels.machineGun > 0) ammo = mgMagSize(player);
    }
    // Minigun spin-up: sustained, ammo-burning fire ramps player.mgSpinT up;
    // it resets the moment the trigger is released or the gun runs dry.
    if ((mouse.down || magDumpLeft > 0) && upgradeLevels.machineGun > 0 && ammo > 0 && !player.skillCheckNeedsRelease) {
      player.mgSpinT = (player.mgSpinT || 0) + dt; // spins up on held fire AND during a mag dump
    } else {
      player.mgSpinT = 0;
    }
    // Machine-gun auto-fires while the mouse is held down.
    if (upgradeLevels.machineGun > 0 && mouse.down && !buildMode && postUpgradeLockT <= 0) tryShoot();
    // Wolf's Blade auto-swings while the mouse is held.
    if (upgradeLevels.sword >= 1 && mouse.down && !buildMode && postUpgradeLockT <= 0) tryShoot();
    // Machine-gun mag dump (right-click): unstoppable, smokes, shoves you back.
    if (magDumpLeft > 0 && !gameOver) {
      // Minigun cranks the cadence + shove. Rocket marks every burst with the
      // guaranteed-explode flag for as long as this mag dump is running.
      const dumpKnockMul = (upgradeLevels.minigun > 0) ? (1 + upgradeLevels.minigun * 0.7) : 1;
      const dumpRocketOpts = player.magDumpRocket ? { rocketBoom: true } : undefined;
      // Double-Machine combo: owning Double-Barrel too fires BOTH barrels each
      // round — a second burst per shot — until the mag runs dry.
      const dumpDblBarrel = upgradeLevels.doubleBarrel > 0;
      magDumpT -= dt;
      // Steady per-shot cadence — the dump fires one round per MAG_DUMP_INTERVAL
      // so it audibly rattles through the whole mag rather than emptying instantly.
      while (magDumpT <= 0 && magDumpLeft > 0 && ammo > 0) {
        fireBurst(1, dumpRocketOpts);
        if (dumpDblBarrel) fireBurst(1, dumpRocketOpts); // twice every shot
        ammo--;
        magDumpLeft--;
        knockbackPlayer(0.12 * dumpKnockMul);
        spawnSmoke(player.x + Math.cos(player.dir) * 0.6, player.y + Math.sin(player.dir) * 0.6, 1);
        magDumpT += mgShotCooldown(player) * MAG_DUMP_SPEEDUP; // a touch faster than left-click; minigun spins up as it runs
      }
      if (magDumpLeft <= 0 || ammo <= 0) {
        // Mag-dump finishes the burst, but the player must explicitly
        // reload (press R, then time the skill-check) to load again.
        magDumpLeft = 0;
        player.magDumpRocket = false;
      }
    }
    updateSmoke(dt);
    updateBlasts(dt);
    updateScorches(dt);
    updateFlyHats(dt);
    updateBeams(dt);
    if (!(multiplayer && !isHost)) {
      updateBossMissiles(dt); // boss MK-04 + missile-wolf rockets (any wave)
    }
    // Decoy hit-flash timer drains naturally each frame.
    for (const dm of dummies) if (dm.hurtT > 0) dm.hurtT -= dt;
    for (const st of statues) if (st.hurtT > 0) st.hurtT -= dt;
    // Explosive Mines — detonate when anything steps on the tile.
    updateMines();

    // Player 2 (multiplayer only): position is driven by network messages.
    // We just advance the local walk animation while the remote is moving.
    if (player2.active) {
      if (player2.moving) player2.walkT += dt * 12;
      // Buddy's dance jig is driven by the guest's pos messages; advance the
      // animation phase locally between updates so the hops stay smooth.
      if ((player2.danceT || 0) > 0) player2.danceAnimT = (player2.danceAnimT || 0) + dt;
      // Host runs player2's weapon timers + auto-fire here. The guest only
      // mirrors timers from the snapshot, so it skips this block entirely.
      if (isHost) {
        if (player2.reloadT > 0) player2.reloadT -= dt;
        if (player2.spinT > 0) player2.spinT -= dt;
        if (player2.jamT > 0) player2.jamT -= dt;
        if (player2.jamFlashT > 0) player2.jamFlashT -= dt; // cosmetic dud-shot flash
        if (player2.critSpeedT > 0) player2.critSpeedT -= dt; // drain the crit footwork burst (guest reads it)
        if (player2.meleeT > 0) player2.meleeT -= dt;
        if (player2.skillCheckActive) {
          player2.skillCheckT += dt * pinSpeed(player2); // accumulate phase (no teleport)
          if (player2.skillCheckLockoutT > 0) player2.skillCheckLockoutT -= dt;
        } else {
          player2.skillCheckLockoutT = 0;
        }
        if (player2.reloadingT > 0) {
          player2.reloadingT -= dt;
          if (player2.reloadingT <= 0 && lvlsFor(player2).machineGun > 0) {
            player2.ammo = mgMagSize(player2);
          }
        }
        // Auto-fire while the guest is holding the mouse — machine-gun & sword.
        const p2lvls = lvlsFor(player2);
        // Minigun spin-up tracking for P2 (mirrors player 1).
        if ((player2.mouseDown || player2.magDumpLeft > 0) && p2lvls.machineGun > 0 && player2.ammo > 0 && !player2.skillCheckNeedsRelease) {
          player2.mgSpinT = (player2.mgSpinT || 0) + dt; // spins up on held fire AND during a mag dump
        } else {
          player2.mgSpinT = 0;
        }
        if (p2lvls.machineGun > 0 && player2.mouseDown && !gameOver) tryShootP2();
        if (p2lvls.sword >= 1 && player2.mouseDown && !gameOver) tryShootP2();
        // Mag-dump tick.
        if (player2.magDumpLeft > 0 && !gameOver) {
          const p2Lvls = lvlsFor(player2);
          const p2DumpKnockMul = (p2Lvls.minigun > 0) ? (1 + p2Lvls.minigun * 0.7) : 1;
          const p2DumpRocketOpts = player2.magDumpRocket ? { rocketBoom: true } : undefined;
          const p2DumpDblBarrel = p2Lvls.doubleBarrel > 0; // Double-Machine combo — both barrels each round
          player2.magDumpT -= dt;
          while (player2.magDumpT <= 0 && player2.magDumpLeft > 0 && player2.ammo > 0) {
            fireBurstP2(1, p2DumpRocketOpts);
            if (p2DumpDblBarrel) fireBurstP2(1, p2DumpRocketOpts); // twice every shot
            player2.ammo--;
            player2.magDumpLeft--;
            knockbackPlayer2(0.12 * p2DumpKnockMul);
            spawnSmoke(player2.x + Math.cos(player2.dir) * 0.6, player2.y + Math.sin(player2.dir) * 0.6, 1);
            player2.magDumpT += mgShotCooldown(player2) * MAG_DUMP_SPEEDUP; // a touch faster than left-click; minigun spins up as it runs
          }
          if (player2.magDumpLeft <= 0 || player2.ammo <= 0) {
            // P2 must also press R to start a fresh reload.
            player2.magDumpLeft = 0;
            player2.magDumpRocket = false;
          }
        }
      }
    }

    // Camera follows player
    const target = worldToScreenNoCam(player.x, player.y);
    camX += (target.x - camX) * Math.min(1, dt * 6);
    camY += (target.y - camY) * Math.min(1, dt * 6);

    // Fences flash while a wolf is tearing at them. Decays locally on the
    // guest too — the next snapshot will overwrite hurtT anyway.
    for (const f of fences) if (f.hurtT > 0) f.hurtT -= dt;

    // ---- Authoritative world simulation: host-only in multiplayer. ----
    // The guest's wolves/chickens/coops/etc. are replaced wholesale by the
    // next snapshot, so running AI on the guest would only fight the sync.
    const isGuest = multiplayer && !isHost;
    if (!isGuest) {
      if (waveActive) waveElapsed += dt;
      // Combo timer — expires 2s after the last kill and resets the counter.
      if (comboT > 0) { comboT -= dt; if (comboT <= 0) { comboKills = 0; comboFloat = null; } }
      if (comboFloat) {
        comboFloat.screenYOff -= 28 * dt;
        comboFloat.alpha      -= 0.55 * dt;
        if (comboFloat.alpha <= 0) comboFloat = null;
      }
      // Coops only lay during the first CHICKEN_SPAWN_WINDOW seconds of an
      // active wave. Outside that window (pre-game grace, late wave, between
      // waves) they hold off — keeps each round's flock to what the player
      // started with plus the early-wave dump.
      // During the wave-50 fight, let coops keep laying through the 'pack'
      // phases (the wolf-horde breaks between boss sides) so the flock the boss
      // is siphoning can replenish.
      const coopsCanLay = (waveActive && waveElapsed < CHICKEN_SPAWN_WINDOW)
        || (bossWaveActive && bossPhase === 'pack');
      // Coops spawn chickens
      for (const c of coops) {
        c.spawnT -= dt;
        if (c.shakeT > 0) c.shakeT -= dt; // missile-strike shudder, drives drawCoop jitter
        if (c.igniteT > 0) c.igniteT -= dt; // missile fire dies down after COOP_IGNITE_DURATION
        // The bare-earth patch around a coop slowly spreads outward as it ages.
        c.dirtR = Math.min(3.0, (c.dirtR || 0) + dt * 0.01);
        // cap chickens by total coop count — a fat chicken eats two slots.
        let aliveChickens = 0;
        for (const ch of chickens) {
          if (ch.alive) aliveChickens += ch.fat ? 2 : 1;
        }
        let nearby = 0;
        for (const ch of chickens) {
          if (!ch.alive) continue;
          if (ch.home === c) nearby += ch.fat ? 2 : 1;
        }
        // Each coop holds 4 chickens, +1 extra slot per level (floor) it has.
        let maxChickens = 0;
        for (const cc of coops) maxChickens += 4 + (cc.level || 0);
        maxChickens = Math.min(maxChickens, MAX_CHICKENS); // safety cap
        const coopSlots = 4 + (c.level || 0);
        const hasRoom = aliveChickens < maxChickens && nearby < coopSlots;
        // Cosmetic flag: the coop gently rocks in drawCoop while a chicken is
        // actually brewing inside (lay window open + room for the chick).
        // Synced to the guest via the coop snapshot.
        c.laying = coopsCanLay && hasRoom;
        if (c.spawnT <= 0) {
          // Hold the timer at zero outside the lay window — otherwise placing
          // a coop between waves burns its first cycle on the silent re-roll
          // and the next wave's 30s window can run out before it fires.
          if (!coopsCanLay) { c.spawnT = 0; continue; }
          c.spawnT = rand(CHICKEN_RESPAWN_MIN, CHICKEN_RESPAWN_MAX) * tableAt('hatchRate');
          if (hasRoom) spawnChicken(c);
        }
      }

      // Entities
      for (const c of chickens) updateChicken(c, dt);
      for (const w of wolves) updateWolf(w, dt);
      bossTick(dt); // wave-50 boss state machine
      // Ghost keepers haunt the pack — drifting through a wolf has a tiny chance
      // to flip it turncoat (it turns on its own). Host-authoritative.
      if (player.ghost) ghostSabotage(player, dt);
      if (player2.active && player2.ghost) ghostSabotage(player2, dt);
      updateP2Cameo(dt);
      radarScan(dt);
      for (const d of dogs) updateDog(d, dt);
      for (const h of hunters) updateHunter(h, dt);
      tickHunterDeaths(dt);
      for (const r of rooftoppers) updateRooftopper(r, dt);
      // Fireplace smoke: an active camp puffs frequently, the extinct fire pit
      // releases a thin trail of cooling smoke until it ages out next wave.
      if (huntersCamps.length) {
        for (const c of huntersCamps) {
          c.smokeT = (c.smokeT || 0) - dt;
          if (c.smokeT <= 0) {
            c.smokeT = rand(0.18, 0.32);
            const fire = campFireWorld(c);
            spawnSmoke(fire.x, fire.y, 1);
          }
        }
      } else if (extinctCamp) {
        extinctCamp.smokeT = (extinctCamp.smokeT || 0) - dt;
        if (extinctCamp.smokeT <= 0) {
          extinctCamp.smokeT = rand(0.9, 1.6);
          const fire = campFireWorld(extinctCamp);
          spawnSmoke(fire.x, fire.y, 1);
        }
      }
      updateFarms(dt);
      // Latch the hunter-camp unlock the first time the player ever crosses
      // the unlock-gold threshold — once true it stays true for the rest of the run.
      if (!everReachedHunterGold && (money >= HUNTER_UNLOCK_GOLD || money2 >= HUNTER_UNLOCK_GOLD)) {
        everReachedHunterGold = true;
      }
      for (let i = pellets.length - 1; i >= 0; i--) {
        const p = pellets[i];
        if (!updatePellet(p, dt)) {
          // Rocket Launcher pellets get one last chance to detonate before
          // they disappear (covers wolf hits, fence stops, out-of-bounds and
          // life expiry — all paths reach this single despawn site).
          maybeRocketExplode(p);
          pellets.splice(i, 1);
        }
      }
      // Remove dead chickens after a while (so they show as corpses briefly)
      for (let i = chickens.length - 1; i >= 0; i--) {
        if (!chickens[i].alive) chickens.splice(i, 1);
      }
      for (let i = wolves.length - 1; i >= 0; i--) {
        if (!wolves[i].alive) wolves.splice(i, 1);
      }
      for (let i = corpses.length - 1; i >= 0; i--) {
        corpses[i].t -= dt;
        if (corpses[i].t <= 0) corpses.splice(i, 1);
      }

      // The timer is paused while a wave is active, before the first coop is placed,
      // or when debug wave auto-start is paused. Also suspended during the
      // menu demo so the ambient backdrop never spawns wolves.
      if (!inMenu && !waveActive && !waveAutoStartPaused && (wave > 0 || coops.length > 0)) {
        waveTimer -= dt;
        // Fast mode jumps 5 waves per clear so the run rockets forward (the wave
        // you just cleared still paid its normal 5× payout via addSharedMoney).
        if (waveTimer <= 0) startWave(debugFastMode ? 5 : 1);
      }
      // Safety net: re-check defense after entity cleanup each frame
      checkWaveDefended();
    } else {
      // On the guest, fade corpses out smoothly between snapshots so the body
      // doesn't sit at full alpha and then pop. Snapshot will resync the rest.
      for (let i = corpses.length - 1; i >= 0; i--) {
        corpses[i].t -= dt;
        if (corpses[i].t <= 0) corpses.splice(i, 1);
      }
    }

    if (shake > 0) shake -= dt;

    // HUD — money column shows the local player's wallet (separate mode) or
    // the shared pot (default). Gun status reflects the local keeper too.
    let _maxChickens = 0;
    for (const _cc of coops) _maxChickens += 4 + (_cc.level || 0);
    document.getElementById('stat-chickens').textContent = chickens.length + '/' + _maxChickens;
    // Dim the Chickens line once coops have stopped laying for this wave.
    const _coopsCanLay = waveActive && waveElapsed < CHICKEN_SPAWN_WINDOW;
    document.getElementById('chickens-group').classList.toggle('dim', !_coopsCanLay);
    document.getElementById('stat-coops').textContent = coops.length;
    const hudIsGuest = multiplayer && !isHost;
    const myMoney = (gameOpts.separateMoney && hudIsGuest) ? money2 : money;
    let moneyStr = '$' + myMoney;
    if (gameOpts.separateMoney && multiplayer) {
      const otherMoney = hudIsGuest ? money : money2;
      moneyStr = '$' + myMoney + ' (buddy $' + otherMoney + ')';
    }
    document.getElementById('stat-money').textContent = moneyStr;
    // Mobile: the always-visible wallet readout next to the HUD toggle button
    // (the full HUD is collapsed behind that button on phones).
    if (isMobileMode) {
      const mobMoney = document.getElementById('mob-money');
      if (mobMoney) mobMoney.textContent = '$' + myMoney;
    }
    const localLvls   = hudIsGuest && gameOpts.individualUpgrades ? upgradeLevels2 : upgradeLevels;
    const localAmmo   = hudIsGuest ? player.ammo : ammo;
    const localChamb  = hudIsGuest ? player.chambered : chambered;
    const localReload = hudIsGuest ? player.reloadingT : reloadingT;
    let gunStatus;
    if (localLvls.sword >= 1) gunStatus = 'sword';
    else if (player.jamT > 0 || player.jamFlashT > 0) gunStatus = 'JAMMED';
    else if (nerdActive) gunStatus = 'solve it!';
    else if (jockActive) gunStatus = 'MASH SPACE!';
    else if (player.skillCheckActive) gunStatus = 'reload — time it!';
    else if (localReload > 0)  gunStatus = 'reloading…';
    else if (localLvls.machineGun > 0) gunStatus = (localAmmo > 0)
        ? ('ammo ' + localAmmo + '/' + mgMagSize(player))
        : 'empty (press R)';
    else if (localChamb) {
      // Double-Barrel shows the live shell count (host/solo only — the guest
      // mirror just carries the chambered flag). Others read plain "loaded".
      gunStatus = (!hudIsGuest && (localLvls.doubleBarrel > 0 || localLvls.minigun > 0))
        ? ('loaded ' + shells + '/' + shotgunMagFor(player))
        : 'loaded';
    }
    else                       gunStatus = 'empty (press R)';
    document.getElementById('stat-gun').textContent = gunStatus;
    document.getElementById('stat-kills').textContent = kills;
    document.getElementById('stat-wave').textContent = wave || '—';
  }

  function worldToScreenNoCam(wx, wy) {
    return { x: (wx - wy) * (TILE_W / 2), y: (wx + wy) * (TILE_H / 2) };
  }

