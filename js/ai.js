/* Dots and Boxes: computer players.
 *
 * Levels
 *   easy   - often grabs a free box, otherwise plays mostly at random.
 *   medium - always takes free boxes, avoids drawing a box's third side, and when forced
 *            gives away as few boxes as possible.
 *   hard   - medium, plus real endgame play: it splits the board into chains and loops,
 *            solves which one to give away, sacrifices 2-chains in the middle so they cannot
 *            be "double-dealt", and declines the last two boxes of a chain ("all but two")
 *            when that keeps control of the rest of the game.
 *
 * Works in the browser (window.DBAI) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  /* ---------------- Topology (flat indices, cached per board size) ---------------- */
  const topoCache = new Map();

  function topology(cols, rows) {
    const key = cols + 'x' + rows;
    if (topoCache.has(key)) return topoCache.get(key);
    const nH = rows * (cols - 1);
    const nV = (rows - 1) * cols;
    const nE = nH + nV;
    const nB = (rows - 1) * (cols - 1);
    const edgeType = new Uint8Array(nE);       // 0 = h, 1 = v
    const edgeR = new Int16Array(nE);
    const edgeC = new Int16Array(nE);
    const edgeBoxes = new Array(nE);
    const boxEdges = new Int32Array(nB * 4);
    const hIdx = (r, c) => r * (cols - 1) + c;
    const vIdx = (r, c) => nH + r * cols + c;
    const bIdx = (r, c) => r * (cols - 1) + c;

    for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) {
      const e = hIdx(r, c);
      edgeType[e] = 0; edgeR[e] = r; edgeC[e] = c;
      const bs = [];
      if (r > 0) bs.push(bIdx(r - 1, c));
      if (r < rows - 1) bs.push(bIdx(r, c));
      edgeBoxes[e] = bs;
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols; c++) {
      const e = vIdx(r, c);
      edgeType[e] = 1; edgeR[e] = r; edgeC[e] = c;
      const bs = [];
      if (c > 0) bs.push(bIdx(r, c - 1));
      if (c < cols - 1) bs.push(bIdx(r, c));
      edgeBoxes[e] = bs;
    }
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const b = bIdx(r, c);
      boxEdges[b * 4] = hIdx(r, c);
      boxEdges[b * 4 + 1] = hIdx(r + 1, c);
      boxEdges[b * 4 + 2] = vIdx(r, c);
      boxEdges[b * 4 + 3] = vIdx(r, c + 1);
    }
    const t = { cols, rows, nE, nB, edgeType, edgeR, edgeC, edgeBoxes, boxEdges, hIdx, vIdx };
    topoCache.set(key, t);
    return t;
  }

  function snapshot(g) {
    const T = topology(g.cols, g.rows);
    const drawn = new Uint8Array(T.nE);
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols - 1; c++) if (g.h[r][c] !== -1) drawn[T.hIdx(r, c)] = 1;
    for (let r = 0; r < g.rows - 1; r++) for (let c = 0; c < g.cols; c++) if (g.v[r][c] !== -1) drawn[T.vIdx(r, c)] = 1;
    const sides = new Uint8Array(T.nB);
    for (let b = 0; b < T.nB; b++) {
      for (let k = 0; k < 4; k++) sides[b] += drawn[T.boxEdges[b * 4 + k]];
    }
    return { T, drawn, sides };
  }

  function drawE(s, e) { s.drawn[e] = 1; for (const b of s.T.edgeBoxes[e]) s.sides[b]++; }
  function undrawE(s, e) { s.drawn[e] = 0; for (const b of s.T.edgeBoxes[e]) s.sides[b]--; }
  function revert(s, edges) { for (let i = edges.length - 1; i >= 0; i--) undrawE(s, edges[i]); }

  function missingEdge(s, b) {
    for (let k = 0; k < 4; k++) { const e = s.T.boxEdges[b * 4 + k]; if (!s.drawn[e]) return e; }
    return -1;
  }
  function otherBox(s, e, b) {
    for (const x of s.T.edgeBoxes[e]) if (x !== b) return x;
    return -1; // border
  }
  function undrawnList(s) {
    const out = [];
    for (let e = 0; e < s.T.nE; e++) if (!s.drawn[e]) out.push(e);
    return out;
  }
  /** Edges that complete at least one box right now. */
  function capturableEdges(s) {
    const set = new Set();
    for (let b = 0; b < s.T.nB; b++) if (s.sides[b] === 3) set.add(missingEdge(s, b));
    return [...set];
  }
  /** Edges that do not give any box its third side. */
  function safeEdges(s) {
    const out = [];
    for (let e = 0; e < s.T.nE; e++) {
      if (s.drawn[e]) continue;
      let ok = true;
      for (const b of s.T.edgeBoxes[e]) if (s.sides[b] >= 2) { ok = false; break; }
      if (ok) out.push(e);
    }
    return out;
  }
  /** Take every box that can be taken in a row. Returns the count and the drawn edges (for revert). */
  function greedyCapture(s) {
    const stack = [];
    for (let b = 0; b < s.T.nB; b++) if (s.sides[b] === 3) stack.push(b);
    let count = 0;
    const edges = [];
    while (stack.length) {
      const b = stack.pop();
      if (s.sides[b] !== 3) continue;
      const e = missingEdge(s, b);
      drawE(s, e);
      edges.push(e);
      for (const nb of s.T.edgeBoxes[e]) {
        if (s.sides[nb] === 4) count++;
        else if (s.sides[nb] === 3) stack.push(nb);
      }
    }
    return { count, edges };
  }
  /** How many boxes the opponent can grab in a row if we draw e (assumes e completes nothing). */
  function giveaway(s, e) {
    drawE(s, e);
    const gc = greedyCapture(s);
    revert(s, gc.edges);
    undrawE(s, e);
    return gc.count;
  }

  /* ---------------- Chains and loops ---------------- */
  /** In a position with no free boxes and no safe moves, split the 2-sided boxes into chains and loops. */
  function components(s) {
    const T = s.T;
    const seen = new Uint8Array(T.nB);
    const comps = [];
    for (let start = 0; start < T.nB; start++) {
      if (seen[start] || s.sides[start] !== 2) continue;
      const boxes = [];
      const edges = new Set();
      const queue = [start];
      seen[start] = 1;
      let loop = true;
      while (queue.length) {
        const b = queue.pop();
        boxes.push(b);
        for (let k = 0; k < 4; k++) {
          const e = T.boxEdges[b * 4 + k];
          if (s.drawn[e]) continue;
          edges.add(e);
          const nb = otherBox(s, e, b);
          if (nb === -1 || s.sides[nb] !== 2) { loop = false; continue; }
          if (!seen[nb]) { seen[nb] = 1; queue.push(nb); }
        }
      }
      comps.push({ len: boxes.length, loop: loop && boxes.length >= 4, boxes, edges: [...edges] });
    }
    return comps;
  }

  /**
   * Value of a "loony endgame" for the player who must open the next component
   * (their boxes minus everyone else's, assuming two players).
   * Opening a chain of length L >= 3 lets the opponent either take all L and move on, or take
   * L-2 and hand back 2 to keep control. Loops are the same with 4 boxes handed back.
   * 1- and 2-chains cannot be declined (2-chains are opened in the middle).
   */
  function endgameSolve(comps) {
    let ones = 0, twos = 0;
    const chains = [], loops = [];
    for (const c of comps) {
      if (c.loop) loops.push(c.len);
      else if (c.len === 1) ones++;
      else if (c.len === 2) twos++;
      else chains.push(c.len);
    }
    chains.sort((a, b) => a - b);
    loops.sort((a, b) => a - b);
    const memo = new Map();
    function f(a, b, i, j) {
      if (a === 0 && b === 0 && i === chains.length && j === loops.length) return 0;
      const key = a + ',' + b + ',' + i + ',' + j;
      if (memo.has(key)) return memo.get(key);
      let best = -Infinity;
      if (a > 0) best = Math.max(best, -(1 + f(a - 1, b, i, j)));
      if (b > 0) best = Math.max(best, -(2 + f(a, b - 1, i, j)));
      if (i < chains.length) {
        const L = chains[i], fr = f(a, b, i + 1, j);
        best = Math.max(best, -Math.max(L + fr, L - 4 - fr));
      }
      if (j < loops.length) {
        const L = loops[j], fr = f(a, b, i, j + 1);
        best = Math.max(best, -Math.max(L + fr, L - 8 - fr));
      }
      memo.set(key, best);
      return best;
    }
    const value = f(ones, twos, 0, 0);
    // Which kind of component to open first (same options as the root of f).
    const rootOpts = [];
    if (ones) rootOpts.push({ kind: 'one', v: -(1 + f(ones - 1, twos, 0, 0)) });
    if (twos) rootOpts.push({ kind: 'two', v: -(2 + f(ones, twos - 1, 0, 0)) });
    if (chains.length) { const L = chains[0], fr = f(ones, twos, 1, 0); rootOpts.push({ kind: 'chain', len: L, v: -Math.max(L + fr, L - 4 - fr) }); }
    if (loops.length) { const L = loops[0], fr = f(ones, twos, 0, 1); rootOpts.push({ kind: 'loop', len: L, v: -Math.max(L + fr, L - 8 - fr) }); }
    rootOpts.sort((x, y) => y.v - x.v);
    return { value, best: rootOpts[0] || null };
  }

  /* ---------------- Move choice ---------------- */
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  function minGiveaway(s, edges, rng) {
    let best = Infinity, bestList = [];
    for (const e of edges) {
      const g = giveaway(s, e);
      if (g < best) { best = g; bestList = [e]; }
      else if (g === best) bestList.push(e);
    }
    return pick(bestList, rng);
  }

  function hardCapture(s, capt, rng) {
    // Find capturable boxes that are the near end of a 2-box "domino" at the end of a chain.
    const dominos = [];
    const dominoEdges = new Set();
    for (let a = 0; a < s.T.nB; a++) {
      if (s.sides[a] !== 3) continue;
      const e = missingEdge(s, a);
      const b = otherBox(s, e, a);
      if (b === -1 || s.sides[b] !== 2) continue;
      let f = -1;
      for (let k = 0; k < 4; k++) { const x = s.T.boxEdges[b * 4 + k]; if (!s.drawn[x] && x !== e) f = x; }
      if (f === -1) continue;
      const c = otherBox(s, f, b);
      if (c !== -1 && s.sides[c] >= 2) continue; // chain continues past b
      dominos.push({ e, f });
      dominoEdges.add(e);
    }
    const plain = capt.filter(e => !dominoEdges.has(e));
    if (plain.length) return pick(plain, rng);
    if (dominos.length !== 1) return dominos[0].e;

    // Exactly one domino left to take: should we take it or hand it over to keep control?
    const d = dominos[0];
    const gc = greedyCapture(s);
    const restSafe = safeEdges(s).length;
    const restLeft = undrawnList(s).length;
    let comps = null;
    if (!restSafe && restLeft) comps = components(s);
    revert(s, gc.edges);
    if (!comps || !comps.length) return d.e;
    const fr = endgameSolve(comps).value;
    // Take all: we must then open the rest (net +2 + fr). Decline: we give 2 and they open (net -2 - fr).
    return fr < -2 ? d.f : d.e;
  }

  function hardSacrifice(s, rng) {
    const comps = components(s);
    if (!comps.length) return minGiveaway(s, undrawnList(s), rng);
    const { best } = endgameSolve(comps);
    let target = null;
    if (best) {
      const candidates = comps.filter(c => {
        if (best.kind === 'one') return !c.loop && c.len === 1;
        if (best.kind === 'two') return !c.loop && c.len === 2;
        if (best.kind === 'chain') return !c.loop && c.len === best.len;
        return c.loop && c.len === best.len;
      });
      target = candidates.length ? pick(candidates, rng) : null;
    }
    if (!target) return minGiveaway(s, undrawnList(s), rng);

    if (!target.loop && target.len === 2) {
      // Open a 2-chain in the middle (both boxes become takeable separately: no double-deal).
      const inside = new Set(target.boxes);
      const mid = target.edges.find(e => s.T.edgeBoxes[e].length === 2 && s.T.edgeBoxes[e].every(b => inside.has(b)));
      if (mid !== undefined) return mid;
    }
    // Otherwise open it with whichever of its edges gives away the least.
    return minGiveaway(s, target.edges, rng);
  }

  /**
   * Safe-phase look-ahead (2 players). Near the end of the "safe" phase, whoever has to open the
   * first chain usually loses, so sample random continuations of the safe phase for each candidate
   * move and score the resulting endgame with endgameSolve(). Bounded by a time budget.
   */
  function hardSafe(s, safe, rng, numPlayers) {
    if (numPlayers !== 2 || safe.length > 40) return pick(safe, rng);
    const deadline = Date.now() + 120;
    let cands = safe.slice();
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    cands = cands.slice(0, 16);
    const trials = safe.length <= 12 ? 24 : 12;
    let bestScore = -Infinity, best = cands[0];
    for (const e of cands) {
      drawE(s, e);
      let total = 0, n = 0;
      for (let t = 0; t < trials; t++) {
        const played = [];
        for (;;) {
          const sf = safeEdges(s);
          if (!sf.length) break;
          const x = pick(sf, rng);
          drawE(s, x);
          played.push(x);
        }
        // After our move the opponent moves; after `played.length` more moves, who must open?
        const opponentToMove = played.length % 2 === 0;
        const comps = components(s);
        const v = comps.length ? endgameSolve(comps).value : 0;
        total += opponentToMove ? -v : v;
        n++;
        revert(s, played);
        if (Date.now() > deadline) break;
      }
      undrawE(s, e);
      const score = total / n;
      if (score > bestScore) { bestScore = score; best = e; }
      if (Date.now() > deadline) break;
    }
    return best;
  }

  /** Give away as few boxes as possible; among equals, prefer lines that leave no "domino" to double-deal. */
  function multiSacrifice(s, edges, rng) {
    let best = Infinity, bestList = [];
    for (const e of edges) {
      drawE(s, e);
      let threes = 0;
      for (let b = 0; b < s.T.nB; b++) if (s.sides[b] === 3) threes++;
      const gc = greedyCapture(s);
      revert(s, gc.edges);
      undrawE(s, e);
      const score = gc.count * 10 - threes; // more simultaneously-open boxes = harder to double-deal
      if (score < best) { best = score; bestList = [e]; }
      else if (score === best) bestList.push(e);
    }
    return pick(bestList, rng);
  }

  function chooseEdge(g, level, rng) {
    rng = rng || Math.random;
    const s = snapshot(g);
    const all = undrawnList(s);
    if (!all.length) return -1;
    const capt = capturableEdges(s);
    const safe = safeEdges(s);

    if (level === 'easy') {
      if (capt.length && rng() < 0.6) return pick(capt, rng);
      if (safe.length && rng() < 0.6) return pick(safe, rng);
      return pick(all, rng);
    }
    if (level === 'medium') {
      if (capt.length) return pick(capt, rng);
      if (safe.length) return pick(safe, rng);
      return minGiveaway(s, all, rng);
    }
    // hard
    if (g.numPlayers > 2) {
      // Control tactics (double-dealing, parity) only pay off with two players: with more,
      // boxes handed back go to someone else. Play the greedy-but-careful game instead.
      if (capt.length) return pick(capt, rng);
      if (safe.length) return pick(safe, rng);
      return multiSacrifice(s, all, rng);
    }
    if (capt.length) return hardCapture(s, capt, rng);
    if (safe.length) return hardSafe(s, safe, rng, g.numPlayers);
    return hardSacrifice(s, rng);
  }

  /** Returns {type, r, c} for the chosen line, or null if the board is full. */
  function chooseMove(g, level, rng) {
    const e = chooseEdge(g, level, rng);
    if (e < 0) return null;
    const T = topology(g.cols, g.rows);
    return { type: T.edgeType[e] ? 'v' : 'h', r: T.edgeR[e], c: T.edgeC[e] };
  }

  /** For the "assist" display: list of boxes with exactly three sides, as [r, c]. */
  function threeSidedBoxes(g) {
    const s = snapshot(g);
    const out = [];
    for (let b = 0; b < s.T.nB; b++) {
      if (s.sides[b] === 3) out.push([Math.floor(b / (g.cols - 1)), b % (g.cols - 1)]);
    }
    return out;
  }

  const api = { chooseMove, threeSidedBoxes, LEVELS: ['easy', 'medium', 'hard'], _internal: { snapshot, components, endgameSolve, safeEdges, capturableEdges } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
