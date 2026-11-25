/* Dots and Boxes AI: move choice for the computer players.
 *
 * Levels
 *   easy   - often grabs a free box, otherwise plays mostly at random.
 *   medium - always takes free boxes, avoids drawing a box's third side, and when forced
 *            gives away as few boxes as possible.
 *   hard   - medium, plus real endgame play (see chains.js): sacrifices the cheapest chain,
 *            opens 2-chains in the middle, declines the last two boxes of a chain to keep
 *            control, and looks ahead in the opening ("safe") phase. With 3-4 players it plays
 *            the careful greedy game, because control tactics only pay off with two players.
 *
 * Browser: window.DBAI. Node: module.exports. Needs model.js and chains.js.
 */
(function (root) {
  'use strict';

  const M = root.DBAIModel || require('./model.js');
  const C = root.DBAIChains || require('./chains.js');
  const {
    topology, snapshot, drawE, undrawE, revert, missingEdge, otherBox,
    undrawnList, capturableEdges, safeEdges, greedyCapture, giveaway
  } = M;
  const { components, endgameSolve } = C;

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

  const api = { chooseMove, threeSidedBoxes, LEVELS: ['easy', 'medium', 'hard'] };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
