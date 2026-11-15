  // ---------- Isometric projection ----------
  // World units: 1 = one tile. Player position is in world coords.
  const TILE_W = 32;  // isometric tile width (art pixels)
  const TILE_H = 16;  // isometric tile height (art pixels)
  let MAP_SIZE = 40; // tiles per side — grows as the player places coops
  let HALF_MAP = MAP_SIZE / 2;

  // camera offset (centered on player)
  let camX = 0, camY = 0;

  // world -> screen
  function worldToScreen(wx, wy) {
    const sx = (wx - wy) * (TILE_W / 2);
    const sy = (wx + wy) * (TILE_H / 2);
    return { x: sx - camX + W / 2, y: sy - camY + H / 2 };
  }
  // screen -> world (inverse)
  function screenToWorld(sx, sy) {
    const x = sx - W / 2 + camX;
    const y = sy - H / 2 + camY;
    const wx = (x / (TILE_W / 2) + y / (TILE_H / 2)) / 2;
    const wy = (y / (TILE_H / 2) - x / (TILE_W / 2)) / 2;
    return { x: wx, y: wy };
  }

  // ---------- Input ----------
  const keys = {};
  const mouse = { x: 0, y: 0, down: false };
  // Rolling buffer of the last few letters typed — matched against
  // DEBUG_PHRASE to reveal the debug panel. Sticks around once unlocked.
  let debugUnlocked = false;
  let debugTypedBuffer = '';
  function trackDebugPhrase(key) {
    if (!DEBUG) return;
    // Only letters count; everything else flushes the buffer.
    if (!/^[a-zA-Z]$/.test(key)) { debugTypedBuffer = ''; return; }
    debugTypedBuffer = (debugTypedBuffer + key.toLowerCase()).slice(-DEBUG_PHRASE.length);
    if (debugTypedBuffer === DEBUG_PHRASE) {
      debugTypedBuffer = '';            // consume so it takes a fresh re-type to toggle again
      debugUnlocked = !debugUnlocked;   // typing the phrase again hides it
      const dbg = document.getElementById('debug');
      if (dbg) dbg.style.display = debugUnlocked ? '' : 'none';
      toast(debugUnlocked ? 'Debug panel unlocked' : 'Debug panel hidden', 1.4);
    }
  }
  window.addEventListener('keydown', e => {
    // Title/lobby menu is up — let inputs (join code) work, but no game keys.
    if (inMenu) return;
    trackDebugPhrase(e.key);
    // Boss endscreen — Continue into wave 51+, or Restart. Host-driven in co-op.
    if (endScreen) {
      const k = e.key.toLowerCase();
      if (multiplayer && !isHost) {
        // Guest can't decide Continue, but R/F5 pings the host for a rematch
        // (same handshake as the game-over screen).
        if (k === 'r' || e.key === 'F5') {
          e.preventDefault();
          if (conn && conn.open) { try { conn.send({ type: 'restart-request' }); } catch (_) {} toast('Asked the host for a rematch…', 2.0); }
        }
        return;
      }
      if (k === 'c' || e.key === 'Enter') { e.preventDefault(); bossContinue(); return; }
      if (k === 'r' || e.key === 'F5')    { e.preventDefault(); requestRestart(); return; }
      return;
    }
    if (upgradeMode) {
      // Escape can still unpause if somehow both states are active (e.g. debug panel).
      if (e.key === 'Escape' && paused) { togglePause(); return; }
      // Guest in individual-upgrade mode picks its own option locally.
      if (multiplayer && !isHost && gameOpts.individualUpgrades) {
        if (e.key === '1') { selectUpgradeP2(0); return; }
        if (e.key === '2') { selectUpgradeP2(1); return; }
        if (e.key === '3') { selectUpgradeP2(2); return; }
        return;
      }
      if (e.key === '1') { selectUpgrade(0); return; }
      if (e.key === '2') { selectUpgrade(1); return; }
      if (e.key === '3') { selectUpgrade(2); return; }
      return;
    }
    if (e.key === 'Escape') {
      if (paused) { togglePause(); return; }
      if (!gameOver) togglePause();
      return;
    }
    // Q while paused or on the game-over screen drops the run + returns
    // to the title menu. Guarded so a stray Q mid-wave can't quit you.
    if (e.key.toLowerCase() === 'q' && (paused || gameOver)) {
      e.preventDefault();
      // Mid-run quits ask for a second press; the run is already over on the
      // game-over screen, so there's nothing left to lose — leave immediately.
      if (gameOver) quitToMenu();
      else          requestQuitToMenu();
      return;
    }
    // F5 on the game-over screen restarts the run directly instead of the
    // browser-default page reload that bounces back through the menu. Only the
    // HOST can actually restart a co-op run — a guest's F5 just pings the host
    // ("buddy wants a rematch") and waits for them to pull the trigger.
    if (e.key === 'F5' && gameOver) {
      e.preventDefault();
      if (multiplayer && !isHost) {
        if (conn && conn.open) {
          try { conn.send({ type: 'restart-request' }); } catch (_) {}
          toast('Asked the host for a rematch…', 2.0);
        }
        return;
      }
      requestRestart();
      return;
    }
    if (paused) return;
    // Nerd Reload: type the answer (Enter or R submits). Jock Reload: mash SPACE.
    // These run only for the local keeper, so guests never trigger them.
    if (nerdActive) {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); if (nerdInput.length < 4) nerdInput += e.key; return; }
      if (e.key === 'Backspace')        { e.preventDefault(); nerdInput = nerdInput.slice(0, -1); return; }
      if (e.key === 'Enter' || e.key.toLowerCase() === 'r') { e.preventDefault(); nerdSubmit(); return; }
    }
    if (jockActive && e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) jockPress(); // ignore key-repeat — you have to actually mash
      return;
    }
    if (e.key.toLowerCase() === 'e') {
      e.preventDefault();
      if ((player.danceT || 0) > 0) return; // stunned mid-dance
      dismissBuildHint(); // player learned the build key — drop the starter hint
      // Guest forwards build actions to the host (host owns the world).
      if (multiplayer && !isHost) {
        sendP2Input('buildToggle');
        return;
      }
      if (buildMode) {
        placeBuilding(player);
      } else {
        // Build/reload are mutually exclusive: don't enter build mode while
        // a reload animation or reload skill-check is in flight.
        if (reloadingT > 0 || player.skillCheckActive || reloadMinigameActive()) {
          toast('Can\'t build while reloading', 0.8);
          return;
        }
        // Entering build mode cancels any in-progress reload skill-check so
        // the two modes can never be active at the same time.
        player.skillCheckActive = false;
        player.skillCheckLockoutT = 0;
        // Enter build mode and select first unlocked build type
        buildMode = true;
        // ensure we don't open on a locked fence option
        for (let i = 0; i < BUILD_TYPES.length; i++) {
          const t = BUILD_TYPES[i];
          if (t === 'fence' && upgradeLevels.woodFence <= 0) continue;
          if (t === 'stonefence' && upgradeLevels.stoneWall <= 0) continue;
          if (t === 'farm' && upgradeLevels.farm < 1) continue;
          buildType = i; break;
        }
        player.buildMode = true;
        player.buildType = buildType;
        toast(buildModeToast(player));
      }
      return;
    }
    // Guest forwards reload key to host (host is authoritative).
    if (multiplayer && !isHost && e.key.toLowerCase() === 'r') {
      sendP2Input('reload');
      return;
    }
    // Fast A+D mashing (a left-right wiggle) taps the dance-stun. Distinct
    // presses only — ignore the OS key-repeat. Works for whichever keeper is
    // local: host OR guest. Each side roots its own `player` and syncs the jig
    // across the wire (host → snapshot, guest → pos).
    if (!e.repeat) {
      const lk = e.key.toLowerCase();
      if (lk === 'a' || lk === 'd') registerWdSpam(lk);
    }
    // Parry Mode: SHIFT rolls the keeper forward (a dodge). Queue it here; the
    // movement step picks the heading and honours the cooldown.
    if (parryMode && e.key === 'Shift' && !e.repeat
        && !paused && !upgradeMode && !inMenu && !gameOver) player.dashQueued = true;
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // ---- "Dance" stun: mash A and D very fast (7 of each inside the window) —
  // a left-right wiggle that tangles the keeper's feet into a jam-like lockout
  // while they bust a little dance. Player 1 / local single-player only. ----
  const WD_SPAM_NEEDED = 7;
  const WD_SPAM_WINDOW  = 1000; // ms to land 7 A AND 7 D presses
  const DANCE_DURATION  = 2.2;  // seconds rooted while dancing
  let wdWStamps = [];           // 'A' press timestamps
  let wdDStamps = [];           // 'D' press timestamps
  function registerWdSpam(lk) {
    if (gameOver || paused || upgradeMode || inMenu || player.ghost) return;
    if ((player.danceT || 0) > 0) return;
    const now = Date.now();
    const arr = lk === 'a' ? wdWStamps : wdDStamps;
    arr.push(now);
    while (arr.length && now - arr[0] > WD_SPAM_WINDOW) arr.shift();
    if (wdWStamps.length >= WD_SPAM_NEEDED && wdDStamps.length >= WD_SPAM_NEEDED) {
      wdWStamps.length = 0; wdDStamps.length = 0;
      triggerDanceStun();
    }
  }
  function triggerDanceStun() {
    player.danceT = DANCE_DURATION;
    player.danceAnimT = 0;
    // Snap out of any conflicting modes, the way a jam interrupts you.
    player.skillCheckActive = false;
    player.skillCheckNeedsRelease = false;
    buildMode = false; player.buildMode = false;
    playReloadJam(); // reuse the "stuck" thunk
    toast('Your feet got tangled — bust a move!', 1.8);
  }
  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * W / r.width;
    mouse.y = (e.clientY - r.top) * H / r.height;
  });
  canvas.addEventListener('mousedown', e => {
    // Game-over / end-screen action buttons (drawn by drawGameOverPanel).
    if ((gameOver || endScreen) && gameOverBtnRects) {
      for (const [key, r] of Object.entries(gameOverBtnRects)) {
        if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) {
          if (key === 'menu')      quitToMenu();
          if (key === 'restart')   requestRestart();
          if (key === 'continue')  bossContinue();
          if (key === 'resurrect') activateResurrect();
          return;
        }
      }
      return; // don't fall through to shoot
    }
    if (paused) {
      // Resume / Quit buttons
      if (pauseBtnRects) {
        for (const [key, r] of Object.entries(pauseBtnRects)) {
          if (mouse.x >= r.x && mouse.x <= r.x + r.w &&
              mouse.y >= r.y && mouse.y <= r.y + r.h) {
            if (key === 'resume') togglePause();
            if (key === 'tree')   openSkillTree(); // stays paused behind the overlay
            if (key === 'quit')   requestQuitToMenu(); // two presses to leave a live run
            return;
          }
        }
      }
      // Tab-switch arrow
      if (pauseTabRect &&
          mouse.x >= pauseTabRect.x && mouse.x <= pauseTabRect.x + pauseTabRect.w &&
          mouse.y >= pauseTabRect.y && mouse.y <= pauseTabRect.y + pauseTabRect.h) {
        pauseTab = pauseTab === 'status' ? 'upgrades' : 'status';
        pauseUpgradeScroll = 0;
      }
      return;
    }
    mouse.down = true;
    // Brief lock right after the upgrade window closes — stops a click that
    // selected an upgrade from spilling into a shot in a random direction.
    if (postUpgradeLockT > 0 && !upgradeMode) return;
    if (upgradeMode) {
      // In individual-upgrades mode the guest picks its own option locally
      // (the host renders nothing for the guest's screen — guest's pool is in
      // upgradeOptions2 / hit-rects come from getUpgradeOptionRects()).
      if (multiplayer && !isHost && gameOpts.individualUpgrades) {
        selectUpgradeP2At(mouse.x, mouse.y);
        return;
      }
      selectUpgradeAt(mouse.x, mouse.y);
      return;
    }
    // Guest forwards every fire-action to the host (host owns the sim).
    // The guest's local keeper is `player`, so its upgrade ladder is
    // lvlsFor(player) — that's the one that decides whether right-click is
    // a double-shot, a mag dump, or just a shoot.
    if (multiplayer && !isHost) {
      const lvls = lvlsFor(player);
      let action = 'shoot';
      // Machine-Gun (incl. the Double-Machine combo) → mag dump; pure
      // Double-Barrel → double shot. Mirrors the host's dispatch order.
      if (e.button === 2 && lvls.machineGun > 0 && lvls.sword < 1)        action = 'magDump';
      else if (e.button === 2 && lvls.doubleBarrel > 0 && lvls.sword < 1) action = 'doubleShot';
      sendP2Input(action);
      return;
    }
    // Right-click. When BOTH Double-Barrel and Machine-Gun are owned (the
    // Double-Machine combo via Metaverse) the gun IS a machine gun, so the
    // mag-dump path takes precedence — it fires a double burst per round (see
    // the dump loop). Machine-Gun is therefore checked first.
    if (e.button === 2 && upgradeLevels.sword < 1) {
      if (upgradeLevels.machineGun > 0)  { magDump();   return; }
      if (upgradeLevels.doubleBarrel > 0){ doubleShot(); return; }
    }
    tryShoot();
  });
  canvas.addEventListener('mouseup', () => { mouse.down = false; });
  canvas.addEventListener('mouseup', () => { player.skillCheckNeedsRelease = false; });
  // Suppress the browser right-click menu (inspect element, etc.) over the game.
  window.addEventListener('contextmenu', e => e.preventDefault());
  // Scroll wheel cycles the building type while in build mode.
  canvas.addEventListener('wheel', e => {
    // Pause menu scroll — when the player is browsing the Upgrades tab
    // with more entries than the box can show, the wheel scrolls the list.
    if (paused && pauseTab === 'upgrades') {
      e.preventDefault();
      pauseUpgradeScroll = Math.max(0, (pauseUpgradeScroll || 0) + (e.deltaY > 0 ? 1 : -1));
      return;
    }
    // Guest's wheel cycles its OWN build type (mirrored from snapshot, sent
    // back to host as a p2input scroll request).
    if (multiplayer && !isHost) {
      if (!player.buildMode) return;
      e.preventDefault();
      sendP2Input('buildScroll', { dir: e.deltaY > 0 ? 1 : -1 });
      return;
    }
    if (!buildMode) return;
    e.preventDefault();
    // Advance to the next unlocked build type (skip locked fences)
    const dir = e.deltaY > 0 ? 1 : -1;
    let attempts = 0;
    let idx = buildType;
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
      buildType = idx; break;
    }
    player.buildType = buildType; // keep the mirror current for buildModeToast
    toast(buildModeToast(player));
  }, { passive: false });

  // ── Mobile virtual gamepad ────────────────────────────────────────────────
  // All state is fed into the same keys[], mouse, and game functions — no
  // changes to the game loop. Only runs on touch-primary mobile devices.
  (function setupMobileHUD() {
    if (!isMobileMode) return;

    const mobHud      = document.getElementById('mob-hud');
    const movePad     = document.getElementById('mob-move-pad');
    const moveKnob    = document.getElementById('mob-move-knob');
    const aimPad      = document.getElementById('mob-aim-pad');
    const aimKnob     = document.getElementById('mob-aim-knob');
    const buildBtn    = document.getElementById('mob-build-btn');
    const scrLBtn     = document.getElementById('mob-scr-l');
    const scrRBtn     = document.getElementById('mob-scr-r');
    const pauseBtn    = document.getElementById('mob-pause');
    const hudToggle   = document.getElementById('mob-hud-toggle');
    const dashBtn     = document.getElementById('mob-dash-btn');
    const altBtn      = document.getElementById('mob-alt-btn');
    const gameHud     = document.getElementById('hud');

    mobHud.style.display = 'block';

    // Audible tap feedback on the virtual gamepad buttons (not the sticks —
    // those fire continuously). Capture phase so it runs ahead of the
    // per-button handlers regardless of how they stop propagation.
    mobHud.addEventListener('touchstart', e => {
      if (e.target.closest('.mob-btn')) playUiClick();
    }, { capture: true, passive: true });

    const PAD_R      = 60;   // pad radius (half of 120 px)
    const KNOB_R     = 36;   // max knob travel
    const DEAD       = 0.25; // normalised movement deadzone
    const AIM_SHOOT_THRESHOLD = 12; // px from centre — release below this = no shot

    let moveTouchId = -1, moveCx = 0, moveCy = 0;
    let aimTouchId  = -1, aimCx  = 0, aimCy  = 0;
    let aimLastDist = 0; // distance at last touchmove — checked on release to decide fire

    function padCenter(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // Draw pixel-art chicken icon on a 48×48 knob canvas.
    // red=true applies a red tint overlay (sprint / aim-held state).
    function drawKnobChicken(canvas, red) {
      const kc = canvas.getContext('2d');
      const S  = 48;
      kc.clearRect(0, 0, S, S);

      // Crisp pixel art — disable smoothing on the knob canvas.
      kc.imageSmoothingEnabled = false;

      kc.save();
      // Centre + scale so the chicken (roughly -4..12 x, -13..8 y) fills nicely.
      kc.translate(S * 0.40, S * 0.60);
      const sc = 2.5;
      kc.scale(sc, sc);

      // Body
      kc.fillStyle = red ? '#f0a0a0' : '#fafafa';
      kc.beginPath();
      kc.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2);
      kc.fill();

      // Head
      kc.beginPath();
      kc.arc(5, -6, 4, 0, Math.PI * 2);
      kc.fill();

      // Comb
      kc.fillStyle = red ? '#ff3333' : '#e74c3c';
      kc.beginPath();
      kc.arc(4, -10, 1.6, 0, Math.PI * 2);
      kc.arc(6, -11, 1.6, 0, Math.PI * 2);
      kc.fill();

      // Beak
      kc.fillStyle = red ? '#e07020' : '#f1a23b';
      kc.beginPath();
      kc.moveTo(8, -6); kc.lineTo(11, -5); kc.lineTo(8, -4); kc.closePath();
      kc.fill();

      // Eye
      kc.fillStyle = '#111';
      kc.fillRect(6, -7, 1, 1);

      // Legs
      kc.strokeStyle = red ? '#e07020' : '#e8a23b';
      kc.lineWidth = 1.4;
      kc.beginPath();
      kc.moveTo(-1, 4); kc.lineTo(-2, 8);
      kc.moveTo(2, 4);  kc.lineTo(3, 8);
      kc.stroke();

      kc.restore();
    }

    // ── Movement joystick (left) ──────────────────────────────────────────
    movePad.addEventListener('touchstart', e => {
      e.preventDefault();
      if (moveTouchId !== -1) return;
      const t = e.changedTouches[0];
      moveTouchId = t.identifier;
      const c = padCenter(movePad); moveCx = c.x; moveCy = c.y;
      movePad.classList.add('active');
    }, { passive: false });

    movePad.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== moveTouchId) continue;
        const dx = t.clientX - moveCx, dy = t.clientY - moveCy;
        const dist = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(dist, KNOB_R);
        const nx = dx / dist, ny = dy / dist;
        moveKnob.style.left = (50 + nx * clamped / PAD_R * 50) + '%';
        moveKnob.style.top  = (50 + ny * clamped / PAD_R * 50) + '%';
        keys['d'] = nx >  DEAD;
        keys['a'] = nx < -DEAD;
        keys['s'] = ny >  DEAD;
        keys['w'] = ny < -DEAD;
      }
    }, { passive: false });

    function endMove() {
      moveTouchId = -1;
      moveKnob.style.left = '50%'; moveKnob.style.top = '50%';
      keys['w'] = keys['a'] = keys['s'] = keys['d'] = false;
      movePad.classList.remove('active');
    }
    movePad.addEventListener('touchend', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === moveTouchId) endMove();
    }, { passive: false });
    movePad.addEventListener('touchcancel', endMove);

    // ── Aim joystick (right) — hold turns red, release fires if displaced ─
    // aimAngle() ≈ atan2(mouse.y - H/2, mouse.x - W/2) since cam follows player.
    aimPad.addEventListener('touchstart', e => {
      e.preventDefault();
      if (aimTouchId !== -1) return;
      const t = e.changedTouches[0];
      aimTouchId = t.identifier;
      const c = padCenter(aimPad); aimCx = c.x; aimCy = c.y;
      aimLastDist = 0;
      aimPad.classList.add('active');
    }, { passive: false });

    aimPad.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== aimTouchId) continue;
        const dx = t.clientX - aimCx, dy = t.clientY - aimCy;
        const dist = Math.hypot(dx, dy);
        aimLastDist = dist;
        if (dist < 6) continue;
        const clamped = Math.min(dist, KNOB_R);
        const nx = dx / dist, ny = dy / dist;
        aimKnob.style.left = (50 + nx * clamped / PAD_R * 50) + '%';
        aimKnob.style.top  = (50 + ny * clamped / PAD_R * 50) + '%';
        const reach = Math.max(W, H) * 0.45;
        mouse.x = W / 2 + nx * reach;
        mouse.y = H / 2 + ny * reach;
      }
    }, { passive: false });

    function endAim() {
      // Fire if the stick was displaced when released; silently cancel if returned to centre.
      // In build mode, tryShoot() cancels build mode instead of firing — that's
      // the right behaviour: flick right stick to exit build mode without a shot.
      if (aimLastDist > AIM_SHOOT_THRESHOLD && !upgradeMode && !paused) tryShoot();
      aimTouchId = -1;
      aimLastDist = 0;
      aimKnob.style.left = '50%'; aimKnob.style.top = '50%';
      aimPad.classList.remove('active');
    }
    aimPad.addEventListener('touchend', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === aimTouchId) endAim();
    }, { passive: false });
    aimPad.addEventListener('touchcancel', () => {
      aimTouchId = -1; aimLastDist = 0;
      aimKnob.style.left = '50%'; aimKnob.style.top = '50%';
      aimPad.classList.remove('active');
    });

    // ── Build button (E key) ──────────────────────────────────────────────
    buildBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    }, { passive: false });
    buildBtn.addEventListener('touchend', e => { e.preventDefault(); }, { passive: false });

    // ── Scroll buttons (cycle building type) ─────────────────────────────
    function dispatchScroll(dir) {
      canvas.dispatchEvent(new WheelEvent('wheel',
        { deltaY: dir * 100, bubbles: true, cancelable: true }));
    }
    scrLBtn.addEventListener('touchstart', e => { e.preventDefault(); dispatchScroll(-1); }, { passive: false });
    scrRBtn.addEventListener('touchstart', e => { e.preventDefault(); dispatchScroll(1);  }, { passive: false });

    // ── Pause button (top-right) ──────────────────────────────────────────
    pauseBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!gameOver) togglePause();
    }, { passive: false });

    // ── Dash button (top-left of move pad) ───────────────────────────────
    dashBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!parryMode || paused || upgradeMode || inMenu || gameOver) return;
      player.dashQueued = true;
    }, { passive: false });

    // ── Alt-fire button (top-right of aim pad) ────────────────────────────
    altBtn.addEventListener('touchstart', e => {
      e.preventDefault();
      if (paused || upgradeMode || inMenu || gameOver) return;
      if (upgradeLevels.sword >= 1) return;
      if (upgradeLevels.machineGun > 0)   { magDump();    return; }
      if (upgradeLevels.doubleBarrel > 0) { doubleShot(); return; }
    }, { passive: false });

    // ── HUD info toggle (top-left) ────────────────────────────────────────
    let hudVisible = false;
    if (gameHud) gameHud.style.display = 'none';
    hudToggle.addEventListener('touchstart', e => {
      e.preventDefault();
      hudVisible = !hudVisible;
      gameHud.style.display = hudVisible ? '' : 'none';
    }, { passive: false });

    // ── Canvas touch: pause / game-over / end-screen button hit-testing ──
    canvas.addEventListener('touchstart', e => {
      const r = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const cx = (t.clientX - r.left) * W / r.width;
      const cy = (t.clientY - r.top)  * H / r.height;
      function hitTest(rects, handlers) {
        for (const [key, rect] of Object.entries(rects)) {
          if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) {
            e.preventDefault();
            handlers[key]?.();
            return true;
          }
        }
        return false;
      }
      if (paused && pauseBtnRects) {
        if (hitTest(pauseBtnRects, {
          resume: () => togglePause(),
          tree:   () => openSkillTree(),
          quit:   () => requestQuitToMenu(), // two taps to leave a live run
        })) return;
        // Tab-switch button — touch had no handler for it, so mobile players
        // could never reach the UPGRADES tab from the pause panel.
        if (pauseTabRect && hitTest({ tab: pauseTabRect }, {
          tab: () => { pauseTab = pauseTab === 'status' ? 'upgrades' : 'status'; pauseUpgradeScroll = 0; },
        })) return;
        // Anywhere else inside the upgrade list scrolls it: tapping the lower
        // half pages down, the upper half pages up (no wheel on touch).
        if (pauseTab === 'upgrades') {
          e.preventDefault();
          pauseUpgradeScroll = Math.max(0, (pauseUpgradeScroll || 0) + (cy > H / 2 ? 1 : -1));
        }
        return;
      }
      if (gameOverBtnRects) {
        hitTest(gameOverBtnRects, {
          menu: quitToMenu, restart: requestRestart,
          continue: bossContinue, resurrect: activateResurrect
        });
      }
    }, { passive: false });

    // ── Per-frame sync ────────────────────────────────────────────────────
    const centerCluster = document.getElementById('mob-center-cluster');
    const gameplayEls = [movePad, aimPad, centerCluster, pauseBtn, hudToggle, dashBtn, altBtn];
    function syncMobState() {
      const showGameplay = !gameOver && !endScreen && !inMenu;
      for (const el of gameplayEls) el.style.display = showGameplay ? '' : 'none';

      // Scroll arrows: dim when not in build mode
      const inBuild = showGameplay && buildMode;
      scrLBtn.style.opacity = inBuild ? '1' : '0.22';
      scrRBtn.style.opacity = inBuild ? '1' : '0.22';

      // Dash button: dim if parry mode is off (can be toggled via debug)
      dashBtn.style.opacity = parryMode ? '1' : '0.22';

      // Alt-fire button: transparent until machine gun or double barrel unlocked
      const altUnlocked = upgradeLevels.machineGun > 0 || upgradeLevels.doubleBarrel > 0;
      altBtn.style.opacity = altUnlocked ? '1' : '0.15';

      // Left stick: red while sprinting OR while touch is on pad and running
      const isSprinting = showGameplay && (player.runT || 0) > RUN_WARMUP;
      const moveRed = isSprinting;
      if (moveRed) movePad.classList.add('active');
      else if (moveTouchId === -1) movePad.classList.remove('active');

      // Aim stick: red while a touch is held on the pad
      const aimRed = aimTouchId !== -1;

      // Draw chicken icons on knob canvases each frame
      drawKnobChicken(moveKnob, moveRed);
      drawKnobChicken(aimKnob, aimRed);

      requestAnimationFrame(syncMobState);
    }
    // Don't start the loop yet. This file is only the 3rd of the js/ scripts,
    // and the browser can render a frame in the gap while a later one is still
    // downloading — syncMobState would then run before state.js has executed
    // and blow up on `gameOver` (a top-level `let` that doesn't exist until
    // that script runs). DOMContentLoaded fires only after every parser-
    // blocking script in the body has executed, so it's the right gate.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded',
        () => requestAnimationFrame(syncMobState), { once: true });
    } else {
      requestAnimationFrame(syncMobState);
    }
  })();

