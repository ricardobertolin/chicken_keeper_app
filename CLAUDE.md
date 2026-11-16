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

`sw.js` precaches the js/ files cache-first. Bump `VERSION` in sw.js on every release or returning players keep the old build. Keep it in step with the title-screen label (`.menu-version` in index.html). A new js/ file has to be added to the `ASSETS` list too. HTML is network-first.

## Robot allies (MK-1 / MK-2 / MK-3)

Summoned by typing `robot1` / `robot2` / `robot3` in-game, or from the debug panel's Spawns & Tools row. They only ever fight — no building, no pickups, no upgrade picks.

- Every stat table in state.js is indexed `[_, mk1, mk2, mk3]`, so index 0 is unused and a robot's stats are a straight lookup on `r.mk`. The mark **is** the intelligence: `ROBOT_AIM_ERR` and `ROBOT_SMART` are the real differences.
- **Host-authoritative.** A guest typing the phrase forwards a `debug-action` (`spawn-robot-N`) over the existing channel, which net.js turns into a synthetic click on the debug handler. That's what makes the phrase work in multiplayer.
- Pellets carry `shooter: 'robot'`, treated as **ally fire** in `updatePellet`: damages wolves, passes through keepers, hunters and the flock. Adding a new shooter kind means auditing every `p.shooter` branch in boss.js.
- Wolf AI is untouched. Robots take contact damage in their own update loop and from ranged-wolf bullets, rather than being taught to the pack as a new target type.
- `robotTraining` is held **per mark**, not per unit, so rebuilding a destroyed MK-2 keeps what the last one learned. Reset by `resetWorld`.

Covered by `tests/robots.test.mjs`, which also lifts the typed-phrase matcher out of input.js by text (input.js can't be loaded whole — its top level wires DOM listeners).

## Wartime effort (boss wave)

FANGUS arriving puts the farm on a war footing, spread across a few files:

- **+50% hatch rate** while `bossWaveActive` — `wartimeHatchMul()` in state.js divides the coop respawn *interval* in update.js.
- **Supply crates** (`supplyCrates`) parachute in every 15-30s during the fight, then only rarely from wave 51 on. Drops are **host-authoritative** (`crateDropsActive()` returns false on a guest); the guest sees them through the snapshot. A landed crate must be shot open, and the payload is rolled at open time, never at drop time: live ordnance, a hat pack (to whoever cracked it), or 1-3 chickens.
- **Soldier chickens** (`c.soldier`) only arrive in a crate or via the debug panel — the coops never hatch them. They charge the nearest wolf and detonate. A detonating soldier counts as a chicken lost for the bonus-pick roll, matching the worker chicken's fence-rebuild sacrifice.

Covered by `tests/wartime.test.mjs`.

## Knowledge Scroll hints

`js/hints.js` holds `GAME_HINTS`, the lines the Knowledge Scroll upgrade reads out. Nothing hardcodes how many there are, so lines can be added or cut freely. `HINTS.md` at the repo root is the published copy of that list and is generated from the array, so edit `js/hints.js` and regenerate. `tests/hints.test.mjs` pins the uniqueness, the no-repeat bag, and the bonus-pick/wave-51 gate.
