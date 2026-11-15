  // ---------- Debug switches ----------
  // Master pixelate toggle. true → menu + HUD + canvas pass through the
  // SVG #pixelate filter for the low-fi look; false → everything renders
  // crisp. Lives here so it can be flipped without touching the runtime UI.
  const PIXELATE = false;
  // Apply at load — body starts with the class for first paint, this clears
  // it if PIXELATE is false.
  if (!PIXELATE) document.body.classList.remove('pixelate-all');

  // Master toggle for the developer debug panel (top-right). false hides it
  // and skips its setup so none of the helper buttons exist. When true the
  // panel still loads but stays hidden until the player types DEBUG_PHRASE
  // on the keyboard — keeps casual players from seeing dev controls.
  const DEBUG = true;
  const DEBUG_PHRASE = 'debug';
  // The debug element is hidden out of the gate (regardless of DEBUG). For
  // DEBUG=false it stays hidden forever; for DEBUG=true it unhides once the
  // phrase has been typed.
  (function hideDebugInitially() {
    const dbg = document.getElementById('debug');
    if (dbg) dbg.style.display = 'none';
  })();

  // ---------- Canvas setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  // Detect touch-primary mobile devices (not "Request Desktop Site" — UA changes there).
  const isMobileMode = ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
                       /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  // Mobile uses 1:1 art→CSS pixel ratio so the map viewport matches desktop scale.
  const PIXEL = isMobileMode ? 1 : 2;

  // Overlay borders are authored in art pixels, but desktop upscales the canvas
  // 2× (PIXEL=2) while mobile draws 1:1 — so an identical art-pixel stroke ends
  // up physically HALF as thick on a phone. The colour values are the same on
  // both, but a 1px accent line against a dark panel reads washed-out next to
  // the desktop's 2px block, which is why the upgrade cards looked "different
  // colours" on mobile. Scale UI line widths so they land at the same on-screen
  // weight everywhere.
  function uiLineW(w) { return w * (2 / PIXEL); }

  if (isMobileMode) {
    const howtoList = document.getElementById('howto-list');
    if (howtoList) {
      const mkey = t => '<span class="howto-keys"><kbd>' + t + '</kbd></span>';
      howtoList.innerHTML =
        '<li>' + mkey('Left stick')    + ' Move around the farm</li>' +
        '<li>' + mkey('Right stick')   + ' Aim your weapon</li>' +
        '<li>' + mkey('Release stick') + ' Fire your weapon</li>' +
        '<li>' + mkey('BUILD')         + ' Enter build mode / place a building</li>' +
        '<li>' + mkey('◄ ►')          + ' Cycle the building to place</li>' +
        '<li>' + mkey('❚❚')           + ' Pause — status &amp; upgrades</li>';
    }
    const buildhintEl = document.getElementById('buildhint');
    if (buildhintEl) buildhintEl.innerHTML = '<kbd>BUILD</kbd> to build a coop';
  }
  let W = 0, H = 0;       // internal (low-res) canvas dimensions, in art pixels
  let cssW = 0, cssH = 0; // CSS dimensions
  let skyGrad = null;     // cached sky background gradient, rebuilt on resize

  function resize() {
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    W = Math.max(1, Math.floor(cssW / PIXEL));
    H = Math.max(1, Math.floor(cssH / PIXEL));
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    skyGrad = null;
  }
  window.addEventListener('resize', resize);
  resize();

