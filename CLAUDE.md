# Chicken Keeper

Isometric wave-defense PWA, hosted on GitHub Pages. No build step: plain HTML/CSS/JS served as-is.

## Structure

The game was one 20k-line index.html. It is now split into classic scripts that share one top-level scope (no modules, no IIFE). `index.html` loads them in order at the end of `<body>`. Load order matters: a file may call functions from any file inside handlers/loops, but top-level code must not call into a later file.

| File | Owns |
|---|---|
| `index.html` | HTML shell: menus, HUD, overlays markup |
| `styles.css` | All styling |
| `js/boot.js` | Debug/pixelate switches, canvas setup, resize |
| `js/audio.js` | Web Audio synthesized sound effects and music |
| `js/input.js` | Isometric projection, keyboard/mouse/touch input |
| `js/state.js` | Game state variables, wave-50 boss state |
| `js/hints.js` | Knowledge Scroll: the hint table, the no-repeat bag, the parchment overlay |
| `js/helpers.js` | Shared helper functions |
| `js/upgrades.js` | Skill tree, "new upgrades unlocked" notice |
| `js/spawning.js` | Wave/enemy/pickup spawning |
| `js/combat.js` | Player 2 shooting (host-authoritative), wolf AI |
| `js/boss.js` | Wave-50 boss fight logic |
| `js/update.js` | Per-frame update loop |
| `js/render.js` | All canvas rendering |
| `js/wolf-overlay.js` | "Night of the Wolf" overlay |
| `js/debug-panel.js` | Dev debug panel (type "debug" to unhide) |
| `js/menu.js` | Title menu |
| `js/net.js` | Online lobby (PeerJS), host→guest snapshots |
| `js/ui.js` | Upgrade tree overlay, menu button wiring, rAF kickoff |

`app.js`, `manifest.webmanifest`, `icon.svg` are unused stubs.

## Service worker

`sw.js` precaches the js/ files cache-first. Bump `BUILD_VERSION` in sw.js on every release, alongside the title-screen label (`.menu-version`) and every JS/CSS `?v=` URL in index.html. The worker maps its JS/CSS `ASSETS` entries to that same versioned URL, so an old worker/browser cache cannot pair a fresh title screen with an old renderer. `tests/cache-version.test.mjs` checks these stay aligned. A new js/ file has to be added to `ASSETS` too. HTML is network-first.

## Robot allies (MK-1 / MK-2 / MK-3)

Summoned by typing `robot1` / `robot2` / `robot3` in-game, or from the debug panel's Spawns & Tools row. They only ever fight — no building, no pickups, no upgrade picks.

- Every stat table in state.js is indexed `[_, mk1, mk2, mk3]`, so index 0 is unused and a robot's stats are a straight lookup on `r.mk`. The mark **is** the intelligence: `ROBOT_AIM_ERR` and `ROBOT_SMART` are the real differences.
- **Host-authoritative.** A guest typing the phrase forwards a `debug-action` (`spawn-robot-N`) over the existing channel, which net.js turns into a synthetic click on the debug handler. That's what makes the phrase work in multiplayer.
- Robots use keeper bodies with mark-colored mechanical heads, hat HP (3/4/5 initially), and the host keeper's weapon upgrades through `fireBurstFor` / `swordSwingFor` / `fireLaserShot`. Every robot weapon cadence is multiplied by `ROBOT_ATTACK_SLOW` (halved rate of fire); `ROBOT_FIRE_CD` only sets the marks relative to each other, since `robotFire` normalizes it against `ROBOT_FIRE_CD[1]`. Keepers can hurt robots only with friendly fire enabled; wolf melee, bullets, beams and hostile explosions can always hurt them. `hurtRobot` centralizes hat loss and red eye flickering.
- **It tries not to shoot the flock.** `chickenInLineOfFire` tests the firing *cone*, and `fenceBetween` the line of fire for walls; either one makes `updateRobot` `robotSidestep` for a better angle instead of firing (it commits to one side for `ROBOT_FLANK_COMMIT` seconds and swaps when a fence stops the step). Behind that, robot rounds carry `ROBOT_SPARE_CHANCE` as a spare chance on pellets, beam and blade. A malfunctioning unit gets neither. Birds it does kill go to `robotChickenKilled`: counted on the unit and in `chickensShotByRobots`, which feeds the wave-end fine but never `advanceKarma`.
- **Parry cuts both ways.** `parryLungeTarget` lets a wolf wind its sparkle-lunge up at a robot that is `ROBOT_PARRY_AGGRO` times closer than the keeper, and `parryDashHitKeeper` resolves a robot hit through `hurtRobot`. `robotTryParry` rolls the robot out of the way: one read per lunge (lunges carry a `parryId`), odds by mark, plus a panic roll when a wolf is inside `ROBOT_PARRY_PANIC_R`. The roll sets `wolfHitT`, so a read lunge is genuinely parried.
- **Scared of FANGUS.** `bossTarget` lets a robot standing `BOSS_ROBOT_AGGRO` times closer than the keeper pull the boss's walk, charge and laser lock onto itself, and `bossContactDamage` crushes robots. `robotCheckFear` rolls the unit's nerve once per `ROBOT_FEAR_CD` while the boss is within `ROBOT_FEAR_R`; a failed roll makes it drop everything and run for `ROBOT_FEAR_T` seconds. The fright clears the moment the boss is gone — the flee branch reads `boss.x`.
- Wolves consider robots at 1/16 of normal squared-distance priority. Contact damage also covers special wolves, respects fences, and stays active during boot/reboot. Shared 25% training milestones reboot all live units of that mark for 15/10/5 seconds. Each wave rolls a 20/10/0% malfunction chance (double in rain), lasting four seconds with random fire. Death always throws scrap; snapshots include hats, eye/reboot/fault state, the dodge-roll, the fright and flying parts.
- `robotTraining` is held **per mark**, not per unit, so rebuilding a destroyed MK-2 keeps what the last one learned. Reset by `resetWorld`.
- Robot health and training/reboot progress use hunter-style pips, with no overhead names. Both hunters and robots show their readouts only within four tiles of a living keeper. Robot and possessed-wolf eyes are drawn above the night mask.

Ninja wolves hide in the outer treeline (8% per wave from wave 10, boosted by Cryptid Radar). A hit makes one retreat without dying, then raid on the next wave with fox AI. Killing the raider awards a conical straw hat to the killer; the debug panel can spawn the encounter or grant the hat. Hidden ninjas do not block wave completion.

Transcendence requires Metaverse, 30 uninterrupted seconds in Last Stand, and a personal good/bad karma rescue on the current wave or within the previous two waves. Current karma does not matter; transcendence freezes it at zero. Debug can force the state for the selected keeper(s). Respawn and buddy revival grant five seconds of both melee and projectile protection.

Covered by `tests/robots.test.mjs` (the AI in isolation — targeting, fire discipline, walls, training) and `tests/entities.test.mjs` (everything that needs boss.js: parries, boss aggro, the chicken tally, cadence). robots.test.mjs also lifts the typed-phrase matcher out of input.js by text (input.js can't be loaded whole — its top level wires DOM listeners).

## Wartime effort (boss wave)

FANGUS arriving puts the farm on a war footing, spread across a few files:

- **+50% hatch rate** while `bossWaveActive` — `wartimeHatchMul()` in state.js divides the coop respawn *interval* in update.js.
- **Supply crates** (`supplyCrates`) parachute in on the `CRATE_DROP_MIN`/`MAX` cadence during the fight, then only rarely from wave 51 on. Drops are **host-authoritative** (`crateDropsActive()` returns false on a guest); the guest sees them through the snapshot. A landed crate must be shot open, and the payload is rolled at open time, never at drop time: live ordnance, a hat pack, or 1-3 chickens. Left unopened into the next wave it rattles (`shakeT`) and rolls `CRATE_SELF_OPEN_PER_SEC` to burst by itself.
- **Crate hats fly.** They arc onto a keeper's head via `flyHats` + `pendingHatLandings` rather than landing on the stack, addressed to whoever shot the crate — or, for a self-opened one, a keeper picked by `hatRecipientFor`. `spawnFlyHat`'s destination is no longer hard-coded to player 1.
- **`killChicken(c, force)`** is the single chokepoint for every chicken death, and it refuses while `savedT > 0` — that's what makes crate cargo untouchable for `CRATE_CHICK_SHIELD` seconds against jaws, pellets, blasts and the siphon alike (the two snatch sites check it too). `force` is only for a bird ending *itself* (soldier TNT, worker fence-rebuild); without it a shielded soldier detonated on a loop.
- **Soldier chickens** (`c.soldier`) only arrive in a crate or via the debug panel — the coops never hatch them. They charge the nearest wolf and detonate. A detonating soldier counts as a chicken lost for the bonus-pick roll, matching the worker chicken's fence-rebuild sacrifice.

Covered by `tests/wartime.test.mjs`.

## Knowledge Scroll hints

`js/hints.js` holds `GAME_HINTS`, the lines the Knowledge Scroll upgrade reads out. Nothing hardcodes how many there are, so lines can be added or cut freely. `HINTS.md` at the repo root is the published copy of that list and is generated from the array, so edit `js/hints.js` and regenerate. `tests/hints.test.mjs` pins the uniqueness, the no-repeat bag, and the bonus-pick/wave-51 gate.
