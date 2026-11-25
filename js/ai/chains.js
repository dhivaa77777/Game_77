/* Dots and Boxes AI: chains, loops and endgame solving.
 * Late in the game the board breaks into chains and loops of boxes. This file finds them
 * and works out the best order to give them away.
 * Browser: window.DBAIChains. Node: module.exports. Needs model.js.
 */
(function (root) {
  'use strict';

  const M = root.DBAIModel || require('./model.js');
  const { otherBox } = M;

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

  const api = { components, endgameSolve };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBAIChains = api;
})(typeof window !== 'undefined' ? window : globalThis);
