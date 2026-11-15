  // ---------- Online lobby (PeerJS) ----------
  // PeerJS is loaded on demand — not fetched until the player opens the lobby.
  let _peerJsPromise = null;
  function requirePeerJS() {
    if (typeof Peer !== 'undefined') return Promise.resolve();
    if (_peerJsPromise) return _peerJsPromise;
    _peerJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = () => {
        _peerJsPromise = null;
        s.remove();
        reject(new Error('PeerJS failed to load (offline?).'));
      };
      document.head.appendChild(s);
    });
    return _peerJsPromise;
  }
  // Same broker/code scheme as the chess app — a short lobby code is hashed
  // into the host's PeerJS id; the guest connects to it. After 'open' fires
  // gameplay traffic uses a WebRTC data channel, directly or through TURN.
  const ID_PREFIX = 'chicken-mp-v1-';
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LEN = 6;

  // Static client credentials or an HTTPS temporary-credential service, as in
  // Stacker. Explicit settings replace PeerJS's bundled TURN defaults.
  async function loadPeerOptions() {
    const configResponse = await fetch('./multiplayer-config.json', {
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!configResponse.ok) throw new Error('Could not load multiplayer settings. Reload and try again.');
    const settings = await configResponse.json();
    if (!settings || typeof settings !== 'object') throw new Error('Invalid multiplayer settings.');
    const endpoint = settings.turnCredentialsUrl ?? '';
    let iceServers = settings.iceServers === undefined ? [] : settings.iceServers;
    if (typeof endpoint !== 'string' || !Array.isArray(iceServers)) throw new Error('Invalid multiplayer settings.');
    if (endpoint.trim() && iceServers.length) throw new Error('Choose static TURN servers or a credential service URL, not both.');
    const relayOnly = new URLSearchParams(location.search).get('relay') === '1';
    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      iceTransportPolicy: relayOnly ? 'relay' : 'all',
    };
    if (!endpoint.trim() && !iceServers.length) {
      if (relayOnly) throw new Error('Relay testing needs a configured TURN service.');
      return { debug: 0, config };
    }
    if (endpoint.trim()) {
      const endpointUrl = new URL(endpoint);
      if (endpointUrl.protocol !== 'https:') throw new Error('The TURN credential service must use HTTPS.');
      const response = await fetch(endpointUrl.href, {
        method: 'POST', cache: 'no-store', credentials: 'omit',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(response.status === 429
        ? 'Too many connection attempts. Try again in a minute.'
        : 'The connection relay is unavailable. Please try again shortly.');
      ({ iceServers } = await response.json());
    }
    if (!Array.isArray(iceServers) || !iceServers.length) throw new Error('The relay service returned no servers.');
    let hasTurn = false;
    for (const server of iceServers) {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      if (!urls.length || urls.some(u => typeof u !== 'string' || !/^(stun|stuns|turn|turns):\S+$/.test(u))) {
        throw new Error('The relay service returned invalid servers.');
      }
      if (urls.some(u => /^turns?:/.test(u))) {
        if (typeof server.username !== 'string' || !server.username ||
            typeof server.credential !== 'string' || !server.credential) {
          throw new Error('The relay service returned incomplete credentials.');
        }
        hasTurn = true;
      }
    }
    if (!hasTurn) throw new Error('The relay service returned no TURN servers.');
    config.iceServers.push(...iceServers);
    return { debug: 0, config };
  }

  // Each incoming or outgoing data channel gets a bounded connection attempt.
  const CONNECT_TIMEOUT_MS = 15000;
  let netSession = 0;
  let netConnectTimer = null;
  let netHasRelay = false;

  let peer = null;
  let conn = null;
  let netRole = null;          // 'host' | 'guest' | null
  let isHost = false;          // true on the authoritative simulation client
  let netSendT = 0;            // countdown until the next position/snapshot broadcast

  function generateCode() {
    let s = '';
    const buf = new Uint8Array(CODE_LEN);
    crypto.getRandomValues(buf);
    for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    return s;
  }

  function showScreen(name) {
    document.querySelectorAll('#menu .menu-screen').forEach(el => {
      el.classList.toggle('is-active', el.dataset.screen === name);
    });
  }

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || ' ';
    el.classList.remove('is-bad', 'is-good');
    if (kind === 'bad')  el.classList.add('is-bad');
    if (kind === 'good') el.classList.add('is-good');
  }

  function ensurePeer(customId, peerOpts) {
    peer = customId ? new Peer(customId, peerOpts) : new Peer(undefined, peerOpts);
    const session = netSession;
    peer.on('error', err => {
      if (session !== netSession) return;
      console.warn('[Peer] error', err);
      const targetEl = netRole === 'guest'
        ? document.getElementById('joinStatus')
        : document.getElementById('hostStatus');
      if (inMenu) teardownConnection();
      if (err.type === 'unavailable-id') {
        setStatus(targetEl, 'Lobby code already in use — try again.', 'bad');
      } else if (err.type === 'peer-unavailable') {
        setStatus(targetEl, 'No lobby with that code is open.', 'bad');
        document.getElementById('btnJoinConnect').disabled = false;
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        setStatus(targetEl, 'Network error contacting the broker.', 'bad');
      } else {
        setStatus(targetEl, 'Peer error: ' + err.type, 'bad');
      }
    });
  }

  function teardownConnection() {
    ++netSession;
    clearTimeout(netConnectTimer);
    netConnectTimer = null;
    const oldConn = conn, oldPeer = peer;
    conn = peer = null;
    netRole = null;
    netHasRelay = false;
    document.getElementById('btnJoinConnect').disabled = false;
    if (oldConn) { try { oldConn.close(); } catch (_) {} }
    if (oldPeer) { try { oldPeer.destroy(); } catch (_) {} }
  }

  async function prepareLobby(role) {
    teardownConnection();
    const session = netSession;
    netRole = role;
    isHost = role === 'host';
    const target = document.getElementById(isHost ? 'hostStatus' : 'joinStatus');
    setStatus(target, 'Loading connection settings…');
    if (!isHost) document.getElementById('btnJoinConnect').disabled = true;
    try {
      const [, options] = await Promise.all([requirePeerJS(), loadPeerOptions()]);
      if (session !== netSession) return null;
      netHasRelay = options.config.iceServers.some(s =>
        (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(u)));
      setStatus(target, 'Connecting to broker…');
      return { session, options };
    } catch (e) {
      if (session === netSession) {
        teardownConnection();
        setStatus(target, e.message || 'Could not load connection settings.', 'bad');
      }
      return null;
    }
  }

  function watchLobbyConnection(c) {
    conn = c;
    const target = document.getElementById(isHost ? 'hostStatus' : 'joinStatus');
    function fail(message) {
      if (conn !== c || !inMenu) return;
      teardownConnection();
      setStatus(target, message, 'bad');
    }
    clearTimeout(netConnectTimer);
    netConnectTimer = setTimeout(() => fail(netHasRelay
      ? 'Could not connect, even through the relay. Keep the host tab open and try again.'
      : 'Could not connect directly. This network may need a TURN relay, which is not configured.'), CONNECT_TIMEOUT_MS);
    c.on('close', () => fail('The connection closed before the game started. Try again.'));
    c.on('error', () => fail('The connection could not be established. Check the lobby code and try again.'));
  }

  // Timestamp of the last message we got from the peer. The PeerJS `close`
  // event isn't fired reliably when a tab is killed, so we also fall back to
  // a silence timeout in loop() — if nothing arrives for NET_TIMEOUT_MS the
  // buddy is presumed gone.
  let netLastRecv = 0;
  let netDisconnected = false;
  let guestWantsRestart = false; // host-side: the guest pressed F5 asking for a rematch
  // Generous timeout — covers brief tab backgrounding (where rAF pauses
  // entirely and setInterval is throttled to ~1Hz) without spuriously
  // dropping the buddy.
  const NET_TIMEOUT_MS = 12000;

  function attachConn(c) {
    clearTimeout(netConnectTimer);
    netConnectTimer = null;
    conn = c;
    netLastRecv = performance.now();
    netDisconnected = false;
    c.on('data', msg => {
      if (conn !== c) return;
      netLastRecv = performance.now(); // any traffic counts as alive
      if (!msg || typeof msg !== 'object') return;
      // Either side: a peer pressed F5 to restart the run. Reset locally
      // (without tearing down the connection) so both clients return to
      // wave 1 in the same lobby.
      if (msg.type === 'restart') {
        if (typeof msg.tier === 'number') restartBonusTier = msg.tier;
        restartMpGame();
        return;
      }
      // Guest → host: the guest pressed F5 on the game-over screen. Only the
      // host can actually restart, so we just flag it + nudge the host.
      if (msg.type === 'restart-request' && isHost) {
        guestWantsRestart = true;
        toast('Buddy wants a rematch — ' + (isMobileMode ? 'tap RESTART' : 'press F5 to restart'), 4);
        return;
      }
      // Host → guest: a knockback to apply to the guest's keeper. The guest
      // owns its own position, so a server-side shove (from a double-shot
      // or mag-dump recoil) only lands if we forward it explicitly.
      if (msg.type === 'shove' && !isHost) {
        const dx = +msg.dx || 0, dy = +msg.dy || 0;
        if (!fenceBlocks(player.x + dx, player.y)) player.x += dx;
        if (!fenceBlocks(player.x, player.y + dy)) player.y += dy;
        player.x = clamp(player.x, -HALF_MAP + 1, HALF_MAP - 1);
        player.y = clamp(player.y, -HALF_MAP + 1, HALF_MAP - 1);
        return;
      }
      // Guest → host: forwarded debug-panel click. Stitch up a throwaway
      // button with the same dataset and click it, so the host's existing
      // root click handler runs the action exactly as if the host pressed it.
      if (msg.type === 'debug-action' && isHost) {
        const root = document.getElementById('debug');
        if (!root) return;
        const btn = document.createElement('button');
        btn.dataset.debug = msg.action || '';
        if (msg.amount != null) btn.dataset.amount = msg.amount;
        if (msg.id != null)     btn.dataset.id = msg.id;
        btn.style.display = 'none';
        // Apply the action against the guest's chosen target, not the host's
        // local selection. Temporarily swap in the forwarded target for the
        // synthetic click, then restore the host's own choice.
        const savedTarget = debugUpgradeTarget;
        if (msg.target === 'p1' || msg.target === 'p2' || msg.target === 'both') {
          debugUpgradeTarget = msg.target;
        }
        root.appendChild(btn);
        btn.click();
        root.removeChild(btn);
        debugUpgradeTarget = savedTarget;
        return;
      }
      // Guest → host: just the guest's keeper position.
      if (msg.type === 'pos' && player2.active) {
        player2.x = clamp(msg.x, -HALF_MAP + 1, HALF_MAP - 1);
        player2.y = clamp(msg.y, -HALF_MAP + 1, HALF_MAP - 1);
        player2.dir = msg.dir;
        player2.moving = !!msg.moving;
        player2.mouseDown = !!msg.mouseDown;
        // Mirror the guest's locally-computed Rocket Boots / Last Stand so the
        // host renders the buddy flying / crouched / cloaked.
        if (typeof msg.flightT === 'number') player2.flightT = msg.flightT;
        if (typeof msg.lastStandIdleT === 'number') player2.lastStandIdleT = msg.lastStandIdleT;
        if (typeof msg.lastStandStealth === 'boolean') player2.lastStandStealth = msg.lastStandStealth;
        // Guest's dance jig — render the buddy dancing (and rooted) on the host.
        if (typeof msg.danceT === 'number') player2.danceT = msg.danceT;
        if (typeof msg.danceAnimT === 'number') player2.danceAnimT = msg.danceAnimT;
        // Guest's dash — host mirrors it so the buddy's roll + hat-scatter play.
        if (typeof msg.dashT === 'number') { player2.dashT = msg.dashT; player2.dashX = msg.dashX || 0; player2.dashY = msg.dashY || 0; }
        return;
      }
      // Guest → host: a one-shot action (shoot, reload, magDump, doubleShot,
      // upgrade pick). Host executes it for player2 — guest only renders.
      if (msg.type === 'p2input' && isHost && player2.active) {
        if (msg.action === 'shoot')      tryShootP2();
        else if (msg.action === 'reload')    tryReloadP2();
        else if (msg.action === 'doubleShot') doubleShotP2();
        else if (msg.action === 'magDump')   magDumpP2();
        else if (msg.action === 'upgrade')   selectUpgradeP2OnHost(msg.index | 0);
        else if (msg.action === 'buildToggle') p2BuildToggle();
        else if (msg.action === 'buildScroll') p2BuildScroll(msg.dir | 0);
        return;
      }
      // Host → guest: full world snapshot. Guest replaces local state wholesale.
      if (msg.type === 'snapshot' && multiplayer && !isHost) {
        lastSnapshotReceivedT = 0; // reset lag timer on each successful snapshot
        applySnapshot(msg);
        return;
      }
    });
    c.on('close', () => { if (conn === c) handlePeerGone('close'); });
    c.on('error', e => { if (conn === c) { console.warn('[Conn] error', e); handlePeerGone('error'); } });
  }

  // One place to react to the other player going away — runs at most once
  // per disconnect. `reason` is just for logging.
  function handlePeerGone(reason) {
    if (netDisconnected) return;
    netDisconnected = true;
    console.log('[Net] peer gone:', reason);
    if (conn) { try { conn.close(); } catch (_) {} conn = null; }
    if (!multiplayer) return; // already left the lobby — nothing to do
    if (isHost) {
      // The guest left — drop them from the world and play on solo.
      if (player2.active) {
        player2.active = false;
        // Separate-money mode: the departing buddy's pot rolls into the host's,
        // exactly as it does when a buddy dies (becomeGhost above).
        if (gameOpts.separateMoney && money2 !== 0) { money += money2; money2 = 0; }
        // Long, prominent toast so the host actually sees it.
        toast(gameOpts.separateMoney
          ? 'Your buddy left — their money is now yours'
          : 'Your buddy left the game', 5);
      }
    } else if (!inMenu) {
      // The host is gone — the guest can't simulate anything, so end the run.
      gameOver = true;
      gameOverCause = '';
      gameOverMsg = 'The host left the game. ' + (isMobileMode ? 'Use the buttons below.' : 'Press Q for menu or F5 to restart.');
      toast('Host left the game', 5);
    } else {
      toast('Disconnected from host', 3);
    }
  }

  function netSendPosition() {
    if (!conn || !conn.open) return;
    try {
      conn.send({
        type: 'pos',
        x: player.x,
        y: player.y,
        dir: player.dir,
        moving: !!player.moving,
        mouseDown: !!mouse.down, // drives auto-fire for sword / machine-gun on host
        // The guest computes its own Rocket Boots + Last Stand locally; forward
        // them so the HOST can render the buddy flying / crouched / cloaked.
        flightT: player.flightT || 0,
        lastStandIdleT: player.lastStandIdleT || 0,
        lastStandStealth: !!player.lastStandStealth,
        // Dance stun — the guest's keeper jigs locally; forward it so the HOST
        // renders the buddy busting a move (and sees them rooted in place).
        danceT: player.danceT || 0,
        danceAnimT: player.danceAnimT || 0,
        // Guest's dash so the host can render the roll + hat-scatter on the buddy.
        dashT: player.dashT || 0,
        dashX: player.dashX || 0,
        dashY: player.dashY || 0,
      });
    } catch (e) { /* channel may be mid-teardown */ }
  }
  // Guest helper — forward a one-shot fire / reload / upgrade-pick action.
  function sendP2Input(action, extra) {
    if (!multiplayer || isHost || !conn || !conn.open) return;
    try { conn.send(Object.assign({ type: 'p2input', action }, extra || {})); }
    catch (e) {}
  }

  // ---------- Authoritative world snapshots (host → guest) ----------
  // Pull out just the fields the guest needs to render — references like
  // chicken.home are dropped (the AI that uses them never runs on the guest).
  function snapList(arr, fields) {
    const out = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const src = arr[i], dst = {};
      for (const f of fields) dst[f] = src[f];
      out[i] = dst;
    }
    return out;
  }
  const SNAP_FIELDS = {
    wolves:   ['x','y','size','fasterLevel','hurtT','facingLeft','alive','fox','bomb','sword','assassin','hatted','aggroT','carrying','fleeing','meleeT','meleeDir','bob','smokeT','defective','turncoat','coldT','burnT','boss','aimDir','walkT','missileWolf','missilePhase','missileChargeT','jumper','jumpT','jumpDur','hunterWolf','muzzleT','maxHp','hp','hatColor','gunColor','pup','ranged','homer','parachuting','parachuteH','parachuteSway','crawler','legPhase','sparkleT'],
    chickens: ['x','y','alive','facingLeft','fat','worker','rich','bob','fleeT'],
    coops:    ['x','y','level','dirtR','builtWave','shakeT','igniteT','launching','hatchHint'],
    fences:   ['x','y','kind','hp','hurtT'],
    farms:    ['x','y','growth','need','trampleFlash'],
    dogs:     ['x','y','facingLeft','bob','variant'],
    corpses:  ['x','y','kind','t','frost','fried'],
    pellets:  ['x','y','vx','vy','r','color','trail','pierce','crit','critCol','homing','wolfHoming','rooftop'],
    smoke:    ['x','y','t','life','r'],
    blasts:   ['x','y','t','life','col'],
    dummies:  ['x','y','hp','maxHp','hurtT','_decoy'],
    statues:  ['x','y','hp','maxHp','hurtT','_decoy'],
    debris:   ['x','y','kind','hp'],
    mines:    ['x','y','level','_decoy'],
    holes:    ['x','y'],
    scorches: ['x','y','t','life','r'],
    rooftoppers: ['x','y','fireT','dir','aimDir','facingLeft','alive','coopLevel','aiming','targetX','targetY'],
    // Laser / hit-scan beams (player, wolf, boss — incl. bending & ricochet
    // segments) so the guest sees every beam flash.
    beams:    ['x1','y1','x2','y2','t','life','color','yOff','thick'],
    // Hunter crew + their camps — a co-op upgrade both keepers share and see.
    hunters:  ['x','y','alive','hurtT','facingLeft','dir','walkT','weapon','dying','downT','tauntT','sombrero','hp','maxHp'],
    huntersCamps: ['x','y','dirtR','smokeT'],
    // FANGUS chicken-siphon orbs so the guest sees the steal-and-heal attack.
    chickenSuckers: ['x','y','phase'],
    // Boss/wave-51 missile rockets so the guest sees the incoming salvo.
    bossMissiles: ['x','y','vx','vy'],
  };

  function netSendSnapshot() {
    if (!conn || !conn.open) return;
    try {
      conn.send({
        type: 'snapshot',
        // Host's own keeper + the guest's keeper, both authoritative.
        host: {
          x: player.x, y: player.y, dir: player.dir, moving: !!player.moving,
          walkT: player.walkT, hats: playerHats, hurtT: player.hurtT,
          ghost: !!player.ghost, // host can now ghost too — sync the flag
          dying: !!player.dying, // mid-fall before the ghost — guest mirrors it
          karma: player.karma,    // per-player karma drives the shirt tint
          kills: player.kills || 0,
          deaths: player.deaths || 0,
          chickensShot: player.chickensShot || 0,
          deathCause: player.deathCause || '',
          mustache: player.mustache || 0, // FANGUS-kill mustache width
          mustacheAge: player.mustacheAge || 0, // greys the mustache with run age
          // Full hat-colour stack so the guest sees host's green-hats etc.
          hatColors: hatColors.slice(),
          buildMode: !!buildMode, // host's legacy build globals carry P1's state
          buildType: buildType,
          // Weapon-animation timers so the guest can render the host's
          // gun/sword/melee swing with the right state every frame.
          reloadT: player.reloadT, jamT: player.jamT, jamFlashT: player.jamFlashT || 0, spinT: player.spinT,
          meleeT: player.meleeT, meleeDir: player.meleeDir, meleeFull: !!player.meleeFull,
          // Dance stun (host-only mechanic) so the guest sees the host jig.
          danceT: player.danceT || 0, danceAnimT: player.danceAnimT || 0,
        },
        guest: { hats: player2.hats, hurtT: player2.hurtT, ghost: player2.ghost, dying: !!player2.dying },
        // Player2's authoritative weapon state, so the guest can render its
        // own gun and the host can show it to the guest with the right look.
        guestWeapon: {
          chambered:   player2.chambered,
          reloadingT:  player2.reloadingT,
          ammo:        player2.ammo,
          magDumpLeft: player2.magDumpLeft,
          jamStreak:   player2.jamStreak,
          spinDmg:     player2.spinDmg,
          // Animation timers the guest's drawKeeperWeapon/Badge read directly.
          reloadT:     player2.reloadT,
          jamT:        player2.jamT,
          jamFlashT:   player2.jamFlashT || 0, // cosmetic dud-shot flash
          spinT:       player2.spinT,
          critSpeedT:  player2.critSpeedT || 0, // crit footwork burst — guest's keeper moves quicker
          meleeT:      player2.meleeT,
          meleeDir:    player2.meleeDir,
          meleeFull:   !!player2.meleeFull,
          karma:       player2.karma,
          kills:       player2.kills || 0,
          deaths:      player2.deaths || 0,
          chickensShot: player2.chickensShot || 0,
          deathCause:  player2.deathCause || '',
          mustache:    player2.mustache || 0, // FANGUS-kill mustache width
          mustacheAge: player2.mustacheAge || 0, // greys the mustache with run age
          buildMode:   !!player2.buildMode,
          buildType:   player2.buildType,
          // Guest's reload skill-check (authoritative on host since host runs
          // tryReloadP2). Guest mirrors back onto its local `player`.
          skillCheckActive:   !!player2.skillCheckActive,
          skillCheckT:        player2.skillCheckT || 0,
          skillCheckLockoutT: player2.skillCheckLockoutT || 0,
        },
        guestUpgrades: gameOpts.individualUpgrades ? Object.assign({}, upgradeLevels2) : null,
        gameOpts: { friendlyFire: gameOpts.friendlyFire, separateMoney: gameOpts.separateMoney, individualUpgrades: gameOpts.individualUpgrades },
        money2: money2,
        guestUpgradeOptions: gameOpts.individualUpgrades ? upgradeOptions2.map(o => ({ id: o.id, title: o.title, desc: o.desc() })) : null,
        guestUpgradePicked: !!upgradePicked2,
        // Mirror the host's overlay state so the guest's render matches.
        upgradeMode: upgradeMode,
        paused: paused,
        // Host's upgrade levels + ammo/chamber state — needed to draw the
        // gun on the guest (which barrel, which decorations, etc.).
        upgrades: Object.assign({}, upgradeLevels),
        chambered: chambered,
        reloadingT: reloadingT,
        ammo: ammo,
        // Host's reload skill-check state — guest renders it above the host's head.
        skillCheckActive: !!player.skillCheckActive,
        skillCheckT: player.skillCheckT || 0,
        skillCheckLockoutT: player.skillCheckLockoutT || 0,
        // Rocket Boots + Last Stand visual flags — guest mirrors so the
        // host's keeper renders in flight / crouched / cloaked correctly.
        flightT: player.flightT || 0,
        lastStandIdleT: player.lastStandIdleT || 0,
        lastStandStealth: !!player.lastStandStealth,
        wolves:   snapList(wolves,   SNAP_FIELDS.wolves),
        chickens: snapList(chickens, SNAP_FIELDS.chickens),
        coops:    snapList(coops,    SNAP_FIELDS.coops),
        fences:   snapList(fences,   SNAP_FIELDS.fences),
        farms:    snapList(farms,    SNAP_FIELDS.farms),
        dogs:     snapList(dogs,     SNAP_FIELDS.dogs),
        corpses:  snapList(corpses,  SNAP_FIELDS.corpses),
        pellets:  snapList(pellets,  SNAP_FIELDS.pellets),
        smoke:    snapList(smoke,    SNAP_FIELDS.smoke),
        blasts:   snapList(blasts,   SNAP_FIELDS.blasts),
        dummies:  snapList(dummies,  SNAP_FIELDS.dummies),
        statues:  snapList(statues,  SNAP_FIELDS.statues),
        debris:   snapList(debris,   SNAP_FIELDS.debris),
        mines:    snapList(mines,    SNAP_FIELDS.mines),
        holes:    snapList(holes,    SNAP_FIELDS.holes),
        scorches: snapList(scorches, SNAP_FIELDS.scorches),
        rooftoppers: snapList(rooftoppers, SNAP_FIELDS.rooftoppers),
        beams:    snapList(beams,    SNAP_FIELDS.beams),
        hunters:  snapList(hunters,  SNAP_FIELDS.hunters),
        huntersCamps: snapList(huntersCamps, SNAP_FIELDS.huntersCamps),
        chickenSuckers: snapList(chickenSuckers, SNAP_FIELDS.chickenSuckers),
        bossMissiles: snapList(bossMissiles, SNAP_FIELDS.bossMissiles),
        huntersLeavePending: huntersLeavePending, // drives the hunters' stand/flee pose
        money: money,
        wave: wave,
        kills: kills,
        waveActive: waveActive,
        waveTimer: waveTimer,
        mapSize: MAP_SIZE,
        // Boss fight + end-of-boss screen state so the guest sees the health bar
        // and the "Wave 50 conquered" continue/restart screen.
        bossWaveActive: bossWaveActive,
        bossPhase: bossPhase,
        bossSidesDone: bossSidesDone,
        bossTint: bossTint, // dusk-orange boss overlay strength
        // Post-boss restart cutscene + black wipe, mirrored so the guest watches
        // the launch and the wipe before the world resets.
        rocketLaunch: rocketLaunch ? { x: rocketLaunch.coop.x, y: rocketLaunch.coop.y, level: rocketLaunch.coop.level || 0, t: rocketLaunch.t, riseY: rocketLaunch.riseY, lifted: !!rocketLaunch.lifted } : null,
        fade: fade ? { phase: fade.phase, t: fade.t, dur: fade.dur } : null,
        endScreen: endScreen,
        gameOver: gameOver,
        gameOverMsg: gameOverMsg,
        gameOverCause: gameOverCause,
        // One-shot sound events fired since the last snapshot — guest replays.
        sounds: pendingNetSounds.length ? pendingNetSounds.slice() : null,
        // One-shot toasts the guest needs to see (e.g. its own build feedback).
        guestToasts: pendingGuestToasts.length ? pendingGuestToasts.slice() : null,
        // Experimental Parry Mode flag — host-authoritative so the guest's
        // SHIFT dodge-roll is enabled in lockstep with the wolves' lunge attack.
        parryMode: parryMode,
        nightOfWolf: nightOfWolf,
        // Host's own dash so the guest can render the hat-scatter animation.
        hostDashT: player.dashT || 0,
        hostDashX: player.dashX || 0,
        hostDashY: player.dashY || 0,
      });
      pendingNetSounds.length = 0; // queue is drained on every send
      pendingGuestToasts.length = 0;
    } catch (e) { /* channel may be mid-teardown */ }
  }

  function replaceArray(target, src) {
    target.length = 0;
    if (src) for (let i = 0; i < src.length; i++) target.push(src[i]);
  }

  function applySnapshot(msg) {
    // Remote player position (host's keeper, rendered as player2 on the guest).
    if (msg.host) {
      player2.x = msg.host.x;
      player2.y = msg.host.y;
      player2.dir = msg.host.dir;
      player2.moving = !!msg.host.moving;
      player2.walkT = msg.host.walkT;
      // Host's hat count drives how player2 is drawn on the guest.
      if (typeof msg.host.hats === 'number') player2.hats = msg.host.hats;
      if (typeof msg.host.hurtT === 'number') player2.hurtT = msg.host.hurtT;
      // Weapon animation timers — drive gun spin / muzzle flash / melee arc.
      player2.reloadT = msg.host.reloadT || 0;
      player2.jamT = msg.host.jamT || 0;
      player2.jamFlashT = msg.host.jamFlashT || 0; // host's cosmetic dud-shot flash

      player2.spinT = msg.host.spinT || 0;
      player2.meleeT = msg.host.meleeT || 0;
      player2.meleeDir = msg.host.meleeDir || 0;
      player2.meleeFull = !!msg.host.meleeFull;
      player2.danceT = msg.host.danceT || 0;       // host's dance jig
      player2.danceAnimT = msg.host.danceAnimT || 0;
      // Host can ghost now too — mirror the flag so the guest renders the
      // host translucently after they fall.
      if (typeof msg.host.ghost === 'boolean') player2.ghost = msg.host.ghost;
      if (typeof msg.host.dying === 'boolean') {
        if (msg.host.dying && !player2.dying) player2.downT = 0; // restart the fall
        player2.dying = msg.host.dying;
      }
      if (typeof msg.host.karma === 'number') player2.karma = msg.host.karma;
      if (typeof msg.host.kills === 'number') player2.kills = msg.host.kills;
      if (typeof msg.host.deaths === 'number') player2.deaths = msg.host.deaths;
      if (typeof msg.host.chickensShot === 'number') player2.chickensShot = msg.host.chickensShot;
      if (typeof msg.host.deathCause === 'string') player2.deathCause = msg.host.deathCause;
      if (typeof msg.host.mustache === 'number') player2.mustache = msg.host.mustache;
      if (typeof msg.host.mustacheAge === 'number') player2.mustacheAge = msg.host.mustacheAge;
      // Host's hat-colour stack so the guest renders the host with the
      // actual mix (green hats from Buy Hat, etc.).
      if (Array.isArray(msg.host.hatColors)) player2.hatColors = msg.host.hatColors.slice();
      if (typeof msg.host.buildMode === 'boolean') player2.buildMode = msg.host.buildMode;
      if (typeof msg.host.buildType === 'number') player2.buildType = msg.host.buildType;
    }
    // Mirror the host's upgrade ladder + ammo/chamber state. Used by
    // drawPlayer2's weapon block and by entity rendering (coop chimneys,
    // fence spikes etc) so visuals match across both clients.
    if (msg.upgrades) Object.assign(upgradeLevels, msg.upgrades);
    if (msg.guestUpgrades) Object.assign(upgradeLevels2, msg.guestUpgrades);
    if (msg.gameOpts) Object.assign(gameOpts, msg.gameOpts);
    if (typeof msg.money2 === 'number') money2 = msg.money2;
    // Host's player1 chamber/reload/ammo — both as globals (for legacy code)
    // and onto player2 (which on the guest represents the host's keeper).
    if (typeof msg.chambered === 'boolean') { chambered = msg.chambered; player2.chambered = msg.chambered; }
    if (typeof msg.reloadingT === 'number') { reloadingT = msg.reloadingT; player2.reloadingT = msg.reloadingT; }
    if (typeof msg.ammo === 'number')       { ammo = msg.ammo; player2.ammo = msg.ammo; }
    // Mirror the host's skill-check state onto player2 (= host's keeper on the guest).
    if (typeof msg.skillCheckActive === 'boolean') player2.skillCheckActive = msg.skillCheckActive;
    if (typeof msg.skillCheckT === 'number')       player2.skillCheckT = msg.skillCheckT;
    if (typeof msg.skillCheckLockoutT === 'number') player2.skillCheckLockoutT = msg.skillCheckLockoutT;
    if (typeof msg.flightT === 'number')           player2.flightT = msg.flightT;
    if (typeof msg.lastStandIdleT === 'number')    player2.lastStandIdleT = msg.lastStandIdleT;
    if (typeof msg.lastStandStealth === 'boolean') player2.lastStandStealth = msg.lastStandStealth;
    // Player2's weapon state (the GUEST's own keeper, as seen by the host).
    if (msg.guestWeapon) {
      player.chambered   = msg.guestWeapon.chambered;
      player.reloadingT  = msg.guestWeapon.reloadingT;
      player.ammo        = msg.guestWeapon.ammo;
      player.magDumpLeft = msg.guestWeapon.magDumpLeft || 0;
      player.jamStreak   = msg.guestWeapon.jamStreak || 0;
      player.spinDmg     = !!msg.guestWeapon.spinDmg;
      // Animation timers — drive the guest's own muzzle flash / gun spin /
      // melee swing arc visuals.
      player.reloadT     = msg.guestWeapon.reloadT || 0;
      player.jamT        = msg.guestWeapon.jamT || 0;
      player.jamFlashT   = msg.guestWeapon.jamFlashT || 0; // cosmetic dud-shot flash
      player.spinT       = msg.guestWeapon.spinT || 0;
      player.critSpeedT  = msg.guestWeapon.critSpeedT || 0; // crit footwork burst (host-authoritative)
      player.meleeT      = msg.guestWeapon.meleeT || 0;
      player.meleeDir    = msg.guestWeapon.meleeDir || 0;
      player.meleeFull   = !!msg.guestWeapon.meleeFull;
      if (typeof msg.guestWeapon.karma === 'number') player.karma = msg.guestWeapon.karma;
      if (typeof msg.guestWeapon.kills === 'number') player.kills = msg.guestWeapon.kills;
      if (typeof msg.guestWeapon.deaths === 'number') player.deaths = msg.guestWeapon.deaths;
      if (typeof msg.guestWeapon.chickensShot === 'number') player.chickensShot = msg.guestWeapon.chickensShot;
      if (typeof msg.guestWeapon.deathCause === 'string') player.deathCause = msg.guestWeapon.deathCause;
      if (typeof msg.guestWeapon.mustache === 'number') player.mustache = msg.guestWeapon.mustache;
      if (typeof msg.guestWeapon.mustacheAge === 'number') player.mustacheAge = msg.guestWeapon.mustacheAge;
      if (typeof msg.guestWeapon.buildMode === 'boolean') player.buildMode = msg.guestWeapon.buildMode;
      if (typeof msg.guestWeapon.buildType === 'number') player.buildType = msg.guestWeapon.buildType;
      if (typeof msg.guestWeapon.skillCheckActive === 'boolean') player.skillCheckActive = msg.guestWeapon.skillCheckActive;
      if (typeof msg.guestWeapon.skillCheckT === 'number')       player.skillCheckT = msg.guestWeapon.skillCheckT;
      if (typeof msg.guestWeapon.skillCheckLockoutT === 'number') player.skillCheckLockoutT = msg.guestWeapon.skillCheckLockoutT;
    }
    if (msg.guestUpgradeOptions) {
      // Guest reconstructs lightweight upgrade options for its own picker.
      upgradeOptions2 = msg.guestUpgradeOptions.map(o => ({
        id: o.id, title: o.title, desc: () => o.desc,
      }));
    }
    if (typeof msg.guestUpgradePicked === 'boolean') upgradePicked2 = msg.guestUpgradePicked;
    // Host echoes the guest's own hat count back so the guest sees its damage.
    if (msg.guest) {
      if (typeof msg.guest.hats === 'number') {
        playerHats = msg.guest.hats;
        // Trim/pad the local hat-colour stack to match.
        while (hatColors.length > playerHats) hatColors.pop();
        while (hatColors.length < playerHats) hatColors.push('#5a3825');
      }
      if (typeof msg.guest.hurtT === 'number') player.hurtT = msg.guest.hurtT;
      if (typeof msg.guest.dying === 'boolean') {
        if (msg.guest.dying && !player.dying) player.downT = 0; // restart the fall
        player.dying = msg.guest.dying;
      }
      // Ghost transition — first time the host marks us dead, toast + go spectral.
      if (typeof msg.guest.ghost === 'boolean') {
        const wasGhost = player.ghost;
        player.ghost = msg.guest.ghost;
        if (!wasGhost && player.ghost) {
          toast('You died — wandering as a ghost. The hunt goes on!', 3.2);
        }
      }
    }
    // Mirror the host's overlay state (upgrade panel currently open, paused).
    upgradeMode = !!msg.upgradeMode;
    hostPaused = !!msg.paused;
    replaceArray(wolves,   msg.wolves);
    // The boss lives inside the synced wolves array; point the guest's `boss`
    // global at it so the health bar + boss name render (null when it's gone).
    boss = wolves.find(w => w.boss) || null;
    replaceArray(chickens, msg.chickens);
    replaceArray(coops,    msg.coops);
    replaceArray(fences,   msg.fences);
    replaceArray(farms,    msg.farms);
    replaceArray(dogs,     msg.dogs);
    replaceArray(corpses,  msg.corpses);
    replaceArray(pellets,  msg.pellets);
    replaceArray(smoke,    msg.smoke);
    replaceArray(blasts,   msg.blasts);
    replaceArray(dummies,  msg.dummies);
    replaceArray(statues,  msg.statues);
    if (msg.debris) replaceArray(debris, msg.debris);
    if (msg.mines)  replaceArray(mines,  msg.mines);
    if (msg.holes)  replaceArray(holes,  msg.holes);
    if (msg.scorches) replaceArray(scorches, msg.scorches);
    if (msg.rooftoppers) replaceArray(rooftoppers, msg.rooftoppers);
    if (msg.beams)  replaceArray(beams,  msg.beams);
    if (msg.hunters) replaceArray(hunters, msg.hunters);
    if (msg.huntersCamps) replaceArray(huntersCamps, msg.huntersCamps);
    if (msg.chickenSuckers) replaceArray(chickenSuckers, msg.chickenSuckers);
    if (msg.bossMissiles) replaceArray(bossMissiles, msg.bossMissiles);
    if (typeof msg.huntersLeavePending === 'boolean') huntersLeavePending = msg.huntersLeavePending;
    if (typeof msg.parryMode === 'boolean') parryMode = msg.parryMode; // host drives the experimental toggle
    if (typeof msg.nightOfWolf === 'boolean') nightOfWolf = msg.nightOfWolf;
    // Host's dash state so the guest renders the hat-scatter on the host's keeper.
    if (typeof msg.hostDashT === 'number') { player2.dashT = msg.hostDashT; player2.dashX = msg.hostDashX || 0; player2.dashY = msg.hostDashY || 0; }
    // Boss state so the guest renders the health bar + boss-cleared end screen.
    if (typeof msg.bossWaveActive === 'boolean') bossWaveActive = msg.bossWaveActive;
    if (typeof msg.bossPhase === 'string') bossPhase = msg.bossPhase;
    if (typeof msg.bossSidesDone === 'number') bossSidesDone = msg.bossSidesDone;
    if (typeof msg.bossTint === 'number') bossTint = msg.bossTint;
    // Mirror the host's post-boss cutscene + black wipe. The matching coop is
    // hidden by its synced `launching` flag, so we find it for the rising draw
    // (falling back to a light stand-in if it's already out of the array).
    if (msg.rocketLaunch) {
      const rlc = coops.find(c => Math.abs(c.x - msg.rocketLaunch.x) < 0.01 && Math.abs(c.y - msg.rocketLaunch.y) < 0.01)
                || { x: msg.rocketLaunch.x, y: msg.rocketLaunch.y, level: msg.rocketLaunch.level || 0 };
      rocketLaunch = { coop: rlc, t: msg.rocketLaunch.t, riseY: msg.rocketLaunch.riseY, lifted: msg.rocketLaunch.lifted };
    } else {
      rocketLaunch = null;
    }
    fade = msg.fade ? { phase: msg.fade.phase, t: msg.fade.t, dur: msg.fade.dur, onBlack: null } : null;
    endScreen = !!msg.endScreen;
    money = msg.money;
    wave = msg.wave;
    kills = msg.kills;
    waveActive = msg.waveActive;
    waveTimer = msg.waveTimer;
    gameOver = !!msg.gameOver;
    gameOverMsg = msg.gameOverMsg || '';
    gameOverCause = msg.gameOverCause || '';
    // Replay every sound the host fired since the last snapshot. Each play*()
    // self-queues only when isHost, so the guest's replay never echoes back.
    if (msg.sounds && msg.sounds.length) {
      for (let i = 0; i < msg.sounds.length; i++) playSoundByName(msg.sounds[i]);
    }
    // Replay any toasts the host queued for this guest (e.g. its build feedback).
    if (msg.guestToasts && msg.guestToasts.length) {
      for (let i = 0; i < msg.guestToasts.length; i++) toast(msg.guestToasts[i].msg, msg.guestToasts[i].dur);
    }
    // The host's map grows as they place coops; mirror the new bounds and
    // regenerate the forest border so the guest's render matches.
    if (msg.mapSize !== MAP_SIZE) {
      MAP_SIZE = msg.mapSize;
      HALF_MAP = MAP_SIZE / 2;
      generateTrees();
    }
  }

  async function hostLobby() {
    const code = generateCode();
    document.getElementById('lobbyCode').textContent = code;
    showScreen('host-wait');
    const prepared = await prepareLobby('host');
    if (!prepared || prepared.session !== netSession) return;
    const { session, options } = prepared;
    ensurePeer(ID_PREFIX + code, options);
    peer.on('open', () => {
      if (session !== netSession) return;
      setStatus(document.getElementById('hostStatus'), 'Waiting for the other player…' +
        (netHasRelay ? '' : ' Direct connections only; some networks need a relay.'));
    });
    peer.on('connection', incoming => {
      if (session !== netSession || conn) {
        // Reserve the slot while connecting as well as during a game.
        try { incoming.close(); } catch (_) {}
        return;
      }
      watchLobbyConnection(incoming);
      setStatus(document.getElementById('hostStatus'), 'Connecting to the other player…');
      incoming.on('open', () => {
        if (session !== netSession || conn !== incoming) return;
        attachConn(incoming);
        startGame(true);
      });
    });
  }

  async function joinLobby(code) {
    const prepared = await prepareLobby('guest');
    if (!prepared || prepared.session !== netSession) return;
    const { session, options } = prepared;
    ensurePeer(null, options);
    peer.on('open', () => {
      if (session !== netSession) return;
      setStatus(document.getElementById('joinStatus'), 'Reaching host…' +
        (netHasRelay ? '' : ' Direct connections only; some networks need a relay.'));
      const c = peer.connect(ID_PREFIX + code, { reliable: true });
      watchLobbyConnection(c);
      c.on('open', () => {
        if (session !== netSession || conn !== c) return;
        attachConn(c);
        setStatus(document.getElementById('joinStatus'), 'Connected!', 'good');
        startGame(true);
      });
    });
  }

