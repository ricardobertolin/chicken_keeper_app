  // ---------- Title menu ----------
  function startGame(isMultiplayer) {
    // Hide the menu before resetting the world so the canvas never shows a blank
    // frame while the menu overlay is still visible.
    const menu = document.getElementById('menu');
    if (menu) menu.style.display = 'none';
    document.body.classList.remove('in-menu');
    inMenu = false;
    // Tear down the menu's ambient demo before the real run begins.
    resetWorld();
    multiplayer = !!isMultiplayer;
    if (multiplayer) {
      player2.active = true;
      // Spawn the second player a couple of tiles away so they don't overlap P1.
      player2.x = player.x + 1.5;
      player2.y = player.y + 0.5;
      // New-game-plus doubling applies to BOTH keepers (2^tier), matching P1.
      player2.hats = START_HATS * Math.pow(2, restartBonusTier);
      player2.hurtT = 0;
      // Reset player2 weapon state for a fresh run.
      player2.chambered = true;
      player2.shells = 1;
      player2.reloadingT = 0;
      player2.ammo = 0;
      player2.magDumpLeft = 0;
      player2.magDumpT = 0;
      player2.jamStreak = 0;
      player2.spinDmg = false;
      player2.reloadT = 0;
      player2.jamT = 0;
      player2.jamFlashT = 0;
      player2.critSpeedT = 0;
      player2.spinT = 0;
      player2.meleeT = 0;
      player2.skillCheckActive = false;
      player2.skillCheckT = 0;
      player2.skillCheckLockoutT = 0;
      player2.speed = 4.0;
      player2.buildMode = false;
      player2.buildType = 0;
      player2.karma = 0;
      player2.chickensKilledThisWave = 0;
      player2.bulletHitT = 0;
      player2.kills = 0;
      player2.deaths = 0;
      player.kills = 0;
      player.deaths = 0;
      player.chickensShot = 0;
      player2.chickensShot = 0;
      player.deathCause = '';
      player2.deathCause = '';
      // P2 wallet + upgrade ladder start fresh too — but the wallet keeps the
      // post-boss doubling (2^tier) so the new-game-plus reward isn't wiped here.
      money2 = 20 * Math.pow(2, restartBonusTier);
      for (const k in upgradeLevels2) upgradeLevels2[k] = 0;
      // Send an initial position immediately so the peer can place us right away.
      netSendT = 0;
    } else {
      player2.active = false;
    }
    last = performance.now(); // avoid a huge dt on the first frame after the menu
    render(); // paint the clean world immediately — avoids a ~16ms flash of the old demo canvas while the frame-rate cap is resetting
    getAudio(); // priming audio off a user gesture so sounds play on first shot
    // Post-boss carryover: add the flat 0.1% from the last run AFTER every reset
    // (so it isn't caught by the new-game-plus doubling), then consume it.
    if (pendingCarryMoney > 0) {
      money += pendingCarryMoney;
      toast('Carried over $' + pendingCarryMoney + ' from your last run', 2.4);
      pendingCarryMoney = 0;
    }
    if (!multiplayer) {
      showBuildHint(); // stays up until the player first opens build mode
    }
  }

