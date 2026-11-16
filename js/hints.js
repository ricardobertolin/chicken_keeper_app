  // ---------- Knowledge Scroll ----------
  // The hint table behind the Knowledge Scroll upgrade, plus the parchment
  // overlay that reads one out.
  //
  // The scroll buys no power at all — it hands over one piece of farm lore,
  // and it is the only upgrade in the pool gated on the BONUS pick (see the
  // 'scroll' entry in getUpgradePool). Hints are drawn from a bag without
  // replacement, so a session never shows the same one twice; once they have
  // all been read the upgrade stops being offered. Nothing is pinned to the
  // list's length — the card, the tree row and the parchment footer all read
  // GAME_HINTS.length, so adding or cutting a line needs no other edit.
  //
  // Voice is deliberately in-world keeper gossip rather than a tooltip: a few
  // are outright teases for things the player hasn't met yet, and the rest
  // point at a real mechanic without spelling the numbers out. HINTS.md at the
  // repo root is the same list in reading order.
  const GAME_HINTS = [
    // --- Controls and the things you'd never find on your own ---
    'A keeper who changes their mind left, right, left, right fast enough won\'t be going anywhere at all.',
    'Folks say there\'s a second way to hold the trigger. Gets the shells out a good deal quicker.',
    'I hear there are some very secret hats out there.',
    'With friendly fire on, you can shoot a hat clean off your buddy\'s head.',
    'If I stand perfectly still in a last stand, maybe they won\'t see me at all.',
    'Every time they drag me back into the fight, the hospital bill gets steeper...',

    // --- Karma, chickens and the flock ---
    'Every chicken you save, and every one you shoot, moves your karma.',
    'Karma pushed far enough either way starts handing out unnatural powers...',
    'Putting a chicken to the flame can have a delicious result.',
    'I doubt a wolf gets far hauling one of those fat chickens.',
    'Those foxes are worth a fortune!',
    'The land is generous to a keeper who buries nothing. Every chicken lost halves that generosity.',
    'What is that strange upgrade with the chicken on it?',
    'Maybe the chicken coop isn\'t quite what you think it is.',

    // --- FANGUS and the deep forest ---
    'Why does FANGUS keep so many chickens?',
    'Even the hunters are afraid of FANGUS.',
    'Did you really think FANGUS was gone?',
    'What was that drumming, deep in the forest?',
    'Whatever walked out of that forest, something buried in the ground hurt it worse than any gun ever did.',

    // --- The pack, and the stranger things in it ---
    'Once the antennas go up, some very strange wolves start showing up.',
    'Folks say they saw a wolf out there acting an awful lot like a human.',
    'Folks say they saw a wolf carrying a sword. I\'ve seen that blade somewhere before...',
    'Who knew the pack had a currency of its own?',
    'Life was easier back when the wolves didn\'t go for the coops.',
    'Maybe ghosts really can possess things...',
    'I could swear I saw Buddy out there — and there was nobody else on this site. Hmm.',

    // --- Weather ---
    'When it snows, Christmas comes early, and the emptier your pockets the bigger the gift.',
    'The pack doesn\'t care for rain. Whatever\'s under that fur, it doesn\'t take to water.',
    'Elemental shots bite deepest in a blizzard, and barely at all in the rain.',

    // --- Allies ---
    'Every dog collar means something different.',
    'A well-trained hunter never walks away from a fight.',
    'Show enough strength and more hunters will pitch camp on your land.',
    'Missiles are about the only thing that will knock a sniper off your roof.',
    'A well-upgraded scarecrow earns its keep after dark.',

    // --- Guns and gear ---
    'With this oil my gun will never jam on me again!',
    'Let a gun rust long enough and it might turn out to be treasure after all.',
    'Legend tells of a barrel so long the shot came out the far side of the wall.',
    'Maybe a laser can be made to bend through space somehow.',
    'The last tier of mine knows friend from foe. That safety is what you pay double for.',

    // --- The farm itself ---
    'Each coop you raise means the next one asks for more wood.',
    'Walls are patched up between waves. A chip taken last round never carries over.',
    'A golden statue is just the thing to show everyone how great you are.',
    'The size of a keeper\'s mustache tells you how much they have lived through.',
    'Reach the metaverse and nothing holds you to one path any more.',
  ];

  // Indices already handed out. Deliberately NOT cleared by resetWorld or a
  // restart: "no repeats" is scoped to the whole page session, so carrying on
  // into a fresh run keeps reading new scrolls rather than starting the bag
  // over. A reload is the only thing that forgets.
  const hintsRead = new Set();
  function hintsLeft() { return GAME_HINTS.length - hintsRead.size; }
  // Draw an unread hint. Builds the candidate list rather than re-rolling a
  // random index until it misses — the last few scrolls would otherwise spin
  // through hundreds of rejected rolls.
  function takeNextHint() {
    const unread = [];
    for (let i = 0; i < GAME_HINTS.length; i++) if (!hintsRead.has(i)) unread.push(i);
    if (!unread.length) return null;
    const i = unread[Math.floor(Math.random() * unread.length)];
    hintsRead.add(i);
    return { text: GAME_HINTS[i], n: hintsRead.size };
  }

  // ---- The parchment overlay ----------------------------------------------
  // Opens when a scroll is picked and holds the wave countdown while it's up
  // (see the waveTimer gate in update()), so a hint is never buried under the
  // next wave starting. Capped by its own lifetime so it can't stall a run.
  const SCROLL_NOTE_LIFE = 11.0;  // seconds before it rolls itself back up
  const SCROLL_NOTE_IN   = 0.25;  // fade in
  const SCROLL_NOTE_OUT  = 0.5;   // fade out
  let scrollNote = null;          // { text, n, t, closing }
  let scrollNoteRect = null;      // click-to-close target, set while drawn

  // Called from the upgrade's apply(). Safe to call with the bag empty —
  // available() already guards it, but a debug button can reach apply directly.
  //
  // A scroll already on screen swallows the call WITHOUT drawing from the bag.
  // Fast mode's applyPickedUpgrade stacks an upgrade up to five times while
  // available() still holds, which would otherwise burn five hints to show the
  // fifth one.
  function readKnowledgeScroll() {
    if (scrollNote && !scrollNote.closing) return;
    const hint = takeNextHint();
    if (!hint) { toast('Every scroll on the farm has been read', 1.6); return; }
    scrollNote = { text: hint.text, n: hint.n, t: 0, closing: false };
    playUnlockChime();
  }
  function dismissScrollNote() {
    if (!scrollNote || scrollNote.closing) return;
    scrollNote.closing = true;
    scrollNote.t = 0;
  }
  function updateScrollNote(dt) {
    if (!scrollNote) return;
    scrollNote.t += dt;
    if (scrollNote.closing) {
      if (scrollNote.t >= SCROLL_NOTE_OUT) { scrollNote = null; scrollNoteRect = null; }
    } else if (scrollNote.t >= SCROLL_NOTE_LIFE) {
      dismissScrollNote();
    }
  }
  // True while the scroll should hold the world's clock.
  function scrollNoteHoldsWave() { return !!scrollNote && !scrollNote.closing; }
  function scrollNoteHit(x, y) {
    const r = scrollNoteRect;
    if (!r || !scrollNote) return false;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // Lay the text out before drawing: the panel is sized to its contents, so
  // the number of lines has to be known up front. render.js's wrapText paints
  // as it goes and can't report that back.
  function wrapScrollLines(text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawScrollNote() {
    if (!scrollNote) return;
    const alpha = scrollNote.closing
      ? Math.max(0, 1 - scrollNote.t / SCROLL_NOTE_OUT)
      : Math.min(1, scrollNote.t / SCROLL_NOTE_IN);
    const BODY_FONT = '15px "Lucida Console", Consolas, monospace';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = BODY_FONT;
    // Width tracks the viewport so the hint stays readable on a phone.
    const maxW = Math.min(520, W - 64);
    const textW = maxW - 72; // room for the rollers down each side
    const lines = wrapScrollLines(scrollNote.text, textW);
    const LINE_H = 22;
    const panelW = maxW;
    const panelH = 86 + lines.length * LINE_H;
    const px = Math.round((W - panelW) / 2);
    // Sits above centre: the keeper and the flock are the thing you want to
    // keep an eye on while you read. On a narrow phone a long hint wraps to
    // enough lines that a fixed 20% top edge could push the footer off the
    // bottom, so the panel is pulled back up to fit.
    const py = Math.max(8, Math.min(Math.round(H * 0.20), H - panelH - 8));
    scrollNoteRect = { x: px, y: py, w: panelW, h: panelH };
    const cx = px + panelW / 2;

    // Rolled-up ends, drawn first so the sheet overlaps them.
    const rollW = 13;
    for (const rx of [px + 4, px + panelW - rollW - 4]) {
      ctx.fillStyle = '#6b4a23';
      ctx.fillRect(rx, py - 5, rollW, panelH + 10);
      ctx.fillStyle = '#8a6334';
      ctx.fillRect(rx + 2, py - 3, rollW - 4, panelH + 6);
    }
    // The sheet.
    ctx.fillStyle = '#e8dcb5';
    ctx.fillRect(px + rollW, py, panelW - rollW * 2, panelH);
    ctx.strokeStyle = '#6b4a23';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + rollW + 0.5, py + 0.5, panelW - rollW * 2 - 1, panelH - 1);
    // A couple of aging stains so it doesn't read as a flat card.
    ctx.fillStyle = 'rgba(150, 115, 60, 0.13)';
    ctx.fillRect(px + rollW + 6, py + 8, 40, 7);
    ctx.fillRect(px + panelW - rollW - 58, py + panelH - 22, 52, 9);

    // Heading.
    ctx.fillStyle = '#7a4a18';
    ctx.font = 'bold 13px "Lucida Console", Consolas, monospace';
    ctx.fillText('KNOWLEDGE SCROLL', cx, py + 26);
    ctx.strokeStyle = 'rgba(122, 74, 24, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + rollW + 18, py + 36.5);
    ctx.lineTo(px + panelW - rollW - 18, py + 36.5);
    ctx.stroke();

    // The hint.
    ctx.fillStyle = '#2f2415';
    ctx.font = BODY_FONT;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, py + 62 + i * LINE_H);
    }

    // Footer: how far through the collection, and how to put it down.
    ctx.fillStyle = 'rgba(70, 52, 28, 0.75)';
    ctx.font = '11px "Lucida Console", Consolas, monospace';
    ctx.fillText(
      'Scroll ' + scrollNote.n + ' of ' + GAME_HINTS.length + '   ·   Enter or click to close',
      cx, py + panelH - 14
    );
    ctx.restore();
  }
