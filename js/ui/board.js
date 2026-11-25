/* Dots and Boxes UI: the board.
 *
 * Rendering is incremental: build() creates the static parts once per game (dots, guide lines,
 * tap areas), and sync() compares the game state with what is already on screen and only adds or
 * removes the lines and boxes that changed. A move therefore touches a handful of SVG elements
 * instead of redrawing the whole board.
 *
 * Also handles pointer (mouse/touch) and keyboard input on the board.
 */
(function (D) {
  'use strict';

  const { $, E, AI } = D;
  const { svgEl, textOn, graphemes, clamp, colLetter } = D.util;
  const st = D.state;

  const GAP = 40;   // distance between dots, in SVG units
  const PAD = 22;   // margin around the dots
  const board = $('board'), boardWrap = $('boardWrap');

  let layers = {};
  let hits = new Map();          // "h-r-c" -> tap-area polygon
  let lineEls = new Map();       // "h-r-c" -> drawn line element
  let boxEls = new Map();        // "r-c"   -> { el, owner }
  let dangerEls = new Map();     // "r-c"   -> assist highlight rect
  let lastKey = null;            // key of the line styled as "last move"
  let fontSize = 19;

  const dotX = c => PAD + c * GAP;
  const dotY = r => PAD + r * GAP;
  const edgeKey = (type, r, c) => `${type}-${r}-${c}`;
  function edgeCoords(type, r, c) {
    return type === 'h'
      ? { x1: dotX(c), y1: dotY(r), x2: dotX(c + 1), y2: dotY(r) }
      : { x1: dotX(c), y1: dotY(r), x2: dotX(c), y2: dotY(r + 1) };
  }

  /** Create the static board for the current game. */
  function build() {
    const g = st.game;
    board.textContent = '';
    hits = new Map(); lineEls = new Map(); boxEls = new Map(); dangerEls = new Map();
    lastKey = null;
    const W = PAD * 2 + (g.cols - 1) * GAP, H = PAD * 2 + (g.rows - 1) * GAP;
    board.setAttribute('viewBox', `0 0 ${W} ${H}`);
    board.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // Cap the zoom so small boards don't look oversized.
    board.style.maxWidth = `${W * 2.2}px`;
    board.style.maxHeight = `${H * 2.2}px`;

    // Build off-document, then attach once.
    const frag = document.createDocumentFragment();
    layers = {
      guides: svgEl('g', { 'aria-hidden': 'true' }, frag),
      danger: svgEl('g', { 'aria-hidden': 'true' }, frag),
      boxes: svgEl('g', { 'aria-hidden': 'true' }, frag),
      lines: svgEl('g', { 'aria-hidden': 'true' }, frag),
      hint: svgEl('line', { class: 'hint-line', visibility: 'hidden' }, frag),
      preview: svgEl('line', { class: 'preview', visibility: 'hidden', pathLength: 1 }, frag),
      dots: svgEl('g', { 'aria-hidden': 'true' }, frag),
      hits: svgEl('g', {}, frag),
      cursor: svgEl('circle', { class: 'cursor', r: 11 }, frag)
    };
    const half = GAP / 2;
    const addEdge = (type, r, c) => {
      const e = edgeCoords(type, r, c);
      svgEl('line', { class: 'guide', ...e }, layers.guides);
      // Diamond-shaped tap areas tile the board, so every tap lands on the nearest line slot.
      const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
      const pts = type === 'h'
        ? `${e.x1},${e.y1} ${mx},${my - half} ${e.x2},${e.y2} ${mx},${my + half}`
        : `${e.x1},${e.y1} ${mx - half},${my} ${e.x2},${e.y2} ${mx + half},${my}`;
      hits.set(edgeKey(type, r, c), svgEl('polygon', { class: 'hit', points: pts, 'data-type': type, 'data-r': r, 'data-c': c }, layers.hits));
    };
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols - 1; c++) addEdge('h', r, c);
    for (let r = 0; r < g.rows - 1; r++) for (let c = 0; c < g.cols; c++) addEdge('v', r, c);
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      svgEl('circle', { class: 'dot', cx: dotX(c), cy: dotY(r), r: 4.5 }, layers.dots);
    }
    board.appendChild(frag);
    fontSize = Math.max(...st.labels.map(l => graphemes(l).length)) > 1 ? 15 : 19;
    placeCursor();
  }

  /* ---------- Incremental updates ---------- */
  /** Every drawn line keeps the colour of the player who drew it, for the whole game. */
  function syncLine(type, r, c, owner, isLast, animate) {
    const k = edgeKey(type, r, c);
    let el = lineEls.get(k);
    if (owner !== -1 && !el) {
      el = svgEl('line', { class: 'edge' + (isLast && animate ? ' draw' : ''), ...edgeCoords(type, r, c), pathLength: 1 }, layers.lines);
      el.style.stroke = st.players[owner].color;
      el.dataset.owner = owner;
      lineEls.set(k, el);
      hits.get(k).classList.add('taken');
    } else if (owner !== -1 && el.dataset.owner !== String(owner)) {
      // Same slot, different player (e.g. after undo and a new move): recolour it.
      el.style.stroke = st.players[owner].color;
      el.dataset.owner = owner;
    } else if (owner === -1 && el) {
      el.remove();
      lineEls.delete(k);
      hits.get(k).classList.remove('taken');
    }
  }

  function syncBox(r, c, owner, fresh) {
    const k = `${r}-${c}`;
    const cur = boxEls.get(k);
    if (cur && cur.owner === owner) return;
    if (cur) { cur.el.remove(); boxEls.delete(k); }
    if (owner === -1) return;
    const p = st.players[owner];
    const grp = svgEl('g', { class: 'box' + (fresh ? ' pop' : '') }, layers.boxes);
    const inset = 5;
    svgEl('rect', { x: dotX(c) + inset, y: dotY(r) + inset, width: GAP - inset * 2, height: GAP - inset * 2, rx: 5, fill: p.color }, grp);
    const t = svgEl('text', { class: 'box-label', x: dotX(c) + GAP / 2, y: dotY(r) + GAP / 2 + 1, 'font-size': fontSize, fill: textOn(p.color) }, grp);
    t.textContent = st.labels[owner];
    boxEls.set(k, { el: grp, owner });
  }

  function syncDanger() {
    const g = st.game;
    const want = new Set();
    if (D.settings.assist && !g.over && !st.replay) {
      for (const [r, c] of AI.threeSidedBoxes(g)) want.add(`${r}-${c}`);
      layers.danger.style.color = st.players[g.current].color;
    }
    dangerEls.forEach((el, k) => { if (!want.has(k)) { el.remove(); dangerEls.delete(k); } });
    want.forEach(k => {
      if (dangerEls.has(k)) return;
      const [r, c] = k.split('-').map(Number);
      dangerEls.set(k, svgEl('rect', { class: 'danger-box', x: dotX(c) + 6, y: dotY(r) + 6, width: GAP - 12, height: GAP - 12, rx: 5, fill: 'currentColor', stroke: 'currentColor' }, layers.danger));
    });
  }

  /** Bring the board in line with the game state. `lastResult` (from a move) enables animation. */
  function sync(lastResult) {
    const g = st.game;
    const last = g.history[g.history.length - 1];
    const animate = !!(lastResult && lastResult.ok && D.settings.anim);
    const newLastKey = last ? edgeKey(last.type, last.r, last.c) : null;
    const fresh = new Set(animate && last ? last.claimed.map(([r, c]) => `${r}-${c}`) : []);

    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols - 1; c++) syncLine('h', r, c, g.h[r][c], newLastKey === edgeKey('h', r, c), animate);
    for (let r = 0; r < g.rows - 1; r++) for (let c = 0; c < g.cols; c++) syncLine('v', r, c, g.v[r][c], newLastKey === edgeKey('v', r, c), animate);

    // The most recent line is drawn a little thicker so the last move is easy to spot.
    if (lastKey !== newLastKey) {
      const prev = lastKey && lineEls.get(lastKey);
      if (prev) prev.classList.remove('last');
      lastKey = newLastKey;
    }
    const cur = newLastKey && lineEls.get(newLastKey);
    if (cur) cur.classList.add('last');

    for (let r = 0; r < g.rows - 1; r++) for (let c = 0; c < g.cols - 1; c++) syncBox(r, c, g.boxes[r][c], fresh.has(`${r}-${c}`));

    syncDanger();

    if (st.hintMove && !g.over && !st.replay) {
      const e = edgeCoords(st.hintMove.type, st.hintMove.r, st.hintMove.c);
      for (const k in e) layers.hint.setAttribute(k, e[k]);
      layers.hint.setAttribute('visibility', 'visible');
    } else layers.hint.setAttribute('visibility', 'hidden');

    boardWrap.classList.toggle('locked', D.who.isAITurn() && !st.replay);
    boardWrap.classList.toggle('replaying', !!st.replay);
    hidePreview();
  }

  function shake() {
    if (!D.settings.anim) return;
    board.classList.remove('shake');
    void board.getBoundingClientRect();
    board.classList.add('shake');
  }

  /* ---------- Hover preview ---------- */
  /** Would this line give a box its third side without completing one (handing it to the next player)? */
  function givesAway(type, r, c) {
    let completes = false, third = false;
    for (const [br, bc] of E.adjacentBoxes(st.game, type, r, c)) {
      const s = E.sidesOf(st.game, br, bc);
      if (s === 3) completes = true;
      if (s === 2) third = true;
    }
    return third && !completes;
  }
  function showPreview(type, r, c) {
    const e = edgeCoords(type, r, c);
    for (const k in e) layers.preview.setAttribute(k, e[k]);
    const warn = D.settings.assist && givesAway(type, r, c);
    layers.preview.classList.toggle('warn', warn);
    layers.preview.style.stroke = warn ? '#dc2626' : st.players[st.game.current].color;
    layers.preview.setAttribute('visibility', 'visible');
  }
  function hidePreview() { if (layers.preview) layers.preview.setAttribute('visibility', 'hidden'); }

  /* ---------- Pointer input ---------- */
  board.addEventListener('click', e => {
    const hit = e.target.closest && e.target.closest('.hit');
    if (!hit) return;
    board.classList.remove('kbd');
    D.game.attemptMove(hit.dataset.type, Number(hit.dataset.r), Number(hit.dataset.c), 'human');
  });
  board.addEventListener('pointerover', e => {
    const g = st.game;
    if (e.pointerType === 'touch' || !g || g.over || st.replay || D.who.isAITurn()) return;
    const hit = e.target.closest && e.target.closest('.hit');
    if (!hit) { hidePreview(); return; }
    const type = hit.dataset.type, r = Number(hit.dataset.r), c = Number(hit.dataset.c);
    if (E.isDrawn(g, type, r, c)) { hidePreview(); return; }
    showPreview(type, r, c);
  });
  board.addEventListener('pointerleave', hidePreview);

  /* ---------- Keyboard input: arrows move between dots, Shift+arrow draws ---------- */
  function placeCursor() {
    layers.cursor.setAttribute('cx', dotX(st.cursor.c));
    layers.cursor.setAttribute('cy', dotY(st.cursor.r));
    layers.cursor.classList.toggle('pending', st.pendingDraw);
  }
  const DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  board.addEventListener('keydown', e => {
    const g = st.game;
    if (!g || st.replay) return;
    const d = DIRS[e.key];
    if (d) {
      e.preventDefault();
      board.classList.add('kbd');
      const tr = st.cursor.r + d[0], tc = st.cursor.c + d[1];
      if (e.shiftKey || st.pendingDraw) {
        st.pendingDraw = false;
        if (tr >= 0 && tr < g.rows && tc >= 0 && tc < g.cols) {
          const t = d[0] === 0 ? 'h' : 'v';
          const rr = d[0] === 0 ? st.cursor.r : Math.min(st.cursor.r, tr);
          const cc = d[0] === 0 ? Math.min(st.cursor.c, tc) : st.cursor.c;
          if (E.isDrawn(g, t, rr, cc)) { D.fx.sfx.error(); D.fx.announce('That line has already been drawn.'); }
          else D.game.attemptMove(t, rr, cc, 'human');
        } else D.fx.sfx.error();
        placeCursor();
        if (!st.game.over) D.hud.renderStatus(null);
      } else {
        st.cursor.r = clamp(tr, 0, g.rows - 1);
        st.cursor.c = clamp(tc, 0, g.cols - 1);
        placeCursor();
        D.fx.announce(`Dot ${colLetter(st.cursor.c)}${st.cursor.r + 1}`);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (g.over || D.who.isAITurn()) return;
      board.classList.add('kbd');
      st.pendingDraw = !st.pendingDraw;
      placeCursor();
      D.hud.renderStatus(null);
      if (st.pendingDraw) D.fx.announce('Choose a direction with an arrow key to draw a line.');
    } else if (e.key === 'Escape' && st.pendingDraw) {
      st.pendingDraw = false;
      placeCursor();
      D.hud.renderStatus(null);
    }
  });

  D.board = { build, sync, shake, hidePreview, placeCursor };
})(window.DAB);
