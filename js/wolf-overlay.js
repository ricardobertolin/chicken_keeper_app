  // ---------- Night of the Wolf overlay ----------
  // Offscreen darkness mask. Allocated lazily and resized to match the canvas.
  let nightMaskCanvas = null;
  function ensureNightMask() {
    if (!nightMaskCanvas || nightMaskCanvas.width !== W || nightMaskCanvas.height !== H) {
      nightMaskCanvas = document.createElement('canvas');
      nightMaskCanvas.width = W;
      nightMaskCanvas.height = H;
    }
    return nightMaskCanvas;
  }

  // Each light source: world position, radius in screen pixels, warm RGB tint.
  // Lights bloom around coops, hunter fire, keepers, and live pellets.
  function collectNightLights() {
    const lights = [];
    for (const c of coops) {
      lights.push({ x: c.x, y: c.y, r: 78, color: [255, 196, 96] });
      // Missile fire — coop ablaze casts a strong flickering firelight.
      if ((c.igniteT || 0) > 0) {
        const flick = 1 + Math.sin(Date.now() * 0.019 + c.x * 3 - c.y * 2) * 0.18;
        lights.push({ x: c.x, y: c.y, r: 110 * flick, color: [255, 115, 35] });
      }
    }
    // Max-level Scarecrows glow with a low orange ember at night —
    // the "primed to explode" tell becomes a small lantern in the dark.
    if (upgradeLevels.dummy >= 5) {
      for (const dm of dummies) {
        lights.push({ x: dm.x, y: dm.y, r: 56, color: [255, 140, 70] });
      }
    }
    if (huntersCamps.length) {
      for (const c of huntersCamps) {
        const fire = campFireWorld(c);
        lights.push({ x: fire.x, y: fire.y, r: 96, color: [255, 150, 70] });
      }
    } else if (extinctCamp) {
      const fire = campFireWorld(extinctCamp);
      lights.push({ x: fire.x, y: fire.y, r: 36, color: [200, 110, 60] });
    }
    if (!player.ghost) {
      // Player muzzle flash: a brief bright pulse when the gun has just fired.
      const flash = player.reloadT > 0 ? Math.min(1, player.reloadT / 0.15) : 0;
      const r = 48 + flash * 80;
      lights.push({ x: player.x, y: player.y, r, color: [255, 220, 150] });
      // Karma aura at the extremes — saintly blue at +KARMA_MAX, hellish red at -KARMA_MAX.
      if (player.transcendentKarma)       lights.push({ x: player.x, y: player.y, r: 46, color: [180, 70, 255] });
      else if (player.karma >= KARMA_MAX) lights.push({ x: player.x, y: player.y, r: 46, color: [70, 150, 255] });
      else if (player.karma <= -KARMA_MAX) lights.push({ x: player.x, y: player.y, r: 46, color: [255, 55, 45] });
    }
    if (player2.active && !player2.ghost) {
      const flash = player2.reloadT > 0 ? Math.min(1, player2.reloadT / 0.15) : 0;
      const r = 48 + flash * 80;
      lights.push({ x: player2.x, y: player2.y, r, color: [180, 210, 255] });
      if (player2.transcendentKarma)       lights.push({ x: player2.x, y: player2.y, r: 46, color: [180, 70, 255] });
      else if (player2.karma >= KARMA_MAX) lights.push({ x: player2.x, y: player2.y, r: 46, color: [70, 150, 255] });
      else if (player2.karma <= -KARMA_MAX) lights.push({ x: player2.x, y: player2.y, r: 46, color: [255, 55, 45] });
    }
    for (const h of hunters) {
      if (!h.alive) continue;
      lights.push({ x: h.x, y: h.y, r: 36, color: [255, 200, 100] });
    }
    // Burning enemies cast a flickering firelight — a wolf set ablaze (Hot Shot /
    // boot exhaust) becomes a little torch wandering the dark.
    for (const w of wolves) {
      if (!w.alive || !(w.burnT > 0)) continue;
      const flick = 1 + Math.sin(Date.now() * 0.02 + (w.x - w.y) * 3) * 0.14;
      lights.push({ x: w.x, y: w.y, r: 46 * flick, color: [255, 125, 45] });
    }
    for (const p of pellets) {
      // Each pellet drags a small light pool with it — but plain player
      // pellets stay dark; only MAX Soft/Hard Bullets glow so
      // the visual reads as "magic-touched rounds". Hunter and wolf pellets
      // keep their lights regardless.
      const isWolf = p.shooter === 'wolf';
      let lit = true;
      if (p.shooter === 1) {
        lit = (upgradeLevels.softBullet >= 5) || (upgradeLevels.hardBullet >= 5);
      } else if (p.shooter === 2) {
        const l2 = lvlsFor(player2);
        lit = (l2.softBullet >= 5) || (l2.hardBullet >= 5);
      }
      if (!lit) continue;
      // A robot round throws the same icy blue its muzzle and eyes do, so an
      // MK firing in the dark reads as the machine and not as a keeper.
      const color = isWolf ? [255, 80, 60]
                  : p.shooter === 'robot' ? [120, 200, 255]
                  : [255, 230, 160];
      lights.push({ x: p.x, y: p.y, r: 28, color });
    }
    for (const b of blasts) {
      // Explosions briefly throw a huge pool of light.
      const frac = 1 - (b.t / b.life);
      lights.push({ x: b.x, y: b.y, r: 60 + frac * 90, color: [255, 200, 120] });
    }
    // Laser beams: a string of small red lights along each active beam so
    // the path the beam took is briefly visible through the darkness.
    for (const lb of beams) {
      const alpha = 1 - lb.t / lb.life;
      const dx = lb.x2 - lb.x1, dy = lb.y2 - lb.y1;
      const len = Math.hypot(dx, dy) || 1;
      const steps = Math.min(20, Math.max(4, Math.floor(len / 1.5)));
      const bc = lb.color || '#ff2a22';
      const lcol = [parseInt(bc.slice(1, 3), 16), parseInt(bc.slice(3, 5), 16), parseInt(bc.slice(5, 7), 16)];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        lights.push({
          x: lb.x1 + dx * t,
          y: lb.y1 + dy * t,
          r: 24 * alpha + 6,
          color: lcol,
        });
      }
    }
    return lights;
  }

  // True when a tall building (coop/tree) sits in front of the given world
  // point and would visually cover it. Mirrors the geometry of occlusionAlpha.
  function isOccludedByBuilding(wx, wy) {
    const blockers = [];
    for (const c of coops) blockers.push(c);
    for (const t of trees) blockers.push(t);
    for (const b of blockers) {
      const dv = (b.x + b.y) - (wx + wy);
      if (dv <= 0) continue;
      const du = Math.abs((b.x - b.y) - (wx - wy));
      const floors = (b.level || 0) + 1;
      const halfWidth = 1.35;
      const reach = 2.4 + (floors - 1) * 2.6;
      if (du <= halfWidth && dv <= reach) return true;
    }
    return false;
  }

  // Drawn on top of the darkness mask: a tiny red dot at each wolf's eye so
  // the eyes show through without the wolf becoming a light source. Skipped
  // when a building hides the wolf so eyes don't float in front of coops/trees.
  function drawWolfEyesOverlay() {
    drawNinjaForestHints();
    // Robot lenses use the same overlay pass as wolf eyes, above the darkness.
    for (const r of robots) {
      if (!r.alive || isOccludedByBuilding(r.x, r.y)) continue;
      const p = worldToScreen(r.x, r.y), cy = p.y + TILE_H / 2;
      ctx.save();
      ctx.translate(p.x, cy); ctx.scale(0.9, 0.9); ctx.translate(-p.x, -cy);
      if (r.bootT > 0) ctx.globalAlpha *= 0.25 + 0.5 * Math.abs(Math.sin(Date.now() * 0.008));
      ctx.fillStyle = robotEyesRed(r) ? '#ff3333' : '#57caff';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 3;
      ctx.fillRect(p.x - 4, cy - 31, 2.8, 2);
      ctx.fillRect(p.x + 1.2, cy - 31, 2.8, 2);
      ctx.restore();
    }
    for (const w of wolves) {
      if (!w.alive || (w.fox && !w.turncoat) || ninjaIsWatching(w)) continue;
      if (isOccludedByBuilding(w.x, w.y)) continue;
      const s = w.size || 1;
      const p = worldToScreen(w.x, w.y);
      const cx = p.x;
      const bob = Math.sin(w.bob || 0) * 1.0;
      const cy = p.y + TILE_H / 2 + bob;
      // Eye sits ~11*s to the right of the wolf centre in screen space;
      // mirror it for left-facing wolves.
      const sign = w.facingLeft ? -1 : 1;
      const ex = cx + 11 * s * sign;
      const ey = cy - 15 * s;
      if (w.turncoat) {
        ctx.fillStyle = '#3aa8ff';
      } else if (w.defective) {
        const t = Date.now() * 0.018 + (w.x + w.y) * 7;
        const on = (Math.sin(t) + Math.sin(t * 2.3 + 1.1)) > 0.4;
        ctx.fillStyle = on ? '#ff5a3c' : '#3a3a3a';
      } else {
        ctx.fillStyle = '#ff2a22';
      }
      ctx.fillRect(ex, ey, 1.6 * s, 1.6 * s);
      // Parry wind-up sparkle — redrawn over the darkness so the lunge tell still
      // twinkles in the dark (the world-pass sparkle gets covered by the night).
      if (w.sparkleT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const tw = 0.5 + 0.5 * Math.sin(Date.now() * 0.03 + (w.x + w.y));
        const sx = ex + 0.8 * s, sy = ey + 0.8 * s;
        const r = (2.4 + tw * 1.6) * s;
        ctx.strokeStyle = 'rgba(255,255,180,' + (0.7 + 0.3 * tw).toFixed(2) + ')';
        ctx.lineWidth = 0.9 * s;
        ctx.beginPath();
        ctx.moveTo(sx - r, sy); ctx.lineTo(sx + r, sy);
        ctx.moveTo(sx, sy - r); ctx.lineTo(sx, sy + r);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,225,0.95)';
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawNightOverlay() {
    const mask = ensureNightMask();
    const m = mask.getContext('2d');
    // Fill the mask with deep-blue darkness.
    m.globalCompositeOperation = 'source-over';
    m.fillStyle = 'rgba(6,8,24,0.86)';
    m.fillRect(0, 0, W, H);
    // Punch out lit pools so the underlying scene shows through.
    m.globalCompositeOperation = 'destination-out';
    const _nightLights = collectNightLights();
    for (const L of _nightLights) {
      const sp = worldToScreen(L.x, L.y);
      const r = L.r;
      if (sp.x < -r || sp.x > W + r || sp.y < -r || sp.y > H + r) continue;
      const g = m.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r);
      g.addColorStop(0,    'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      g.addColorStop(1,    'rgba(255,255,255,0)');
      m.fillStyle = g;
      m.fillRect(sp.x - r, sp.y - r, r * 2, r * 2);
    }
    // Lay the darkness mask onto the main canvas.
    ctx.drawImage(mask, 0, 0);
    // Add a warm tint inside the lit pools using 'lighter' so the light feels
    // colored rather than just transparent.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of _nightLights) {
      const sp = worldToScreen(L.x, L.y);
      const r = L.r;
      if (sp.x < -r || sp.x > W + r || sp.y < -r || sp.y > H + r) continue;
      const [cr, cg, cb] = L.color;
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, r);
      g.addColorStop(0,   'rgba(' + cr + ',' + cg + ',' + cb + ',0.22)');
      g.addColorStop(0.5, 'rgba(' + cr + ',' + cg + ',' + cb + ',0.08)');
      g.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sp.x - r, sp.y - r, r * 2, r * 2);
    }
    ctx.restore();
    // Paint wolf eyes over everything so they stay visible without lighting
    // up the surrounding fur.
    drawWolfEyesOverlay();
    drawAllyThermalOverlay();
  }

  // Night of the Wolf: your allies aren't fumbling in the dark — the hunters
  // and the rooftoppers strap on thermal goggles. Drawn over the darkness
  // mask like the wolf eyes, so a green twin-lens glow marks every ally you
  // own without lighting the ground around them.
  //
  // Every offset below is derived from where the sprite ACTUALLY puts the
  // head, not guessed: both figures are drawn at HUNTER_SCALE about their own
  // feet line, with the head circle at -30 (plus the crouch and any recoil)
  // in pre-scale units and the eyes a touch above its centre.
  const THERMAL_SCALE = 0.88;   // the hunter/rooftopper sprite scale
  const THERMAL_EYE_Y = 31.5;   // pre-scale height of the eye line above the feet
  function drawAllyThermalOverlay() {
    const lens = (sx, sy, s, facingLeft) => {
      const sign = facingLeft ? -1 : 1;
      ctx.save();
      // Soft bloom so it reads as emitted light rather than a painted dot.
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 7 * s);
      g.addColorStop(0,   'rgba(120,255,150,0.75)');
      g.addColorStop(0.45,'rgba(60,220,110,0.28)');
      g.addColorStop(1,   'rgba(40,200,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 7 * s, sy - 7 * s, 14 * s, 14 * s);
      ctx.restore();
      // The two lenses themselves, offset toward the face they're looking out of.
      ctx.fillStyle = '#9dffbe';
      ctx.fillRect(sx - 0.6 * s + sign * 0.6 * s, sy - 0.7 * s, 1.5 * s, 1.5 * s);
      ctx.fillRect(sx - 0.6 * s + sign * 3.0 * s, sy - 0.7 * s, 1.5 * s, 1.5 * s);
    };
    for (const h of hunters) {
      if (!h.alive || h.dying) continue;
      if (isOccludedByBuilding(h.x, h.y)) continue;
      const p = worldToScreen(h.x, h.y);
      // Follow the walk bob and the kneeling crouch — a fixed offset left the
      // goggles hovering a few pixels clear of the head for the whole wave,
      // and a hunter kneels for exactly as long as the fight lasts.
      const feetY = p.y + TILE_H / 2 + Math.sin(h.walkT || 0) * 1.0;
      const kneel = (waveActive || bossWaveActive) && !huntersLeavePending;
      lens(p.x, feetY - (THERMAL_EYE_Y - (kneel ? 6 : 0)) * THERMAL_SCALE,
           THERMAL_SCALE, h.facingLeft);
    }
    for (const r of rooftoppers) {
      if (!r.alive || r.falling) continue;
      // Rooftoppers are lifted onto the coop roof, so their feet line comes
      // from the same helper drawRooftopper builds the sprite off. They are
      // permanently crouched, and the shot recoil dips the whole torso.
      const p = worldToScreen(r.x, r.y);
      const cy = p.y + TILE_H / 2;
      const baseCD = ROOFTOP_BASE_COOLDOWN + rooftopperCoopLevel(r) * ROOFTOP_DELAY_PER_FLOOR;
      const recoil = (r.fireT > 0 && r.fireT > baseCD - 0.16) ? -1 : 0;
      lens(p.x, rooftopperFeetY(r, cy) - (THERMAL_EYE_Y - 6 - recoil) * THERMAL_SCALE,
           THERMAL_SCALE, r.facingLeft);
    }
  }

  // A gunsmoke puff — pale, rises and grows as it fades, like the chimney smoke.
  function drawSmoke(s) {
    const p = worldToScreen(s.x, s.y);
    const frac = s.t / s.life;
    const sx = p.x;
    const sy = p.y + TILE_H / 2 - 16 - frac * 18; // drifts up the screen as it ages
    ctx.globalAlpha = (1 - frac) * 0.55;
    ctx.fillStyle = '#e6e6e6';
    ctx.beginPath();
    ctx.arc(sx, sy, s.r + frac * 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Telegraph lines for lasers that have locked a spot but not yet fired — a
  // dashed red beam to the locked point with a pulsing target marker, so the
  // player gets the 0.5s warning to step aside.
  function drawLaserPreviews() {
    const pulse = 0.4 + 0.5 * Math.abs(Math.sin(Date.now() / 80));
    ctx.save();
    ctx.lineCap = 'round';
    for (const w of wolves) {
      if (!(w.laserLockT > 0)) continue;
      const yo = w.boss ? 26 : 10;
      const p1 = worldToScreen(w.x, w.y), p2 = worldToScreen(w.laserLockX, w.laserLockY);
      const ya = p1.y + TILE_H / 2 - yo, yb = p2.y + TILE_H / 2 - yo;
      ctx.strokeStyle = 'rgba(255,60,40,' + (0.25 + 0.4 * pulse).toFixed(2) + ')';
      ctx.lineWidth = w.boss ? 2.0 : 1.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(p1.x, ya); ctx.lineTo(p2.x, yb); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,70,40,' + (0.4 + 0.4 * pulse).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(p2.x, yb, (w.boss ? 6 : 4) * (0.8 + 0.3 * pulse), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // FANGUS chicken-siphon orbs — a glowing purple ball linked to the boss by a
  // dashed tether. While returning, the captured chicken rides inside it.
  function drawChickenSuckers() {
    if (chickenSuckers.length === 0) return;
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 70));
    ctx.save();
    for (const s of chickenSuckers) {
      const p = worldToScreen(s.x, s.y);
      const cx = p.x, cy = p.y + TILE_H / 2 - 8;
      // Tether back to the boss.
      if (boss && boss.alive) {
        const bp = worldToScreen(boss.x, boss.y);
        ctx.strokeStyle = 'rgba(255,80,60,0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(bp.x, bp.y + TILE_H / 2 - 18);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Glowing orb.
      const r = 7 + pulse * 2;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
      g.addColorStop(0, 'rgba(255,200,190,0.95)');
      g.addColorStop(1, 'rgba(220,40,40,0.14)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      // The captured chicken rides inside while being hauled in.
      if (s.phase === 'return') drawChickenIcon(cx, cy + 1, 0.75);
    }
    ctx.restore();
  }

  // FANGUS phase-4 missiles — a small grey rocket with a flame tail, oriented
  // along its flight path.
  function drawBossMissiles() {
    if (bossMissiles.length === 0) return;
    ctx.save();
    for (const m of bossMissiles) {
      const p = worldToScreen(m.x, m.y);
      const cx = p.x, cy = p.y + TILE_H / 2 - 10;
      const ang = Math.atan2((m.vx + m.vy) * TILE_H / 2, (m.vx - m.vy) * TILE_W / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      // Flame tail.
      const flick = 5 + Math.random() * 4;
      ctx.fillStyle = 'rgba(255,170,40,0.9)';
      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-10 - flick, -3); ctx.lineTo(-10 - flick * 1.6, 0); ctx.lineTo(-10 - flick, 3); ctx.closePath();
      ctx.fill();
      // Body — bigger now, to match the rack missiles' look.
      ctx.fillStyle = '#d6d8dc';
      ctx.fillRect(-10, -2.4, 20, 4.8);
      // Dark nose cone.
      ctx.fillStyle = '#3a3f47';
      ctx.beginPath();
      ctx.moveTo(10, -2.4); ctx.lineTo(16, 0); ctx.lineTo(10, 2.4); ctx.closePath();
      ctx.fill();
      // Tail fins.
      ctx.fillStyle = '#8a9099';
      ctx.beginPath(); ctx.moveTo(-10, -2.4); ctx.lineTo(-13, -4.8); ctx.lineTo(-8, -2.4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, 2.4); ctx.lineTo(-13, 4.8); ctx.lineTo(-8, 2.4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  // A ranged-wolf laser beam — a straight three-layer red line (glow under,
  // sharp core, white hairline) that fades over its short lifetime.
  function drawBeam(b) {
    const p1 = worldToScreen(b.x1, b.y1);
    const p2 = worldToScreen(b.x2, b.y2);
    const frac = Math.min(1, b.t / b.life);
    const alpha = 1 - frac;
    // Vertical anchor: wolves emit from body height (~10); the player's beam
    // leaves the gun muzzle, which sits higher (~18), so it can override yOff.
    const yo = (b.yOff != null) ? b.yOff : 10;
    const y1 = p1.y + TILE_H / 2 - yo;
    const y2 = p2.y + TILE_H / 2 - yo;
    // Beam tint comes from b.color (default: the ranged wolf's red).
    const col = b.color || '#ff2a22';
    const r = parseInt(col.slice(1, 3), 16);
    const g = parseInt(col.slice(3, 5), 16);
    const bl = parseInt(col.slice(5, 7), 16);
    const thick = b.thick || 1; // boss beams are fatter
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // Outer glow.
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + bl + ',' + (alpha * 0.50).toFixed(3) + ')';
    ctx.lineWidth = 7 * thick;
    ctx.beginPath();
    ctx.moveTo(p1.x, y1); ctx.lineTo(p2.x, y2);
    ctx.stroke();
    // Bright core.
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + bl + ',' + alpha.toFixed(3) + ')';
    ctx.lineWidth = 2.2 * thick;
    ctx.beginPath();
    ctx.moveTo(p1.x, y1); ctx.lineTo(p2.x, y2);
    ctx.stroke();
    // White hairline through the centre.
    ctx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.95).toFixed(3) + ')';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(p1.x, y1); ctx.lineTo(p2.x, y2);
    ctx.stroke();
    ctx.restore();
  }

  // A bursting fat-chicken explosion — drawn as the white melee-swing ring.
  function drawBlast(b) {
    const p = worldToScreen(b.x, b.y);
    drawMeleeArc(p.x, p.y + TILE_H / 2, 0, true, b.life - b.t, 1.8, b.col || '#ffffff');
  }

  // World-space offset from the tent to the fire pit — one tile forward in
  // both axes, so the fireplace sits on the camp's front-facing diamond
  // (away from the tent) instead of right under the canvas.
  const CAMP_FIRE_DX = 0.9;
  const CAMP_FIRE_DY = 0.9;
  function campFireWorld(camp) {
    return { x: camp.x + CAMP_FIRE_DX, y: camp.y + CAMP_FIRE_DY };
  }

  // Tent half of the camp — drawn at the camp's own depth so hunters orbiting
  // behind it can layer correctly. The fire pit is rendered separately at its
  // own (further-forward) depth via drawHuntersCampFire.
  function drawHuntersCampTent(camp, lit) {
    drawShadow(camp.x, camp.y, 0.9);
    if (!lit) return; // extinct camps lose the tent entirely
    const p = worldToScreen(camp.x, camp.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    const apexX = cx - 2, apexY = cy - 22;        // peak shifted slightly left for perspective
    const baseLeft  = { x: cx - 16, y: cy + 4 };
    const baseRight = { x: cx + 14, y: cy + 4 };
    const ridgeBack = { x: cx + 10, y: cy - 14 }; // back ridge point — implies depth
    // Right-side panel (darker, in shadow) — the second visible face.
    ctx.fillStyle = '#6a4a28';
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(baseRight.x, baseRight.y);
    ctx.lineTo(ridgeBack.x, ridgeBack.y);
    ctx.closePath();
    ctx.fill();
    // Front panel — the lit face.
    ctx.fillStyle = '#b89466';
    ctx.beginPath();
    ctx.moveTo(baseLeft.x, baseLeft.y);
    ctx.lineTo(baseRight.x, baseRight.y);
    ctx.lineTo(apexX, apexY);
    ctx.closePath();
    ctx.fill();
    // Edge lines around both panels for a clean silhouette.
    ctx.strokeStyle = '#5a3a1c';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(baseLeft.x, baseLeft.y);
    ctx.lineTo(apexX, apexY);
    ctx.lineTo(baseRight.x, baseRight.y);
    ctx.lineTo(ridgeBack.x, ridgeBack.y);
    ctx.lineTo(apexX, apexY);
    ctx.stroke();
    // Tent flap.
    ctx.fillStyle = '#5a3a1c';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 3, cy + 4);
    ctx.lineTo(cx - 1, cy - 10);
    ctx.closePath();
    ctx.fill();
  }

  // Fire pit half of the camp — stones, logs, flames or ashes. Drawn at the
  // fire's forward world position so it depth-sorts in front of the tent.
  function drawHuntersCampFire(camp, lit) {
    const fire = campFireWorld(camp);
    drawShadow(fire.x, fire.y, 0.5);
    const p = worldToScreen(fire.x, fire.y);
    const cx = p.x, cy = p.y + TILE_H / 2;
    // Stone ring — six little ovals laid around the pit.
    const stoneR = 8;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + 0.3;
      const sx = cx + Math.cos(a) * stoneR;
      const sy = cy + 2 + Math.sin(a) * stoneR * 0.45;
      ctx.fillStyle = '#888a8c';
      ctx.beginPath();
      ctx.ellipse(sx, sy, 2.6, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a5c5e';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 1, 2.6, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pit floor — charred earth.
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Crossed logs in the pit.
    ctx.strokeStyle = lit ? '#5a3a1c' : '#3a2a1a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 3); ctx.lineTo(cx + 4, cy + 1);
    ctx.moveTo(cx - 4, cy + 1); ctx.lineTo(cx + 4, cy + 3);
    ctx.stroke();
    if (lit) {
      // Active flames — a flickering double-triangle bound to wall-clock time.
      const flick = 1 + Math.sin(performance.now() * 0.012) * 0.18;
      ctx.fillStyle = '#ff8a2a';
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy + 1);
      ctx.lineTo(cx, cy - 5 * flick);
      ctx.lineTo(cx + 3, cy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(cx - 1.5, cy + 1);
      ctx.lineTo(cx, cy - 3 * flick);
      ctx.lineTo(cx + 1.5, cy + 1);
      ctx.closePath();
      ctx.fill();
    } else {
      // Cold ashes — a pale grey blot where the flames used to be.
      ctx.fillStyle = '#6a6862';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 1, 3, 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // On the guest, `r.coop` isn't a live reference — we rely on the synced
  // `coopLevel` field. Host has both.
  function rooftopperCoopLevel(r) {
    return (r.coop && r.coop.level) || r.coopLevel || 0;
  }
  // Screen Y of a rooftopper's feet once they've been lifted onto the roof
  // peak — the anchor the whole sprite is built off. Shared so anything that
  // has to line up with the sniper (the night-vision goggles) reads the same
  // number instead of carrying its own guess at the roof height.
  const ROOFTOP_WALL_H = 22, ROOFTOP_ROOF_H = 16; // same scale numbers drawCoop uses
  function rooftopperFeetY(r, cy) {
    const floors = rooftopperCoopLevel(r) + 1;
    return cy - (floors * ROOFTOP_WALL_H + ROOFTOP_ROOF_H * 0.55) + 10;
  }

  // A rooftopper — a full-size hunter silhouette perched on the coop roof
  // with a long sniper rifle. The rifle rotates to track whatever the
  // sniper is aiming at (r.aimDir is the SCREEN-space angle to the target,
  // same trick the ranged wolf uses for its laser cannon).
  function drawRooftopper(r) {
    const coopLvl = rooftopperCoopLevel(r);
    const p = worldToScreen(r.x, r.y);
    const cx = p.x;
    const cy = p.y + TILE_H / 2;
    // Shift the keeper's local "feet line" up so the body sits on the roof
    // peak. The rest of the sprite mirrors drawHunter's proportions so the
    // rooftopper reads as the same size as a ground-level hunter.
    const feetY = rooftopperFeetY(r, cy);
    const baseCD = ROOFTOP_BASE_COOLDOWN + coopLvl * ROOFTOP_DELAY_PER_FLOOR;
    const recoil = (r.fireT > 0 && r.fireT > baseCD - 0.16) ? -1 : 0;
    const facingLeft = r.facingLeft;
    ctx.save();
    // Match the hunter sprite scale so they read as the same size.
    const HUNTER_SCALE = 0.88;
    ctx.translate(cx, feetY);
    ctx.scale(HUNTER_SCALE, HUNTER_SCALE);
    ctx.translate(-cx, -feetY);
    // Tumbling fall after a missile knocks the sniper off the roof.
    if (r.falling) {
      ctx.translate(0, r.fallY || 0);
      ctx.translate(cx, cy);
      ctx.rotate(r.fallRot || 0);
      ctx.translate(-cx, -cy);
    }
    if (facingLeft) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    // Rooftoppers are always in a crouch — the sniper is set up on the
    // roof peak, knees bent for stability. `crouchYAdd` lowers the upper
    // body and the legs render as a bent-knee pose like the keeper's.
    const crouchYAdd = 6;
    // Body / coat — same olive coat the snipers wear; recoil dips the torso.
    const coatColor = '#3e5a2c';
    ctx.fillStyle = coatColor;
    roundedRect(cx - 7, feetY - 25 + crouchYAdd + recoil, 14, 17, 3);
    // Head.
    ctx.fillStyle = '#e6c69a';
    ctx.beginPath();
    ctx.arc(cx, feetY - 30 + crouchYAdd + recoil, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // Olive boonie cap on top — wider brim than a regular hunter hat to
    // sell the camouflage sniper look.
    ctx.fillStyle = '#2a3a18';
    ctx.beginPath();
    ctx.ellipse(cx, feetY - 34 + crouchYAdd + recoil, 9, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 4, feetY - 38 + crouchYAdd + recoil, 8, 4);
    // Kneeling stance — back knee on the roof, front foot planted forward.
    // Same silhouette the keeper uses for Last Stand so the two read as the
    // same pose family.
    const hipY = feetY - 8 + crouchYAdd + recoil;
    const footY = feetY - 2;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 3, hipY); ctx.lineTo(cx - 7, footY - 4); ctx.lineTo(cx - 4, footY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 3, hipY); ctx.lineTo(cx + 4, footY); ctx.lineTo(cx + 1, footY);
    ctx.stroke();
    ctx.fillStyle = '#101015';
    ctx.fillRect(cx - 6, footY - 0.5, 4, 2);
    ctx.fillRect(cx,     footY - 0.5, 4, 2);
    // Sniper rifle — rotated to face the aim. Mounts at the shoulder level.
    // Unmirror locally so the screen-space aimDir applies cleanly even when
    // the body is facing left, matching the ranged-wolf treatment.
    ctx.save();
    if (facingLeft) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    const shoulderY = feetY - 18 + crouchYAdd + recoil;
    ctx.translate(cx, shoulderY);
    ctx.rotate(r.aimDir || 0);
    // Chunky shotgun — same silhouette as the keeper's gun, just mounted on
    // the bipod with a scope. Wooden stock behind the shoulder.
    ctx.fillStyle = '#6b3f1e';
    ctx.fillRect(-7, -1.8, 6, 3.6);
    // Receiver / grip (dark metal).
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(-2, -2.2, 5, 4.4);
    // Thick dark barrel.
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(3, -1.6, 19, 3.2);
    // Wooden fore-end / pump under the barrel near the receiver.
    ctx.fillStyle = '#6b3f1e';
    ctx.fillRect(4, -1.0, 8, 2.6);
    // Muzzle cap.
    ctx.fillStyle = '#1a1a1e';
    ctx.fillRect(20.5, -1.8, 2, 3.6);
    // Scope on top of the receiver.
    ctx.fillStyle = '#2c2c30';
    ctx.fillRect(1, -4.4, 6, 2.2);
    ctx.fillStyle = '#7ecbff';
    ctx.fillRect(6.6, -4.0, 0.9, 1.4);
    // Bipod legs near the muzzle.
    ctx.strokeStyle = '#1a1a1e';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(17, 1.4);
    ctx.lineTo(15.5, 4.2);
    ctx.moveTo(17, 1.4);
    ctx.lineTo(19, 4.2);
    ctx.stroke();
    // Muzzle flash a few frames after firing.
    if (r.fireT > baseCD - 0.12) {
      ctx.fillStyle = 'rgba(255,220,80,0.9)';
      ctx.beginPath();
      ctx.arc(23, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    // A very thin targeting laser from the muzzle to whatever it's focusing on.
    if (r.aiming) {
      const ad = r.aimDir || 0;
      const MZ = 22 * HUNTER_SCALE;
      const muzX = cx + Math.cos(ad) * MZ;
      const muzY = feetY + (-12 + Math.sin(ad) * 22) * HUNTER_SCALE;
      const tp = worldToScreen(r.targetX, r.targetY);
      const tgX = tp.x, tgY = tp.y + TILE_H / 2 - 8;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,70,60,0.5)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(muzX, muzY);
      ctx.lineTo(tgX, tgY);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,90,80,0.85)';
      ctx.beginPath();
      ctx.arc(tgX, tgY, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // A hunter — keeper-shaped silhouette in a wide-brim hat. Coat tint and the
  // shotgun barrel vary by weapon (shotgun / mg / double-barrel). Flashes red
  // after a hit; lays flat on death.
  function drawHunter(h) {
    drawShadow(h.x, h.y, 0.30);
    const p = worldToScreen(h.x, h.y);
    const cx = p.x;
    const bob = Math.sin(h.walkT || 0) * 1.0;
    const cy = p.y + TILE_H / 2 + bob;
    const hurt = h.hurtT > 0;
    const weapon = h.weapon || 'shotgun';
    const coatColor = weapon === 'mg' ? '#3e5a2c'           // olive
                    : weapon === 'minigun' ? '#2e4a20'      // deep olive
                    : weapon === 'doubleBarrel' ? '#7a2a22' // dark red
                    : weapon === 'rocket' ? '#6a3a18'       // burnt orange-brown
                    : weapon === 'laser' ? '#2a4a5a'        // teal
                    : weapon === 'homing' ? '#4a2a5a'       // purple
                    :                              '#7a4a22'; // brown
    ctx.save();
    // Render hunters a touch smaller than the keeper, scaled around the feet.
    // Increased slightly so hunters appear a bit larger.
    const HUNTER_SCALE = 0.88;
    ctx.translate(cx, cy);
    ctx.scale(HUNTER_SCALE, HUNTER_SCALE);
    ctx.translate(-cx, -cy);
    // Death topple — rotate the whole sprite flat about the feet, like a keeper.
    const downed = !!h.dying;
    if (downed) {
      const f = Math.min(1, (h.downT || 0) / HUNTER_FALL_DUR);
      const ease = 1 - (1 - f) * (1 - f);
      const pivX = cx, pivY = cy - 2;
      ctx.translate(pivX, pivY);
      ctx.rotate(ease * 1.48);
      ctx.translate(-pivX, -pivY);
    }
    // Taunt — a cheeky hip-shake while heckling a nearby keeper.
    if ((h.tauntT || 0) > 0) {
      const tt = HUNTER_TAUNT_DUR - h.tauntT;
      const sway = Math.sin(tt * 18) * 0.22;
      ctx.translate(cx, cy);
      ctx.rotate(sway);
      ctx.translate(-cx, -cy);
    }
    if (h.facingLeft) {
      ctx.translate(cx, 0);
      ctx.scale(-1, 1);
      ctx.translate(-cx, 0);
    }
    // Snipers drop into a one-knee Last Stand firing pose once combat is on;
    // between waves they relax and stand at ease on the normal peg legs (and
    // they always stand when fleeing camp or mid-topple).
    const inCombat = waveActive || bossWaveActive;
    const kneel = inCombat && !huntersLeavePending && !downed;
    const crouchYAdd = kneel ? 6 : 0;
    ctx.fillStyle = hurt ? '#7a1a1a' : '#222';
    if (kneel) {
      const hipY = cy - 8 + crouchYAdd;
      const footY = cy - 2;
      ctx.strokeStyle = hurt ? '#7a1a1a' : '#222';
      ctx.lineWidth = 3.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 3, hipY); ctx.lineTo(cx - 7, footY - 4); ctx.lineTo(cx - 4, footY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 3, hipY); ctx.lineTo(cx + 4, footY); ctx.lineTo(cx + 1, footY);
      ctx.stroke();
      ctx.fillStyle = '#101015';
      ctx.fillRect(cx - 6, footY - 0.5, 4, 2);
      ctx.fillRect(cx,     footY - 0.5, 4, 2);
    } else {
      ctx.fillRect(cx - 5, cy - 10, 3, 8);
      ctx.fillRect(cx + 2, cy - 10, 3, 8);
    }
    // Body / coat — same rounded-belly format as the player.
    ctx.fillStyle = hurt ? '#ff5555' : coatColor;
    roundedRect(cx - 7, cy - 25 + crouchYAdd, 14, 17, 3);
    // Head.
    ctx.fillStyle = hurt ? '#ff8a8a' : '#e6c69a';
    ctx.beginPath();
    ctx.arc(cx, cy - 30 + crouchYAdd, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // Hat — wide-brim by default. At MAX gear (tier 5) only the FEW hunters
    // flagged with a sombrero wear the big domed one; the rest keep the brim.
    if (hunterPowerLvl() >= 5 && h.sombrero) {
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();                                 // wide sombrero brim
      ctx.ellipse(cx, cy - 33 + crouchYAdd, 14, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 4, cy - 41 + crouchYAdd, 8, 8); // tall crown
      ctx.beginPath();                                 // domed top
      ctx.ellipse(cx, cy - 41 + crouchYAdd, 4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#caa24a';                       // decorative band
      ctx.fillRect(cx - 4, cy - 35.4 + crouchYAdd, 8, 1.5);
    } else {
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 34 + crouchYAdd, 9, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 3.5, cy - 39 + crouchYAdd, 7, 5);
    }
    // Gun — barrel style varies per weapon variant.
    const facingMul = h.facingLeft ? -1 : 1;
    const ang = (h.dir || 0) * facingMul;
    ctx.save();
    ctx.translate(cx, cy - 16 + crouchYAdd);
    ctx.rotate(ang);
    // Stock
    ctx.fillStyle = '#5a3a1c';
    ctx.fillRect(0, -1.5, 4, 3);
    if (weapon === 'mg') {
      // Longer, thinner barrel + a small magazine drop.
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(2, -1, 16, 2);
      ctx.fillRect(7, 1, 3, 4);
    } else if (weapon === 'minigun') {
      // Stubby multi-barrel block.
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(2, -2, 14, 4);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(4, -2, 1, 4);
      ctx.fillRect(8, -2, 1, 4);
      ctx.fillRect(12, -2, 1, 4);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(7, 2, 3, 4); // mag
    } else if (weapon === 'doubleBarrel') {
      // Two stacked barrels, slightly thicker.
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(2, -2.5, 12, 2);
      ctx.fillRect(2,  0.5, 12, 2);
    } else if (weapon === 'rocket') {
      // Fat launcher tube with a dark mouth + red band.
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(2, -3, 13, 6);
      ctx.fillStyle = '#d83b2a';
      ctx.fillRect(3, -3, 2, 6);
      ctx.fillStyle = '#1d1d22';
      ctx.beginPath();
      ctx.arc(15, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (weapon === 'laser') {
      // A player-style gun (wooden fore-end + dark barrel) firing a beam, with
      // a glowing blue emitter at the muzzle — reads like the keeper's laser.
      ctx.fillStyle = '#6b3f1e';                 // wooden fore-end
      ctx.fillRect(2, -1.4, 7, 2.8);
      ctx.fillStyle = '#2b2b2b';                 // dark barrel
      ctx.fillRect(8, -1, 11, 2);
      ctx.fillStyle = 'rgba(126,203,255,0.5)';   // muzzle glow halo
      ctx.beginPath(); ctx.arc(19.5, 0, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7ecbff';                 // bright emitter core
      ctx.beginPath(); ctx.arc(19.5, 0, 2.0, 0, Math.PI * 2); ctx.fill();
    } else if (weapon === 'homing') {
      // Boxy launcher + a little antenna.
      ctx.fillStyle = '#3a2a44';
      ctx.fillRect(2, -2, 12, 4);
      ctx.strokeStyle = '#b06fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(6, -2); ctx.lineTo(6, -6);
      ctx.stroke();
      ctx.fillStyle = '#b06fff';
      ctx.beginPath();
      ctx.arc(6, -6.5, 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Standard shotgun.
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(2, -1, 12, 2);
    }
    ctx.restore();
    ctx.restore();
    // Taunt flourish — just a little waving hand and a jeer mark over the head.
    if ((h.tauntT || 0) > 0) {
      const tt = HUNTER_TAUNT_DUR - h.tauntT;
      ctx.save();
      ctx.fillStyle = hurt ? '#ff8a8a' : '#e6c69a';
      ctx.beginPath();
      ctx.arc(cx + 9 + Math.sin(tt * 20) * 2.2, cy - 33, 2.4, 0, Math.PI * 2); // waving hand
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#ffd24a';
      ctx.textAlign = 'center';
      ctx.fillText('!', cx, cy - 40 + Math.sin(tt * 12));
      ctx.restore();
    }
    // Health is readable up close without cluttering distant allies.
    if (!downed && allyReadoutVisible(h)) {
      drawAllyPips(cx, cy - 45, h.maxHp || HUNTER_HP, h.hp);
    }
  }

  function drawCorpse(c) {
    const p = worldToScreen(c.x, c.y);
    const alpha = clamp(c.t / 4, 0, 1);
    ctx.globalAlpha = alpha;
    // Brief red flash right after death — the killing-blow "flick".
    const maxT = c.kind === 'chicken' ? 4 : 5;
    const fresh = c.t > maxT - 0.18;
    if (c.kind === 'chicken') {
      // Cold Shot kills leave a frosty-blue carcass; Hot Shot kills leave a
      // golden-brown fried chicken (with little grill marks). Otherwise plain.
      const bodyCol = fresh ? '#ff5555' : c.frost ? '#bfe0f2' : c.fried ? '#c98a3a' : '#e0e0e0';
      ctx.fillStyle = bodyCol;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + TILE_H/2 - 2, 8, 4, 0, 0, Math.PI*2);
      ctx.fill();
      if (!fresh && c.fried) {
        // Grill marks + a couple of drumstick nubs to sell the "fried" gag.
        ctx.strokeStyle = '#7a4a16';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x - 5, p.y + TILE_H/2 - 4); ctx.lineTo(p.x + 5, p.y + TILE_H/2 - 1);
        ctx.moveTo(p.x - 5, p.y + TILE_H/2 - 1); ctx.lineTo(p.x + 5, p.y + TILE_H/2 + 2);
        ctx.stroke();
        ctx.fillStyle = '#b87a2e';
        ctx.beginPath(); ctx.arc(p.x - 7, p.y + TILE_H/2 - 2, 1.8, 0, Math.PI*2);
        ctx.arc(p.x + 7, p.y + TILE_H/2 - 2, 1.8, 0, Math.PI*2); ctx.fill();
      } else {
        // Feathers — frosty white-blue for a chilled bird, white otherwise.
        ctx.fillStyle = fresh ? '#ffb3b3' : c.frost ? '#e6f4fc' : '#fff';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(p.x + (i-1)*5, p.y + TILE_H/2 - 6, 1.5, 0, Math.PI*2);
          ctx.fill();
        }
      }
    } else if (c.kind === 'fox') {
      ctx.fillStyle = fresh ? '#ff5555' : '#c25a1a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + TILE_H/2 - 2, 8, 3.5, 0, 0, Math.PI*2);
      ctx.fill();
    } else if (c.kind === 'hunter') {
      // Hunter body flat on the ground, brim of the hat off to one side.
      ctx.fillStyle = fresh ? '#ff5555' : '#5a3a1c';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + TILE_H/2 - 2, 11, 4.5, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.ellipse(p.x + 10, p.y + TILE_H/2 - 2, 5, 1.6, 0, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.fillStyle = fresh ? '#ff5555' : '#3a3a42';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + TILE_H/2 - 2, 13, 5, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Drop the current run and return to the title menu. Tears down any MP
  // connection, restores the ambient demo, and resets per-run state so the
  // next pick starts cleanly.
  // Restart the current run without showing the menu — bound to F5 on the
  // game-over screen. Multiplayer can't restart cleanly (peer is gone /
  // buddy would need their own restart), so it falls back to quitToMenu.
  // Per-run state reset — drops gun progress, hats, money, etc. back to the
  // first-wave defaults. Called by both quitToMenu (then surface the menu)
  // and the MP restart path (which keeps the peer connection alive).
  function resetRunState() {
    // Invalidate any in-flight spawn timeouts from the previous run.
    runGen++;
    pendingSpawns = 0;
    pendingNinjaReturn = null;
    // Wave scheduling is reset here too (belt-and-suspenders with resetWorld):
    // a fresh run must always let waves auto-start again. In particular
    // waveAutoStartPaused is a debug toggle that otherwise persists across every
    // restart — leaving it on would silently block waves after a boss restart.
    waveAutoStartPaused = false;
    waveActive = false;
    waveTimer = 12;
    paused = false;
    upgradeMode = false;
    upgradeOptions = [];
    upgradeOptions2 = [];
    upgradeOptions2Seq++;  // a fresh run is a fresh deal
    p2PickSentSeq = -1;
    upgradePicked = false;
    upgradePicked2 = false;
    upgradeDelayT = 0;
    gameOver = false;
    gameOverMsg = '';
    gameOverCause = '';
    gameOverPanelDelayT = 0;
    buildMode = false;
    buildType = 0;
    player.buildMode = false;
    player.buildType = 0;
    player.ghost = false;
    player2.ghost = false;
    player.dying = false; player.downT = 0;
    player2.dying = false; player2.downT = 0;
    // New-game-plus doubling from beating the boss (2^tier). Hats and money
    // double each loop; barrel uses a milder +30% per tier so the gun doesn't
    // become absurdly huge on high-tier runs.
    const bonusMul = Math.pow(2, restartBonusTier);
    barrelBonusMul = 1 + 0.3 * restartBonusTier;
    passedBoss = false; // fresh run hasn't passed the boss yet
    playerHats = START_HATS * bonusMul;
    hatColors.length = 0;
    for (let i = 0; i < playerHats; i++) hatColors.push('#5a3825');
    player.hurtT = 0;
    player.jamT = 0;
    player.jamFlashT = 0;
    player.critSpeedT = 0;
    player.dashT = 0; player.dashCd = 0; player.dashQueued = false;
    player.reloadT = 0;
    player.meleeT = 0;
    player.spinT = 0;
    player.runT = 0;
    chambered = true;
    shells = 1;
    reloadingT = 0;
    ammo = 0;
    magDumpLeft = 0;
    cancelReloadMinigame();
    player.magDumpRocket = false;
    player2.magDumpRocket = false;
    jamStreak = 0;
    critStreak = 0;
    player2.critStreak = 0;
    player.skillCheckActive = false;
    player.skillCheckT = 0;
    player.skillCheckLockoutT = 0;
    player.flightT = 0; player.flightPartT = 0;
    player.lastStandIdleT = 0; player.lastStandNoShootT = 0; player.lastStandStealth = false;
    player2.flightT = 0; player2.flightPartT = 0;
    player2.lastStandIdleT = 0; player2.lastStandNoShootT = 0; player2.lastStandStealth = false;
    player2.skillCheckActive = false;
    player2.skillCheckT = 0;
    player2.skillCheckLockoutT = 0;
    karma = 0;
    player.karma = 0;
    player2.karma = 0;
    player2.hatColors = [];
    player.transcendentKarma = false; player.transcendStandT = 0;
    player.lastKarmaRescueWave = null;
    player2.transcendentKarma = false; player2.transcendStandT = 0;
    player2.lastKarmaRescueWave = null;
    player2.chickensKilledThisWave = 0;
    player.bulletHitT = 0;
    player2.bulletHitT = 0;
    player.kills = 0;
    player.deaths = 0;
    player2.kills = 0;
    player2.deaths = 0;
    player.chickensShot = 0;
    player2.chickensShot = 0;
    // NOTE: player.mustache / player2.mustache are intentionally NOT reset —
    // the FANGUS-kill mustache (and each keeper's count) is kept across restarts,
    // so beating the boss as one keeper never wipes the other's progress.
    // Each restart a keeper's surviving mustache ages one notch (greys a little).
    if ((player.mustache || 0) > 0) player.mustacheAge = (player.mustacheAge || 0) + 1;
    if ((player2.mustache || 0) > 0) player2.mustacheAge = (player2.mustacheAge || 0) + 1;
    player.danceT = 0; player.danceAnimT = 0;
    wdWStamps.length = 0; wdDStamps.length = 0;
    player.deathCause = '';
    player2.deathCause = '';
    hatPrice = 5;
    hatsBought = 0;
    hatPrice = 5;
    revivePrice = 10;
    firstReviveFree = true;
    hatPackPrice = 100;
    swordWolfSlain = false;
    swordWolfAppeared = false;
    chickensKilledByPlayer = 0;
    chickensShotByRobots = 0;
    chickensAtWaveStart = 0;
    chickensBornThisWave = 0;
    chickenDeathsThisWave = 0;
    bonusUpgradeAvailable = false;
    bonusUpgradeShownThisWave = false;
    bonusUpgradeForce = false;
    extraPickUsedThisWave = false;
    extraPickUsedThisWave2 = false;
    bonusDeathSnapshot = 0;
    weaponOilCharges = 0;
    weaponOilWaves = 0;
    weaponOilBought = 0;
    advancedOilWaves = 0;
    advancedOilBought = 0;
    bribePrice = 300;
    bribeNextWaveMul = 1;
    bribeFollowWaveMul = 1;
    wolfLevelCap = 0;
    dogGen = 1;
    everReachedHunterGold = false;
    huntersCamps = [];
    hunters.length = 0;
    huntersGroups = 0;
    huntersLeavePending = false;
    extinctCamp = null;
    nightOfWolf = false;
    nightOfWolfCount = 0;
    nightOfWolfDebugForce = false;
    weather = '';
    rainDrops.length = 0;
    snowFlakes.length = 0;
    for (const k in weatherEvents) {
      weatherEvents[k].count = 0;
      weatherEvents[k].blockStart = -1;
      weatherEvents[k].nextWave = -1;
      weatherEvents[k].lastWave = -5;
      weatherEvents[k].force = false;
    }
    _tileColorCache.clear(); // drop any snowed-over tiles
    resurrectCount = 0;
    resurrectLastWave = -99;
    bossWaveActive = false; bossPhase = ''; bossPhaseT = 0; bossSidesDone = 0;
    boss = null; bossTint = 0; endScreen = false;
    nightEvent.blockStart = -1;
    nightEvent.nextWave = -1;
    nightEvent.lastWave = -5;
    enemyIntroToastShown.fox = false;
    enemyIntroToastShown.bomb = false;
    enemyIntroToastShown.breeder = false;
    enemyIntroToastShown.ranged = false;
    enemyIntroToastShown.homer = false;
    enemyIntroToastShown.thing = false;
    enemyIntroToastShown.parachute = false;
    enemyIntroToastShown.hunterwolf = false;
    lastHunterWolfWave = -100;
    // Reset upgrade ladders + derived stats so guns match level 0 again.
    for (const k in upgradeLevels) upgradeLevels[k] = 0;
    for (const k in upgradeLevels2) upgradeLevels2[k] = 0;
    money = 20 * bonusMul;  // both wallets reset on restart (scaled by the boss bonus)
    money2 = 20 * bonusMul;
    shotgunLife = 0.30;
    shotgunCooldown = 0.75;
    shotgunSpread = 10 * Math.PI / 180;
    pelletCount = 4;
    wolfFocusChance = 0.50;
    wolfRushSpeed = 1.0;
    recomputeJamChance();
    player.speed = 4.0;
  }

  // F5 path. In multiplayer it broadcasts a 'restart' beat to the buddy
  // so both clients clear their state and start a fresh game in the same
  // lobby (no peer teardown, no menu detour). Single-player falls back to
  // quitToMenu + startGame(false).
  // ---- Post-boss "rocket launch" restart cutscene ----
  // After beating the wave-50 boss, restarting doesn't reset instantly: the
  // biggest coop turns into a rocket and blasts off. Once it clears the screen
  // the run actually restarts (with the doubled new-game-plus bonus).
  function beginRocketCutscene(onDone) {
    let best = null;
    for (const c of coops) if (!best || (c.level || 0) > (best.level || 0)) best = c;
    if (!best) { onDone(); return; } // no coop to launch — restart immediately
    best.launching = true; // this coop IS the rocket — the world pass hides it so
                           // drawRocketLaunch can re-draw it climbing skyward
    // Knock any rooftopper off the launching coop — it falls with a scream.
    for (const r of rooftoppers) {
      if (r.alive && !r.falling && r.coop === best) {
        r.falling = true; r.fallT = 0; r.fallVy = 0; r.fallY = 0; r.fallRot = 0;
        r.fallSpin = Math.random() < 0.5 ? -1 : 1; r.aiming = false;
        playWilhelm();
      }
    }
    endScreen = false; // drop the overlay so the launch is visible
    rocketLaunch = { coop: best, t: 0, riseY: 0, vy: 0, smokeT: 0, onDone };
    playRocketWhoosh();
  }

  // Fast black screen wipe: fade to black, run onBlack() at full black (where
  // the world is swapped), then fade back in. Ticks even while the sim is frozen.
  // `dur` overrides the default half-length for a slower, weightier wipe.
  function startBlackFade(onBlack, dur) {
    fade = { t: 0, dur: dur || 0.22, phase: 'out', onBlack: onBlack || null };
  }
  function updateFade(dt) {
    if (!fade) return;
    fade.t += dt;
    if (fade.t < fade.dur) return;
    if (fade.phase === 'out') {
      if (fade.onBlack) { const cb = fade.onBlack; fade.onBlack = null; cb(); } // swap worlds at full black
      fade.phase = 'in';
      fade.t = 0;
    } else {
      fade = null; // fully revealed again
    }
  }
  function drawFade() {
    if (!fade) return;
    const a = fade.phase === 'out' ? (fade.t / fade.dur) : (1 - fade.t / fade.dur);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + clamp(a, 0, 1) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function updateRocketLaunch(dt) {
    const rl = rocketLaunch;
    if (!rl) return;
    rl.t += dt;
    // A longer, dramatic ignition hold: the coop sits on the pad rumbling and
    // belching smoke while the shake builds, THEN it roars off the screen.
    const HOLD = 1.6;
    if (rl.t > HOLD) {
      if (!rl.lifted) { rl.lifted = true; playRocketWhoosh(); shake = Math.max(shake, 0.95); } // liftoff kick
      rl.vy += dt * 105; rl.riseY += rl.vy * dt; // stronger thrust than before
    }
    rl.smokeT -= dt;
    if (rl.smokeT <= 0 && rl.coop) {
      // Smoke billows hard during the hold, thinning once it clears the pad.
      rl.smokeT = rl.t < HOLD ? 0.025 : 0.045;
      spawnSmoke(rl.coop.x + rand(-1.5, 1.5), rl.coop.y + rand(-0.5, 0.8), rl.t < HOLD ? 6 : 4);
    }
    updateSmoke(dt); // keep the launch smoke alive while the sim is frozen
    // Shake ramps up through the hold and peaks at liftoff.
    const holdFrac = Math.min(1, rl.t / HOLD);
    shake = Math.max(shake, rl.t > HOLD ? 0.7 : 0.22 + holdFrac * 0.4);
    if (rl.riseY > H + 260) {
      if (rl.coop) rl.coop.launching = false;
      rocketLaunch = null;
      playNightOfWolfEnd(); // a departing sting
      rl.onDone();
    }
  }

  function drawRocketLaunch() {
    const rl = rocketLaunch;
    if (!rl || !rl.coop) return;
    const p = worldToScreen(rl.coop.x, rl.coop.y);
    const bx = p.x;
    const by = p.y + TILE_H / 2 - rl.riseY; // base of the coop, rising up
    // Engine flame + exhaust roaring out from UNDER the coop (flickers). It only
    // ignites in the last stretch of the hold — before that the pad just rumbles
    // and smokes. The coop itself is the rocket; no separate ship.
    if (rl.t > 1.1) {
      ctx.save();
      const flick = 1 + Math.random() * 0.6;
      const fw = TILE_W * 0.55;
      ctx.fillStyle = 'rgba(255,150,30,0.9)';
      ctx.beginPath();
      ctx.moveTo(bx - fw, by); ctx.lineTo(bx, by + (44 + 26 * flick)); ctx.lineTo(bx + fw, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,70,0.92)';
      ctx.beginPath();
      ctx.moveTo(bx - fw * 0.62, by); ctx.lineTo(bx, by + (28 + 16 * flick)); ctx.lineTo(bx + fw * 0.62, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,244,180,0.95)';
      ctx.beginPath();
      ctx.moveTo(bx - fw * 0.3, by); ctx.lineTo(bx, by + (16 + 9 * flick)); ctx.lineTo(bx + fw * 0.3, by); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // The selected coop, lifted by rl.riseY, drawn on top of its own exhaust.
    drawCoop(rl.coop, false, rl.riseY);
  }

  // Central restart entry — after the boss, single-player plays the rocket
  // cutscene first (then restarts with the doubled bonus); otherwise restart now.
  function requestRestart() {
    if (rocketLaunch) return; // cutscene already running
    // Captured now, before any reset wipes the money. Two carry flavours:
    // post-boss (win) runs keep the flat 0.1% of the wallet; a death-screen
    // restart instead carries 1% of everything earned during the run.
    pendingCarryMoney = passedBoss
      ? Math.floor(money * 0.001)
      : Math.floor(runMoneyEarned * RESTART_CARRY_PCT);
    // Silent extra on a death-restart: half the barrel length you'd earned.
    pendingCarryRange = passedBoss ? 0 : Math.floor((upgradeLevels.range || 0) / 2);
    if (passedBoss) {
      // Coop blasts off, then a fast black wipe swaps in the fresh run. Kill any
      // wave-cleared / upgrade overlay up front so it can never flash during the
      // launch or wipe (the wipe also freezes the sim, and resetRunState clears
      // these again at the swap). With NO coop there's nothing to animate, so
      // skip the cutscene and go straight to the wipe. In co-op the host drives
      // the cutscene and the guest mirrors it through the snapshot (rocketLaunch
      // + fade are synced), so both keepers watch the launch.
      endScreen = false;
      upgradeMode = false;
      upgradeDelayT = 0;
      bonusUpgradeAvailable = false;
      const launchDone = () => { restartBonusTier++; startBlackFade(() => restartRun()); };
      if (coops.length > 0) beginRocketCutscene(launchDone);
      else launchDone();
      return;
    }
    restartRun();
  }

  function restartRun() {
    if (multiplayer && conn && conn.open) {
      try { conn.send({ type: 'restart', tier: restartBonusTier }); } catch (e) {}
      restartMpGame();
      return;
    }
    quitToMenu();
    startGame(false);
  }

  // Restart the multiplayer run in-place. Keeps the peer/connection alive
  // and re-enters the game as if the guest had just joined. The host's next
  // snapshot will resync everything.
  function restartMpGame() {
    resetRunState();
    // startGame(true) wipes the world, re-spawns both keepers, etc.
    startGame(true);
    toast('Game restarted', 2.4);
  }

  // Quitting mid-run throws the whole run away, and ESC → QUIT is easy to hit
  // by accident, so the first press only arms it: press again within the
  // window to actually leave. Uses a wall-clock deadline rather than a ticking
  // timer because the game is frozen while the pause panel is open.
  let quitArmedUntil = 0;
  const QUIT_CONFIRM_MS = 3000;
  function quitArmed() { return Date.now() < quitArmedUntil; }
  function disarmQuit() { quitArmedUntil = 0; }
  function requestQuitToMenu() {
    if (quitArmed()) { quitArmedUntil = 0; quitToMenu(); return; }
    quitArmedUntil = Date.now() + QUIT_CONFIRM_MS;
    toast('Quit the run? Press again to confirm', QUIT_CONFIRM_MS / 1000);
  }

  function quitToMenu() {
    if (typeof teardownConnection === 'function') teardownConnection();
    multiplayer = false;
    isHost = false;
    netRole = null;
    player2.active = false;
    resetRunState();
    // Wipe the world and stand up the ambient backdrop.
    resetWorld();
    populateMenuDemo();
    // Surface the menu overlay.
    inMenu = true;
    document.body.classList.add('in-menu');
    const menu = document.getElementById('menu');
    if (menu) menu.style.display = '';
    if (typeof showScreen === 'function') showScreen('title');
  }

  // Wipe every entity array + run-progress scalar so a fresh game starts
  // clean after the menu demo (or after a previous session in MP).
  function resetWorld() {
    // Every 10 coops the land expands (expandMap). That growth used to survive
    // a restart, so a new run opened on a sprawling map with the forest border
    // pushed way out. Shrink back to the starting footprint and rebuild the
    // treeline to match.
    if (MAP_SIZE !== MAP_SIZE_DEFAULT) {
      MAP_SIZE = MAP_SIZE_DEFAULT;
      HALF_MAP = MAP_SIZE / 2;
      generateTrees();
    }
    comboKills = 0; comboT = 0; comboFloat = null;
    ghostWolfChance = 0;
    // A scroll still being read when the run ends would hang over the fresh
    // farm. The read-set itself is deliberately NOT cleared — "no repeats" is
    // scoped to the page session, so a new run keeps handing out new hints.
    scrollNote = null; scrollNoteRect = null;
    // Wartime airlift state — crates in the air or on the grass, and the
    // pending war-footing notice.
    supplyCrates.length = 0;
    wartimeNoticeT = 0;
    // Robot allies go with the run, and so does what they learned — training
    // is per-run progress, not a permanent unlock.
    robots.length = 0;
    for (const k in robotTraining) robotTraining[k] = 0;
    coops.length = 0;
    chickens.length = 0;
    bossBurstChickens.length = 0;
    bossSkyFade = 1;
    graves.length = 0;
    wolfScrap.length = 0;
    pendingCarryRange = 0;
    wolves.length = 0;
    pellets.length = 0;
    corpses.length = 0;
    stumps.length = 0;
    twigs.length = 0;
    fences.length = 0;
    farms.length = 0;
    dogs.length = 0;
    debris.length = 0;
    mines.length = 0;
    holes.length = 0;
    scorches.length = 0;
    rooftoppers.length = 0;
    smoke.length = 0;
    blasts.length = 0;
    flyHats.length = 0;
    pendingHatLandings.length = 0;
    p2Cameo = null;
    p2CameoUsed = false;
    radarEmitT = 0;
    beams.length = 0;
    dummies.length = 0;
    statues.length = 0;
    hunters.length = 0;
    huntersCamp = null;
    huntersGroups = 0;
    huntersLeavePending = false;
    extinctCamp = null;
    nightOfWolf = false;
    bossWaveActive = false; bossPhase = ''; bossPhaseT = 0; bossSidesDone = 0;
    boss = null; bossTint = 0; endScreen = false;
    chickenSuckers.length = 0;
    bossMissiles.length = 0;
    player.x = 0;
    player.y = 0;
    player.ghost = false;
    player2.ghost = false;
    player.dying = false; player.downT = 0;
    player2.dying = false; player2.downT = 0;
    hostPaused = false;
    guestWantsRestart = false;
    cancelReloadMinigame();
    // Keep the new-game-plus doubling (2^tier) — resetRunState set the scaled
    // wallet, but resetWorld runs afterwards, so it must match or it would clobber
    // the bonus back to a flat $10. Fresh games have tier 0, so this stays $10.
    money = 20 * Math.pow(2, restartBonusTier);
    money2 = 20 * Math.pow(2, restartBonusTier);
    kills = 0;
    wave = 0;
    waveTimer = 12;
    waveActive = false;
    // Debug wave-pause never carries into a fresh world — otherwise a toggle
    // left on would block every wave for the rest of the session.
    waveAutoStartPaused = false;
    waveElapsed = 0;
    pendingSpawns = 0;
    coopsPlaced = 0;
    pendingMapExpansions = 0;
    upgradeOptions2 = [];
    upgradeOptions2Seq++;
    p2PickSentSeq = -1;
    upgradePicked2 = false;
    for (const k in upgradeLevels2) upgradeLevels2[k] = 0;
  }

  // Menu backdrop is just grass + player — no coops or chickens,
  // so the menu→game transition is seamless with nothing to clear.
  function populateMenuDemo() {}
  populateMenuDemo();

