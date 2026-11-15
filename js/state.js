  // ---------- Game state ----------
  // The simulation runs from page load so the title menu can sit on top of a
  // live, ambient farm scene — picking a mode just dismisses the overlay.
  let gameStarted = true;
  // While the menu is up, player input and wave spawning are suppressed
  // (chickens and coops keep ticking for the ambient backdrop).
  let inMenu = true;
  let multiplayer = false;
  let lastSnapshotReceivedT = 0; // seconds since last snapshot (guest only; drives lag warning)

  const player = {
    x: 0, y: 0,
    speed: 4.0,         // tiles per second (level 1 of "fast boots")
    radius: 0.35,
    dir: 0,             // facing angle (world radians)
    reloadT: 0,
    jamT: 0,
    jamFlashT: 0,       // cosmetic-only jam flash (a dud SHOT reds the gun without rooting you)
    hurtT: 0,           // counts down after taking a hit — flashes the player red
    walkT: 0,           // animation phase for the walk cycle
    moving: false,
    runT: 0,            // seconds of uninterrupted walking — feeds the run mechanic
    meleeT: 0,          // melee-swing animation timer (counts down)
    meleeDir: 0,        // world angle of the current melee swing
    meleeFull: false,   // true when the swing is a full 360° (max-level AoE)
    spinT: 0,           // Quickdraw animation timer (counts down)
    spinDmg: false,     // true while a max-level twirl's double-damage shot is pending
    critShots: 0,       // count of upcoming crit shots after a critical reload (5 for machine-gun)
    ghost: false,       // on the guest's screen, true once they've died — they wander on as an immortal spectre
    karma: 0,           // per-player karma — drives the shirt tint (mirrors the legacy `karma` global)
    chickensKilledThisWave: 0,
    chickensShot: 0,    // lifetime chickens shot (for the end-of-run scoreboard)
    deathCause: '',     // last reason this keeper fell — 'wolf', 'friendly fire', ...
    bulletHitT: 0,      // bullet-damage debounce window
    wolfHitT: 0,        // wolf-bite invulnerability window — keeps a pack from chewing hats off in a single second
    // Reload skill-check: a marker oscillates on a bar above the head; the
    // player presses R again to "snap" it. A hit in the centre commits the
    // reload, a miss just costs a tiny lockout and the bar keeps swinging.
    skillCheckActive: false,
    skillCheckT: 0,
    skillCheckLockoutT: 0,
    skillCheckNeedsRelease: false,
    // Rocket Boots — flightT ticks down while airborne; partT paces particles.
    flightT: 0,
    flightPartT: 0,
    // Last Stand — idleT counts seconds standing still; noShootT also tracks
    // time since the last fired shot; stealth flips on at max once both
    // crouch and no-shoot windows clear.
    lastStandIdleT: 0,
    lastStandNoShootT: 0,
    lastStandStealth: false,
  };
  // Network-driven second player — a real actor: wolves target it, it takes
  // hits and dies. Hats / hurtT are authoritative on the host and synced down
  // to the guest, who reads their own hats from `playerHats` (host echoes it).
  const player2 = {
    x: 0, y: 0,
    speed: 4.0,
    radius: 0.35,
    dir: 0,
    walkT: 0,
    moving: false,
    active: false,      // flipped on when multiplayer is chosen
    hats: 3,            // health — overwritten by START_HATS on game start
    hurtT: 0,           // hit flash timer (visual)
    // Weapon-animation timers synced from the host so the guest can render
    // its keeper's gun/sword/melee correctly. Unused on the host side.
    reloadT: 0,
    jamT: 0,
    jamFlashT: 0,       // cosmetic-only jam flash (mirrors player1)
    spinT: 0,
    meleeT: 0,
    meleeDir: 0,
    meleeFull: false,
    // On the host, true once the guest's hat stack hit zero — they
    // become an immortal ghost that wolves ignore. Synced to the guest.
    ghost: false,
    // Independent shotgun/MG state — player2 now also carries a gun.
    chambered: true,
    shells: 1,          // loaded shotgun shells (2 with Double-Barrel)
    reloadingT: 0,
    ammo: 0,
    magDumpLeft: 0,
    magDumpT: 0,
    jamStreak: 0,
    spinDmg: false,
    critShots: 0,
    runT: 0,
    // Build mode is per-keeper so the buddy can lay down coops too.
    buildMode: false,
    buildType: 0,
    // Per-player karma so each keeper's shirt tint reflects their own deeds.
    karma: 0,
    chickensKilledThisWave: 0,
    chickensShot: 0,
    deathCause: '',
    // Bullet-damage debounce — consecutive pellet hits inside this window
    // only cost one hat (so a full shotgun blast doesn't insta-kill).
    bulletHitT: 0,
    wolfHitT: 0,
    // Reload skill-check state (mirrors player).
    skillCheckActive: false,
    skillCheckT: 0,
    skillCheckLockoutT: 0,
    skillCheckNeedsRelease: false,
    // Rocket Boots + Last Stand state (mirrors player).
    flightT: 0,
    flightPartT: 0,
    lastStandIdleT: 0,
    lastStandNoShootT: 0,
    lastStandStealth: false,
  };
  // Lobby-configurable multiplayer rules. The host writes these when starting
  // the game and broadcasts them inside the snapshot; the guest mirrors them.
  const gameOpts = {
    friendlyFire: false,    // can players damage each other's hats?
    separateMoney: false,   // each player has their own pot vs sharing one
    individualUpgrades: true, // each player picks their own gun upgrades (default; lobby can flip to host-picks)
  };
  // Player2's wallet (used in separateMoney mode) and gun-upgrade ladder
  // (used in individualUpgrades mode). Both are kept in sync with the host.
  let money2 = 20;
  const upgradeLevels2 = { jam: 0, range: 0, speed: 0, fireRate: 0, spreadUp: 0, spreadDown: 0, focusUp: 0, focusDown: 0, woodFence: 0, stoneWall: 0, reloadMove: 0, wolfDelay: 0, hatchRate: 0, spreadUp2: 0, spreadDown2: 0, doubleBarrel: 0, machineGun: 0, counter: 0, sprint: 0, softBullet: 0, hardBullet: 0, rust: 0, spinReload: 0, snatch: 0, fatChicken: 0, farm: 0, dog: 0, sword: 0, dummy: 0, statue: 0, hunterPower: 0, workerChicken: 0, richChicken: 0, rocket: 0, minigun: 0, mine: 0, sabotage: 0, sizeMatters: 0, rocketBoots: 0, lastStand: 0, homing: 0, laser: 0, cryptidRadar: 0, rooftopper: 0, safeTrigger: 0, crazyTrigger: 0, goldenChicken: 0, nerdReload: 0, jockReload: 0, coldShot: 0, hotShot: 0, calmWaves: 0, roughWaves: 0, hunterCaravan: 0, metaverse: 0 };
  // Pick the upgrade ladder that should govern a shooter's stats. With
  // individual upgrades off, both players share the host's tree.
  // Pick the upgrade ladder that applies to `who`. The local `player` object
  // represents a different lobby role on each client — on the host it's P1,
  // on the guest it's P2 — so the mapping has to flip with `isHost`.
  function lvlsFor(who) {
    if (!gameOpts.individualUpgrades) return upgradeLevels;
    if (multiplayer && !isHost) {
      // On the guest: `player` IS player2; `player2` represents the host.
      return who === player ? upgradeLevels2 : upgradeLevels;
    }
    return who === player2 ? upgradeLevels2 : upgradeLevels;
  }
  function tableAtFor(who, id) {
    const lvls = lvlsFor(who);
    const t = SKILL_TABLES[id];
    return t[Math.min(lvls[id], t.length - 1)];
  }
  // Derived shotgun stats for a given shooter — all routed through lvlsFor
  // so each keeper renders / fires with its OWN ladder regardless of which
  // side of the wire we're on.
  function shotgunLifeFor(who) {
    if (!gameOpts.individualUpgrades) return shotgunLife;
    return SKILL_TABLES.range[Math.min(lvlsFor(who).range, MAX_LEVEL)];
  }
  // Size Matters adds flat seconds of pellet lifetime on top of the base range.
  function sizeMattersLifeBonus(who) {
    return (lvlsFor(who).sizeMatters || 0) * SIZE_MATTERS_LIFE_STEP;
  }
  function shotgunCooldownFor(who) {
    if (!gameOpts.individualUpgrades) return shotgunCooldown;
    return SKILL_TABLES.fireRate[Math.min(lvlsFor(who).fireRate, MAX_LEVEL)];
  }
  function spreadStatsFor(who) {
    if (!gameOpts.individualUpgrades) return { spread: shotgunSpread, count: pelletCount };
    const l = lvlsFor(who);
    if (l.spreadUp > 0 && l.spreadDown > 0) {
      // Metaverse "both": Loose's pellet count at Tight's grouping.
      const li = Math.min(l.spreadUp + l.spreadUp2, LOOSE_SPREAD.length - 1);
      const ti = Math.min(l.spreadDown, MAX_LEVEL);
      return { spread: TIGHT_SPREAD[ti] * Math.PI / 180, count: LOOSE_BULLETS[li] };
    }
    if (l.spreadUp > 0) {
      const i = Math.min(l.spreadUp + l.spreadUp2, LOOSE_SPREAD.length - 1);
      return { spread: LOOSE_SPREAD[i] * Math.PI / 180, count: LOOSE_BULLETS[i] };
    }
    if (l.spreadDown > 0) {
      const i = Math.min(l.spreadDown, MAX_LEVEL);
      return { spread: TIGHT_SPREAD[i] * Math.PI / 180, count: TIGHT_BULLETS[i] };
    }
    return { spread: shotgunSpread, count: 4 };
  }
  function jamChanceFor(who) {
    const rustLvl = lvlsFor(who).rust || 0;
    if (rustLvl >= 5) return 0; // MAX Rusty Springs undoes all the jamming
    if (!gameOpts.individualUpgrades) return jamChance;
    // Weapon Oil is disabled while the gun is rusted, so it only trims jam at rust 0.
    const oilReduce = ((rustLvl === 0 || rustLvl >= 5) && weaponOilCharges > 0) ? WEAPON_OIL_JAM_REDUCE : 0;
    return clamp(tableAtFor(who, 'jam') + tableAtFor(who, 'rust') - oilReduce, 0, 0.95);
  }
  // Run mechanic — walking with no shots and no reload builds a little momentum.
  const RUN_WARMUP = 1.0;     // seconds of walking before the sprint kicks in
  const RUN_RAMP = 2.5;       // seconds from warm-up to a full sprint
  const PELLET_KNOCKBACK = 0.12; // tiles a non-lethal pellet hit nudges a wolf back (fence-aware)
  const MG_JAM_MUL = 0.2;        // machine-gun fires many rounds/sec, so its per-round jam chance is scaled down from the shotgun's
  // Safety caps — set very high so normal play is unaffected, but runaway growth
  // (ultra-late waves, money cheats) can't pile up enough entities to crash.
  const MAX_HATS        = 500;   // hat stack cap (per keeper)
  const MAX_RANGE_LEVEL = 600;   // caps how long the barrel can visually grow (intentionally huge — it reaches out past the walls)
  const MAX_COOP_LEVEL  = 250;   // coop floor-count cap
  const MAX_WOLVES      = 3200;  // hard cap on live wolves on the field
  const MAX_CHICKENS    = 2400;  // hard cap on live chickens
  // Stampede upgrade — a running player gets faster, and at max tramples enemies.
  const TRAMPLE_DMG = 3;      // damage per trample hit
  const TRAMPLE_RATE = 5;     // average trample hits per second of contact
  // Soft / Hard Bullet upgrades — chicken-friendly vs higher damage.
  // (No constants needed — both progressions come from SKILL_TABLES.)
  // Rusty Springs upgrade — the golden-gun gamble.
  const GOLD_PER_CRIT = 1;    // gold paid per consecutive critical reload at max Rusty Springs
  const RUST_MAX_COST = 200;  // cost of the final Rusty Springs tier (the golden gun)
  const RUST_COLORS = ['#2b2b2b', '#6b5230', '#7d4a22', '#8a3f18', '#94350f']; // barrel tint by rust level 0-4
  // The guest keeper wears a yellow straw hat in both clients' views so the
  // two players can be told apart at a glance (host = brown, guest = straw).
  const GUEST_HAT_COLOR = '#caa24a';
  // Wolf's Blade upgrade — once a sword wolf is slain, the gun can be traded
  // for a sword: clicks become melee swings dealing huge damage.
  const SWORD_DMG = 40;        // damage a swing deals to each wolf it catches
  const SWORD_RANGE = 1.9;     // reach of a swing (tiles)
  const SWORD_ARC = 1.2;       // half-angle of the swing's hit cone (radians)
  const SWORD_COOLDOWN = 0.45; // seconds between swings
  // Upgrades hidden from the upgrade screen once Wolf's Blade is taken.
  const GUN_UPGRADES = new Set(['jam', 'range', 'fireRate', 'spreadUp', 'spreadDown',
    'spreadUp2', 'spreadDown2', 'doubleBarrel', 'machineGun', 'reloadMove', 'rust',
    'spinReload', 'softBullet', 'hardBullet', 'rocket', 'minigun', 'nerdReload', 'jockReload',
    'coldShot', 'hotShot']);
  // World/shared upgrades — they benefit BOTH keepers or the shared map rather
  // than one player's gun. In co-op the pause list tints these so it's clear
  // who they help (e.g. Cozy Coops, fences, chickens, hunters, statues).
  const SHARED_UPGRADES = new Set(['hatchRate', 'wolfDelay', 'woodFence', 'stoneWall',
    'fatChicken', 'dog', 'farm', 'dummy', 'statue', 'workerChicken', 'richChicken',
    'sabotage', 'cryptidRadar', 'rooftopper', 'hunters', 'hunterPower', 'mine', 'goldenChicken',
    'calmWaves', 'roughWaves']);
  // Double-Barrel right-click: a point-blank concussion in front of the player.
  const DBL_FRONT_DMG = 4;     // bonus damage to wolves right in front
  const DBL_FRONT_R = 1.4;     // reach of the concussion (tiles)
  // Melee counter — a chance to strike back when a wolf knocks off a hat.
  const COUNTER_DMG = 4;      // damage dealt to the attacking wolf
  const COUNTER_AOE_R = 1.5;  // splash radius (max Melee Strike level only)
  const COUNTER_AOE_DMG = 2;  // splash damage to nearby wolves at max
  const MELEE_ANIM_DUR = 0.28; // duration of the white melee-swing arc
  // Wolf Heist upgrade — a fed wolf may carry its kill off the map.
  const SNATCH_SPEED_MUL = 0.7; // a chicken-laden wolf flees this much slower
  // Fat Chickens upgrade (wave 15) — once taken, chickens fatten every few
  // waves: each tier pays more gold but slows them; at max fatness a slain
  // chicken may burst, blasting nearby wolves.
  const FAT_UNLOCK_WAVE = 15;
  const FAT_MAX = 5;               // number of fatness tiers (= max upgrade level)
  const FAT_GOLD_PER_TIER = 1;     // extra $ per surviving chicken per fat tier
  const FAT_SPEED_PER_TIER = 0.05; // chicken move-speed lost per fat tier
  const FAT_EXPLODE_CHANCE = 0.35; // chance a max-fat chicken bursts when killed
  const FAT_EXPLODE_DMG = 5;       // blast damage to each wolf caught in it
  const FAT_EXPLODE_R = 2.2;       // blast radius (tiles)
  // Rocket Launcher upgrade: per-pellet explode chance + a guaranteed-boom
  // right-click. Each detonation damages every wolf inside a small radius.
  const ROCKET_EXPLODE_R   = 1.6;  // wolf-damage radius of a rocket-pellet blast (tiles)
  const ROCKET_EXPLODE_DMG = 3;    // base damage per wolf inside the blast
  const ROCKET_SPEED_MUL   = 0.6;  // rocket pellets fly noticeably slower than buckshot (heavy warheads)
  const ROCKET_PELLET_R_MUL  = 1.9;  // rocket rounds draw bigger than normal pellets
  const ROCKET_SMOKE_INTERVAL = 0.025; // seconds between smoke puffs on a rocket's trail
  const ROCKET_MIDAIR_BOOM    = 0.7;   // per-second chance a rocket just cooks off mid-flight
  const ROCKET_MIN_FLIGHT     = 0.35;  // it must fly at least this long before a mid-air cook-off can roll, so it never detonates right on top of the keeper
  // Explosive Mine upgrade (wave 40+): a stealthy tile-bound bomb that
  // detonates on anyone walking on it. Per-level tables give blast radius
  // and per-wolf damage; max level paints a faint warning ring so the
  // player can find their own mines.
  const MINE_COST = 25;
  const MINE_UNLOCK_WAVE = 40;
  const MINE_TRIGGER_R = 0.55;     // distance at which an entity sets off the mine
  const MINE_RADIUS = [0, 1.6, 1.9, 2.2, 2.5, 3.0]; // blast radius (tiles) by level
  const MINE_DMG    = [0, 4, 6, 9, 12, 16];          // damage per wolf inside the blast
  // Sabotage upgrade (wave 40+): per-level chance a fresh wolf hatches with
  // a glitching "defective" core — it wanders aimlessly with a flickering
  // eye instead of hunting. At max level a defective wolf has a small extra
  // roll to turn turncoat (blue eye, attacks other wolves).
  const SABOTAGE_DEFECT_CHANCE   = [0, 0.03, 0.06, 0.10, 0.14, 0.20];
  const SABOTAGE_TURNCOAT_CHANCE = 0.12; // chance a defective wolf hatches turncoat at max level
  const GHOST_SABOTAGE_CHANCE    = 0.15; // per-second chance a ghost keeper flips a wolf it drifts through to turncoat (reduced)
  const SABOTAGE_FUSE     = 30;   // seconds a sabotaged wolf lives before it cooks off
  const SABOTAGE_BLAST_R  = 2.4;  // blast radius of a sabotaged wolf's self-detonation
  const SABOTAGE_BLAST_DMG = 4;   // damage the blast deals to nearby pack wolves
  // "Size Matters" — second utility for Longer Barrel. With the upgrade
  // taken, wolves focusing the player roll a tiny per-tick freeze chance
  // (scaled by Longer Barrel level). At max level they also roll a flee
  // chance and just bolt for the map edge.
  // Size Matters (reworked): a second Longer Barrel that pushes harder — each
  // level grows the barrel at twice the rate AND extends the shot's lifetime,
  // taking it from the ~1s Longer-Barrel cap up to ~10s at max. For lasers it
  // adds a big flat reach bonus. At MAX, any shot (pellet OR laser) that leaves
  // the map ricochets off an invisible border wall and curves back into play.
  const SIZE_MATTERS_BARREL_MUL  = 2;    // barrel-growth rate vs Longer Barrel (×2 per level)
  const SIZE_MATTERS_LIFE_STEP   = 1.8;  // +seconds of pellet lifetime per level (1s → 10s over 5)
  const SIZE_MATTERS_LASER_RANGE = 7;    // +tiles of laser reach per level (lasers don't use lifetime)
  const SIZE_MATTERS_BOUNCE_PAD  = 1.0;  // how far past the map edge the invisible bounce wall sits
  // Rocket Boots (wave 40+) — per-second roll to kick into flight while at
  // a full sprint. Flying = no fence collision, mine immunity, melee bites
  // miss. Each upgrade level lifts the trigger chance + duration.
  const ROCKET_BOOTS_CHANCE     = [0, 0.018, 0.034, 0.055, 0.080, 0.12]; // per-second roll while sprinting (nerfed)
  const ROCKET_BOOTS_DURATION   = [0, 0.8, 1.0, 1.2, 1.4, 1.7];        // flight duration per level (halved)
  const ROCKET_BOOTS_TRAMPLE_R  = 0.55;  // tile radius around the flying keeper that catches wolves
  const ROCKET_BOOTS_TRAMPLE    = [0, 0.6, 0.9, 1.3, 1.8, 2.5]; // damage/sec dealt to wolves under the flames
  const ROCKET_BOOTS_SPEED    = 1.45;   // movement-speed multiplier while flying
  const ROCKET_BOOTS_PARTICLE = 0.04;   // seconds between rocket trail puffs
  // Last Stand (wave 40+) — crouch buff after standing still. Damage and
  // fire-rate ramp once the player has held their ground for the charge.
  // At max, holding still without shooting for an extra window cloaks the
  // keeper entirely (untargetable + translucent render).
  const LAST_STAND_CHARGE        = 2.8;    // seconds of stillness before the buff kicks in
  const LAST_STAND_DMG_MUL       = [1, 1.25, 1.5, 1.8, 2.1, 2.5];
  const LAST_STAND_FIRE_MUL      = [1, 0.90, 0.80, 0.70, 0.60, 0.50]; // multiplier on post-shot reloadT
  const LAST_STAND_STEALTH_DELAY = 7.0;    // extra seconds of no-shooting at max for cloak
  // Homing Bullets (wave 40+) — slow pellets that ALWAYS hunt: after firing,
  // each one keeps looking for the nearest wolf to chase (no lock roll). Tier
  // scales how sharply it can turn and how far it seeks.
  const HOMING_SPEED_MUL   = 0.55;  // multiplier on the pellet's initial speed
  const HOMING_TURN_BY_LVL = [0, 3.0, 4.0, 5.0, 6.5, 8.0]; // radians/sec turn rate by homing level
  const HOMING_SEEK_BY_LVL = [0, 9, 11, 13, 15, 18];       // tiles within which it hunts a target
  const HOMING_LIFE_MUL    = 2.2;   // pellet life multiplier so slower bullets still have reach
  // Laser Bullets (wave 40+) — instant straight beam, like the ranged wolf's.
  // Per level scales damage + reach. Replaces the pellet burst entirely.
  const LASER_DMG          = [0, 2, 3, 4, 5, 7];
  const LASER_RANGE        = [0, 5, 6.2, 7.4, 8.6, 9.8]; // gentler per-level range gain (+1.2 vs +1.5)
  // Cryptid Radar (wave 40+) — boosts the spawn chance of every rare wolf
  // variant (fox, sword wolf, hatted wolf, thing wolf) per level, and pings a
  // warning when one wanders near. Visually plants an antenna on about half
  // the coops so the camp reads as "tuned-in".
  // Cryptid Radar: each level grows the antennas' detection range; the MAX
  // level doubles the rare-wolf chance, switches the dish to endless range, and
  // unlocks the thing wolf. Range is in tiles (Infinity = whole map).
  // Levels 1-4 are RANGE upgrades only (chance unchanged); ONLY the MAX level
  // doubles the rare-wolf chance — and that's also where range becomes full-map.
  const CRYPTID_RADAR_MUL   = [1.0, 1.0, 1.0, 1.0, 1.0, 2.0]; // rare-wolf chance × (MAX doubles it)
  const CRYPTID_RADAR_RANGE = [0, 6, 9, 13, 18, Infinity];    // detection range per level (tiles)
  // Rooftopper (wave 40+) — sniper allies who perch on the tallest coops.
  // Slow cadence, high damage, scaling with the coop's floor count. Each
  // upgrade tier adds one rooftopper, prioritising taller coops first.
  const ROOFTOP_BASE_COOLDOWN = 4.5;    // slower cadence — these are heavy, deliberate shots
  const ROOFTOP_BASE_DMG      = 20;
  const ROOFTOP_DMG_PER_FLOOR = 0.55;   // each extra floor adds this fraction of base damage
  const ROOFTOP_DELAY_PER_FLOOR = 1.0;  // each extra floor adds this many seconds to the cooldown
  const ROOFTOP_RANGE2        = 16 * 16; // (legacy) — rooftoppers now have unlimited sight range
  const ROOFTOP_MIN_RANGE2    = 3 * 3;   // can't fire on a wolf closer than this (no point-blank sniping)
  const ROOFTOP_PELLET_SPEED  = 30;
  const ROOFTOP_PELLET_R      = 2.4;
  const FAT_CHANCE = 0.20;         // chance a chicken hatches fat (once the upgrade is taken)
  // Wave-50 chicken variants — mutually exclusive picks. Worker chickens wear
  // hardhats, move a bit faster and run to fence debris to rebuild walls (one
  // chicken per rebuild). Rich chickens wear top hats, walk slower and pay
  // bonus gold per wave on top of any Fat tier.
  // Per-level chance a hatched chick is a worker / rich. Index 0 = locked.
  const WORKER_HATCH_CHANCE = [0, 0.09, 0.13, 0.17, 0.21, 0.25]; // halved — rarer worker chickens
  const RICH_HATCH_CHANCE   = [0, 0.09, 0.13, 0.17, 0.21, 0.25]; // halved — rarer rich chickens
  const WORKER_SPEED_MUL    = 1.20;  // workers shuffle a little quicker
  const RICH_SPEED_MUL      = 0.75;  // wealth slows them down
  const RICH_GOLD_BONUS     = [0, 1, 2, 3, 4, 6]; // extra $ per surviving rich chicken (nerfed)
  const WORKER_REBUILD_REACH = 0.5;  // distance at which a worker arrives at a debris pile
  const WORKER_SEEK_RANGE2   = 14 * 14; // max distance a worker chicken will wander toward debris

  const coops = [];     // {x,y,spawnT,hp}
  const chickens = [];  // {x,y,vx,vy,wanderT,homeCoop,fleeT,alive}
  const wolves = [];    // {x,y,vx,vy,target,attackT,alive}
  const pellets = [];   // {x,y,vx,vy,life,dmg,pierce,hit}
  const corpses = [];   // {x,y,kind,t}
  const trees = [];     // {x,y,size,shade} — static decoration on the dark border
  const stumps = [];    // {x,y,size,ang} — tiny cut stumps on old borders after map expansion
  const twigs  = [];    // {x,y,ang,len} — scattered fallen twigs on expanded grass
  const fences = [];    // {x,y} — barriers wolves must walk around
  const farms = [];     // {x,y,growth,trampleFlash} — crop plots that ripen over waves
  const dogs = [];      // {x,y,vx,vy,attackT,facingLeft,bob} — friendly guard dogs
  const dummies = [];   // {x,y,hp,maxHp,hurtT} — training dummies that wolves attack
  const statues = [];   // {x,y,hp,maxHp,hurtT} — fake chickens wolves increasingly ignore
  const debris  = [];   // {x,y,kind,hp,t} — a destroyed fence's wreckage; worker chickens rebuild from these
  const mines   = [];   // {x,y,level,_decoy} — explosive mines that detonate on contact (wave 40+ upgrade)
  const holes   = [];   // {x,y} — scorched craters left by detonated mines; cleared next wave
  const scorches = [];  // {x,y,t,life,r} — temporary scorch marks any explosion burns into the grass
  const rooftoppers = []; // {x,y,coop,fireT,dir,facingLeft,alive} — sniper allies stationed on coop roofs
  const smoke = [];     // {x,y,vx,vy,t,life,r} — drifting gunsmoke puffs
  const blasts = [];    // {x,y,t,life} — expanding fat-chicken explosion rings
  const flyHats = [];        // {fromWx,fromWy,color,t,life,rot,spin} — hats arcing from wolf to player head
  const pendingHatLandings = []; // {delayT, color} — hats waiting to land before incrementing playerHats
  // FANGUS phase-3 "chicken suckers": homing orbs that grab a chicken and drag
  // it back to the boss to heal it. {x,y,phase,target,life}
  const chickenSuckers = [];
  // FANGUS phase-4 missiles — slow rocket-launcher-style projectiles. {x,y,vx,vy,life,tilt}
  const bossMissiles = [];
  // Player-2 cameo — a very rare solo-run easter egg: the P2 keeper strolls in,
  // wanders a while, then leaves. Harmless, once per run. null when absent.
  let p2Cameo = null;   // {x,y,vx,vy,dir,walkT,facingLeft,lifeT,phase,tx,ty,retargetT}
  let p2CameoUsed = false;

  // Player1's weapon state — also mirrored onto the player object so both
  // keepers can share the same shooting code paths. These globals are kept
  // as conveniences for the legacy fire/reload functions; player.chambered
  // etc. always carry the same value.
  player.chambered = true;
  player.reloadingT = 0;
  player.ammo = 0;
  player.magDumpLeft = 0;
  player.magDumpT = 0;
  player.jamStreak = 0;
  player.spinDmg = false;
  let chambered = true;   // shotgun has at least one shell ready (mirrors shells > 0)
  let shells = 1;         // loaded shotgun shells — 1 normally, 2 with Double-Barrel
  let reloadingT = 0;     // seconds remaining on the current reload action
  let ammo = 0;           // machine-gun magazine — rounds currently loaded
  // (Machine-gun reloads now refill the mag instantly once the skill check
  //  lands — no post-reload delay; see startMGReload.)
  const SPIN_RELOAD_TIME = 0.3; // Quickdraw: lockout + 360° animation (vs ~1.0 normal)
  const MAG_DUMP_INTERVAL = 0.10; // (legacy) baseline cadence — the dump now derives its rate from the live gun cooldown
  const MAG_DUMP_SPEEDUP  = 0.85; // right-click mag dump fires this much faster than a left-click shot (lower = faster)
  const MG_MAG = 20;              // base machine-gun magazine size (each Minigun tier adds MINIGUN_MAG_PER_LVL); machineGun level no longer changes it
  const MG_BASE_COOLDOWN = 0.20;  // base seconds between machine-gun shots (× machineGun-level mul × Last Stand)
  // Minigun: each tier adds magazine capacity; at MAX it also spins up — the
  // longer the trigger is held, the faster it fires (no initial wind-up delay).
  const MINIGUN_MAG_PER_LVL = 10; // extra magazine rounds per Minigun tier
  const MINIGUN_SPINUP_TIME = 2.5; // seconds of sustained fire to reach full spin-up
  const MINIGUN_SPINUP_MIN  = 0.5; // cooldown multiplier at full spin-up (0.5 = twice as fast)
  const MG_DMG_MUL          = 0.8; // machine-gun rounds hit a little softer than the shotgun
  const TIGHT_SPEED_MUL     = 1.25; // Tighter Pattern pellets fly faster
  const TIGHT_PELLET_R      = 1.5;  // ...and read a little smaller
  // Reload skill-check: a marker sweeps across a small bar above the head;
  // the player presses R again to commit, hitting inside the centre band.
  const RELOAD_SC_SPEED      = 1.00; // full sweeps (0→1→0) per second — slightly slower default
  const RELOAD_SC_RUN_MUL    = 1.6;  // pin sweeps this much faster while the keeper is running (reload-on-the-move is riskier)
  // Action Reload (formerly Reload Movement): each level trims the running pin
  // speed-up back down — by default the marker still sweeps faster while
  // moving, but at max level the running pin matches the standing speed.
  // We tune the per-level reduction so level 5 lands at 1.00× running pin.
  const RELOAD_MOVE_PIN_SLOW  = 0.12; // per-level cut to the running pin multiplier
  const RELOAD_MOVE_RUN_FLOOR = 1.0;  // floor on the running pin multiplier (max Action Reload equals standing)
  const RELOAD_MOVE_SLOW      = 0.5;  // fixed move-speed multiplier while reloading (no longer upgrade-driven)
  const RELOAD_SC_BAR_W_BASE = 52;   // base bar width in pixels (larger overall; green band geometry unchanged)
  const RELOAD_SC_HIT_HALF   = 0.18; // half-width of the green success band, in 0..1 bar units
  const RELOAD_SC_CRIT_HALF  = 0.045; // half-width of the central critical band (thin line in the middle)
  const RELOAD_SC_CRIT_DMG   = 2.0;  // damage multiplier on the shot fired after a critical reload
  const RELOAD_SC_CRIT_RANGE = 1.0;  // crit shots keep normal range/appearance now — only the damage differs
  const CRIT_SPEED_BOOST_MUL = 1.3;  // a critical reload also gives a brief footwork boost…
  const CRIT_SPEED_BOOST_T   = 2.0;  // …for this many seconds (drains in the movement step)
  // ---- Experimental "Parry Mode" (debug toggle) ----
  // When on: SHIFT rolls the keeper a short hop forward (a dodge), and wolves
  // that get close may wind up a special lunge — their eye sparkles, then they
  // dash straight at the keeper and bite on contact. Dodge the lunge with a roll.
  let parryMode = true;
  const PLAYER_DASH_DUR  = 0.18;     // seconds the keeper's dodge-roll lasts
  const PLAYER_DASH_CD   = 4.0;      // cooldown between rolls (the recharge "delay")
  const PLAYER_DASH_MUL  = 2.5;      // speed multiplier during the roll (a short hop)
  const DASH_RECOVER_SLOW = 0.45;    // winded — move this much slower right after a roll, fading over the cooldown
  const PARRY_TRIGGER_RANGE  = 6.5;  // tiles — a wolf this close may start a lunge
  const PARRY_SPARKLE_DUR    = 0.5;  // eye-sparkle wind-up before the lunge fires
  const PARRY_DASH_DUR       = 0.42; // how long a wolf's lunge lasts
  const PARRY_DASH_SPEED     = 16;   // tiles/sec during the lunge
  const PARRY_DASH_HOMING    = 7;    // how hard the lunge curves to track the keeper (0 = straight)
  const PARRY_COOLDOWN       = 2.2;  // min seconds between a wolf's lunges
  const PARRY_CHANCE_PER_SEC = 0.135; // per-second chance to start a lunge while in range
  const CRIT_MG_SHOTS        = 3;    // machine-gun: a crit reload primes up to this many continuous shots
  const SPIN_DMG_MUL         = 3.0;  // max-level Quickdraw twirl: the next burst hits triple
  // Cold Shot / Hot Shot (wave 5, mutually exclusive). Each level raises the
  // per-pellet chance to chill (slow + blue) or ignite (burn-over-time + flame).
  const COLD_HOT_CHANCE   = [0, 0.04, 0.08, 0.12, 0.16, 0.20]; // doubled hot/cold proc chance
  const COLD_SLOW_MUL     = 0.5;   // chilled wolves move at half speed
  const BURN_TICK         = 0.45;  // seconds between burn damage ticks
  const BURN_DMG          = 1;     // damage per burn tick
  // A wolf caught under BOTH cold and hot at once suffers DOUBLED effects:
  // twice as slow AND twice the burn damage per tick.
  function coldSlowMul(w) {
    if (!(w.coldT > 0)) return 1;
    return (w.burnT > 0) ? COLD_SLOW_MUL * 0.5 : COLD_SLOW_MUL; // both → half again (2× slow)
  }
  function burnTickDmg(w) {
    return (w.coldT > 0) ? BURN_DMG * 2 : BURN_DMG; // chilled-and-burning takes double burn
  }
  // Chill/burn lasts longer the higher the upgrade: 3s at level 1 → 7s at level 5.
  function statusEffectDur(lvl) { return 3 + Math.max(0, Math.min(5, lvl) - 1); }
  // Weapon Oil — single-tier. One charge extends the skill-check accept zone
  // by this many 0..1 bar units, drawn as an amber halo outside the green
  // core, and lasts WEAPON_OIL_WAVES waves. It never stacks: the shop only
  // re-offers it once the previous oil has fully worn off.
  const WEAPON_OIL_PER_CHARGE = 0.12;
  const WEAPON_OIL_JAM_REDUCE = 0.10; // active oil trims jam chance by 10 percentage points
  const WEAPON_OIL_SPEED_MUL  = 1.10; // active oil makes rounds fly 10% faster
  const WEAPON_OIL_MAX_BAND   = 0.46; // cap so the bar can never become a free pass
  const WEAPON_OIL_BASE_COST  = 10;
  const WEAPON_OIL_MONEY_RATE = 0.12; // oil price scales with current money (12%), floor at WEAPON_OIL_BASE_COST
  const WEAPON_OIL_WAVES      = 3;    // waves a purchase of oil lasts before it drains away
  function weaponOilCostFromMoney(curMoney) {
    return Math.max(WEAPON_OIL_BASE_COST, Math.floor(curMoney * WEAPON_OIL_MONEY_RATE));
  }
  // Advanced Oil costs half again as much as a regular oil for its one round.
  function advancedOilCost() { return Math.round(weaponOilCostFromMoney(money) * 1.5); }
  // Safe Trigger / Crazy Trigger — mutually exclusive upgrades that replace
  // Loose Pattern II / Tighter Pattern II. Safe grows both the bar AND the
  // green band; Crazy shrinks them but widens the critical line.
  const SAFE_TRIGGER_W_BONUS    = [0, 4, 8, 12, 16, 22];
  const SAFE_TRIGGER_HIT_BONUS  = [0, 0.025, 0.05, 0.075, 0.10, 0.13];
  const CRAZY_TRIGGER_W_REDUCE  = [0, 3, 6, 9, 12, 16];
  const CRAZY_TRIGGER_HIT_REDUCE= [0, 0.020, 0.038, 0.055, 0.070, 0.090];
  const CRAZY_TRIGGER_CRIT_BONUS= [0, 0.015, 0.030, 0.045, 0.060, 0.080];
  // Calm Waves / Rough Waves (wave 25, mutually exclusive). Each level shifts
  // BOTH the normal-wolf count and the wave gold by this fraction — Calm down,
  // Rough up — to a max of ±20%. (Special wolf variants are never affected.)
  const WAVE_MOD = [0, 0.02, 0.04, 0.06, 0.08, 0.10]; // Calm/Rough Waves: caps at ±10% (wolves & gold)
  // Calm/Rough split into two mods so a Metaverse keeper who owns BOTH gets the
  // GOOD half of each: Calm's fewer wolves AND Rough's bigger gold.
  function waveWolfMod() {
    const calm = WAVE_MOD[Math.min(5, upgradeLevels.calmWaves || 0)];
    const rough = WAVE_MOD[Math.min(5, upgradeLevels.roughWaves || 0)];
    return (calm > 0) ? 1 - calm : 1 + rough; // fewer wolves wins when Calm is owned
  }
  function waveGoldMod() {
    const calm = WAVE_MOD[Math.min(5, upgradeLevels.calmWaves || 0)];
    const rough = WAVE_MOD[Math.min(5, upgradeLevels.roughWaves || 0)];
    return (rough > 0) ? 1 + rough : 1 - calm; // bigger gold wins when Rough is owned
  }
  // Trigger Work — each level slows the reload pin by this much (stacks with
  // the existing shotgun-cooldown bonus the upgrade already gives).
  const TRIGGER_WORK_PIN_SLOW   = 0.08;
  const RELOAD_SC_MISS_LOCK  = 0.18; // brief lockout after a wrong press so spamming R can't pass
  // Marker position 0..1 along the bar at phase time `t` — triangle wave so
  // the marker moves at a constant rate (easier to read than a sine).
  // skillCheckT is the ACCUMULATED sweep phase (advanced each frame by the
  // current pin speed — see the update step), NOT raw elapsed time. Folding it
  // here means a speed change (e.g. the player starting to run) only affects the
  // pin from that moment on, so the marker never teleports / desyncs from where
  // the hit-test reads it.
  function skillCheckPos(t) {
    const phase = (((t % 1) + 1) % 1) * 2; // 0..2 (guard against any negative t)
    return phase < 1 ? phase : (2 - phase);
  }
  // Live geometry for the reload skill-check bar. Aggregates all upgrade
  // contributions: Weapon Oil widens the green band; Safe Trigger grows the
  // bar AND the green; Crazy Trigger shrinks both but widens the crit line;
  // Trigger Work slows the moving pin.
  // Optional `who` param — defaults to player (P1). Pass a keeper to get that
  // keeper's own safe/crazy trigger levels so the bar draws correctly for P2.
  function safeLvl(who)  { return Math.min(5, (lvlsFor(who || player).safeTrigger  || 0)); }
  function crazyLvl(who) { return Math.min(5, (lvlsFor(who || player).crazyTrigger || 0)); }
  function skillCheckBarW(who) {
    return Math.max(20, RELOAD_SC_BAR_W_BASE
      + SAFE_TRIGGER_W_BONUS[safeLvl(who)]
      - CRAZY_TRIGGER_W_REDUCE[crazyLvl(who)]);
  }
  function skillCheckHitHalf(who) {
    const raw = RELOAD_SC_HIT_HALF
      + (weaponOilCharges || 0) * WEAPON_OIL_PER_CHARGE
      + (advancedOilWaves > 0 ? ADVANCED_OIL_BAND : 0) // Advanced Oil floods the band
      + SAFE_TRIGGER_HIT_BONUS[safeLvl(who)]
      - CRAZY_TRIGGER_HIT_REDUCE[crazyLvl(who)];
    // Advanced Oil is allowed to push past the normal oil cap toward a full bar.
    const cap = advancedOilWaves > 0 ? 0.49 : WEAPON_OIL_MAX_BAND;
    return Math.max(0.04, Math.min(cap, raw));
  }
  function skillCheckCritHalf(who) {
    return RELOAD_SC_CRIT_HALF + CRAZY_TRIGGER_CRIT_BONUS[crazyLvl(who)]
      + (advancedOilWaves > 0 ? ADVANCED_OIL_CRIT : 0); // Advanced Oil fattens the crit line
  }
  // The running pin multiplier after Action Reload trims it down (level n).
  function reloadRunMul(n) {
    return Math.max(RELOAD_MOVE_RUN_FLOOR, RELOAD_SC_RUN_MUL - (n || 0) * RELOAD_MOVE_PIN_SLOW);
  }
  // Sweep rate (full sweeps/sec) for a given keeper — reads ITS own fireRate /
  // Action Reload ladder and ITS own moving state, so each keeper's pin runs at
  // the right speed. Used to advance skillCheckT incrementally each frame.
  function pinSpeed(who) {
    who = who || player;
    const lvls = lvlsFor(who);
    const lvl = lvls.fireRate || 0;
    let s = RELOAD_SC_SPEED * Math.max(0.5, 1 - lvl * TRIGGER_WORK_PIN_SLOW);
    // Reloading on the move sweeps the pin faster — but Action Reload shaves
    // that running speed-up away level by level (and past it, slows the pin).
    if (who.moving) s *= reloadRunMul(lvls.reloadMove || 0);
    return s;
  }
  let magDumpLeft = 0;    // rounds left in an unstoppable mag dump (right-click)
  let magDumpT = 0;       // countdown to the next mag-dump round
  // Nerd Reload / Jock Reload — two joke reload mini-games (debug-only, mutually
  // exclusive, P1/local keeper only). Nerd: answer a math question; a wrong
  // answer jams. Jock: mash SPACE fast enough before the timer drains, or jam.
  const JOCK_RELOAD_TIME    = 2.2;  // seconds to hit the mash target
  const JOCK_RELOAD_PRESSES = 12;   // SPACE presses needed inside the window
  let nerdActive = false, nerdQ = null, nerdInput = '', nerdIsMG = false;
  let jockActive = false, jockTimeLeft = 0, jockPresses = 0, jockIsMG = false;
  // Sync the player1 weapon mirror onto the player object every frame.
  // On the GUEST, `player` represents the guest's own keeper and its weapon
  // state is written by the snapshot (host echoes player2 state under
  // `guestWeapon`), so we skip the sync there to avoid clobbering it.
  function syncP1Weapon() {
    if (multiplayer && !isHost) return;
    player.chambered   = chambered;
    player.reloadingT  = reloadingT;
    player.ammo        = ammo;
    player.magDumpLeft = magDumpLeft;
    player.magDumpT    = magDumpT;
    player.jamStreak   = jamStreak;
    // Build globals also live on the player object so getBuildTarget /
    // drawBuildPreview can read everything through the keeper uniformly.
    player.buildMode   = buildMode;
    player.buildType   = buildType;
    player.karma       = karma;
  }
  let money = 20;         // $ — earned per chicken alive per wave, spent on coops
  // New-game-plus: each restart AFTER beating the wave-50 boss doubles the
  // starting money / hats / barrel. The tier persists across restarts; the
  // mustache is kept too. barrelBonusMul is the derived 2^tier factor.
  let restartBonusTier = 0;
  let barrelBonusMul = 1;
  let passedBoss = false; // true once this run has cleared (or survived past) the boss
  let pendingCarryMoney = 0; // post-boss restarts carry 0.1% of the run's money (NOT doubled)
  let rocketLaunch = null; // post-boss restart cutscene state, or null
  let fade = null;         // black screen wipe: { t, dur, phase:'out'|'in', onBlack } or null
  // Money helpers — in separateMoney mode, money goes to whoever earned it
  // (player vs player2); otherwise everything pools into `money` (legacy).
  function addMoney(who, amount) {
    if (debugFastMode) amount *= 5; // Fast mode: all earned income pays out 5×
    if (amount >= 5) playMoneySmall(); // coin chime for meaningful amounts only
    if (!gameOpts.separateMoney || who === player) money += amount;
    else                                            money2 += amount;
  }
  // Income with no specific earner (wave reward, harvest) — split when separate.
  function addSharedMoney(amount) {
    if (debugFastMode) amount *= 5; // Fast mode: 5× income
    if (amount > 0) playMoneySmall();
    if (!gameOpts.separateMoney) { money += amount; return; }
    const half = Math.floor(amount / 2);
    money  += amount - half; // P1 keeps the rounding extra
    money2 += half;
  }
  function moneyOf(who) {
    return (gameOpts.separateMoney && who === player2) ? money2 : money;
  }
  function spendMoney(who, amount) {
    if (!gameOpts.separateMoney || who === player) money -= amount;
    else                                            money2 -= amount;
  }
  let jamChance = 0.25; // probability that a shot jams (cranky gun) — halved with the per-shot jam model
  let jamStreak = 0;    // consecutive jams — feeds the golden-gun payout
  let critStreak = 0;   // consecutive critical reloads — pays gold at max Rusty Springs
  const COOP_COST_BASE = 10; // starting $ to build a coop
  const COOP_COST_STEP = 5;  // extra $ added after each coop purchase
  const COOP_PLACE_RANGE = 2.6; // how far in front of the player a coop can be placed
  const FENCE_COST = 5; // $ to build one wood fence segment
  const STONE_FENCE_COST = 20; // $ for a stone fence — also stops bullets
  // A maxed Wooden Fence / Stone Wall is spiked — it wounds wolves that attack it.
  const FENCE_THORN_DMG = 1;  // dmg a maxed wooden fence deals back per wolf hit
  const WALL_THORN_DMG = 2;   // dmg a maxed stone wall deals back per wolf hit
  // Mutually-exclusive decoy buildings. Scarecrow soaks hits and (at max
  // level) explodes when destroyed; Chicken Statue gets ignored more often
  // each level and at max level may stun nearby wolves. The two upgrades
  // lock each other out — the player picks a playstyle.
  const DUMMY_COST = 25;
  const STATUE_COST = 35;
  const GOLDEN_CHICKEN_COST = 1000; // wave-51 vanity: plates all chicken statues gold
  const DUMMY_HP_TABLE   = [0, 4, 7, 10, 15, 23];   // hp by upgrade level (0 = locked)
  const STATUE_HP_TABLE  = [0, 18, 28, 40, 55, 80];
  // Chance per consideration that a wolf "sees through" a statue and ignores it.
  const STATUE_IGNORE_CHANCE = [0, 0.15, 0.30, 0.50, 0.75, 1.0];
  const DUMMY_EXPLOSION_R = 2.6;   // tile radius of a max-level dummy's explosion
  const DUMMY_EXPLOSION_DMG = 5;   // damage per wolf inside the blast
  const DECOY_BITE_COOLDOWN = 0.7; // seconds between wolf bites on a decoy
  const DECOY_REACH = 0.85;        // distance at which a wolf can bite the decoy
  const STATUE_STUN_AURA_R = 4;    // tile radius a max-level statue stuns within
  const STATUE_STUN_PER_SEC = 0.3; // chance per second to stun a wolf inside the aura
  const STATUE_STUN_DURATION = 2.0;
  // Farm: a crop plot (unlocked at wave 15). It ripens over several untrampled
  // waves, then is harvested for cash. Anything stepping on it restarts growth.
  const FARM_COST_BASE = 5;     // $ for the first farm
  const FARM_COST_STEP = 5;     // extra $ per farm already placed
  function farmCost() { return FARM_COST_BASE + farms.length * FARM_COST_STEP; }
  const FARM_UNLOCK_WAVE = 5;   // the Farm upgrade is offered from this wave on
  // Untrampled waves to ripen, indexed by Farm upgrade level (0 = locked).
  const FARM_WAVES = [5, 5, 5, 4, 4, 3];
  const FARM_REWARD_BASE = 5;   // $ a harvest pays
  const FARM_REWARD_MAX = 10;   // $ a harvest pays at max Farm level
  const FARM_AREA_R2 = 0.32;    // squared radius of the "trample" zone
  function wavesToFinish() { return FARM_WAVES[Math.min(upgradeLevels.farm, 5)]; }
  function farmReward()    { return upgradeLevels.farm >= 5 ? FARM_REWARD_MAX : FARM_REWARD_BASE; }
  // Fat Chickens: a chicken born fat carries the upgrade's level as its tier;
  // an ordinary chicken is tier 0.
  function fatTierOf(c) { return c.fat ? upgradeLevels.fatChicken : 0; }
  function chickenSpeedMul(c) {
    let mul = 1 - fatTierOf(c) * FAT_SPEED_PER_TIER;
    if (c.worker) mul *= WORKER_SPEED_MUL;
    if (c.rich)   mul *= RICH_SPEED_MUL;
    return mul;
  }
  // Coop price scales with how many coops currently exist — selling one lowers it.
  function coopCost() {
    const n = coops.length;
    const base = COOP_COST_BASE + n * COOP_COST_STEP;
    // Every 20 coops built, each further coop carries an extra surcharge: 20+
    // coops → +$10 each, 40+ → +$15, 60+ → +$20 … (+$5 more per 20-coop bracket).
    const bracket = Math.floor(n / 20);
    const surcharge = bracket > 0 ? (bracket + 1) * 5 : 0;
    return base + surcharge;
  }
  let coopsPlaced = 0;  // lifetime coops placed — every 10 expands the map
  let pendingMapExpansions = 0; // map growth deferred until the next upgrade screen
  let kills = 0;
  let swordWolfSlain = false; // true once any sword wolf has been killed — unlocks Wolf's Blade
  let swordWolfAppeared = false; // true once the single sword wolf for this run has spawned
  let chickensKilledByPlayer = 0; // friendly-fire chicken kills since the last wave payout
  // Bonus upgrade screen: counts total chicken deaths this wave (player +
  // wolves + foxes + worker rebuilds + every other source). At wave end the
  // probability of a second upgrade pick is computed from this number — 100%
  // with no deaths, halving for every chicken lost down to 0 at 6+.
  let chickensAtWaveStart = 0;       // alive chickens when the current wave kicked off
  let chickensBornThisWave = 0;      // new chicks hatched during the wave
  let chickenDeathsThisWave = 0;     // direct counter — every c.alive=false (chicken) increments this
  let bonusUpgradeAvailable = false; // true while the second pick screen is active
  let bonusUpgradeShownThisWave = false; // ensures the roll only fires once per wave
  let bonusUpgradeForce = false;     // debug "give upgrade" — guarantees the next bonus roll
  // Every wave now grants a SECOND guaranteed pick (the 50-wave squash halved
  // the pick budget, so each round pays out double). The survival bonus above
  // can still add a third. One flag per keeper in individual-upgrades co-op.
  let extraPickUsedThisWave = false;
  let extraPickUsedThisWave2 = false;
  let bonusDeathSnapshot = 0;        // chicken deaths captured at the wave-defended moment
  // Secret karma mechanic: a signed scale (good = +, bad = -). A wave cleared
  // without shooting a chicken nudges karma good; a wave with a friendly-fire
  // kill nudges it bad. At ±KARMA_MAX the player cheats death once, then the
  // karma is spent. Karma also slowly tints the player's shirt.
  const KARMA_MAX = 50;          // the resurrect threshold (and the glow threshold)
  const KARMA_HARD_CAP = 100;    // karma may climb beyond ±KARMA_MAX, but is capped at ±100
  let karma = 0;
  let wave = 0;         // startWave() increments first, so wave 1 = first real wave
  let waveTimer = 12;   // seconds until next wave (also: grace period at game start)
  let nextWolves = 1;
  const WOLF_TRAIT_START = 5;  // waves before trait levels begin appearing
  const ASSASSIN_START = 10;   // waves before 'assassin wolves' can appear
  const SWORD_WOLF_RATE = 0.01; // expected sword wolves per wave (flat — does not scale)
  const HAT_WOLF_RATE   = 0.32; // expected hatted wolves per wave — killing one drops a hat
  const WOLF_SPEED_CAP = 10;    // max faster-level contribution to wolf speed (lowered so wave 40+ packs aren't blistering)
  const WOLF_SIZE_CAP = 14;     // max faster-level contribution to wolf size
  // Bomb wolves — slow wall-sappers that detonate against a wall.
  const BOMB_WALL_WAVE = 25;    // bomb wolves start appearing from this wave
  const BOMB_MIN_WALLS = 4;     // ...and only while at least this many walls stand
  const BOMB_WOLF_HP = 8;       // bomb wolf health
  const BOMB_WOLF_SPEED = 1.3;  // bomb wolf move speed (deliberately slow)
  const BOMB_REACH = 0.8;       // distance at which it reaches a wall and detonates
  const BOMB_BLAST_KEEPER_R = 2.4; // a bomb wolf's blast knocks a hat off a keeper this close
  // Brood wolves — from wave 20, a fat she-wolf walks in, halts, births 3
  // pups that just wander (won't attack), then runs back off the map.
  const BREEDER_WAVE = 20;
  const BREEDER_HP = 10;            // brood wolf is tanky — takes a few hits to pop
  const BREEDER_SPEED = 2.4;
  const BREEDER_BIRTH_DELAY = 2.0;  // seconds the breeder stands still before birthing
  const BREEDER_PUP_MIN = 2;        // a brood wolf bursts into 2-5 pups
  const BREEDER_PUP_MAX = 5;
  const PUP_SPEED = 3.6;            // pups are fast — they zip around
  const PUP_WANDER_SWITCH = 0.7;    // seconds between heading changes
  const PUP_AGGRO_R = 3.0;          // a pup goes feral if a keeper strays this close (tiles)
  const PUP_SPAWN_INVULN = 0.5;     // brief immortality so the killing blast doesn't insta-pop them
  const PUP_LIFETIME = 30;          // seconds before a pup loses interest and scampers off the map
  const PUP_LEAVE_EXPLODE = 10;     // if it can't reach an edge within this long after giving up, it cooks off
  const PUP_EXPLODE_R   = 2.0;      // blast radius of a cooked-off pup (tiles)
  const PUP_EXPLODE_DMG = 4;        // damage to each wolf caught in a pup's blast
  // Night of the Wolf — a rare wave-long event. Sky goes dark, only nearby
  // light pools illuminate the field, wolves get buffed and hard to see (only
  // their red eyes give them away). On survival the wave pays double and
  // hands the keeper a witch hat. Triggers between waves 10-50, expected
  // 2-3 times per run (hard-capped at 3).
  const NIGHT_OF_WOLF_MIN_WAVE = 10;
  const NIGHT_OF_WOLF_MAX_WAVE = 50;
  const NIGHT_OF_WOLF_PER_WAVE_CHANCE = 0.16; // doubled (waves 10-50)
  const NIGHT_OF_WOLF_MAX_PER_RUN = 3;
  const NIGHT_OF_WOLF_WITCH_HAT_COLOR = '#3d1280'; // darker, more menacing purple
  const NIGHT_OF_WOLF_WITCH_HAT_CHANCE = 0.80;     // odds of getting the witch hat on survival
  const LEPRECHAUN_HAT_COLOR = '#1f6b1f';
  const LEPRECHAUN_BUY_CHANCE = 0.06;              // chance a bought hat comes out leprechaun (was 0.01)
  const LEPRECHAUN_PAYOUT = 100;
  let nightOfWolf = false;        // true while the current wave is a Night-of-the-Wolf wave
  let nightOfWolfCount = 0;       // how many have triggered this run
  let nightOfWolfDebugForce = false; // debug toggle — next startWave becomes a night wave
  // ---------- Wave-50 boss fight ----------
  const BOSS_WAVE = 50;
  const BOSS_INTRO_DELAY = 2.6;   // seconds of dusk-shift + shaking before it appears
  const BOSS_HP = 3000;           // HP per side (it's beaten 4 times) — a real slog
  const BOSS_MAX_DPS = 65;        // cap on damage it can take per second (anti-melt, like player i-frames)
  const BOSS_SIZE = 3.4;          // draw scale
  const BOSS_HIT_BONUS = 1.5;     // fattens the boss's pellet hitbox so it's far easier to land shots
  const BOSS_TOUCH_R = 2.2;       // body radius that crushes a keeper on contact (guaranteed hat hit)
  const BOSS_FIRE_COOLDOWN = 4.4; // seconds between its volleys (slow, deliberate)
  const BOSS_PACK_DURATION = 30;  // seconds wolves keep pouring in between sides
  const BOSS_PACK_INTERVAL = 0.9; // seconds between pack spawns (dense)
  const BOSS_PACK_CAP = 26;       // max concurrent pack wolves
  const BOSS_DASH_SPEED = 18;     // tiles/s while charging (doubled — aggressive wolf-like rush)
  const BOSS_DASH_TIME = 0.5;     // seconds a charge lasts (shorter = snappier burst)
  const BOSS_DASH_CD = 2.0;       // cooldown between charges
  const BOSS_DASH_CHANCE = 0.18;  // per-second roll to charge (MK-02 onward)
  const BOSS_CLOSE_DASH_R = 4.5;  // a keeper inside this range forces an immediate charge
  // Phase-3 chicken-suck: MK-03 launches orbs that drag a chicken back to heal it.
  const BOSS_SUCK_COOLDOWN = 8;   // seconds between chicken-suck launches (less frequent now)
  const BOSS_SUCK_SPEED = 6.5;    // tiles/s the suck orb travels
  const BOSS_SUCK_HEAL = 300;     // HP the boss regains per chicken delivered (reduced)
  const BOSS_SUCK_GRAB_R = 0.6;   // distance at which the orb grabs / delivers
  // Phase-4 missiles: MK-04 briefly winds up (the rack glows) then fires twin
  // wall-piercing missiles at a coop while it keeps fighting.
  const BOSS_MISSILE_CHARGE = 5;     // seconds of telegraph before the salvo (was 15)
  const BOSS_MISSILE_COOLDOWN = 6.0; // seconds after a salvo before the next wind-up
  const BOSS_MISSILE_SPEED = 8.0;    // tiles/s
  const BOSS_MISSILE_LIFE = 5.0;     // seconds before it fizzles (must reach distant coops)
  const BOSS_MISSILE_BLAST_R = 2.2;  // explosion radius on impact
  // Shared coop-strike payload (reused by the boss AND the wave-51+ missile wolf).
  const MISSILE_MIN_FLOORS = 1;      // fewest floors a hit knocks off
  const MISSILE_MAX_FLOORS = 3;      // most floors a hit knocks off
  const BOSS_BULLET_BLAST_R   = 1.9; // radius a cooked-off boss homing bullet flattens buildings in
  const BOSS_BULLET_BOOM_CHANCE = 0.5; // chance a boss homing bullet explodes at end of life
  const COOP_IGNITE_DURATION  = 4.5; // seconds a missile-struck coop stays on fire
  let bossPackSpawnT = 0;         // trickle timer during the 'pack' phase
  let bossWaveActive = false;     // true through the whole wave-50 fight
  let bossPhase = '';             // 'intro'|'fight'|'retreat'|'pack'|'explode'|'cleared'
  let bossPhaseT = 0;
  let bossSidesDone = 0;          // 0..4 — times the boss has been beaten
  let bossOrder = [0, 1, 2, 3];   // shuffled corner order it appears from
  let boss = null;                // the boss wolf (also lives in wolves[])
  let bossTint = 0;               // 0..1 dusk-orange overlay strength
  let endScreen = false;          // post-boss "restart or continue" screen
  // Post-wave-50 the event escapes its run-cap and instead schedules itself
  // once randomly inside every consecutive 5-wave block. These two track
  // which block we last rolled for and which wave inside it was picked.
  let lateNightBlockStart = 0;
  let nextLateNightWave = 0;
  // Ranged wolves — from wave 35, a sit-and-shoot type that fires red pellets
  // at the closest live player or chicken from a safe distance.
  const RANGED_WAVE = 35;
  const RANGED_HP = 4;
  const RANGED_SPEED = 2.2;
  const RANGED_FIRE_COOLDOWN = 5.0; // seconds between laser shots (no more miss roll — every cooldown fires)
  const RANGED_MISS_CHANCE = 0.5;   // chance the wolf fluffs the shot and the beam doesn't draw or damage
  const LASER_LOCK_TIME = 0.5;      // a laser locks onto your spot for this long, then fires (evade it!)
  const RANGED_BULLET_SPEED = 14;
  const RANGED_BULLET_DMG = 1;
  const RANGED_SETTLE_DIST = 6;     // how far in from the edge it walks before sitting
  const RANGED_PLAYER_RANGE2 = 12 * 12; // only fires at a keeper inside this radius — otherwise hunts chickens
  // Ranged wolf (the homing-bullet shooter) — from wave 30. Sits like the laser
  // wolf but lobs slow red homing bullets that chase the keeper for a while.
  const HOMER_WAVE = 30;
  const HOMER_HP = 4;
  const HOMER_FIRE_COOLDOWN = 3.6;  // seconds between shots
  // Missile wolf — wave 51+. A big, stationary wolf with two back rockets that
  // it lobs at coops after a long, killable wind-up.
  const MISSILE_WOLF_WAVE = 51;      // earliest wave it can appear
  const MISSILE_WOLF_RATE = 0.55;    // chance per wave (51+) to roll one in
  const MISSILE_WOLF_HP = 32;        // beefy — takes real sustained fire to drop
  const MISSILE_WOLF_SIZE = 2.0;     // a big, hulking brute
  const MISSILE_WOLF_CHARGE = 9;     // seconds of telegraph before each salvo
  const MISSILE_WOLF_COOLDOWN = 3.5; // gap after a salvo before it recharges
  const HOMER_BULLET_SPEED = 6.5;   // deliberately slow so you can dodge/outrun them
  const HOMER_BULLET_LIFE = 4.0;    // seconds before the bullet fizzles out
  const HOMER_BULLET_TURN = 2.2;    // radians/sec it can swing toward the keeper
  // Thing wolf — a rare cryptid that plays like an ordinary wolf, but when it
  // dies its body bursts and the head scuttles off on spider legs and flees
  // the map. Only rolls once Cryptid Radar is maxed; boosted by its multiplier.
  // Kept deliberately tiny so the thing wolf stays a true rarity even at max.
  const THING_WOLF_RATE = 0.016;    // expected thing wolves per wave (flat, × cryptid radar)
  const THING_HP = 4;
  const THING_CRAWLER_HP = 2;       // the fleeing head-crawler is fragile
  const THING_CRAWLER_SPEED = 6.0;  // it scuttles away very fast
  // Hunter wolf — a rare cryptid that's a reskin of the keeper: it walks the
  // field, totes the same shotgun, and turns it on the player and chickens.
  // Its health is a random hat count (1..5). Each HIT knocks off exactly ONE
  // hat regardless of damage (so it's never one-shot), with i-frames between
  // hits so a shotgun blast can't strip several at once. Each hat = 1 HP.
  const HUNTER_WOLF_HP_PER_HAT = 1;
  const HUNTER_WOLF_HIT_IFRAME = 0.4; // seconds of invulnerability after a hat is knocked
  const HUNTER_WOLF_RETREAT    = 2.0; // seconds it scrambles to safety (invincible) after losing a hat
  const HUNTER_WOLF_EXPLODE_R  = 2.4; // blast radius when a hunter wolf is killed
  const HUNTER_WOLF_EXPLODE_DMG= 5;   // damage to each wolf caught in that blast
  const HUNTER_WOLF_RATE = 0.32;     // chance per ELIGIBLE wave to roll one in
  const HUNTER_WOLF_GAP_WAVES = 10;  // can appear at most once every this many waves
  const HUNTER_WOLF_MIN_WAVE = 10;   // earliest wave it can show up (then any wave 10+, incl. 51+)
  let lastHunterWolfWave = -100;     // wave the last hunter wolf appeared
  let ghostWolfChance = 0;           // probability [0,1] of a ghost wolf spawning; +2% per player death
  // Parachute wolf — an ordinary wolf that drops in from the sky onto a random
  // spot inside the field (instead of walking in from a border), descending
  // under a parachute. Untouchable until it lands, then behaves normally.
  const PARACHUTE_WAVE = 15;        // first wave they can appear
  const PARACHUTE_RATE = 0.14;      // per-wave chance one drops in
  const PARACHUTE_FALL_TIME = 3.8;  // seconds of descent (longer drift in)
  const PARACHUTE_START_H = 130;    // screen px above the landing spot at release
  // Player-2 cameo — a very rare single-player easter egg, at most once a run.
  const P2_CAMEO_CHANCE = 0.04;     // per-wave roll while it hasn't appeared yet
  const P2_CAMEO_LIFE   = 14;       // seconds it wanders before strolling off
  // Cryptid Radar — the dish has UNLIMITED range: it pings the moment a cryptid
  // (fox, sword, hatted, thing wolf, or the player-2 cameo) appears anywhere on
  // the field, then the antennas emit signal motes for RADAR_EMIT_TIME seconds
  // before going quiet again.
  const RADAR_EMIT_TIME = 3.5;
  let radarEmitT = 0;
  // Hunter camp — a hireable trio of shotgunners. Unlocks once the player has
  // ever pocketed $200 and re-appears as an upgrade after the last camp leaves.
  const HUNTER_UNLOCK_GOLD = 300;
  const HUNTER_FEE_PER_WAVE = 100;
  const HUNTER_COUNT = 3;
  // Hunter Caravan — per-group per-wave fee (group 1 = $100, 2 = $200, 3 = $300).
  const HUNTER_GROUP_FEE = [0, 100, 200, 300];
  function hunterTotalFee() {
    let f = 0;
    for (let g = 1; g <= Math.min(3, huntersGroups); g++) f += HUNTER_GROUP_FEE[g];
    return f;
  }
  // Metaverse (wave 51+) — once owned, every mutually-exclusive pick unlocks,
  // so the keeper can stack both halves of each either/or upgrade.
  function metaverseOn() { return (upgradeLevels.metaverse || 0) > 0; }
  // Hat Pack: very small chance a packed hat comes in the buddy's straw colour.
  const HAT_PACK_BUDDY_CHANCE = 0.02;
  // Advanced Oil — fills the accept band almost completely AND fattens the
  // central critical line, but only for a single round.
  const ADVANCED_OIL_BAND = 0.40;
  const ADVANCED_OIL_CRIT = 0.05;
  const HUNTER_HP = 6;
  const HUNTER_RANGE2 = 8 * 8;    // how far a hunter spots a wolf
  const HUNTER_FIRE_COOLDOWN = 1.6; // seconds between shots
  // Idle taunt: when a keeper wanders close and there's nothing to shoot, a
  // hunter sometimes throws a little wave/hip-shake.
  const HUNTER_TAUNT_RANGE = 3.2;   // tiles — keeper must be this close
  const HUNTER_TAUNT_CHANCE = 0.12; // per-second roll to start a taunt while in range (rare)
  const HUNTER_TAUNT_DUR = 1.1;     // seconds a taunt animation plays
  const HUNTER_TAUNT_CD_MIN = 12;   // min cooldown between a hunter's taunts
  const HUNTER_TAUNT_CD_MAX = 22;   // max cooldown
  const HUNTER_PELLETS = 4;       // pellets per shot
  const HUNTER_SPREAD = 14 * Math.PI / 180;
  // Hunter Gear upgrade — only available while a hunter camp is active.
  // Tiered tables: max HP, damage multiplier, fire-cooldown multiplier.
  const HUNTER_POWER_COST = 200;
  const HUNTER_POWER_HP    = [6, 9, 12, 15, 18, 21];
  const HUNTER_POWER_DMG   = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
  const HUNTER_POWER_RATE  = [1.0, 0.85, 0.72, 0.61, 0.52, 0.44];
  function hunterPowerLvl() { return Math.min(5, Math.max(0, upgradeLevels.hunterPower || 0)); }
  // Price ramps $200 per gear tier: tier 1 = $200, tier 2 = $400 … tier 5 = $1000.
  function hunterGearCost() { return HUNTER_POWER_COST * (upgradeLevels.hunterPower + 1); }
  // Hunter weapon by gear tier, mirroring the player's own weapon ladder:
  //   tier 0/1 → shotgun · 2 → double-barrel / machine-gun · 3 → minigun /
  //   rocket · 4+ → laser / homing (random within the tier).
  function hunterWeaponForTier(lvl) {
    if (lvl >= 4) return Math.random() < 0.5 ? 'laser'    : 'homing';
    if (lvl === 3) return Math.random() < 0.5 ? 'minigun'  : 'rocket';
    if (lvl === 2) return Math.random() < 0.5 ? 'doubleBarrel' : 'mg';
    return 'shotgun';
  }
  let everReachedHunterGold = false;
  let huntersCamps = [];        // up to 3 distinct camps: [{ x, y, dirtR, smokeT }]
  const hunters = [];           // {x,y,alive,hp,hurtT,facingLeft,attackT,dir,walkT,vx,vy,weapon,burstLeft,camp}
  let huntersGroups = 0;        // Hunter Caravan — number of hunter camps (1-3) = huntersCamps.length
  let huntersLeavePending = false;
  // Cold remains of a dissolved hunter camp — drawn for one extra wave after
  // the crew packs up, then swept away at the following wave-end.
  let extinctCamp = null;       // { x, y, dirtR, wavesLeft } or null
  let wolfLevelCap = 0; // global, non-deterministic cap that can grow per wave
  let gameOver = false;
  let gameOverMsg = '';
  // In multiplayer, 'host' or 'guest' identifies which keeper fell, so each
  // client can pick the right wording (you vs. buddy).
  let gameOverCause = '';
  let gameOverPanelDelayT = 0;
  let waveActive = false;
  let waveElapsed = 0; // seconds since the current wave started (reset by startWave)
  let waveAutoStartPaused = false;
  let pendingSpawns = 0; // wolves scheduled but not yet spawned (across all live waves)
  let resurrectCount = 0;     // times the red resurrect button has been used (max 9)
  let resurrectLastWave = -99; // wave when last resurrect was used (cooldown: 5 waves)
  let comboKills = 0;          // wolves killed in the current combo window
  let comboT = 0;              // seconds remaining in the combo window (resets on each kill)
  let comboFloat = null;       // active floating "x5" combo label; null when no combo
  // Bumped every time the run is reset (quitToMenu / restartMpGame). Spawn
  // timers capture the gen they were scheduled under and bail if it differs
  // when they fire — otherwise old setTimeouts from the previous run keep
  // calling spawnWolf() into the fresh game and flood wave 1.
  let runGen = 0;
  let buildMode = false;
  // 'dpsdummy' is a debug-only entry — it's filtered out of the build cycle
  // unless the debug panel has been unlocked.
  const BUILD_TYPES = ['coop', 'farm', 'fence', 'stonefence', 'dummy', 'statue', 'mine', 'dpsdummy', 'remove']; // cycled with the scroll wheel in build mode
  let buildType = 0;
  let paused = false;
  // Active pause-window tab ('status' or 'upgrades') and the screen-space
  // rect of the "next tab" arrow — filled in by drawPauseWindow each frame
  // and hit-tested by the canvas mousedown handler.
  let pauseTab = 'status';
  let pauseTabRect = null;
  let pauseUpgradeScroll = 0; // row offset for the scrollable upgrade list
  // Hit-rects for the on-canvas game-over / end-screen action buttons.
  // Set each frame by drawGameOverPanel; read by the mousedown handler.
  let gameOverBtnRects = null;
  let pauseBtnRects    = null;
  // Guest-side mirror of host's pause state — drives the "HOST PAUSED" overlay.
  let hostPaused = false;
  let upgradeDelayT = 0;
  let upgradeMode = false;
  let postUpgradeLockT = 0; // seconds left of input lock after the upgrade window closes
  let upgradeOptions = [];
  let upgradePicked = false;
  // P2's parallel pick state — only used when gameOpts.individualUpgrades is on.
  let upgradeOptions2 = [];
  let upgradePicked2 = false;
  let shotgunLife = 0.30;        // level 1 of "longer barrel"
  let shotgunCooldown = 0.75;    // level 1 of "trigger work"
  let shotgunSpread = 12 * Math.PI / 180; // level 1 of the pattern skills (12°)
  let pelletCount = 4;           // level 1 pellet count
  let wolfFocusChance = 0.50;    // level 1 of the focus skills
  let wolfRushSpeed = 1.0;       // wolf speed multiplier while charging the player
  // Recompute focus/rush from Meat Bait + Wolf Repellent. With BOTH owned
  // (Metaverse) the wolves still come for you but crawl in slowly.
  function recomputeFocus() {
    const up = upgradeLevels.focusUp || 0, down = upgradeLevels.focusDown || 0;
    if (up > 0 && down > 0) {
      wolfFocusChance = 0.5;
      wolfRushSpeed = Math.max(0.45, 1 - down * 0.05 - up * 0.02); // they move slower to you
    } else if (up > 0) {
      wolfFocusChance = tableAt('focusUp');  wolfRushSpeed = 1 + up * 0.05;
    } else if (down > 0) {
      wolfFocusChance = tableAt('focusDown'); wolfRushSpeed = 1 - down * 0.05;
    } else {
      wolfFocusChance = 0.5; wolfRushSpeed = 1.0;
    }
  }
  const upgradeLevels = { jam: 0, range: 0, speed: 0, fireRate: 0, spreadUp: 0, spreadDown: 0, focusUp: 0, focusDown: 0, woodFence: 0, stoneWall: 0, reloadMove: 0, wolfDelay: 0, hatchRate: 0, spreadUp2: 0, spreadDown2: 0, doubleBarrel: 0, machineGun: 0, counter: 0, sprint: 0, softBullet: 0, hardBullet: 0, rust: 0, spinReload: 0, snatch: 0, fatChicken: 0, farm: 0, dog: 0, sword: 0, dummy: 0, statue: 0, hunterPower: 0, workerChicken: 0, richChicken: 0, rocket: 0, minigun: 0, mine: 0, sabotage: 0, sizeMatters: 0, rocketBoots: 0, lastStand: 0, homing: 0, laser: 0, cryptidRadar: 0, rooftopper: 0, safeTrigger: 0, crazyTrigger: 0, goldenChicken: 0, nerdReload: 0, jockReload: 0, coldShot: 0, hotShot: 0, calmWaves: 0, roughWaves: 0, hunterCaravan: 0, metaverse: 0 };
  let dogGen = 1;       // Dog Friend generation — also the number of dogs each generation fields
  // Guard-dog coat variations — one is picked at random for each dog.
  const DOG_COLORS = [
    { body: '#c8884a', belly: '#e6bd8a', head: '#b87838', dark: '#7a4a22' }, // golden
    { body: '#5a5a60', belly: '#8a8a90', head: '#4a4a50', dark: '#303034' }, // charcoal
    { body: '#e3d6bc', belly: '#f2ead6', head: '#cdbf9e', dark: '#9b8a68' }, // cream
  ];
  const DOG_SEP_R = 1.6;       // idle dogs steer apart within this range to spread out
  const DOG_SEP_WEIGHT = 0.7;  // how strongly that separation pulls vs seeking the target
  // Each dog gets one of three random personalities (0 stay-with-player,
  // 1 patrol, 2 protect-chickens) — it only engages wolves on its "beat".
  const DOG_LEASH_R2 = 8 * 8;  // wolves within this of the dog's anchor are hunted
  const DOG_NOTICE_R2 = 3 * 3; // ...as is any wolf this close to the dog itself
  const DOG_BOSS_SCARED_R2 = 12 * 12; // within this of FANGUS the dog is terrified and bolts away

  // Per-level skill values (index 0 = level 1 / starting value, last index = MAX).
  // Standard skills now cap at level 5 — each step is doubled so level 5 lands
  // on the same value the old level 10 used to.
  const SKILL_TABLES = {
    jam:      [0.25, 0.225, 0.20, 0.175, 0.15, 0.10],
    range:    [0.30, 0.40, 0.50, 0.60, 0.70, 1.00],
    speed:    [4.0, 4.5, 5.0, 5.5, 6.0, 7.5],
    fireRate: [0.75, 0.65, 0.55, 0.45, 0.35, 0.15],
    woodFence: [0, 1, 2, 3, 4, 5],     // HP of placed wooden fences (index 0 = locked)
    stoneWall: [0, 2, 4, 6, 8, 12],    // HP of placed stone walls (index 0 = locked)
    reloadMove: [0.80, 0.70, 0.60, 0.45, 0.35, 0.20], // move-speed penalty while reloading (max still leaves a 20% slow — never trivial)
    counter:    [0.05, 0.10, 0.20, 0.30, 0.40, 0.50], // melee counter-attack chance when hit
    sprint:     [0.25, 0.28, 0.31, 0.34, 0.37, 0.40], // run-speed bonus at a full sprint (index 0 = base)
    softBullet: [0, 0.16, 0.32, 0.48, 0.64, 0.80], // chance a pellet PASSES THROUGH a chicken instead of killing it (max caps at 80% so chickens are never fully bulletproof)
    hardBullet: [1.0, 1.20, 1.40, 1.60, 1.80, 2.00], // pellet damage multiplier vs wolves
    rust:       [0, 0.10, 0.22, 0.34, 0.46, 0.46], // extra jam chance added by Rusty Springs (max lvl removes jams entirely instead)
    snatch:     [0, 0.05, 0.10, 0.15, 0.20, 0.25], // chance a wolf carries its kill off the map
    spinReload: [0, 0.04, 0.08, 0.12, 0.16, 0.20], // chance a reload becomes an instant twirl
    wolfDelay: [1, 2, 3, 4, 5, 10],    // seconds before wolves start spawning each wave
    hatchRate: [1.0, 0.95, 0.90, 0.85, 0.80, 0.75], // multiplier on coop chicken respawn interval
    doubleBarrel: [0, 1.10, 1.25, 1.45, 1.70, 2.00], // double-barrel damage multiplier by level
    machineGun: [0, 1.0, 0.84, 0.68, 0.54, 0.42],   // fire-cooldown multiplier by level (lower = faster); starts slow at lvl 1, mag size is now fixed (MG_MAG)
    rocket:     [0, 0.08, 0.16, 0.24, 0.34, 0.50],   // per-pellet chance to explode on contact / end of life (nerfed)
    minigun:    [1.0, 0.62, 0.50, 0.40, 0.32, 0.25], // extra fire-cooldown multiplier on top of the machine-gun rate (lower = faster); gentler ramp so it's not absurdly fast
    focusUp:  [0.50, 0.55, 0.60, 0.65, 0.75, 0.80],
    focusDown:[0.50, 0.45, 0.40, 0.35, 0.25, 0.20],
  };
  // Pattern skills carry two values per level: spread angle (°) and pellet count.
  // Indices 0-5 are the usable Loose/Tighter Pattern progression (no II-extension).
  const LOOSE_SPREAD  = [10, 13, 16, 20, 23, 26];
  const LOOSE_BULLETS = [4, 6, 8, 10, 12, 16];
  const TIGHT_SPREAD  = [10, 8, 6, 4, 2, 0];
  const TIGHT_BULLETS = [4, 4, 6, 6, 8, 1]; // MAX: single piercing slug
  const MAX_LEVEL = 5;         // numbered levels for standard skills, then MAX
  const MAX_FOCUS_LEVEL = 5;   // focus skills cap at level 6 (table index 5)
  const CHICKEN_RESPAWN_MIN = 12; // default seconds between coop chicken respawns
  const CHICKEN_RESPAWN_MAX = 18;
  const CHICKEN_SPAWN_WINDOW = 30; // coops only lay during the first N seconds of an active wave

  player.x = 0;
  player.y = 0;

  // Seeded deterministic RNG (mulberry32). Useful for stable random decoration.
  function mulberry32(seed) {
    let s = seed >>> 0;
    return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // Pack the dark border band with trees — primary tree per tile + frequent secondary.
  // Re-run whenever the map expands so the forest border tracks the new edge.
  function generateTrees() {
    trees.length = 0;
    for (let x = -HALF_MAP; x <= HALF_MAP; x++) {
      for (let y = -HALF_MAP; y <= HALF_MAP; y++) {
        const isBorder = Math.abs(x) >= HALF_MAP - 1 || Math.abs(y) >= HALF_MAP - 1;
        if (!isBorder) continue;
        const h1 = ((x * 928371) ^ (y * 18217) ^ 0x9e3779b9) >>> 0;
        trees.push({
          x: x + (((h1 >> 3) % 13) - 6) * 0.05,
          y: y + (((h1 >> 9) % 13) - 6) * 0.05,
          size: 0.95 + (((h1 >> 14) % 35) / 100),
          shade: (h1 >> 19) % 3,
        });
        const h2 = ((x * 73856093) ^ (y * 19349663) ^ 0x85ebca6b) >>> 0;
        if ((h2 % 100) < 55) {
          trees.push({
            x: x + (((h2 >> 3) % 11) - 5) * 0.08,
            y: y + (((h2 >> 9) % 11) - 5) * 0.08,
            size: 0.9 + (((h2 >> 14) % 30) / 100),
            shade: (h2 >> 19) % 3,
          });
        }
      }
    }
  }
  generateTrees();

