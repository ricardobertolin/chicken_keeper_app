  // ---------- Player 2 shooting (host-authoritative) ----------
  // Host runs these whenever the guest forwards a shoot/reload input.
  // All state lives on the player2 object so the two keepers can fire
  // independently. Visual + audio happen on the host as usual; the snapshot
  // ships player2's weapon timers down so the guest sees its own gun.
  function fireBurstP2(dmgMul = 1, opts = {}) { fireBurstFor(player2, dmgMul, opts); }

  function fireBurstFor(who, dmgMul = 1, opts = {}) {
    who.jamFlashT = 0; // a real shot fired — clear any lingering dud-jam flash
    if ((lvlsFor(who).laser || 0) > 0) {
      fireLaserShot(who, dmgMul, opts);
      return;
    }
    if (who.robot) playRobotShot(); else playShotgun();
    who.runT = 0;
    const lvls = lvlsFor(who);
    const isSlug = lvls.spreadDown >= MAX_LEVEL;
    const loose = lvls.spreadUp > 0;
    const tighter = lvls.spreadDown > 0;
    const doubleHelix = loose && tighter; // 3 fanned tight clusters (parity with P1)
    let pelletDmg = isSlug ? (5 + lvls.spreadDown2 * 2) : doubleHelix ? 1.3 : loose ? 0.7 : tighter ? 1.3 : 1;
    const pelletR  = isSlug ? 3.5 : doubleHelix ? TIGHT_PELLET_R : loose ? 1.3 : (tighter ? TIGHT_PELLET_R : 2);
    const spareChance = lvls.softBullet > 0 ? tableAtFor(who, 'softBullet') : 0;
    if (lvls.hardBullet > 0) pelletDmg *= tableAtFor(who, 'hardBullet');
    if (who.spinDmg) { pelletDmg *= SPIN_DMG_MUL; who.spinDmg = false; }
    const isCrit2 = (who.critShots || 0) > 0;
    if (isCrit2) { pelletDmg *= RELOAD_SC_CRIT_DMG; who.critShots--; playCritShot(); }
    const critCol2 = isCrit2 ? critColor(lvls) : null; // crit tint keyed to current bullet
    if (lvls.doubleBarrel > 0) pelletDmg *= tableAtFor(who, 'doubleBarrel');
    pelletDmg *= dmgMul;
    pelletDmg *= lastStandDmgMul(who);
    if (lvls.machineGun > 0) pelletDmg *= MG_DMG_MUL; // softer machine-gun rounds
    const pelletColor = projectileColor(lvls, isSlug);
    const rocketLvl = lvls.rocket;
    const rocketBoom = !!opts.rocketBoom;
    const rocketChance = rocketBoom ? 1 : (rocketLvl > 0 ? tableAtFor(who, 'rocket') : 0);
    if (rocketLvl > 0) playRocketWhoosh(); // launcher rounds leave with a jet whoosh
    const homingLvl2 = lvls.homing;
    const aim = who.dir;
    const reach2 = barrelTipOffset(who);
    let speedBase = 18 * (homingLvl2 > 0 ? HOMING_SPEED_MUL : 1) * (rocketLvl > 0 ? ROCKET_SPEED_MUL : 1)
               * (weaponOilCharges > 0 ? WEAPON_OIL_SPEED_MUL : 1); // oil = faster rounds
    if (lvls.machineGun > 0) speedBase *= 0.5; // P2: machine-gun rounds fly slower
    if (tighter && !isSlug) speedBase *= TIGHT_SPEED_MUL; // Tighter Pattern rounds fly faster
    const ss = spreadStatsFor(who);
    const critRange2 = isCrit2 ? RELOAD_SC_CRIT_RANGE : 1;
    const life = (shotgunLifeFor(who) * (homingLvl2 > 0 ? HOMING_LIFE_MUL : 1) + sizeMattersLifeBonus(who)) * critRange2;
    const sizeBounce2 = (lvls.sizeMatters || 0) >= 5;
    const coldChance2 = Math.min(1, COLD_HOT_CHANCE[Math.min(5, lvls.coldShot || 0)] * statusPotencyMul());
    const hotChance2  = Math.min(1, COLD_HOT_CHANCE[Math.min(5, lvls.hotShot  || 0)] * statusPotencyMul());
    const coldDur2 = statusEffectDur(lvls.coldShot || 0);
    const hotDur2  = statusEffectDur(lvls.hotShot || 0);
    // Double Helix fans into THREE tight clusters (left / centre / right).
    const tightLvl2 = Math.min(lvls.spreadDown, MAX_LEVEL);
    const HELIX_FAN = 0.34;
    const clusterCount2  = doubleHelix ? TIGHT_BULLETS[tightLvl2] : ss.count;
    const clusterSpread2 = doubleHelix ? (TIGHT_SPREAD[tightLvl2] * Math.PI / 180) : ss.spread;
    const helixDirs2     = doubleHelix ? [-HELIX_FAN, 0, HELIX_FAN] : [0];
    for (const dirOff of helixDirs2) {
      const clusterAim = aim + dirOff;
      for (let i = 0; i < clusterCount2; i++) {
        const t = clusterCount2 > 1 ? (i / (clusterCount2 - 1)) * 2 - 1 : 0;
        const jitter = rand(-clusterSpread2, clusterSpread2) * 0.12;
        const a = clusterAim + t * clusterSpread2 + jitter;
        const sp = speedBase + rand(-2, 2) * (homingLvl2 > 0 ? HOMING_SPEED_MUL : 1);
        pellets.push({
          x: who.x + Math.cos(aim) * reach2,
          y: who.y + Math.sin(aim) * reach2,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: life,
          dmg: pelletDmg,
          pierce: isSlug ? (10 + lvls.spreadDown2 * 3) : 1,
          hit: isSlug ? new Set() : null,
          spareChance: spareChance,
          r: rocketLvl > 0 ? pelletR * ROCKET_PELLET_R_MUL : pelletR,
          color: pelletColor,
          trail: !isSlug,
          shooter: who.robot ? 'robot' : 2,
          robotMk: who.robot ? who.mk : undefined,
          robotRef: who.robot ? who : undefined,
          crit: false,  // crit rounds now look like normal bullets (only damage differs)
          critCol: null,
          bounce: sizeBounce2,
          cold: coldChance2 > 0 && Math.random() < coldChance2, coldDur: coldDur2,
          hot: hotChance2 > 0 && Math.random() < hotChance2, hotDur: hotDur2,
          rocket: rocketLvl > 0,
          rocketChance,
          rocketBoom,
          homing: homingLvl2 > 0,
          homingLvl: homingLvl2,
          homingTarget: null,
        });
      }
    }
    shake = 0.15;
  }

  function knockbackPlayer2(dist) {
    // The guest is authoritative for player2's position (they send pos
    // updates 20/s), so applying the shove only host-side would be wiped
    // by the next pos message. We compute the desired delta, apply it to
    // the local mirror, and ALSO forward it to the guest so they apply the
    // same shove on their authoritative copy.
    const dx = -Math.cos(player2.dir) * dist;
    const dy = -Math.sin(player2.dir) * dist;
    if (!fenceBlocks(player2.x + dx, player2.y)) player2.x += dx;
    if (!fenceBlocks(player2.x, player2.y + dy)) player2.y += dy;
    player2.x = clamp(player2.x, -HALF_MAP + 1, HALF_MAP - 1);
    player2.y = clamp(player2.y, -HALF_MAP + 1, HALF_MAP - 1);
    if (multiplayer && isHost && conn && conn.open) {
      try { conn.send({ type: 'shove', dx, dy }); } catch (_) {}
    }
  }

  function startMGReloadP2() {
    playReload();
    player2.ammo = mgMagSize(player2); // mag refills immediately — no reload delay
    player2.reloadingT = 0; // no machine-gun reload delay; twirl handled up-front in tryReloadP2
  }

  function handleJamP2(fromShot) {
    if (fromShot === undefined) fromShot = true;
    // Mirror P1: a jam mid-fire only eats the shot (caller sets the cadence),
    // while a botched reload still roots the buddy's gun.
    if (!fromShot) {
      player2.jamT = 1.2 * ((lvlsFor(player2).jam >= MAX_LEVEL) ? 0.5 : 1); // max Better Springs halves stun duration
    } else {
      // Dud shot — cosmetic red flash only, no root (mirrors player1).
      player2.jamFlashT = 1.2 * ((lvlsFor(player2).jam >= MAX_LEVEL) ? 0.5 : 1);
    }
    playReloadJam();
    player2.critStreak = 0; // a jam breaks P2's crit streak (no toast — the sound is the cue)
  }

  function swordSwingP2() { swordSwingFor(player2); }

  function swordSwingFor(who) {
    who.reloadT = SWORD_COOLDOWN;
    who.meleeT = MELEE_ANIM_DUR;
    who.meleeDir = who.dir;
    who.meleeFull = false;
    who.runT = 0;
    playSwordSwing();
    shake = Math.max(shake, 0.18);
    const r2 = SWORD_RANGE * SWORD_RANGE;
    for (const w of wolves) {
      if (!w.alive) continue;
      const dx = w.x - who.x, dy = w.y - who.y;
      if (dx * dx + dy * dy > r2) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - who.dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > SWORD_ARC) continue;
      const m = Math.hypot(dx, dy) || 1;
      hurtWolf(w, SWORD_DMG * (who.robot ? ROBOT_DMG[who.mk] : 1), (dx / m) * 0.4, (dy / m) * 0.4, who);
    }
    const inArc = t => {
      if (dist2(t.x, t.y, who.x, who.y) > r2) return false;
      const angle = Math.atan2(t.y - who.y, t.x - who.x) - who.dir;
      return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= SWORD_ARC;
    };
    if (gameOpts.friendlyFire && !who.robot) for (const r of robots) {
      if (r.alive && inArc(r)) hurtRobot(r);
    }
    if (who.robot) for (const c of chickens) {
      if (!c.alive || c.savedT > 0 || (c.carrier && c.carrier.alive) || !inArc(c)) continue;
      killChicken(c); playChickenDeath(); explodeChickenMaybe(c);
      corpses.push({ x: c.x, y: c.y, kind: 'chicken', t: 4 });
    }
  }

  function tryShootP2() {
    if (gameOver) return;
    if (player2.ghost) return;
    if (player2.buildMode) {
      // Pressing left-click while in build mode cancels it (parity with P1).
      player2.buildMode = false;
      toast('Buddy build mode cancelled', 1.0);
      return;
    }
    if (player2.magDumpLeft > 0) return;
    const lvls = lvlsFor(player2);
    if (lvls.sword >= 1) {
      if (player2.reloadT <= 0) swordSwingP2();
      return;
    }
    if (player2.reloadT > 0) return;
    if (player2.reloadingT > 0) return;
    if (player2.jamT > 0) return;
    const fireMul2 = ((lvls.minigun > 0) ? tableAtFor(player2, 'minigun') : 1) * lastStandFireMul(player2);
    if (lvls.machineGun > 0) {
      // Machine-gun: starts slow, faster each level (mag size is fixed).
      if (player2.ammo <= 0) { tryReloadP2(); return; }
      if (player2.skillCheckNeedsRelease) return; // wait for trigger release after a reload
      if (Math.random() < jamChanceFor(player2) * MG_JAM_MUL) { handleJamP2(); player2.reloadT = mgShotCooldown(player2); return; } // dud round — keeps the cadence, no lockout
      const wasCritMG2 = (player2.critShots || 0) > 0;
      fireBurstP2();
      if (!wasCritMG2) player2.ammo--; // crit shots don't eat the magazine
      player2.reloadT = mgShotCooldown(player2);
      return;
    }
    // Empty shotgun chamber: same routing into reload.
    if ((player2.shells || 0) <= 0) { tryReloadP2(); return; }
    if (Math.random() < jamChanceFor(player2)) { handleJamP2(); player2.reloadT = shotgunCooldownFor(player2) * fireMul2; return; } // dud shell — normal cadence, buddy keeps moving
    // One barrel per left-click; Double-Barrel just lets you fire twice before
    // reloading (right-click fires both at once — see doubleShotP2).
    const wasCritSG2 = (player2.critShots || 0) > 0;
    if (!wasCritSG2) { player2.shells--; player2.chambered = player2.shells > 0; } // crit shots don't eat the magazine
    player2.reloadT = shotgunCooldownFor(player2) * fireMul2;
    fireBurstP2();
  }

  function doubleShotP2() {
    if (gameOver || player2.ghost) return;
    if (player2.buildMode) return;
    // Reject the action if player2 doesn't actually own Double-Barrel —
    // stops a tampered guest from triggering it for free.
    if (lvlsFor(player2).doubleBarrel <= 0) return;
    if (player2.reloadT > 0 || player2.reloadingT > 0) return;
    if (player2.jamT > 0) return;
    if ((player2.shells || 0) <= 0) return;
    // Right-click fires every loaded barrel at once, then empties the gun.
    const p2Barrels = player2.shells;
    player2.shells = 0;
    player2.chambered = false;
    const p2lvls = lvlsFor(player2);
    const p2FireMul = (p2lvls.minigun > 0) ? tableAtFor(player2, 'minigun') : 1;
    player2.reloadT = shotgunCooldownFor(player2) * p2FireMul;
    const p2Opts = (p2lvls.rocket > 0) ? { rocketBoom: true } : undefined;
    for (let b = 0; b < p2Barrels; b++) fireBurstP2(2, p2Opts);
    shake = 0.3;
    const p2KnockMul = (p2lvls.minigun > 0) ? (1 + p2lvls.minigun * 0.25) : 1;
    knockbackPlayer2(1.4 * p2KnockMul);
    spawnSmoke(player2.x + Math.cos(player2.dir) * 0.6, player2.y + Math.sin(player2.dir) * 0.6, 6);
    const fr2 = DBL_FRONT_R * DBL_FRONT_R;
    for (const w of wolves) {
      if (!w.alive) continue;
      const dx = w.x - player2.x, dy = w.y - player2.y;
      if (dx * dx + dy * dy > fr2) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - player2.dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.3) continue;
      const m = Math.hypot(dx, dy) || 1;
      hurtWolf(w, DBL_FRONT_DMG, (dx / m) * 0.2, (dy / m) * 0.2, player2);
    }
  }

  function magDumpP2() {
    if (gameOver || player2.ghost) return;
    if (player2.buildMode) return;
    // Same gate: P2 must own Machine-Gun to mag-dump.
    if (lvlsFor(player2).machineGun <= 0) return;
    if (player2.reloadingT > 0 || player2.magDumpLeft > 0) return;
    if (player2.jamT > 0) return;
    if (player2.ammo <= 0) return;
    player2.magDumpLeft = player2.ammo;
    player2.magDumpT = 0;
    player2.magDumpRocket = lvlsFor(player2).rocket > 0;
    const fr2 = DBL_FRONT_R * DBL_FRONT_R;
    for (const w of wolves) {
      if (!w.alive) continue;
      const dx = w.x - player2.x, dy = w.y - player2.y;
      if (dx * dx + dy * dy > fr2) continue;
      let diff = Math.abs(Math.atan2(dy, dx) - player2.dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff > 1.3) continue;
      const m = Math.hypot(dx, dy) || 1;
      hurtWolf(w, DBL_FRONT_DMG, (dx / m) * 0.2, (dy / m) * 0.2, player2);
    }
  }

  function commitShotgunReloadP2() {
    player2.shells = shotgunMagP2(); // Double-Barrel loads two shells, others one
    player2.chambered = true;
    player2.jamStreak = 0;
    playReload();
    player2.reloadingT = 1.0; // twirl rolled up-front in tryReloadP2, before the skill check
  }

  function tryReloadP2() {
    if (gameOver || player2.ghost) return;
    if (player2.buildMode) return; // can't reload while placing buildings
    const lvls = lvlsFor(player2);
    if (lvls.sword >= 1) return;
    if (player2.reloadingT > 0) return;
    if (player2.jamT > 0) return;
    const isMG = lvls.machineGun > 0;
    const empty = isMG ? (player2.ammo <= 0) : !player2.chambered;
    if (!empty) {
      if (player2.skillCheckActive) player2.skillCheckActive = false;
      player2.skillCheckNeedsRelease = false;
      toast(isMG ? 'Buddy magazine not empty' : 'Buddy already loaded', 0.5);
      return;
    }
    if (!player2.skillCheckActive) {
      // Quickdraw twirl rolled up-front — a hit skips the skill check entirely.
      if (Math.random() < tableAtFor(player2, 'spinReload')) { spinTwirlReload(player2, isMG); return; }
      player2.skillCheckActive = true;
      player2.skillCheckNeedsRelease = !!player2.mouseDown;
      // Random starting phase (0..1) mirrors player1 — marker doesn't always
      // start at the leftmost edge.
      player2.skillCheckT = Math.random();
      player2.skillCheckLockoutT = 0;
      return;
    }
    if (player2.skillCheckNeedsRelease) return;
    if (player2.skillCheckLockoutT > 0) return;
    const pos = skillCheckPos(player2.skillCheckT);
    const distFromCenter2 = Math.abs(pos - 0.5);
    if (distFromCenter2 <= skillCheckHitHalf(player2)) {
      player2.skillCheckActive = false;
      player2.skillCheckNeedsRelease = false;
      if (distFromCenter2 <= skillCheckCritHalf(player2)) {
        player2.critShots = (lvlsFor(player2).machineGun > 0) ? CRIT_MG_SHOTS : 1;
        player2.critSpeedT = CRIT_SPEED_BOOST_T; // buddy gets the same footwork burst on a crit
        player2.dashCd = 0; // …and instantly recharges the buddy's Parry Mode dodge-roll
        if ((lvlsFor(player2).rust || 0) >= 5) {
          player2.critStreak = (player2.critStreak || 0) + 1;
          addMoney(player2, GOLD_PER_CRIT);
          if (player2.critStreak >= 10) {
            addMoney(player2, 10);
            player2.critStreak = 0;
          }
          playMoney();
        } else {
          playCritical();
        }
      } else {
        player2.critStreak = 0;
      }
      if (isMG) startMGReloadP2(); else commitShotgunReloadP2();
      // Wait for the trigger release after a held-down reload commit (see P1).
      if (isMG) player2.skillCheckNeedsRelease = player2.mouseDown;
    } else {
      // Botched timing jams P2's gun — same rule the host's keeper follows.
      player2.skillCheckActive = false;
      player2.skillCheckNeedsRelease = false;
      handleJamP2(false); // reload-miss jam — no golden-gun payout
    }
  }

  // Friendly-fire pellet hit — knocks a hat off the other keeper. Mirrors the
  // wolf-bites-keeper bookkeeping so death/ghost transitions still trigger.
  // A short debounce window keeps a single shotgun blast (multiple pellets
  // landing on the same frame) from removing more than one hat.
  // Independent rolls on a registered hit: transcendence can clear the pack
  // even when the keeper avoids losing a hat. No popup accompanies either.
  function keeperDodgesHatLoss(keeper) {
    const k = keeper.karma || 0;
    const bonus = k >= 0 ? k * 0.002 : (-k) * 0.004;
    const dodged = Math.random() < (keeper.transcendentKarma ? 0.75 : 0.10 + bonus);
    if (keeper.transcendentKarma && Math.random() < 0.25) karmaWolfSweep(keeper);
    return dodged;
  }

  // `hatChance` (optional) is the odds this hit actually costs a hat. Buddy-on-
  // buddy fire passes FRIENDLY_FIRE_HAT_CHANCE so a stray pellet usually only
  // stings; hunter strays and anything else omit it and always count.
  function applyFriendlyFireHit(target, hatChance) {
    if (target.ghost) return;
    if (target.bulletHitT > 0) return; // already debited by an earlier pellet this blast
    target.bulletHitT = 0.18 * (target.transcendentKarma ? 2 : 1);
    shake = Math.max(shake, 0.18);
    target.hurtT = 0.22;
    playKeeperHit();
    breakLastStand(target); // a hit drops the keeper out of the Last Stand pose
    // Grazed — the blast window is still spent, so one volley can't re-roll.
    if (hatChance !== undefined && Math.random() >= hatChance) return;
    if (keeperDodgesHatLoss(target)) return; // hidden dodge — kept the hat
    if (target === player) {
      if (immortal && playerHats <= 1) return; // Immortal holds the last hat (silently)
      const lost = hatColors[hatColors.length - 1];
      playerHats--;
      hatColors.pop();
      onHatLost(lost);
      if (playerHats <= 0) {
        killKeeper(player, 'host', 'friendly fire');
      }
    } else if (target === player2) {
      player2.hats--;
      if (Array.isArray(player2.hatColors)) player2.hatColors.pop();
      if (player2.hats <= 0) {
        killKeeper(player2, 'guest', 'friendly fire');
      }
    }
  }

  // A ranged-wolf bullet landing on a keeper: same knock-a-hat-off mechanic
  // as friendly fire, but with the right toast wording and death cause so
  // the scoreboard credits the kill to the wolf, not the buddy.
  function applyWolfBulletHit(target) {
    if (target.ghost) return;
    if (target.bulletHitT > 0) return;
    target.bulletHitT = 0.18 * (target.transcendentKarma ? 2 : 1);
    shake = Math.max(shake, 0.18);
    target.hurtT = 0.22;
    playKeeperHit();
    breakLastStand(target); // a hit drops the keeper out of the Last Stand pose
    if (keeperDodgesHatLoss(target)) return; // hidden dodge — kept the hat
    if (target === player) {
      if (immortal && playerHats <= 1) return; // Immortal holds the last hat (silently)
      const lost = hatColors[hatColors.length - 1];
      playerHats--;
      hatColors.pop();
      onHatLost(lost);
      if (playerHats <= 0) {
        killKeeper(player, 'host', 'shot by a wolf');
      }
    } else if (target === player2) {
      player2.hats--;
      if (Array.isArray(player2.hatColors)) player2.hatColors.pop();
      if (player2.hats <= 0) {
        killKeeper(player2, 'guest', 'shot by a wolf');
      }
    }
  }

  // ---------- AI ----------
  // Whichever keeper is closer to (x,y) — used by wolves so they can chase
  // either player. Ghosts are invisible to wolves; if every keeper is a
  // ghost, returns null and the caller has to handle that explicitly.
  function nearestKeeper(x, y) {
    // Last Stand stealth: a cloaked keeper is invisible to wolf AI — treat
    // them the same as a ghost so nothing targets them.
    const p1Gone = player.ghost || player.lastStandStealth;
    const p2Gone = player2.ghost || player2.lastStandStealth;
    if (!player2.active) return p1Gone ? null : player;
    if (p1Gone && p2Gone) return null;
    if (p1Gone) return player2;
    if (p2Gone) return player;
    const d1 = dist2(x, y, player.x, player.y);
    const d2 = dist2(x, y, player2.x, player2.y);
    return d2 < d1 ? player2 : player;
  }

  // Guard-dog AI: charge the nearest wolf and bite it; idle near the chickens
  // when the field is clear. Speed and bite damage scale with the upgrade level.
  function updateDog(d, dt) {
    const lvl = Math.max(1, upgradeLevels.dog);
    const speed = 2.8 + lvl * 0.3;
    if (d.attackT > 0) d.attackT -= dt;
    // FANGUS is far too big to bite — the dog never engages it. For the WHOLE
    // boss fight it's terrified: it never settles, scampering around the map and
    // always keeping well clear of the boss. If the boss is close it bolts
    // straight away; otherwise it scurries between random far-from-boss waypoints
    // (re-picked often) so it keeps running around at a safe distance.
    if (boss && boss.alive && bossPhase === 'fight') {
      const bdx = d.x - boss.x, bdy = d.y - boss.y;
      const bd2 = bdx * bdx + bdy * bdy;
      let tx, ty;
      if (bd2 < DOG_BOSS_SCARED_R2) {
        // Boss too close — sprint directly away from it.
        const bdm = Math.hypot(bdx, bdy) || 1;
        tx = d.x + (bdx / bdm) * 10;
        ty = d.y + (bdy / bdm) * 10;
        d.panicT = 0; // force a fresh waypoint once it's clear again
      } else {
        // Far enough — keep scampering to fresh spots that stay clear of the boss.
        d.panicT = (d.panicT || 0) - dt;
        if (d.panicT <= 0 || d.panicX === undefined) {
          d.panicT = rand(0.7, 1.6);
          for (let tries = 0; tries < 8; tries++) {
            const ang = Math.random() * Math.PI * 2;
            const r = rand(4, 9);
            const px = clamp(d.x + Math.cos(ang) * r, -HALF_MAP + 2, HALF_MAP - 2);
            const py = clamp(d.y + Math.sin(ang) * r, -HALF_MAP + 2, HALF_MAP - 2);
            d.panicX = px; d.panicY = py;
            if (dist2(px, py, boss.x, boss.y) > DOG_BOSS_SCARED_R2) break; // prefer spots away from boss
          }
        }
        tx = d.panicX; ty = d.panicY;
      }
      const dgx = tx - d.x, dgy = ty - d.y, gm = Math.hypot(dgx, dgy) || 1;
      d.vx = (dgx / gm) * speed * 1.4; // scared sprint, faster than normal
      d.vy = (dgy / gm) * speed * 1.4;
      const fdx = boss.x - d.x, fdy = boss.y - d.y;
      if (Math.abs(fdx - fdy) > 0.05) d.facingLeft = (fdx - fdy) < 0; // glance back at the boss
      const stepX = d.x + d.vx * dt, stepY = d.y + d.vy * dt;
      const inside = fenceBlocks(d.x, d.y);
      if (inside || !fenceBlocks(stepX, d.y)) d.x = stepX;
      if (inside || !fenceBlocks(d.x, stepY)) d.y = stepY;
      d.x = clamp(d.x, -HALF_MAP + 1, HALF_MAP - 1);
      d.y = clamp(d.y, -HALF_MAP + 1, HALF_MAP - 1);
      d.bob += dt * 12;
      return;
    }
    // The dog's anchor depends on its personality — where it stays when idle.
    let ax, ay;
    if (d.personality === 0) {            // stay close to the player
      ax = player.x; ay = player.y;
    } else if (d.personality === 1) {     // patrol — roam to fresh points
      d.roamT -= dt;
      if (d.roamT <= 0) {
        d.roamT = rand(3, 6);
        d.roamX = clamp(player.x + rand(-9, 9), -HALF_MAP + 2, HALF_MAP - 2);
        d.roamY = clamp(player.y + rand(-9, 9), -HALF_MAP + 2, HALF_MAP - 2);
      }
      ax = d.roamX; ay = d.roamY;
    } else {                              // protect the nearest chicken
      let best = null, bd = Infinity;
      for (const c of chickens) {
        if (!c.alive || c.carrier || c.suckedBy) continue;
        const dd = dist2(c.x, c.y, d.x, d.y);
        if (dd < bd) { bd = dd; best = c; }
      }
      ax = best ? best.x : player.x;
      ay = best ? best.y : player.y;
    }
    // Hunt the nearest wolf on the dog's beat — within leash of its anchor, or
    // right next to the dog itself (a wolf that close is always engaged).
    let prey = null, nd = Infinity;
    for (const w of wolves) {
      if (!w.alive || w.boss || ninjaIsWatching(w)) continue; // the forest watcher is not attacking
      if (dist2(w.x, w.y, ax, ay) > DOG_LEASH_R2 &&
          dist2(w.x, w.y, d.x, d.y) > DOG_NOTICE_R2) continue;
      const dd = dist2(w.x, w.y, d.x, d.y);
      if (dd < nd) { nd = dd; prey = w; }
    }
    // Chase prey if there is any, otherwise drift back to the anchor.
    const tx = prey ? prey.x : ax;
    const ty = prey ? prey.y : ay;
    const dx = tx - d.x, dy = ty - d.y;
    const m = Math.hypot(dx, dy) || 1;
    // Seek the target (unless already close)...
    let mvx = 0, mvy = 0;
    if (m > 0.5) { mvx = dx / m; mvy = dy / m; }
    // ...and when idle, steer away from packmates so the dogs spread out and
    // guard a wider area instead of bunching up (separation is dropped while
    // hunting so they can still close in and bite a wolf together).
    if (!prey) {
      for (const other of dogs) {
        if (other === d) continue;
        const ox = d.x - other.x, oy = d.y - other.y;
        const od2 = ox * ox + oy * oy;
        if (od2 > 0.0001 && od2 < DOG_SEP_R * DOG_SEP_R) {
          const od = Math.sqrt(od2);
          const push = (1 - od / DOG_SEP_R) * DOG_SEP_WEIGHT;
          mvx += (ox / od) * push;
          mvy += (oy / od) * push;
        }
      }
    }
    const mvm = Math.hypot(mvx, mvy);
    if (mvm > 0.05) {
      d.vx = (mvx / mvm) * speed;
      d.vy = (mvy / mvm) * speed;
      // Collide with fences/walls — axis-separated so the dog slides along them.
      const stepX = d.x + d.vx * dt, stepY = d.y + d.vy * dt;
      const inside = fenceBlocks(d.x, d.y);
      if (inside || !fenceBlocks(stepX, d.y)) d.x = stepX;
      if (inside || !fenceBlocks(d.x, stepY)) d.y = stepY;
    } else {
      d.vx = d.vy = 0;
    }
    d.x = clamp(d.x, -HALF_MAP + 1, HALF_MAP - 1);
    d.y = clamp(d.y, -HALF_MAP + 1, HALF_MAP - 1);
    const svx = d.vx - d.vy;
    if (Math.abs(svx) > 0.05) d.facingLeft = svx < 0;
    d.bob += dt * (Math.hypot(d.vx, d.vy) > 0.1 ? 11 : 2);
    // Bite a wolf in reach.
    if (prey && nd < 0.55 * 0.55 && d.attackT <= 0) {
      d.attackT = 0.55;
      hurtWolf(prey, 2 + lvl, (dx / m) * 0.25, (dy / m) * 0.25);
      playDogBark();
    }
  }

  function updateChicken(c, dt) {
    if (!c.alive) return;
    // Tick down the rescue grace timer set by onWolfKilled / fox-kill flows.
    if (c.savedT > 0) c.savedT = Math.max(0, c.savedT - dt);
    // Being hauled in by a FANGUS siphon orb — the orb owns its position.
    if (c.suckedBy) return;
    // Carried by a wolf/fox via Wolf Heist: ride along until released or eaten.
    if (c.carrier) {
      if (!c.carrier.alive) { c.carrier = null; }
      else { c.x = c.carrier.x; c.y = c.carrier.y; return; }
    }
    // Soldier chicken: charges the pack instead of fleeing it. Falls through to
    // the normal bird behaviour when there's nothing on the field to charge,
    // so a soldier between waves mills around with the rest of the flock.
    if (c.soldier && updateSoldierChicken(c, dt)) return;
    // Find nearest wolf
    let nearestWolf = null, nd = Infinity;
    for (const w of wolves) {
      if (!w.alive) continue;
      const d = dist2(c.x, c.y, w.x, w.y);
      if (d < nd) { nd = d; nearestWolf = w; }
    }
    const fleeRange = 4;
    // Worker chickens prioritise rebuilding fences over their usual wandering.
    // They only switch into "work mode" when no wolf is breathing down their
    // neck — fleeing always wins.
    const wolfClose = nearestWolf && nd < fleeRange * fleeRange;
    if (c.worker && !wolfClose && !c.carrier && debris.length > 0) {
      // Pick the nearest debris pile within the worker's seek range.
      let bestD = null, bestDist = WORKER_SEEK_RANGE2;
      for (const d of debris) {
        const dd = dist2(d.x, d.y, c.x, c.y);
        if (dd < bestDist) { bestDist = dd; bestD = d; }
      }
      if (bestD) {
        const dx = bestD.x - c.x, dy = bestD.y - c.y;
        const m = Math.hypot(dx, dy) || 1;
        if (m <= WORKER_REBUILD_REACH) {
          // Sacrifice the chicken and rebuild the fence at full HP.
          // Forced for the same reason the soldier's blast is: the worker is
          // spending itself, and a shielded bird refusing to die would just
          // rebuild the next pile too, for free.
          killChicken(c, true);
          corpses.push({ x: c.x, y: c.y, kind: 'chicken', t: 4 });
          fences.push({ x: bestD.x, y: bestD.y, kind: bestD.kind, hp: bestD.hp, hurtT: 0 });
          const di = debris.indexOf(bestD);
          if (di >= 0) debris.splice(di, 1);
          spawnSmoke(bestD.x, bestD.y, 4);
          playBuild();
          // (No toast — the rebuilt fence is visible on its own.)
          return;
        }
        // Walk toward the pile at the worker's normal pace.
        c.vx = (dx / m) * 1.6;
        c.vy = (dy / m) * 1.6;
        c.wanderT = 0.4; // hold the heading briefly so we don't re-pick every frame
        // Fall through to the regular movement step (collision + clamp).
      }
    }
    // Flutter overrides wolf-flee: chicken ignores the wolf and flies toward coop.
    if (wolfClose && (c.flutterT || 0) > 0) {
      const hx = c.home ? c.home.x : 0, hy = c.home ? c.home.y : 0;
      const dx = hx - c.x, dy = hy - c.y;
      const m = Math.hypot(dx, dy) || 1;
      c.vx = (dx / m) * 4.5;
      c.vy = (dy / m) * 4.5;
    } else if (wolfClose) {
      // Unit-vector flee direction away from the wolf
      const m = Math.hypot(c.x - nearestWolf.x, c.y - nearestWolf.y) || 1;
      let ux = (c.x - nearestWolf.x) / m;
      let uy = (c.y - nearestWolf.y) / m;
      // If fleeing straight away would press into a wall, slide along it.
      // Without this, the clamp pins the chicken's position while velocity keeps
      // pointing outward — they sit still in the corner and the wolf catches them.
      const minB = -HALF_MAP + 1;
      const maxB = HALF_MAP - 1;
      const margin = 1.2;
      const wallX = (c.x <= minB + margin && ux < 0) || (c.x >= maxB - margin && ux > 0);
      const wallY = (c.y <= minB + margin && uy < 0) || (c.y >= maxB - margin && uy > 0);
      if (wallX && wallY) {
        // Cornered: redirect perpendicular to the threat, picking the side with more room.
        const p1x = -uy, p1y = ux;
        const p2x = uy, p2y = -ux;
        const openness = (dx, dy) => {
          const nx = clamp(c.x + dx, minB, maxB);
          const ny = clamp(c.y + dy, minB, maxB);
          return Math.min(nx - minB, maxB - nx) + Math.min(ny - minB, maxB - ny);
        };
        if (openness(p1x, p1y) >= openness(p2x, p2y)) { ux = p1x; uy = p1y; }
        else                                          { ux = p2x; uy = p2y; }
      } else if (wallX) {
        ux = 0;
        uy = uy >= 0 ? 1 : -1;
      } else if (wallY) {
        uy = 0;
        ux = ux >= 0 ? 1 : -1;
      }
      // (Chickens phase through fences now, so no fence-corner avoidance is
      // needed — they just flee straight away from the wolf.)
      c.vx = ux * 3.0;
      c.vy = uy * 3.0;
      c.fleeT = 0.3;
    } else if (c.fleeT > 0) {
      c.fleeT -= dt;
    } else {
      // Wander near home
      if ((c.flutterT || 0) > 0) c.flutterT -= dt;
      c.wanderT -= dt;
      if (c.wanderT <= 0) {
        c.wanderT = rand(0.8, 2.5);
        const hx = c.home ? c.home.x : 0;
        const hy = c.home ? c.home.y : 0;
        // If too close to the border, trigger a panic-flutter back toward the coop.
        const wallDist = (HALF_MAP - 1) - Math.max(Math.abs(c.x), Math.abs(c.y));
        const nearWall = wallDist < 1.6;
        if (nearWall && Math.random() < 0.14) { // ~55%/4 — less frequent but more dramatic
          // Flutter: strong wing-flap dash toward the home coop
          c.flutterT = 1.4 + rand(0, 0.6);
          const dx = hx - c.x, dy = hy - c.y;
          const m = Math.hypot(dx, dy) || 1;
          c.vx = (dx / m) * 4.5;
          c.vy = (dy / m) * 4.5;
        } else {
          // Normal wander — bias toward home coop
          const tx = hx + rand(-2, 2);
          const ty = hy + rand(-2, 2);
          const dx = tx - c.x, dy = ty - c.y;
          const m = Math.hypot(dx, dy) || 1;
          c.vx = (dx / m) * 1.2;
          c.vy = (dy / m) * 1.2;
        }
      }
    }
    // Update facing direction from screen-space horizontal velocity (iso: screen X ∝ vx - vy)
    const cSvx = c.vx - c.vy;
    if (Math.abs(cSvx) > 0.05) c.facingLeft = cSvx < 0;
    // Chickens ignore fences entirely — they slip freely through wood and stone
    // walls so a pen never traps or pockets them. (Wolves and the keeper still
    // collide; only the birds phase through.)
    const fatMul = chickenSpeedMul(c); // a fat chicken moves slower the fatter it is
    c.x += c.vx * dt * fatMul;
    c.y += c.vy * dt * fatMul;
    c.x = clamp(c.x, -HALF_MAP + 1, HALF_MAP - 1);
    c.y = clamp(c.y, -HALF_MAP + 1, HALF_MAP - 1);
    c.bob += dt * ((c.flutterT || 0) > 0 ? 22 : Math.hypot(c.vx, c.vy) > 0.1 ? 12 : 2);
  }

  // ---- Robot allies (MK-1 / MK-2 / MK-3) ----------------------------------
  // Summoned by typing robot1/2/3 or from the debug panel. Host-authoritative:
  // the guest sees them through the snapshot and never ticks them, same as the
  // hunter crew.
  //
  // The deal is deliberately the inverse of the hunter wolf — that one is a
  // wolf wearing a keeper's silhouette, this is a keeper silhouette on the
  // player's side. It fights and does nothing else: no building, no pickups,
  // no upgrade picks, no coop interaction.
  function spawnRobot(mk, atX, atY) {
    const m = clamp(Math.round(mk) || 1, 1, ROBOT_MAX_MK);
    if (robots.filter(r => r.alive).length >= ROBOT_MAX_ACTIVE) return null;
    // Materialises a step off the keeper's shoulder by default.
    const bx = atX !== undefined ? atX : player.x + rand(-1.4, 1.4);
    const by = atY !== undefined ? atY : player.y + rand(-1.4, 1.4);
    const r = {
      robot: true, mk: m,
      x: clamp(bx, -HALF_MAP + 2, HALF_MAP - 2),
      y: clamp(by, -HALF_MAP + 2, HALF_MAP - 2),
      vx: 0, vy: 0,
      hp: ROBOT_HP[m], maxHp: ROBOT_HP[m],
      hats: ROBOT_HP[m], hatColors: Array(ROBOT_HP[m]).fill('#5a3825'),
      wolfHitT: 0, eyeFlashT: 0, crazyT: 0, faultWave: -1,
      shells: 1, ammo: MG_MAG, chambered: true, reloadingT: 0, reloadT: 0,
      alive: true, dying: false, downT: 0,
      facingLeft: false, walkT: 0, dir: 0,
      hurtT: 0, attackT: rand(0.2, 0.6), muzzleT: 0,
      bootT: ROBOT_BOOT_T,       // spin-up before it starts acting
      thinkT: 0, roamTX: bx, roamTY: by,
      kills: 0,
    };
    robots.push(r);
    playRobotBoot();
    return r;
  }

  // What this robot should be shooting. The mark decides how much thought goes
  // into the choice: ROBOT_SMART 0 takes whatever is nearest, and the higher
  // marks score the field so they go for the wolf that is actually about to
  // cost the player something.
  function robotPickTarget(r) {
    const smart = ROBOT_SMART[r.mk];
    const reach = ROBOT_RANGE[r.mk] + 6; // it will walk a little way to engage
    let best = null, bestScore = -Infinity;
    for (const w of wolves) {
      if (!w.alive || w.parachuting || ninjaIsWatching(w)) continue;
      if (w.invulnT > 0) continue;
      const d2w = dist2(r.x, r.y, w.x, w.y);
      if (d2w > reach * reach) continue;
      if (smart === 0) {
        // MK-1: closest thing that moves. No judgement at all.
        if (-d2w > bestScore) { bestScore = -d2w; best = w; }
        continue;
      }
      // Distance is the baseline, then the threats get weighted up.
      let score = -Math.sqrt(d2w);
      if (w.carrying) score += 14;              // making off with a chicken
      if (w.fox) score += 6;                    // foxes are quick and expensive
      if (smart >= 2) {
        // MK-3 also reads the board: wolves bearing down on the flock or on a
        // keeper outrank a wolf that is merely nearby, and it leaves the boss
        // alone while anything else is still standing (its pellets barely
        // dent FANGUS and the pack is what actually kills you).
        const nc = nearestChickenTo(w.x, w.y);
        if (nc && dist2(nc.x, nc.y, w.x, w.y) < 9) score += 8;
        const nk = nearestKeeper(w.x, w.y);
        if (nk && dist2(nk.x, nk.y, w.x, w.y) < 9) score += 5;
        if (w.boss) score -= 20;
        if (w.hp !== undefined && w.maxHp) score += (1 - w.hp / w.maxHp) * 4; // finish the wounded
      }
      if (score > bestScore) { bestScore = score; best = w; }
    }
    return best;
  }
  // Nearest live chicken to a point — used by the MK-3's threat scoring.
  function nearestChickenTo(x, y) {
    let best = null, bd = Infinity;
    for (const c of chickens) {
      if (!c.alive) continue;
      const d = dist2(c.x, c.y, x, y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function updateRobot(r, dt) {
    if (!r.alive) {
      // Scrap-fall: a short topple before the chassis is spliced out.
      if (r.dying) {
        r.downT = (r.downT || 0) + dt;
        if (r.downT >= ROBOT_FALL_DUR) r.dead = true;
      }
      return;
    }
    if (r.hurtT > 0) r.hurtT = Math.max(0, r.hurtT - dt);
    if (r.muzzleT > 0) r.muzzleT = Math.max(0, r.muzzleT - dt);
    if (r.attackT > 0) r.attackT -= dt;
    r.eyeFlashT = Math.max(0, (r.eyeFlashT || 0) - dt);
    r.wolfHitT = Math.max(0, (r.wolfHitT || 0) - dt);
    r.meleeT = Math.max(0, (r.meleeT || 0) - dt);
    r.spinT = Math.max(0, (r.spinT || 0) - dt);
    r.jamFlashT = Math.max(0, (r.jamFlashT || 0) - dt);
    r.reloadT = Math.max(0, (r.reloadT || 0) - dt);
    r.reloadingT = Math.max(0, (r.reloadingT || 0) - dt);
    if (r.reloadingT <= 0 && (r.shells > 0 || r.ammo > 0)) r.chambered = true;
    // Contact remains dangerous for special wolves too, including during reboot.
    for (const w of wolves) {
      if (!w.alive || w.parachuting || w.defective || w.fleeing || ninjaIsWatching(w)) continue;
      if (dist2(w.x, w.y, r.x, r.y) < ROBOT_HURT_R * ROBOT_HURT_R
          && !fenceBlocks((w.x + r.x) / 2, (w.y + r.y) / 2)) hurtRobot(r);
    }
    if (!r.alive) return;
    if (r.bootT > 0) {
      r.bootT = Math.max(0, r.bootT - dt);
      r.vx = r.vy = 0; r.moving = false;
      return;
    }
    // One fault roll per wave. Rain doubles the chance; MK-3 is waterproof.
    if (waveActive && r.faultWave !== wave) {
      r.faultWave = wave;
      const chance = ROBOT_FAULT_CHANCE[r.mk] * (raining() ? 2 : 1);
      if (Math.random() < chance) { r.crazyT = ROBOT_FAULT_T; r.attackT = 0; }
    }
    if (r.crazyT > 0) {
      r.crazyT = Math.max(0, r.crazyT - dt);
      r.vx = r.vy = 0; r.moving = false;
      r.dir = rand(-Math.PI, Math.PI);
      if (r.attackT <= 0) robotFire(r, { x: r.x + Math.cos(r.dir), y: r.y + Math.sin(r.dir) });
      return;
    }

    const target = robotPickTarget(r);
    const spd = ROBOT_SPEED[r.mk];
    if (target) {
      const dx = target.x - r.x, dy = target.y - r.y;
      const m = Math.hypot(dx, dy) || 1;
      r.dir = Math.atan2(dy, dx);
      r.facingLeft = (dx - dy) < 0;
      const stand = lvlsFor(r).sword > 0 ? SWORD_RANGE * 0.55 : ROBOT_STANDOFF[r.mk];
      // Hold a shooter's distance: close in when out of range, back off when
      // something gets inside the standoff. The higher marks keep their
      // spacing more tightly, which is most of why they survive longer.
      let mvx = 0, mvy = 0;
      if (m > stand + 0.6) { mvx = (dx / m) * spd; mvy = (dy / m) * spd; }
      else if (m < stand - 0.3) { mvx = -(dx / m) * spd; mvy = -(dy / m) * spd; }
      else if (ROBOT_SMART[r.mk] >= 1) {
        // Strafe around the target instead of standing still — a stationary
        // robot gets surrounded.
        mvx = -(dy / m) * spd * 0.55;
        mvy = (dx / m) * spd * 0.55;
      }
      r.vx = mvx; r.vy = mvy;
      robotStep(r, dt);
      if (r.attackT <= 0 && m <= ROBOT_RANGE[r.mk]) {
        robotFire(r, target);
      }
      return;
    }
    // Nothing to shoot: patrol the flock. It parks near the chickens it is
    // meant to be protecting rather than wandering off to the treeline.
    r.thinkT -= dt;
    if (r.thinkT <= 0) {
      r.thinkT = rand(ROBOT_THINK_MIN, ROBOT_THINK_MAX);
      const anchor = nearestChickenTo(r.x, r.y)
        || (coops.length ? coops[Math.floor(Math.random() * coops.length)] : player);
      r.roamTX = clamp(anchor.x + rand(-3, 3), -HALF_MAP + 2, HALF_MAP - 2);
      r.roamTY = clamp(anchor.y + rand(-3, 3), -HALF_MAP + 2, HALF_MAP - 2);
    }
    const rdx = r.roamTX - r.x, rdy = r.roamTY - r.y;
    const rm = Math.hypot(rdx, rdy) || 1;
    if (rm > 0.4) {
      r.vx = (rdx / rm) * spd * 0.5;
      r.vy = (rdy / rm) * spd * 0.5;
      r.facingLeft = (rdx - rdy) < 0;
      robotStep(r, dt);
    } else {
      r.vx = 0; r.vy = 0;
      r.moving = false;
    }
  }
  // Movement step. Robots respect fences the way wolves do — they're too big
  // and too dumb to climb, and letting them phase through walls would make a
  // walled pen pointless.
  function robotStep(r, dt) {
    moveWithFences(r, dt);
    r.x = clamp(r.x, -HALF_MAP + 1, HALF_MAP - 1);
    r.y = clamp(r.y, -HALF_MAP + 1, HALF_MAP - 1);
    r.moving = Math.hypot(r.vx, r.vy) > 0.05;
    if (r.moving) r.walkT += dt * 11;
  }

  // Weapon effects use the same recipe as the keeper. Mark and training
  // still set aim, damage and cadence. Automatic reloads respect weapon tiers.
  function robotFire(r, target) {
    if (!r.alive || r.bootT > 0 || r.reloadingT > 0) return;
    r.dir = Math.atan2(target.y - r.y, target.x - r.x) + rand(-robotAimErr(r), robotAimErr(r));
    const lvls = lvlsFor(r);
    const cadence = robotFireCd(r) / ROBOT_FIRE_CD[1];
    if (lvls.sword > 0) {
      swordSwingFor(r);
      r.attackT = SWORD_COOLDOWN * cadence;
      return;
    }
    const mg = lvls.machineGun > 0;
    if ((mg ? r.ammo : r.shells) <= 0) {
      r.ammo = mgMagSize(r);
      r.shells = shotgunMagFor(r);
      const twirl = lvls.spinReload > 0 && Math.random() < tableAtFor(r, 'spinReload');
      r.reloadingT = (twirl ? SPIN_RELOAD_TIME : 0.9) * cadence;
      r.chambered = false;
      if (twirl) { r.spinT = SPIN_RELOAD_TIME; if (lvls.spinReload >= 5) r.spinDmg = true; }
      r.mgSpinT = 0;
      return;
    }
    r.attackT = (mg ? mgShotCooldown(r) : shotgunCooldownFor(r)
      * (lvls.minigun > 0 ? tableAtFor(r, 'minigun') : 1)) * cadence;
    r.reloadT = r.attackT;
    if (Math.random() < jamChanceFor(r) * (mg ? MG_JAM_MUL : 1)) {
      r.jamFlashT = 0.6; playReloadJam(); return;
    }
    if (mg) r.ammo--; else r.shells--;
    r.chambered = mg ? r.ammo > 0 : r.shells > 0;
    if (mg) r.mgSpinT = (r.mgSpinT || 0) + r.attackT;
    fireBurstFor(r, ROBOT_DMG[r.mk]);
    r.muzzleT = 0.09;
  }

  // Hats are the robot's HP: one hit knocks off one, with a brief volley guard.
  // Eyes react even when a second pellet arrives during that guard.
  function hurtRobot(r) {
    if (!r.alive) return false;
    r.eyeFlashT = 1.2;
    if (r.wolfHitT > 0) return false;
    r.wolfHitT = 0.7;
    r.hurtT = 0.22;
    r.hatColors.pop();
    r.hats = Math.max(0, r.hats - 1); r.hp = r.hats;
    if (r.hats <= 0) destroyRobot(r);
    return true;
  }

  // Credit a robot for a kill and let it learn from it. Called from the wolf
  // death path when the killing pellet came from a robot.
  function robotCreditKill(r) {
    if (!r || !r.alive) return;
    r.kills = (r.kills || 0) + 1;
    const before = robotSkill(r.mk);
    robotTraining[r.mk] = Math.min(1, (robotTraining[r.mk] || 0) + ROBOT_TRAIN_PER_KILL);
    // Announce each quarter crossed so the training is legible without a UI.
    const after = robotSkill(r.mk);
    const step = 0.25;
    if (Math.floor(after / step) > Math.floor(before / step)) {
      // All live units of this mark install the shared training update.
      for (const unit of robots) if (unit.alive && unit.mk === r.mk) {
        unit.bootT = ROBOT_REBOOT_T[unit.mk];
        unit.vx = unit.vy = 0; unit.moving = false;
      }
      playRobotBoot();
      const pct = Math.round(after * 100);
      toast('MK-' + r.mk + ' combat data: ' + pct + '% trained', 1.6);
      toastGuest('MK-' + r.mk + ' combat data: ' + pct + '% trained', 1.6);
      playUnlockChime();
    }
  }
  function destroyRobot(r) {
    if (!r.alive) return;
    r.alive = false;
    r.dying = true;
    r.downT = 0;
    r.hp = r.hats = 0;
    r.hatColors.length = 0;
    spawnBlast(r.x, r.y);
    spawnSmoke(r.x, r.y, 10);
    playExplosion();
    shake = Math.max(shake, 0.3);
    // Comes apart into the same metal debris a disassembling wolf leaves — it
    // IS a machine. Same shape tryWolfDisassemble pushes, so drawWolfScrap
    // renders it without knowing where it came from.
    const n = 10 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1.2, 4.2);
      wolfScrap.push({
        x: r.x, y: r.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        z: rand(0.2, 0.9), vz: rand(3.5, 7.5),
        spin: Math.random() * Math.PI * 2, spinV: rand(-14, 14),
        t: rand(2.2, 3.2),
        kind: i % 3,
        size: rand(0.8, 1.4),
      });
    }
    playWolfScrap();
    toast('MK-' + r.mk + ' destroyed', 1.6);
    toastGuest('MK-' + r.mk + ' destroyed', 1.6);
  }
  // Prune toppled chassis once the fall animation has played out. No corpse is
  // left behind — the scrap thrown by destroyRobot IS the wreckage.
  function tickRobotWrecks() {
    for (let i = robots.length - 1; i >= 0; i--) if (robots[i].dead) robots.splice(i, 1);
  }

  // ---- Soldier chicken ----------------------------------------------------
  // Helmet, a bundle of TNT, and no survival instinct whatsoever. Picks the
  // nearest wolf, runs it down, and lights the fuse once it's close enough.
  // Returns true when it has taken the chicken's turn; false means "nothing to
  // charge" and the caller runs the ordinary flock behaviour instead.
  function updateSoldierChicken(c, dt) {
    // Fuse already lit — nothing stops it now, not even the target dying.
    if ((c.fuseT || 0) > 0) {
      c.fuseT -= dt;
      c.vx = 0; c.vy = 0;
      c.bob += dt * 26; // frantic last-second flapping
      if (c.fuseT <= 0) detonateSoldierChicken(c);
      return true;
    }
    let target = null, best = SOLDIER_SEEK_R * SOLDIER_SEEK_R;
    for (const w of wolves) {
      // Airborne parachuters can't be reached, and a corpse isn't a target.
      if (!w.alive || w.parachuting) continue;
      const d = dist2(c.x, c.y, w.x, w.y);
      if (d < best) { best = d; target = w; }
    }
    if (!target) return false; // no war on right now — behave like a chicken
    const dx = target.x - c.x, dy = target.y - c.y;
    const m = Math.hypot(dx, dy) || 1;
    if (m <= SOLDIER_FUSE_R) {
      c.fuseT = SOLDIER_FUSE_T;
      c.vx = 0; c.vy = 0;
      playFuseHiss();
      return true;
    }
    c.vx = (dx / m) * SOLDIER_SPEED;
    c.vy = (dy / m) * SOLDIER_SPEED;
    c.fleeT = 0;        // a soldier never panics
    c.flutterT = 0;     // and never flutters home
    const sSvx = c.vx - c.vy;
    if (Math.abs(sSvx) > 0.05) c.facingLeft = sSvx < 0;
    // Chickens phase through fences, so this is a plain step + clamp like the
    // ordinary movement path. No fatMul: a soldier is never fat.
    c.x = clamp(c.x + c.vx * dt, -HALF_MAP + 1, HALF_MAP - 1);
    c.y = clamp(c.y + c.vy * dt, -HALF_MAP + 1, HALF_MAP - 1);
    c.bob += dt * 16;
    return true;
  }
  // The TNT goes off. Hurts the pack only — the keeper gave this bird its
  // orders, so it won't take their hats off with it. (The crate's own
  // booby-trapped payload is the thing that bites the player; see
  // openSupplyCrate.)
  function detonateSoldierChicken(c) {
    if (c.soldierDetonated) return;
    c.soldierDetonated = true;
    // Count the death before the blast can clear the wave. killChicken also
    // calls this on an enemy kill; the guard prevents a second detonation.
    killChicken(c, true);
    spawnBlast(c.x, c.y);
    spawnSmoke(c.x, c.y, 8);
    spawnScorch(c.x, c.y);
    playExplosion();
    shake = Math.max(shake, 0.34);
    const r2 = SOLDIER_BLAST_R * SOLDIER_BLAST_R;
    for (const w of wolves) {
      if (!w.alive) continue;
      if (dist2(w.x, w.y, c.x, c.y) >= r2) continue;
      const dx = w.x - c.x, dy = w.y - c.y;
      const m = Math.hypot(dx, dy) || 1;
      hurtWolf(w, SOLDIER_BLAST_DMG, (dx / m) * 0.38, (dy / m) * 0.38);
    }
    // hurtWolf checks wave completion whenever the blast kills a wolf.
  }

  // Fat Chickens at max tier: a slain chicken may burst, blasting nearby
  // wolves with area damage. Called from every spot a chicken can die.
  function explodeChickenMaybe(c) {
    if (fatTierOf(c) < FAT_MAX) return;
    if (Math.random() >= FAT_EXPLODE_CHANCE) return;
    spawnBlast(c.x, c.y);
    playExplosion();
    shake = Math.max(shake, 0.35);
    const r2 = FAT_EXPLODE_R * FAT_EXPLODE_R;
    for (const w of wolves) {
      if (!w.alive) continue;
      if (dist2(w.x, w.y, c.x, c.y) < r2) {
        const dx = w.x - c.x, dy = w.y - c.y;
        const m = Math.hypot(dx, dy) || 1;
        hurtWolf(w, FAT_EXPLODE_DMG, (dx / m) * 0.35, (dy / m) * 0.35);
      }
    }
  }

  // True if (x,y) lands inside any fence's tile — wolves can't enter, but slide
  // along and walk around. Pellets, the player and chickens pass freely.
  function fenceBlocks(x, y) {
    for (const f of fences) {
      if (Math.abs(x - f.x) < 0.52 && Math.abs(y - f.y) < 0.52) return true;
    }
    return false;
  }

  // Axis-separated fence-collision step for a wolf-like mover (anything with
  // x/y/vx/vy). Mirrors the geometry of the main updateWolf collision so
  // every wolf variant respects walls the same way. Returns true if a fence
  // physically blocked the wolf this frame.
  function moveWithFences(w, dt) {
    const stepX = w.x + w.vx * dt, stepY = w.y + w.vy * dt;
    const wInside = fenceBlocks(w.x, w.y);
    const xClear = !fenceBlocks(stepX, w.y);
    const yClear = !fenceBlocks(w.x, stepY);
    const diagClear = !fenceBlocks(stepX, stepY);
    const xAllowed = wInside || (xClear && (!yClear || diagClear));
    const yAllowed = wInside || (yClear && (!xClear || diagClear));
    let hit = false;
    if (xAllowed) w.x = stepX; else hit = true;
    if (yAllowed) w.y = stepY; else hit = true;
    w.x = clamp(w.x, -HALF_MAP + 1, HALF_MAP - 1);
    w.y = clamp(w.y, -HALF_MAP + 1, HALF_MAP - 1);
    return hit;
  }

  // The fence nearest to (x,y), or null.
  function nearestFence(x, y) {
    let best = null, bd = Infinity;
    for (const f of fences) {
      const d = dist2(x, y, f.x, f.y);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  // Seconds a wolf must be fence-blocked before it gives up and sieges fences.
  const SIEGE_DELAY = 5;

  // Bomb wolf AI: ignore everything but walls — beeline to the nearest one and
  // detonate, tearing it down. With no walls left it just leaves the map.
  function updateBombWolf(w, dt) {
    if (!w.alive) return;
    if (w.hurtT > 0) w.hurtT -= dt;
    // A lit fuse trails smoke.
    w.smokeT -= dt;
    if (w.smokeT <= 0) { w.smokeT = 0.16; spawnSmoke(w.x, w.y, 1); }
    // Aim for the nearest wall.
    let target = null, nd = Infinity;
    for (const f of fences) {
      const d = dist2(f.x, f.y, w.x, w.y);
      if (d < nd) { nd = d; target = f; }
    }
    if (target && nd <= BOMB_REACH * BOMB_REACH) {
      // Reached a wall — detonate: the blast tears it down. Drop a debris
      // pile on the tile so a worker chicken can rebuild it this wave.
      const fi = fences.indexOf(target);
      if (fi >= 0) fences.splice(fi, 1);
      spawnFenceDebris(target);
      spawnBlast(target.x, target.y);
      playExplosion();
      spawnSmoke(target.x, target.y, 9);
      shake = Math.max(shake, 0.4);
      explosionHitKeepers(target.x, target.y, BOMB_BLAST_KEEPER_R);
      w.alive = false;
      corpses.push({ x: w.x, y: w.y, kind: 'wolf', t: 5 });
      checkWaveDefended();
      return;
    }
    let tx, ty;
    if (target) {
      tx = target.x; ty = target.y;
    } else {
      // No walls left — head off the nearest map edge and vanish.
      const r = HALF_MAP;
      const dl = w.x + r, dr = r - w.x, dd = w.y + r, du = r - w.y;
      const md = Math.min(dl, dr, dd, du);
      if (md === dl)      { tx = -r; ty = w.y; }
      else if (md === dr) { tx = r;  ty = w.y; }
      else if (md === dd) { tx = w.x; ty = -r; }
      else                { tx = w.x; ty = r; }
    }
    const dx = tx - w.x, dy = ty - w.y;
    const m = Math.hypot(dx, dy) || 1;
    w.vx = (dx / m) * BOMB_WOLF_SPEED;
    w.vy = (dy / m) * BOMB_WOLF_SPEED;
    // Bomb wolves reach BOMB_REACH (0.8) before the fence's 0.52 collision
    // radius, so they detonate on contact with their target fence — but other
    // fences they pass should still stop them.
    moveWithFences(w, dt);
    const wSvx = w.vx - w.vy;
    if (Math.abs(wSvx) > 0.05) w.facingLeft = wSvx < 0;
    if (!target && (w.x <= -HALF_MAP + 1 || w.x >= HALF_MAP - 1 ||
                    w.y <= -HALF_MAP + 1 || w.y >= HALF_MAP - 1)) {
      w.alive = false;
      checkWaveDefended();
    }
  }

  // Pup: a tiny, fast wolf that just wanders. Doesn't attack, doesn't aggro.
  // Keeps the wave alive until the player guns it down.
  // A pup nipping a keeper that wandered too close — knocks one hat off, same
  // pack-bite cooldown as a full wolf. Flying / cloaked keepers dodge it.
  function pupBiteKeeper(keeper) {
    if ((keeper.flightT || 0) > 0 || keeper.lastStandStealth) return;
    if (keeper.wolfHitT > 0) return; // still in the shared bite cooldown
    keeper.wolfHitT = iframesFor(keeper);
    keeper.hurtT = 0.22;
    shake = Math.max(shake, 0.16);
    playKeeperHit();
    breakLastStand(keeper);
    if (keeperDodgesHatLoss(keeper)) return; // hidden dodge — kept the hat
    if (keeper === player) {
      if (immortal && playerHats <= 1) return; // Immortal holds the last hat (silently)
      const lost = hatColors[hatColors.length - 1];
      playerHats--;
      hatColors.pop();
      onHatLost(lost);
      if (playerHats <= 0) killKeeper(player, 'host', 'wolf');
    } else if (keeper === player2) {
      player2.hats--;
      if (Array.isArray(player2.hatColors)) player2.hatColors.pop();
      if (player2.hats <= 0) killKeeper(player2, 'guest', 'wolf');
    }
  }

  // A trapped pup that couldn't slip off the map cooks off where it stands —
  // a real blast that tears into nearby wolves and knocks a too-close keeper's
  // hat. Then the pup is gone (no corpse) and the wave may clear.
  function explodePup(w) {
    spawnBlast(w.x, w.y);
    playExplosion();
    shake = Math.max(shake, 0.3);
    const r2 = PUP_EXPLODE_R * PUP_EXPLODE_R;
    for (const o of wolves) {
      if (!o.alive || o === w) continue;
      if (dist2(o.x, o.y, w.x, w.y) < r2) {
        const dx = o.x - w.x, dy = o.y - w.y, m = Math.hypot(dx, dy) || 1;
        hurtWolf(o, PUP_EXPLODE_DMG, (dx / m) * 0.35, (dy / m) * 0.35);
      }
    }
    // Catch any keeper standing in the blast — same hat-knock as a pup bite.
    for (const k of [player, player2]) {
      if (!k || (k === player2 && !player2.active) || k.ghost) continue;
      if (dist2(k.x, k.y, w.x, w.y) < r2) { k.wolfHitT = 0; pupBiteKeeper(k); }
    }
    w.alive = false;
    checkWaveDefended(); // it removed itself — the wave may now be clear
  }

  function updatePupWolf(w, dt) {
    if (!w.alive) return;
    if (w.hurtT > 0) w.hurtT -= dt;
    if (w.invulnT > 0) w.invulnT -= dt;
    if (w.attackT > 0) w.attackT -= dt;
    // After its lifetime the pup loses interest and scampers off the nearest
    // map edge, then slips away (no corpse, no toast).
    w.lifeT = (w.lifeT || 0) + dt;
    if (w.lifeT > PUP_LIFETIME) w.leaving = true;
    if (w.leaving) {
      // Track how long it's been trying to leave. Walls (or a fenced-in pocket)
      // can trap it short of the edge — if it can't slip away within
      // PUP_LEAVE_EXPLODE seconds, it gets frustrated and cooks off.
      w.leaveT = (w.leaveT || 0) + dt;
      if (w.leaveT > PUP_LEAVE_EXPLODE) { explodePup(w); return; }
      const r = HALF_MAP - 1;
      const dl = w.x + r, dr = r - w.x, dd = w.y + r, du = r - w.y;
      const md = Math.min(dl, dr, dd, du);
      let tx = w.x, ty = w.y;
      if (md === dl) tx = -r; else if (md === dr) tx = r; else if (md === dd) ty = -r; else ty = r;
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy) || 1;
      w.vx = (dx / d) * PUP_SPEED * 1.2;
      w.vy = (dy / d) * PUP_SPEED * 1.2;
      moveWithFences(w, dt);
      const sv = w.vx - w.vy;
      if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
      if (Math.abs(w.x) > HALF_MAP - 1.2 || Math.abs(w.y) > HALF_MAP - 1.2) {
        w.alive = false;
        checkWaveDefended(); // it left the field — the wave may now be clear
      }
      return;
    }
    // If a keeper strays inside the pup's small aggro range it goes feral —
    // its eye reddens (aggroT) and it charges in to bite. Otherwise it just
    // zips around harmlessly like before.
    const keeper = nearestKeeper(w.x, w.y);
    if (keeper && dist2(keeper.x, keeper.y, w.x, w.y) < PUP_AGGRO_R * PUP_AGGRO_R) {
      w.aggroT = 0.5; // keeps the eye red while chasing
      const dx = keeper.x - w.x, dy = keeper.y - w.y;
      const d = Math.hypot(dx, dy) || 1;
      w.vx = (dx / d) * PUP_SPEED;
      w.vy = (dy / d) * PUP_SPEED;
      moveWithFences(w, dt);
      if (d < 0.6 && w.attackT <= 0) {
        w.attackT = 0.7;
        pupBiteKeeper(keeper);
      }
      const sv = w.vx - w.vy;
      if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
      return;
    }
    if (w.aggroT > 0) w.aggroT -= dt;
    w.wanderT -= dt;
    if (w.wanderT <= 0) {
      w.wanderT = PUP_WANDER_SWITCH + rand(-0.2, 0.4);
      w.wanderDir = Math.random() * Math.PI * 2;
    }
    const sp = PUP_SPEED;
    w.vx = Math.cos(w.wanderDir) * sp;
    w.vy = Math.sin(w.wanderDir) * sp;
    // Pups bounce off walls and the map edge by flipping their wander dir.
    const pupHit = moveWithFences(w, dt);
    if (pupHit) w.wanderDir += Math.PI;
    if (w.x <= -HALF_MAP + 1 || w.x >= HALF_MAP - 1 ||
        w.y <= -HALF_MAP + 1 || w.y >= HALF_MAP - 1) {
      w.wanderDir += Math.PI;
    }
    const wSvx = w.vx - w.vy;
    if (Math.abs(wSvx) > 0.05) w.facingLeft = wSvx < 0;
  }

  // Missile wolf (wave 51+). Ambles a short way in, plants itself, then
  // bombards coops with twin rockets after a long telegraphed wind-up. It never
  // chases a keeper — the menace is to the coops — so it can be run down and
  // shot before the next salvo lands. Killable via the normal pellet/hurt path.
  // Hunter wolf — fires a shotgun spread that mirrors the player's CURRENT
  // weapon (pellet count + spread). Tagged shooter:'wolf' so the rounds knock a
  // keeper's hat and kill chickens, but pass harmlessly through other wolves.
  function hunterWolfFire(w, tx, ty) {
    playShotgun();
    const ang = Math.atan2(ty - w.y, tx - w.x);
    const count = w.fireCount || Math.max(3, pelletCount);
    const spread = w.fireSpread || shotgunSpread;
    const color = w.gunColor || '#ff6a3a';
    const speed = 13;
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
      const a = ang + t * spread + rand(-0.04, 0.04);
      pellets.push({
        x: w.x + Math.cos(ang) * 0.6, y: w.y + Math.sin(ang) * 0.6,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.7, dmg: 0, pierce: 1, r: 2.2,
        color, trail: true, shooter: 'wolf',
      });
    }
    w.muzzleT = 0.08; // brief muzzle flash
  }

  // Hunter wolf AI — strolls the field like a keeper: picks a behaviour (hunt
  // the player, hunt chickens, or just roam), keeps a shooter's standoff, faces
  // its target, and racks off the player's shotgun on a cooldown.
  // After losing a hat the hunter wolf bolts to a safe spot — away from every
  // keeper, out toward the map edge — while a brief shield (invulnT) holds, then
  // it charges back in. Reuses the existing flee state the AI already drives.
  function hunterWolfRetreat(w) {
    const k = nearestKeeper(w.x, w.y);
    const ang = k ? Math.atan2(w.y - k.y, w.x - k.x) + rand(-0.5, 0.5)
                  : Math.random() * Math.PI * 2;
    const dist = rand(8, 12);
    w.fleeTX = clamp(w.x + Math.cos(ang) * dist, -HALF_MAP + 2, HALF_MAP - 2);
    w.fleeTY = clamp(w.y + Math.sin(ang) * dist, -HALF_MAP + 2, HALF_MAP - 2);
    w.fleeT = HUNTER_WOLF_RETREAT;
    w.invulnT = HUNTER_WOLF_RETREAT; // invincible for the whole scramble
    w.attackT = Math.max(w.attackT || 0, 0.4);
  }

  function updateHunterWolf(w, dt) {
    if (w.hurtT > 0) w.hurtT -= dt;
    if (w.invulnT > 0) w.invulnT -= dt; // brief shield while retreating after a hat loss
    if (w.attackT > 0) w.attackT -= dt;
    if (w.muzzleT > 0) w.muzzleT -= dt;
    if (w.hitDebounceT > 0) w.hitDebounceT -= dt; // i-frames between hat losses
    if (w.reactCdT > 0) w.reactCdT -= dt;
    w.walkT = (w.walkT || 0) + dt * 8;
    // Mid-bolt: a panic dash to a fresh spot (it ignores everything else).
    if (w.fleeT > 0) {
      w.fleeT -= dt;
      const dx = w.fleeTX - w.x, dy = w.fleeTY - w.y, d = Math.hypot(dx, dy) || 1;
      w.vx = (dx / d) * 5.5; w.vy = (dy / d) * 5.5; // fast scramble
      const sv = w.vx - w.vy; if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
      moveWithFences(w, dt);
      return;
    }
    // Panic reaction when a keeper crowds it: usually snap off a shot, sometimes
    // bolt to a fresh position farther away.
    const near = nearestKeeper(w.x, w.y);
    if (near && w.reactCdT <= 0 && dist2(near.x, near.y, w.x, w.y) < 2.6 * 2.6) {
      w.reactCdT = rand(0.9, 1.8); // snappier reactions — more aggressive
      if (Math.random() < 0.85) {  // far more likely to fire than bolt
        const dx = near.x - w.x, dy = near.y - w.y;
        const sdx = (dx - dy) * TILE_W / 2, sdy = (dx + dy) * TILE_H / 2;
        w.aimDir = Math.atan2(sdy, sdx);
        if (Math.abs(dx - dy) > 0.05) w.facingLeft = (dx - dy) < 0;
        hunterWolfFire(w, near.x, near.y);
        w.attackT = rand(0.5, 0.9);
      } else {
        const ang = Math.atan2(w.y - near.y, w.x - near.x) + rand(-0.8, 0.8); // away from the keeper
        const dist = rand(6, 10);
        w.fleeTX = clamp(w.x + Math.cos(ang) * dist, -HALF_MAP + 2, HALF_MAP - 2);
        w.fleeTY = clamp(w.y + Math.sin(ang) * dist, -HALF_MAP + 2, HALF_MAP - 2);
        w.fleeT = rand(0.7, 1.1);
        return;
      }
    }
    // Re-pick a behaviour every few seconds.
    w.modeT = (w.modeT || 0) - dt;
    if (w.modeT <= 0) {
      w.modeT = rand(2.5, 5);
      const r = Math.random();
      w.mode = r < 0.72 ? 'player' : (r < 0.92 ? 'chicken' : 'roam'); // hunts keepers far more
    }
    // Resolve a target from the current mode.
    let tx = null, ty = null;
    if (w.mode === 'player') {
      const k = nearestKeeper(w.x, w.y);
      if (k) { tx = k.x; ty = k.y; }
    } else if (w.mode === 'chicken') {
      let best = null, bd = Infinity;
      for (const c of chickens) {
        if (!c.alive || (c.carrier && c.carrier.alive) || c.suckedBy) continue;
        const d = dist2(c.x, c.y, w.x, w.y);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) { tx = best.x; ty = best.y; }
    }
    const spd = 2.9 * coldSlowMul(w); // closes ground faster now
    if (tx !== null) {
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy) || 1;
      const standoff = 3.5; // presses in closer than before
      if (d > standoff + 0.7)      { w.vx = (dx / d) * spd;       w.vy = (dy / d) * spd; }
      else if (d < standoff - 0.7) { w.vx = -(dx / d) * spd * 0.8; w.vy = -(dy / d) * spd * 0.8; }
      else                         { w.vx = 0; w.vy = 0; }
      const sdx = (dx - dy) * TILE_W / 2, sdy = (dx + dy) * TILE_H / 2;
      w.aimDir = Math.atan2(sdy, sdx);
      if (Math.abs(dx - dy) > 0.05) w.facingLeft = (dx - dy) < 0;
      // Don't shoot a keeper who's a ghost / cloaked (the target went away).
      if (w.attackT <= 0 && d < 10) { w.attackT = rand(0.7, 1.2); hunterWolfFire(w, tx, ty); }
    } else {
      // Roam — wander around like an idle keeper.
      w.wanderT = (w.wanderT || 0) - dt;
      if (w.wanderT <= 0) { w.wanderT = rand(0.8, 1.8); w.wanderDir = Math.random() * Math.PI * 2; }
      w.vx = Math.cos(w.wanderDir) * spd * 0.7; w.vy = Math.sin(w.wanderDir) * spd * 0.7;
      const sv = w.vx - w.vy; if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
    }
    const hit = moveWithFences(w, dt);
    if (hit) { w.wanderDir = Math.random() * Math.PI * 2; } // bounce off walls when roaming
  }

  function updateMissileWolf(w, dt) {
    if (w.hurtT > 0) w.hurtT -= dt;
    w.walkT = (w.walkT || 0) + dt * 4;
    if (w.missilePhase === 'entering') {
      // Lumber toward the map centre so it doesn't plant right on the edge.
      const d = Math.hypot(w.x, w.y) || 1;
      w.vx = (-w.x / d) * 1.1; w.vy = (-w.y / d) * 1.1;
      moveWithFences(w, dt);
      const sv = w.vx - w.vy;
      if (Math.abs(sv) > 0.05) w.facingLeft = sv < 0;
      w.settleT -= dt;
      if (w.settleT <= 0 || d < 6) {
        w.missilePhase = 'arming';
        w.missileChargeT = MISSILE_WOLF_CHARGE;
        w.missileTargetCoop = pickMissileCoop();
      }
      return;
    }
    // Planted — never moves again. Stand and bombard.
    w.vx = 0; w.vy = 0;
    if (coops.length === 0) { w.missileChargeT = 1.0; return; } // nothing to bomb
    if (!w.missileTargetCoop || !coops.includes(w.missileTargetCoop)) {
      w.missileTargetCoop = pickMissileCoop();
    }
    // Face the coop it's bombarding.
    if (w.missileTargetCoop) {
      const dx = w.missileTargetCoop.x - w.x, dy = w.missileTargetCoop.y - w.y;
      if (Math.abs(dx - dy) > 0.05) w.facingLeft = (dx - dy) < 0;
    }
    w.missileChargeT -= dt;
    // Charge sparks during the visible wind-up (the last MISSILE_WOLF_CHARGE s).
    if (w.missileChargeT <= MISSILE_WOLF_CHARGE) {
      w.missileSparkT = (w.missileSparkT || 0) - dt;
      if (w.missileSparkT <= 0) {
        w.missileSparkT = 0.13;
        spawnSmoke(w.x + rand(-0.9, 0.9), w.y - 1.6 + rand(-0.4, 0.4), 1);
      }
    }
    if (w.missileChargeT <= 0) {
      spawnMissilePair(w.x, w.y - 0.4, w.missileTargetCoop);
      w.missileTargetCoop = pickMissileCoop();
      // A short cooldown, then the next long wind-up.
      w.missileChargeT = MISSILE_WOLF_CHARGE + MISSILE_WOLF_COOLDOWN;
    }
  }

  // Ranged: walks into the map, "sits" once it has cleared the edge, then
  // fires red pellets at the nearest live player or chicken on a cooldown.
  function updateRangedWolf(w, dt) {
    if (!w.alive) return;
    if (w.hurtT > 0) w.hurtT -= dt;
    w.phaseT += dt;
    if (w.phase === 'entering') {
      const m = Math.hypot(w.x, w.y) || 1;
      const sp = RANGED_SPEED;
      w.vx = (-w.x / m) * sp;
      w.vy = (-w.y / m) * sp;
      moveWithFences(w, dt);
      if (Math.abs(w.x) < HALF_MAP - RANGED_SETTLE_DIST &&
          Math.abs(w.y) < HALF_MAP - RANGED_SETTLE_DIST) {
        w.phase = 'sitting';
        w.phaseT = 0;
        w.vx = 0; w.vy = 0;
      }
    } else {
      w.vx = 0; w.vy = 0;
      // Telegraphed laser: once locked onto a spot, count down then fire there.
      if (w.laserLockT > 0) {
        w.laserLockT -= dt;
        if (w.laserLockT <= 0) { w.laserLockT = 0; rangedWolfFireAt(w, w.laserLockX, w.laserLockY); }
      }
      w.fireT -= dt;
      // Pick the closest live target. Keepers are only considered when
      // within RANGED_PLAYER_RANGE2 so a ranged wolf parked on the far edge
      // can't snipe the keeper across the whole map.
      let target = null, nd = Infinity;
      const keeper = nearestKeeper(w.x, w.y);
      if (keeper) {
        const d = dist2(keeper.x, keeper.y, w.x, w.y);
        if (d < RANGED_PLAYER_RANGE2 && d < nd) { nd = d; target = keeper; }
      }
      for (const c of chickens) {
        if (!c.alive) continue;
        const d = dist2(c.x, c.y, w.x, w.y);
        if (d < nd) { nd = d; target = c; }
      }
      if (target) {
        const dx = target.x - w.x, dy = target.y - w.y;
        const ang = Math.atan2(dy, dx);
        const range = Math.hypot(dx, dy);
        if (Math.abs(dx - dy) > 0.05) w.facingLeft = (dx - dy) < 0;
        // Screen-space aim is what the gun visually rotates by. World deltas
        // are projected through the iso transform so the gun matches the beam
        // even though the canvas is rendered in screen coords.
        const sdx = (dx - dy) * TILE_W / 2;
        const sdy = (dx + dy) * TILE_H / 2;
        w.aimDir = Math.atan2(sdy, sdx);
        if (w.fireT <= 0 && !(w.laserLockT > 0)) {
          if (w.homer) { w.fireT = HOMER_FIRE_COOLDOWN; homerWolfFire(w, ang); }
          else {
            w.fireT = RANGED_FIRE_COOLDOWN;
            // Telegraph: lock onto the target's spot now, fire LASER_LOCK_TIME
            // later so it can be dodged. The wolf always commits to the shot now
            // (no more 50% miss roll) — the ~5s cooldown is the breather.
            w.laserLockX = target.x; w.laserLockY = target.y; w.laserLockT = LASER_LOCK_TIME;
          }
        }
      }
    }
    const wSvx = w.vx - w.vy;
    if (Math.abs(wSvx) > 0.05) w.facingLeft = wSvx < 0;
  }

  // One slow red homing bullet from a ranged wolf — a wolf-owned pellet that
  // chases the nearest keeper for a few seconds before fizzling out. Knocks a
  // hat off on contact (handled by the shooter:'wolf' pellet path).
  function homerWolfFire(w, ang) {
    playLaser();
    pellets.push({
      x: w.x, y: w.y,
      vx: Math.cos(ang) * HOMER_BULLET_SPEED,
      vy: Math.sin(ang) * HOMER_BULLET_SPEED,
      life: HOMER_BULLET_LIFE,
      dmg: 0,            // wolf bullets knock a hat via applyWolfBulletHit, not dmg
      pierce: 1,
      r: 3,
      color: '#ff3a3a',  // red bullet
      trail: true,
      shooter: 'wolf',
      wolfHoming: true,
      homingTarget: nearestKeeper(w.x, w.y),
    });
  }

  // A laser wolf fires its (telegraphed) beam at the spot it locked onto — a
  // thin red segment, like the rooftopper's, so dodging it actually matters.
  function rangedWolfFireAt(w, tx, ty) {
    playLaser();
    const ang = Math.atan2(ty - w.y, tx - w.x);
    const r = Math.max(0.6, Math.hypot(tx - w.x, ty - w.y) + 0.5);
    const end = clipBeamAtWall(w.x, w.y, w.x + Math.cos(ang) * r, w.y + Math.sin(ang) * r);
    applyBeamDamage(w.x, w.y, end.x, end.y);
    beams.push({ x1: w.x, y1: w.y, x2: end.x, y2: end.y, t: 0, life: 0.22, color: '#ff2a22', thick: 0.45 });
  }

