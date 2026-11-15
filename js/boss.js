  // ---------- Wave-50 boss fight ----------
  function startBossWave() {
    bossWaveActive = true;
    bossPhase = 'intro';
    bossPhaseT = 0;
    bossSidesDone = 0;
    bossOrder = shuffle([0, 1, 2, 3]);
    boss = null;
    bossTint = 0;
    endScreen = false;
    waveActive = true;
    waveElapsed = 0;
    toast('WAVE 100 — the ground trembles…', 3.5);
    playNightOfWolfStart();
  }

  // Drop the boss in at the next corner with a fresh health bar.
  function spawnBoss() {
    // Spawn from the MIDDLE of a map side (top / right / bottom / left), not a corner.
    const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const c = sides[bossOrder[Math.min(3, bossSidesDone)] || 0];
    const m = HALF_MAP - 2.5;
    boss = {
      x: c[0] * m, y: c[1] * m, vx: 0, vy: 0,
      alive: true, boss: true,
      hp: BOSS_HP, maxHp: BOSS_HP, size: BOSS_SIZE,
      hurtT: 0, walkT: 0, fireT: 1.6, aimDir: 0,
      suckT: 4, missileT: 6, missileCharging: false, // initial delays before the new powers open up
      facingLeft: c[0] > 0, bornT: 0, smokeT: 0, retreating: false,
      dmgWindowT: 1, dmgInWindow: 0, // rolling per-second damage cap
    };
    wolves.push(boss);
    shake = Math.max(shake, 0.8); // a heavy quake every time it reappears
    const mk = bossName();
    toast(bossSidesDone === 0 ? (mk + ' ONLINE!') : (mk + ' boots up!'), 2.4);
    playNightOfWolfStart();
    playBossSpawn(); // external FANGUS roar on every (re)spawn
    // Every boss entrance rattles the crew — one hunter bolts for the hills,
    // unless they're maxed-out veterans (Hunter Gear tier 5 holds the line).
    if (hunterPowerLvl() < 5) {
      const brave = hunters.find(h => h.alive && !h.scared && !h.dying);
      if (brave) {
        brave.scared = true;
        brave.burstLeft = 0;
        playHuntersLeave();
        toast('A hunter flees — the beast is too much!', 2.0);
      }
    }
  }
  // Boss designation — FANGUS MK-01 on first appearance, MK-02 next, … MK-04.
  function bossName() { return 'FANGUS MK-0' + Math.min(4, bossSidesDone + 1); }

  function removeBoss() {
    if (boss) { boss.alive = false; const i = wolves.indexOf(boss); if (i >= 0) wolves.splice(i, 1); }
    boss = null;
  }

  // The boss is a tank — it flattens any fence or stone wall it rolls over,
  // leaving a debris pile (and a puff of dust) behind.
  function bossCrushFences(b) {
    let crushed = false;
    const R2 = 2.4;
    for (let i = fences.length - 1; i >= 0; i--) {
      const f = fences[i];
      if (dist2(f.x, f.y, b.x, b.y) < R2) {
        fences.splice(i, 1);
        spawnFenceDebris(f);
        spawnSmoke(f.x, f.y, 4);
        crushed = true;
      }
    }
    // Scarecrows and chicken statues get flattened too (but never coops).
    for (let i = dummies.length - 1; i >= 0; i--) {
      if (dist2(dummies[i].x, dummies[i].y, b.x, b.y) < R2) {
        const d = dummies.splice(i, 1)[0];
        spawnSmoke(d.x, d.y, 5); crushed = true;
      }
    }
    // Farms it rolls over are trampled flat — the crop is destroyed/removed.
    for (let i = farms.length - 1; i >= 0; i--) {
      if (dist2(farms[i].x, farms[i].y, b.x, b.y) < R2) {
        const fm = farms.splice(i, 1)[0];
        spawnSmoke(fm.x, fm.y, 5); crushed = true;
      }
    }
    for (let i = statues.length - 1; i >= 0; i--) {
      if (dist2(statues[i].x, statues[i].y, b.x, b.y) < R2) {
        const st = statues.splice(i, 1)[0];
        spawnSmoke(st.x, st.y, 5); crushed = true;
      }
    }
    // Roll over a hunter camp → it's destroyed (its crew scatters to dust).
    for (let i = huntersCamps.length - 1; i >= 0; i--) {
      const c = huntersCamps[i];
      if (dist2(c.x, c.y, b.x, b.y) < 6) {
        huntersCamps.splice(i, 1);
        for (let j = hunters.length - 1; j >= 0; j--) {
          if (hunters[j].camp === c) { spawnSmoke(hunters[j].x, hunters[j].y, 3); hunters.splice(j, 1); }
        }
        huntersGroups = huntersCamps.length;
        spawnBlast(c.x, c.y); spawnSmoke(c.x, c.y, 12);
        toast('FANGUS flattened a hunter camp!', 1.8);
        crushed = true;
      }
    }
    if (crushed) { playBossCrush(); shake = Math.max(shake, 0.22); }
  }

  // Keep the boss from parking on top of the coops — shove it back out to a
  // safe ring around any coop it strays too close to.
  // A random open spot, well away from both the boss's current tile and the
  // coops — where it charges off to when it gets wedged against a building.
  function bossRandomSpot(b) {
    for (let i = 0; i < 12; i++) {
      const x = rand(-HALF_MAP + 4, HALF_MAP - 4);
      const y = rand(-HALF_MAP + 4, HALF_MAP - 4);
      if (dist2(x, y, b.x, b.y) < 36) continue; // pick somewhere meaningfully away
      let nearCoop = false;
      for (const c of coops) { if (dist2(x, y, c.x, c.y) < 30) { nearCoop = true; break; } }
      if (!nearCoop) return { x, y };
    }
    return { x: rand(-HALF_MAP + 4, HALF_MAP - 4), y: rand(-HALF_MAP + 4, HALF_MAP - 4) };
  }

  function bossAvoidCoops(b) {
    const minD = 4.0;
    for (const c of coops) {
      const dx = b.x - c.x, dy = b.y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        b.x += (dx / d) * (minD - d);
        b.y += (dy / d) * (minD - d);
      }
    }
  }

  // Guaranteed contact damage: any keeper standing in the boss's body gets
  // crushed on the bite cadence (wolfHitT), losing a hat (hidden dodge still
  // applies). Used by both the charge and the normal walk so simply touching
  // FANGUS always hurts — there's no slipping through it unscathed.
  function bossTouchHit(k) {
    k.hurtT = 0.22;
    k.wolfHitT = iframesFor(k);
    shake = Math.max(shake, 0.24);
    playKeeperHit();
    breakLastStand(k);
    if (keeperDodgesHatLoss(k)) return; // hidden dodge — kept the hat
    if (k === player) {
      if (immortal && playerHats <= 1) return; // Immortal holds the last hat (silently)
      const lost = hatColors[hatColors.length - 1];
      playerHats--; hatColors.pop(); onHatLost(lost);
      if (playerHats <= 0) { if (!tryKarmaResurrect()) killKeeper(player, 'host', 'crushed by FANGUS'); }
    } else if (k === player2) {
      player2.hats--;
      if (player2.hats <= 0) killKeeper(player2, 'guest', 'crushed by FANGUS');
    }
  }
  function bossContactDamage(b) {
    for (const k of [player, player2]) {
      if (!k || (k === player2 && !player2.active)) continue;
      if (k.ghost || (k.flightT || 0) > 0 || k.lastStandStealth) continue;
      if ((k.wolfHitT || 0) > 0) continue; // still in the bite cooldown
      if (dist2(k.x, k.y, b.x, b.y) < BOSS_TOUCH_R * BOSS_TOUCH_R) bossTouchHit(k);
    }
  }

  // Apply damage to the boss, but never more than BOSS_MAX_DPS per rolling
  // second (like the keeper's i-frames after a hit) and only while it fights.
  // The boss is immune to status effects entirely — only raw damage counts.
  function bossTakeDamage(b, amount) {
    if (bossPhase !== 'fight' || amount <= 0) return;
    // Landing a shot on FANGUS jolts it hard enough to drop whatever it is
    // siphoning. Checked BEFORE the per-second damage cap so the interrupt
    // still works while sustained fire is being soaked.
    breakChickenSiphons();
    if (b.dmgInWindow >= BOSS_MAX_DPS) { b.hurtT = Math.max(b.hurtT, 0.05); return; }
    const applied = Math.min(amount, BOSS_MAX_DPS - b.dmgInWindow);
    b.hp = Math.max(0, b.hp - applied);
    b.dmgInWindow += applied;
    b.hurtT = 0.1;
  }

  // One wolf for the boss-wave horde — mostly normal, but a healthy share of
  // laser/ranged wolves (and the odd bomb/brood) so the gaps bristle with fire.
  function spawnPackWolf() {
    const r = Math.random();
    if (r < 0.22)      spawnRangedWolf();   // laser wolf
    else if (r < 0.40) spawnHomerWolf();    // ranged homing-bullet wolf
    else if (r < 0.48) spawnBombWolf();
    else if (r < 0.54) spawnBreederWolf();
    else               spawnWolf();
  }

  function spawnBossPack() {
    const gen = runGen;
    pendingSpawns += BOSS_PACK_SIZE;
    for (let i = 0; i < BOSS_PACK_SIZE; i++) {
      setTimeout(() => {
        if (gen !== runGen) return;
        pendingSpawns--;
        if (gameOver || !bossWaveActive) return;
        spawnWolf();
      }, 300 + i * 350);
    }
    toast('The pack pours in — clear them out!', 2.2);
  }

  // Boss movement + attacks while it's actively fighting.
  // The boss's locked middle laser fires at the spot it telegraphed.
  function fireBossMiddleLaser(b) {
    playLaser();
    shake = Math.max(shake, 0.12);
    const ang = Math.atan2(b.laserLockY - b.y, b.laserLockX - b.x);
    // The middle beam AND the two laterals all fire together now, fanning out
    // from the locked direction.
    for (const i of [-1, 0, 1]) {
      const a = ang + i * 0.42;
      const reach = i === 0 ? 40 : 34;
      const end = clipBeamAtWall(b.x, b.y, b.x + Math.cos(a) * reach, b.y + Math.sin(a) * reach);
      applyBeamDamage(b.x, b.y, end.x, end.y);
      beams.push({ x1: b.x, y1: b.y, x2: end.x, y2: end.y, t: 0, life: 0.34, color: '#ff2a2a', yOff: 26, thick: i === 0 ? 2.8 : 2.6 });
    }
  }

  function updateBoss(b, dt) {
    if (b.hurtT > 0) b.hurtT -= dt;
    if (b.missileGoneT > 0) b.missileGoneT -= dt; // rack-reload visual timer
    b.dmgWindowT -= dt;
    if (b.dmgWindowT <= 0) { b.dmgWindowT = 1; b.dmgInWindow = 0; } // refresh the per-second cap
    // Telegraphed middle laser counts down then fires at the locked spot.
    if (b.laserLockT > 0) {
      b.laserLockT -= dt;
      if (b.laserLockT <= 0) { b.laserLockT = 0; fireBossMiddleLaser(b); }
    }
    b.bornT += dt;
    b.walkT += dt * 3;
    const k = nearestKeeper(b.x, b.y) || player;
    const dx = k.x - b.x, dy = k.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    if (Math.abs(dx - dy) > 0.05) b.facingLeft = (dx - dy) < 0;
    const sdx = (dx - dy) * TILE_W / 2, sdy = (dx + dy) * TILE_H / 2;
    b.aimDir = Math.atan2(sdy, sdx);
    // Battle damage — smoke once it drops past half HP, billowing harder at a quarter.
    const hpFrac = b.hp / b.maxHp;
    // "Rage" ramps 0→1 as HP falls from full to a quarter (capped). It speeds up
    // BOTH the boss's movement (×1→×4) and its laser cadence (×1→×2). HP refills
    // to full each phase, so every new MK fight starts back at the calm default.
    const bossRage = clamp((1 - hpFrac) / 0.75, 0, 1);
    const bossSpeedMul = 1 + bossRage * 3; // walk speed: ×1 full HP → ×4 at a quarter
    const bossAtkMul   = 1 + bossRage;     // volley cadence: ×1 → ×2 (twice as fast)
    if (hpFrac < 0.5) {
      b.dmgSmokeT = (b.dmgSmokeT || 0) - dt;
      const rate = hpFrac < 0.25 ? 0.08 : 0.22;
      if (b.dmgSmokeT <= 0) {
        b.dmgSmokeT = rate;
        spawnSmoke(b.x + rand(-1, 1), b.y - 1 + rand(-0.5, 0.5), hpFrac < 0.25 ? 2 : 1);
      }
    }
    // MK-04 missile wind-up — a SHORT telegraph (the rack glows + sparks) while
    // the boss keeps fighting normally. No longer a full freeze, so MK-04 also
    // walks, dashes, lasers and siphons between salvos.
    if (b.missileCharging) {
      b.missileChargeT -= dt;
      b.missileSparkT = (b.missileSparkT || 0) - dt;
      if (b.missileSparkT <= 0) {
        b.missileSparkT = 0.08;
        spawnSmoke(b.x + rand(-1.2, 1.2), b.y - 2 + rand(-0.6, 0.6), 1);
      }
      if (b.missileChargeT <= 0) {
        b.missileCharging = false;
        b.missileT = BOSS_MISSILE_COOLDOWN; // breather before the next wind-up
        b.missileGoneT = 2.5; // the rack sits empty while it reloads, then refills
        fireBossMissiles(b);
      }
      // No return — fall through to the normal movement + attack logic below.
    }
    // Charge attack — only MK-02 onward. A fast forward dash that flattens walls.
    b.dashCdT = (b.dashCdT || 0) - dt;
    if (b.dashT > 0) {
      b.dashT -= dt;
      // Normally the charge homes the keeper; a "reposition" charge (set when the
      // boss is wedged against a coop) instead barrels toward a random open spot.
      let tx = dx / d, ty = dy / d;
      if (b.dashGoalX !== undefined) {
        const gx = b.dashGoalX - b.x, gy = b.dashGoalY - b.y, gd = Math.hypot(gx, gy) || 1;
        tx = gx / gd; ty = gy / gd;
        if (gd < 1.5) b.dashT = 0; // reached the spot — end the charge
      }
      b.vx = tx * BOSS_DASH_SPEED; b.vy = ty * BOSS_DASH_SPEED;
      b.x = clamp(b.x + b.vx * dt, -HALF_MAP + 2, HALF_MAP - 2);
      b.y = clamp(b.y + b.vy * dt, -HALF_MAP + 2, HALF_MAP - 2);
      bossCrushFences(b);
      bossAvoidCoops(b);
      bossContactDamage(b); // a ram into a keeper always lands
      if (b.dashT <= 0) { b.dashGoalX = undefined; b.dashGoalY = undefined; } // clear when the charge ends
      return; // no firing mid-charge
    }
    // Crowd it and it always answers with a charge — you can't just hug FANGUS to
    // sit inside the laser fan. Off-cooldown only, so it isn't a constant ram.
    if (b.bornT > 1.2 && b.dashCdT <= 0 && d < BOSS_CLOSE_DASH_R) {
      b.dashGoalX = undefined; b.dashGoalY = undefined; // home in on the keeper
      b.dashT = BOSS_DASH_TIME; b.dashCdT = BOSS_DASH_CD;
      playBossDash(); shake = Math.max(shake, 0.3);
      return;
    }
    if (bossSidesDone >= 1 && b.bornT > 1.2 && b.dashCdT <= 0 && Math.random() < BOSS_DASH_CHANCE * dt) {
      b.dashGoalX = undefined; b.dashGoalY = undefined; // home in on the keeper
      b.dashT = BOSS_DASH_TIME; b.dashCdT = BOSS_DASH_CD;
      playBossDash(); shake = Math.max(shake, 0.3);
      return;
    }
    // Slow, lumbering walk-stop-walk gait (the dash above is unaffected).
    b.gaitT = (b.gaitT || 0) - dt;
    if (b.gaitT <= 0) { b.walking = !b.walking; b.gaitT = b.walking ? rand(1.3, 2.1) : rand(0.9, 1.5); }
    const standoff = 7;
    const spd = 1.8 * bossSpeedMul; // base walk doubled — FANGUS moves with purpose
    if (b.walking && d > standoff + 0.5)      { b.vx = (dx / d) * spd;       b.vy = (dy / d) * spd; }
    else if (b.walking && d < standoff - 0.5) { b.vx = -(dx / d) * spd * 0.7; b.vy = -(dy / d) * spd * 0.7; }
    else                                      { b.vx = 0; b.vy = 0; }
    b.x = clamp(b.x + b.vx * dt, -HALF_MAP + 2, HALF_MAP - 2);
    b.y = clamp(b.y + b.vy * dt, -HALF_MAP + 2, HALF_MAP - 2);
    bossCrushFences(b); // it rolls straight through fences and stone walls
    bossAvoidCoops(b);  // but keeps its distance from the coops
    bossContactDamage(b); // standing in its body always costs a hat
    // Stuck-on-a-coop escape: sample its position once a second; if it was trying
    // to advance on the keeper but a coop wedged in the way kept shoving it back
    // so it barely moved, it gives up and charges off to a random open spot.
    b.stuckRefT = (b.stuckRefT || 0) - dt;
    if (b.stuckRefX === undefined || b.stuckRefT <= 0) {
      if (b.stuckRefX !== undefined) {
        const movedFar = dist2(b.x, b.y, b.stuckRefX, b.stuckRefY) > 1.0; // >1 tile this past second
        const tryingToMove = b.walking && d > standoff + 0.5;
        if (!movedFar && tryingToMove && b.dashT <= 0 && b.dashCdT <= 0) {
          const spot = bossRandomSpot(b);
          b.dashGoalX = spot.x; b.dashGoalY = spot.y;
          b.dashT = BOSS_DASH_TIME; b.dashCdT = BOSS_DASH_CD;
          playBossDash(); shake = Math.max(shake, 0.25);
        }
      }
      b.stuckRefX = b.x; b.stuckRefY = b.y; b.stuckRefT = 1.0;
    }
    if (b.bornT > 1.0) {            // a short settle so the entrance reads
      b.fireT -= dt;
      if (b.fireT <= 0) { b.fireT = BOSS_FIRE_COOLDOWN / bossAtkMul; bossFire(b, Math.atan2(dy, dx)); } // volleys speed up with rage (heal + missiles keep their pace)
      // MK-03 power — siphon a chicken back to heal (phase 3).
      if (bossSidesDone >= 2) {
        b.suckT = (b.suckT || 0) - dt;
        if (b.suckT <= 0) { b.suckT = BOSS_SUCK_COOLDOWN; fireChickenSucker(b); }
      }
      // MK-04 power — wind up a missile salvo aimed at a coop (phase 4). The
      // missiles ignore walls, so the only defence is killing the boss or
      // moving the flock — not turtling behind stone.
      if (bossSidesDone >= 3 && coops.length > 0 && !b.missileCharging) {
        b.missileT = (b.missileT || 0) - dt;
        if (b.missileT <= 0) {
          b.missileCharging = true;
          b.missileChargeT = BOSS_MISSILE_CHARGE;
          b.missileTargetCoop = pickMissileCoop();
          shake = Math.max(shake, 0.2);
          playRocketWhoosh();
        }
      }
    }
  }

  // A volley: a fat triple laser sweep + a spread of big homing bullets.
  function bossFire(b, ang) {
    shake = Math.max(shake, 0.12);
    // The whole laser fan (middle + both laterals) is telegraphed — lock the
    // keeper's spot now and fire all three together LASER_LOCK_TIME later, so
    // the volley can be dodged as one.
    const tgt = nearestKeeper(b.x, b.y) || player;
    b.laserLockX = tgt.x; b.laserLockY = tgt.y; b.laserLockT = LASER_LOCK_TIME;
    for (let i = -2; i <= 2; i++) {
      const a = ang + i * 0.28;
      pellets.push({
        x: b.x, y: b.y,
        vx: Math.cos(a) * HOMER_BULLET_SPEED * 0.6, // slower homing shots
        vy: Math.sin(a) * HOMER_BULLET_SPEED * 0.6,
        life: HOMER_BULLET_LIFE * 1.6, dmg: 0, pierce: 1, r: 5.5,
        color: '#ff6a2a', trail: true, shooter: 'wolf', wolfHoming: true, homingTarget: tgt,
        bossBullet: true, // 50% chance to cook off (red) at end of life, flattening nearby buildings
      });
    }
  }

  // ----- MK-03 chicken siphon -----
  // Launch a homing orb at the nearest free chicken. Once it grabs the bird it
  // drags it back to the boss; a delivered chicken heals FANGUS. The orb ignores
  // walls entirely now — the only way to stop it is to shoot the chicken loose
  // mid-haul. No launch toast: the player only hears about it once it succeeds.
  function fireChickenSucker(b) {
    let target = null, nd = Infinity;
    for (const c of chickens) {
      if (!c.alive || c.suckedBy || (c.carrier && c.carrier.alive) || c.savedT > 0) continue;
      const dd = dist2(c.x, c.y, b.x, b.y);
      if (dd < nd) { nd = dd; target = c; }
    }
    if (!target) { b.suckT = 1.2; return; } // no free chicken — retry shortly
    chickenSuckers.push({ x: b.x, y: b.y - 0.6, phase: 'seek', target, life: 8, t: 0 });
    playLaser();
  }

  // Fling one swallowed chicken out of the dying boss on a tumbling arc.
  function burstChickenFromBoss(b) {
    const a = Math.random() * Math.PI * 2;
    const sp = rand(1.8, 5.2);
    bossBurstChickens.push({
      x: b.x + rand(-0.8, 0.8),
      y: b.y + rand(-0.8, 0.8),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      z: rand(0.6, 1.6),            // height in "tiles" above the ground
      vz: rand(5.5, 9.0),
      spin: Math.random() * Math.PI * 2,
      spinV: rand(-9, 9),
    });
    playChickenPop();
  }

  // Ballistic arcs for the disgorged flock. A bird that lands inside the map
  // joins the flock for real — the player gets back what FANGUS ate.
  function updateBossBurstChickens(dt) {
    for (let i = bossBurstChickens.length - 1; i >= 0; i--) {
      const c = bossBurstChickens[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vz -= 15 * dt;             // gravity
      c.z += c.vz * dt;
      c.spin += c.spinV * dt;
      if (c.z > 0) continue;
      bossBurstChickens.splice(i, 1);
      const lim = HALF_MAP - 1.5;
      if (Math.abs(c.x) > lim || Math.abs(c.y) > lim) continue; // flung off the farm
      if (chickens.length >= MAX_CHICKENS) continue;
      chickens.push({
        x: c.x, y: c.y, vx: 0, vy: 0, wanderT: 0,
        // No coop to call home is fine — every .home read is null-guarded.
        home: coops.length ? coops[Math.floor(Math.random() * coops.length)] : null,
        fleeT: 0, alive: true, bob: Math.random() * Math.PI * 2,
        facingLeft: false, fat: false, worker: false, rich: false,
      });
    }
  }

  // Pop every live siphon orb and release its chicken ALIVE, with the same
  // brief re-snag grace that shooting an orb directly grants. Called when the
  // boss itself is hit, so a kidnap in progress can be interrupted by fighting
  // back instead of only by sniping the orb.
  function breakChickenSiphons() {
    if (!chickenSuckers.length) return;
    for (let i = chickenSuckers.length - 1; i >= 0; i--) {
      const s = chickenSuckers[i];
      if (s.target) { s.target.suckedBy = null; s.target.savedT = 1.5; }
      spawnSmoke(s.x, s.y, 4);
      chickenSuckers.splice(i, 1);
    }
    playChickenPop();
    toast('FANGUS lost its grip — chicken saved!', 1.2);
  }

  function updateChickenSuckers(dt) {
    for (let i = chickenSuckers.length - 1; i >= 0; i--) {
      const s = chickenSuckers[i];
      s.t += dt; s.life -= dt;
      const c = s.target;
      // Orb fizzles if it outlives its fuse, loses its chicken (shot dead), or
      // there's no boss left to feed — the chicken (if any) is simply released.
      const fizzle = () => {
        if (c) c.suckedBy = null;
        chickenSuckers.splice(i, 1);
      };
      if (s.life <= 0 || !c || !c.alive) { fizzle(); continue; }
      const targetBoss = (boss && boss.alive && bossPhase === 'fight');
      if (s.phase === 'return' && !targetBoss) { fizzle(); continue; }
      // Where the orb wants to go: the chicken while seeking, the boss while hauling.
      const tx = s.phase === 'seek' ? c.x : (boss ? boss.x : s.x);
      const ty = s.phase === 'seek' ? c.y : (boss ? boss.y - 0.6 : s.y);
      const dx = tx - s.x, dy = ty - s.y;
      const dd = Math.hypot(dx, dy) || 1;
      const step = BOSS_SUCK_SPEED * dt;
      const nx = s.x + (dx / dd) * step, ny = s.y + (dy / dd) * step;
      // The orb passes straight through walls now — fences are no defence.
      s.x = nx; s.y = ny;
      if (s.phase === 'seek') {
        if (dd < BOSS_SUCK_GRAB_R) { s.phase = 'return'; c.suckedBy = s; playMagic(); } // snags the bird
      } else {
        // Drag the captured chicken along on the orb.
        c.x = s.x; c.y = s.y;
        if (dd < BOSS_SUCK_GRAB_R + 0.4) {
          // Delivered — FANGUS devours the chicken and heals.
          boss.hp = Math.min(boss.maxHp, boss.hp + BOSS_SUCK_HEAL);
          c.suckedBy = null;
          killChicken(c);
          spawnSmoke(boss.x, boss.y - 1, 6);
          shake = Math.max(shake, 0.18);
          playChickenDeath();
          toast('FANGUS fed — it healed!', 1.6);
          chickenSuckers.splice(i, 1);
        }
      }
    }
  }

  // ----- MK-04 twin missiles -----
  // Pick which coop a missile salvo targets — the tallest standing coop (most
  // floors to topple, and the likeliest to be hosting a rooftopper). Ties break
  // randomly. Returns null if there are no coops.
  function pickMissileCoop() {
    if (coops.length === 0) return null;
    let best = [], bestLvl = -1;
    for (const c of coops) {
      const lvl = c.level || 0;
      if (lvl > bestLvl) { bestLvl = lvl; best = [c]; }
      else if (lvl === bestLvl) best.push(c);
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  // Launch a pair of coop-seeking missiles from (x,y). Shared by the boss's
  // MK-04 salvo and the wave-51+ missile wolf. They steer gently toward the
  // coop so a standing one is reliably struck. `ignoreWalls` (the boss's
  // missiles) lets them pierce fences; the missile wolf's still detonate on
  // walls, so for the wolf a stone wall is a real defence.
  function spawnMissilePair(x, y, coop, ignoreWalls) {
    if (!coop || !coops.includes(coop)) return;
    playRocketWhoosh();
    shake = Math.max(shake, 0.22);
    for (const sideOff of [-0.7, 0.7]) {
      const sx = x + sideOff, sy = y - 1.4;
      const a = Math.atan2(coop.y - sy, coop.x - sx);
      bossMissiles.push({
        x: sx, y: sy,
        vx: Math.cos(a) * BOSS_MISSILE_SPEED,
        vy: Math.sin(a) * BOSS_MISSILE_SPEED,
        life: BOSS_MISSILE_LIFE, tilt: a, targetCoop: coop, ignoreWalls: !!ignoreWalls,
      });
    }
  }

  function fireBossMissiles(b) {
    let coop = b.missileTargetCoop;
    if (!coop || !coops.includes(coop)) coop = pickMissileCoop();
    spawnMissilePair(b.x, b.y, coop, true); // boss missiles pierce walls
  }

  function bossMissileExplode(m) {
    spawnBlast(m.x, m.y);
    playExplosion();
    spawnSmoke(m.x, m.y, 7);
    shake = Math.max(shake, 0.3);
    explosionHitKeepers(m.x, m.y, BOSS_MISSILE_BLAST_R);
  }

  // A missile (boss OR the wave-51+ missile wolf) connects with a coop: it
  // shudders, sheds 1–3 floors that it must then regrow, and any rooftopper
  // perched on it is knocked off to its death. Fewer floors = fewer chicken
  // slots and a weaker/slower rooftopper, so a strike really stings.
  function damageCoopFromMissile(coop) {
    coop.shakeT = 0.6; // drives the visual jitter in drawCoop
    const have = coop.level || 0;
    const span = MISSILE_MAX_FLOORS - MISSILE_MIN_FLOORS + 1;
    const lost = Math.min(have, MISSILE_MIN_FLOORS + Math.floor(Math.random() * span));
    if (lost > 0) {
      coop.level = have - lost;
      // Push builtWave forward so the regular every-5-waves growth has to
      // rebuild the lost floors instead of snapping them straight back.
      coop.builtWave = (coop.builtWave || 0) + lost * 10;
    }
    shake = Math.max(shake, 0.4);
    // Knock any rooftopper off this coop — it tumbles off the roof and dies,
    // with a fitting Wilhelm scream.
    for (const r of rooftoppers) {
      if (r.alive && !r.falling && r.coop === coop) {
        r.falling = true; r.fallT = 0; r.fallVy = 0; r.fallY = 0; r.fallRot = 0;
        r.fallSpin = Math.random() < 0.5 ? -1 : 1;
        r.aiming = false;
        playWilhelm();
      }
    }
    if (lost > 0) toast('A coop took a missile — lost ' + lost + ' floor' + (lost > 1 ? 's' : '') + '!', 1.8);
    else toast('A coop took a missile hit!', 1.6);
    // Set the coop ablaze on random floors for a few seconds (drawCoop renders
    // the hot-shot flames; igniteT is synced so the guest sees it too).
    coop.igniteT = COOP_IGNITE_DURATION;
  }

  // A boss homing bullet that cooked off at the end of its flight: a red blast
  // that hurts keepers in range AND flattens any buildings close to it.
  function bossBulletExplode(x, y) {
    spawnBlast(x, y, '#ff2a2a'); // red detonation
    playExplosion();
    shake = Math.max(shake, 0.3);
    explosionHitKeepers(x, y, BOSS_BULLET_BLAST_R);
    const r2 = BOSS_BULLET_BLAST_R * BOSS_BULLET_BLAST_R;
    for (let i = fences.length - 1; i >= 0; i--) if (dist2(fences[i].x, fences[i].y, x, y) < r2) { spawnFenceDebris(fences[i]); spawnSmoke(fences[i].x, fences[i].y, 3); fences.splice(i, 1); }
    for (let i = dummies.length - 1; i >= 0; i--) if (dist2(dummies[i].x, dummies[i].y, x, y) < r2) { spawnSmoke(dummies[i].x, dummies[i].y, 4); dummies.splice(i, 1); }
    for (let i = statues.length - 1; i >= 0; i--) if (dist2(statues[i].x, statues[i].y, x, y) < r2) { spawnSmoke(statues[i].x, statues[i].y, 4); statues.splice(i, 1); }
    for (let i = farms.length - 1; i >= 0; i--) if (dist2(farms[i].x, farms[i].y, x, y) < r2) { spawnSmoke(farms[i].x, farms[i].y, 3); farms.splice(i, 1); }
    // NOTE: coops are deliberately spared here — only the MK-04 missiles damage
    // coops (lose floors + ignite). Bullets just flatten the smaller placeables.
  }

  function updateBossMissiles(dt) {
    for (let i = bossMissiles.length - 1; i >= 0; i--) {
      const m = bossMissiles[i];
      m.life -= dt;
      // Gentle homing keeps each missile locked on its coop.
      if (m.targetCoop && coops.includes(m.targetCoop)) {
        const desired = Math.atan2(m.targetCoop.y - m.y, m.targetCoop.x - m.x);
        const cur = Math.atan2(m.vy, m.vx);
        let da = desired - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const turn = Math.max(-2.5 * dt, Math.min(2.5 * dt, da));
        const na = cur + turn;
        m.vx = Math.cos(na) * BOSS_MISSILE_SPEED;
        m.vy = Math.sin(na) * BOSS_MISSILE_SPEED;
        m.tilt = na;
      }
      const nx = m.x + m.vx * dt, ny = m.y + m.vy * dt;
      // Direct coop strike — the missile's whole purpose.
      if (m.targetCoop && coops.includes(m.targetCoop) &&
          dist2(nx, ny, m.targetCoop.x, m.targetCoop.y) < 0.6) {
        m.x = nx; m.y = ny;
        damageCoopFromMissile(m.targetCoop);
        bossMissileExplode(m); bossMissiles.splice(i, 1); continue;
      }
      // Detonate at the edge, or when the fuse burns out. Boss missiles
      // (ignoreWalls) pierce fences; the missile wolf's still blow on a wall.
      if (m.life <= 0 || (!m.ignoreWalls && fenceBlocks(nx, ny)) ||
          Math.abs(nx) > HALF_MAP - 0.5 || Math.abs(ny) > HALF_MAP - 0.5) {
        m.x = nx; m.y = ny; bossMissileExplode(m); bossMissiles.splice(i, 1); continue;
      }
      m.x = nx; m.y = ny;
      let hit = false;
      if (!player.ghost && (player.flightT || 0) <= 0 && dist2(m.x, m.y, player.x, player.y) < 0.5) hit = true;
      if (!hit && player2.active && !player2.ghost && (player2.flightT || 0) <= 0 &&
          dist2(m.x, m.y, player2.x, player2.y) < 0.5) hit = true;
      if (hit) { bossMissileExplode(m); bossMissiles.splice(i, 1); }
    }
  }

  // The state machine that runs the whole wave-50 fight (host-authoritative).
  function bossTick(dt) {
    if (!bossWaveActive) return;
    // The boss's chicken-siphon orbs tick every frame of the fight, regardless
    // of which sub-phase the state machine is in. (Missiles tick in the main
    // update loop so the wave-51+ missile wolf's salvos work outside the fight.)
    updateChickenSuckers(dt);
    updateBossBurstChickens(dt);
    bossPhaseT += dt;
    if (bossPhase === 'intro') {
      // Sky shifts to dusk-orange and the screen quakes before it shows up.
      bossTint = Math.min(1, bossTint + dt / BOSS_INTRO_DELAY);
      shake = Math.max(shake, 0.22 + 0.16 * (bossPhaseT / BOSS_INTRO_DELAY));
      if (bossPhaseT >= BOSS_INTRO_DELAY) { spawnBoss(); bossPhase = 'fight'; bossPhaseT = 0; }
      return;
    }
    if (bossPhase === 'fight') {
      if (boss && boss.alive) updateBoss(boss, dt);
      if (boss && boss.hp <= 0) {
        bossSidesDone++;
        if (bossSidesDone >= 4) { bossPhase = 'explode'; bossPhaseT = 0; }
        else { bossPhase = 'retreat'; bossPhaseT = 0; boss.retreating = true; playBossDash(); }
      }
      return;
    }
    if (bossPhase === 'retreat') {
      if (boss && boss.alive) {
        boss.smokeT = (boss.smokeT || 0) - dt;
        if (boss.smokeT <= 0) { boss.smokeT = 0.08; spawnSmoke(boss.x, boss.y, 1); }
        // Bolt straight out to the nearest map edge.
        const bx = Math.abs(boss.x) >= Math.abs(boss.y) ? (boss.x < 0 ? -HALF_MAP : HALF_MAP) : boss.x;
        const by = Math.abs(boss.y) >  Math.abs(boss.x) ? (boss.y < 0 ? -HALF_MAP : HALF_MAP) : boss.y;
        const dx = bx - boss.x, dy = by - boss.y, d = Math.hypot(dx, dy) || 1;
        boss.x += (dx / d) * 8 * dt; boss.y += (dy / d) * 8 * dt;
        if (Math.abs(dx - dy) > 0.05) boss.facingLeft = (dx - dy) < 0;
        bossCrushFences(boss); // it smashes through walls on the way out too
      }
      const atEdge = boss && (Math.abs(boss.x) > HALF_MAP - 0.6 || Math.abs(boss.y) > HALF_MAP - 0.6);
      if (!boss || !boss.alive || atEdge || bossPhaseT > 3.4) {
        removeBoss();
        bossPackSpawnT = 0;
        bossPhase = 'pack'; bossPhaseT = 0;
        spawnWolf({ hatted: true }); // every boss pack drops at least one hat wolf
        toast('The pack pours in — hold out!', 2.2);
      }
      return;
    }
    if (bossPhase === 'pack') {
      // A dense, varied horde pours in for BOSS_PACK_DURATION seconds, then the
      // boss returns. Two wolves per tick keeps the pressure on.
      if (bossPhaseT < BOSS_PACK_DURATION) {
        bossPackSpawnT -= dt;
        const liveWolves = wolves.reduce((n, w) => n + (w.alive && !w.boss ? 1 : 0), 0);
        if (bossPackSpawnT <= 0 && liveWolves < BOSS_PACK_CAP) {
          spawnPackWolf();
          if (liveWolves + 1 < BOSS_PACK_CAP) spawnPackWolf();
          bossPackSpawnT = BOSS_PACK_INTERVAL;
        }
      } else {
        spawnBoss(); bossPhase = 'fight'; bossPhaseT = 0;
      }
      return;
    }
    if (bossPhase === 'explode') {
      // Act 1 — FANGUS tears itself apart. Blasts rip across the hull while
      // the whole flock it swallowed comes squawking back out, then one last
      // detonation. Act 2 is the quiet: the blood sky bleeds back to normal
      // before the end screen drops (handled by bossSkyFade below).
      if (bossPhaseT < BOSS_EXPLODE_BLASTS_T) {
        // Blast rate ramps as it comes apart — a slow cook-off building to a roar.
        const ramp = 0.35 + 0.65 * (bossPhaseT / BOSS_EXPLODE_BLASTS_T);
        if (boss && Math.random() < dt * 14 * ramp) {
          spawnBlast(boss.x + rand(-2.0, 2.0), boss.y + rand(-2.0, 2.0));
          playExplosion();
          shake = Math.max(shake, 0.55 + 0.35 * ramp);
        }
        // …and it disgorges the flock, a few birds at a time.
        if (boss && Math.random() < dt * 11) burstChickenFromBoss(boss);
      }
      if (boss && bossPhaseT >= BOSS_EXPLODE_BLASTS_T) {
        // The finale: one huge blast, a last spray of birds, then it's gone.
        for (let i = 0; i < 10; i++) burstChickenFromBoss(boss);
        spawnBlast(boss.x, boss.y);
        spawnSmoke(boss.x, boss.y, 14);
        playExplosion();
        shake = Math.max(shake, 1.2);
        removeBoss();
      }
      // Act 2 — drain the red out of the sky over the remaining seconds.
      if (bossPhaseT >= BOSS_EXPLODE_BLASTS_T) {
        const t = (bossPhaseT - BOSS_EXPLODE_BLASTS_T) / BOSS_EXPLODE_FADE_T;
        bossSkyFade = Math.max(0, 1 - t);
        bossTint = Math.max(0, bossTint - dt / BOSS_EXPLODE_FADE_T);
      }
      if (bossPhaseT > BOSS_EXPLODE_DUR) {
        removeBoss();
        bossSkyFade = 1; // the flag has done its job; reset for a future run
        bossPhase = 'cleared';
        bossWaveActive = false;
        bossWaveCleared();
      }
      return;
    }
  }

  function bossWaveCleared() {
    const reward = 500;
    addSharedMoney(reward);
    bossTint = 0;
    endScreen = true;
    passedBoss = true; // unlocks the rocket-launch restart + new-game-plus bonus
    awardBossMedal();
    playNightOfWolfEnd();
    toast('FANGUS MK-04 DESTROYED!  +$' + reward, 3.5);
  }

  // Award the FANGUS-kill mustache to the deserving keeper — and it grows
  // WIDER each time. Solo: it's all yours. Co-op: score each keeper from their
  // run (wolves killed + barrel reach earn it; deaths + trampled chickens cost)
  // and the better run takes it.
  function awardBossMedal() {
    if (!player2.active) {
      player.mustache = (player.mustache || 0) + 1;
      toast('You earned the FANGUS mustache!', 2.6);
      return;
    }
    const score = (k) => {
      const l = lvlsFor(k);
      return (k.kills || 0) * 2 + (l.range || 0) * 1.5
           - (k.deaths || 0) * 5 - (k.chickensShot || 0);
    };
    const s2 = score(player2), s1 = score(player);
    if (s2 > s1) { player2.mustache = (player2.mustache || 0) + 1; toast('Buddy earned the FANGUS mustache!', 2.6); }
    else         { player.mustache = (player.mustache || 0) + 1; toast('You earned the FANGUS mustache!', 2.6); } // ties → P1
  }

  // Endscreen "Keep going" — close it and flow into the normal wave-cleared
  // upgrade screen, which then advances to wave 51.
  function bossContinue() {
    endScreen = false;
    bossPhase = '';
    waveActive = false;
    upgradeDelayT = 0.4;
  }

  // When a dummy or statue is reduced to 0 HP, splice it out of its list and
  // run the type's death effect — dummies explode at max upgrade, statues
  // just shatter quietly.
  function onDecoyDestroyed(target) {
    if (target._decoy === 'dummy') {
      const i = dummies.indexOf(target);
      if (i >= 0) dummies.splice(i, 1);
      if (upgradeLevels.dummy >= 5) {
        spawnBlast(target.x, target.y);
        playExplosion();
        shake = Math.max(shake, 0.4);
        const r2 = DUMMY_EXPLOSION_R * DUMMY_EXPLOSION_R;
        for (const wv of wolves) {
          if (!wv.alive) continue;
          const dd = dist2(wv.x, wv.y, target.x, target.y);
          if (dd < r2) {
            const dx = wv.x - target.x, dy = wv.y - target.y;
            const m = Math.sqrt(dd) || 1;
            hurtWolf(wv, DUMMY_EXPLOSION_DMG, (dx / m) * 0.3, (dy / m) * 0.3);
          }
        }
        toast('Scarecrow exploded!', 1.4);
      } else {
        toast('A scarecrow was destroyed!', 1.0);
      }
    } else if (target._decoy === 'statue') {
      const i = statues.indexOf(target);
      if (i >= 0) statues.splice(i, 1);
      toast('A chicken statue shattered!', 1.0);
    }
  }

  // A sabotaged wolf's fuse runs out — it detonates, damaging the surrounding
  // pack (but never the keeper; it's on your side now). Credited to player 1.
  function explodeSabotagedWolf(w) {
    spawnBlast(w.x, w.y);
    playExplosion();
    spawnSmoke(w.x, w.y, 8);
    shake = Math.max(shake, 0.3);
    const R2 = SABOTAGE_BLAST_R * SABOTAGE_BLAST_R;
    for (const o of wolves) {
      if (o === w || !o.alive || o.defective || o.boss) continue;
      const dd = dist2(o.x, o.y, w.x, w.y);
      if (dd < R2) {
        const dx = o.x - w.x, dy = o.y - w.y, m = Math.sqrt(dd) || 1;
        hurtWolf(o, SABOTAGE_BLAST_DMG, (dx / m) * 0.3, (dy / m) * 0.3, player);
      }
    }
    w.alive = false;
    checkWaveDefended();
  }

  // Sabotage variant: a defective wolf ignores chickens, keepers, dummies —
  // every target — and shuffles around in random directions, flickering eye
  // and all. At max Sabotage some hatch turncoat: blue eye, hunts the
  // nearest live wolf in the pack instead of any keeper or chicken.
  function updateDefectiveWolf(w, dt) {
    if (!w.alive) return;
    if (w.hurtT > 0) w.hurtT -= dt;
    if (w.meleeT > 0) w.meleeT -= dt;
    // Sabotaged wolves are unstable — after a fuse they cook off, tearing into
    // the surrounding pack (the keeper's parting gift). The last few seconds
    // smoke heavily as a warning.
    w.sabotageFuseT = (w.sabotageFuseT || 0) + dt;
    if (SABOTAGE_FUSE - w.sabotageFuseT < 3) {
      w.smokeT = (w.smokeT || 0) - dt;
      if (w.smokeT <= 0) { w.smokeT = 0.18; spawnSmoke(w.x, w.y - 0.5, 1); }
    }
    if (w.sabotageFuseT >= SABOTAGE_FUSE) { explodeSabotagedWolf(w); return; }
    const baseSpeed = 2.2 * (w.speedMul || 1) * weatherSpeedMul(); // snow bogs the pack down
    // Turncoat: pick the nearest live non-defective wolf as prey and chew it down.
    if (w.turncoat) {
      let prey = null, nd = Infinity;
      for (const other of wolves) {
        if (other === w || !other.alive) continue;
        // Don't bite other defectives or foxes/pups — keeps the chaos to real wolves.
        if (other.defective || other.fox || other.pup) continue;
        const d = dist2(other.x, other.y, w.x, w.y);
        if (d < nd) { nd = d; prey = other; }
      }
      if (prey) {
        const dx = prey.x - w.x, dy = prey.y - w.y;
        const m = Math.hypot(dx, dy) || 1;
        w.vx = (dx / m) * baseSpeed;
        w.vy = (dy / m) * baseSpeed;
        if (m < 0.7) {
          w.attackT -= dt;
          if (w.attackT <= 0) {
            w.attackT = 0.6;
            w.meleeT = MELEE_ANIM_DUR;
            w.meleeDir = Math.atan2(dy, dx);
            hurtWolf(prey, 2, (dx / m) * 0.25, (dy / m) * 0.25, w);
          }
        }
      } else {
        // No prey left — wander.
        w.wanderT -= dt;
        if (w.wanderT <= 0) { w.wanderT = rand(0.6, 1.6); w.wanderDir = Math.random() * Math.PI * 2; }
        w.vx = Math.cos(w.wanderDir) * baseSpeed * 0.6;
        w.vy = Math.sin(w.wanderDir) * baseSpeed * 0.6;
      }
    } else {
      // Plain defective: drunken random walk. No threat to anyone.
      w.wanderT -= dt;
      if (w.wanderT <= 0) {
        w.wanderT = rand(0.5, 1.4);
        w.wanderDir = Math.random() * Math.PI * 2;
      }
      w.vx = Math.cos(w.wanderDir) * baseSpeed * 0.5;
      w.vy = Math.sin(w.wanderDir) * baseSpeed * 0.5;
    }
    moveWithFences(w, dt);
    const sv = w.vx - w.vy;
    if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
    // Bounce off the map edge so they don't pile up against it.
    if (w.x <= -HALF_MAP + 1 || w.x >= HALF_MAP - 1 ||
        w.y <= -HALF_MAP + 1 || w.y >= HALF_MAP - 1) {
      w.wanderDir += Math.PI;
    }
  }

  // Charge a fence and gnaw it down — shared by the keeper-siege and the
  // decoy-siege paths. A maxed (spiked) fence wounds the wolf as it claws.
  function siegeFenceAttack(w, fence, spd, dt) {
    const fdx = fence.x - w.x, fdy = fence.y - w.y;
    const fm = Math.hypot(fdx, fdy) || 1;
    w.vx = (fdx / fm) * spd;
    w.vy = (fdy / fm) * spd;
    w.aggroT = 0.4;
    if (fm < 1.0) {
      w.attackT -= dt;
      if (w.attackT <= 0) {
        w.attackT = 0.7;
        fence.hp -= 1;
        fence.hurtT = 0.16;
        shake = Math.max(shake, 0.12);
        const fenceMaxed = fence.kind === 'stone'
          ? upgradeLevels.stoneWall >= 5 : upgradeLevels.woodFence >= 5;
        if (fenceMaxed) {
          hurtWolf(w, fence.kind === 'stone' ? WALL_THORN_DMG : FENCE_THORN_DMG,
                   (-fdx / fm) * 0.2, (-fdy / fm) * 0.2);
        }
        if (fence.hp <= 0) {
          const fi = fences.indexOf(fence);
          if (fi >= 0) fences.splice(fi, 1);
          spawnFenceDebris(fence);
          w.siegeT = 0;
        }
      }
    } else {
      w.attackT = 0.4;
    }
  }

  // Parry Mode: a wolf's lunge reaches the keeper — bite like a normal attack
  // (respecting the shared bite-cooldown and the hidden dodge), then spend the
  // lunge. The keeper is meant to roll out of the way before this lands.
  function parryDashHitKeeper(w, k) {
    w.parryDashT = 0;            // the lunge connects (or whiffs) — it's spent
    w.parryCd = PARRY_COOLDOWN;
    if (k.ghost || k.dying) return;
    if ((k.flightT || 0) > 0 || k.lastStandStealth) return; // airborne / cloaked slips it
    if ((k.wolfHitT || 0) > 0) return;                      // shared bite-cooldown
    k.wolfHitT = iframesFor(k);
    shake = Math.max(shake, 0.3);
    k.hurtT = 0.22;
    playKeeperHit();
    breakLastStand(k);
    if (keeperDodgesHatLoss(k)) return; // hidden dodge — kept the hat
    if (k === player) {
      if (immortal && playerHats <= 1) return; // Immortal holds the last hat (silently)
      const lost = hatColors[hatColors.length - 1];
      playerHats--; hatColors.pop(); onHatLost(lost);
      if (playerHats <= 0) { if (!tryKarmaResurrect()) killKeeper(player, 'host', 'wolf'); }
    } else {
      k.hats--;
      if (k.hats <= 0) killKeeper(k, 'guest', 'wolf');
    }
  }

  function updateWolf(w, dt) {
    if (!w.alive) return;
    if (w.boss) return; // the boss is driven by bossTick, not the generic wolf AI
    // Post-wave-50 damage-soak window — refreshes the per-second cap (see
    // cappedWolfDamage). Ticked here for every wolf variant.
    if (wave > 50) {
      w.dmgWindowT = (w.dmgWindowT || 1) - dt;
      if (w.dmgWindowT <= 0) { w.dmgWindowT = 1; w.dmgInWindow = 0; }
    }
    if (w.dpsDummy) {   // debug DPS target — just tallies damage per second
      if (w.hurtT > 0) w.hurtT -= dt;
      w.dpsWindowT = (w.dpsWindowT || 1) - dt;
      if (w.dpsWindowT <= 0) { w.dps = Math.round(w.dpsAccum || 0); w.dpsAccum = 0; w.dpsWindowT = 1; }
      return;
    }
    // Status effects tick for EVERY wolf variant (handled before the per-type
    // dispatch). Hot Shot burns over time; Cold Shot chills (slow handled in
    // the movement code below).
    if (w.burnT > 0) {
      w.burnT -= dt;
      w.burnTickT = (w.burnTickT || 0) - dt;
      if (w.burnTickT <= 0) {
        w.burnTickT = BURN_TICK;
        playFireCrackle(); // self-throttled — one crackle however many are alight
        hurtWolf(w, burnTickDmg(w), 0, 0, player); // credits P1; handles death/scoring
        if (!w.alive) return;
      }
    }
    if (w.coldT > 0) w.coldT -= dt;
    // Ghost wolf: when hit it fades and silently drifts off the map.
    if (w.ghostWolf && w.ghostFleeing) {
      w.ghostAlpha = Math.max(0, (w.ghostAlpha || 1) - dt * 0.8);
      const spd = 3.5;
      const ex = w.x < 0 ? -(HALF_MAP + 2) : (HALF_MAP + 2);
      const ey = w.y < 0 ? -(HALF_MAP + 2) : (HALF_MAP + 2);
      const tgtEdge = Math.abs(w.x) > Math.abs(w.y)
        ? { x: ex, y: w.y } : { x: w.x, y: ey };
      const dx = tgtEdge.x - w.x, dy = tgtEdge.y - w.y;
      const dm = Math.hypot(dx, dy) || 1;
      w.x += (dx / dm) * spd * dt;
      w.y += (dy / dm) * spd * dt;
      if (w.ghostAlpha <= 0 || Math.abs(w.x) > HALF_MAP + 1 || Math.abs(w.y) > HALF_MAP + 1) {
        w.alive = false;
      }
      return;
    }
    if (w.hunterWolf) { updateHunterWolf(w, dt); return; }
    if (w.missileWolf) { updateMissileWolf(w, dt); return; }
    if (w.parachuting) { updateParachuteWolf(w, dt); return; }
    if (w.crawler) { updateThingCrawler(w, dt); return; }
    if (w.fox) { updateFox(w, dt); return; }
    if (w.bomb) { updateBombWolf(w, dt); return; }
    if (w.pup) { updatePupWolf(w, dt); return; }
    if (w.ranged || w.homer) { updateRangedWolf(w, dt); return; }
    if (waveActive && waveElapsed >= 60 && !bossWaveActive && !w.fleeing && Math.random() < 0.15 * dt) {
      w.fleeing = true;
      w.fleeEscapeT = 10; // must reach the map edge within 10s or it explodes
    }
    if (w.fleeing) { updateFleeingWolf(w, dt); return; }
    if (w.defective) { updateDefectiveWolf(w, dt); return; }
    // Stun: a max-level statue's aura can put a wolf to sleep for a short
    // window. Stunned wolves don't move, target, or attack.
    if (w.stunT > 0) { w.stunT -= dt; return; }
    if (upgradeLevels.statue >= 5 && statues.length) {
      for (const st of statues) {
        const d2 = dist2(st.x, st.y, w.x, w.y);
        if (d2 < STATUE_STUN_AURA_R * STATUE_STUN_AURA_R) {
          if (Math.random() < STATUE_STUN_PER_SEC * dt) {
            w.stunT = STATUE_STUN_DURATION;
            break;
          }
        }
      }
      if (w.stunT > 0) return;
    }
    if (w.hurtT > 0) w.hurtT -= dt;
    if (w.meleeT > 0) w.meleeT -= dt;
    // Find closest chicken — assassin wolves ignore chickens and hunt the player.
    let target = null, nd = Infinity;
    if (!w.assassin) {
      for (const c of chickens) {
        if (!c.alive || c.carrier || c.suckedBy) continue;
        const d = dist2(c.x, c.y, w.x, w.y);
        if (d < nd) { nd = d; target = c; }
      }
      // Decoy buildings — dummies are always considered (they steal aggro),
      // statues are considered only if this wolf doesn't "see through" them.
      for (const d of dummies) {
        const dd = dist2(d.x, d.y, w.x, w.y);
        if (dd < nd) { nd = dd; target = d; }
      }
      const statueIgnore = STATUE_IGNORE_CHANCE[upgradeLevels.statue] || 0;
      if (statueIgnore < 1) {
        for (const s of statues) {
          if (statueIgnore > 0 && Math.random() < statueIgnore) continue;
          const dd = dist2(s.x, s.y, w.x, w.y);
          if (dd < nd) { nd = dd; target = s; }
        }
      }
    }
    // If either keeper is closer and threatening, sometimes harass them.
    // No live keeper → wolves can't pick a player target; they stick to
    // their chicken target (if any) or wander.
    const candidate = nearestKeeper(w.x, w.y);
    if (candidate) {
      const dp = dist2(candidate.x, candidate.y, w.x, w.y);
      if (!target || dp < 4) target = target && nd < dp * 0.5 ? target : (dp < 9 ? candidate : target || candidate);

      if (w.playerFocusT > 0) {
        w.playerFocusT = Math.max(0, w.playerFocusT - dt);
      }
      if (dp < 81 && w.playerFocusT <= 0 && Math.random() < wolfFocusChance * 0.12) {
        w.playerFocusT = 1.2;
      }
      // When the keeper is busy reloading and the wolf is close, the wolf gets
      // a little extra "reconsider" — it re-rolls whether to lock on, weighted
      // by wolfFocusChance (Meat Bait makes it commit, Wolf Repellent makes it
      // think twice and often wander back off).
      const keeperReloading = (candidate === player)
        ? (reloadingT > 0 || player.skillCheckActive)
        : (candidate.reloadingT > 0 || candidate.skillCheckActive);
      if (dp < 36 && keeperReloading && Math.random() < 0.08) {
        w.playerFocusT = (Math.random() < wolfFocusChance) ? 1.2 : 0;
      }
      if (w.playerFocusT > 0 || w.assassin) {
        target = candidate;
      }
    } else if (w.playerFocusT > 0) {
      w.playerFocusT = 0; // can't focus a ghost
    }

    // Hunters are aggressive threats — if one is the closest live target it
    // pulls the wolf away from chickens/keepers. Assassins still prefer the
    // player, but will swap onto a hunter who's right in their face.
    if (hunters.length) {
      let bestH = null, bestHd = Infinity;
      for (const h of hunters) {
        if (!h.alive) continue;
        const d = dist2(h.x, h.y, w.x, w.y);
        if (d < bestHd) { bestHd = d; bestH = h; }
      }
      if (bestH && bestHd < 64) {
        const curD = target ? dist2(target.x, target.y, w.x, w.y) : Infinity;
        if (bestHd < curD * 0.9) target = bestH;
      }
    }

    const targetIsPlayer = (target === player || target === player2);
    if (targetIsPlayer) {
      w.aggroT = 0.4;
    } else if (w.aggroT > 0) {
      w.aggroT = Math.max(0, w.aggroT - dt);
    }
    // ---- Experimental Parry Mode: sparkle-lunge special attack ----
    // Any plain wolf that strays near a keeper may wind up (eye sparkles), lock
    // on, then dash straight in and bite on contact — even if it was chasing a
    // chicken. Roll (SHIFT) to dodge it. Special variants returned earlier;
    // jumpers/carriers skip it.
    if (parryMode && !w.jumper && !w.carrying) {
      if ((w.parryCd || 0) > 0) w.parryCd -= dt;
      if ((w.parryDashT || 0) > 0) {
        // Lunge: barrel toward the keeper at high speed. It homes for the FIRST
        // half of the lunge, then commits — the back half flies dead straight,
        // so a well-timed dodge-roll once it's locked in slips the attack.
        w.parryDashT -= dt;
        const pk = w.parryK; // the keeper locked in at sparkle time
        const homing = w.parryDashT > PARRY_DASH_DUR * 0.5; // track only the first half
        if (pk && homing) {
          const dpx = pk.x - w.x, dpy = pk.y - w.y, pd = Math.hypot(dpx, dpy) || 1;
          const blend = Math.min(1, PARRY_DASH_HOMING * dt);
          w.parryDashX += (dpx / pd - w.parryDashX) * blend;
          w.parryDashY += (dpy / pd - w.parryDashY) * blend;
          const hl = Math.hypot(w.parryDashX, w.parryDashY) || 1;
          w.parryDashX /= hl; w.parryDashY /= hl;
        }
        w.vx = w.parryDashX * PARRY_DASH_SPEED;
        w.vy = w.parryDashY * PARRY_DASH_SPEED;
        moveWithFences(w, dt);
        if (pk && Math.hypot(pk.x - w.x, pk.y - w.y) < 0.75) parryDashHitKeeper(w, pk);
        const sv = w.vx - w.vy;
        if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
        return;
      }
      if ((w.sparkleT || 0) > 0) {
        // Wind-up: the eye twinkles; the wolf braces and keeps re-aiming at the
        // locked keeper so it can't be dodged before it commits.
        w.sparkleT -= dt;
        const pk = w.parryK;
        if (pk) {
          const dpx = pk.x - w.x, dpy = pk.y - w.y, pdist = Math.hypot(dpx, dpy) || 1;
          w.parryDashX = dpx / pdist; w.parryDashY = dpy / pdist;
        }
        w.vx *= 0.5; w.vy *= 0.5;
        moveWithFences(w, dt);
        if (w.sparkleT <= 0) w.parryDashT = PARRY_DASH_DUR; // launch!
        return;
      }
      // Idle: roll to start a lunge when a keeper is in range and off cooldown.
      if ((w.parryCd || 0) <= 0) {
        const pk = nearestKeeper(w.x, w.y);
        if (pk) {
          const pdist = Math.hypot(pk.x - w.x, pk.y - w.y);
          if (pdist > 0.9 && pdist < PARRY_TRIGGER_RANGE
              && Math.random() < PARRY_CHANCE_PER_SEC * dt) {
            w.parryK = pk;
            w.sparkleT = PARRY_SPARKLE_DUR;
            w.parryCd = PARRY_COOLDOWN;
            playSparkle();
          }
        }
      }
    }
    // (Size Matters no longer scares wolves — it's now a barrel/range +
    // lifetime + bounce upgrade; see fireBurst / fireLaserShot.)
    // Decoy attack — short-circuit the chicken/keeper attack tree and run a
    // simpler "siege the decoy" loop. The wolf walks straight at it, bites
    // on a cooldown, and triggers onDecoyDestroyed when HP runs out.
    if (target && target._decoy) {
      const dx = target.x - w.x, dy = target.y - w.y;
      const m = Math.hypot(dx, dy) || 1;
      const baseSpeed = 2.6;
      const spd = baseSpeed * (w.speedMul || 1) * coldSlowMul(w);
      // Is a wall sitting between the wolf and the decoy? If so, the wolf wises
      // up — once frustrated it sieges the blocking fence instead of piling
      // uselessly against it. A scarecrow behind a wall no longer just
      // neutralises the pack; they tear the wall down to reach it.
      const decoyBlocked = fenceBlocks((w.x + target.x) * 0.5, (w.y + target.y) * 0.5)
                        || fenceBlocks(w.x + (dx / m) * 0.9, w.y + (dy / m) * 0.9);
      const decoySiege = w.siegeT > SIEGE_DELAY ? nearestFence(w.x, w.y) : null;
      if (decoySiege) {
        siegeFenceAttack(w, decoySiege, spd, dt);
      } else {
        w.vx = (dx / m) * spd;
        w.vy = (dy / m) * spd;
        w.aggroT = 0.4;
        if (m < DECOY_REACH && !decoyBlocked) {
          w.attackT -= dt;
          if (w.attackT <= 0) {
            w.attackT = DECOY_BITE_COOLDOWN;
            target.hp -= 1;
            target.hurtT = 0.16;
            shake = Math.max(shake, 0.08);
            if (target.hp <= 0) onDecoyDestroyed(target);
          }
        } else {
          w.attackT = 0.4;
        }
      }
      // Wolves chasing a decoy still respect fences — a dummy/statue built
      // behind a wall shouldn't let wolves phase through. A sustained block
      // builds frustration that tips them into the siege above.
      const decoyHit = moveWithFences(w, dt);
      w.siegeT = (decoyHit || decoyBlocked)
        ? Math.min(SIEGE_DELAY + 3, w.siegeT + dt)
        : Math.max(0, w.siegeT - dt * 2);
      const sv2 = w.vx - w.vy;
      if (Math.abs(sv2) > 0.05) w.facingLeft = sv2 < 0;
      return;
    }
    if (target) {
      const dx = target.x - w.x, dy = target.y - w.y;
      const m = Math.hypot(dx, dy) || 1;
      const atkRange = w.sword ? 1.15 : 0.8; // sword wolves reach a bit further (range bumped a touch)
      const baseSpeed = 2.6;
      // Meat Bait / Wolf Repellent also tweak speed while charging a keeper.
      let spd = baseSpeed * (w.speedMul || 1) * (targetIsPlayer ? wolfRushSpeed : 1) * coldSlowMul(w);
      // Assassins are capped at their target keeper's full-sprint speed.
      if (w.assassin) spd = Math.min(spd, (target.speed || player.speed) * (1 + tableAt('sprint')));
      // Steer around fences: when one blocks the way ahead, commit to skirting
      // along whichever side leads back toward the target.
      let ux = dx / m, uy = dy / m;
      const LOOK = 0.9;
      if (w.detourT > 0) {
        w.detourT -= dt;
        ux = w.detourX; uy = w.detourY;
        if (!fenceBlocks(w.x + (dx / m) * LOOK, w.y + (dy / m) * LOOK)) w.detourT = 0;
      } else if (fenceBlocks(w.x + ux * LOOK, w.y + uy * LOOK)) {
        const p1x = -uy, p1y = ux, p2x = uy, p2y = -ux;
        const b1 = fenceBlocks(w.x + p1x * LOOK, w.y + p1y * LOOK);
        const b2 = fenceBlocks(w.x + p2x * LOOK, w.y + p2y * LOOK);
        let sx, sy;
        if (b1 && !b2)      { sx = p2x; sy = p2y; }
        else if (b2 && !b1) { sx = p1x; sy = p1y; }
        else if (dist2(w.x + p1x, w.y + p1y, target.x, target.y) <=
                 dist2(w.x + p2x, w.y + p2y, target.x, target.y)) { sx = p1x; sy = p1y; }
        else                { sx = p2x; sy = p2y; }
        ux = sx * 0.85 + (dx / m) * 0.3;
        uy = sy * 0.85 + (dy / m) * 0.3;
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul; uy /= ul;
        w.detourT = 0.5; w.detourX = ux; w.detourY = uy;
      }
      w.vx = ux * spd;
      w.vy = uy * spd;

      // Frustration (w.siegeT) builds up below while fences block the wolf;
      // once it's been walled in long enough it sieges the nearest fence —
      // this is what stops the player turtling behind an unbreakable wall.
      const siegeFence = w.siegeT > SIEGE_DELAY ? nearestFence(w.x, w.y) : null;

      if (siegeFence) {
        // Siege mode: charge the fence and tear it down.
        siegeFenceAttack(w, siegeFence, spd, dt);
      } else if (m < atkRange && !fenceBlocks((w.x + target.x) * 0.5, (w.y + target.y) * 0.5)) {
        // Normal attack — but not through a fence.
        w.attackT -= dt;
        if (w.attackT <= 0) {
          w.attackT = 0.7;
          // Bad karma secretly spooks the pack: each -10 karma gives a ~2%
          // chance (per attack) that the wolf turns tail and flees instead of
          // biting. Assassins are too committed to spook.
          const tgtKeeper = (target === player || target === player2) ? target : null;
          if (tgtKeeper && !w.assassin && !w.fleeing) {
            const tk = (tgtKeeper === player) ? player.karma : (tgtKeeper.karma || 0);
            if (tk < 0 && Math.random() < 0.02 * Math.floor(-tk / 10)) w.fleeing = true;
          }
          // Sword wolves swing their blade — kick off the white melee arc.
          if (w.sword && !w.fleeing) { w.meleeT = MELEE_ANIM_DUR; w.meleeDir = Math.atan2(dy, dx); }
          if (target === player && !player.ghost && !w.fleeing) {
            // Rocket Boots: while airborne the keeper is out of melee reach
            // entirely — the bite swings through air. Same for the Last
            // Stand cloak (wolves can't see them to swing).
            if ((player.flightT || 0) > 0 || player.lastStandStealth) {
              // melee miss; let attackT reset so they don't spam.
            } else if (player.wolfHitT > 0) {
              if (!gameOver && Math.random() < tableAt('counter')) meleeCounter(w);
            } else {
              player.wolfHitT = iframesFor(player);
              shake = 0.25;
              player.hurtT = 0.22;
              playKeeperHit();
              breakLastStand(player); // a bite knocks you out of the Last Stand pose
              if (keeperDodgesHatLoss(player)) {
                // hidden dodge — kept the hat
              } else if (immortal && playerHats <= 1) {
                // Immortal holds the last hat (silently)
              } else {
                const lost = hatColors[hatColors.length - 1];
                playerHats--;
                hatColors.pop();
                onHatLost(lost);
                if (playerHats <= 0) {
                  if (!tryKarmaResurrect()) killKeeper(player, 'host', 'wolf');
                }
              }
              // Melee counter — a chance to strike the attacker back.
              if (!gameOver && Math.random() < tableAt('counter')) meleeCounter(w);
            }
          } else if (target === player2 && !player2.ghost && !w.fleeing) {
            if ((player2.flightT || 0) > 0 || player2.lastStandStealth) {
              // P2 mirror — flying or cloaked dodges the bite.
            } else if (player2.wolfHitT > 0) {
              // No damage this tick — still in the pack-bite cooldown.
            } else {
              player2.wolfHitT = iframesFor(player2);
              shake = 0.18;
              player2.hurtT = 0.22;
              playKeeperHit();
              breakLastStand(player2); // a bite knocks P2 out of the Last Stand pose
              if (!keeperDodgesHatLoss(player2)) { // hidden dodge — kept the hat
                player2.hats--;
                if (player2.hats <= 0) {
                  killKeeper(player2, 'guest', 'wolf');
                }
              }
            }
          } else if (target && target._hunter) {
            // Wolves chew through a hunter's HP rather than knocking off hats.
            // A wolf kill never breaks the camp (byPlayer = false).
            target.hp -= 1;
            target.hurtT = 0.22;
            if (target.hp <= 0) onHunterKilled(target, false);
          } else if (target.alive) {
            // Wolf Heist: the wolf grabs the chicken alive and bolts for the
            // map edge — kill the player a chance to save it by killing the
            // wolf before it slips off. Fat chickens are too heavy to carry,
            // so they're killed outright as before.
            if (!target.fat && Math.random() < tableAt('snatch')) {
              w.fleeing = true;
              w.carrying = true;
              w.carriedChicken = target;
              target.carrier = w;
            } else {
              killChicken(target);
              playChickenDeath();
              explodeChickenMaybe(target);
              corpses.push({ x: target.x, y: target.y, kind: 'chicken', t: 4 });
            }
          }
        }
      } else {
        w.attackT = 0.4;
      }
    }
    const wSvx = w.vx - w.vy;
    if (Math.abs(wSvx) > 0.05) w.facingLeft = wSvx < 0;
    // Jumping wolves vault clean over fences. While airborne (jumpT > 0) they
    // ignore fence collision and fly straight; a fence in the path kicks off a
    // hop, and they take the odd flavour hop on open ground too.
    if (w.jumper) {
      if (w.jumpT > 0) w.jumpT = Math.max(0, w.jumpT - dt);
      const jx = w.x + w.vx * dt, jy = w.y + w.vy * dt;
      const airborne = w.jumpT > 0;
      if (!airborne && (fenceBlocks(jx, jy) || fenceBlocks(jx, w.y) || fenceBlocks(w.x, jy))) {
        w.jumpT = 0.5; w.jumpDur = 0.5; // hop over the obstacle
      } else if (!airborne) {
        w.hopCdT = (w.hopCdT || 0) - dt;
        if (w.hopCdT <= 0 && Math.random() < 0.6 * dt) { w.jumpT = 0.4; w.jumpDur = 0.4; w.hopCdT = rand(1.5, 3.5); }
      }
      if (w.jumpT > 0) {
        // Airborne — sail straight over fences and any frustration resets.
        w.x = clamp(w.x + w.vx * dt, -HALF_MAP + 1, HALF_MAP - 1);
        w.y = clamp(w.y + w.vy * dt, -HALF_MAP + 1, HALF_MAP - 1);
        w.siegeT = Math.max(0, w.siegeT - dt * 2);
        return;
      }
    }
    // Move with fence collision — axis-separated so wolves slide along walls.
    // A wolf already inside a fence (one built on top of it) may walk free.
    // When both axes are individually clear, also require the combined
    // destination to be clear — otherwise a wolf can squeeze through the
    // hairline diagonal gap between two fences placed in a staircase pattern.
    const stepX = w.x + w.vx * dt, stepY = w.y + w.vy * dt;
    const wInside = fenceBlocks(w.x, w.y);
    const xClear = !fenceBlocks(stepX, w.y);
    const yClear = !fenceBlocks(w.x, stepY);
    const diagClear = !fenceBlocks(stepX, stepY);
    const xAllowed = wInside || (xClear && (!yClear || diagClear));
    const yAllowed = wInside || (yClear && (!xClear || diagClear));
    let fenceHit = false;
    if (xAllowed) w.x = stepX; else fenceHit = true;
    if (yAllowed) w.y = stepY; else fenceHit = true;
    w.x = clamp(w.x, -HALF_MAP + 1, HALF_MAP - 1);
    w.y = clamp(w.y, -HALF_MAP + 1, HALF_MAP - 1);
    // A fence physically blocking the wolf builds frustration; a sustained
    // block (a walled-in target) tips it into siege mode (handled above).
    w.siegeT = fenceHit ? Math.min(SIEGE_DELAY + 3, w.siegeT + dt)
                        : Math.max(0, w.siegeT - dt * 2);
  }

  // Fox AI: dash to the nearest chicken, kill exactly one, then bolt for the
  // closest map edge and vanish. Foxes never touch the player.
  function updateFox(f, dt) {
    if (!f.alive) return;
    if (f.hurtT > 0) f.hurtT -= dt;
    const speed = 2.6 * (f.speedMul || 1);

    let tx, ty;
    if (!f.fleeing) {
      // Hunt the nearest live chicken.
      let target = null, nd = Infinity;
      for (const c of chickens) {
        if (!c.alive || c.carrier || c.suckedBy) continue;
        const d = dist2(c.x, c.y, f.x, f.y);
        if (d < nd) { nd = d; target = c; }
      }
      if (!target) {
        f.fleeing = true; // nothing left to hunt — leave empty-pawed
      } else {
        tx = target.x; ty = target.y;
        if (nd < 0.25) {
          // Caught it. A normal chicken is carried off alive — the player can
          // still save it by killing the fox before it reaches the map edge.
          // A fat one is too heavy to carry; it dies on the spot.
          f.fleeing = true;
          if (target.fat) {
            killChicken(target);
            playChickenDeath();
            explodeChickenMaybe(target);
            corpses.push({ x: target.x, y: target.y, kind: 'chicken', t: 4 });
          } else {
            f.carrying = true;
            f.carriedChicken = target;
            target.carrier = f;
          }
          toast('A fox snatched a chicken!', 1.4);
        }
      }
    }
    if (f.fleeing) {
      // Bolt for whichever map edge is closest.
      const r = HALF_MAP;
      const dl = f.x + r, dr = r - f.x, dd = f.y + r, du = r - f.y;
      const md = Math.min(dl, dr, dd, du);
      if (md === dl)      { tx = -r; ty = f.y; }
      else if (md === dr) { tx = r;  ty = f.y; }
      else if (md === dd) { tx = f.x; ty = -r; }
      else                { tx = f.x; ty = r; }
    }

    const dx = tx - f.x, dy = ty - f.y;
    const m = Math.hypot(dx, dy) || 1;
    f.vx = (dx / m) * speed;
    f.vy = (dy / m) * speed;
    // Foxes hop over fences (wood or stone) rather than walking through them.
    // When a fence sits in the path ahead, kick off a short jump arc — during
    // the jump the fox is airborne, so fenceBlocks doesn't apply.
    if (!(f.jumpT > 0)) {
      const LOOK = 0.6;
      const nx = f.x + (f.vx / speed) * LOOK;
      const ny = f.y + (f.vy / speed) * LOOK;
      if (fenceBlocks(nx, ny)) {
        f.jumpT = 0.45; // seconds in the air
        f.jumpDur = 0.45;
      }
    }
    if (f.jumpT > 0) f.jumpT = Math.max(0, f.jumpT - dt);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.bob = (f.bob || 0) + dt * (Math.hypot(f.vx, f.vy) > 0.1 ? 11 : 2);
    const fSvx = f.vx - f.vy;
    if (Math.abs(fSvx) > 0.05) f.facingLeft = fSvx < 0;

    // Reached the edge while fleeing — vanish without a trace (no corpse).
    if (f.fleeing && (f.x <= -HALF_MAP + 1 || f.x >= HALF_MAP - 1 ||
                      f.y <= -HALF_MAP + 1 || f.y >= HALF_MAP - 1)) {
      if (f.carriedChicken) {
        const c = f.carriedChicken;
        killChicken(c);
        c.carrier = null;
        f.carriedChicken = null;
      }
      f.alive = false;
      checkWaveDefended();
    }
  }

  // A parachuting wolf drifting down to its landing spot. Its world (x,y) is
  // the landing point; parachuteH is the screen-pixel height it still has to
  // fall. AI is frozen until it touches down, then it's an ordinary wolf.
  function updateParachuteWolf(w, dt) {
    if (!w.alive) return;
    if (w.hurtT > 0) w.hurtT -= dt;
    w.parachuteT -= dt;
    if (w.parachuteT <= 0) {
      w.parachuting = false;
      w.parachuteH = 0;
      return;
    }
    // Ease the remaining height down to 0; sway gently as it falls.
    w.parachuteH = PARACHUTE_START_H * (w.parachuteT / PARACHUTE_FALL_TIME);
    w.parachuteSway = (w.parachuteSway || 0) + dt * 2.2;
  }

  // The head-crawler left by a slain thing wolf: scuttles flat-out for the
  // nearest map edge and slips away. Phases over fences (it's tiny) and leaves
  // no corpse if it escapes; pellets can still pop it on the way out.
  function updateThingCrawler(w, dt) {
    if (!w.alive) return;
    if (w.hurtT > 0) w.hurtT -= dt;
    if (w.invulnT > 0) w.invulnT -= dt;
    const speed = THING_CRAWLER_SPEED * (w.speedMul || 1);
    const r = HALF_MAP;
    const dl = w.x + r, dr = r - w.x, dd = w.y + r, du = r - w.y;
    const md = Math.min(dl, dr, dd, du);
    let tx, ty;
    if (md === dl)      { tx = -r; ty = w.y; }
    else if (md === dr) { tx = r;  ty = w.y; }
    else if (md === dd) { tx = w.x; ty = -r; }
    else                { tx = w.x; ty = r; }
    const dx = tx - w.x, dy = ty - w.y;
    const m = Math.hypot(dx, dy) || 1;
    w.vx = (dx / m) * speed;
    w.vy = (dy / m) * speed;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.legPhase = (w.legPhase || 0) + dt * 20; // fast scuttle
    const sv = w.vx - w.vy;
    if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
    // Slipped off the edge — gone for good, no corpse.
    if (w.x <= -HALF_MAP + 1 || w.x >= HALF_MAP - 1 ||
        w.y <= -HALF_MAP + 1 || w.y >= HALF_MAP - 1) {
      w.alive = false;
      checkWaveDefended();
    }
  }

  // A wolf that snatched a chicken (Wolf Heist upgrade): it bolts for
  // the nearest map edge carrying its kill and slips away — moving slower
  // under the load. Pellets can still bring it down on the way out.
  function updateFleeingWolf(w, dt) {
    if (!w.alive) return;
    if (w.hurtT > 0) w.hurtT -= dt;
    if (w.meleeT > 0) w.meleeT -= dt;
    // Countdown: if it fails to reach the edge in 10s, it explodes in panic.
    if (w.fleeEscapeT !== undefined) {
      w.fleeEscapeT -= dt;
      if (w.fleeEscapeT <= 0) {
        spawnBlast(w.x, w.y, '#ff6020', 1.2);
        spawnSmoke(w.x, w.y, 3);
        if (w.carriedChicken) { killChicken(w.carriedChicken); w.carriedChicken = null; }
        w.alive = false;
        playExplosion();
        checkWaveDefended();
        return;
      }
    }
    const speed = 2.6 * (w.speedMul || 1) * SNATCH_SPEED_MUL;
    // Head for whichever map edge is closest.
    const r = HALF_MAP;
    const dl = w.x + r, dr = r - w.x, dd = w.y + r, du = r - w.y;
    const md = Math.min(dl, dr, dd, du);
    let tx, ty;
    if (md === dl)      { tx = -r; ty = w.y; }
    else if (md === dr) { tx = r;  ty = w.y; }
    else if (md === dd) { tx = w.x; ty = -r; }
    else                { tx = w.x; ty = r; }
    const dx = tx - w.x, dy = ty - w.y;
    const m = Math.hypot(dx, dy) || 1;
    w.vx = (dx / m) * speed;
    w.vy = (dy / m) * speed;
    // Fleeing snatchers still have to push around fences — they can't phase
    // through a wall just because they're carrying a chicken.
    moveWithFences(w, dt);
    const wSvx = w.vx - w.vy;
    if (Math.abs(wSvx) > 0.05) w.facingLeft = wSvx < 0;
    // Slipped off the edge — gone for good, with the chicken (no corpse).
    if (w.x <= -HALF_MAP + 1 || w.x >= HALF_MAP - 1 ||
        w.y <= -HALF_MAP + 1 || w.y >= HALF_MAP - 1) {
      if (w.carriedChicken) {
        const c = w.carriedChicken;
        killChicken(c);
        c.carrier = null;
        w.carriedChicken = null;
      }
      w.alive = false;
      checkWaveDefended();
    }
  }

  // Drop a fresh brown hat onto a specific keeper's stack (respecting the cap).
  // Player 1's count lives in the `playerHats`/`hatColors` globals; player 2
  // carries its own `hats`/`hatColors` on the keeper object.
  function awardHatTo(keeper, fromWx, fromWy) {
    if (keeper === player2) {
      if ((player2.hats || 0) < MAX_HATS) {
        player2.hats = (player2.hats || 0) + 1;
        if (!Array.isArray(player2.hatColors)) player2.hatColors = [];
        player2.hatColors.push('#5a3825');
        toast('Buddy grabbed a hat! Now ' + player2.hats, 1.6);
        toastGuest('You grabbed a hat! Now ' + player2.hats, 1.6);
      }
    } else {
      if (playerHats + pendingHatLandings.length < MAX_HATS) {
        const color = '#5a3825';
        if (fromWx !== undefined) {
          // Defer the increment until the hat arc animation lands.
          spawnFlyHat(fromWx, fromWy, color);
          pendingHatLandings.push({ delayT: 0.55, color });
          toast('A hatted wolf dropped a hat! Now ' + (playerHats + pendingHatLandings.length), 1.6);
        } else {
          playerHats++;
          hatColors.push(color);
          toast('A hatted wolf dropped a hat! Now ' + playerHats, 1.6);
        }
      }
    }
  }

  // Bookkeeping when a wolf/fox is killed: record the first sword-wolf kill
  // (it unlocks the Wolf's Blade upgrade), and drop any chicken it was
  // carrying as a corpse rather than letting it leave the map.
  function onWolfKilled(w, killer) {
    killer = killer || player;
    if (w.sword) swordWolfSlain = true;
    // Killing a snatcher mid-flight saves the chicken: drop it alive where
    // the wolf/fox fell. No corpse — the player rescued it.
    if (w.carriedChicken) {
      const c = w.carriedChicken;
      if (c.alive) {
        // Eject the rescued chicken slightly further from the wolf so
        // remaining pellets in the same shotgun blast don't immediately
        // gun it down at the carrier's position.
        c.x = w.x + rand(-0.7, 0.7);
        c.y = w.y + rand(-0.7, 0.7);
        c.carrier = null;
        // Brief invulnerability window — pellets and stray hits pass
        // through this chicken for a few frames so the rescue actually
        // sticks even when the killing shot pierced or scattered.
        c.savedT = 0.45;
      }
      w.carriedChicken = null;
    }
    w.carrying = false;
    // Killing a hatted wolf drops a hat — and in co-op it goes ONLY to whoever
    // landed the kill, not always player 1.
    if (w.hatted) {
      w.hatted = false;
      awardHatTo(killer, w.x, w.y);
    }
    // A hunter wolf drops ALL the hats it spawned wearing onto the killer.
    if (w.hunterWolf) {
      const n = w.spawnHats || 1;
      for (let i = 0; i < n; i++) awardHatTo(killer, w.x, w.y);
      toast('Hunter wolf down — +' + n + ' hat' + (n > 1 ? 's' : '') + '!', 1.8);
      // It goes out with a bang — a blast that scorches nearby wolves and can
      // singe a too-close keeper.
      spawnBlast(w.x, w.y);
      playExplosion();
      spawnSmoke(w.x, w.y, 8);
      shake = Math.max(shake, 0.32);
      const r2 = HUNTER_WOLF_EXPLODE_R * HUNTER_WOLF_EXPLODE_R;
      for (const o of wolves) {
        if (!o.alive || o === w || o.boss) continue;
        if (dist2(o.x, o.y, w.x, w.y) < r2) {
          const ddx = o.x - w.x, ddy = o.y - w.y, mm = Math.hypot(ddx, ddy) || 1;
          hurtWolf(o, HUNTER_WOLF_EXPLODE_DMG, (ddx / mm) * 0.35, (ddy / mm) * 0.35);
        }
      }
      explosionHitKeepers(w.x, w.y, HUNTER_WOLF_EXPLODE_R);
    }
    // Explosive wolves now also blow on death (not only on wall impact).
    if (w.bomb) {
      spawnBlast(w.x, w.y);
      playExplosion();
      spawnSmoke(w.x, w.y, 8);
      shake = Math.max(shake, 0.32);
      explosionHitKeepers(w.x, w.y, BOMB_BLAST_KEEPER_R);
    }
    // Missile wolf — its back rockets cook off when it dies.
    if (w.missileWolf) {
      spawnBlast(w.x, w.y);
      playExplosion();
      spawnSmoke(w.x, w.y, 8);
      shake = Math.max(shake, 0.35);
    }
    // Killing a brood wolf bursts it open: a harmless explosion flash plus a
    // random 2-5 pups scattered around where it fell. No toast — the burst is
    // self-explanatory.
    if (w.breeder) {
      w.breeder = false; // belt-and-braces — don't double-fire if reprocessed
      spawnBlast(w.x, w.y);
      playExplosion();
      shake = Math.max(shake, 0.22);
      const pupCount = BREEDER_PUP_MIN + Math.floor(Math.random() * (BREEDER_PUP_MAX - BREEDER_PUP_MIN + 1));
      for (let i = 0; i < pupCount; i++) {
        const a = (i / pupCount) * Math.PI * 2 + rand(-0.2, 0.2);
        spawnPupWolf(w.x + Math.cos(a) * 0.5, w.y + Math.sin(a) * 0.5);
      }
    }
    // Combo counter — tally fast kills; at 5+ spawn/refresh the floating x-label.
    if (!w.boss) {
      comboKills++;
      comboT = 2.0; // reset 2-second window
      if (comboKills >= 5) {
        if (comboFloat) {
          // Refresh existing label at the new kill position.
          comboFloat.wx = w.x; comboFloat.wy = w.y;
          comboFloat.alpha = 1.5; // reset fade timer
          comboFloat.screenYOff = Math.min(comboFloat.screenYOff, -12); // keep float upward
          comboFloat.text = 'x' + comboKills;
        } else {
          comboFloat = { wx: w.x, wy: w.y, screenYOff: 0, alpha: 1.5, text: 'x' + comboKills };
        }
      }
    }
    // Thing wolf — the body bursts and the head skitters off on spider legs.
    // No corpse is left (the corpse push skips w.thing, so the flag must stay
    // set here); instead a fleeing crawler spawns where it fell.
    if (w.thing) {
      spawnBlast(w.x, w.y);
      spawnSmoke(w.x, w.y, 5);
      shake = Math.max(shake, 0.2);
      spawnThingCrawler(w.x, w.y);
    }
  }

  // Is this a cryptid the Cryptid Radar should pick up?
  function isCryptid(w) { return !!(w.fox || w.sword || w.hatted || w.thing || w.hunterWolf); }
  // Fire the radar: alarm + start the antennas emitting for RADAR_EMIT_TIME.
  // Used both by the wolf scan and the player-2 cameo. Host / single-player
  // only so the guest's snapshot churn can't re-trigger it every frame.
  function triggerRadar() {
    if (!(upgradeLevels.cryptidRadar > 0)) return;
    if (multiplayer && !isHost) return;
    radarEmitT = RADAR_EMIT_TIME;
    playRadarPing();
  }
  // Cryptid Radar — pings a cryptid (once per creature) when it enters the
  // antennas' detection range, which grows with the upgrade and becomes endless
  // at MAX. The antennas live on the coops, so range is measured from any coop.
  function radarScan(dt) {
    if (radarEmitT > 0) radarEmitT -= dt;
    const lvl = upgradeLevels.cryptidRadar || 0;
    if (lvl <= 0) return;
    if (multiplayer && !isHost) return;
    const range = CRYPTID_RADAR_RANGE[Math.min(5, lvl)];
    const endless = !isFinite(range);
    const r2 = range * range;
    for (const w of wolves) {
      if (!w.alive || w.radarPinged || !isCryptid(w)) continue;
      let inRange = endless;
      if (!inRange) {
        for (const c of coops) { if (dist2(w.x, w.y, c.x, c.y) <= r2) { inRange = true; break; } }
      }
      if (inRange) { w.radarPinged = true; triggerRadar(); }
    }
  }

  // Ghost keeper sabotage — a wolf the ghost drifts through has a small
  // per-second chance to flip turncoat (defective + attacks the pack). Skips
  // wolves that are already defective/special so it never double-converts.
  function ghostSabotage(g, dt) {
    if (!g) return;
    for (const w of wolves) {
      if (!w.alive || w.defective || w.fox || w.pup || w.assassin) continue;
      if (dist2(w.x, w.y, g.x, g.y) > 0.36) continue; // must be drifting through it
      if (Math.random() < GHOST_SABOTAGE_CHANCE * dt) {
        w.defective = true;
        w.turncoat = true;
        w.target = null;
        spawnSmoke(w.x, w.y, 0.7);
      }
    }
  }

  // Apply damage to a wolf/fox outside the pellet path (used by the melee
  // counter) — mirrors the pellet kill bookkeeping. `attacker` (default
  // player1) gets credit for the kill on the per-player scoreboard.
  // Post-wave-50, every wolf soaks damage like the boss: a rolling per-second
  // cap that TIGHTENS as the waves climb (the "increasing soak" stat). Returns
  // the damage actually allowed through this frame; updates the rolling window
  // (the window itself is ticked in updateWolf).
  function wolfDpsCap() { return Math.max(8, 40 - (wave - 50) * 1); }
  function cappedWolfDamage(w, dmg) {
    if (wave <= 50 || w.boss) return dmg;
    const cap = wolfDpsCap();
    w.dmgInWindow = w.dmgInWindow || 0;
    if (w.dmgInWindow >= cap) return 0;
    const allowed = Math.min(dmg, cap - w.dmgInWindow);
    w.dmgInWindow += allowed;
    return allowed;
  }

  function hurtWolf(w, dmg, kx, ky, attacker) {
    if (!w.alive) return;
    // The boss takes capped, status-immune damage and never dies here
    // (bossTick decides when a side is beaten); no knockback either.
    if (w.boss) { bossTakeDamage(w, dmg); return; }
    // Debug DPS dummy — soaks damage, tallies it, never dies.
    if (w.dpsDummy) { w.dpsAccum = (w.dpsAccum || 0) + dmg; w.hurtT = 0.08; return; }
    if (w.invulnT > 0 || w.parachuting) return; // crawler grace / airborne parachuter
    attacker = attacker || player;
    // Ghost wolf: first hit triggers invisible flee — it never "dies" normally.
    if (w.ghostWolf) {
      if (w.ghostFleeing) return; // already vanishing
      if ((w.hitDebounceT || 0) > 0) return;
      w.ghostFleeing = true;
      w.ghostAlpha = 1.0;
      spawnSmoke(w.x, w.y, 2); // just a tiny puff — no sound
      return;
    }
    // Hunter wolf: any hit knocks off exactly ONE hat (never one-shot), with
    // i-frames so a single shotgun blast can't strip several at once.
    if (w.hunterWolf) {
      if ((w.hitDebounceT || 0) > 0) { knockbackWolf(w, kx || 0, ky || 0); return; }
      w.hitDebounceT = HUNTER_WOLF_HIT_IFRAME;
      dmg = 1;
    } else {
      dmg = cappedWolfDamage(w, dmg);
      if (dmg <= 0) { w.hurtT = Math.max(w.hurtT || 0, 0.05); knockbackWolf(w, kx || 0, ky || 0); return; }
    }
    w.hp -= dmg;
    w.hurtT = 0.12;
    if (w.hp <= 0) {
      w.alive = false;
      kills++;
      attacker.kills = (attacker.kills || 0) + 1;
      onWolfKilled(w, attacker);
      // Late-game wolves sometimes fly apart instead of leaving a body.
      if (!w.thing && !tryWolfDisassemble(w)) corpses.push({ x: w.x, y: w.y, kind: w.fox ? 'fox' : 'wolf', t: 5 });
      if (w.fox) {
        const bounty = 50 + wave;
        addSharedMoney(bounty);
        toast('Fox bagged! +$' + bounty, 1.8);
      }
      checkWaveDefended();
    } else {
      knockbackWolf(w, kx || 0, ky || 0);
      // Hunter wolf just lost a hat but lives: it goes briefly invincible and
      // scrambles to a safe spot before wading back into the fight.
      if (w.hunterWolf) hunterWolfRetreat(w);
    }
  }

  // Knockback step that respects fence collision. Without this a wolf shot
  // toward a fence would be teleported clean through to the other side.
  // Mirrors the axis-separated geometry of moveWithFences.
  function knockbackWolf(w, kx, ky) {
    if (!kx && !ky) return;
    const stepX = w.x + kx, stepY = w.y + ky;
    const wInside = fenceBlocks(w.x, w.y);
    const xClear = !fenceBlocks(stepX, w.y);
    const yClear = !fenceBlocks(w.x, stepY);
    const diagClear = !fenceBlocks(stepX, stepY);
    if (wInside || (xClear && (!yClear || diagClear))) w.x = stepX;
    if (wInside || (yClear && (!xClear || diagClear))) w.y = stepY;
    w.x = clamp(w.x, -HALF_MAP + 1, HALF_MAP - 1);
    w.y = clamp(w.y, -HALF_MAP + 1, HALF_MAP - 1);
  }

  // Player melee counter-attack against the wolf that just landed a hit.
  function meleeCounter(attacker) {
    shake = Math.max(shake, 0.3);
    const dx = attacker.x - player.x, dy = attacker.y - player.y;
    const m = Math.hypot(dx, dy) || 1;
    const maxed = upgradeLevels.counter >= 5;
    // Kick off the white swing arc — a full ring when the AoE is unlocked.
    player.meleeT = MELEE_ANIM_DUR;
    player.meleeDir = Math.atan2(dy, dx);
    player.meleeFull = maxed;
    hurtWolf(attacker, COUNTER_DMG, (dx / m) * 0.35, (dy / m) * 0.35);
    if (maxed) {
      // Maxed Melee Strike: splash a little damage to wolves crowding you.
      const r2 = COUNTER_AOE_R * COUNTER_AOE_R;
      for (const w of wolves) {
        if (!w.alive || w === attacker) continue;
        if (dist2(w.x, w.y, player.x, player.y) < r2) {
          const wdx = w.x - player.x, wdy = w.y - player.y;
          const wm = Math.hypot(wdx, wdy) || 1;
          hurtWolf(w, COUNTER_AOE_DMG, (wdx / wm) * 0.2, (wdy / wm) * 0.2);
        }
      }
    } else {
      toast('Counter!', 0.7);
    }
  }

  // Karma resurrection — at ±KARMA_MAX the player cheats death once. A
  // melee-max-style explosion tears through the surrounding wolves and the
  // player respawns with 7 hats: white for good karma, black for bad. The
  // karma is spent by the rescue, resetting to 0 (and so does the shirt tint).
  // Knock a keeper down — in multiplayer they slip into ghost form and their
  // wallet is willed to the survivor; the run only ends once BOTH are down.
  // In single-player there's no one to inherit, so it's straight gameOver.
  // `byWhat` records WHAT killed them ('wolf', 'friendly fire', ...) for the
  // end-of-run scoreboard. `cause` stays as the host/guest role identifier.
  function killKeeper(who, cause, byWhat) {
    byWhat = byWhat || 'wolf';
    who.deathCause = byWhat;
    // Ignore a hit that lands on a keeper already down — mid-fall or a ghost.
    if (who.ghost || who.dying) { checkBothDown(); return; }
    // Plant a headstone on the spot. It's cleared by the next startWave, so
    // it marks this round only — and the game-over screen hides it (drawGraves
    // skips while gameOver/endScreen is up), which is why a solo death never
    // shows one but a co-op death or a RESPAWN revive does.
    graves.push({ x: who.x, y: who.y, lean: rand(-0.16, 0.16) });
    if (!multiplayer || !player2.active) {
      // Single-player: freeze into game-over, but first let the keeper visibly
      // topple. `dying` keeps drawPlayer rendering the body flat on the ground
      // (driven by who.downT) for the 1s grace before the death screen.
      gameOver = true;
      gameOverCause = cause || 'host';
      gameOverMsg = (cause === 'host')
        ? 'A wolf knocked off your last hat! ' + (isMobileMode ? 'Use the buttons below.' : 'Press Q for menu or F5 to restart.')
        : 'A wolf knocked off your last hat!';
      gameOverPanelDelayT = 1.0;
      player.dying = true;
      player.downT = 0;
      playKeeperDeath();
      return;
    }
    // Multiplayer: the keeper drops to the ground first (same fall + sound as
    // single-player), then turns into a wandering ghost after the beat. The
    // ghost conversion (wallet bequeath, toast, both-down check) is deferred
    // to becomeGhost() once who.deathDelayT runs out in tickKeeperDeaths().
    who.dying = true;
    who.downT = 0;
    who.deathDelayT = 1.0;
    if (who === player) { playerHats = 0; hatColors.length = 0; }
    else if (who === player2) { player2.hats = 0; }
    playKeeperDeath();
  }
  // A downed keeper finishing its fall: flip it into the spectral wandering
  // state and settle the inheritance. Split out of killKeeper so the fall can
  // play first (see tickKeeperDeaths).
  function becomeGhost(who) {
    who.dying = false;
    ghostWolfChance = Math.min(1, ghostWolfChance + 0.02); // each death raises ghost wolf chance by 2%
    if (who === player) {
      player.ghost = true;
      player.deaths = (player.deaths || 0) + 1;
      cancelReloadMinigame(); // drop any in-progress nerd/jock reload
      // Dying mid-reload must drop the whole reload state too, or the ghost
      // is stuck "reloading" (bar sweeping, HUD frozen) until revived.
      reloadingT = 0;
      player.reloadingT = 0;
      player.skillCheckActive = false;
      player.skillCheckNeedsRelease = false;
      player.jamT = 0;
      playerHats = 0;
      hatColors.length = 0;
      if (gameOpts.separateMoney) { money2 += money; money = 0; }
      toast('You fell — wandering as a ghost! Money passed to buddy.', 3.2);
    } else if (who === player2) {
      player2.ghost = true;
      player2.deaths = (player2.deaths || 0) + 1;
      // Same mid-reload cleanup as P1 — these flags are snapshot-synced, so
      // clearing them here also clears the stuck reload bar on the guest.
      player2.reloadingT = 0;
      player2.skillCheckActive = false;
      player2.skillCheckNeedsRelease = false;
      player2.jamT = 0;
      player2.hats = 0;
      if (gameOpts.separateMoney) { money += money2; money2 = 0; }
      toast('Buddy fell — wandering as a ghost! Their money is now yours.', 3.2);
    }
    checkBothDown();
  }
  // Advance each keeper's death-fall. Runs every frame (before the gameOver
  // freeze) so the body keeps toppling. The host owns the timeout that turns a
  // dying multiplayer keeper into a ghost; the guest just mirrors the flags.
  function tickKeeperDeaths(dt) {
    for (const k of [player, player2]) {
      if (!k || !k.dying) continue;
      k.downT = (k.downT || 0) + dt;
      if (multiplayer && (isHost) && player2.active) {
        k.deathDelayT = (k.deathDelayT || 0) - dt;
        if (k.deathDelayT <= 0) becomeGhost(k);
      }
    }
  }
  function checkBothDown() {
    if (!multiplayer || !player2.active) return;
    if (player.ghost && player2.ghost) {
      gameOver = true;
      gameOverCause = 'both';
      gameOverMsg = 'Both keepers fell! ' + (isMobileMode ? 'Use the buttons below.' : 'Press Q for menu or F5 to restart.');
    }
  }
  // Used by the resurrect upgrade to bring a ghost back with a fresh stack.
  function reviveKeeper(who) {
    if (who === player && player.ghost) {
      player.ghost = false;
      playerHats = 3;
      hatColors.length = 0;
      for (let i = 0; i < 3; i++) hatColors.push('#5a3825');
      player.hurtT = 0;
      toast('You rose again! +3 hats', 2.6);
    } else if (who === player2 && player2.ghost) {
      player2.ghost = false;
      player2.hats = 3;
      player2.hurtT = 0;
      toast('Buddy rose again! +3 hats', 2.6);
    }
  }
  // Whose wallet pays for cross-keeper purchases (e.g. resurrect) — the
  // surviving keeper, since the ghost's money has already been transferred.
  function survivorWallet() {
    if (!gameOpts.separateMoney) return { read: () => money, spend: n => { money -= n; }, balance: () => money };
    if (player.ghost) return { read: () => money2, spend: n => { money2 -= n; }, balance: () => money2 };
    return { read: () => money, spend: n => { money -= n; }, balance: () => money };
  }

  function tryKarmaResurrect() {
    if (karma < KARMA_MAX && karma > -KARMA_MAX) return false;
    const good = karma >= KARMA_MAX;
    playerHats = 7;
    hatColors.length = 0;
    for (let i = 0; i < 7; i++) hatColors.push(good ? '#f4f4f4' : '#161616');
    shake = Math.max(shake, 0.9);
    player.hurtT = 0;
    // Map-wide explosion: a ring of blasts across the world for the visual.
    // Good karma: wipes every wolf/fox/bomb wolf but spares chickens.
    // Bad karma: kills every living thing, chickens included.
    const STEP = 4; // tile spacing between blast rings — covers the map
    for (let bx = -HALF_MAP; bx <= HALF_MAP; bx += STEP) {
      for (let by = -HALF_MAP; by <= HALF_MAP; by += STEP) {
        spawnBlast(bx, by);
      }
    }
    // A single boom for the map-wide sweep instead of one per ring.
    playExplosion();
    // Vapourise every wolf on the map regardless of distance.
    for (const w of wolves) {
      if (!w.alive) continue;
      const wdx = w.x - player.x, wdy = w.y - player.y;
      const wm = Math.hypot(wdx, wdy) || 1;
      hurtWolf(w, 9999, (wdx / wm) * 0.6, (wdy / wm) * 0.6);
    }
    // Karma's wrath even cracks FANGUS — instakill the boss's current phase
    // (it soaks capped damage normally, so force its HP to zero directly).
    if (boss && boss.alive && bossPhase === 'fight') boss.hp = 0;
    // Bad karma also slaughters the flock — the rescue is paid in chickens.
    if (!good) {
      for (const c of chickens) {
        if (!c.alive) continue;
        killChicken(c);
        corpses.push({ x: c.x, y: c.y, kind: 'chicken', t: 4 });
        explodeChickenMaybe(c);
      }
      playChickenDeath();
    }
    karma = 0; // the karma is consumed by the rescue
    player.karma = 0;
    toast(good
      ? 'Good karma saves you — every wolf vapourised, 7 hats!'
      : 'Bad karma saves you — the flock pays the price, 7 hats!', 3.2);
    return true;
  }

  function activateResurrect() {
    if (resurrectCount >= 9 || multiplayer) return;
    if (wave - resurrectLastWave < 5 && resurrectLastWave >= 0) return;
    resurrectCount++;
    resurrectLastWave = wave;

    // Option 1: kill half the chickens
    const alive = chickens.filter(c => c.alive);
    alive.sort(() => Math.random() - 0.5);
    const half = Math.ceil(alive.length / 2);
    for (let i = 0; i < half; i++) {
      killChicken(alive[i]);
      corpses.push({ x: alive[i].x, y: alive[i].y, kind: 'chicken', t: 4 });
    }

    // Option 2: lose all money, stripped to 1 hat
    money = 0;
    playerHats = 1;
    hatColors.length = 0;
    hatColors.push('#5a3825');

    // Reset karma (the deal corrupts whatever good standing you had)
    karma = 0;
    player.karma = 0;

    // Revive player (clear game-over state, long iframes so wolves back off)
    gameOver = false;
    gameOverPanelDelayT = 0;
    player.dying = false;
    player.downT = 0;
    player.ghost = false;
    player.hurtT = 2.5;
    player.wolfHitT = 2.5;
    // Death may have landed mid-reload — drop the leftover reload state so
    // the revived keeper doesn't come back with a stuck skill-check bar.
    cancelReloadMinigame();
    reloadingT = 0;
    player.reloadingT = 0;
    player.skillCheckActive = false;
    player.skillCheckNeedsRelease = false;
    player.jamT = 0;
  }

  // The player's shirt is base blue, but karma slowly tints it: good karma
  // lightens it toward white, bad karma darkens it toward navy. Each keeper
  // carries their own karma so buddys read each other's mood at a glance.
  function shirtColorOf(who) {
    const k = (who && typeof who.karma === 'number') ? who.karma : karma;
    const r0 = 58, g0 = 110, b0 = 165; // #3a6ea5
    const f = Math.max(-1, Math.min(1, k / KARMA_MAX));
    let r, g, b;
    if (f >= 0) {
      r = r0 + (255 - r0) * f * 0.65;
      g = g0 + (255 - g0) * f * 0.65;
      b = b0 + (255 - b0) * f * 0.65;
    } else {
      const k2 = 1 + f * 0.7;
      r = r0 * k2; g = g0 * k2; b = b0 * k2;
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }
  function playerShirtColor() {
    const r0 = 58, g0 = 110, b0 = 165; // #3a6ea5
    const f = Math.max(-1, Math.min(1, karma / KARMA_MAX));
    let r, g, b;
    if (f >= 0) {
      r = r0 + (255 - r0) * f * 0.65;
      g = g0 + (255 - g0) * f * 0.65;
      b = b0 + (255 - b0) * f * 0.65;
    } else {
      const k = 1 + f * 0.7; // f < 0 → k < 1, darkening the shirt
      r = r0 * k; g = g0 * k; b = b0 * k;
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  const START_HATS = 3;   // hats the player starts with — the stack has no upper cap
  let playerHats = START_HATS;
  let hatPrice = 5;       // Buy Hat cost — starts at $5, grows $5 per purchase
  let hatsBought = 0;     // lifetime Buy Hat purchases — green hats can appear after 5
  let revivePrice = 10;   // Resurrect Buddy cost — starts at $10, grows $10 per use
  let firstReviveFree = true; // the first Resurrect Buddy of a run is on the house
  let hatPackPrice = 100; // Buy Hat Pack (wave 40+) — 3 hats at once, ratchets up
  // Weapon Oil is single-tier. While active it widens the reload skill-check
  // accept band by `WEAPON_OIL_PER_CHARGE` for `weaponOilWaves` waves.
  let weaponOilCharges = 0;
  let weaponOilWaves   = 0;
  // Lifetime purchase counts. The oils leave no trace once they wear off, so
  // without these the upgrade tree couldn't tell "never bought" from "bought
  // and expired" — it needs that to know whether to list the row at all.
  let weaponOilBought   = 0;
  let advancedOilBought = 0;
  let advancedOilWaves = 0; // Advanced Oil (wave 40+) — bigger band + crit, one round only
  let bribePrice = 300;     // Bribe Wolves (wave 51+) — ratchets up each buy
  let bribeNextWaveMul = 1; // wolf-count multiplier applied to the very next wave
  let bribeFollowWaveMul = 1; // ...then this one rolls into the wave after
  const hatColors = Array(START_HATS).fill('#5a3825'); // colour of each stacked hat (bottom → top)
  let immortal = false;  // debug toggle — when on, the last hat can never be knocked off
  let debugAutoReloadCrit = false; // debug toggle — gun is always loaded and every shot crits
  let debugFastMode = false;       // debug toggle — upgrades apply 5x, money 5x, advances 5 waves per clear
  let debugUpgradeTarget = 'p1';  // debug toggle — which player receives upgrade buttons: p1, p2, both
  let shake = 0;

  // Stone fences stop bullets (wood fences let them fly through).
  function stoneFenceBlocks(x, y) {
    for (const f of fences) {
      if (f.kind === 'stone' && Math.abs(x - f.x) < 0.5 && Math.abs(y - f.y) < 0.5) return true;
    }
    return false;
  }

  // Ricochet: after striking an enemy or chicken, the pellet caroms off in a
  // fresh random direction and flies on for a full projectile lifetime (set by
  // the Longer Barrel upgrade). If it hits something it ricochets again; if it
  // reaches nothing before its life runs out, it simply disappears.
  function updatePellet(p, dt) {
    // Ranged-wolf homing bullet: steer slowly toward the keeper it was fired
    // at, re-acquiring if that keeper goes ghost / leaves. Capped turn rate so
    // the bullet curves and can be out-manoeuvred.
    if (p.wolfHoming) {
      let tgt = p.homingTarget;
      if (!tgt || tgt.ghost || (tgt === player2 && !player2.active)) {
        tgt = nearestKeeper(p.x, p.y);
        p.homingTarget = tgt;
      }
      if (tgt) {
        const tAng = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        const curAng = Math.atan2(p.vy, p.vx);
        let diff = tAng - curAng;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = HOMER_BULLET_TURN * dt;
        const newAng = curAng + Math.max(-maxTurn, Math.min(maxTurn, diff));
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(newAng) * sp;
        p.vy = Math.sin(newAng) * sp;
      }
    }
    // Homing Bullets: each pellet gets one lock-on roll (next available wolf
    // within HOMING_LOCK_RANGE). Once locked, steer the velocity vector
    // toward the target with a capped turn rate so they curve smoothly. If
    // the target dies / drops out of range mid-flight, give it one more try.
    if (p.homing) {
      const hl = Math.min(p.homingLvl || 1, 5);
      // No lock roll — keep hunting the nearest wolf in seek range every frame
      // until one is found, then re-acquire if it dies / drops out of range.
      if (!p.homingTarget || !p.homingTarget.alive) {
        p.homingTarget = null;
        const seek = HOMING_SEEK_BY_LVL[hl];
        let best = null, bd = seek * seek;
        for (const w of wolves) {
          if (!w.alive || w.fox || w.parachuting) continue; // foxes/airborne aren't fair pack targets
          const d = dist2(w.x, w.y, p.x, p.y);
          if (d < bd) { bd = d; best = w; }
        }
        p.homingTarget = best;
      }
      if (p.homingTarget && p.homingTarget.alive) {
        const tx = p.homingTarget.x - p.x;
        const ty = p.homingTarget.y - p.y;
        const tAng = Math.atan2(ty, tx);
        const curAng = Math.atan2(p.vy, p.vx);
        let diff = tAng - curAng;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = HOMING_TURN_BY_LVL[hl] * dt;
        const newAng = curAng + Math.max(-maxTurn, Math.min(maxTurn, diff));
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(newAng) * sp;
        p.vy = Math.sin(newAng) * sp;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    // Rocket rounds smoke as they fly and can cook off mid-air before reaching
    // anything — setting rocketBoom + didHit routes them through the usual
    // detonation at the despawn site.
    if (p.rocket) {
      p.smokeT = (p.smokeT || 0) - dt;
      if (p.smokeT <= 0) { spawnSmoke(p.x, p.y, 0.5); p.smokeT = ROCKET_SMOKE_INTERVAL; }
      // Mid-air cook-off can only happen AFTER a brief minimum flight, so a
      // rocket that hits nothing never detonates right in the keeper's face.
      p.age = (p.age || 0) + dt;
      if (p.age >= ROCKET_MIN_FLIGHT && Math.random() < ROCKET_MIDAIR_BOOM * dt) { p.rocketBoom = true; p.didHit = true; return false; }
    }
    if (p.life <= 0) {
      // Boss homing bullets have a chance to cook off in a red blast at the end
      // of their flight, flattening any buildings they died near.
      if (p.bossBullet && Math.random() < BOSS_BULLET_BOOM_CHANCE) bossBulletExplode(p.x, p.y);
      return false;
    }
    // Size Matters MAX: instead of dying at the map edge, the shot ricochets
    // off an invisible border wall just past the map and curves back into play.
    if (p.bounce) {
      const B = HALF_MAP + SIZE_MATTERS_BOUNCE_PAD;
      if (p.x < -B) { p.x = -B; p.vx = Math.abs(p.vx); }
      else if (p.x > B) { p.x = B; p.vx = -Math.abs(p.vx); }
      if (p.y < -B) { p.y = -B; p.vy = Math.abs(p.vy); }
      else if (p.y > B) { p.y = B; p.vy = -Math.abs(p.vy); }
    } else if (!inBounds(p.x, p.y)) return false;
    if (stoneFenceBlocks(p.x, p.y)) {
      // Size Matters MAX: ricochet off stone walls too (not just the border).
      if (p.bounce) {
        const px = p.x - p.vx * dt, py = p.y - p.vy * dt;
        const blockX = stoneFenceBlocks(p.x, py);
        const blockY = stoneFenceBlocks(px, p.y);
        if (blockX) p.vx = -p.vx;
        if (blockY) p.vy = -p.vy;
        if (!blockX && !blockY) { p.vx = -p.vx; p.vy = -p.vy; }
        p.x = px; p.y = py; // step back out of the wall
      } else return false; // pellet hits a stone fence
    }
    // Buddy cameo: a keeper's shot that touches it spooks it into a ghost. The
    // pellet passes through (it's not a real enemy).
    if (p2Cameo && !p2Cameo.ghost && (p.shooter === 1 || p.shooter === 2) &&
        dist2(p.x, p.y, p2Cameo.x, p2Cameo.y) < 0.3) {
      spookCameo();
    }
    // Shoot the FANGUS siphon orb to break the tractor beam: the chicken drops
    // free ALIVE (saved from being devoured), with a brief grace so it can't be
    // re-snagged instantly. The pellet is spent breaking the orb.
    if ((p.shooter === 1 || p.shooter === 2) && chickenSuckers.length) {
      for (let si = chickenSuckers.length - 1; si >= 0; si--) {
        const s = chickenSuckers[si];
        if (dist2(p.x, p.y, s.x, s.y) < 0.5) {
          if (s.target) { s.target.suckedBy = null; s.target.savedT = 1.5; }
          spawnSmoke(s.x, s.y, 4);
          playChickenPop();
          toast('You shot the orb free — chicken saved!', 1.2);
          chickenSuckers.splice(si, 1);
          return false;
        }
      }
    }
    // Hit wolves — a pellet expires once its pierce budget runs out (1 for
    // normal pellets, 10 for the Tighter Pattern MAX slug). The hit set stops
    // the slug from striking the same wolf on consecutive frames.
    for (const w of wolves) {
      if (!w.alive) continue;
      // A freshly-spawned crawler is briefly untouchable so it doesn't die to
      // the same blast that killed its parent thing wolf; a parachuting wolf is
      // out of reach until it lands.
      if (w.invulnT > 0 || w.parachuting) continue;
      // A wolf's own bullets don't damage other wolves — only keepers/chickens.
      if (p.shooter === 'wolf') continue;
      if (p.hit && p.hit.has(w)) continue;
      // Slugs (Tighter Pattern MAX, rooftopper rounds) widen the hit zone
      // since the projectile is visually much bigger than a buckshot pellet.
      const slugBoost = (p.r || 0) > 3 ? 0.30 : 0;
      const bossBoost = w.boss ? BOSS_HIT_BONUS : 0; // big, easy-to-hit boss hitbox
      const hitRadius = (0.35 + slugBoost + bossBoost) * (w.size || 1);
      if (dist2(p.x, p.y, w.x, w.y) < hitRadius) {
        // The boss soaks pellets (capped DPS, immune to cold/hot) and never
        // dies on the normal kill path — bossTick decides when a side is beaten.
        if (w.boss) {
          bossTakeDamage(w, p.dmg);
          p.didHit = true;
          if (p.hit) p.hit.add(w);
          if (--p.pierce <= 0) return false;
          continue;
        }
        // Debug DPS dummy — tally damage, never dies, doesn't stop the pellet.
        if (w.dpsDummy) {
          w.dpsAccum = (w.dpsAccum || 0) + p.dmg; w.hurtT = 0.08;
          p.didHit = true;
          if (p.hit) p.hit.add(w);
          if (--p.pierce <= 0) return false;
          continue;
        }
        // Ghost wolf: any hit triggers the invisible flee — it never truly dies.
        if (w.ghostWolf) {
          if (!w.ghostFleeing) {
            w.ghostFleeing = true;
            w.ghostAlpha = 1.0;
            spawnSmoke(w.x, w.y, 2);
          }
          p.didHit = true;
          if (p.hit) p.hit.add(w);
          if (--p.pierce <= 0) return false;
          continue;
        }
        // Hunter wolf: one hat per hit (debounced); everything else takes the
        // normal damage, capped per-second post-wave-50.
        if (w.hunterWolf) {
          if ((w.hitDebounceT || 0) <= 0) { w.hitDebounceT = HUNTER_WOLF_HIT_IFRAME; w.hp -= 1; }
        } else {
          w.hp -= cappedWolfDamage(w, p.dmg); // post-50 per-second soak cap
        }
        w.hurtT = 0.12;
        // Cold Shot / Hot Shot: chill (slow + blue) or ignite (burn-over-time).
        if (p.cold) { const fresh = !(w.coldT > 0); w.coldT = p.coldDur || 3; if (fresh) playFreeze(); }
        if (p.hot)  { w.burnT = p.hotDur || 3; if (!(w.burnTickT > 0)) w.burnTickT = BURN_TICK; }
        if (w.hp <= 0) {
          w.alive = false;
          kills++;
          // Credit the killing shooter on the per-player scoreboard. Hunter
          // pellets aren't credited to a keeper — the camp doesn't earn cash
          // or pad the scoreboard for the player.
          const hunterKill = p.shooter === 'hunter';
          const shooter = p.shooter === 2 ? player2 : player;
          if (!hunterKill) shooter.kills = (shooter.kills || 0) + 1;
          onWolfKilled(w, shooter);
          // Late-game wolves sometimes fly apart instead of leaving a body.
      if (!w.thing && !tryWolfDisassemble(w)) corpses.push({ x: w.x, y: w.y, kind: w.fox ? 'fox' : 'wolf', t: 5 });
          if (w.fox && !hunterKill) {
            const bounty = 50 + wave;
            // Fox bounty goes to whoever fired the killing pellet.
            addMoney(shooter, bounty);
            toast('Fox bagged! +$' + bounty, 1.8);
          }
          checkWaveDefended();
        } else {
          // Knockback — a small nudge along the pellet's heading, routed
          // through the fence-aware step so a wolf shot against a wall is
          // stopped by it instead of being shoved clean through.
          const km = Math.hypot(p.vx, p.vy) || 1;
          knockbackWolf(w, (p.vx / km) * PELLET_KNOCKBACK, (p.vy / km) * PELLET_KNOCKBACK);
          // Hunter wolf lost a hat but survived: trigger retreat + full invulnerability.
          if (w.hunterWolf) hunterWolfRetreat(w);
        }
        if (p.hit) p.hit.add(w);
        p.didHit = true; // rocket pellets only detonate on a wolf/hunter hit
        if (--p.pierce <= 0) return false;
      }
    }
    // Hunter <-> pellet hits. A hunter is fair game for any pellet that didn't
    // come from a fellow hunter; the camp would otherwise mow itself down.
    // Homing ("bending") bullets pass harmlessly through hunters — they seek
    // wolves only and shouldn't gun down allies.
    // A keeper can only hurt the crew when friendly fire is switched on — the
    // same toggle that governs shooting your buddy now governs shooting your
    // allies. Wolf and fox rounds still clip them either way. (Hunters have no
    // hat stack, so this only ever costs them HP.)
    const keeperShot = p.shooter === 1 || p.shooter === 2;
    const canHitHunters = !keeperShot || gameOpts.friendlyFire;
    if (p.shooter !== 'hunter' && !p.homing && canHitHunters && hunters.length) {
      for (const h of hunters) {
        if (!h.alive) continue;
        if (p.hit && p.hit.has(h)) continue;
        if (dist2(p.x, p.y, h.x, h.y) < 0.18) {
          // Half of all incoming hits simply don't stick.
          if (Math.random() < HUNTER_DODGE_CHANCE) {
            if (p.hit) p.hit.add(h);
            continue;
          }
          h.hp -= p.dmg;
          h.hurtT = 0.18;
          // Only a keeper's pellet (shooter 1 or 2) counts as a player kill;
          // a wolf/fox bullet that clips a hunter never spooks the crew.
          if (h.hp <= 0) onHunterKilled(h, keeperShot);
          if (p.hit) p.hit.add(h);
          p.didHit = true; // rocket pellets only detonate on a wolf/hunter hit
          if (--p.pierce <= 0) return false;
        }
      }
    }
    // Hunter pellets can clip the player too — a stray shotgun spray knocks
    // a hat off (and uses the same blast debounce so one volley only costs one).
    if (p.shooter === 'hunter') {
      if (!player.ghost && dist2(p.x, p.y, player.x, player.y) < 0.18) {
        applyFriendlyFireHit(player);
        return false;
      }
      if (player2.active && !player2.ghost &&
          dist2(p.x, p.y, player2.x, player2.y) < 0.18) {
        applyFriendlyFireHit(player2);
        return false;
      }
    }
    // Ranged-wolf bullets — knock a hat off either keeper on contact, then
    // (further down) kill any chicken they touch without crediting the player.
    if (p.shooter === 'wolf') {
      if (!player.ghost && dist2(p.x, p.y, player.x, player.y) < 0.18) {
        applyWolfBulletHit(player);
        return false;
      }
      if (player2.active && !player2.ghost &&
          dist2(p.x, p.y, player2.x, player2.y) < 0.18) {
        applyWolfBulletHit(player2);
        return false;
      }
      for (const c of chickens) {
        if (!c.alive) continue;
        if (c.savedT > 0) continue; // grace window after a wolf-snatch rescue
        if (c.carrier && c.carrier.alive) continue; // riding a carrier — bullets pass through
        if (dist2(p.x, p.y, c.x, c.y) < 0.25) {
          killChicken(c);
          playChickenDeath();
          corpses.push({ x: c.x, y: c.y, kind: 'chicken', t: 4 });
          return false;
        }
      }
      return true;
    }
    // Friendly fire — pellets can knock hats off the OTHER keeper.
    if (gameOpts.friendlyFire && player2.active) {
      if (p.shooter !== 1 && !player.ghost &&
          dist2(p.x, p.y, player.x, player.y) < 0.18) {
        applyFriendlyFireHit(player, FRIENDLY_FIRE_HAT_CHANCE);
        return false;
      }
      if (p.shooter !== 2 && !player2.ghost &&
          dist2(p.x, p.y, player2.x, player2.y) < 0.18) {
        applyFriendlyFireHit(player2, FRIENDLY_FIRE_HAT_CHANCE);
        return false;
      }
    }
    // Hit chickens (friendly fire — sad). Hunter pellets just pass through
    // the flock so the camp doesn't massacre your chickens off-screen.
    if (p.shooter === 'hunter') return true;
    for (const c of chickens) {
      if (!c.alive) continue;
      // Just-rescued chickens are briefly invulnerable so the rest of the
      // burst that killed their captor doesn't also kill them.
      if (c.savedT > 0) continue;
      // A chicken being carried off rides on its captor — pellets pass
      // through it so shooting the fleeing fox/wolf rescues it instead of
      // gunning it down. It's freed (and made killable) only if the captor dies.
      if (c.carrier && c.carrier.alive) continue;
      if (p.hit && p.hit.has(c)) continue;
      if (dist2(p.x, p.y, c.x, c.y) < 0.25) {
        // Soft Bullets: chance the pellet passes harmlessly through the
        // chicken. The roll must be remembered for the pellet's lifetime —
        // without this, a regular pellet (no hit-set) re-rolls the same
        // chicken every frame it overlaps, so the effective spare rate ends
        // up far lower than the upgrade table advertises.
        if (p.spareChance && Math.random() < p.spareChance) {
          if (!p.hit) p.hit = new Set();
          p.hit.add(c);
          continue;
        }
        killChicken(c);
        // Per-shooter tally drives each keeper's karma drift independently;
        // the lifetime count feeds the end-of-run scoreboard.
        if (p.shooter === 2) {
          player2.chickensKilledThisWave++;
          player2.chickensShot++;
        } else {
          chickensKilledByPlayer++;
          player.chickensShot++;
        }
        corpses.push({ x: c.x, y: c.y, kind: 'chicken', t: 4, frost: !!p.cold, fried: !!p.hot });
        playChickenDeath();
        explodeChickenMaybe(c);
        toast('You killed a chicken! :(  fine at wave end', 1);
        if (p.hit) p.hit.add(c);
        if (--p.pierce <= 0) return false;
      }
    }
    return true;
  }

