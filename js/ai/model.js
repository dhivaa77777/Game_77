/* Dots and Boxes AI: board model.
 * A compact, flat-array copy of the board that the AI can change and undo very quickly
 * (draw a line, take boxes greedily, revert). Shared by chains.js and ai.js.
 * Browser: window.DBAIModel. Node: module.exports.
 */
(function (root) {
  'use strict';

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

  const api = {
    topology, snapshot, drawE, undrawE, revert, missingEdge, otherBox,
    undrawnList, capturableEdges, safeEdges, greedyCapture, giveaway
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBAIModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
