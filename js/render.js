  // ---------- Render ----------
  // How red the sky burns, 0 (clear) .. 1 (full FANGUS). The dread builds over
  // the BOSS_SKY_BUILDUP_WAVES waves leading up to the boss so the fight is
  // visible on the horizon before it arrives, then the fight itself pins it.
  const BOSS_SKY_BUILDUP_WAVES = 2;
  function skyRedLevel() {
    // Picks up where the last build-up wave left off and deepens through the
    // intro as bossTint ramps, so there's no jump when the fight starts.
    if (bossWaveActive) {
      const floor = BOSS_SKY_BUILDUP_WAVES / (BOSS_SKY_BUILDUP_WAVES + 1);
      const lvl = Math.min(1, floor + (bossTint || 0) * (1 - floor));
      // bossSkyFade drains to 0 across the death cutscene, so the blood sky
      // bleeds back to a normal afternoon before the end screen appears.
      return lvl * bossSkyFade;
    }
    const away = BOSS_WAVE - wave; // waves still to survive before the boss
    if (away >= 1 && away <= BOSS_SKY_BUILDUP_WAVES) {
      return (BOSS_SKY_BUILDUP_WAVES + 1 - away) / (BOSS_SKY_BUILDUP_WAVES + 1);
    }
    return 0;
  }

  // ---- Weather particles -------------------------------------------------
  // Both live in SCREEN space and wrap around the viewport, so they cost the
  // same no matter how far the map has grown and never need culling.
  const RAIN_COUNT = 190;
  const SNOW_COUNT = 150;

  function updateWeatherParticles(dt) {
    if (raining()) {
      while (rainDrops.length < RAIN_COUNT) {
        rainDrops.push({ x: Math.random() * (W + 120) - 60, y: Math.random() * H,
                         len: 7 + Math.random() * 11, spd: 620 + Math.random() * 420 });
      }
      for (const d of rainDrops) {
        d.y += d.spd * dt;
        d.x -= d.spd * 0.22 * dt; // slanted by the wind
        if (d.y > H) { d.y = -d.len - Math.random() * 40; d.x = Math.random() * (W + 120) - 60; }
        if (d.x < -60) d.x += W + 120;
      }
    } else if (rainDrops.length) rainDrops.length = 0;

    if (snowing()) {
      while (snowFlakes.length < SNOW_COUNT) {
        snowFlakes.push({ x: Math.random() * W, y: Math.random() * H,
                          r: 0.8 + Math.random() * 1.8, spd: 18 + Math.random() * 34,
                          sway: 6 + Math.random() * 16, phase: Math.random() * Math.PI * 2 });
      }
      for (const f of snowFlakes) {
        f.y += f.spd * dt;
        f.phase += dt * 1.6;
        if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
      }
    } else if (snowFlakes.length) snowFlakes.length = 0;
  }

  function drawWeather() {
    if (raining()) {
      ctx.save();
      // A cold grey wash so the whole farm reads as overcast, then the drops.
      ctx.fillStyle = 'rgba(40, 56, 78, 0.26)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(176, 208, 236, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of rainDrops) {
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * 0.22, d.y + d.len);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (snowing()) {
      ctx.save();
      // Pale, flat daylight — the blizzard washes the colour out of everything.
      ctx.fillStyle = 'rgba(206, 224, 240, 0.20)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      for (const f of snowFlakes) {
        const fx = f.x + Math.sin(f.phase) * f.sway;
        ctx.beginPath();
        ctx.arc(fx, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Boot-prints pressed into the snow, fading as they fill back in. Drawn
  // flat on the ground right after the tiles so everything walks over them.
  function drawSnowTrails() {
    ctx.save();
    for (const s of snowTrails) {
      const p = worldToScreen(s.x, s.y);
      const a = Math.max(0, s.t / s.life) * 0.5;
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#9fb1c4'; // packed-down snow reads darker than fresh
      ctx.save();
      ctx.translate(p.x, p.y + TILE_H / 2);
      ctx.rotate(s.ang);
      const w = s.big ? 2.6 : 2.0, h = s.big ? 1.5 : 1.1;
      // Two small prints side by side — a pair of feet, not a smear.
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.9, w, h, 0, 0, Math.PI * 2);
      ctx.ellipse(0,  h * 0.9, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // A cap of settled snow sitting on top of something, drawn as a squashed
  // white ellipse. Used for tree crowns and coop roofs during a blizzard.
  function drawSnowCap(cx, cy, rx, ry) {
    ctx.save();
    ctx.fillStyle = 'rgba(248, 252, 255, 0.92)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function render() {
    // Sky / background. Rebuilt on resize (skyGrad nulled) and whenever the
    // boss-red level moves — quantised so a smooth ramp doesn't allocate a new
    // gradient every single frame.
    const redLvl = skyRedLevel();
    const redKey = Math.round(redLvl * 40); // 2.5% steps
    if (!skyGrad || redKey !== skyGradRedKey) {
      skyGradRedKey = redKey;
      const f = redKey / 40;
      skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0,   mixHex('#7ec7ff', '#6e0f08', f)); // blue   → deep blood sky
      skyGrad.addColorStop(0.6, mixHex('#bfe6a8', '#c23a1b', f)); // haze   → ember band
      skyGrad.addColorStop(1,   mixHex('#5fa15a', '#5e2113', f)); // grass  → scorched earth
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Suppress the camera shake once the player has lost — the game-over
    // panel reads cleaner when the scoreboard isn't jittering underneath.
    const shakeActive = shake > 0 && !gameOver;
    const sx = shakeActive ? (Math.random() - 0.5) * shake * 14 : 0;
    const sy = shakeActive ? (Math.random() - 0.5) * shake * 14 : 0;
    ctx.save();
    ctx.translate(sx, sy);

    drawGround();
    if (snowTrails.length) drawSnowTrails(); // on the ground, under everything
    drawEntities();
    drawLaserPreviews(); // red telegraph lines for locking lasers (wolf + boss)
    if (wolfScrap.length) drawWolfScrap();
    if (bossWaveActive) drawChickenSuckers();
    if (bossBurstChickens.length) drawBossBurstChickens();
    drawBossMissiles(); // boss + missile-wolf rockets (drawn any wave)
    if (rocketLaunch) drawRocketLaunch(); // post-boss restart cutscene
    drawBuildPreview(player);
    if (player2.active) drawBuildPreview(player2);
    // Night-of-the-Wolf darkness: a thick blue overlay with bright cutouts
    // wherever a light source sits. Drawn inside the shake transform so the
    // light pools jitter together with the rest of the scene.
    if (nightOfWolf) drawNightOverlay();

    ctx.restore();

    // Rain/snow sit outside the shake transform: the weather is "on the
    // camera", so it shouldn't jitter along with the world.
    if (weather) drawWeather();

    // Boss wave: a dusk-orange wash over everything, deepening through the
    // intro, plus the boss health bar while it's actively fighting.
    // Red sky. The ground covers almost the whole viewport from mid-map, so
    // tinting the sky gradient alone is invisible unless you're at the edge —
    // this wash is what actually sells it. It's a vertical gradient, heaviest
    // at the top where the horizon sits and thinning toward the camera, so it
    // reads as a blood sky hanging over the farm instead of the flat full-
    // screen filter this replaces. Driven by skyRedLevel(), so it also covers
    // the build-up waves, not just the fight.
    if (redLvl > 0) {
      if (!redWashGrad || redKey !== redWashKey) {
        redWashKey = redKey;
        const f = redKey / 40;
        redWashGrad = ctx.createLinearGradient(0, 0, 0, H);
        redWashGrad.addColorStop(0,    'rgba(150, 18,  8, ' + (0.72 * f).toFixed(3) + ')');
        redWashGrad.addColorStop(0.45, 'rgba(190, 48, 18, ' + (0.40 * f).toFixed(3) + ')');
        redWashGrad.addColorStop(1,    'rgba(120, 30, 14, ' + (0.18 * f).toFixed(3) + ')');
      }
      ctx.save();
      ctx.fillStyle = redWashGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (bossWaveActive && boss && boss.alive && bossPhase === 'fight') drawBossHealthBar();
    if (endScreen) { drawBossEndScreen(); return; }
    // Clear button rects when we're not on a game-over or end screen.
    if (!gameOver && !endScreen) gameOverBtnRects = null;
    if (!paused) pauseBtnRects = null;

    if (upgradeMode) {
      if (multiplayer && !isHost) {
        // Guest's view. A guest ghost skips its own pick — show a wait card.
        if (player.ghost) drawUpgradeWaitOverlayGhost();
        else if (gameOpts.individualUpgrades) drawUpgradeWindowP2();
        else drawUpgradeWaitOverlay();
      } else if (player.ghost) {
        // Host is a ghost — they don't pick. Surface the same wait overlay
        // so they know the buddy is taking the upgrade.
        drawUpgradeWaitOverlayGhost();
      } else if (upgradePicked && multiplayer && isHost && gameOpts.individualUpgrades && !upgradePicked2) {
        // Host has already picked but buddy hasn't — show a wait overlay.
        drawUpgradeWaitOverlayHostWait();
      } else {
        drawUpgradeWindow();
      }
    } else if (multiplayer && !isHost && hostPaused) {
      // Surface the host's pause state so the guest knows why everything stopped.
      drawHostPausedOverlay();
    }
    // Lag warning: if the guest hasn't received a snapshot in >0.8s, blink a banner.
    if (multiplayer && !isHost && !netDisconnected && lastSnapshotReceivedT > 0.8) {
      drawLagWarning();
    }

    // Unlock banner — under the pause / upgrade panels, over the world.
    if (!upgradeMode && !gameOver && !endScreen) drawUnlockNotice();

    if (paused) {
      drawPauseWindow();
    }

    if (gameOver && gameOverPanelDelayT <= 0 && !rocketLaunch) drawGameOverPanel();

    // Kill-combo floating label — "x5", "x6", etc. in red, floats up from kill position.
    if (comboFloat && gameStarted && !inMenu) {
      const sp = worldToScreen(comboFloat.wx, comboFloat.wy);
      const ty = sp.y + TILE_H / 2 + comboFloat.screenYOff;
      const alpha = Math.min(1, comboFloat.alpha);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 14px "Lucida Console", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c04030';
      ctx.fillText(comboFloat.text, sp.x, ty);
      ctx.restore();
    }
    // Aim contrast ring — drawn on top of everything so the crosshair cursor
    // is readable against any background (dark shadow ring + bright inner ring).
    const SHOW_AIM_RING = false; // set true to re-enable
    if (SHOW_AIM_RING && !isMobileMode && !inMenu) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.88)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    drawFade(); // black screen wipe sits on top of everything
  }

  // Side-by-side end-of-run scoreboard. In single-player only one column is
  // shown. Stats are read off the keeper objects (kills, deaths, karma) plus
  // each player's upgrade ladder (Longer Barrel range, fire rate, etc.) so
  // both keepers can compare the run they just played.
  // Boss health bar — a wide crimson bar across the BOTTOM (clear of the
  // top-centre toasts), label sitting just above it.
  function drawBossHealthBar() {
    if (!boss) return;
    const bw = Math.min(520, W - 60), bh = 16;
    const bx = (W - bw) / 2, by = H - 34;
    const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, bh + 6);
    ctx.fillStyle = '#2a0a0e';
    ctx.fillRect(bx, by, bw, bh);
    const grd = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grd.addColorStop(0, '#ff3a2a'); grd.addColorStop(1, '#a01018');
    ctx.fillStyle = grd;
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.strokeStyle = '#ffcaa0'; ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(bossName(), W / 2, by - 6);
    ctx.restore();
  }

  // Endscreen after the boss dies — the same scoreboard panel as the death
  // screen, only the top title and bottom hint change.
  function drawBossEndScreen() {
    let footer;
    if (multiplayer && !isHost) {
      footer = 'The host decides — C continue / R ask for a rematch';
    } else if (multiplayer && isHost && guestWantsRestart) {
      footer = 'Buddy is ready!   R / F5 — restart (with a bonus!)   C — keep going';
    } else {
      footer = 'C / Enter — keep going (Wave 51+)     R / F5 — restart (with a bonus!)';
    }
    drawGameOverPanel({
      title: 'FANGUS MK-04 DESTROYED',
      titleColor: '#ff8a4a',
      subtitle: 'Wave 50 conquered — carry on into the endless waves, or restart for a mystery bonus.',
      footer: footer,
      footerColor: '#9fe6a0',
    });
  }

  function drawGameOverPanel(opts) {
    opts = opts || {};
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, H);

    // Proportional header positions so the panel fits any screen size.
    const titleY    = Math.max(40, Math.round(H * 0.10));
    const subtitleY = titleY + 28;
    const extraY    = subtitleY + 18;

    ctx.fillStyle = opts.titleColor || '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px "Lucida Console", Consolas, monospace';
    ctx.fillText(opts.title || 'GAME OVER', W / 2, titleY);
    ctx.font = '14px "Lucida Console", Consolas, monospace';
    ctx.fillStyle = '#d7d7d7';
    let msg = opts.subtitle || gameOverMsg || '';
    if (!opts.subtitle && multiplayer && gameOverCause) {
      if (gameOverCause === 'both') {
        msg = 'Both keepers fell!';
      } else {
        const youDied = (gameOverCause === 'host' && isHost) || (gameOverCause === 'guest' && !isHost);
        msg = youDied ? 'A wolf knocked off your last hat!' : 'Your buddy fell to a wolf!';
      }
    }
    if (msg) ctx.fillText(msg, W / 2, subtitleY);
    ctx.fillStyle = '#9aa0a8';
    ctx.font = '11px "Lucida Console", Consolas, monospace';
    ctx.fillText('Final wave: ' + (wave || '—') + '    Coops: ' + coops.length, W / 2, extraY);
    let panelTopY = extraY + 16;
    // Post-boss death: flag that a restart carries a bonus.
    if (passedBoss && !opts.subtitle) {
      ctx.fillStyle = '#9fe6a0';
      ctx.font = 'bold 12px "Lucida Console", Consolas, monospace';
      ctx.fillText('You passed the boss — restarting grants a bonus!', W / 2, panelTopY);
      panelTopY += 16;
    }

    // Stats grid.
    const showP2 = multiplayer && player2.active;
    const guestSide = multiplayer && !isHost;
    const localWallet  = (gameOpts.separateMoney && guestSide) ? money2 : money;
    const remoteWallet = (gameOpts.separateMoney && guestSide) ? money : money2;
    function statsFor(who, wallet, hats) {
      const lvls = lvlsFor(who);
      const barrelM = ((lvls.range || 0) * 0.1).toFixed(1) + ' m';
      return {
        Money:             '$' + wallet,
        Hats:              String(hats),
        'Wolves killed':   String(who.kills || 0),
        'Chickens killed': String(who.chickensShot || 0),
        Deaths:            String(who.deaths || 0),
        'Longer Barrel':   barrelM + ' (L' + (lvls.range || 0) + ')',
        'Cause of death':  who.deathCause ? who.deathCause : '—',
      };
    }
    const p1 = statsFor(player, localWallet, playerHats);
    const p2 = showP2 ? statsFor(player2, remoteWallet, player2.hats || 0) : null;
    const labels = Object.keys(p1);

    const rowH    = 19;
    const headerH = 30;
    const btnH    = 30;
    const btnGap  = 10;
    const isEndScr = !!opts.footer; // boss end screen passes a footer string
    // Singleplayer death also shows the RESPAWN button below the main button
    // row — reserve its height up front so it can't be pushed offscreen on
    // short (mobile landscape) screens.
    const respawnReserve = (!isEndScr && !multiplayer) ? 34 : 0; // 26 btn + 8 gap
    const panelW  = showP2 ? Math.min(560, W - 32) : Math.min(420, W - 32);
    const panelH  = headerH + labels.length * rowH + 24;
    const panelX  = Math.round((W - panelW) / 2);
    // Keep stats panel from overflowing: leave room for the buttons below.
    const panelY  = Math.min(panelTopY, H - panelH - btnH - 24 - respawnReserve);
    ctx.fillStyle = 'rgba(15, 18, 24, 0.96)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);

    const labelX = panelX + 16;
    const colP1X = panelX + Math.round(panelW * 0.55);
    const colP2X = panelX + Math.round(panelW * 0.82);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    ctx.fillText('SCOREBOARD', labelX, panelY + 18);
    ctx.textAlign = 'right';
    const col1Tag = (multiplayer && !isHost) ? 'YOU (P2)' : (multiplayer ? 'YOU (P1)' : 'YOU');
    const col2Tag = (multiplayer && !isHost) ? 'PARTNER (P1)' : 'PARTNER (P2)';
    ctx.fillText(col1Tag, colP1X, panelY + 18);
    if (showP2) ctx.fillText(col2Tag, colP2X, panelY + 18);
    ctx.strokeStyle = 'rgba(255,209,102,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 8, panelY + headerH - 2);
    ctx.lineTo(panelX + panelW - 8, panelY + headerH - 2);
    ctx.stroke();
    ctx.font = '13px "Lucida Console", Consolas, monospace';
    for (let i = 0; i < labels.length; i++) {
      const key = labels[i];
      const y = panelY + headerH + 14 + i * rowH;
      if (i & 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(panelX + 4, y - 13, panelW - 8, rowH);
      }
      ctx.fillStyle = '#9aa0a8';
      ctx.textAlign = 'left';
      ctx.fillText(key, labelX, y);
      const p1v = p1[key];
      const p2v = p2 ? p2[key] : null;
      const compareKeys = { Money: 1, 'Wolves killed': 1, Hats: 1, 'Chickens killed': -1, Deaths: -1 };
      let p1Color = '#fff', p2Color = '#fff';
      if (showP2 && compareKeys[key]) {
        const a = parseFloat(String(p1v).replace(/[^\-0-9.]/g, '')) || 0;
        const b = parseFloat(String(p2v).replace(/[^\-0-9.]/g, '')) || 0;
        const dir = compareKeys[key];
        if (a * dir > b * dir)      { p1Color = '#7fdc7f'; p2Color = '#d7d7d7'; }
        else if (b * dir > a * dir) { p1Color = '#d7d7d7'; p2Color = '#7fdc7f'; }
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = p1Color;
      ctx.fillText(String(p1v), colP1X, y);
      if (showP2) { ctx.fillStyle = p2Color; ctx.fillText(String(p2v), colP2X, y); }
    }

    // Clickable action buttons — replace the old keyboard-hint text.
    const btnW   = isEndScr ? 110 : 90;
    const btn1Label = isEndScr ? 'CONTINUE' : 'MENU';
    const buddyNote = !isEndScr && multiplayer && !isHost;
    // Death-screen restarts carry 1% of everything earned this run — show the
    // amount right on the button. The boss-win screen keeps its own flat
    // wallet carry and stays unlabeled.
    const restartCarry = !isEndScr ? Math.floor(runMoneyEarned * RESTART_CARRY_PCT) : 0;
    let btn2Label = buddyNote ? 'REMATCH' : 'RESTART';
    if (restartCarry > 0) btn2Label += ' +$' + restartCarry;
    // The restart button grows to fit its label so the carry amount never
    // clips, mobile screens included; button 1 keeps the fixed width.
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    const btn2W = Math.max(btnW, Math.ceil(ctx.measureText(btn2Label).width) + 18);
    const totalBtnW = btnW + btnGap + btn2W;
    const btnX1  = Math.round((W - totalBtnW) / 2);
    const btnX2  = btnX1 + btnW + btnGap;
    const btnY   = Math.min(panelY + panelH + 8, H - btnH - 6 - respawnReserve);

    // Button 1: MENU (gray) or CONTINUE (gold)
    const btn1Bg = isEndScr ? 'rgba(40,30,10,0.9)'  : 'rgba(30,30,35,0.9)';
    const btn1Br = isEndScr ? '#ffd166'              : '#9aa0a8';
    const btn1Tx = isEndScr ? '#ffd166'              : '#fff';
    ctx.fillStyle = btn1Bg;
    ctx.fillRect(btnX1, btnY, btnW, btnH);
    ctx.strokeStyle = btn1Br; ctx.lineWidth = uiLineW(2);
    ctx.strokeRect(btnX1, btnY, btnW, btnH);
    ctx.fillStyle = btn1Tx;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    ctx.fillText(btn1Label, btnX1 + btnW / 2, btnY + 19);

    // Button 2: RESTART (green)
    ctx.fillStyle = 'rgba(10,30,15,0.9)';
    ctx.fillRect(btnX2, btnY, btn2W, btnH);
    ctx.strokeStyle = '#7fdc7f'; ctx.lineWidth = uiLineW(2);
    ctx.strokeRect(btnX2, btnY, btn2W, btnH);
    ctx.fillStyle = '#7fdc7f';
    ctx.fillText(btn2Label, btnX2 + btn2W / 2, btnY + 19);

    // Multiplayer note (tiny, above buttons)
    if (!isEndScr && multiplayer && isHost && guestWantsRestart) {
      ctx.fillStyle = '#6fd09a';
      ctx.font = '11px "Lucida Console", Consolas, monospace';
      ctx.fillText('Buddy wants a rematch!', W / 2, btnY - 6);
    }

    // RESPAWN button — singleplayer death only, max 9 uses, 5-wave cooldown.
    // Always visible when singleplayer; grayed out when on cooldown or uses exhausted.
    let resurrBtn = null;
    const canResurrect = !isEndScr && !multiplayer && resurrectCount < 9
      && (wave - resurrectLastWave >= 5 || resurrectLastWave < 0);
    if (!isEndScr && !multiplayer) {
      const rBtnW = 160;
      const rBtnH = 26;
      const rBtnX = Math.round((W - rBtnW) / 2);
      const rBtnY = btnY + btnH + 8;
      if (canResurrect) {
        ctx.fillStyle = 'rgba(60,8,8,0.92)';
        ctx.fillRect(rBtnX, rBtnY, rBtnW, rBtnH);
        ctx.strokeStyle = '#cc2222'; ctx.lineWidth = uiLineW(2);
        ctx.strokeRect(rBtnX, rBtnY, rBtnW, rBtnH);
        ctx.fillStyle = '#ff6060';
      } else {
        ctx.fillStyle = 'rgba(30,30,30,0.75)';
        ctx.fillRect(rBtnX, rBtnY, rBtnW, rBtnH);
        ctx.strokeStyle = '#555'; ctx.lineWidth = uiLineW(2);
        ctx.strokeRect(rBtnX, rBtnY, rBtnW, rBtnH);
        ctx.fillStyle = '#666';
      }
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px "Lucida Console", Consolas, monospace';
      const usesLeft = Math.max(0, 9 - resurrectCount);
      const cooldown = !canResurrect && resurrectLastWave >= 0 && resurrectCount < 9
        ? (5 - (wave - resurrectLastWave)) : 0;
      let label = 'RESPAWN (' + usesLeft + ' left)';
      if (resurrectCount >= 9) label = 'RESPAWN (used up)';
      else if (cooldown > 0) label = 'RESPAWN (wave -' + cooldown + ')';
      ctx.fillText(label, rBtnX + rBtnW / 2, rBtnY + 17);
      if (canResurrect) resurrBtn = { x: rBtnX, y: rBtnY, w: rBtnW, h: rBtnH };
    }

    // Store rects for mouse/touch hit-testing.
    const baseRects = isEndScr
      ? { continue: { x: btnX1, y: btnY, w: btnW, h: btnH },
          restart:  { x: btnX2, y: btnY, w: btn2W, h: btnH } }
      : { menu:     { x: btnX1, y: btnY, w: btnW, h: btnH },
          restart:  { x: btnX2, y: btnY, w: btn2W, h: btnH } };
    if (resurrBtn) baseRects.resurrect = resurrBtn;
    gameOverBtnRects = baseRects;

    ctx.restore();
  }

  const _tileColorCache = new Map();
  let _tileColorInvalidateT = 0;

  function drawGround() {
    // Determine the range of tiles to draw based on screen extents
    // Compute world bounds visible on screen
    const corners = [
      screenToWorld(0, 0),
      screenToWorld(W, 0),
      screenToWorld(W, H),
      screenToWorld(0, H),
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    minX = Math.floor(Math.max(-HALF_MAP, minX)) - 1;
    maxX = Math.ceil(Math.min(HALF_MAP, maxX)) + 1;
    minY = Math.floor(Math.max(-HALF_MAP, minY)) - 1;
    maxY = Math.ceil(Math.min(HALF_MAP, maxY)) + 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        drawTile(x, y);
      }
    }
  }

  // How "dirt" a tile is (0..1): coops bake the ground brown as they age,
  // and the hunters' camp packs down a worn patch around the fireplace.
  function dirtAt(x, y) {
    let max = 0;
    for (const c of coops) {
      const dr = c.dirtR || 0;
      if (dr <= 0) continue;
      const dx = x - c.x, dy = y - c.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= dr * dr) continue;
      const infl = Math.min(1, (dr - Math.sqrt(d2)) / 1.5);
      if (infl > max) { max = infl; if (max >= 1) break; }
    }
    const campSources = [];
    for (const c of huntersCamps) if ((c.dirtR || 0) > 0) campSources.push(c);
    if (extinctCamp && (extinctCamp.dirtR || 0) > 0) campSources.push(extinctCamp);
    for (const c of campSources) {
      const dr = c.dirtR;
      const fire = campFireWorld(c);
      const dx = x - fire.x, dy = y - fire.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= dr * dr) continue;
      const infl = Math.min(1, (dr - Math.sqrt(d2)) / 1.5);
      if (infl > max) { max = infl; if (max >= 1) break; }
    }
    return max;
  }

  function tileColor(x, y) {
    const key = x * 10000 + y;
    const cached = _tileColorCache.get(key);
    if (cached !== undefined) return cached;
    // Stable hash-based green variation
    const h = ((x * 928371 + y * 18217) ^ 0x5f3759df) >>> 0;
    const v = (h % 100) / 100;
    // Border darker — but it still takes the snow, otherwise the treeline sat
    // on a green ring in the middle of a white farm.
    if (Math.abs(x) >= HALF_MAP - 1 || Math.abs(y) >= HALF_MAP - 1) {
      const bc = snowCoverAt(x, y);
      const col = bc > 0 ? mixHex('#3d6b34', '#dce6f0', 0.86 * bc) : '#3d6b34';
      _tileColorCache.set(key, col);
      return col;
    }
    // Patchy grass
    let r = 60 + Math.floor(v * 30);
    let g = (92 + Math.floor(v * 50)) + 30;
    let b = 50 + Math.floor(v * 20);
    // Dirt creep: blend toward brown near aging coops.
    const dirt = dirtAt(x, y);
    if (dirt > 0) {
      const dr = 104 + Math.floor(v * 26);
      const dg = 74 + Math.floor(v * 20);
      const db = 48 + Math.floor(v * 16);
      r = Math.round(r + (dr - r) * dirt);
      g = Math.round(g + (dg - g) * dirt);
      b = Math.round(b + (db - b) * dirt);
    }
    // Blizzard: the whole field goes under snow. Blended rather than flat white
    // so the tile-to-tile variation still shows through as drift texture.
    // rollWeather() clears this cache whenever the weather changes, so the
    // snow goes on and comes off cleanly.
    const cover = snowCoverAt(x, y);
    if (cover > 0) {
      const SNOW = [226, 236, 246];
      const k = 0.86 * cover;
      r = Math.round(r + (SNOW[0] - r) * k);
      g = Math.round(g + (SNOW[1] - g) * k);
      b = Math.round(b + (SNOW[2] - b) * k);
    }
    const color = `rgb(${r},${g},${b})`;
    _tileColorCache.set(key, color);
    return color;
  }

  function drawTile(wx, wy) {
    const p = worldToScreen(wx, wy);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
    ctx.lineTo(p.x, p.y + TILE_H);
    ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
    ctx.closePath();
    ctx.fillStyle = tileColor(wx, wy);
    ctx.fill();
    // Subtle outline (very faint) - only on alternating tiles for texture
    if (((wx + wy) & 1) === 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Random tufts of grass
    const h = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
    if (h % 17 === 0) {
      ctx.fillStyle = 'rgba(40,90,30,0.6)';
      ctx.fillRect(p.x - 2 + ((h>>3)%10) - 5, p.y + TILE_H/2 - 1, 2, 3);
    }
    if (h % 31 === 0) {
      // little flower
      ctx.fillStyle = ['#ffd166','#f6f6f6','#ff6b6b'][h % 3];
      ctx.beginPath();
      ctx.arc(p.x + ((h>>5)%14)-7, p.y + TILE_H/2 + ((h>>9)%6)-3, 1.5, 0, Math.PI*2);
      ctx.fill();
    }
  }

  const _entityItems = []; // reused each frame to avoid GC pressure
  function drawEntities() {
    // Build draw list sorted by depth (world x+y)
    _entityItems.length = 0;
    const items = _entityItems;
    for (const c of corpses) items.push({ depth: c.x + c.y - 0.1, draw: () => drawCorpse(c) });
    for (const s of stumps)  items.push({ depth: s.x + s.y + 1.6, draw: () => drawStump(s) });
    for (const t of twigs)   items.push({ depth: t.x + t.y + 1.5, draw: () => drawTwig(t) });
    for (const t of trees)   items.push({ depth: t.x + t.y, draw: () => drawWithOcclusion(t, () => drawTree(t)) });
    for (const fm of farms) items.push({ depth: fm.x + fm.y - 0.1, draw: () => drawFarm(fm) });
    for (const c of coops) items.push({ depth: c.x + c.y, draw: () => drawCoop(c) });
    for (const f of fences) items.push({ depth: f.x + f.y, draw: () => drawFence(f) });
    for (const d of debris) items.push({ depth: d.x + d.y - 0.05, draw: () => drawDebris(d) });
    // Holes draw under everything else on the tile so corpses/wolves walk
    // over them; mines render at the same depth but a touch in front so the
    // tiny bump reads above the ground.
    for (const s of scorches) items.push({ depth: s.x + s.y - 0.13, draw: () => drawScorch(s) });
    for (const h of holes) items.push({ depth: h.x + h.y - 0.12, draw: () => drawHole(h) });
    for (const m of mines) items.push({ depth: m.x + m.y - 0.10, draw: () => drawMine(m) });
    // Graves join the depth sort like any other standing prop, so the keeper
    // walks in front of one that's nearer the camera instead of the headstone
    // always being painted over the top of everyone.
    for (const g of graves) items.push({ depth: g.x + g.y, draw: () => drawGrave(g) });
    for (const dm of dummies) items.push({ depth: dm.x + dm.y, draw: () => drawDummy(dm) });
    for (const st of statues) items.push({ depth: st.x + st.y, draw: () => drawStatue(st) });
    for (const c of chickens) {
      // Carried chickens piggy-back on their carrier's depth + a small
      // forward offset so the chicken renders ON TOP of the wolf/fox jaws
      // instead of being hidden inside the body.
      const carryDepth = (c.carrier && c.carrier.alive) ? 0.15 : 0;
      items.push({ depth: c.x + c.y + carryDepth, draw: () => drawChicken(c) });
    }
    for (const w of wolves) items.push({ depth: w.x + w.y, draw: () => drawWolf(w) });
    if (p2Cameo) items.push({ depth: p2Cameo.x + p2Cameo.y, draw: () => drawP2Cameo() });
    for (const d of dogs) items.push({ depth: d.x + d.y, draw: () => drawDog(d) });
    const drawCamps = huntersCamps.length ? huntersCamps : (extinctCamp ? [extinctCamp] : []);
    for (const camp of drawCamps) {
      const lit = huntersCamps.length > 0;
      const fire = campFireWorld(camp);
      items.push({ depth: camp.x + camp.y - 0.05, draw: () => drawHuntersCampTent(camp, lit) });
      items.push({ depth: fire.x + fire.y - 0.05, draw: () => drawHuntersCampFire(camp, lit) });
    }
    for (const h of hunters) if (h.alive || h.dying) items.push({ depth: h.x + h.y, draw: () => drawHunter(h) });
    // Rooftoppers piggy-back on their coop's depth so they sort just in
    // front of the coop body without leaking over neighbouring tiles.
    for (const r of rooftoppers) if (r.alive)
      items.push({ depth: r.x + r.y + 0.05, draw: () => drawRooftopper(r) });
    items.push({ depth: player.x + player.y, draw: () => drawPlayer() });
    if (player2.active) {
      items.push({ depth: player2.x + player2.y, draw: () => drawPlayer2() });
    }
    for (const p of pellets) items.push({ depth: p.x + p.y + 0.5, draw: () => drawPellet(p) });

    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();
    // Explosions and gunsmoke float above the scene.
    for (const b of blasts) drawBlast(b);
    for (const s of smoke) drawSmoke(s);
    for (const lb of beams) drawBeam(lb);
    // Hat animations: wolf-kill arc and dash scatter — drawn above everything.
    drawFlyHats();
    drawDashHats();
  }

  // A tile of fence/wall wreckage. Wood debris is splintered planks; stone
  // debris is broken rubble. Worker chickens can run to the pile and
  // sacrifice themselves to rebuild the fence at full HP.
  // A buried mine — almost invisible at low levels (just a tiny dark dot
  // and a hint of disturbed earth). At max level a faint dark ring shows
  // around the dot so the player has a fighting chance of spotting their
  // own mines on the ground.
  function drawMine(m) {
    const p = worldToScreen(m.x, m.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const lvl = Math.max(1, Math.min(5, m.level || 1));
    // Disturbed-earth smudge — a low-alpha brown ellipse the size of a tile.
    ctx.fillStyle = 'rgba(60,40,22,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // An X scratched in the dirt marks the spot — far easier to pick out at a
    // glance than the single dot this replaces. Grows slightly with tier.
    const xr = 2.2 + (lvl - 1) * 0.35;
    ctx.save();
    ctx.strokeStyle = 'rgba(20,16,10,0.62)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Drawn on the tile's isometric axes so it lies flat on the ground.
    ctx.moveTo(cx - xr * 1.7, cy - 1 - xr * 0.85);
    ctx.lineTo(cx + xr * 1.7, cy - 1 + xr * 0.85);
    ctx.moveTo(cx + xr * 1.7, cy - 1 - xr * 0.85);
    ctx.lineTo(cx - xr * 1.7, cy - 1 + xr * 0.85);
    ctx.stroke();
    ctx.restore();
    // Max-level: faint warning ring, a barely visible blinker, and a tiny
    // red flag jutting out of the dirt so you can actually spot your own
    // mines on the battlefield.
    if (lvl >= 5) {
      ctx.strokeStyle = 'rgba(180,40,30,0.32)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 4.4, 2.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      const blink = 0.18 + 0.18 * Math.sin(Date.now() * 0.005);
      ctx.fillStyle = 'rgba(220,40,30,' + blink.toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy - 1, 0.7, 0, Math.PI * 2);
      ctx.fill();
      // Flag pole (thin dark line) + a small red pennant fluttering off it.
      const poleBase = { x: cx + 3, y: cy - 1 };
      const poleTop  = { x: poleBase.x, y: poleBase.y - 7 };
      ctx.strokeStyle = '#2a1a10';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(poleBase.x, poleBase.y);
      ctx.lineTo(poleTop.x, poleTop.y);
      ctx.stroke();
      // Pennant — a small red triangle. A tiny wave so it reads as cloth.
      const flap = Math.sin(Date.now() * 0.006 + (m.x + m.y)) * 0.6;
      ctx.fillStyle = '#cf2a22';
      ctx.beginPath();
      ctx.moveTo(poleTop.x, poleTop.y);
      ctx.lineTo(poleTop.x + 4 + flap, poleTop.y + 1.5);
      ctx.lineTo(poleTop.x, poleTop.y + 3);
      ctx.closePath();
      ctx.fill();
    }
  }

  // A scorched hole on the tile a mine just blew up. Lingers until the next
  // wave starts (cleared in startWave). Just a dark, rough crater.
  function drawHole(h) {
    const p = worldToScreen(h.x, h.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    // Outer ring of dark soot.
    ctx.fillStyle = 'rgba(20,12,6,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner crater.
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 5.5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // A few stray clods of dirt around the rim.
    ctx.fillStyle = 'rgba(80,52,28,0.6)';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const rx = cx + Math.cos(a) * 7.5;
      const ry = cy + Math.sin(a) * 3.6;
      ctx.beginPath();
      ctx.arc(rx, ry, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawDebris(d) {
    drawShadow(d.x, d.y, 0.45);
    const p = worldToScreen(d.x, d.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    if (d.kind === 'stone') {
      // Three chunky grey rocks.
      ctx.fillStyle = '#5d5d65';
      ctx.beginPath(); ctx.ellipse(cx - 4, cy - 1, 4.2, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#71717a';
      ctx.beginPath(); ctx.ellipse(cx + 2, cy - 3, 5,   3,   0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a4a52';
      ctx.beginPath(); ctx.ellipse(cx + 6, cy + 0, 3.4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      // Dust outline.
      ctx.strokeStyle = '#2a2a30';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(cx - 4, cy - 1, 4.2, 2.6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx + 2, cy - 3, 5,   3,   0, 0, Math.PI * 2); ctx.stroke();
    } else {
      // Splintered wood planks.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = '#7b4a22';
      ctx.strokeStyle = '#3a1f0c';
      ctx.lineWidth = 0.7;
      ctx.rotate(-0.5);
      ctx.fillRect(-7, -1, 14, 2);
      ctx.strokeRect(-7, -1, 14, 2);
      ctx.rotate(1.0);
      ctx.fillStyle = '#8b5a30';
      ctx.fillRect(-6, -3, 12, 2);
      ctx.strokeRect(-6, -3, 12, 2);
      ctx.rotate(-1.3);
      ctx.fillStyle = '#6b3f1e';
      ctx.fillRect(-5, -2, 10, 1.6);
      ctx.strokeRect(-5, -2, 10, 1.6);
      ctx.restore();
    }
  }

  // Jagged crack overlay drawn on a wall that's below half health. Seeded off
  // the tile position so a given wall's cracks don't crawl between frames.
  function drawFenceCracks(f, cx, cy, h) {
    // The build-mode ghost has no hp/maxHp at all, so the comparison below used
    // to read `undefined > n` → false and crack every preview. A preview is
    // always pristine; only a real, placed, damaged wall splits.
    if (typeof f.hp !== 'number') return;
    if (f.hp > fenceMaxHp(f) / 2) return;
    const seed = Math.abs(Math.round(f.x * 73856093 + f.y * 19349663));
    const rnd = i => (((seed >> (i % 12)) ^ (seed * (i + 3))) % 1000) / 1000;
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 14, 10, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    // Keep every crack inside the block's front faces. The old version let the
    // start offset (±8px) and three unclamped ±3px steps wander up to 17px out
    // and well below the tile, so cracks floated off the wall entirely.
    const HX = TILE_W * 0.30;        // half-width of the drawable face
    const TOP = cy - h + 2;          // just under the parapet
    const BOT = cy - 2;              // just above the ground line
    const cl = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    for (let k = 0; k < 3; k++) {
      let x = cx + (rnd(k * 3) - 0.5) * HX * 1.4;
      let y = cl(TOP + (BOT - TOP) * (0.10 + rnd(k * 3 + 1) * 0.35), TOP, BOT);
      ctx.beginPath();
      ctx.moveTo(cl(x, cx - HX, cx + HX), y);
      for (let s = 0; s < 3; s++) {
        x = cl(x + (rnd(k * 7 + s) - 0.5) * 4.5, cx - HX, cx + HX);
        y = cl(y + 1.6 + rnd(k * 5 + s) * 2.2, TOP, BOT);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFence(f) {
    if (f.kind === 'stone') { drawStoneFence(f); return; }
    // ---- Wood rail fence ----
    drawShadow(f.x, f.y, 0.5);
    const p = worldToScreen(f.x, f.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hw = TILE_W / 2, hd = TILE_H / 2;
    // The 4 tile-diamond corners double as the fence posts.
    const corners = [
      { x: cx,      y: cy + hd }, // front
      { x: cx + hw, y: cy },      // right
      { x: cx,      y: cy - hd }, // back
      { x: cx - hw, y: cy },      // left
    ];
    const postH = 12;
    const hurt = f.hurtT > 0; // flashes red while a wolf is tearing it down
    // Two rails running around the diamond.
    ctx.strokeStyle = hurt ? '#d8743a' : '#8a5a2c';
    ctx.lineWidth = 2;
    for (const rh of [postH, postH * 0.45]) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        if (i === 0) ctx.moveTo(a.x, a.y - rh);
        else ctx.lineTo(a.x, a.y - rh);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // Corner posts.
    ctx.strokeStyle = hurt ? '#b04020' : '#5a3a1c';
    ctx.lineWidth = 3;
    for (const c of corners) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x, c.y - postH);
      ctx.stroke();
    }
    // A maxed Wooden Fence is spiked — sharpened wooden stakes crown every post.
    if (upgradeLevels.woodFence >= 5) {
      ctx.fillStyle = hurt ? '#d8743a' : '#a9763c';
      ctx.strokeStyle = hurt ? '#b04020' : '#5a3a1c';
      ctx.lineWidth = 1;
      for (const c of corners) {
        ctx.beginPath();
        ctx.moveTo(c.x - 2.5, c.y - postH);
        ctx.lineTo(c.x, c.y - postH - 5);
        ctx.lineTo(c.x + 2.5, c.y - postH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    drawFenceCracks(f, cx, cy, postH); // splits open once it's below half health
  }

  // A solid stone wall — blocks wolves AND bullets (see stoneFenceBlocks()).
  function drawStoneFence(f) {
    drawShadow(f.x, f.y, 0.6);
    const p = worldToScreen(f.x, f.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hw = TILE_W / 2, hd = TILE_H / 2;
    const wallH = 16;
    const hurt = f.hurtT > 0; // flashes red while a wolf is tearing it down
    const B = { x: cx, y: cy + hd }, R = { x: cx + hw, y: cy };
    const T = { x: cx, y: cy - hd }, L = { x: cx - hw, y: cy };
    const up = (pt, dy) => ({ x: pt.x, y: pt.y - dy });
    function poly(pts, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    }
    // Solid stone block: left wall, right wall, top face.
    poly([L, up(L, wallH), up(B, wallH), B], hurt ? '#b0584e' : '#73737c', '#3c3c44');
    poly([B, up(B, wallH), up(R, wallH), R], hurt ? '#c46a5e' : '#8a8a93', '#3c3c44');
    poly([up(L, wallH), up(B, wallH), up(R, wallH), up(T, wallH)], hurt ? '#cc7468' : '#9a9aa3', '#3c3c44');
    // Block seams: a mid course + staggered vertical joints on each wall.
    ctx.strokeStyle = '#4a4a52';
    ctx.lineWidth = 1;
    const onEdge = (a, b, t, lift) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - lift });
    const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    for (const [a, b] of [[L, B], [B, R]]) {
      seg(onEdge(a, b, 0, wallH * 0.5), onEdge(a, b, 1, wallH * 0.5));
      seg(onEdge(a, b, 0.5, 0), onEdge(a, b, 0.5, wallH * 0.5));
      seg(onEdge(a, b, 0.25, wallH * 0.5), onEdge(a, b, 0.25, wallH));
      seg(onEdge(a, b, 0.75, wallH * 0.5), onEdge(a, b, 0.75, wallH));
    }
    // A maxed Stone Wall is spiked — iron points jut from the parapet.
    if (upgradeLevels.stoneWall >= 5) {
      ctx.fillStyle = hurt ? '#e0a8a8' : '#aab0bd';
      ctx.strokeStyle = '#2c2c34';
      ctx.lineWidth = 1;
      const spike = (base) => {
        ctx.beginPath();
        ctx.moveTo(base.x - 2.5, base.y);
        ctx.lineTo(base.x, base.y - 6);
        ctx.lineTo(base.x + 2.5, base.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      };
      for (const [a, b] of [[L, B], [B, R]]) {
        spike(onEdge(a, b, 0.25, wallH));
        spike(onEdge(a, b, 0.75, wallH));
      }
      spike(onEdge(L, B, 1, wallH)); // front corner
    }
    drawFenceCracks(f, cx, cy, wallH); // splits open once it's below half health
  }

  function drawBuildPreview(builder) {
    builder = builder || player;
    if (!builder.buildMode) return;
    const target = getBuildTarget(builder);
    ctx.save();
    if (target.type === 'remove') {
      // Highlight the tile that would be cleared with a red X.
      const rp = worldToScreen(target.x, target.y);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = target.valid ? '#ff5050' : '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rp.x, rp.y);
      ctx.lineTo(rp.x + TILE_W / 2, rp.y + TILE_H / 2);
      ctx.lineTo(rp.x, rp.y + TILE_H);
      ctx.lineTo(rp.x - TILE_W / 2, rp.y + TILE_H / 2);
      ctx.closePath();
      ctx.stroke();
      if (target.valid) {
        const rcx = rp.x, rcy = rp.y + TILE_H / 2;
        ctx.beginPath();
        ctx.moveTo(rcx - 6, rcy - 5); ctx.lineTo(rcx + 6, rcy + 5);
        ctx.moveTo(rcx + 6, rcy - 5); ctx.lineTo(rcx - 6, rcy + 5);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.globalAlpha = target.valid ? 0.4 : 0.18;
    if (target.type === 'coop') drawCoop({ x: target.x, y: target.y }, true);
    else if (target.type === 'farm') drawFarm({ x: target.x, y: target.y, growth: 0, trampleFlash: 0 });
    else if (target.type === 'dummy') {
      if (upgradeLevels.dummy < 1) { ctx.restore(); return; }
      const hp = DUMMY_HP_TABLE[upgradeLevels.dummy];
      drawDummy({ x: target.x, y: target.y, hp, maxHp: hp, hurtT: 0 });
    } else if (target.type === 'statue') {
      if (upgradeLevels.statue < 1) { ctx.restore(); return; }
      const hp = STATUE_HP_TABLE[upgradeLevels.statue];
      drawStatue({ x: target.x, y: target.y, hp, maxHp: hp, hurtT: 0 });
    } else if (target.type === 'mine') {
      if (upgradeLevels.mine < 1) { ctx.restore(); return; }
      drawMine({ x: target.x, y: target.y, level: upgradeLevels.mine });
    } else if (target.type === 'dpsdummy') {
      drawDpsDummy({ x: target.x, y: target.y, dps: 0, hurtT: 0 });
    } else {
      // Don't show fence previews if the fence type is still locked via upgrades
      if (target.type === 'fence' && upgradeLevels.woodFence <= 0) { ctx.restore(); return; }
      if (target.type === 'stonefence' && upgradeLevels.stoneWall <= 0) { ctx.restore(); return; }
      drawFence({ x: target.x, y: target.y, kind: target.type === 'stonefence' ? 'stone' : 'wood' });
    }
    if (!target.valid) {
      const p = worldToScreen(target.x, target.y);
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#ff6060';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + TILE_W / 2, p.y + TILE_H / 2);
      ctx.lineTo(p.x, p.y + TILE_H);
      ctx.lineTo(p.x - TILE_W / 2, p.y + TILE_H / 2);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  // A small filled 5-point star at (cx, cy).
  function drawStar(cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rr = (i % 2 === 0) ? r : r * 0.42;
      const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // The FANGUS-kill trophy: a big, bushy Pringles-style mustache — two full,
  // filled lobes under the nose whose tips flick sharply upward. Each boss kill
  // widens and fattens it (level 1..N). `headY` is the head's centre y.
  function drawMustache(cx, headY, level, age) {
    const n = Math.max(1, level || 1);
    // Slow, diminishing growth: it widens with every kill but settles toward a
    // sane max size rather than scaling linearly forever (so it stays "to the
    // sizes" instead of ballooning across the face).
    const g = Math.log2(n + 1);      // 1 → 1.0, 3 → 2.0, 7 → 3.0, 15 → 4.0 …
    const half  = 4 + g * 1.4;       // half-width — grows wider with every kill
    const thick = 1.8 + g * 0.34;    // vertical bushiness (slimmer now)
    const my = headY + 3.2;          // sits just under the nose (nudged up a touch)
    // Greys with age — every post-boss restart the trophy survives adds a little
    // salt to the pepper, capped so it never goes fully white.
    const grayFrac = Math.min(0.65, Math.max(0, age || 0) * 0.1);
    const blend = (a, b) => Math.round(a + (b - a) * grayFrac);
    const mainCol = 'rgb(' + blend(58, 150) + ',' + blend(33, 145) + ',' + blend(19, 140) + ')';
    const hiCol   = 'rgb(' + blend(107, 195) + ',' + blend(67, 190) + ',' + blend(38, 185) + ')';
    ctx.save();
    ctx.fillStyle = mainCol;         // dark espresso brown, greying with age
    ctx.lineJoin = 'round';
    // Mirror-draw each half as a filled lobe: out from the centre along the top,
    // an upward-hooked tip, then a bushy belly sweeping back to the middle.
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, my - thick * 0.35);                                   // centre, top
      ctx.quadraticCurveTo(cx + s * half * 0.55, my - thick * 0.65,
                           cx + s * half * 0.96, my - thick * 1.35);       // sweep out + flick the tip up
      ctx.quadraticCurveTo(cx + s * half * 1.16, my - thick * 0.25,
                           cx + s * half * 0.88, my + thick * 0.30);       // round the upturned tip
      ctx.quadraticCurveTo(cx + s * half * 0.52, my + thick * 1.25,
                           cx, my + thick * 0.55);                         // bushy belly back to centre
      ctx.closePath();
      ctx.fill();
    }
    // A soft highlight ridge along the top to give it some body.
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = hiCol;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, my - thick * 0.3);
      ctx.quadraticCurveTo(cx + s * half * 0.55, my - thick * 0.55,
                           cx + s * half * 0.9, my - thick * 1.15);
      ctx.quadraticCurveTo(cx + s * half * 0.5, my - thick * 0.2, cx, my - thick * 0.05);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Shown when the local keeper is a ghost — they sit out the upgrade phase
  // while the surviving buddy picks.
  function drawUpgradeWaitOverlayGhost() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = Math.min(380, W - 24);
    const h = 96;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    ctx.fillStyle = 'rgba(15,18,24,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Lucida Console", Consolas, monospace';
    ctx.fillText('No pick for ghosts', W / 2, y + 38);
    ctx.fillStyle = '#d7d7d7';
    ctx.font = '14px "Lucida Console", Consolas, monospace';
    ctx.fillText('Your buddy is choosing the upgrade…', W / 2, y + 66);
    ctx.restore();
  }

  // Host-side: host has picked their upgrade but buddy still hasn't.
  function drawUpgradeWaitOverlayHostWait() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = Math.min(360, W - 24);
    const h = 96;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    ctx.fillStyle = 'rgba(15,18,24,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Lucida Console", Consolas, monospace';
    ctx.fillText('Pick locked in', W / 2, y + 38);
    ctx.fillStyle = '#d7d7d7';
    ctx.font = '14px "Lucida Console", Consolas, monospace';
    ctx.fillText('Waiting for buddy to pick…', W / 2, y + 66);
    ctx.restore();
  }

  // Guest-side: simplified upgrade window using P2's own option list. No
  // star history / cross-locks (those mechanics live in the main pool which
  // the host owns).
  function drawUpgradeWindowP2() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.fillRect(0, 0, W, H);
    const panelW = Math.min(560, W - 24);
    const panelH = 236;
    const panelX = (W - panelW) / 2;
    const panelY = (H - panelH) / 2 - 10;
    ctx.fillStyle = 'rgba(15, 18, 24, 0.96)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px "Lucida Console", Consolas, monospace';
    ctx.fillText('Wave cleared', W / 2, panelY + 40);
    ctx.font = '16px "Lucida Console", Consolas, monospace';
    const sub = upgradePicked2 ? 'Waiting for buddy…' : 'Pick your gun upgrade';
    ctx.fillText(sub, W / 2, panelY + 68);
    const rects = getUpgradeOptionRects();
    for (let i = 0; i < rects.length; i++) {
      const option = upgradeOptions2[i];
      if (!option) continue;
      const rect = rects[i];
      const hovered = !upgradePicked2 && mouse.x >= rect.x && mouse.x <= rect.x + rect.w && mouse.y >= rect.y && mouse.y <= rect.y + rect.h;
      // Resurrect Buddy reads red here too, matching the host's picker so the
      // guest sees the same "this is the revive" cue.
      const accent2 = option.id === 'resurrect' ? '#ff5a5a' : null;
      ctx.fillStyle = hovered ? 'rgba(255, 209, 102, 0.24)' : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = accent2 || (hovered ? '#ffd166' : 'rgba(255,255,255,0.18)');
      ctx.lineWidth = uiLineW(2);
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
      // Easter-egg chicken filler — just the chicken, no text.
      if (option.id === 'chicken') {
        drawChickenIcon(rect.x + rect.w / 2, rect.y + rect.h / 2 + 6, 2.6);
        continue;
      }
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      const titleText2 = (i + 1) + '. ' + option.title;
      const maxTitleW2 = rect.w - 28;
      let titleSize2 = 16;
      ctx.font = 'bold ' + titleSize2 + 'px "Lucida Console", Consolas, monospace';
      while (titleSize2 > 10 && ctx.measureText(titleText2).width > maxTitleW2) {
        titleSize2--;
        ctx.font = 'bold ' + titleSize2 + 'px "Lucida Console", Consolas, monospace';
      }
      ctx.fillText(titleText2, rect.x + 14, rect.y + 22);
      ctx.font = '13px "Lucida Console", Consolas, monospace';
      ctx.fillStyle = '#d7d7d7';
      wrapText(option.desc(), rect.x + 14, rect.y + 56, rect.w - 28, 15, 3);
    }
    ctx.fillStyle = '#9aa0a8';
    ctx.textAlign = 'center';
    ctx.font = '12px "Lucida Console", Consolas, monospace';
    ctx.fillText(isMobileMode ? 'Tap an option to pick' : 'Click or press 1/2/3 to pick', W / 2, panelY + panelH - 14);
    ctx.restore();
  }

  // Shown on the guest while the host is in their upgrade screen — read-only
  // hint so the guest knows what's happening instead of a frozen world.
  function drawUpgradeWaitOverlay() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = Math.min(360, W - 24);
    const h = 96;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    ctx.fillStyle = 'rgba(15,18,24,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Lucida Console", Consolas, monospace';
    ctx.fillText('Wave cleared', W / 2, y + 38);
    ctx.fillStyle = '#d7d7d7';
    ctx.font = '14px "Lucida Console", Consolas, monospace';
    ctx.fillText('Host is choosing an upgrade…', W / 2, y + 66);
    ctx.restore();
  }

  // Shown on the guest while the host has paused — the world is frozen on
  // the host's side, so this surfaces the reason instead of just appearing
  // unresponsive.
  // Guest-side warning strip: shown when no snapshot has arrived for >0.8s.
  function drawLagWarning() {
    const blink = Math.floor(Date.now() / 400) % 2 === 0;
    if (!blink) return;
    ctx.save();
    const bw = Math.min(280, W - 16);
    const bh = 22;
    const bx = (W - bw) / 2;
    const by = 6;
    ctx.fillStyle = 'rgba(180,60,0,0.88)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ffe080';
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px "Lucida Console", Consolas, monospace';
    ctx.fillText('⚠ weak connection — waiting for host…', bx + bw / 2, by + 15);
    ctx.restore();
  }

  function drawHostPausedOverlay() {
    ctx.save();
    if (PIXELATE && document.body.classList.contains('pixelate-all')) {
      ctx.filter = 'url(#pixelate)';
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    const w = Math.min(360, W - 24);
    const h = 96;
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    ctx.fillStyle = 'rgba(15,18,24,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Lucida Console", Consolas, monospace';
    ctx.fillText('HOST PAUSED', W / 2, y + 38);
    ctx.fillStyle = '#d7d7d7';
    ctx.font = '14px "Lucida Console", Consolas, monospace';
    ctx.fillText('Waiting for the host to resume…', W / 2, y + 66);
    ctx.restore();
  }

  function drawUpgradeWindow() {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.fillRect(0, 0, W, H);

    // Derive outer panel width from the card rects so it never overflows.
    const rects0 = getUpgradeOptionRects();
    const cardsW = rects0[2].x + rects0[2].w - rects0[0].x;
    const panelW = Math.min(Math.max(cardsW + 32, 200), W - 16);
    const panelH = 236;
    const panelX = Math.round((W - panelW) / 2);
    const panelY = (H - panelH) / 2 - 10;

    ctx.fillStyle = 'rgba(15, 18, 24, 0.96)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    // Bonus pick screen: gold-green border + alternate header so the player
    // immediately reads this as the surprise second pick, not the normal one.
    const isBonus = !!bonusUpgradeAvailable;
    ctx.strokeStyle = isBonus ? '#5fd06a' : '#ffd166';
    ctx.lineWidth = uiLineW(isBonus ? 3 : 2);
    ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);

    ctx.fillStyle = isBonus ? '#5fd06a' : '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px "Lucida Console", Consolas, monospace';
    ctx.fillText(isBonus ? 'BONUS PICK!' : 'Wave cleared', W / 2, panelY + 40);
    ctx.fillStyle = '#fff';
    ctx.font = '13px "Lucida Console", Consolas, monospace';
    ctx.fillText(isBonus
      ? 'Flock-protection bonus — choose a second upgrade'
      : 'Choose one upgrade to resume the next wave', W / 2, panelY + 65, panelW - 16);

    // (LOCKS_OUT — the mutually-exclusive pair map — is now hoisted to module
    // scope near pickDistinct so the pick builder shares it.)
    const rects = getUpgradeOptionRects();
    for (let i = 0; i < rects.length; i++) {
      const option = upgradeOptions[i];
      if (!option) continue; // never index past the available options — empty slots stay blank
      const rect = rects[i];
      const hovered = mouse.x >= rect.x && mouse.x <= rect.x + rect.w && mouse.y >= rect.y && mouse.y <= rect.y + rect.h;
      // Times this upgrade has already been taken, and its cap.
      const count = upgradeLevels[option.id] || 0;
      const max = option.id === 'cash' ? Infinity
                : (option.id === 'focusUp' || option.id === 'focusDown') ? MAX_FOCUS_LEVEL
                : (option.id === 'woodFence' || option.id === 'stoneWall' || option.id === 'wolfDelay' || option.id === 'hatchRate'
                   || option.id === 'crazyTrigger' || option.id === 'calmWaves' || option.id === 'roughWaves'
                   || option.id === 'doubleBarrel' || option.id === 'machineGun' || option.id === 'counter'
                   || option.id === 'sprint' || option.id === 'softBullet' || option.id === 'hardBullet'
                   || option.id === 'rust' || option.id === 'farm'
                   || option.id === 'dummy' || option.id === 'statue') ? 5
                : MAX_LEVEL;
      const isLast = count === max - 1; // picking it now maxes this upgrade out
      // Longer Barrel keeps being offered past MAX as a visual-only pick.
      const rangeMaxed = option.id === 'range' && count >= MAX_LEVEL;
      // Rusty Springs' final tier (the golden gun) reads as yellow, not blue.
      const goldTier = option.id === 'rust' && isLast;
      const accent = rangeMaxed             ? '#b06fff'   // purple — Longer Barrel maxed
                   : option.id === 'cash'   ? '#5fd06a'   // green  — Pocket Money
                   : option.id === 'buyHat' ? '#ff8ad8'   // pink   — Buy Hat
                   : option.id === 'resurrect' ? '#ff5a5a' // red    — Resurrect Buddy
                   : option.id === 'sword'  ? '#5b9bff'   // blue   — Wolf's Blade
                   : option.id === 'hunters'? '#ffee33'   // yellow — Call the Hunters
                   : option.id === 'hunterPower'? '#ffd23f' // yellow — Hunter Gear
                   : option.id === 'hunterCaravan'? '#8a5a2a' // brown  — Hunter Caravan
                   : option.id === 'weaponOil'? '#ffe23d' // yellow — Weapon Oil
                   : option.id === 'advancedOil'? '#7fd0ff' // cyan   — Advanced Oil
                   : option.id === 'hatPack'? '#ff8ad8'   // pink   — Buy Hat Pack
                   : option.id === 'bribeWolves'? '#c9a23a' // gold-brown — Bribe Wolves
                   : option.id === 'metaverse' ? ('hsl(' + Math.floor((Date.now() / 8) % 360) + ',90%,65%)') // shimmering rainbow — Metaverse
                   : option.id === 'goldenChicken' ? '#ffd23f' // yellow — Golden Chicken
                   : goldTier               ? '#ffd23f'   // yellow — golden-gun (Rusty Springs max)
                   : isLast                 ? '#5fd0ff'   // blue   — final level
                   :                          '#ffd166';  // gold   — standard
      const colored = rangeMaxed || option.id === 'cash' || option.id === 'buyHat' || option.id === 'hatPack' || option.id === 'resurrect' || option.id === 'sword' || option.id === 'hunters' || option.id === 'hunterPower' || option.id === 'hunterCaravan' || option.id === 'weaponOil' || option.id === 'advancedOil' || option.id === 'bribeWolves' || option.id === 'metaverse' || option.id === 'goldenChicken' || goldTier;
      // First pick of an exclusive upgrade permanently disables its counterpart
      // — unless the Metaverse has dissolved the locks.
      const locksOut = (!metaverseOn() && count === 0 && LOCKS_OUT[option.id]) || null;
      const isMetaverse = option.id === 'metaverse';

      ctx.fillStyle = hovered  ? 'rgba(255, 209, 102, 0.24)'
                    : isMetaverse ? 'rgba(160, 90, 255, 0.16)'
                    : goldTier ? 'rgba(255, 210, 63, 0.16)'
                    : isLast   ? 'rgba(95, 208, 255, 0.14)'
                    :            'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = (isLast || colored) ? accent : (hovered ? '#ffd166' : 'rgba(255,255,255,0.18)');
      ctx.lineWidth = uiLineW(isMetaverse ? 3 : 2);
      if (isMetaverse) { ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 14 + 6 * Math.sin(Date.now() / 140); }
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
      if (isMetaverse) ctx.restore();

      // Easter-egg chicken filler — no text at all, just the game's chicken
      // drawn dead-centre on the card.
      if (option.id === 'chicken') {
        drawChickenIcon(rect.x + rect.w / 2, rect.y + rect.h / 2 + 6, 2.6);
        continue;
      }

      // Title — shrink the font if the name would otherwise clip the card.
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      const titleText = (i + 1) + '. ' + option.title;
      const maxTitleW = rect.w - 28;
      let titleSize = 16;
      ctx.font = 'bold ' + titleSize + 'px "Lucida Console", Consolas, monospace';
      while (titleSize > 10 && ctx.measureText(titleText).width > maxTitleW) {
        titleSize--;
        ctx.font = 'bold ' + titleSize + 'px "Lucida Console", Consolas, monospace';
      }
      ctx.fillText(titleText, rect.x + 14, rect.y + 22);

      // One star per time this upgrade was already taken — capped at 10,
      // with a 'x12' style counter past that so the row doesn't overflow.
      const stars = Math.min(count, 10);
      for (let s = 0; s < stars; s++) {
        drawStar(rect.x + 17 + s * 8, rect.y + 37, 3, accent);
      }
      if (count > 10) {
        ctx.fillStyle = accent;
        ctx.font = 'bold 10px "Lucida Console", Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('x' + count, rect.x + 17 + stars * 8 + 1, rect.y + 41);
      }
      // Flag the final possible level.
      if (isLast) {
        ctx.fillStyle = accent;
        ctx.font = 'bold 9px "Lucida Console", Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('MAX', rect.x + rect.w - 11, rect.y + 40);
        ctx.textAlign = 'left';
      }

      // Description
      ctx.font = '13px "Lucida Console", Consolas, monospace';
      ctx.fillStyle = '#d7d7d7';
      wrapText(option.desc(), rect.x + 14, rect.y + 56, rect.w - 28, 15, 3);

      // Warn that taking this will permanently lock out the paired upgrade.
      if (locksOut) {
        ctx.fillStyle = '#ff9d4d';
        ctx.font = 'bold 9px "Lucida Console", Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('Locks out ' + locksOut, rect.x + 14, rect.y + 96);
      }
    }

    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.font = '13px "Lucida Console", Consolas, monospace';
    ctx.fillText(isMobileMode ? 'Tap an option to pick' : 'Press 1-3 or click an option', W / 2, panelY + panelH - 16);
    ctx.restore();
  }

  // Roman numeral for an upgrade level (e.g. level 3 → "III"), matching the
  // game's existing "Loose Pattern II" naming style.
  function toRoman(n) {
    if (n <= 0) return '';
    const map = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
                 [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let r = '';
    for (const [v, s] of map) while (n >= v) { r += s; n -= v; }
    return r;
  }

  // Pause / status menu — drawn straight onto the low-res canvas so it gets the
  // same pixelated look as the upgrade window (instead of a crisp HTML overlay).
  // Shows two panels: live STATUS, and every UPGRADE the player has taken with
  // its current custom stat and level.
  function drawPauseWindow() {
    ctx.save();
    // Pass the panel through the same SVG pixel filter the menu uses when
    // PIXELATE is on. Without this, canvas-drawn text was crisp while the
    // HTML menu around it was blocky — visually inconsistent.
    if (document.body.classList.contains('pixelate-all')) {
      ctx.filter = 'url(#pixelate)';
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.fillRect(0, 0, W, H);

    // Gather live stats
    let aliveChickens = 0;
    for (const c of chickens) if (c.alive) aliveChickens++;
    let liveWolves = 0;
    for (const w of wolves) if (w.alive) liveWolves++;
    const spreadDeg = (shotgunSpread * 180 / Math.PI).toFixed(1);

    const pauseIsGuest = multiplayer && !isHost;
    const pauseMyMoney = (gameOpts.separateMoney && pauseIsGuest) ? money2 : money;
    const statusItems = [
      ['Hats', playerHats],
      ['Money', '$' + pauseMyMoney],
      ['Wave', wave || '—'],
      ['Wolves alive', liveWolves],
      ['Coops', coops.length],
      ['Chickens', aliveChickens],
      ['Wolves killed', kills],
      ['Next coop', '$' + coopCost()],
    ];

    // Every upgrade and the custom stat it currently grants — listed in the same
    // order as the upgrade pool. Only upgrades the player has taken are shown.
    // `max` is the functional cap: the level past which more picks change nothing
    // mechanical (e.g. Longer Barrel keeps growing visually but range stops at 10).
    const allUpgrades = [
      { id: 'jam',         title: 'Better Springs',     max: MAX_LEVEL,       stat: () => 'jam ' + Math.round(jamChance * 100) + '%' },
      { id: 'range',       title: 'Longer Barrel',      max: MAX_LEVEL,       stat: () => 'range ' + shotgunLife.toFixed(2) + 's' },
      { id: 'speed',       title: 'Fast Boots',         max: MAX_LEVEL,       stat: () => 'speed ' + player.speed.toFixed(1) },
      { id: 'fireRate',    title: 'Trigger Work',       max: MAX_LEVEL,       stat: () => 'cooldown ' + shotgunCooldown.toFixed(2) + 's' },
      { id: 'spreadUp',    title: 'Loose Pattern',      max: MAX_LEVEL,       stat: () => spreadDeg + '°, ' + pelletCount + ' plt' },
      { id: 'spreadDown',  title: 'Tighter Pattern',    max: MAX_LEVEL,       stat: () => spreadDeg + '°, ' + pelletCount + ' plt' },
      { id: 'crazyTrigger',title: 'Extreme Reload',     max: 5,              stat: () => 'crit ' + Math.round(skillCheckCritHalf() * 200) + '%, green ' + Math.round(skillCheckHitHalf() * 200) + '%' },
      { id: 'calmWaves',   title: 'Calm Waves',          max: 5,              stat: () => '−' + Math.round(WAVE_MOD[Math.min(5, upgradeLevels.calmWaves)] * 100) + '% wolves & gold' },
      { id: 'roughWaves',  title: 'Rough Waves',         max: 5,              stat: () => '+' + Math.round(WAVE_MOD[Math.min(5, upgradeLevels.roughWaves)] * 100) + '% wolves & gold' },
      { id: 'focusUp',     title: 'Meat Bait',          max: MAX_FOCUS_LEVEL, stat: () => 'focus ' + Math.round(wolfFocusChance * 100) + '%, +rush' },
      { id: 'focusDown',   title: 'Wolf Repellent',     max: MAX_FOCUS_LEVEL, stat: () => 'focus ' + Math.round(wolfFocusChance * 100) + '%, -rush' },
      { id: 'hatchRate',   title: 'Cozy Coops',         max: 5,              stat: () => 'respawn ' + Math.round((1 - tableAt('hatchRate')) * 100) + '% faster' },
      { id: 'wolfDelay',   title: 'Prep Time',    max: 5,              stat: () => 'wolves wait ' + tableAt('wolfDelay') + 's' },
      { id: 'doubleBarrel',title: 'Double-Barrel',      max: 5,              stat: () => 'damage ×' + tableAt('doubleBarrel').toFixed(2) },
      { id: 'machineGun',  title: 'Machine-Gun',        max: 5,              stat: () => 'fire ×' + tableAt('machineGun').toFixed(2) + ', mag ' + MG_MAG },
      { id: 'reloadMove',  title: 'Action Reload',      max: MAX_LEVEL,       stat: () => 'moving pin ' + reloadRunMul(upgradeLevels.reloadMove).toFixed(2) + '×' },
      { id: 'nerdReload',  title: 'Nerd Reload',        max: 1,              stat: () => 'reload = solve math (wrong jams)' },
      { id: 'jockReload',  title: 'Jock Reload',        max: 1,              stat: () => 'reload = mash SPACE (too slow jams)' },
      { id: 'coldShot',    title: 'Cold Shot',          max: 5,              stat: () => Math.round(COLD_HOT_CHANCE[Math.min(5, upgradeLevels.coldShot)] * 100) + '% freeze (slow + blue)' },
      { id: 'hotShot',     title: 'Hot Shot',           max: 5,              stat: () => Math.round(COLD_HOT_CHANCE[Math.min(5, upgradeLevels.hotShot)] * 100) + '% ignite (burns)' },
      { id: 'counter',     title: 'Melee Strike',       max: 5,              stat: () => Math.round(tableAt('counter') * 100) + '% melee' + (upgradeLevels.counter >= 5 ? ' + AoE' : '') },
      { id: 'sprint',      title: 'Stampede',           max: 5,              stat: () => '+' + Math.round(tableAt('sprint') * 100) + '% sprint' + (upgradeLevels.sprint >= 5 ? ' + trample' : '') },
      { id: 'softBullet',  title: 'Soft Bullets',       max: 5,              stat: () => Math.round(tableAt('softBullet') * 100) + '% spare chance' + (upgradeLevels.softBullet >= 5 ? ' (blue)' : '') },
      { id: 'hardBullet',  title: 'Hard Bullets',       max: 5,              stat: () => '+' + Math.round((tableAt('hardBullet') - 1) * 100) + '% dmg' + (upgradeLevels.hardBullet >= 5 ? ' (red)' : '') },
      { id: 'rust',        title: 'Rusty Springs',      max: 5,              stat: () => upgradeLevels.rust >= 5 ? 'no jams — crits pay $1 each' : '+' + Math.round(tableAt('rust') * 100) + '% jam' },
      { id: 'sword',       title: "Wolf's Blade",       max: 1,              stat: () => 'gun replaced — ' + SWORD_DMG + '-dmg melee swing' },
      { id: 'spinReload',  title: 'Quickdraw',          max: 5,              stat: () => Math.round(tableAt('spinReload') * 100) + '% twirl reload' + (upgradeLevels.spinReload >= 5 ? ', triple dmg' : '') },
      { id: 'snatch',      title: 'Wolf Heist',   max: 5,              stat: () => Math.round(tableAt('snatch') * 100) + '% carry kill off, slowed' },
      { id: 'fatChicken',  title: 'Fat Chickens',       max: 5,              stat: () => 'tier ' + upgradeLevels.fatChicken + '/' + FAT_MAX + ', 1-in-5 fat' + (upgradeLevels.fatChicken >= FAT_MAX ? ', burst' : '') },
      { id: 'dog',         title: 'Dog Friend',         max: 4,              stat: () => dogs.length + (dogs.length === 1 ? ' dog' : ' dogs') + ', lvl ' + upgradeLevels.dog + '/4' },
      { id: 'farm',        title: 'Farm',               max: 5,              stat: () => 'ripen in ' + wavesToFinish() + ' waves, $' + farmReward() },
      { id: 'woodFence',   title: 'Wooden Fence',       max: 5,              stat: () => 'fence ' + tableAt('woodFence') + ' HP' + (upgradeLevels.woodFence >= 5 ? ', spiked' : '') },
      { id: 'stoneWall',   title: 'Stone Wall',         max: 5,              stat: () => 'wall ' + tableAt('stoneWall') + ' HP' + (upgradeLevels.stoneWall >= 5 ? ', spiked' : '') },
      { id: 'dummy',       title: 'Scarecrow',     max: 5,              stat: () => 'scarecrow ' + DUMMY_HP_TABLE[upgradeLevels.dummy] + ' HP' + (upgradeLevels.dummy >= 5 ? ', explodes' : '') },
      { id: 'statue',      title: 'Chicken Statue',     max: 5,              stat: () => 'statue ' + STATUE_HP_TABLE[upgradeLevels.statue] + ' HP, ignored ' + Math.round(STATUE_IGNORE_CHANCE[upgradeLevels.statue] * 100) + '%' },
      { id: 'hunterPower', title: 'Hunter Gear',        max: 5,              stat: () => 'tier ' + upgradeLevels.hunterPower + ' — HP ' + HUNTER_POWER_HP[upgradeLevels.hunterPower] + ', dmg ×' + HUNTER_POWER_DMG[upgradeLevels.hunterPower].toFixed(2) + (upgradeLevels.hunterPower >= 5 ? ', stays' : '') },
      { id: 'workerChicken', title: 'Worker Chickens',  max: 5,              stat: () => Math.round(WORKER_HATCH_CHANCE[upgradeLevels.workerChicken] * 100) + '% hardhat hatch' },
      { id: 'richChicken', title: 'Rich Chickens',      max: 5,              stat: () => Math.round(RICH_HATCH_CHANCE[upgradeLevels.richChicken] * 100) + '% top-hat, +$' + RICH_GOLD_BONUS[upgradeLevels.richChicken] + ' each' },
      { id: 'rocket',      title: 'Rocket Launcher',    max: 5,              stat: () => Math.round(tableAt('rocket') * 100) + '% pellet boom' },
      { id: 'minigun',     title: 'Minigun',            max: 5,              stat: () => '+' + (upgradeLevels.minigun * MINIGUN_MAG_PER_LVL) + ' mag' + (upgradeLevels.minigun >= 5 ? ', spins up' : '') },
      { id: 'mine',        title: 'Explosive Mine',     max: 5,              stat: () => 'mine dmg ' + MINE_DMG[upgradeLevels.mine] + ', r ' + MINE_RADIUS[upgradeLevels.mine].toFixed(1) },
      { id: 'sabotage',    title: 'Sabotage',           max: 5,              stat: () => Math.round(SABOTAGE_DEFECT_CHANCE[upgradeLevels.sabotage] * 100) + '% defective' + (upgradeLevels.sabotage >= 5 ? ', turncoats' : '') },
      { id: 'sizeMatters', title: 'Size Matters',       max: 5,              stat: () => 'shots +' + (upgradeLevels.sizeMatters * SIZE_MATTERS_LIFE_STEP).toFixed(1) + 's, laser +' + (upgradeLevels.sizeMatters * SIZE_MATTERS_LASER_RANGE) + 't' + (upgradeLevels.sizeMatters >= 5 ? ', ricochet' : '') },
      { id: 'rocketBoots', title: 'Rocket Boots',       max: 5,              stat: () => Math.round(ROCKET_BOOTS_CHANCE[upgradeLevels.rocketBoots] * 100) + '%/s lift, ' + ROCKET_BOOTS_DURATION[upgradeLevels.rocketBoots].toFixed(1) + 's flight' },
      { id: 'lastStand',   title: 'Last Stand',         max: 5,              stat: () => '×' + LAST_STAND_DMG_MUL[upgradeLevels.lastStand].toFixed(2) + ' dmg, ×' + (1 / LAST_STAND_FIRE_MUL[upgradeLevels.lastStand]).toFixed(2) + ' rate' + (upgradeLevels.lastStand >= 5 ? ', cloak' : '') },
      { id: 'homing',      title: 'Homing Shots',       max: 5,              stat: () => 'auto-seek, turn ' + HOMING_TURN_BY_LVL[Math.min(upgradeLevels.homing, 5)].toFixed(1) + ', seek ' + HOMING_SEEK_BY_LVL[Math.min(upgradeLevels.homing, 5)] },
      { id: 'laser',       title: 'Laser Shots',        max: 5,              stat: () => 'beam ' + LASER_DMG[upgradeLevels.laser] + ' dmg, ' + LASER_RANGE[upgradeLevels.laser].toFixed(1) + ' tile' },
      { id: 'cryptidRadar', title: 'Cryptid Radar',     max: 5,              stat: () => { const lvl = upgradeLevels.cryptidRadar; const r = CRYPTID_RADAR_RANGE[lvl]; return lvl >= 5 ? 'chance ×2, full-map range' : 'range ' + r + ' tiles'; } },
      { id: 'rooftopper',  title: 'Rooftoppers',        max: 5,              stat: () => rooftoppers.length + '/' + upgradeLevels.rooftopper + ' snipers stationed' },
      // Weapon Oil tracks its own counter (not in upgradeLevels) — `lvl`
      // overrides the filter so it shows up while charges remain.
      { id: 'weaponOil',   title: 'Weapon Oil',         max: 1,              lvl: () => weaponOilCharges, stat: () => weaponOilCharges > 0 ? ('band ' + Math.round(skillCheckHitHalf() * 200) + '%, ' + weaponOilWaves + ' waves left') : 'worn off' },
      { id: 'advancedOil', title: 'Advanced Oil',       max: 1,              lvl: () => advancedOilWaves, stat: () => 'flooded band + crit (this round)' },
      { id: 'hunterCaravan',title: 'Hunter Caravan',    max: 1,              stat: () => huntersGroups + '/3 hunter camps' },
      { id: 'metaverse',   title: 'Metaverse',          max: 1,              stat: () => 'all either/or locks dissolved' },
    ];
    // After Metaverse, owning BOTH halves of an either/or pair collapses the
    // two rows into one named "combo" entry (named per the design's combo table).
    const COMBO_MERGES = [
      { a: 'spreadDown',   b: 'spreadUp',      title: 'Double Helix',    stat: 'both spread patterns' },
      { a: 'focusDown',    b: 'focusUp',       title: 'Mixed Signals',   stat: 'wolves move slower to you' },
      { a: 'coldShot',     b: 'hotShot',       title: 'Thermal Shock',   stat: 'freeze + ignite' },
      { a: 'doubleBarrel', b: 'machineGun',    title: 'Double-Machine',  stat: 'double-barrel + auto-fire' },
      { a: 'softBullet',   b: 'hardBullet',    title: 'Purple Rain',     stat: 'more dmg, less to chickens' },
      { a: 'richChicken',  b: 'workerChicken', title: 'Chicken Society', stat: 'rich + worker chickens' },
      { a: 'calmWaves',    b: 'roughWaves',    title: 'Still Waters',    stat: 'less wolves, more gold' },
      { a: 'rocket',       b: 'minigun',       title: 'Minilauncher',    stat: 'rockets + big mag' },
      { a: 'homing',       b: 'laser',         title: 'Bending Laser',   stat: 'homing laser beam' },
    ];
    const mergeComboUpgrades = (list) => {
      const out = list.slice();
      for (const combo of COMBO_MERGES) {
        const ai = out.findIndex(u => u.id === combo.a);
        const bi = out.findIndex(u => u.id === combo.b);
        if (ai < 0 || bi < 0) continue; // only merge when BOTH halves are owned
        const ua = out[ai], ub = out[bi];
        const merged = {
          id: 'combo_' + combo.a,
          title: combo.title,
          max: Math.min(ua.max, ub.max),
          lvl: () => {
            const la = ua.lvl ? ua.lvl() : (upgradeLevels[ua.id] || 0);
            const lb = ub.lvl ? ub.lvl() : (upgradeLevels[ub.id] || 0);
            return Math.min(la, lb);
          },
          stat: () => combo.stat,
        };
        const lo = Math.min(ai, bi), hi = Math.max(ai, bi);
        out.splice(hi, 1);          // drop the second half
        out.splice(lo, 1, merged);  // replace the first with the merged row
      }
      return out;
    };
    const ownedUpgrades = mergeComboUpgrades(allUpgrades.filter(u => {
      const lvl = u.lvl ? u.lvl() : (upgradeLevels[u.id] || 0);
      return lvl > 0;
    }));

    // ----- Single-panel layout. Active tab is `pauseTab`. -----
    const padX = 22;
    const titleH = 46;
    const headingH = 20;
    const statusRowH = 16;
    const upgradeRowH = 17;
    const navH = 26; // height of the tab-switch button row
    const hintH = 38; // room for the Resume / Quit buttons row

    // Pick panel dimensions for whichever tab is showing.
    let panelW, panelH;
    // Constrain panels to whichever screen height is available so the upgrade
    // list scrolls instead of overflowing off the bottom of the canvas.
    const maxPanelH = H - 24;
    // Number of upgrade rows the scroll box can actually show this frame.
    let upgradeVisibleRows = 0;
    if (pauseTab === 'status') {
      const statusRows = Math.ceil(statusItems.length / 2);
      panelW = Math.min(360, W - 24);
      panelH = Math.min(maxPanelH, titleH + headingH + statusRows * statusRowH + 16 + navH + hintH);
    } else {
      const upgRowCount = Math.max(ownedUpgrades.length, 1);
      panelW = Math.min(420, W - 24);
      // Try to fit everything; if that overflows, cap the panel and let the
      // list scroll inside its own box.
      const ideal = titleH + headingH + upgRowCount * upgradeRowH + 12 + navH + hintH;
      panelH = Math.min(maxPanelH, ideal);
      // How many rows actually fit in the available scroll-box space.
      const reservedAbove = titleH + headingH + 6;
      const reservedBelow = navH + hintH + 6;
      const scrollBoxH = panelH - reservedAbove - reservedBelow;
      upgradeVisibleRows = Math.max(1, Math.floor(scrollBoxH / upgradeRowH));
    }
    const panelX = Math.round((W - panelW) / 2);
    // On mobile, sit the panel near the top so the joystick zone (bottom ~150px) stays clear.
    const panelY = isMobileMode
      ? Math.max(8, Math.min(Math.round((H - panelH) / 2), H - panelH - 155))
      : Math.max(8, Math.round((H - panelH) / 2));

    // Background panel.
    ctx.fillStyle = 'rgba(15, 18, 24, 0.96)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);

    // PAUSED title.
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px "Lucida Console", Consolas, monospace';
    ctx.fillText('PAUSED', panelX + panelW / 2, panelY + 32);

    // Section heading for the current tab.
    let cy = panelY + titleH;
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    ctx.fillText(pauseTab === 'status' ? 'STATUS' : 'UPGRADES', panelX + padX, cy + 12);
    cy += headingH;

    // ----- Tab body -----
    if (pauseTab === 'status') {
      const colW = (panelW - padX * 2) / 2;
      for (let i = 0; i < statusItems.length; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const ix = panelX + padX + col * colW;
        const iy = cy + row * statusRowH + 11;
        ctx.font = '13px "Lucida Console", Consolas, monospace';
        ctx.fillStyle = '#9aa0a8';
        ctx.textAlign = 'left';
        ctx.fillText(statusItems[i][0], ix, iy);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.fillText(String(statusItems[i][1]), ix + colW - 14, iy);
      }
    } else {
      if (ownedUpgrades.length === 0) {
        ctx.fillStyle = '#9aa0a8';
        ctx.textAlign = 'center';
        ctx.font = '13px "Lucida Console", Consolas, monospace';
        ctx.fillText('No upgrades taken yet', panelX + panelW / 2, cy + 14);
      } else {
        const maxScroll = Math.max(0, ownedUpgrades.length - upgradeVisibleRows);
        if (pauseUpgradeScroll > maxScroll) pauseUpgradeScroll = maxScroll;
        // Scroll-box frame — every row is clipped to live inside this box so
        // late picks never spill off the bottom of the panel.
        const boxX = panelX + padX - 6;
        const boxY = cy + 4;
        const boxW = panelW - padX * 2 + 12;
        const boxH = upgradeVisibleRows * upgradeRowH + 8;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'rgba(255,209,102,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
        ctx.save();
        ctx.beginPath();
        ctx.rect(boxX + 1, boxY + 1, boxW - 2, boxH - 2);
        ctx.clip();
        const first = pauseUpgradeScroll;
        const last  = Math.min(ownedUpgrades.length, first + upgradeVisibleRows);
        for (let i = first; i < last; i++) {
          const u = ownedUpgrades[i];
          const lvl = u.lvl ? u.lvl() : (upgradeLevels[u.id] || 0);
          const iy = cy + (i - first) * upgradeRowH + 16;
          // Maxed = functional cap reached — whole row turns blue. Rusty
          // Springs' golden-gun max is yellow instead.
          const maxed = lvl >= u.max;
          const goldMax = maxed && u.id === 'rust';
          // Co-op: world/shared upgrades render in green so it's clear they
          // help both keepers (and the map), not just the local gun.
          const shared = multiplayer && SHARED_UPGRADES.has(u.id);
          ctx.textAlign = 'left';
          ctx.font = '13px "Lucida Console", Consolas, monospace';
          ctx.fillStyle = shared ? '#6fd09a' : goldMax ? '#ffd23f' : maxed ? '#5fd0ff' : '#fff';
          ctx.fillText(u.title, panelX + padX, iy);
          const titleW = ctx.measureText(u.title).width;
          ctx.font = 'bold 12px "Lucida Console", Consolas, monospace';
          ctx.fillStyle = shared ? '#54b87f' : goldMax ? '#ffd23f' : maxed ? '#5fd0ff' : '#ffd166';
          ctx.fillText(toRoman(lvl), panelX + padX + titleW + 6, iy);
          ctx.font = '12px "Lucida Console", Consolas, monospace';
          ctx.fillStyle = shared ? '#6f9a84' : goldMax ? '#d8b84a' : maxed ? '#8fbdd0' : '#9aa0a8';
          ctx.textAlign = 'right';
          ctx.fillText(u.stat(), panelX + panelW - padX, iy);
        }
        ctx.restore();
        // Scrollbar on the right when the list overflows the box.
        if (maxScroll > 0) {
          const trackX = boxX + boxW - 6;
          const trackY = boxY + 2;
          const trackH = boxH - 4;
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fillRect(trackX, trackY, 4, trackH);
          const thumbH = Math.max(12, trackH * (upgradeVisibleRows / ownedUpgrades.length));
          const thumbY = trackY + (trackH - thumbH) * (pauseUpgradeScroll / maxScroll);
          ctx.fillStyle = '#ffd166';
          ctx.fillRect(trackX, thumbY, 4, thumbH);
        }
      }
    }

    // ----- Tab-switch button — sits above the hint, centered. -----
    const navLabel = pauseTab === 'status' ? 'UPGRADES  >' : '<  STATUS';
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    const navTextW = ctx.measureText(navLabel).width;
    const navBtnW = Math.max(180, navTextW + 32);
    const navBtnX = Math.round(panelX + (panelW - navBtnW) / 2);
    const navBtnY = panelY + panelH - hintH - navH + 2;
    pauseTabRect = { x: navBtnX, y: navBtnY, w: navBtnW, h: navH - 4 };
    const navHover = mouse.x >= pauseTabRect.x && mouse.x <= pauseTabRect.x + pauseTabRect.w &&
                     mouse.y >= pauseTabRect.y && mouse.y <= pauseTabRect.y + pauseTabRect.h;
    ctx.fillStyle = navHover ? 'rgba(255, 209, 102, 0.24)' : 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(pauseTabRect.x, pauseTabRect.y, pauseTabRect.w, pauseTabRect.h);
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1;
    ctx.strokeRect(pauseTabRect.x + 0.5, pauseTabRect.y + 0.5, pauseTabRect.w - 1, pauseTabRect.h - 1);
    ctx.fillStyle = '#ffd166';
    ctx.textAlign = 'center';
    ctx.fillText(navLabel, pauseTabRect.x + pauseTabRect.w / 2, pauseTabRect.y + 16);

    // ----- Resume / Quit buttons -----
    const pbH  = 26;
    const pbY  = panelY + panelH - hintH + 6;
    const pbGap = 8;
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    const PAUSE_BTN_LABEL = { resume: 'RESUME', tree: 'TREE', quit: 'QUIT TO MENU' };
    const PAUSE_BTN_COLOR = { resume: '#ffd166', tree: '#7fd0ff', quit: '#ff8a8a' };
    const resumeW = Math.round(ctx.measureText(PAUSE_BTN_LABEL.resume).width) + 32;
    const treeW   = Math.round(ctx.measureText(PAUSE_BTN_LABEL.tree).width) + 26;
    const quitW   = Math.round(ctx.measureText(PAUSE_BTN_LABEL.quit).width) + 32;
    const pbTotalW = resumeW + pbGap + treeW + pbGap + quitW;
    const pbStartX = Math.round(panelX + (panelW - pbTotalW) / 2);

    pauseBtnRects = {
      resume: { x: pbStartX,                                y: pbY, w: resumeW, h: pbH },
      tree:   { x: pbStartX + resumeW + pbGap,              y: pbY, w: treeW,   h: pbH },
      quit:   { x: pbStartX + resumeW + treeW + pbGap * 2,  y: pbY, w: quitW,   h: pbH },
    };

    for (const [key, r] of Object.entries(pauseBtnRects)) {
      const hovered = mouse.x >= r.x && mouse.x <= r.x + r.w &&
                      mouse.y >= r.y && mouse.y <= r.y + r.h;
      ctx.fillStyle = hovered ? 'rgba(255,209,102,0.22)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = PAUSE_BTN_COLOR[key];
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.fillStyle = PAUSE_BTN_COLOR[key];
      ctx.textAlign = 'center';
      ctx.fillText(PAUSE_BTN_LABEL[key], r.x + r.w / 2, r.y + 17);
    }

    ctx.restore();
  }

  function wrapText(text, x, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    let lineCount = 0;
    for (const word of words) {
      const testLine = line ? line + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        // On the last allowed line, clip with an ellipsis instead of spilling
        // past the card (keeps over-long descriptions from bugging out).
        if (maxLines && lineCount >= maxLines - 1) {
          let clipped = line;
          while (clipped && ctx.measureText(clipped + '…').width > maxWidth) {
            clipped = clipped.slice(0, -1);
          }
          ctx.fillText(clipped + '…', x, currentY);
          return;
        }
        ctx.fillText(line, x, currentY);
        line = word;
        currentY += lineHeight;
        lineCount++;
      } else {
        line = testLine;
      }
    }
    if (line) ctx.fillText(line, x, currentY);
  }

  // Shadows: simple ellipse below entity
  function drawShadow(wx, wy, r) {
    const p = worldToScreen(wx, wy);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + TILE_H/2, r * TILE_W/2, r * TILE_H/2, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // Convert a world-space heading into an on-screen angle (isometric squish).
  function worldAngleToScreen(a) {
    const dx = Math.cos(a), dy = Math.sin(a);
    return Math.atan2((dx + dy) * 0.5, dx - dy);
  }

  // A white melee-swing arc: a forward crescent, or a full ring when `full`.
  // `t` is the remaining animation time; the arc expands and fades as it plays.
  function drawMeleeArc(sx, sy, worldDir, full, t, scale = 1, col = '#ffffff') {
    const prog = clamp(1 - t / MELEE_ANIM_DUR, 0, 1);
    const radius = (12 + prog * 13) * scale;
    ctx.save();
    ctx.globalAlpha = (1 - prog) * 0.9;
    ctx.strokeStyle = col;
    ctx.lineWidth = 4.5 * scale * (1 - prog * 0.55);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (full) {
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    } else {
      const ca = worldAngleToScreen(worldDir), span = 2.3; // ~130° crescent
      ctx.arc(sx, sy, radius, ca - span / 2, ca + span / 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ----- Keeper weapon-rendering helpers ---------------------------------
  // The host and the guest's view of the host both need the same gun/sword,
  // muzzle flash and gun-status badge. These helpers consume a "keeper" that
  // carries the animation timers (player or player2) and read the upgrade
  // ladder + ammo state from module-level globals (synced on the guest).

  // Compute the gun's screen-space direction vector (gx, gy) and the y of the
  // grip point. Applies the Quickdraw spin so the gun rotates while reloading.
  function keeperGunVec(keeper, cy) {
    const a = keeper.dir;
    const dirX = Math.cos(a), dirY = Math.sin(a);
    const sxv = (dirX - dirY);
    const syv = (dirX + dirY) * 0.5;
    const m = Math.hypot(sxv, syv) || 1;
    let gx = sxv / m, gy = syv / m;
    const gunY = cy - 18;
    if (keeper.spinT > 0) {
      const prog = 1 - keeper.spinT / SPIN_RELOAD_TIME;
      const sa = prog * Math.PI * 2;
      const cs = Math.cos(sa), sn = Math.sin(sa);
      const rgx = gx * cs - gy * sn;
      gy = gx * sn + gy * cs;
      gx = rgx;
    }
    return { gx, gy, gunY };
  }

  // Short wooden butt behind the body. Drawn BEFORE the body so the body
  // partially hides it (like a shouldered gun).
  function drawKeeperStock(cx, gunY, gx, gy, keeper) {
    // When given a keeper, respect that keeper's upgrade ladder (P2 in
    // individual-upgrade mode may not have the sword even if P1 does).
    const ulvls = keeper ? lvlsFor(keeper) : upgradeLevels;
    if (ulvls.sword >= 1) return; // no stock when carrying the sword
    ctx.save();
    ctx.strokeStyle = '#7a4f25';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, gunY);
    ctx.lineTo(cx - gx * 7, gunY - gy * 7);
    ctx.stroke();
    ctx.restore();
  }

  // Sword (Wolf's Blade) or shotgun + decorations + muzzle flash.
  function drawKeeperWeapon(keeper, cx, cy, gunY, gx, gy) {
    // Per-keeper upgrade ladder + chamber state — player2 has its own.
    const ulvls = lvlsFor(keeper);
    const cham = keeper.chambered;
    if (ulvls.sword >= 1) {
      const px0 = -gy, py0 = gx;       // perpendicular to the blade
      const bladeLen = 24;
      ctx.lineCap = 'round';
      // Grip behind the hand.
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(cx - gx * 6, gunY - gy * 6);
      ctx.lineTo(cx, gunY);
      ctx.stroke();
      // Pommel.
      ctx.fillStyle = '#caa24a';
      ctx.beginPath();
      ctx.arc(cx - gx * 6, gunY - gy * 6, 2, 0, Math.PI * 2);
      ctx.fill();
      // Crossguard.
      ctx.strokeStyle = '#caa24a';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(cx + px0 * 4.5, gunY + py0 * 4.5);
      ctx.lineTo(cx - px0 * 4.5, gunY - py0 * 4.5);
      ctx.stroke();
      // Blade.
      ctx.strokeStyle = '#dde2ea';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(cx + gx * 2, gunY + gy * 2);
      ctx.lineTo(cx + gx * bladeLen, gunY + gy * bladeLen);
      ctx.stroke();
      // Edge highlight along the outer half of the blade.
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx + gx * (bladeLen * 0.5), gunY + gy * (bladeLen * 0.5));
      ctx.lineTo(cx + gx * bladeLen, gunY + gy * bladeLen);
      ctx.stroke();
      return;
    }
    // Barrel — uses the screen direction. Grows a touch with each Longer Barrel pick.
    const barrelLength = (16 + Math.min((ulvls.range || 0) + (ulvls.sizeMatters || 0) * SIZE_MATTERS_BARREL_MUL, MAX_RANGE_LEVEL) * 0.6) * barrelBonusMul;
    let barrelColor = '#2b2b2b';
    if (keeper.jamT > 0 || keeper.jamFlashT > 0) barrelColor = '#ff3c3c';
    else if (ulvls.rust >= 5)         barrelColor = '#ffcf3a'; // golden gun
    else if (ulvls.rust > 0)          barrelColor = RUST_COLORS[ulvls.rust];
    else if (!cham)                   barrelColor = '#6a6a6a';
    ctx.strokeStyle = barrelColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, gunY);
    ctx.lineTo(cx + gx * barrelLength, gunY + gy * barrelLength);
    ctx.stroke();
    ctx.fillStyle = '#6b3f1e';
    ctx.beginPath();
    ctx.arc(cx + gx * 4, gunY + gy * 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    const px = -gy, py = gx;
    if (ulvls.spreadUp >= MAX_LEVEL) {
      // Loose Pattern MAX: muzzle flare into a funnel.
      const tipX = cx + gx * barrelLength, tipY = gunY + gy * barrelLength;
      const baseX = cx + gx * (barrelLength - 5), baseY = gunY + gy * (barrelLength - 5);
      ctx.fillStyle = barrelColor;
      ctx.beginPath();
      ctx.moveTo(baseX + px * 1.5, baseY + py * 1.5);
      ctx.lineTo(tipX + px * 4, tipY + py * 4);
      ctx.lineTo(tipX - px * 4, tipY - py * 4);
      ctx.lineTo(baseX - px * 1.5, baseY - py * 1.5);
      ctx.closePath();
      ctx.fill();
    }
    // Independent of the funnel, so owning BOTH (metaverse) shows the funnel AND
    // the scope rather than just one.
    if (ulvls.spreadDown >= MAX_LEVEL) {
      // Tighter Pattern MAX: scope on top.
      const mx2 = cx + gx * (barrelLength * 0.4), my2 = gunY + gy * (barrelLength * 0.4);
      const ax = mx2 + px * 4, ay = my2 + py * 4;
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx2, my2); ctx.lineTo(ax, ay);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(ax - gx * 3, ay - gy * 3); ctx.lineTo(ax + gx * 3, ay + gy * 3);
      ctx.stroke();
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(ax + gx * 3, ay + gy * 3, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (ulvls.doubleBarrel > 0) {
      ctx.strokeStyle = barrelColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + px * 3, gunY + py * 3);
      ctx.lineTo(cx + gx * (barrelLength - 2) + px * 3, gunY + gy * (barrelLength - 2) + py * 3);
      ctx.stroke();
    }
    if (ulvls.machineGun > 0) {
      let dnx = px, dny = py;
      if (dny < 0) { dnx = -dnx; dny = -dny; }
      const mbx = cx + gx * 5, mby = gunY + gy * 5;
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(mbx, mby);
      ctx.lineTo(mbx + dnx * 8, mby + dny * 8);
      ctx.stroke();
    }
    // Rocket Launcher MAX: a fat grenade-launcher tube slung UNDER the barrel,
    // toward the back — reads as an under-barrel launcher, not a muzzle warhead.
    if (ulvls.rocket >= 5) {
      let dnx = px, dny = py;
      if (dny < 0) { dnx = -dnx; dny = -dny; } // perpendicular pointing down-screen
      const undX = cx + dnx * 3.2, undY = gunY + dny * 3.2; // dropped beneath the barrel
      const startT = 1, endT = Math.min(barrelLength * 0.55, 16); // back/mid portion only
      const sX = undX + gx * startT, sY = undY + gy * startT;
      const eX = undX + gx * endT,   eY = undY + gy * endT;
      // Tube body — a thick stubby cylinder.
      ctx.strokeStyle = '#3a3a44';
      ctx.lineCap = 'round';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(sX, sY);
      ctx.lineTo(eX, eY);
      ctx.stroke();
      // A red warning band near the breech.
      ctx.strokeStyle = '#d83b2a';
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(sX + gx * 1.4, sY + gy * 1.4);
      ctx.lineTo(sX + gx * 3.0, sY + gy * 3.0);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Dark muzzle ring at the tube's mouth.
      ctx.fillStyle = '#1d1d22';
      ctx.beginPath();
      ctx.arc(eX, eY, 2.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Homing Bullets MAX: a small radar dish + dot perched on the barrel.
    if (ulvls.homing >= 5) {
      // A little cryptid-style radar antenna on the barrel: a thin mast, a
      // small parabolic dish on a short arm, and a pulsing receiver dot.
      const mountT = barrelLength * 0.5;
      const baseX = cx + gx * mountT, baseY = gunY + gy * mountT;
      const topX = baseX + px * 4, topY = baseY + py * 4; // mast top, perpendicular to barrel
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(topX, topY);
      ctx.stroke();
      // Short arm + small dish (half-ellipse) opening forward along the barrel.
      ctx.save();
      ctx.translate(topX, topY);
      ctx.rotate(Math.atan2(gy, gx));
      const dr = 2.6;
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(dr * 0.8, 0);
      ctx.stroke();
      ctx.fillStyle = '#c8c8d0';
      ctx.beginPath();
      ctx.ellipse(dr * 0.9, 0, dr * 0.55, dr, 0, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2a2a30';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // Pulsing receiver dot at the focal point.
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.012);
      ctx.fillStyle = 'rgba(255,80,80,' + (0.5 + 0.4 * pulse).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(dr * 0.4, 0, 0.9 + 0.3 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Laser Bullets MAX: emitter ring + small glow at the tip so the gun reads
    // as a "beam" weapon. The tip takes the actual beam colour — yellow by
    // default, or red/blue under Hard/Soft Bullets — matching the shot.
    if (ulvls.laser >= 5) {
      const laserCol = projectileColor(ulvls, false);
      const tipX = cx + gx * (barrelLength + 1);
      const tipY = gunY + gy * (barrelLength + 1);
      ctx.strokeStyle = laserCol;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 3.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = laserCol;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // A small charge-band halfway down the barrel.
      ctx.fillStyle = laserCol;
      const midT = barrelLength * 0.5;
      ctx.beginPath();
      ctx.arc(cx + gx * midT, gunY + gy * midT, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Minigun MAX: drum magazine slung UNDER the barrel — reads as the
    // fat ammo can a real minigun feeds from. Drawn perpendicular to the
    // gun's aim direction so it stays under the barrel at any angle.
    if (ulvls.minigun >= 5) {
      // Pick a spot one-third down the barrel as the drum mount.
      const mountT = barrelLength * 0.35;
      const mountX = cx + gx * mountT;
      const mountY = gunY + gy * mountT;
      // Perpendicular vector pointing "down" relative to the barrel — `py`
      // is already > 0 for most aims; flip if we'd end up above the gun.
      let dnx = px, dny = py;
      if (dny < 0) { dnx = -dnx; dny = -dny; }
      const dropX = mountX + dnx * 4;
      const dropY = mountY + dny * 4;
      // Drum body — dark grey can.
      ctx.fillStyle = '#1f1f24';
      ctx.beginPath();
      ctx.ellipse(dropX, dropY, 4.2, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // Centre rivet hint so the drum reads as a rotating mag.
      ctx.fillStyle = '#3a3a42';
      ctx.beginPath();
      ctx.arc(dropX, dropY, 1.1, 0, Math.PI * 2);
      ctx.fill();
      // Feed strap from the drum up to the receiver — short line of brass.
      ctx.strokeStyle = '#caa24a';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(mountX + dnx * 1.4, mountY + dny * 1.4);
      ctx.lineTo(dropX - dnx * 1.4, dropY - dny * 1.4);
      ctx.stroke();
    }
    // Muzzle flash — bright yellow puff right after firing. A jammed dud sets
    // the cooldown too, so suppress the flash while the jam-flash is up.
    if (keeper.reloadT > 0.3 && !(keeper.jamFlashT > 0)) {
      ctx.fillStyle = 'rgba(255,220,80,0.9)';
      ctx.beginPath();
      ctx.arc(cx + gx * (barrelLength + 2), gunY + gy * (barrelLength + 2), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Gun-status indicator (small square above the hat stack).
  function drawKeeperBadge(keeper, cx, cy, hatCount) {
    const HAT_STEP = 5;
    const hatTopY = hatCount > 0 ? cy - 38 - (hatCount - 1) * HAT_STEP : cy - 36;
    const badgeY = hatTopY - 7;
    // Weapon state always lives on the keeper object.
    const reloadingTv = keeper.reloadingT || 0;
    const chamberedv  = keeper.chambered;
    let badgeColor;
    const jamVis = Math.max(keeper.jamT || 0, keeper.jamFlashT || 0); // root jam OR cosmetic dud flash
    if (jamVis > 0) badgeColor = (Math.floor(jamVis * 12) & 1) ? '#ff3c3c' : '#3a0000';
    else if (reloadingTv > 0) badgeColor = '#ffd166';
    else if (chamberedv) badgeColor = '#4be04b';
    else badgeColor = '#888';
    ctx.fillStyle = badgeColor;
    ctx.fillRect(cx - 2, badgeY, 4, 4);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 2, badgeY, 4, 4);
    if (jamVis > 0) {
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx - 2, badgeY); ctx.lineTo(cx + 2, badgeY + 4);
      ctx.moveTo(cx + 2, badgeY); ctx.lineTo(cx - 2, badgeY + 4);
      ctx.stroke();
    }
  }

  // Draw one hat in the keeper's hat stack. Most hats are a flat brim + a
  // boxy crown; the witch-hat colour (earned by surviving a Night of the
  // Wolf) draws as a pointed cone instead — but only when it's the topmost
  // hat, so a witch hat buried in the stack doesn't stick up through others.
  function drawHat(cx, by, color, hurt, isTop) {
    const fill = hurt ? '#c0392b' : color;
    const isWitch = color === NIGHT_OF_WOLF_WITCH_HAT_COLOR;
    const isLeprechaun = color === LEPRECHAUN_HAT_COLOR;
    ctx.fillStyle = fill;
    if (isWitch && isTop) {
      // Wide brim.
      ctx.beginPath();
      ctx.ellipse(cx, by, 10, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Pointed cone above the brim, with a slight forward lean.
      ctx.beginPath();
      ctx.moveTo(cx - 5, by - 1);
      ctx.lineTo(cx + 5, by - 1);
      ctx.lineTo(cx + 2, by - 13);
      ctx.closePath();
      ctx.fill();
      // Star buckle on the brim — a tiny gold rectangle.
      ctx.fillStyle = hurt ? '#c0392b' : '#ffd166';
      ctx.fillRect(cx - 1.5, by - 1.4, 3, 1.8);
    } else if (isLeprechaun && isTop) {
      // Wide flat brim.
      ctx.beginPath();
      ctx.ellipse(cx, by, 9, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tall stovepipe crown for the leprechaun silhouette.
      ctx.fillRect(cx - 4, by - 9, 8, 8);
      // Gold buckle band — a darker green strap behind a square gold buckle.
      ctx.fillStyle = hurt ? '#7a1a1a' : '#0e3d0e';
      ctx.fillRect(cx - 4, by - 3, 8, 1.6);
      ctx.fillStyle = hurt ? '#c0392b' : '#ffd166';
      ctx.fillRect(cx - 1.6, by - 3.4, 3.2, 2.4);
      ctx.fillStyle = hurt ? '#7a1a1a' : '#caa024';
      ctx.fillRect(cx - 1, by - 3, 2, 1.6);
    } else {
      // Standard brim + boxy crown.
      ctx.beginPath();
      ctx.ellipse(cx, by, 8, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 5, by - 4, 10, 4);
    }
  }

  // Side effects when a special hat falls off the player's stack: witch hat
  // teleports the keeper somewhere safe with a shimmer, leprechaun hat pays
  // a $100 jackpot. Called on every player-1 hat loss (wolf bite, friendly
  // fire, ranged wolf pellet).
  function onHatLost(color) {
    if (color === NIGHT_OF_WOLF_WITCH_HAT_COLOR) {
      // Pick a random map tile that's open (no fence, inside the bounds) and
      // teleport the player there.
      const r = HALF_MAP - 2;
      let nx = player.x, ny = player.y;
      for (let i = 0; i < 24; i++) {
        const tx = rand(-r, r), ty = rand(-r, r);
        if (!fenceBlocks(tx, ty)) { nx = tx; ny = ty; break; }
      }
      player.x = nx;
      player.y = ny;
      playMagic();
      toast('The witch hat saves you — *poof*', 1.8);
    } else if (color === LEPRECHAUN_HAT_COLOR) {
      money += LEPRECHAUN_PAYOUT;
      runMoneyEarned += LEPRECHAUN_PAYOUT;
      playMoney();
      toast('Lucky hat!  Jackpot — +$' + LEPRECHAUN_PAYOUT, 1.8);
    }
  }

  function drawPlayer() {
    if (!player.ghost) drawShadow(player.x, player.y, 0.3);
    const p = worldToScreen(player.x, player.y);
    const cx = p.x;
    const cy = p.y + TILE_H/2;
    // Per-state offsets:
    //  - Flying lifts the whole sprite off the ground.
    //  - Crouch nudges the body down slightly so it reads as a crouch.
    //  - Stealth fades the keeper to a near-invisible silhouette.
    const flying = (player.flightT || 0) > 0;
    const crouched = lastStandCrouched(player);
    const stealth = !!player.lastStandStealth;
    // Flying lifts the whole sprite off the ground.
    // Crouch is now an actual pose: the upper body sinks ~6 px and the
    // legs draw as bent thighs+shins planting the feet on the ground —
    // no more vertical squish. The body group uses `crouchYAdd`; the legs
    // branch into their own crouched render below.
    const liftY = flying ? 12 : 0;
    const crouchYAdd = crouched ? 6 : 0;
    // Render the character a little smaller, scaled around the feet.
    ctx.save();
    // Ghost keepers render translucent — they've died but still wander.
    if (player.ghost) ctx.globalAlpha = 0.45;
    if (stealth) ctx.globalAlpha *= 0.22;
    const PLAYER_SCALE = 0.9;
    ctx.translate(cx, cy - liftY);
    ctx.scale(PLAYER_SCALE, PLAYER_SCALE);
    ctx.translate(-cx, -cy);
    // Dance stun — rock side to side with little hops about the feet.
    if ((player.danceT || 0) > 0) {
      const t = player.danceAnimT || 0;
      const sway = Math.sin(t * 16) * 0.30;
      const hop = Math.abs(Math.sin(t * 9)) * 5;
      ctx.translate(cx, cy - hop);
      ctx.rotate(sway);
      ctx.translate(-cx, -cy);
    }
    // Parry Mode dodge-roll — the keeper tumbles a full forward roll about its
    // midriff over the dash, spinning the way it's travelling. A little hop in
    // the middle of the roll sells the somersault.
    if ((player.dashT || 0) > 0) {
      const prog = 1 - clamp((player.dashT || 0) / PLAYER_DASH_DUR, 0, 1);
      const spinDir = ((player.dashX || 0) - (player.dashY || 0)) >= 0 ? 1 : -1;
      const hop = Math.sin(prog * Math.PI) * 6; // peaks mid-roll
      const pivX = cx, pivY = cy - 12;           // tumble about the torso centre
      ctx.translate(pivX, pivY - hop);
      ctx.rotate(prog * Math.PI * 2 * spinDir);
      ctx.translate(-pivX, -pivY);
    }
    // Death: a downed keeper topples flat onto the ground before becoming a
    // ghost (multiplayer) or the death screen (single-player). Rotate the whole
    // sprite about the feet from upright to ~85°, eased so it drops fast then
    // settles. player.downT is ticked while dying in tickKeeperDeaths().
    const downed = !!player.dying;
    if (downed) {
      const FALL_DUR = 0.45;
      const f = Math.min(1, (player.downT || 0) / FALL_DUR);
      const ease = 1 - (1 - f) * (1 - f); // ease-out
      const ang = ease * 1.48;            // ~85° — body lies along the ground
      const pivX = cx, pivY = cy - 2;     // pivot at the feet
      ctx.translate(pivX, pivY);
      ctx.rotate(ang);
      ctx.translate(-pivX, -pivY);
    }
    // While hurtT is active (just took a hit), the body parts flash red.
    const hurt = player.hurtT > 0;
    // Parry Mode: while the dodge-roll is recharging (the 2s delay), the keeper
    // flushes red as a cooldown tell — strongest right after the roll, fading
    // back to normal as it comes off cooldown.
    const dashCoolFrac = (parryMode && (player.dashT || 0) <= 0)
      ? clamp((player.dashCd || 0) / PLAYER_DASH_CD, 0, 1) : 0;
    // On a guest client this function is rendering the guest keeper — the
    // same character the host sees as player2. Both keepers now carry guns,
    // so the stock/barrel/badge are drawn either way; the guest keeper uses
    // its own (P2) weapon state when in individual-upgrade mode.
    const isGuestSelf = multiplayer && !isHost;
    // Pre-compute the gun's screen direction so the stock can be drawn BEFORE
    // the body (body partially hides the butt) while the barrel is drawn
    // afterward, on top. When crouched the gun also lowers with the torso.
    const gunVec = keeperGunVec(player, cy + crouchYAdd);
    const gx = gunVec.gx, gy = gunVec.gy, gunY = gunVec.gunY;
    // `player` always represents the LOCAL keeper here, so its weapon fields
    // hold the right state on either side of the wire (host sync vs guest
    // snapshot apply, both write into player.chambered etc.). Ghosts skip.
    if (!player.ghost) drawKeeperStock(cx, gunY, gx, gy, player);
    // Body — shirt tint comes from this keeper's own karma.
    ctx.fillStyle = hurt ? '#ff5555' : shirtColorOf(player);
    roundedRect(cx - 7, cy - 25 + crouchYAdd, 14, 17, 3);
    // Head
    ctx.fillStyle = hurt ? '#ff8a8a' : '#f1c27d';
    ctx.beginPath();
    ctx.arc(cx, cy - 30 + crouchYAdd, 6, 0, Math.PI*2);
    ctx.fill();
    // Dash-cooldown flush — a translucent red wash over the FACE only while the
    // dodge-roll recharges (skipped when already flashing from a hit).
    if (dashCoolFrac > 0 && !hurt) {
      ctx.save();
      ctx.globalAlpha = 0.4 * dashCoolFrac;
      ctx.fillStyle = '#ff3030';
      ctx.beginPath();
      ctx.arc(cx, cy - 30 + crouchYAdd, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // FANGUS-kill trophy mustache — widens with each boss kill. Only the keeper
    // who earned it wears one.
    if ((player.mustache || 0) > 0 && !player.ghost) drawMustache(cx, cy - 30 + crouchYAdd, player.mustache, player.mustacheAge);
    // Hats — the player's health. Starts at START_HATS, stacked on the head;
    // each wolf hit knocks the top one off until none remain.
    // Skipped during dash: drawDashHats() renders them scattered in screen space.
    const HAT_STEP = 5;
    if ((player.dashT || 0) <= 0) {
      // Post-hit invincibility cue — the hat stack goes translucent and
      // flickers while the wolfHitT window runs, so the i-frames are readable.
      const iframesOn = (player.wolfHitT || 0) > 0 && !player.ghost;
      if (iframesOn) {
        ctx.save();
        ctx.globalAlpha *= 0.25 + (Math.floor(Date.now() / 90) % 2) * 0.4;
      }
      for (let i = 0; i < playerHats; i++) {
        const by = cy - 34 + crouchYAdd - i * HAT_STEP;
        const baseHat = isGuestSelf ? GUEST_HAT_COLOR : (hatColors[i] || '#5a3825');
        drawHat(cx, by, baseHat, hurt, i === playerHats - 1);
      }
      if (iframesOn) ctx.restore();
    }
    // Legs — alternate lifting while walking. When crouched, swap to a
    // proper one-knee kneeling pose: back knee resting on the ground with
    // the shin folded under the body, front foot planted forward with the
    // knee bent. Reads as a sniper kneel, not a wide squat.
    ctx.fillStyle = hurt ? '#7a1a1a' : '#222';
    if (crouched) {
      const hipY = cy - 8 + crouchYAdd; // base of the lowered torso
      const footY = cy - 2;              // ground line stays put
      ctx.strokeStyle = hurt ? '#7a1a1a' : '#222';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Front leg (left of body): thigh + shin form a sharp triangle with the
      // foot extended forward and the knee bent up — like a runner's stance.
      ctx.beginPath();
      ctx.moveTo(cx - 3, hipY);
      ctx.lineTo(cx - 7, footY - 4); // knee bent up
      ctx.lineTo(cx - 4, footY);     // foot planted forward
      ctx.stroke();
      // Back leg (right of body): thigh slopes down to a knee resting on the
      // ground; shin folds backward under the body. The "L" silhouette is
      // what reads as kneeling.
      ctx.beginPath();
      ctx.moveTo(cx + 3, hipY);
      ctx.lineTo(cx + 4, footY);     // knee touches the ground
      ctx.lineTo(cx + 1, footY);     // shin folds back under the hip
      ctx.stroke();
      // Boots — small dark caps on the planted foot and the kneeling shin.
      ctx.fillStyle = hurt ? '#5a1010' : '#101015';
      ctx.fillRect(cx - 6, footY - 0.5, 4, 2); // front foot, slightly larger
      ctx.fillRect(cx,     footY - 0.5, 4, 2); // back foot folded under
    } else {
      const legPhase = player.moving ? Math.sin(player.walkT) : 0;
      const lLift = Math.max(0, legPhase) * 2;
      const rLift = Math.max(0, -legPhase) * 2;
      ctx.fillRect(cx - 5, cy - 10, 3, 8 - lLift);
      ctx.fillRect(cx + 2, cy - 10, 3, 8 - rLift);
    }
    // Weapon (sword or gun + decorations + muzzle flash) — both keepers now
    // carry a gun, so draw it for everyone. Ghosts wander empty-handed.
    if (!player.ghost) {
      drawKeeperWeapon(player, cx, cy + crouchYAdd, gunY, gx, gy);
      // No gun-status badge once the keeper is down — the green square would
      // float over the toppled body.
      if (!downed) drawKeeperBadge(player, cx, cy + crouchYAdd, playerHats);
    }
    ctx.restore();
    // Dance stun — a couple of jaunty music notes bob up over the keeper.
    if ((player.danceT || 0) > 0) {
      const t = player.danceAnimT || 0;
      ctx.save();
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#ffe27a';
      ctx.fillText('♪', cx + 12 + Math.sin(t * 5) * 3, cy - 42 - ((t * 9) % 16));
      ctx.fillStyle = '#9fe6ff';
      ctx.fillText('♫', cx - 16 + Math.cos(t * 4) * 3, cy - 48 - (((t * 9) + 8) % 16));
      ctx.restore();
    }
    // Rocket exhaust shooting down from under the lifted boots — anchored to
    // the airborne feet (cy - liftY), so the jets follow the flying keeper
    // instead of sitting on the ground where they took off.
    if (flying) {
      const flickT = Date.now() * 0.04;
      const footY = cy - liftY; // the lifted boot line
      for (const off of [-3, 3]) {
        // Outer dim flame.
        ctx.fillStyle = 'rgba(255,150,40,0.65)';
        ctx.beginPath();
        ctx.ellipse(cx + off, footY + 1, 2.4, 4 + Math.sin(flickT + off) * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Hot bright core.
        ctx.fillStyle = 'rgba(255,236,150,0.9)';
        ctx.beginPath();
        ctx.ellipse(cx + off, footY, 1.2, 2.2 + Math.cos(flickT * 1.7 + off) * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Crouch lowers the body group — overlays that float above the keeper
    // (melee arc, skill-check bar) need to track that drop so they stay
    // anchored above the now-lower head/hats.
    // Melee-swing arc — drawn unscaled, around the player's torso.
    if (player.meleeT > 0) {
      drawMeleeArc(cx, cy - 16 - liftY + crouchYAdd, player.meleeDir, player.meleeFull, player.meleeT);
    }
    // Reload skill-check bar — fixed position just above the keeper's head
    // regardless of how many hats are stacked. The hats may extend above
    // the bar at higher counts but the bar itself stays put.
    if (player.skillCheckActive) {
      drawReloadSkillCheck(cx, cy - 44 - liftY + crouchYAdd, player);
    }
    if (nerdActive) drawNerdReload(cx, cy - 50 - liftY + crouchYAdd);
    if (jockActive) drawJockReload(cx, cy - 50 - liftY + crouchYAdd);
  }

  // Nerd Reload prompt — a little chalkboard with the math question and the
  // digits the player has typed so far.
  function drawNerdReload(cx, cy) {
    if (!nerdQ) return;
    const txt = nerdQ.text;
    const ans = nerdInput || '_';
    ctx.font = 'bold 11px "Lucida Console", Consolas, monospace';
    const w = Math.max(54, ctx.measureText(txt).width + 16);
    const h = 26;
    const x = cx - w / 2, y = cy - h;
    ctx.fillStyle = 'rgba(18,30,22,0.92)';      // chalkboard green-black
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#caa24a';                 // wood frame
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf3ea';
    ctx.fillText(txt, cx, y + 11);
    ctx.fillStyle = '#ffe27a';
    ctx.font = 'bold 12px "Lucida Console", Consolas, monospace';
    ctx.fillText(ans, cx, y + 23);
  }

  // Jock Reload meter — a draining timer bar plus pump-up pips. Mash SPACE.
  function drawJockReload(cx, cy) {
    const w = 60, h = 6;
    const x = cx - w / 2, y = cy - h;
    const frac = Math.max(0, jockTimeLeft / JOCK_RELOAD_TIME);
    const fillFrac = Math.min(1, jockPresses / JOCK_RELOAD_PRESSES);
    // Backing + timer drain.
    ctx.fillStyle = 'rgba(20,20,28,0.85)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#5a2a2a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = frac < 0.3 ? '#ff5a3a' : '#ffb13a'; // time remaining
    ctx.fillRect(x, y, w * frac, h);
    // Progress toward the press target (green from the left).
    ctx.fillStyle = '#3aa84a';
    ctx.fillRect(x, y, w * fillFrac, h);
    // Label.
    ctx.font = 'bold 9px "Lucida Console", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = (Math.floor(Date.now() / 90) % 2) ? '#fff' : '#ffe27a';
    ctx.fillText('MASH SPACE!', cx, y - 3);
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // Second player — drawn like the keeper but in blue. Carries its own hat
  // stack as health, flashes red when hit.
  function drawPlayer2() {
    if (!player2.ghost) drawShadow(player2.x, player2.y, 0.3);
    const p = worldToScreen(player2.x, player2.y);
    const cx = p.x;
    const cy = p.y + TILE_H / 2;
    const flying2 = (player2.flightT || 0) > 0;
    const crouched2 = lastStandCrouched(player2);
    const stealth2 = !!player2.lastStandStealth;
    const liftY2 = flying2 ? 12 : 0;
    const crouchYAdd2 = crouched2 ? 6 : 0;
    ctx.save();
    // Ghost buddy renders translucent — they died but still wander.
    if (player2.ghost) ctx.globalAlpha = 0.45;
    if (stealth2) ctx.globalAlpha *= 0.22;
    const PLAYER_SCALE = 0.9;
    ctx.translate(cx, cy - liftY2);
    ctx.scale(PLAYER_SCALE, PLAYER_SCALE);
    ctx.translate(-cx, -cy);
    // Dance stun — rock side to side with little hops (mirrors player1) so the
    // other keeper sees the jig in co-op.
    if ((player2.danceT || 0) > 0) {
      const t = player2.danceAnimT || 0;
      const sway = Math.sin(t * 16) * 0.30;
      const hop = Math.abs(Math.sin(t * 9)) * 5;
      ctx.translate(cx, cy - hop);
      ctx.rotate(sway);
      ctx.translate(-cx, -cy);
    }
    // Parry dash roll — same tumble as player1, synced via dashT from network.
    if ((player2.dashT || 0) > 0) {
      const prog2 = 1 - clamp((player2.dashT || 0) / PLAYER_DASH_DUR, 0, 1);
      const spinDir2 = ((player2.dashX || 0) - (player2.dashY || 0)) >= 0 ? 1 : -1;
      const hop2 = Math.sin(prog2 * Math.PI) * 6;
      ctx.translate(cx, cy - 12 - hop2);
      ctx.rotate(prog2 * Math.PI * 2 * spinDir2);
      ctx.translate(-cx, -(cy - 12));
    }
    // Death fall — same topple as player1, before the buddy turns to a ghost.
    const downed2 = !!player2.dying;
    if (downed2) {
      const FALL_DUR = 0.45;
      const f = Math.min(1, (player2.downT || 0) / FALL_DUR);
      const ease = 1 - (1 - f) * (1 - f);
      const ang = ease * 1.48;
      const pivX = cx, pivY = cy - 2;
      ctx.translate(pivX, pivY);
      ctx.rotate(ang);
      ctx.translate(-pivX, -pivY);
    }
    const hurt = player2.hurtT > 0;
    // Both keepers now carry weapons — always draw player2's gun (unless they
    // are a ghost), regardless of which side of the wire we're on.
    const showWeapon = !player2.ghost;
    // Pre-compute gun vector so the stock can be drawn before the body.
    const gunVec = keeperGunVec(player2, cy + crouchYAdd2);
    const gx = gunVec.gx, gy = gunVec.gy, gunY = gunVec.gunY;
    if (showWeapon) drawKeeperStock(cx, gunY, gx, gy, player2);
    // Body — shirt tint comes from player2's own karma so both keepers can
    // read each other's morality at a glance.
    ctx.fillStyle = hurt ? '#ff5555' : shirtColorOf(player2);
    roundedRect(cx - 7, cy - 25 + crouchYAdd2, 14, 17, 3);
    // Head
    ctx.fillStyle = hurt ? '#ff8a8a' : '#f1c27d';
    ctx.beginPath();
    ctx.arc(cx, cy - 30 + crouchYAdd2, 6, 0, Math.PI * 2);
    ctx.fill();
    // FANGUS-kill trophy mustache — widens with each boss kill.
    if ((player2.mustache || 0) > 0 && !player2.ghost) drawMustache(cx, cy - 30 + crouchYAdd2, player2.mustache, player2.mustacheAge);
    // Hat stack — same mechanic as player1: one per remaining HP.
    // Each client receives the host's authoritative hatColors array via the
    // snapshot, so a Buy-Hat green hat shows up on both screens. Falls back
    // to the role default (host's view of guest = straw; guest's view of an
    // un-synced host = brown) when no array is available yet.
    const HAT_STEP = 5;
    const hatCount = Math.max(0, player2.hats || 0);
    const haveColors = Array.isArray(player2.hatColors) && player2.hatColors.length > 0;
    const fallbackHat = isHost ? GUEST_HAT_COLOR : '#5a3825';
    // Skipped during buddy's dash — drawDashHats() renders them in screen space.
    if ((player2.dashT || 0) <= 0) {
      // Same post-hit invincibility flicker as player1 (wolfHitT is synced).
      const iframesOn2 = (player2.wolfHitT || 0) > 0 && !player2.ghost;
      if (iframesOn2) {
        ctx.save();
        ctx.globalAlpha *= 0.25 + (Math.floor(Date.now() / 90) % 2) * 0.4;
      }
      for (let i = 0; i < hatCount; i++) {
        const by = cy - 34 + crouchYAdd2 - i * HAT_STEP;
        const baseHat = haveColors ? (player2.hatColors[i] || fallbackHat) : fallbackHat;
        drawHat(cx, by, baseHat, hurt, i === hatCount - 1);
      }
      if (iframesOn2) ctx.restore();
    }
    // Legs — crouched pose mirrors player1's bent-knee stance; otherwise
    // alternate the normal walking peg legs.
    ctx.fillStyle = hurt ? '#7a1a1a' : '#222';
    if (crouched2) {
      // Same one-knee kneel as player1: front foot forward with bent knee,
      // back knee resting on the ground with shin folded under the body.
      const hipY = cy - 8 + crouchYAdd2;
      const footY = cy - 2;
      ctx.strokeStyle = hurt ? '#7a1a1a' : '#222';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 3, hipY); ctx.lineTo(cx - 7, footY - 4); ctx.lineTo(cx - 4, footY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 3, hipY); ctx.lineTo(cx + 4, footY); ctx.lineTo(cx + 1, footY);
      ctx.stroke();
      ctx.fillStyle = hurt ? '#5a1010' : '#101015';
      ctx.fillRect(cx - 6, footY - 0.5, 4, 2);
      ctx.fillRect(cx,     footY - 0.5, 4, 2);
    } else {
      const legPhase = player2.moving ? Math.sin(player2.walkT) : 0;
      const lLift = Math.max(0, legPhase) * 2;
      const rLift = Math.max(0, -legPhase) * 2;
      ctx.fillRect(cx - 5, cy - 10, 3, 8 - lLift);
      ctx.fillRect(cx + 2, cy - 10, 3, 8 - rLift);
    }
    // Weapon — barrel/sword + decorations + muzzle flash, plus the gun-status
    // badge. Only drawn when this is the guest's view of the host.
    if (showWeapon) {
      drawKeeperWeapon(player2, cx, cy + crouchYAdd2, gunY, gx, gy);
      // Drop the green gun-status badge while the keeper is toppling.
      if (!downed2) drawKeeperBadge(player2, cx, cy + crouchYAdd2, hatCount);
    }
    ctx.restore();
    // Rocket exhaust under the still-airborne feet of player 2 mirrors P1 —
    // anchored to the lifted boots (cy - liftY2) so it follows the flight.
    if (flying2) {
      const flickT = Date.now() * 0.04 + 1.7;
      const footY = cy - liftY2;
      for (const off of [-3, 3]) {
        ctx.fillStyle = 'rgba(120,170,255,0.65)';
        ctx.beginPath();
        ctx.ellipse(cx + off, footY + 1, 2.4, 4 + Math.sin(flickT + off) * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(220,236,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(cx + off, footY, 1.2, 2.2 + Math.cos(flickT * 1.7 + off) * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Dance stun — jaunty music notes bob up over the buddy (mirrors player1).
    if ((player2.danceT || 0) > 0) {
      const t = player2.danceAnimT || 0;
      ctx.save();
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#ffe27a';
      ctx.fillText('♪', cx + 12 + Math.sin(t * 5) * 3, cy - 42 - ((t * 9) % 16));
      ctx.fillText('♫', cx - 16 + Math.cos(t * 4) * 3, cy - 38 - ((t * 7 + 8) % 16));
      ctx.restore();
    }
    // Melee-swing arc — drawn outside the player scale, around the torso.
    if (showWeapon && player2.meleeT > 0) {
      drawMeleeArc(cx, cy - 16 - liftY2 + crouchYAdd2, player2.meleeDir, player2.meleeFull, player2.meleeT);
    }
    if (player2.skillCheckActive) {
      // Hide the other player's reload skill-check in normal play so each
      // client only sees their own timing UI. Reveal it only when the
      // developer debug panel is unlocked.
      if (DEBUG && debugUnlocked) {
        drawReloadSkillCheck(cx, cy - 44 - liftY2 + crouchYAdd2, player2);
      }
    }
  }

  // Tiny horizontal bar above a keeper's head with an oscillating marker:
  // a green band in the centre marks the success zone. The bar flashes red
  // briefly when the player snapped on the wrong moment.
  function drawReloadSkillCheck(cx, cy, who) {
    // Bar width pulls from the live upgrade contribution so Safe / Crazy
    // Trigger picks change the visible size as soon as they're taken.
    const W = skillCheckBarW(who);
    const H = 4;
    const x = cx - W / 2;
    const y = cy - H;
    const lockoutFlash = (who.skillCheckLockoutT || 0) > 0;
    // Frame/backing. Rusty Springs tints it: progressively rusty through lvl
    // 1-4, then gold at max (the golden-gun tier). Lockout still flashes red.
    const rustLvl = lvlsFor(who).rust || 0;
    let frameCol;
    if (lockoutFlash)       frameCol = 'rgba(120,20,20,0.85)';
    else if (rustLvl >= 5)  frameCol = 'rgba(255,207,58,0.92)';                         // gold
    else if (rustLvl > 0)   frameCol = RUST_COLORS[Math.min(rustLvl, RUST_COLORS.length - 1)]; // rusty
    else                    frameCol = 'rgba(20,20,28,0.85)';
    ctx.fillStyle = frameCol;
    ctx.fillRect(x - 1, y - 1, W + 2, H + 2);
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(x, y, W, H);
    // Weapon Oil halo — extends the accept zone outside the green core in
    // amber. Drawn first so the green ribbon paints over the overlapping
    // middle section.
    const fullHalfW = skillCheckHitHalf(who) * W;
    const coreHalfFrac = Math.min(skillCheckHitHalf(who), RELOAD_SC_HIT_HALF + SAFE_TRIGGER_HIT_BONUS[safeLvl(who)] - CRAZY_TRIGGER_HIT_REDUCE[crazyLvl(who)]);
    const coreHalfW = Math.max(0, coreHalfFrac) * W;
    if (fullHalfW > coreHalfW + 0.5) {
      ctx.fillStyle = lockoutFlash ? '#8a5a1a' : '#e0a83a';
      ctx.fillRect(cx - fullHalfW, y, fullHalfW * 2, H);
    }
    // Centre success band — the always-on green core (sized by upgrades).
    ctx.fillStyle = lockoutFlash ? '#7a2a2a' : '#3aa84a';
    ctx.fillRect(cx - coreHalfW, y, coreHalfW * 2, H);
    // Critical line — a thin pink/red ribbon dead-centre. Hitting it on
    // commit boosts the next shot's damage. Crazy Trigger thickens it.
    const critHalfW = skillCheckCritHalf(who) * W;
    if (critHalfW > 0.5) {
      ctx.fillStyle = lockoutFlash ? '#a01a4a' : '#ff3a8a';
      ctx.fillRect(cx - critHalfW, y, critHalfW * 2, H);
    }
    // Marker. Reloading on the move sweeps the pin faster (see pinSpeed) and
    // flickers it red to warn the timing window has gotten harder.
    const pos = skillCheckPos(who.skillCheckT || 0);
    const mx = x + pos * W;
    const runningReload = !!who.moving;
    // Dead-centre crit zone — the pin glows red so a critical commit reads at a
    // glance. Otherwise it flickers red while reloading on the move, else gold.
    const inCrit = Math.abs(pos - 0.5) <= skillCheckCritHalf(who);
    ctx.fillStyle = inCrit
      ? '#ff2020'
      : (runningReload && (Math.floor(Date.now() / 70) % 2)) ? '#ff2a2a' : '#ffe27a';
    ctx.fillRect(mx - 1, y - 1, 2, H + 2);
  }

  function drawCoop(c, preview, launchRiseY) {
    // During the post-boss cutscene THIS coop is the rocket: the world pass skips
    // it (it's hidden) and drawRocketLaunch re-draws it raised by launchRiseY.
    const launching = launchRiseY != null;
    if (c.launching && !preview && !launching) return; // hidden in the world pass
    const p = worldToScreen(c.x, c.y);
    // Missile-strike shudder — jitter the whole coop sideways while shakeT runs.
    let jitter = (c.shakeT > 0) ? (Math.random() - 0.5) * c.shakeT * 14 : 0;
    // Brooding wobble — a soft side-to-side rock while a chicken is forming
    // inside (replaces the old egg-on-roof hint). Phase offset per coop so
    // neighbouring coops don't rock in lockstep.
    if (c.laying && !preview) jitter += Math.sin(Date.now() * 0.012 + c.x * 7 + c.y * 13) * 1.2;
    const cx = p.x + jitter;
    const cy = p.y + TILE_H / 2 - (launching ? launchRiseY : 0); // lift it as it takes off

    // Footprint: ~1.2 tiles wide and deep (in world units). Half-sizes in screen px:
    const hw = TILE_W * 0.6; // half horizontal extent of footprint diamond
    const hd = TILE_H * 0.6; // half vertical extent of footprint diamond
    // Build mode: collapse ALREADY-PLACED coops to just their ground-footprint
    // diamond so the player can see and place things behind/under them. The
    // placement preview (preview=true) is exempt — it still shows the full
    // transparent coop, like fences and the other build previews do. Render is
    // per-client, so only the local builder sees placed coops flattened.
    if (!preview && !launching && (buildMode || player.buildMode)) {
      const Bp = { x: cx, y: cy + hd }, Rp = { x: cx + hw, y: cy },
            Lp = { x: cx - hw, y: cy }, Tp = { x: cx, y: cy - hd };
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(Bp.x, Bp.y); ctx.lineTo(Rp.x, Rp.y);
      ctx.lineTo(Tp.x, Tp.y); ctx.lineTo(Lp.x, Lp.y); ctx.closePath();
      ctx.fillStyle = 'rgba(120,120,130,0.20)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,220,230,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    // Shadow stays on the launch pad and shrinks away as the coop lifts off.
    if (launching) { if (launchRiseY < 80) drawShadow(c.x, c.y, 0.95 * (1 - launchRiseY / 80)); }
    else drawShadow(c.x, c.y, 0.95);
    const wallH = 22; // height of one floor in screen px
    const roofH = 16; // roof height above the top floor in screen px
    // A coop gains a floor for every 5 waves it survives (see startWave()).
    const floors = (c.level || 0) + 1;
    // Per-section fade: the ground floor uses the standard player-behind fade
    // so the keeper still shows through, while floors 2+/roof/chimney fade
    // away with a gradual curve over the same occlusion zone — so the
    // building gets see-through smoothly as the keeper walks behind it,
    // rather than popping out the moment the threshold is crossed.
    // A launching coop always draws at full opacity (it's flying free of the
    // field, so the keeper-occlusion fade shouldn't apply).
    // Whatever alpha the caller set coming in (1 in the normal world pass, but
    // ~0.4 for the translucent placement preview). drawCoop sets globalAlpha
    // ABSOLUTELY below, so scale every write by this to honour a pre-dimmed
    // canvas — otherwise the coop preview renders fully opaque and looks placed.
    const coopBaseAlpha = ctx.globalAlpha;
    const groundAlpha = launching ? 1 : occlusionAlpha(c);
    const MIN_A = 0.35; // matches occlusionAlpha's floor — see that function.
    // Linear remap: 1 (no occlusion) → 1, MIN_A (fully behind) → 0.
    // Squared to bias the fade toward 0 the deeper the player is behind it.
    const occT = launching ? 1 : clamp((groundAlpha - MIN_A) / (1 - MIN_A), 0, 1);
    const upperAlpha = occT * occT;

    // Footprint corners (z = 0, on the ground)
    const B = { x: cx,      y: cy + hd }; // bottom (closest to viewer)
    const R = { x: cx + hw, y: cy };      // right
    const L = { x: cx - hw, y: cy };      // left
    // Stable per-coop hash; `salt` separates the floor picks from the roof pick.
    const vhash = (salt) => ((((c.x | 0) * 73856093) ^ ((c.y | 0) * 19349663) ^ (salt * 40503367)) >>> 0);

    function poly(pts, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      if (fill)   { ctx.fillStyle = fill;     ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // Lift a footprint point up the screen by `dy` pixels.
    const up = (pt, dy) => ({ x: pt.x, y: pt.y - dy });
    // Point on a wall: u runs along the base edge (0..1), v upward within the
    // floor (0..1 of wallH), baseLift raises it to that floor's base.
    function leftWallPt(u, v, baseLift) {
      return { x: L.x + (B.x - L.x) * u,
               y: L.y + (B.y - L.y) * u - baseLift - wallH * v };
    }
    function rightWallPt(u, v, baseLift) {
      return { x: B.x + (R.x - B.x) * u,
               y: B.y + (R.y - B.y) * u - baseLift - wallH * v };
    }
    function line(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    // A square (or rectangular) framed window centred on a wall point.
    function paneWindow(center, w, h) {
      const x = center.x - w / 2, y = center.y - h / 2;
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#2c1607';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      // Window cross-bars.
      ctx.beginPath();
      ctx.moveTo(center.x, y); ctx.lineTo(center.x, y + h);
      ctx.moveTo(x, center.y); ctx.lineTo(x + w, center.y);
      ctx.stroke();
    }
    // Draw window feature variant `fv` on a wall (wallPt = leftWallPt/rightWallPt).
    // fv: 0 = square window, 1 = bare wall (no window), 2 = tall window.
    function wallWindow(fv, wallPt, bl) {
      if (fv === 1) return;
      const c = wallPt(0.5, 0.58, bl);
      if (fv === 2) paneWindow(c, 8, 13);
      else paneWindow(c, 9, 9);
    }

    // Cozy Coops, once maxed, gives every coop a smoking brick chimney. It is
    // drawn before the building so the coop stands in front of it — the stack
    // rises from behind, poking up past the roof. Fades with the upper floors
    // when the player is behind the coop.
    if (upgradeLevels.hatchRate >= 5 && upperAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = coopBaseAlpha * upperAlpha;
      const chW = 7;
      const wallsH = floors * wallH;
      const chx = cx + hw * 0.34;
      const chTopY = cy - wallsH - roofH - 9;
      const chBotY = cy - wallsH + 6;
      const chH = chBotY - chTopY;
      // Brick stack.
      ctx.fillStyle = '#8a4636';
      ctx.fillRect(chx - chW / 2, chTopY, chW, chH);
      ctx.strokeStyle = '#3a1c12';
      ctx.lineWidth = 1;
      ctx.strokeRect(chx - chW / 2, chTopY, chW, chH);
      // Mortar courses + a centre joint.
      ctx.beginPath();
      for (let by = chTopY + 4; by < chBotY - 1; by += 4) {
        ctx.moveTo(chx - chW / 2, by);
        ctx.lineTo(chx + chW / 2, by);
      }
      ctx.moveTo(chx, chTopY);
      ctx.lineTo(chx, chBotY);
      ctx.stroke();
      // Capstone.
      ctx.fillStyle = '#3a2410';
      ctx.fillRect(chx - chW / 2 - 1.5, chTopY - 2.5, chW + 3, 3);
      // Three smoke puffs drifting up and fading — the "cozy" touch.
      const t = Date.now() / 1000;
      for (let i = 0; i < 3; i++) {
        const phase = (t * 0.45 + i / 3) % 1;
        const sx = chx + Math.sin(phase * 5 + i * 2) * 3;
        const sy = chTopY - 4 - phase * 17;
        ctx.fillStyle = 'rgba(228,228,228,' + (0.5 * (1 - phase)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(sx, sy, 2 + phase * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // From wave 25 on, coops weather to stone — the ground floor first, then
    // one more floor every so often. Each subsequent floor takes a MINIMUM of
    // 5 rounds, plus a per-coop, per-floor random jitter (0–3) so coops don't
    // all petrify in lockstep — every building ages on its own schedule.
    let stoneFloors = 0;
    if (wave >= 25) {
      stoneFloors = 1;          // ground floor always weathers at wave 25
      let thresh = 25;
      for (let k = 1; k < floors; k++) {
        thresh += 5 + (vhash(200 + k) % 4); // ≥5 rounds + random factor
        if (wave >= thresh) stoneFloors++; else break;
      }
    }
    // ---- Stack of floors, drawn bottom to top (wood, or stone once weathered) ----
    for (let f = 0; f < floors; f++) {
      // Skip upper floors only when they'd be invisible anyway — otherwise
      // draw them with the gradual upper-alpha so the fade is smooth.
      if (f > 0 && upperAlpha <= 0.02) continue;
      const floorAlpha = f === 0 ? groundAlpha : upperAlpha;
      ctx.save();
      ctx.globalAlpha = coopBaseAlpha * floorAlpha;
      const bl = f * wallH;    // this floor's base lift
      const tl = bl + wallH;   // this floor's top lift
      // Per-floor feature variant: 0 = windows both sides, 1 = one bare side,
      // 2 = round porthole windows.
      const fv = vhash(f + 1) % 3;

      // Two visible walls — wood, or stone once this floor has weathered up.
      const isStone = f < stoneFloors;
      const wallEdge = isStone ? '#3c3c44' : '#2c1607';
      poly([up(L, bl), up(L, tl), up(B, tl), up(B, bl)], isStone ? '#73737c' : '#6b3f1e', wallEdge);
      poly([up(B, bl), up(B, tl), up(R, tl), up(R, bl)], isStone ? '#8a8a93' : '#7e4d28', wallEdge);

      // Seams — vertical planks on wood, horizontal courses on stone.
      ctx.strokeStyle = isStone ? '#4a4a52' : '#2c1607';
      ctx.lineWidth = 1;
      if (isStone) {
        for (const v of [0.34, 0.67]) {
          line(leftWallPt(0, v, bl),  leftWallPt(1, v, bl));
          line(rightWallPt(0, v, bl), rightWallPt(1, v, bl));
        }
      } else {
        for (let i = 1; i < 4; i++) {
          const u = i / 4;
          line(leftWallPt(u, 0, bl),  leftWallPt(u, 1, bl));
          line(rightWallPt(u, 0, bl), rightWallPt(u, 1, bl));
        }
      }

      // Left wall feature
      wallWindow(fv, leftWallPt, bl);

      // Right wall: a chicken pop-hole + ramp on the ground floor, window above.
      if (f === 0) {
        // The pop-hole itself — a wide dark opening cut into the wall, raised
        // off the ground so the chickens have to climb the ramp to reach it.
        const oTL = rightWallPt(0.28, 0.66, bl);
        const oTR = rightWallPt(0.72, 0.66, bl);
        const oBR = rightWallPt(0.72, 0.32, bl);
        const oBL = rightWallPt(0.28, 0.32, bl);
        poly([oTL, oTR, oBR, oBL], '#0a0502', '#0e0703');
        // Pale frame lip around the opening so it reads against the dark wood.
        ctx.strokeStyle = '#c89058';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(oTL.x, oTL.y);
        ctx.lineTo(oTR.x, oTR.y);
        ctx.lineTo(oBR.x, oBR.y);
        ctx.lineTo(oBL.x, oBL.y);
        ctx.closePath();
        ctx.stroke();
        // Wooden ramp — a plank leading from the bottom of the pop-hole down
        // to the ground in front of the coop. The "forward" screen direction
        // away from the right wall is roughly (+0.45, +0.89), so the foot
        // sits down-and-right of the opening.
        const RAMP_DX = 7;
        const RAMP_DY = 9;
        const rTL = oBL;
        const rTR = oBR;
        const rBL = { x: oBL.x + RAMP_DX, y: oBL.y + RAMP_DY };
        const rBR = { x: oBR.x + RAMP_DX, y: oBR.y + RAMP_DY };
        poly([rTL, rTR, rBR, rBL], '#a86a32', '#3a1f0d');
        // Horizontal cleats so the chickens can grip the ramp.
        ctx.strokeStyle = '#3a1f0d';
        ctx.lineWidth = 1;
        for (const t of [0.20, 0.40, 0.60, 0.80]) {
          const a = { x: rTL.x + (rBL.x - rTL.x) * t, y: rTL.y + (rBL.y - rTL.y) * t };
          const b = { x: rTR.x + (rBR.x - rTR.x) * t, y: rTR.y + (rBR.y - rTR.y) * t };
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      } else {
        // Variant 1 bares the left side, so this side keeps a window.
        wallWindow(fv === 1 ? 0 : fv, rightWallPt, bl);
      }
      ctx.restore();
    }

    // ---- Roof — one of three shapes, fixed per coop. Fades with the upper
    // floors so the building gets see-through as the player walks behind it.
    if (upperAlpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = coopBaseAlpha * upperAlpha;
    const topLift = floors * wallH;
    const B2 = up(B, topLift), R2 = up(R, topLift), L2 = up(L, topLift);
    const roofV = vhash(0) % 3;
    if (roofV === 2) {
      // Factory roof: a row of solid sawtooth ridges.
      const N = 3;
      const H = roofH * 0.9;
      const ux = R2.x - B2.x, uy = R2.y - B2.y; // B2 -> R2
      const vx = L2.x - B2.x, vy = L2.y - B2.y; // B2 -> L2
      const pt = (a, b, h) => ({ x: B2.x + ux * a + vx * b, y: B2.y + uy * a + vy * b - h });
      for (let i = N - 1; i >= 0; i--) {
        const a0 = i / N, a1 = (i + 1) / N;
        const aMid = a0 + (a1 - a0) * 0.66; // ridge sits toward the back
        // Back slope — short and steep, faces away; a plain shadowed panel.
        poly([pt(aMid, 0, H), pt(aMid, 1, H), pt(a1, 1, 0), pt(a1, 0, 0)], '#7a1f15', '#4a120a');
        // Solid front slope — clean red, faces the viewer.
        poly([pt(a0, 0, 0), pt(a0, 1, 0), pt(aMid, 1, H), pt(aMid, 0, H)], '#a02a1f', '#4a120a');
        // Front profile triangle closes the sawtooth silhouette.
        poly([pt(a0, 0, 0), pt(aMid, 0, H), pt(a1, 0, 0)], '#8f2419', '#4a120a');
      }
    } else if (roofV === 1) {
      // Ridge roof: a horizontal ridge instead of a single peak.
      const PKL = { x: cx - hw * 0.42, y: cy - topLift - roofH };
      const PKR = { x: cx + hw * 0.42, y: cy - topLift - roofH };
      poly([L2, B2, PKL], '#a02a1f', '#4a120a');
      poly([B2, R2, PKR], '#b8362a', '#4a120a');
      poly([B2, PKR, PKL], '#ad3024', '#4a120a');
      ctx.strokeStyle = '#d44a3a';
      ctx.lineWidth = 1;
      line(PKL, PKR);
    } else {
      // Pyramid roof: classic point.
      const PK = { x: cx, y: cy - topLift - roofH };
      poly([L2, B2, PK], '#a02a1f', '#4a120a');
      poly([B2, R2, PK], '#b8362a', '#4a120a');
      ctx.strokeStyle = '#d44a3a';
      ctx.lineWidth = 1;
      line(B2, PK);
    }
    // Snow piled along the eaves during a blizzard. Drawn across the roof's
    // lower edge rather than per roof-shape, so it reads the same on all three.
    if (snowCoverAt(Math.round(c.x), Math.round(c.y)) > 0 && !preview) {
      const cv = snowCoverAt(Math.round(c.x), Math.round(c.y));
      drawSnowCap(cx, cy - topLift + 1, hw * 0.92, 3.4 * cv);
      drawSnowCap(cx, cy - topLift - roofH * 0.45, hw * 0.5, 2.6 * cv);
    }
    // Cryptid Radar: small satellite dishes bolted to the coop's FLOOR WALLS
    // (not the roof) on a short outward arm. Only about HALF the coops sport
    // them (stable per-coop hash); each tier adds another dish, distributed up
    // the floors and alternating walls so they don't all face the same way.
    if (upgradeLevels.cryptidRadar > 0) {
      const radarLvl = upgradeLevels.cryptidRadar;
      const hsh = Math.abs(((c.x | 0) * 73856093) ^ ((c.y | 0) * 19349663));
      // Only ~half the coops sport antennas.
      if (hsh % 2 === 0) {
        const dishR = 8;                 // fixed (max) size — tiers add count, not size
        const nFloors = Math.max(1, floors);
        for (let i = 0; i < radarLvl; i++) {
          const ih = (hsh + i * 0x9e3779b1) >>> 0;
          // Sit on the TOP floors, filling downward — they climb as the coop
          // grows a new floor (and clear off the lower floors).
          const fl = Math.max(0, nFloors - 1 - (i % nFloors));
          const baseLift = fl * wallH;
          const onRight = (ih & 4) !== 0;                  // alternate the two walls
          const faceDir = onRight ? 1 : -1;                // dish opens away from the wall
          const u = 0.25 + ((ih >>> 3) % 100) / 100 * 0.5; // along the wall
          const v = 0.4 + ((ih >>> 9) % 30) / 100;         // height within that floor
          const mount = onRight ? rightWallPt(u, v, baseLift) : leftWallPt(u, v, baseLift);
          const mountX = mount.x, mountY = mount.y;
          ctx.save();
          ctx.globalAlpha = coopBaseAlpha; // ignore the roof fade, but still honour a preview dim
          // Mounting bracket + short arm jutting out from the wall.
          ctx.strokeStyle = '#2a2a30';
          ctx.lineWidth = 1.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(mountX, mountY);
          ctx.lineTo(mountX + faceDir * 3, mountY - 1);
          ctx.lineTo(mountX + faceDir * 3, mountY - 5);
          ctx.stroke();
          // Dish bowl — a parabolic shell opening outward, away from the wall.
          const dishCx = mountX + faceDir * (4 + dishR * 0.35);
          const dishCy = mountY - 5;
          const a0 = faceDir > 0 ? Math.PI * 0.5 : Math.PI * 1.5;
          const a1 = faceDir > 0 ? Math.PI * 1.5 : Math.PI * 2.5;
          ctx.fillStyle = '#c8c8d0';
          ctx.beginPath();
          ctx.ellipse(dishCx, dishCy, dishR, dishR * 0.65, 0, a0, a1);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#2a2a30';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          // Inner dish shadow for depth.
          ctx.fillStyle = '#9a9aa6';
          ctx.beginPath();
          ctx.ellipse(dishCx + faceDir * 1.0, dishCy, dishR * 0.7, dishR * 0.5, 0, a0, a1);
          ctx.closePath();
          ctx.fill();
          // Feed horn + softly pulsing red receiver (out of phase per dish).
          const feedX = dishCx - faceDir * (dishR * 0.5);
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008 + (c.x + c.y) + i * 1.3);
          ctx.strokeStyle = '#2a2a30';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(dishCx, dishCy);
          ctx.lineTo(feedX, dishCy);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,60,60,' + (0.5 + 0.4 * pulse).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(feedX, dishCy, 1.1 + 0.3 * pulse, 0, Math.PI * 2);
          ctx.fill();
          // Signal motes streaming outward from the dish — only on a radar lock.
          if (radarEmitT > 0) {
            for (let k = 0; k < 3; k++) {
              const ph = (Date.now() * 0.0009 + k / 3 + (ih % 7) * 0.13) % 1;
              const mx = dishCx + faceDir * (dishR * 0.4 + ph * 10);  // stream out
              const my = dishCy - Math.sin(ph * Math.PI * 3 + k) * 1.6;
              const aa = (1 - ph) * 0.8;
              const rr = (1 - ph) * 1.3 + 0.3;
              ctx.fillStyle = 'rgba(150,220,255,' + aa.toFixed(2) + ')';
              ctx.beginPath();
              ctx.arc(mx, my, rr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }
    }
    // Missile fire — random floors blaze with the hot-shot flame look for a few
    // seconds after a strike (igniteT is synced, so the guest sees it too).
    if ((c.igniteT || 0) > 0 && !launching) {
      ctx.save();
      ctx.globalAlpha = coopBaseAlpha; // flames ignore the occlusion fade, but honour a preview dim
      const ft = Date.now() / 55;
      const nF = Math.max(1, floors);
      for (let f = 0; f < nF; f++) {
        if ((vhash(f + 11) % 3) === 0) continue; // only "random" floors catch fire
        const baseY = cy - f * wallH - wallH * 0.55;
        for (let i = 0; i < 3; i++) {
          const off = (i - 1) * 5;
          const flick = 0.7 + Math.sin(ft + f * 1.7 + i * 2.3) * 0.3;
          ctx.fillStyle = i === 1 ? 'rgba(255,150,40,0.9)' : 'rgba(225,70,20,0.85)';
          ctx.beginPath();
          ctx.ellipse(cx + off, baseY - 3, 2.8, (7 + (i % 2) * 2) * flick, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,236,140,0.95)';
          ctx.beginPath();
          ctx.ellipse(cx + off, baseY - 4, 1.3, 3.4 * flick, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // A training dummy — a classic burlap-sack scarecrow strapped to a wooden
  // cross-post. The head is a featureless burlap sack (no face) but it still
  // wears the keeper's brown hat so wolves mistake it for the player.
  function drawDummy(dm) {
    drawShadow(dm.x, dm.y, 0.4);
    const p = worldToScreen(dm.x, dm.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hurt = dm.hurtT > 0;
    // Scaled down a touch (around the base) so the scarecrow reads a bit
    // smaller on the field.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(0.85, 0.85);
    ctx.translate(-cx, -cy);
    // Wooden mound/base at the foot of the post.
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(cx - 7, cy - 2, 14, 3);
    // Vertical post running the full height of the dummy.
    ctx.fillStyle = '#6b4521';
    ctx.fillRect(cx - 1.8, cy - 32, 3.6, 30);
    // Wood grain on the post.
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - 0.6, cy - 30); ctx.lineTo(cx - 0.6, cy - 6);
    ctx.moveTo(cx + 0.8, cy - 28); ctx.lineTo(cx + 0.8, cy - 4);
    ctx.stroke();
    // Cross-bar arms — the classic scarecrow T-shape.
    ctx.fillStyle = '#6b4521';
    ctx.fillRect(cx - 11, cy - 23, 22, 2.6);
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 21.8); ctx.lineTo(cx + 10, cy - 21.8);
    ctx.stroke();
    // Minimalist scarecrow body — a plain cloth tunic hung on the cross-bar,
    // with a few straw tufts. No plaid, patch or ragged hem: kept clean and
    // simple to fit the game's flat, low-detail look.
    const shirt = hurt ? '#ff5555' : '#7a5536';
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 23);
    ctx.lineTo(cx + 7, cy - 23);
    ctx.lineTo(cx + 5, cy - 10);
    ctx.lineTo(cx - 5, cy - 10);
    ctx.closePath();
    ctx.fill();
    // A few straw tufts poking from the cuffs and hem.
    ctx.strokeStyle = '#c89b4a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 22); ctx.lineTo(cx - 14, cy - 20);
    ctx.moveTo(cx + 10, cy - 22); ctx.lineTo(cx + 14, cy - 20);
    ctx.moveTo(cx - 2, cy - 10);  ctx.lineTo(cx - 3, cy - 6);
    ctx.moveTo(cx + 2, cy - 10);  ctx.lineTo(cx + 3, cy - 6);
    ctx.stroke();
    // Head — a clean round burlap face. No stitching or neck rope underneath,
    // so it stays a simple round head.
    ctx.fillStyle = hurt ? '#ff8a8a' : '#c89668';
    ctx.beginPath();
    ctx.arc(cx, cy - 30, 6, 0, Math.PI * 2);
    ctx.fill();
    // Brown keeper-style hat on top of the head — same shape as drawPlayer.
    ctx.fillStyle = hurt ? '#c0392b' : '#5a3825';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 35, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 5, cy - 39, 10, 4);
    // Max-level dummies show a faint red glow on the head as a tell that
    // destroying them will set off an explosion.
    if (upgradeLevels.dummy >= 5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,80,40,0.35)';
      ctx.beginPath();
      ctx.arc(cx, cy - 30, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // HP bar above the head — only when the dummy has been hit.
    if (dm.hp < dm.maxHp) {
      const w = 14;
      const x = cx - w / 2;
      const y = cy - 44;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = '#5fd06a';
      ctx.fillRect(x, y, w * (dm.hp / dm.maxHp), 2);
    }
    ctx.restore();
  }

  // A chicken statue — a stone-grey chunky chicken on a small pedestal.
  function drawStatue(st) {
    drawShadow(st.x, st.y, 0.55);
    const p = worldToScreen(st.x, st.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hurt = st.hurtT > 0;
    // Golden Chicken upgrade plates every statue in gold (hurt flash still wins).
    const gold = upgradeLevels.goldenChicken >= 1;
    const stoneA = hurt ? '#b88a8a' : (gold ? '#ffe07a' : '#9a9aa2');
    const stoneB = hurt ? '#7a4a4a' : (gold ? '#e0a92e' : '#6a6a72');
    const stoneC = hurt ? '#5a2a2a' : (gold ? '#a9781a' : '#4a4a52');
    // Stone pedestal.
    ctx.fillStyle = stoneC;
    ctx.fillRect(cx - 8, cy - 6, 16, 6);
    ctx.fillStyle = stoneB;
    ctx.fillRect(cx - 9, cy - 8, 18, 3);
    // Chicken body (chunky stone block).
    ctx.fillStyle = stoneA;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 14, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head (smaller circle).
    ctx.beginPath();
    ctx.arc(cx + 4, cy - 21, 4, 0, Math.PI * 2);
    ctx.fill();
    // Beak — small triangle pointing right.
    ctx.fillStyle = stoneC;
    ctx.beginPath();
    ctx.moveTo(cx + 7, cy - 21);
    ctx.lineTo(cx + 10, cy - 20);
    ctx.lineTo(cx + 7, cy - 19);
    ctx.closePath();
    ctx.fill();
    // Comb — three small bumps on top.
    ctx.fillStyle = stoneB;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + 2 + i * 1.7, cy - 25, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // Eye — a tiny dark dot.
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(cx + 5, cy - 22, 1, 1);
    // Carved seams to make it read as stone.
    ctx.strokeStyle = stoneC;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 13); ctx.lineTo(cx + 5, cy - 13);
    ctx.moveTo(cx - 3, cy - 16); ctx.lineTo(cx + 3, cy - 17);
    ctx.stroke();
    // Max-level statues pulse with a soft blue stun aura.
    if (upgradeLevels.statue >= 5) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const t = (performance.now() / 700) % 1;
      const r = 8 + t * 10;
      const a = 0.18 * (1 - t);
      ctx.strokeStyle = 'rgba(120,200,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy - 14, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // HP bar (only when damaged).
    if (st.hp < st.maxHp) {
      const w = 16;
      const x = cx - w / 2;
      const y = cy - 32;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = '#5fd06a';
      ctx.fillRect(x, y, w * (st.hp / st.maxHp), 2);
    }
  }

  // A farm plot: tilled soil with crops that grow taller and turn golden as
  // the farm ripens over successive untrampled waves.
  function drawFarm(fm) {
    const p = worldToScreen(fm.x, fm.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hw = TILE_W * 0.42, hd = TILE_H * 0.42;
    // Tilled soil diamond (flashes lighter brown right after a trample).
    ctx.fillStyle = fm.trampleFlash > 0 ? '#9a6238' : '#5b3a1e';
    ctx.beginPath();
    ctx.moveTo(cx, cy - hd);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hd);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3a2512';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Furrow lines across the plot.
    ctx.strokeStyle = '#4a2f17';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(cx - hw * 0.5 + k * hw * 0.5, cy + hd * 0.5 + k * hd * 0.5);
      ctx.lineTo(cx + hw * 0.5 + k * hw * 0.5, cy - hd * 0.5 + k * hd * 0.5);
      ctx.stroke();
    }
    // Crops: taller and golden-headed as the farm nears harvest. Uses the
    // plot's locked-in stage count so the visual matches when it pays out.
    // The visible growth window is 0..(need-1) — the harvest at growth=need
    // resets the plot in the same tick, so the LAST rendered stage must
    // already look fully ripe regardless of how short the cycle is.
    const total = fm.need || wavesToFinish();
    const lastStage = Math.max(1, total - 1);
    const frac = clamp(fm.growth / lastStage, 0, 1);
    const ripe = fm.growth >= lastStage;
    const spots = [[-0.42, -0.16], [0.42, -0.16], [0, 0.02], [-0.42, 0.22], [0.42, 0.22]];
    for (const s of spots) {
      const sx = cx + s[0] * hw, sy = cy + s[1] * hd;
      const h = 1.5 + frac * 11;
      ctx.strokeStyle = ripe ? '#8a9c2e' : '#3fae3a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy - h);
      ctx.stroke();
      if (frac > 0.25) {
        ctx.fillStyle = ripe ? '#ffd23f' : '#5fce4a';
        ctx.beginPath();
        ctx.arc(sx, sy - h, ripe ? 3 : 1.5 + frac * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Debug-only progress readout — only when the player stands near the plot,
    // so the field doesn't get plastered with numbers from far away.
    if (DEBUG && debugUnlocked) {
      const dx = fm.x - player.x, dy = fm.y - player.y;
      if (dx * dx + dy * dy < 9) {
        const totalT = fm.need || wavesToFinish();
        ctx.save();
        ctx.font = 'bold 11px "Lucida Console", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(cx - 22, cy - hd - 16, 44, 14);
        ctx.fillStyle = ripe ? '#ffd23f' : '#fff';
        ctx.fillText(fm.growth + '/' + totalT, cx, cy - hd - 5);
        ctx.restore();
      }
    }
  }

  function _decayAlpha(item) {
    if (item.bornWave === undefined) return 1;
    const age = wave - item.bornWave;
    const fadeStart = item.decayWaves - 3; // start fading 3 waves before removal
    if (age < fadeStart) return 1;
    return Math.max(0, 1 - (age - fadeStart) / 3);
  }

  function drawStump(s) {
    const alpha = _decayAlpha(s);
    if (alpha <= 0) return;
    const p = worldToScreen(s.x, s.y);
    const cx = p.x, cy = p.y + TILE_H * 0.35;
    const r  = Math.max(2, Math.round((3 + s.size * 3) * PIXEL * 0.5));
    const rr = Math.max(1, Math.round(r * 0.4));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#7a5030';
    ctx.beginPath(); ctx.ellipse(cx, cy + 1, r, rr, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c09060';
    ctx.beginPath(); ctx.ellipse(cx, cy, r, rr, 0, 0, Math.PI * 2); ctx.fill();
    if (r >= 4) {
      ctx.strokeStyle = '#9a6840';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.5, rr * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTwig(t) {
    const alpha = _decayAlpha(t);
    if (alpha <= 0) return;
    const p = worldToScreen(t.x, t.y);
    const cx = p.x, cy = p.y + TILE_H * 0.35;
    const len = Math.round((t.len * TILE_W * 0.6) * 0.5) * 2;
    const ca = Math.cos(t.ang), sa = Math.sin(t.ang);
    const sx = (ca - sa) * len * 0.5;
    const sy = (ca + sa) * len * 0.25;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#6a4020';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - sx, cy - sy);
    ctx.lineTo(cx + sx, cy + sy);
    ctx.stroke();
    const nx = sx * 0.4 + sy * 0.3;
    const ny = sy * 0.4 - sx * 0.15;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + nx, cy + ny);
    ctx.stroke();
    ctx.restore();
  }

  function drawTree(t) {
    drawShadow(t.x, t.y, 0.55 * t.size);
    const p = worldToScreen(t.x, t.y);
    const cx = p.x;
    const cy = p.y + TILE_H / 2;
    const s = t.size;
    // Rustle — a wolf is hidden in this tree's blindspot, so the canopy shakes
    // and gives it away from across the map. Only the foliage moves; the trunk
    // stays planted, which reads as leaves thrashing rather than the whole
    // tree sliding. Phase is seeded per tree so a row doesn't sway in unison.
    const fx = cx + ((t.rustleT > 0)
      ? Math.sin(Date.now() * 0.026 + t.x * 5.1 + t.y * 3.7) * 3.0 * s
      : 0);
    // Trunk (taller)
    ctx.fillStyle = '#4a2f17';
    ctx.fillRect(cx - 2 * s, cy - 26 * s, 4 * s, 22 * s);
    // Foliage — taller, fuller crown made of overlapping circles
    const greens = ['#2c6b2c', '#388838', '#244e24'];
    ctx.fillStyle = greens[t.shade % greens.length];
    ctx.beginPath();
    ctx.arc(fx,         cy - 30 * s, 9 * s,   0, Math.PI * 2);
    ctx.arc(fx - 6 * s, cy - 28 * s, 6 * s,   0, Math.PI * 2);
    ctx.arc(fx + 6 * s, cy - 28 * s, 6 * s,   0, Math.PI * 2);
    ctx.arc(fx - 4 * s, cy - 36 * s, 6 * s,   0, Math.PI * 2);
    ctx.arc(fx + 4 * s, cy - 36 * s, 6 * s,   0, Math.PI * 2);
    ctx.arc(fx,         cy - 44 * s, 7 * s,   0, Math.PI * 2);
    ctx.arc(fx - 2 * s, cy - 50 * s, 5 * s,   0, Math.PI * 2);
    ctx.fill();
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(fx - 3 * s, cy - 42 * s, 3.5 * s, 0, Math.PI * 2);
    ctx.arc(fx - 2 * s, cy - 50 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    // Snow settles along the top of the crown during a blizzard.
    if (snowCoverAt(Math.round(t.x), Math.round(t.y)) > 0) {
      // Per-tile, so the day after only the trees on still-snowy ground keep
      // their caps instead of every tree wearing a uniform thin smear.
      const cv = snowCoverAt(Math.round(t.x), Math.round(t.y));
      drawSnowCap(fx,         cy - 50 * s, 5.4 * s, 3.2 * s * cv);
      drawSnowCap(fx,         cy - 44 * s, 7.2 * s, 3.0 * s * cv);
      drawSnowCap(fx - 5 * s, cy - 36 * s, 5.0 * s, 2.4 * s * cv);
      drawSnowCap(fx + 5 * s, cy - 36 * s, 5.0 * s, 2.4 * s * cv);
    }
  }

  // Standalone chicken sprite for UI (the easter-egg upgrade card). Screen-space,
  // scaled, centred on (cx, cy) — mirrors the in-world drawChicken body shape.
  // A plain headstone where a keeper fell. Hidden behind the game-over and
  // boss end screens — those already say what happened, and a marker under the
  // scoreboard just reads as clutter.
  function drawGrave(g) {
    if (gameOver || endScreen) return;
    const p = worldToScreen(g.x, g.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    drawShadow(g.x, g.y, 0.42);
    // A low mound of turned earth the stone is planted in.
    ctx.fillStyle = 'rgba(74, 52, 30, 0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy - 1);
    ctx.rotate(g.lean || 0); // settled a little crooked in the dirt
    const W2 = 6, HGT = 13, R = 6;
    // Face of the slab: straight sides with a domed top.
    ctx.beginPath();
    ctx.moveTo(-W2, 0);
    ctx.lineTo(-W2, -HGT + R);
    ctx.arc(0, -HGT + R, R, Math.PI, 0);
    ctx.lineTo(W2, 0);
    ctx.closePath();
    ctx.fillStyle = '#9a9aa4';
    ctx.fill();
    ctx.strokeStyle = '#43434b';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Right-hand side in shadow, clipped to the slab so it can't spill out
    // past the dome the way the old loose polygon did.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(1.6, -HGT - 2, W2 + 2, HGT + 4);
    // Weathered highlight down the left edge.
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(-W2, -HGT - 2, 1.8, HGT + 4);
    ctx.restore();
    // Engraved cross above the lettering.
    ctx.strokeStyle = 'rgba(58,58,66,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -11.4); ctx.lineTo(0, -7.6);
    ctx.moveTo(-1.7, -9.9); ctx.lineTo(1.7, -9.9);
    ctx.stroke();
    ctx.fillStyle = '#3a3a42';
    ctx.font = 'bold 5px "Lucida Console", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('RIP', 0, -3.4);
    ctx.restore();

    // Tufts of grass either side of the mound.
    ctx.strokeStyle = '#3f7a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy + 0.5); ctx.lineTo(cx - 8.4, cy - 2.4);
    ctx.moveTo(cx + 7, cy + 0.5); ctx.lineTo(cx + 8.2, cy - 2.0);
    ctx.stroke();
  }

  // Parts flung off a wolf that came apart on death — plates, struts and cogs
  // tumbling out and settling in the grass.
  function drawWolfScrap() {
    for (const s of wolfScrap) {
      const fade = Math.min(1, s.t / 0.6); // rusts away over the last breath
      const p = worldToScreen(s.x, s.y);
      const px = p.x, py = p.y + TILE_H / 2 - s.z * 16;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(px, py);
      ctx.rotate(s.spin);
      const sc = s.size || 1;
      ctx.strokeStyle = '#2b2b31';
      ctx.lineWidth = 1;
      if (s.kind === 0) {           // hull plate
        ctx.fillStyle = '#6f6f78';
        ctx.fillRect(-3 * sc, -2 * sc, 6 * sc, 4 * sc);
        ctx.strokeRect(-3 * sc, -2 * sc, 6 * sc, 4 * sc);
      } else if (s.kind === 1) {    // strut
        ctx.fillStyle = '#8a8a93';
        ctx.fillRect(-4 * sc, -1 * sc, 8 * sc, 2 * sc);
        ctx.strokeRect(-4 * sc, -1 * sc, 8 * sc, 2 * sc);
      } else {                      // cog
        ctx.fillStyle = '#9a7a44';
        ctx.beginPath();
        ctx.arc(0, 0, 2.6 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5c4a28';
        ctx.beginPath();
        ctx.arc(0, 0, 1 * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // The flock FANGUS swallowed, tumbling back out as it explodes. Screen-space
  // arcs drawn with the UI chicken sprite, lifted by the entity's height and
  // spun end-over-end, with a shadow on the ground it's falling toward.
  function drawBossBurstChickens() {
    for (const c of bossBurstChickens) {
      drawShadow(c.x, c.y, 0.3);
      const p = worldToScreen(c.x, c.y);
      const sx = p.x;
      const sy = p.y + TILE_H / 2 - c.z * 16;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(c.spin);
      ctx.translate(-sx, -sy);
      drawChickenIcon(sx, sy, 1);
      ctx.restore();
    }
  }

  function drawChickenIcon(cx, cy, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); // body
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5, -6, 4, 0, Math.PI * 2);           // head
    ctx.fill();
    ctx.fillStyle = '#e74c3c';                   // comb
    ctx.beginPath();
    ctx.arc(4, -10, 1.6, 0, Math.PI * 2);
    ctx.arc(6, -11, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1a23b';                   // beak
    ctx.beginPath();
    ctx.moveTo(8, -6); ctx.lineTo(11, -5); ctx.lineTo(8, -4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#111';                      // eye
    ctx.fillRect(6, -7, 1, 1);
    ctx.strokeStyle = '#e8a23b';                 // legs
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-1, 4); ctx.lineTo(-2, 8);
    ctx.moveTo(2, 4);  ctx.lineTo(3, 8);
    ctx.stroke();
    ctx.restore();
  }

  function drawChicken(c) {
    const carried = !!(c.carrier && c.carrier.alive);
    const fat = fatTierOf(c) / FAT_MAX;
    // Skip the ground shadow when carried — the chicken is in the jaws,
    // not on the ground.
    if (!carried) drawShadow(c.x, c.y, 0.25 + fat * 0.08);
    const p = worldToScreen(c.x, c.y);
    let cx = p.x;
    const bob = carried ? 0 : Math.sin(c.bob) * 1.5;
    let cy = p.y + TILE_H/2 + bob;
    // Glue to the carrier's mouth: the carry uses the carrier's size to
    // pick the offset, so the chicken sits exactly where the snout points.
    let drawFacingLeft = c.facingLeft;
    if (carried) {
      const w = c.carrier;
      const s = w.size || 1;
      const sign = w.facingLeft ? -1 : 1;
      cx += 17 * s * sign;     // along the snout
      cy += -10 * s;            // raise to mouth height
      drawFacingLeft = !!w.facingLeft;
    }
    // Mirror around cx when moving left on screen
    ctx.save();
    if (drawFacingLeft) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    // Body — Fat Chickens swell only the body, not the head or legs.
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 6, 7 * (1 + fat * 0.4), 5 * (1 + fat * 0.2), 0, 0, Math.PI*2);
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(cx + 5, cy - 12, 4, 0, Math.PI*2);
    ctx.fill();
    // Comb (red)
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(cx + 4, cy - 16, 1.6, 0, Math.PI*2);
    ctx.arc(cx + 6, cy - 17, 1.6, 0, Math.PI*2);
    ctx.fill();
    // Beak
    ctx.fillStyle = '#f1a23b';
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy - 12);
    ctx.lineTo(cx + 11, cy - 11);
    ctx.lineTo(cx + 8, cy - 10);
    ctx.closePath();
    ctx.fill();
    // Eye
    ctx.fillStyle = '#111';
    ctx.fillRect(cx + 6, cy - 13, 1, 1);
    // Wings (shown while fluttering away from wall)
    if ((c.flutterT || 0) > 0) {
      const wBeat = Math.sin(c.bob * 3.5) * 5; // fast wing-beat
      ctx.strokeStyle = 'rgba(220,220,200,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 5);
      ctx.lineTo(cx - 12, cy - 9 - Math.abs(wBeat));
      ctx.moveTo(cx + 5, cy - 5);
      ctx.lineTo(cx + 12, cy - 9 - Math.abs(wBeat));
      ctx.stroke();
    }
    // Legs
    ctx.strokeStyle = '#e8a23b';
    ctx.lineWidth = 1.4;
    const leg = Math.sin(c.bob) * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy - 2);
    ctx.lineTo(cx - 2 + leg, cy + 2);
    ctx.moveTo(cx + 2, cy - 2);
    ctx.lineTo(cx + 3 - leg, cy + 2);
    ctx.stroke();
    // Worker chicken: bright yellow hardhat covering the comb.
    if (c.worker) {
      ctx.fillStyle = '#f5c91a';
      ctx.beginPath();
      ctx.arc(cx + 5, cy - 15, 3.6, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      // Brim along the front of the hat.
      ctx.fillRect(cx + 1.5, cy - 15.2, 7, 1.3);
      // Dark stripe down the centre — the iconic hardhat ridge.
      ctx.fillStyle = '#a07a08';
      ctx.fillRect(cx + 4.4, cy - 18, 1.2, 3);
    }
    // Rich chicken: small black top hat with a ribbon.
    if (c.rich) {
      ctx.fillStyle = '#111';
      // Wide brim sits on the head.
      ctx.fillRect(cx + 1.5, cy - 15.2, 7, 1.2);
      // Tall stovepipe crown.
      ctx.fillRect(cx + 3, cy - 21, 4, 6);
      // Crimson band just above the brim.
      ctx.fillStyle = '#b03030';
      ctx.fillRect(cx + 3, cy - 16.2, 4, 1);
    }
    ctx.restore();
    // Fleeing indicator (not mirrored — reads the same either way)
    if (c.fleeT > 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px "Lucida Console", Consolas, monospace';
      ctx.fillText('!', cx - 3, cy - 22);
    }
  }

  // A friendly guard dog — tan coat, floppy ear, red collar, perky tail.
  function drawDog(d) {
    const s = 0.9;
    drawShadow(d.x, d.y, 0.42 * s);
    const p = worldToScreen(d.x, d.y);
    const cx = p.x;
    const bob = Math.sin(d.bob) * 1.2;
    const cy = p.y + TILE_H / 2 + bob;
    ctx.save();
    if (d.facingLeft) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    const pal = DOG_COLORS[d.variant || 0];
    const body = pal.body, belly = pal.belly, head = pal.head, dark = pal.dark;
    // Perky tail.
    ctx.strokeStyle = head;
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 10 * s, cy - 10 * s);
    ctx.quadraticCurveTo(cx - 17 * s, cy - 13 * s, cx - 15 * s, cy - 21 * s);
    ctx.stroke();
    // Body.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 8 * s, 11 * s, 6.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly.
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 5 * s, 8 * s, 3.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head.
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.ellipse(cx + 10 * s, cy - 14 * s, 6 * s, 5.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Snout.
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(cx + 15 * s, cy - 12 * s, 3.6 * s, 2.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose.
    ctx.fillStyle = '#241610';
    ctx.beginPath();
    ctx.arc(cx + 18 * s, cy - 12.5 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
    // Floppy ear.
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(cx + 7 * s, cy - 18 * s);
    ctx.quadraticCurveTo(cx + 3 * s, cy - 13 * s, cx + 7 * s, cy - 9 * s);
    ctx.quadraticCurveTo(cx + 11 * s, cy - 13 * s, cx + 7 * s, cy - 18 * s);
    ctx.fill();
    // Eye.
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(cx + 11 * s, cy - 15 * s, 1.8 * s, 1.8 * s);
    // Collar — the band across the neck. Its colour is the dog's PERSONALITY
    // (red follows you, green patrols, blue guards the flock); the coat colour
    // above is a meaningless random roll, so this is the only readable tell.
    ctx.strokeStyle = DOG_COLLARS[d.personality || 0] || DOG_COLLARS[0];
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(cx + 4 * s, cy - 13 * s);
    ctx.lineTo(cx + 8 * s, cy - 7 * s);
    ctx.stroke();
    // Legs — an alternating trot.
    ctx.fillStyle = dark;
    const dLegX = [-7, -2, 3, 7];
    for (let i = 0; i < 4; i++) {
      const lift = Math.max(0, Math.sin(d.bob + (i % 2) * Math.PI)) * 2.4;
      ctx.fillRect(cx + dLegX[i] * s, cy - 4 * s, 2.2 * s, (6 - lift) * s);
    }
    ctx.restore();
  }

  // The thing wolf's severed head scuttling away on spider legs.
  function drawThingCrawler(w) {
    const s = w.size || 0.85;
    drawShadow(w.x, w.y, 0.4 * s);
    const p = worldToScreen(w.x, w.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    ctx.save();
    if (w.facingLeft) {
      ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0);
    }
    const hurt = w.hurtT > 0;
    // Same grey palette as an ordinary wolf head — only the spider legs differ.
    const headColor = hurt ? '#ff4d4d' : '#3a3a42';
    const darkColor = hurt ? '#7a1a1a' : '#2a2a30';
    // Spider legs — three a side, splayed out and scuttling out of phase.
    ctx.strokeStyle = darkColor;
    ctx.lineWidth = 1.4 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const hipY = cy - 7 * s;
    for (let i = 0; i < 3; i++) {
      const reach = (8 + i * 2) * s;
      const phR = (w.legPhase || 0) + i * 1.3;
      const liftR = Math.sin(phR) * 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(cx + 2 * s, hipY);
      ctx.lineTo(cx + reach * 0.55, hipY - 3 * s - liftR);
      ctx.lineTo(cx + reach, cy - 1 * s + liftR);
      ctx.stroke();
      const phL = phR + Math.PI;
      const liftL = Math.sin(phL) * 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(cx - 2 * s, hipY);
      ctx.lineTo(cx - reach * 0.55, hipY - 3 * s - liftL);
      ctx.lineTo(cx - reach, cy - 1 * s + liftL);
      ctx.stroke();
    }
    // Head — an ordinary wolf head (no body): muzzle, two pricked ears, one eye.
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 9 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Snout.
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.ellipse(cx + 6 * s, cy - 8 * s, 3 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ears.
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.moveTo(cx - 4 * s, cy - 13 * s);
    ctx.lineTo(cx - 2 * s, cy - 18 * s);
    ctx.lineTo(cx + 1 * s, cy - 13 * s);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 2 * s, cy - 13 * s);
    ctx.lineTo(cx + 4 * s, cy - 18 * s);
    ctx.lineTo(cx + 6 * s, cy - 12 * s);
    ctx.closePath(); ctx.fill();
    // Single eye, matching a normal wolf.
    ctx.fillStyle = hurt ? '#ffffff' : '#cfcfd6';
    ctx.fillRect(cx + 4 * s, cy - 10 * s, 1.6 * s, 1.6 * s);
    ctx.restore();
  }

  // The buddy cameo — a blue keeper strolling through. If it's been spooked
  // (shot at) it renders spectral/translucent as it drifts away.
  function drawP2Cameo() {
    const c = p2Cameo;
    if (!c) return;
    if (!c.ghost) drawShadow(c.x, c.y, 0.3); // ghosts cast no shadow
    const p = worldToScreen(c.x, c.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    ctx.save();
    if (c.ghost) ctx.globalAlpha = 0.4; // spectral
    const PLAYER_SCALE = 0.9;
    ctx.translate(cx, cy);
    ctx.scale(PLAYER_SCALE, PLAYER_SCALE);
    ctx.translate(-cx, -cy);
    // Legs — peg legs alternating with the walk.
    ctx.fillStyle = '#222';
    const legPhase = Math.sin(c.walkT);
    const lLift = Math.max(0, legPhase) * 2;
    const rLift = Math.max(0, -legPhase) * 2;
    ctx.fillRect(cx - 5, cy - 10, 3, 8 - lLift);
    ctx.fillRect(cx + 2, cy - 10, 3, 8 - rLift);
    // Body — the P2 blue shirt.
    ctx.fillStyle = '#3b6ea5';
    roundedRect(cx - 7, cy - 25, 14, 17, 3);
    // Head.
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(cx, cy - 30, 6, 0, Math.PI * 2);
    ctx.fill();
    // Two straw hats, like the guest keeper's default stack.
    drawHat(cx, cy - 34, GUEST_HAT_COLOR, false, false);
    drawHat(cx, cy - 39, GUEST_HAT_COLOR, false, true);
    ctx.restore();
  }

  // The wave-50 boss — a "Tarkus"-style wolf/war-tank: a normal-grey wolf
  // head fused to a segmented armoured shell that rolls on caterpillar treads.
  function drawBoss(w) {
    const s = w.size || BOSS_SIZE;
    drawShadow(w.x, w.y, 0.85 * s);
    const p = worldToScreen(w.x, w.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hurt = w.hurtT > 0;
    // Normal-wolf grey palette (flashes pale on a hit), with metallic armour.
    const fur   = hurt ? '#ff7a7a' : '#4a4a52';
    const furLt = hurt ? '#ffb0b0' : '#6a6a72';
    const head  = hurt ? '#ff5a5a' : '#3a3a42';
    const dark  = '#26262c';
    const steel = hurt ? '#caa' : '#9aa0aa';
    const steelD= hurt ? '#866' : '#5c626c';
    ctx.save();
    if (w.facingLeft) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }

    // --- Caterpillar treads under the front (the tank half). ---
    function tread(tx, ty) {
      const tw = 16 * s, th = 6 * s, midY = ty + th / 2;
      // Tread belt.
      ctx.fillStyle = dark;
      ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = '#3a3a42';
      for (let i = 0; i < 7; i++) ctx.fillRect(tx + 1 * s + i * 2.1 * s, ty + 0.8 * s, 1.2 * s, th - 1.6 * s);
      // Three road wheels, centred on the belt and tucked inside its height.
      ctx.fillStyle = '#6a6a72';
      const wr = (th / 2) - 0.6 * s;
      for (let i = 0; i < 3; i++) {
        const wx = tx + (3.2 + i * 4.8) * s;
        ctx.beginPath(); ctx.arc(wx, midY, wr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#34343a';
        ctx.beginPath(); ctx.arc(wx, midY, wr * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a6a72';
      }
    }
    tread(cx - 8 * s, cy - 5.5 * s);
    tread(cx - 1 * s, cy - 4.5 * s);

    // --- Twin small fixed cannons, low and tucked BEHIND the head/body,
    // sitting close against the body (short stubs). ---
    for (const oy of [-9, -6.5]) {
      ctx.fillStyle = '#23232a';
      ctx.fillRect(cx + 9 * s, cy + oy * s - 0.9 * s, 5 * s, 1.8 * s);
      ctx.fillStyle = '#6a6a72';
      ctx.fillRect(cx + 13 * s, cy + oy * s - 1.2 * s, 1.5 * s, 2.4 * s); // muzzle
    }

    // Soft fur underbelly — drawn FIRST (its original centred spot) so the
    // armoured plates below cover its top half and only the belly peeks out.
    ctx.fillStyle = furLt;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 9 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- Segmented armoured shell (the armadillo back) — drawn OVER the belly. ---
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const bx = cx - 13 * s + t * 22 * s;
      const top = cy - (16 + Math.sin(t * Math.PI) * 9) * s;
      ctx.fillStyle = i % 2 ? steel : steelD;
      ctx.beginPath();
      ctx.moveTo(bx, cy - 10 * s);
      ctx.lineTo(bx, top);
      ctx.lineTo(bx + 4.4 * s, top - 1.5 * s);
      ctx.lineTo(bx + 4.4 * s, cy - 10 * s);
      ctx.closePath(); ctx.fill();
      // plate rivets / ridge
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(bx + 1.2 * s, top + 1 * s, 1 * s, (cy - 11 * s - top));
    }

    // --- Wolf head at the front. ---
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(cx + 12 * s, cy - 19 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); // snout
    ctx.moveTo(cx + 16 * s, cy - 21 * s);
    ctx.lineTo(cx + 23 * s, cy - 19 * s);
    ctx.lineTo(cx + 16 * s, cy - 16 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = head; // ears
    ctx.beginPath();
    ctx.moveTo(cx + 8 * s, cy - 25 * s); ctx.lineTo(cx + 10 * s, cy - 31 * s); ctx.lineTo(cx + 12 * s, cy - 24 * s); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 13 * s, cy - 24 * s); ctx.lineTo(cx + 15 * s, cy - 30 * s); ctx.lineTo(cx + 16 * s, cy - 23 * s); ctx.closePath(); ctx.fill();
    // Single glowing eye — pulses red rapidly during a charge dash.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const dashing = (w.dashT || 0) > 0;
    const glow = dashing
      ? (0.6 + 0.4 * Math.sin(Date.now() / 40))   // fast angry red blink
      : (0.7 + 0.3 * Math.sin(Date.now() / 130));  // slow idle orange pulse
    const eyeColor = dashing ? ('rgba(255,0,0,' + glow.toFixed(2) + ')') : ('rgba(255,90,40,' + glow.toFixed(2) + ')');
    ctx.fillStyle = eyeColor;
    const eyeR = dashing ? 3.2 * s : 2.4 * s; // eye widens on charge
    ctx.beginPath(); ctx.ellipse(cx + 12 * s, cy - 20 * s, eyeR, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = dashing ? '#330000' : '#111';
    ctx.fillRect(cx + 11.4 * s, cy - 20.6 * s, 1.2 * s, 1.2 * s);

    // --- MK-04 only: twin missile rack on the rear deck (SA-2 style). Hidden
    // while the just-beaten MK-03 retreats — it only appears once MK-04 returns.
    if (bossSidesDone >= 3 && !w.retreating) {
      ctx.save();
      ctx.translate(cx - 9 * s, cy - 16 * s); // sit the rack a little higher
      ctx.rotate(-0.62); // incline the rail up toward the front
      // Launch rail (a touch smaller).
      ctx.fillStyle = hurt ? '#7a4a4a' : '#3a4a35';
      ctx.fillRect(-2.5 * s, -2.8 * s, 14 * s, 5.6 * s);
      ctx.fillStyle = hurt ? '#5a3030' : '#2c3a28';
      ctx.fillRect(-2.5 * s, -0.5 * s, 14 * s, 1.0 * s);
      // Two missiles stacked on the rail — but only when LOADED. They visibly
      // vanish for a couple of seconds after a salvo, then the rack refills.
      const loaded = !(w.missileGoneT > 0);
      if (loaded) for (const my of [-1.9, 1.9]) {
        ctx.fillStyle = hurt ? '#e6bdbd' : '#d6d8dc';
        ctx.fillRect(0, my * s - 0.7 * s, 9 * s, 1.4 * s);        // smaller body
        ctx.fillStyle = '#3a3f47';
        ctx.beginPath();                                          // nose cone
        ctx.moveTo(9 * s, my * s - 0.7 * s); ctx.lineTo(11.6 * s, my * s); ctx.lineTo(9 * s, my * s + 0.7 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8a9099';
        ctx.beginPath();                                          // upper fin
        ctx.moveTo(0, my * s - 0.7 * s); ctx.lineTo(-2 * s, my * s - 1.7 * s); ctx.lineTo(-0.3 * s, my * s - 0.7 * s); ctx.closePath(); ctx.fill();
        ctx.beginPath();                                          // lower fin
        ctx.moveTo(0, my * s + 0.7 * s); ctx.lineTo(-2 * s, my * s + 1.7 * s); ctx.lineTo(-0.3 * s, my * s + 0.7 * s); ctx.closePath(); ctx.fill();
        // Charging glow at the nozzle during the wind-up.
        if (w.missileCharging) {
          const g = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 90));
          ctx.fillStyle = 'rgba(255,150,40,' + (0.4 + 0.5 * g).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(-0.8 * s, my * s, (1.2 + g) * s, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    // --- Heavy turret + barrel mounted on the BACK of the shell, tracking aim. ---
    const px = cx - 2 * s, py = cy - 19 * s; // pivot sits on the rear hump
    ctx.fillStyle = steelD;
    ctx.beginPath(); ctx.arc(px, py, 3.2 * s, 0, Math.PI * 2); ctx.fill(); // turret base
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate((w.aimDir || 0) * (w.facingLeft ? -1 : 1));
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(0, -2.0 * s, 14 * s, 4.0 * s);
    ctx.fillStyle = '#6a6a72';
    ctx.fillRect(11.5 * s, -2.6 * s, 2.4 * s, 5.2 * s); // muzzle brake
    ctx.restore();
    ctx.restore();
  }

  // Debug DPS dummy — a straw scarecrow with a live damage-per-second readout.
  function drawDpsDummy(w) {
    drawShadow(w.x, w.y, 0.4);
    const p = worldToScreen(w.x, w.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hurt = w.hurtT > 0;
    // Post + cross-arms.
    ctx.strokeStyle = hurt ? '#ff7a4a' : '#7a4a22';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 22);
    ctx.moveTo(cx - 9, cy - 15); ctx.lineTo(cx + 9, cy - 15);
    ctx.stroke();
    // Burlap head.
    ctx.fillStyle = hurt ? '#ffb37a' : '#cda06a';
    ctx.beginPath(); ctx.arc(cx, cy - 24, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(cx - 2.5, cy - 25.5, 1.4, 1.4);
    ctx.fillRect(cx + 1.1, cy - 25.5, 1.4, 1.4);
    // DPS readout floating above.
    ctx.font = 'bold 12px "Lucida Console", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - 30, cy - 44, 60, 15);
    ctx.fillStyle = '#7fffa0';
    ctx.fillText((w.dps || 0) + ' dps', cx, cy - 33);
  }

  // Hunter wolf — a keeper-shaped cryptid: the player's body silhouette but
  // with a snarling wolf head, a menacing purple coat, and the same shotgun.
  function drawHunterWolf(w) {
    drawShadow(w.x, w.y, 0.3);
    const p = worldToScreen(w.x, w.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hurt = w.hurtT > 0;
    const coat = hurt ? '#ff5555' : '#6a3a8a';  // menacing purple keeper coat
    const fur  = hurt ? '#ff7a7a' : '#3a3a42';  // dark wolf head
    ctx.save();
    if (w.facingLeft) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    // Legs — an alternating walk, like the keeper.
    ctx.fillStyle = hurt ? '#7a1a1a' : '#222';
    const legPhase = Math.sin(w.walkT || 0);
    ctx.fillRect(cx - 5, cy - 10, 3, 8 - Math.max(0, legPhase) * 2);
    ctx.fillRect(cx + 2, cy - 10, 3, 8 - Math.max(0, -legPhase) * 2);
    // Body / coat.
    ctx.fillStyle = coat;
    roundedRect(cx - 7, cy - 25, 14, 17, 3);
    // Wolf head — centred on top of the body (the snout/eye still read the
    // facing direction via the flip).
    const hx = 0;
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(cx + hx, cy - 30, 6, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    // Snout.
    ctx.fillStyle = hurt ? '#ff9a9a' : '#2a2a30';
    ctx.beginPath(); ctx.ellipse(cx + hx + 5, cy - 29, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    // Ears.
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.moveTo(cx + hx - 4, cy - 35); ctx.lineTo(cx + hx - 2, cy - 39.5); ctx.lineTo(cx + hx - 1, cy - 34); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + hx + 2, cy - 35); ctx.lineTo(cx + hx + 4, cy - 39.5); ctx.lineTo(cx + hx + 4.5, cy - 34); ctx.closePath(); ctx.fill();
    // Glowing eye.
    ctx.fillStyle = '#ff5a30';
    ctx.beginPath(); ctx.arc(cx + hx + 2, cy - 31, 1.1, 0, Math.PI * 2); ctx.fill();
    // Hat stack on its head = its health — one hat per remaining HP, in the
    // copied player's hat colour. Each hit knocks one off (HP bar is debug-only).
    const remHats = Math.max(1, Math.round(w.hp));
    for (let i = 0; i < remHats; i++) {
      drawHat(cx + hx, cy - 35 - i * 5, w.hatColor || '#5a3825', hurt, i === remHats - 1);
    }
    // Shotgun — drawn unflipped so the screen-space aim applies cleanly.
    ctx.save();
    if (w.facingLeft) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    ctx.translate(cx, cy - 16);
    ctx.rotate(w.aimDir || 0);
    ctx.fillStyle = '#5a3a1c'; ctx.fillRect(-7, -1.8, 6, 3.6);   // wooden stock
    ctx.fillStyle = w.gunColor || '#2b2b2b'; ctx.fillRect(2, -1.4, 15, 2.8); // barrel (copied weapon colour)
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(3, -1.0, 7, 2.4);    // fore-end
    if (w.muzzleT > 0) {
      ctx.fillStyle = 'rgba(255,220,80,0.9)';
      ctx.beginPath(); ctx.arc(19, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    // HP bar — debug only (in normal play the hat stack reads as its health).
    const maxHp = w.maxHp || (HUNTER_WOLF_HP_PER_HAT * 3);
    if (debugUnlocked && w.hp < maxHp) {
      const bw = 22, x = cx - bw / 2, y = cy - 58;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, bw, 3);
      ctx.fillStyle = '#5ad15a'; ctx.fillRect(x, y, bw * Math.max(0, w.hp / maxHp), 3);
    }
  }

  // Missile wolf — a big grey brute with two back-mounted rockets. The rockets
  // glow and a dashed line paints to the targeted coop while it winds up a salvo.
  function drawMissileWolf(w) {
    const s = w.size || MISSILE_WOLF_SIZE;
    drawShadow(w.x, w.y, 0.55 * s);
    const p = worldToScreen(w.x, w.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const hurt = w.hurtT > 0;
    const fur  = hurt ? '#ff7a7a' : '#55555e';
    const furD = hurt ? '#b85050' : '#3a3a42';
    const head = hurt ? '#ff5a5a' : '#42424a';
    const arming = w.missilePhase === 'arming';
    const charging = arming && w.missileChargeT <= MISSILE_WOLF_CHARGE && w.missileChargeT > 0;
    // Telegraph line to the coop it's about to hit (drawn unflipped, in screen space).
    if (charging && w.missileTargetCoop && coops.includes(w.missileTargetCoop)) {
      const tp = worldToScreen(w.missileTargetCoop.x, w.missileTargetCoop.y);
      const pulse = 0.4 + 0.5 * Math.abs(Math.sin(Date.now() / 90));
      ctx.save();
      ctx.strokeStyle = 'rgba(255,120,40,' + (0.3 + 0.4 * pulse).toFixed(2) + ')';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 9 * s);
      ctx.lineTo(tp.x, tp.y + TILE_H / 2 - 14);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.save();
    if (w.facingLeft) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
    // Planted legs.
    ctx.fillStyle = furD;
    ctx.fillRect(cx - 7 * s, cy - 3 * s, 2.4 * s, 4 * s);
    ctx.fillRect(cx + 4 * s, cy - 3 * s, 2.4 * s, 4 * s);
    // Haunched torso.
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 6 * s, 9 * s, 5.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Two back-mounted rockets, angled up and forward.
    for (const off of [-2.2, 2.2]) {
      ctx.save();
      ctx.translate(cx + off * s, cy - 11 * s);
      ctx.rotate(0.5); // tilt the rockets forward (toward the head), not backward
      ctx.fillStyle = hurt ? '#e6bdbd' : '#cfd2d6';
      ctx.fillRect(-1.4 * s, -5 * s, 2.8 * s, 8 * s);            // body
      ctx.fillStyle = '#3a3f47';
      ctx.beginPath();                                           // nose cone
      ctx.moveTo(-1.4 * s, -5 * s); ctx.lineTo(0, -8 * s); ctx.lineTo(1.4 * s, -5 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a9099';
      ctx.beginPath();                                           // fins
      ctx.moveTo(-1.4 * s, 3 * s); ctx.lineTo(-3 * s, 4.2 * s); ctx.lineTo(-1.4 * s, 1.6 * s); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(1.4 * s, 3 * s); ctx.lineTo(3 * s, 4.2 * s); ctx.lineTo(1.4 * s, 1.6 * s); ctx.closePath(); ctx.fill();
      if (charging) {                                            // nozzle glow while arming
        const g = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 90));
        ctx.fillStyle = 'rgba(255,150,40,' + (0.4 + 0.5 * g).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(0, 4 * s, (1.6 + g) * s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Head — styled like a default wolf: ellipse head + snout + two pricked ears.
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.ellipse(cx + 8 * s, cy - 9 * s, 5.5 * s, 4.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Snout.
    ctx.fillStyle = furD;
    ctx.beginPath();
    ctx.ellipse(cx + 12.5 * s, cy - 8 * s, 3 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ears.
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.moveTo(cx + 5 * s, cy - 13 * s); ctx.lineTo(cx + 7 * s, cy - 16 * s); ctx.lineTo(cx + 8 * s, cy - 11.5 * s); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 9.5 * s, cy - 13 * s); ctx.lineTo(cx + 11 * s, cy - 16 * s); ctx.lineTo(cx + 11 * s, cy - 11.5 * s); ctx.closePath(); ctx.fill();
    // Glowing red eye.
    ctx.fillStyle = '#ff5a30';
    ctx.beginPath(); ctx.arc(cx + 8 * s, cy - 9.5 * s, 1.1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // HP bar when damaged.
    if (w.hp < MISSILE_WOLF_HP) {
      const bw = 26;
      const x = cx - bw / 2, y = cy - 22 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, bw, 3);
      ctx.fillStyle = '#5ad15a'; ctx.fillRect(x, y, bw * Math.max(0, w.hp / MISSILE_WOLF_HP), 3);
    }
  }

  function drawWolf(w) {
    if (w.boss) { drawBoss(w); return; }
    if (w.dpsDummy) { drawDpsDummy(w); return; }
    if (w.hunterWolf) { drawHunterWolf(w); return; }
    if (w.missileWolf) { drawMissileWolf(w); return; }
    if (w.crawler) { drawThingCrawler(w); return; }
    // Ghost wolf: apply fade-out alpha while fleeing; skip draw when fully gone.
    if (w.ghostWolf) {
      const a = w.ghostFleeing ? (w.ghostAlpha || 0) : 1;
      if (a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
    }
    const s = w.size || 1;
    drawShadow(w.x, w.y, 0.45 * s);
    const p = worldToScreen(w.x, w.y);
    // Fox jumps over fences — lift the sprite along a short sin arc while
    // the jump timer ticks down. Shadow stays on the ground so it reads.
    let jumpLift = 0;
    if ((w.fox || w.jumper) && w.jumpT > 0 && w.jumpDur > 0) {
      const t = 1 - (w.jumpT / w.jumpDur);
      jumpLift = Math.sin(t * Math.PI) * 22 * s; // higher hop over walls
    }
    // Parachuting wolves float above their landing spot, swaying as they fall.
    const paraLift = w.parachuting ? (w.parachuteH || 0) : 0;
    const paraSway = w.parachuting ? Math.sin(w.parachuteSway || 0) * 5 : 0;
    const cx = p.x + paraSway, cy = p.y + TILE_H/2 - jumpLift - paraLift;
    // Mirror around cx when moving left on screen. The moonwalker inverts the
    // test, so it trudges along permanently facing away from where it's going.
    ctx.save();
    if (w.moonwalk ? !w.facingLeft : w.facingLeft) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    // Colors: scale toward white depending on `fasterLevel` (visual cap at 30)
    const fasterLevel = w.fasterLevel || 0;
    const visualCap = 30;
    const f = Math.min(1, fasterLevel / visualCap);
    // Base colors (body, belly, head) in RGB
    const baseBody = [74, 74, 82]; // #4a4a52
    const baseBelly = [106,106,114]; // #6a6a72
    const baseHead = [58,58,66]; // #3a3a42
    function blendToWhite(base, t) {
      const r = Math.round(base[0] + (255 - base[0]) * t);
      const g = Math.round(base[1] + (255 - base[1]) * t);
      const b = Math.round(base[2] + (255 - base[2]) * t);
      return `rgb(${r},${g},${b})`;
    }
    let bodyColor = blendToWhite(baseBody, f);
    let bellyColor = blendToWhite(baseBelly, f * 0.9);
    let headColor = blendToWhite(baseHead, f * 0.95);
    let darkColor = '#2a2a30';
    let tailColor = '#3a3a42';
    // Foxes wear an orange coat instead of the wolf's grey.
    if (w.fox) {
      bodyColor = '#e8772a';
      bellyColor = '#f4c089';
      headColor = '#d6661f';
      darkColor = '#8a3d12';
      tailColor = '#c25a1a';
    }
    // Bomb wolves wear a dark charcoal coat.
    if (w.bomb) {
      bodyColor = '#3a3a40';
      bellyColor = '#5a5a62';
      headColor = '#2e2e34';
      darkColor = '#1a1a1e';
      tailColor = '#4a4a52';
    }
    // Pup — same grey palette, just smaller (size handles the scale-down).
    if (w.pup) {
      bodyColor = '#6a6a72';
      bellyColor = '#8c8c94';
      headColor = '#5a5a62';
      darkColor = '#3a3a42';
      tailColor = '#4a4a52';
    }
    // Thing wolf — deliberately looks like an ordinary wolf; the only tell is
    // the radar ping. The surprise is the head-crawler it leaves on death.
    // Flash red right after taking a pellet hit.
    if (w.hurtT > 0) {
      bodyColor = '#ff5555';
      bellyColor = '#ff8a8a';
      headColor = '#ff4d4d';
      darkColor = '#7a1a1a';
      tailColor = '#8a2424';
    } else if (w.coldT > 0) {
      // Cold Shot — a chilled wolf turns frosty blue.
      bodyColor = '#6fa8d8';
      bellyColor = '#a9d4ec';
      headColor = '#5b9bcf';
      darkColor = '#2a4a66';
      tailColor = '#4a7da8';
    }

    // Body (scaled by size)
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 8 * s, 12 * s, 7 * s, 0, 0, Math.PI*2);
    ctx.fill();
    // Belly lighter
    ctx.fillStyle = bellyColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 5 * s, 9 * s, 4 * s, 0, 0, Math.PI*2);
    ctx.fill();
    // Head
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.ellipse(cx + 10 * s, cy - 14 * s, 6 * s, 5 * s, 0, 0, Math.PI*2);
    ctx.fill();
    // Snout
    ctx.fillStyle = darkColor;
    ctx.beginPath();
    ctx.ellipse(cx + 15 * s, cy - 13 * s, 3 * s, 2 * s, 0, 0, Math.PI*2);
    ctx.fill();
    // Ears
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.moveTo(cx + 6 * s, cy - 19 * s);
    ctx.lineTo(cx + 9 * s, cy - 22 * s);
    ctx.lineTo(cx + 10 * s, cy - 17 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 12 * s, cy - 19 * s);
    ctx.lineTo(cx + 14 * s, cy - 22 * s);
    ctx.lineTo(cx + 14 * s, cy - 17 * s);
    ctx.closePath();
    ctx.fill();
    // Laser / ranged wolves carry a small cannon mounted on their back. The
    // barrel rotates to track whatever the wolf is aiming at (w.aimDir is the
    // SCREEN-space angle to the target). We undo the body mirror locally so
    // the rotation can be applied in screen coords directly — otherwise the
    // mirror flips the barrel and the gun visually fires backwards.
    if (w.ranged || w.homer) {
      ctx.save();
      if (w.facingLeft) {
        ctx.translate(cx, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cx, 0);
      }
      // Mount base — a small dark patch sitting on the wolf's shoulders.
      ctx.fillStyle = '#1a1a1e';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 12 * s, 4 * s, 2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // Barrel — rotated around the mount so it points along the aim.
      ctx.translate(cx, cy - 13 * s);
      ctx.rotate(w.aimDir || 0);
      // Grip/back end of the barrel — a bit chunkier than the muzzle.
      ctx.fillStyle = '#3a3a42';
      ctx.fillRect(-3 * s, -1.6 * s, 4 * s, 3.2 * s);
      if (w.homer) {
        // Ranged wolf: a stubbier barrel ending in a round bulb nozzle — the
        // homing-bullet launcher, glowing red.
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(0, -1.4 * s, 6.5 * s, 2.8 * s);
        ctx.fillStyle = '#5a1414';
        ctx.beginPath();
        ctx.arc(7.5 * s, 0, 2.7 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,60,50,0.9)';
        ctx.beginPath();
        ctx.arc(7.5 * s, 0, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Laser wolf: a long straight barrel with a red hit-scan emitter.
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(0, -1 * s, 10 * s, 2 * s);
        ctx.fillStyle = '#ff2a22';
        ctx.fillRect(8.5 * s, -1.2 * s, 2.2 * s, 2.4 * s);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,40,30,0.85)';
        ctx.beginPath();
        ctx.arc(9.6 * s, 0, 1.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    // Eye — assassin wolves glow a permanent bright red; foxes have a dark
    // eye; defective wolves flicker; turncoats are steady blue; others
    // redden when aggroing the player.
    let eyeColor;
    if (w.turncoat) {
      // Pulse around an icy blue so the turncoat reads at a glance.
      const pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.006 + (w.x - w.y) * 0.4);
      const g = Math.round(120 + 70 * pulse);
      const b = Math.round(180 + 60 * pulse);
      eyeColor = 'rgb(40,' + g + ',' + b + ')';
    } else if (w.defective) {
      // Stuttering brightness — the eye flickers off-and-on like a broken bulb.
      const t = Date.now() * 0.018 + (w.x + w.y) * 7;
      const on = (Math.sin(t) + Math.sin(t * 2.3 + 1.1)) > 0.4;
      eyeColor = on ? '#ff5a3c' : '#3a3a3a';
    } else if (nightOfWolf && !w.fox) eyeColor = '#ff2a22';
    else if (w.ranged)    eyeColor = '#ff2222';
    else if (w.homer)     eyeColor = '#ff5aa0';
    else if (w.assassin)  eyeColor = '#ff2222';
    else if (w.fox)       eyeColor = '#3a2410';
    else if (w.aggroT > 0) eyeColor = '#ff5a3c';
    else                   eyeColor = (f > 0 ? blendToWhite([207,207,214], f) : '#cfcfd6');
    ctx.fillStyle = eyeColor;
    ctx.fillRect(cx + 11 * s, cy - 15 * s, 1.6 * s, 1.6 * s);
    // Brute: a heavy slanted brow over the eye — the one tell that this wolf
    // is carrying ten times the usual health.
    if (w.brute) {
      // Sits just above the eye (which starts at cy-15) and slants down toward
      // the snout for the scowl. It used to ride up at cy-18 where it collided
      // with the ear and read as a floating bar rather than a brow.
      ctx.strokeStyle = '#1d1d22';
      ctx.lineWidth = 1.9 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + 9.0 * s,  cy - 16.8 * s); // back of the brow, raised
      ctx.lineTo(cx + 13.6 * s, cy - 15.5 * s); // front, dipping over the eye
      ctx.stroke();
    }
    // Night of the Wolf: paint a small bright glow over the eye so it stays
    // visible even through the darkness overlay.
    if (nightOfWolf && !w.fox) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,40,30,0.95)';
      ctx.beginPath();
      ctx.arc(cx + 11.8 * s, cy - 14.2 * s, 1.4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Parry Mode: a wolf winding up its lunge gets a bright twinkle in the eye —
    // a pulsing four-point sparkle over the eye so the tell reads at a glance.
    if (w.sparkleT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const tw = 0.5 + 0.5 * Math.sin(Date.now() * 0.03 + (w.x + w.y));
      const ex = cx + 11.8 * s, ey = cy - 14.2 * s;
      const r = (2.2 + tw * 1.6) * s;
      ctx.strokeStyle = 'rgba(255,255,180,' + (0.65 + 0.35 * tw).toFixed(2) + ')';
      ctx.lineWidth = 0.8 * s;
      ctx.beginPath();
      ctx.moveTo(ex - r, ey); ctx.lineTo(ex + r, ey);
      ctx.moveTo(ex, ey - r); ctx.lineTo(ex, ey + r);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,225,0.95)';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.1 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // A sword clenched in the jaws of a (rare) sword wolf.
    if (w.sword) {
      const mx = cx + 17 * s, my = cy - 12 * s; // grip point at the mouth
      ctx.lineCap = 'round';
      // Handle disappearing into the jaws
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(mx - 3 * s, my + 1.2 * s);
      ctx.lineTo(mx, my);
      ctx.stroke();
      // Crossguard
      ctx.strokeStyle = '#caa24a';
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.moveTo(mx - 1.5 * s, my - 2.4 * s);
      ctx.lineTo(mx + 1.5 * s, my + 2.4 * s);
      ctx.stroke();
      // Blade
      ctx.strokeStyle = '#dde2ea';
      ctx.lineWidth = 2.1 * s;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + 13 * s, my - 4 * s);
      ctx.stroke();
      // Edge highlight
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.9 * s;
      ctx.beginPath();
      ctx.moveTo(mx + 8 * s, my - 2.6 * s);
      ctx.lineTo(mx + 13 * s, my - 4 * s);
      ctx.stroke();
    }
    // The actual chicken sprite is glued to the carrier's mouth by
    // drawChicken (which reads c.carrier and offsets itself). Nothing to
    // draw here — keeps the chicken's true size, fat tier, and feathers
    // visible while it's being snatched.
    // Legs — foxes trot (animated); wolves keep a static stance.
    ctx.fillStyle = darkColor;
    const wLegX = [-8, -3, 3, 7];
    for (let i = 0; i < 4; i++) {
      const lift = w.fox ? Math.max(0, Math.sin((w.bob || 0) + (i % 2) * Math.PI)) * 2.2 : 0;
      ctx.fillRect(cx + wLegX[i] * s, cy - 4 * s, 2 * s, (6 - lift) * s);
    }
    // Tail — assassin and bomb wolves carry it flipped upside-down.
    ctx.strokeStyle = tailColor;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(cx - 11 * s, cy - 10 * s);
    if (w.assassin || w.bomb) {
      ctx.quadraticCurveTo(cx - 18 * s, cy - 6 * s, cx - 16 * s, cy - 14 * s);
    } else {
      ctx.quadraticCurveTo(cx - 18 * s, cy - 14 * s, cx - 16 * s, cy - 6 * s);
    }
    ctx.stroke();
    // Bomb wolf: a sparking fuse at the tail tip.
    if (w.bomb) {
      const sx2 = cx - 16 * s, sy2 = cy - 14 * s;
      const flick = 0.6 + Math.random() * 0.5;
      ctx.fillStyle = '#ff9d2e';
      ctx.beginPath();
      ctx.arc(sx2, sy2, 2.4 * s * flick, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff2b0';
      ctx.beginPath();
      ctx.arc(sx2, sy2, 1.1 * s * flick, 0, Math.PI * 2);
      ctx.fill();
    }
    // Hatted wolf: wears the keeper's own brown hat (same drawHat shape/size)
    // perched between the ears. Killing it drops that hat onto the keeper's
    // stack (see onWolfKilled).
    if (w.hatted) {
      drawHat(cx + 10 * s, cy - 19 * s, '#5a3825', w.hurtT > 0, true);
    }
    ctx.restore();
    // Hot Shot — flickering flames climb off a burning wolf (drawn unmirrored).
    if (w.burnT > 0) {
      const ft = Date.now() / 55;
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 4.5 * s;
        const flick = 0.7 + Math.sin(ft + i * 2.3) * 0.3;
        const baseY = cy - 9 * s;
        ctx.fillStyle = i === 1 ? 'rgba(255,150,40,0.9)' : 'rgba(225,70,20,0.85)';
        ctx.beginPath();
        ctx.ellipse(cx + off, baseY - 3 * s, 2.6 * s, (6 + i % 2 * 2) * s * flick, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,236,140,0.95)';
        ctx.beginPath();
        ctx.ellipse(cx + off, baseY - 4 * s, 1.2 * s, 3 * s * flick, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // White swing arc when a sword wolf strikes (drawn unmirrored).
    if (w.meleeT > 0) {
      drawMeleeArc(cx, cy - 9 * s, w.meleeDir, false, w.meleeT, 0.85 * s);
    }
    // Parachute canopy above a descending wolf (drawn last so it's on top).
    if (w.parachuting) {
      const topY = cy - 34 * s;       // canopy sits well above the dangling wolf
      // Rigging lines from the wolf up to the canopy rim.
      ctx.strokeStyle = 'rgba(230,230,230,0.9)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - 3 * s, cy - 15 * s); ctx.lineTo(cx - 13 * s, topY + 1);
      ctx.moveTo(cx + 3 * s, cy - 15 * s); ctx.lineTo(cx + 13 * s, topY + 1);
      ctx.moveTo(cx, cy - 17 * s);         ctx.lineTo(cx, topY);
      ctx.stroke();
      // Canopy dome — a half-ellipse with two colour panels.
      const cw = 14 * s, ch = 9 * s;
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.ellipse(cx, topY, cw, ch, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e6e6e6';
      ctx.beginPath();
      ctx.moveTo(cx - cw * 0.33, topY);
      ctx.lineTo(cx - cw * 0.33, topY - ch * 0.92);
      ctx.lineTo(cx, topY - ch);
      ctx.lineTo(cx, topY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(cx + cw * 0.33, topY);
      ctx.lineTo(cx + cw * 0.33, topY - ch * 0.92);
      ctx.lineTo(cx + cw * 0.66, topY - ch * 0.5);
      ctx.lineTo(cx + cw * 0.66, topY);
      ctx.closePath();
      ctx.fill();
      // Rim line.
      ctx.strokeStyle = '#7a1a10';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - cw, topY); ctx.lineTo(cx + cw, topY);
      ctx.stroke();
    }
    if (w.ghostWolf) ctx.restore();
  }

  function drawPellet(p) {
    const sp = worldToScreen(p.x, p.y);
    const slug = p.pierce > 1; // the piercing slug is drawn chunkier
    const y = sp.y + TILE_H/2 - 18;
    const col = p.color || (slug ? '#ffe680' : '#fff3a0');
    // Homing bullets pulsate — a throbbing core with a soft halo so they read
    // as "live", seeking rounds. The enemy (ranged-wolf) bullet is drawn bigger
    // and brighter with a hotter pulse so it's easy to spot and dodge.
    if (p.homing || p.wolfHoming) {
      const enemy = !!p.wolfHoming;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.022 + p.x * 3 + p.y * 3);
      const baseR = (p.r || 2) * (enemy ? 1.35 : 1);
      const rr = baseR * (0.8 + 0.6 * pulse); // pronounced grow/shrink
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (enemy ? 0.45 : 0.35) + 0.35 * pulse;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sp.x, y, rr + (enemy ? 3.6 : 2.2), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sp.x, y, rr, 0, Math.PI * 2);
      ctx.fill();
      if (enemy) {
        // Hot white core so the threat pops against the field.
        ctx.fillStyle = 'rgba(255,225,225,0.9)';
        ctx.beginPath();
        ctx.arc(sp.x, y, rr * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    // Critical shots — a hot, fiery round with a pulsing gold halo and a white
    // core so a primed crit reads at a glance.
    if (p.crit) {
      // Crit rounds glow in the CURRENT bullet's colour (yellow/red/blue/purple)
      // with a bright white core so a primed shot pops regardless of tint.
      const tint = p.critCol || '#ffae2a';
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.03 + p.x * 5 + p.y * 5);
      const rr = (p.r || 2) * 1.08; // close to the normal round size — a subtler crit
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.4 + 0.4 * pulse;
      ctx.fillStyle = tint;
      ctx.beginPath(); ctx.arc(sp.x, y, rr + 1.6 + pulse * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = tint;
      ctx.beginPath(); ctx.arc(sp.x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sp.x, y, rr * 0.45, 0, Math.PI * 2); ctx.fill();
      if (p.trail) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = tint;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(sp.x, y); ctx.lineTo(sp.x - p.vx, y - p.vy); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      return;
    }
    // Rooftop sniper round — fat orange tracer with a pulsing glow so it's
    // legible against the field even when arriving from the edge of the map.
    if (p.rooftop) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.018 + p.x * 4 + p.y * 4);
      const rr = (p.r || 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 + 0.25 * pulse;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(sp.x, y, rr + 4 + pulse * 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(sp.x, y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8e0';
      ctx.beginPath(); ctx.arc(sp.x, y, rr * 0.38, 0, Math.PI * 2); ctx.fill();
      // Trailing streak — long enough to read as a fast-moving projectile.
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sp.x, y);
      ctx.lineTo(sp.x - p.vx * 2.2, y - p.vy * 2.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sp.x, y, p.r || 2, 0, Math.PI*2);
    ctx.fill();
    // Trail — matches the bullet colour; the slug flies clean, with no trace.
    if (p.trail) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = col;
      ctx.lineWidth = slug ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(sp.x, y);
      ctx.lineTo(sp.x - p.vx, y - p.vy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

