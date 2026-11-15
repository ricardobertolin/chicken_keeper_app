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

`sw.js` precaches the js/ files cache-first. Bump `VERSION` in sw.js on every release or returning players keep the old build. HTML is network-first.
