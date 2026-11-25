/* Dots and Boxes: pure game engine (no DOM).
 *
 * Coordinates
 *   Dot (r, c): row r (0..rows-1), column c (0..cols-1).
 *   h[r][c]: horizontal line from dot (r,c) to dot (r,c+1)   r: 0..rows-1, c: 0..cols-2
 *   v[r][c]: vertical line from dot (r,c) to dot (r+1,c)     r: 0..rows-2, c: 0..cols-1
 *   boxes[r][c]: box whose top-left dot is (r,c)             r: 0..rows-2, c: 0..cols-2
 * Every cell holds -1 (empty) or the index of the player who drew or owns it.
 *
 * Works in the browser (window.DBEngine) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  const MIN_DOTS = 2;
  const MAX_DOTS = 20;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;

  function validSize(n) {
    return Number.isInteger(n) && n >= MIN_DOTS && n <= MAX_DOTS;
  }

  function createGame(cols, rows, numPlayers) {
    if (!validSize(cols) || !validSize(rows)) throw new RangeError('Invalid board size');
    if (!Number.isInteger(numPlayers) || numPlayers < MIN_PLAYERS || numPlayers > MAX_PLAYERS) {
      throw new RangeError('Invalid player count');
    }
    const grid = (r, c) => Array.from({ length: r }, () => new Array(c).fill(-1));
    return {
      cols, rows, numPlayers,
      h: grid(rows, cols - 1),
      v: grid(rows - 1, cols),
      boxes: grid(rows - 1, cols - 1),
      scores: new Array(numPlayers).fill(0),
      current: 0,
      history: [],
      totalBoxes: (rows - 1) * (cols - 1),
      totalLines: rows * (cols - 1) + (rows - 1) * cols,
      claimedCount: 0,
      over: false
    };
  }

  function edgeExists(g, type, r, c) {
    if (!Number.isInteger(r) || !Number.isInteger(c)) return false;
    if (type === 'h') return r >= 0 && r < g.rows && c >= 0 && c < g.cols - 1;
    if (type === 'v') return r >= 0 && r < g.rows - 1 && c >= 0 && c < g.cols;
    return false;
  }

  const lineGrid = (g, type) => (type === 'h' ? g.h : g.v);
  const isDrawn = (g, type, r, c) => lineGrid(g, type)[r][c] !== -1;

  function adjacentBoxes(g, type, r, c) {
    const out = [];
    if (type === 'h') {
      if (r > 0) out.push([r - 1, c]);
      if (r < g.rows - 1) out.push([r, c]);
    } else {
      if (c > 0) out.push([r, c - 1]);
      if (c < g.cols - 1) out.push([r, c]);
    }
    return out;
  }

  /** Number of drawn sides of box (r, c): 0..4 */
  function sidesOf(g, r, c) {
    return (g.h[r][c] !== -1) + (g.h[r + 1][c] !== -1) + (g.v[r][c] !== -1) + (g.v[r][c + 1] !== -1);
  }

  const boxComplete = (g, r, c) => sidesOf(g, r, c) === 4;

  function playMove(g, type, r, c) {
    if (g.over) return { ok: false, reason: 'over' };
    if (!edgeExists(g, type, r, c)) return { ok: false, reason: 'invalid' };
    if (isDrawn(g, type, r, c)) return { ok: false, reason: 'taken' };

    const player = g.current;
    lineGrid(g, type)[r][c] = player;
    const claimed = [];
    for (const [br, bc] of adjacentBoxes(g, type, r, c)) {
      if (g.boxes[br][bc] === -1 && boxComplete(g, br, bc)) {
        g.boxes[br][bc] = player;
        claimed.push([br, bc]);
      }
    }
    g.scores[player] += claimed.length;
    g.claimedCount += claimed.length;
    g.history.push({ type, r, c, player, claimed });

    if (g.claimedCount === g.totalBoxes) g.over = true;
    else if (claimed.length === 0) g.current = (player + 1) % g.numPlayers;
    return { ok: true, player, claimed, extraTurn: claimed.length > 0 && !g.over, over: g.over };
  }

  function undoMove(g) {
    const m = g.history.pop();
    if (!m) return null;
    lineGrid(g, m.type)[m.r][m.c] = -1;
    for (const [br, bc] of m.claimed) g.boxes[br][bc] = -1;
    g.scores[m.player] -= m.claimed.length;
    g.claimedCount -= m.claimed.length;
    g.current = m.player;
    g.over = false;
    return m;
  }

  /** Indices of the player(s) with the highest score. */
  function leaders(g) {
    const max = Math.max(...g.scores);
    return g.scores.map((s, i) => (s === max ? i : -1)).filter(i => i >= 0);
  }

  /** Rebuild a game from a list of moves ({type,r,c} or [type,r,c]). Throws on an illegal move. */
  function replay(cols, rows, numPlayers, moves, upto) {
    const g = createGame(cols, rows, numPlayers);
    const n = upto === undefined ? moves.length : Math.min(upto, moves.length);
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      const [t, r, c] = Array.isArray(m) ? m : [m.type, m.r, m.c];
      const res = playMove(g, t, r, c);
      if (!res.ok) throw new Error('Illegal move in replay at index ' + i + ': ' + res.reason);
    }
    return g;
  }

  function undrawnEdges(g) {
    const out = [];
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols - 1; c++) if (g.h[r][c] === -1) out.push({ type: 'h', r, c });
    for (let r = 0; r < g.rows - 1; r++) for (let c = 0; c < g.cols; c++) if (g.v[r][c] === -1) out.push({ type: 'v', r, c });
    return out;
  }

  const api = {
    MIN_DOTS, MAX_DOTS, MIN_PLAYERS, MAX_PLAYERS,
    validSize, createGame, edgeExists, isDrawn, adjacentBoxes, sidesOf,
    playMove, undoMove, leaders, replay, undrawnEdges
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
