  // ---------- Upgrade tree overlay ----------
  // Renders SKILL_TREE as a top-down map: one row per unlock wave, connector
  // lines from an upgrade to whatever it branches off, and a live x/y level
  // counter. Reachable from the title menu and from the pause panel, so it
  // doubles as a "what's coming" preview and an in-run progress sheet.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const treeEl     = document.getElementById('skilltree');
  const treeBodyEl = document.getElementById('st-body');
  const treeTiersEl = document.getElementById('st-tiers');
  const treeLinksEl = document.getElementById('st-links');
  const treeCountEl = document.getElementById('st-count');
  // id -> node element, rebuilt on every open so the link pass can measure.
  const treeNodeEls = new Map();

  function skillTreeOpen() { return !!treeEl && treeEl.classList.contains('is-open'); }

  function tierLabel(tier) {
    if (tier <= 1) return 'Wave 1 — From the start';
    if (tier === 51) return 'Wave 51 — Endless';
    return 'Wave ' + tier;
  }

  // What the player is allowed to see: taken, maxed, available now — plus the
  // half of an either/or they gave up, shown greyed so the road not taken is
  // still legible. Wave-gated tiers and unmet prerequisites stay hidden; the
  // tree reports where the run stands, it doesn't preview what's coming.
  // Consumables appear only once one has actually been bought.
  function skillNodeVisible(n) {
    if (n.supply) return !!(n.held && n.held());
    const s = skillNodeState(n);
    return s === 'open' || s === 'owned' || s === 'maxed' || s === 'over' || s === 'pairlocked';
  }

  // One compact card: name, level pips, and MAX when it's finished. No prose —
  // the full description lives in the native tooltip for anyone who wants it.
  function buildSkillCard(n) {
    const state = skillNodeState(n);
    const raw = upgradeLevels[n.id] || 0;   // Longer Barrel can exceed n.max
    const lvl = Math.min(n.max, raw);
    const el = document.createElement('div');
    el.className = 'st-node is-' + state + (n.supply ? ' is-supply' : '');
    el.dataset.id = n.id;
    el.title = n.note;

    const name = document.createElement('div');
    name.className = 'st-node-name';
    name.textContent = skillTitle(n.id);
    el.appendChild(name);

    const foot = document.createElement('div');
    foot.className = 'st-node-foot';
    const tag = (txt) => {
      const s = document.createElement('span');
      s.className = 'st-node-state';
      s.textContent = txt;
      foot.appendChild(s);
    };
    if (n.supply) {
      // No ladder to show — just the live in-game status of the last buy.
      tag(n.held() || '');
    } else {
      const pips = document.createElement('div');
      pips.className = 'st-pips';
      for (let i = 0; i < n.max; i++) {
        const pip = document.createElement('span');
        pip.className = 'st-pip' + (i < lvl ? ' is-on' : '');
        pips.appendChild(pip);
      }
      foot.appendChild(pips);
      // Past the cap the pick is cosmetic only, so the count matters more than
      // the pips — show how many times it's been taken.
      if (state === 'over')            tag('×' + raw);
      else if (state === 'maxed')      tag('MAX');
      else if (state === 'pairlocked') tag('LOCKED');
    }
    el.appendChild(foot);
    treeNodeEls.set(n.id, el);
    return el;
  }

  // A heading plus a row of cards. Returns false when there was nothing to show.
  function buildSkillRow(labelText, subText, nodes, locked) {
    const tierDiv = document.createElement('div');
    tierDiv.className = 'st-tier' + (locked ? ' is-locked' : '');

    const label = document.createElement('div');
    label.className = 'st-tier-label';
    const head = document.createElement('span');
    head.textContent = labelText;
    label.appendChild(head);
    if (subText) {
      const sub = document.createElement('span');
      sub.className = 'st-tier-sub';
      sub.textContent = subText;
      label.appendChild(sub);
    }
    tierDiv.appendChild(label);

    const row = document.createElement('div');
    row.className = 'st-row';
    if (locked) {
      const sealed = document.createElement('div');
      sealed.className = 'st-node st-sealed';
      sealed.textContent = '? ? ?  ' + nodes.length + ' sealed';
      row.appendChild(sealed);
    } else {
      const shown = nodes.filter(skillNodeVisible);
      if (!shown.length) return false;
      for (const n of shown) row.appendChild(buildSkillCard(n));
    }
    tierDiv.appendChild(row);
    treeTiersEl.appendChild(tierDiv);
    return true;
  }

  function buildSkillTree() {
    if (!treeEl) return;
    treeTiersEl.innerHTML = '';
    treeNodeEls.clear();

    treeCountEl.innerHTML = '<b>' + skillTreeOwnedLevels() + '</b> / ' + SKILL_TREE_TOTAL + ' unlocked';

    for (const tier of SKILL_TIERS) {
      const nodes = SKILL_TREE.filter(n => n.tier === tier && !n.group);
      if (!nodes.length) continue;
      // A tier the run hasn't reached stays sealed — a count and a wave, no names.
      const tierLocked = skillTreeWave() < tier;
      const got = nodes.reduce((s, n) => s + (n.supply ? 0 : Math.min(n.max, upgradeLevels[n.id] || 0)), 0);
      const cap = nodes.reduce((s, n) => s + (n.supply ? 0 : n.max), 0);
      buildSkillRow(tierLabel(tier), tierLocked ? '' : got + '/' + cap, nodes, tierLocked);
    }

    // Condition-gated rows (the hunter camp) go last, under their own heading.
    for (const g of SKILL_GROUPS) {
      const nodes = SKILL_TREE.filter(n => n.group === g.key);
      if (!nodes.length) continue;
      const got = nodes.reduce((s, n) => s + (n.supply ? 0 : Math.min(n.max, upgradeLevels[n.id] || 0)), 0);
      const cap = nodes.reduce((s, n) => s + (n.supply ? 0 : n.max), 0);
      buildSkillRow(g.label, got + '/' + cap, nodes, false);
    }

    if (!treeTiersEl.children.length) {
      const empty = document.createElement('div');
      empty.className = 'st-empty';
      empty.textContent = 'No upgrades unlocked yet.';
      treeTiersEl.appendChild(empty);
    }
    // Lines can only be measured once the nodes have been laid out.
    requestAnimationFrame(drawSkillTreeLinks);
  }

  // Position of a node in the scroll container's own coordinate space (the
  // space the absolutely-positioned SVG shares), so lines stay glued to the
  // nodes while the tree scrolls.
  function treeNodeBox(el) {
    const b = treeBodyEl.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      left:   r.left - b.left + treeBodyEl.scrollLeft,
      top:    r.top  - b.top  + treeBodyEl.scrollTop,
      right:  r.right - b.left + treeBodyEl.scrollLeft,
      bottom: r.bottom - b.top + treeBodyEl.scrollTop,
      cx:     (r.left + r.right) / 2 - b.left + treeBodyEl.scrollLeft,
      cy:     (r.top + r.bottom) / 2 - b.top + treeBodyEl.scrollTop,
    };
  }

  function svgLine(d, stroke, width, dash) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', String(width));
    if (dash) p.setAttribute('stroke-dasharray', dash);
    return p;
  }

  function drawSkillTreeLinks() {
    if (!skillTreeOpen()) return;
    treeLinksEl.innerHTML = '';
    // Cover the whole scrollable canvas, not just the visible slice — an SVG
    // clips its children to its own viewport, so anything past this box would
    // be cut off mid-line. Measured from the laid-out content and padded.
    const wide = Math.max(treeBodyEl.scrollWidth || 0, treeTiersEl.offsetWidth || 0) + 40;
    const tall = Math.max(treeBodyEl.scrollHeight || 0, treeTiersEl.offsetHeight || 0) + 80;
    treeLinksEl.setAttribute('width', String(wide));
    treeLinksEl.setAttribute('height', String(tall));
    treeLinksEl.setAttribute('viewBox', '0 0 ' + wide + ' ' + tall);
    treeLinksEl.style.width = wide + 'px';
    treeLinksEl.style.height = tall + 'px';

    // Branch links: parent (earlier tier) down to child. Both ends have to be
    // on screen — a sealed tier renders no cards, so its links are skipped.
    let routed = 0;
    for (const n of SKILL_TREE) {
      if (!n.links) continue;
      const childEl = treeNodeEls.get(n.id);
      if (!childEl) continue;
      const c = treeNodeBox(childEl);
      const childState = skillNodeState(n);
      for (const parentId of n.links) {
        const parentEl = treeNodeEls.get(parentId);
        if (!parentEl) continue;
        const p = treeNodeBox(parentEl);
        const lit = childState === 'owned' || childState === 'maxed';
        const stroke = lit ? '#6fd09a' : 'rgba(255, 209, 102, 0.38)';
        let d;
        const gutter = c.top - p.bottom;
        if (gutter > 14) {
          // Elbow routed through the gap BETWEEN the two rows, so the
          // horizontal run never crosses a card's face. It hugs the parent
          // row rather than splitting the gap, because the child's tier
          // label sits in the lower half of that gap — a mid-gap run would
          // strike straight through the heading text. Successive links fan
          // out a few pixels apart to stay individually readable.
          const room = Math.min(10, Math.max(0, (gutter - 14) / 2));
          const stagger = room ? ((routed % 4) - 1.5) * (room / 3) : 0;
          const midY = Math.round(p.bottom + Math.min(10, gutter / 3) + stagger);
          d = 'M ' + p.cx + ' ' + p.bottom +
              ' L ' + p.cx + ' ' + midY +
              ' L ' + c.cx + ' ' + midY +
              ' L ' + c.cx + ' ' + c.top;
        } else if (c.top >= p.bottom) {
          d = 'M ' + p.cx + ' ' + p.bottom + ' L ' + c.cx + ' ' + c.top;
        } else {
          // Same visual row (wrapped) — hug the side rather than cut across.
          const [l, r] = p.cx <= c.cx ? [p, c] : [c, p];
          d = 'M ' + l.right + ' ' + l.cy + ' L ' + r.left + ' ' + r.cy;
        }
        treeLinksEl.appendChild(svgLine(d, stroke, 2));
        routed++;
      }
    }

    // Either/or links: a dashed tie between the two halves of an exclusive
    // pair, drawn once per pair and only when both cards are visible.
    const drawnPairs = new Set();
    for (const n of SKILL_TREE) {
      const other = PAIRED_WITH[n.id];
      if (!other) continue;
      const key = [n.id, other].sort().join('|');
      if (drawnPairs.has(key)) continue;
      const aEl = treeNodeEls.get(n.id), bEl = treeNodeEls.get(other);
      if (!aEl || !bEl) continue;
      drawnPairs.add(key);
      const a = treeNodeBox(aEl), b = treeNodeBox(bEl);
      // Metaverse dissolves the locks — show the tie as spent, not exclusive.
      const stroke = metaverseOn() ? 'rgba(111, 208, 154, 0.45)' : 'rgba(255, 157, 77, 0.65)';
      let d;
      if (Math.abs(a.cy - b.cy) < 8) {
        // Side by side: a short tie between the facing edges.
        const [l, r] = a.cx <= b.cx ? [a, b] : [b, a];
        d = 'M ' + l.right + ' ' + l.cy + ' L ' + r.left + ' ' + r.cy;
      } else {
        // Wrapped onto different rows: drop out of the upper card's bottom
        // and come up into the lower card's top, hooking around the outside
        // so the tie doesn't slice through the cards in between.
        const [u, dn] = a.cy <= b.cy ? [a, b] : [b, a];
        const midY = Math.round(u.bottom + (dn.top - u.bottom) / 2);
        d = 'M ' + u.cx + ' ' + u.bottom +
            ' L ' + u.cx + ' ' + midY +
            ' L ' + dn.cx + ' ' + midY +
            ' L ' + dn.cx + ' ' + dn.top;
      }
      treeLinksEl.appendChild(svgLine(d, stroke, 2, '4 4'));
    }
  }

  // NOTE: do NOT touch body.pixelate-all here. Toggling a CSS `filter` on
  // <body> makes the browser tear down and rebuild the compositing layer, and
  // the half-resolution canvas comes back upscaled differently — it reads as
  // the whole game suddenly zooming. The tree just renders through the filter
  // like the rest of the UI does; its type is sized to stay legible under it.
  function openSkillTree() {
    if (!treeEl) return;
    treeEl.classList.add('is-open');
    buildSkillTree();
    treeBodyEl.scrollTop = 0; // always opens at the top of the tree
  }
  function closeSkillTree() {
    if (!treeEl) return;
    treeEl.classList.remove('is-open');
  }

  if (treeEl) {
    document.getElementById('st-close').addEventListener('click', closeSkillTree);
    // Capture phase: while the tree is up it swallows every key so nothing
    // leaks into the game (or the menu's join-code field) behind it. Escape
    // closes it without also toggling the pause state it was opened from.
    window.addEventListener('keydown', e => {
      if (!skillTreeOpen()) return;
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closeSkillTree(); }
    }, true);
    // Lines are measured from laid-out boxes, so a reflow has to redraw them.
    window.addEventListener('resize', () => { if (skillTreeOpen()) drawSkillTreeLinks(); });
  }

  // ---------- Wire up the menu buttons ----------
  // (The upgrade tree is deliberately NOT on the title menu — it tracks a live
  // run's progression, and showing the whole ladder up front spoils it.)
  // Every menu button / lobby toggle gets the same tiny click tick. Bound in
  // the capture phase on the menu root so it fires for buttons added later and
  // never has to be repeated on each individual handler below.
  const menuRoot = document.getElementById('menu');
  if (menuRoot) {
    menuRoot.addEventListener('click', e => {
      if (e.target.closest('button')) playUiClick();
    }, true);
  }

  document.getElementById('btnSingle').addEventListener('click', () => startGame(false));
  document.getElementById('btnMulti').addEventListener('click', () => {
    setStatus(document.getElementById('onlineStatus'), '');
    showScreen('online');
  });
  document.getElementById('btnHowTo').addEventListener('click', () => showScreen('howto'));
  document.getElementById('btnHost').addEventListener('click', () => hostLobby());
  // Host-only toggles for the multiplayer rule set. Each click flips the
  // value on the gameOpts object; the snapshot ships it to the guest once
  // the lobby connects.
  document.querySelectorAll('#lobbyOpts .lobby-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const opt = btn.dataset.opt;
      const on = btn.dataset.on === '1';
      const next = !on;
      btn.dataset.on = next ? '1' : '0';
      // Upgrades is inverted vs the highlight: default (unlit) is INDIVIDUAL,
      // and lighting it up (yellow) switches to HOST PICKS.
      gameOpts[opt] = opt === 'individualUpgrades' ? !next : next;
      const labels = {
        friendlyFire:       next ? 'ON' : 'OFF',
        separateMoney:      next ? 'SEPARATE' : 'SHARED',
        individualUpgrades: next ? 'HOST PICKS' : 'INDIVIDUAL',
      };
      btn.querySelector('.lobby-opt-val').textContent = labels[opt];
    });
  });
  document.getElementById('btnJoin').addEventListener('click', () => {
    setStatus(document.getElementById('joinStatus'), '');
    document.getElementById('joinCode').value = '';
    document.getElementById('btnJoinConnect').disabled = false;
    showScreen('join');
  });
  document.getElementById('btnHostCancel').addEventListener('click', () => {
    teardownConnection();
    showScreen('online');
  });
  document.getElementById('btnJoinConnect').addEventListener('click', () => {
    const code = (document.getElementById('joinCode').value || '').trim().toUpperCase();
    if (code.length !== CODE_LEN) {
      setStatus(document.getElementById('joinStatus'), 'Code must be ' + CODE_LEN + ' characters.', 'bad');
      return;
    }
    joinLobby(code);
  });
  document.getElementById('joinCode').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  // 'Back' links inside menu screens.
  document.querySelectorAll('#menu .menu-back[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      teardownConnection();
      showScreen(btn.dataset.back);
    });
  });

  requestAnimationFrame(loop);

  // Heartbeat — fires regardless of requestAnimationFrame, which pauses
  // entirely when the tab is backgrounded/minimised. setInterval is still
  // throttled to ~1Hz in that state but that single ping per second is
  // enough to keep the buddy's silence-timeout from tripping, so a host
  // alt-tabbing for a few seconds no longer drops the guest.
  setInterval(() => {
    if (!gameStarted || !multiplayer || !conn || !conn.open) return;
    if (isHost) netSendSnapshot();
    else        netSendPosition();
  }, 1000);
