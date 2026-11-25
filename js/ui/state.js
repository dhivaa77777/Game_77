/* Dots and Boxes UI: current game state and persistence.
 * D.state holds everything about the game on screen; other files read and update it.
 * Also saves the game in progress (for Resume) and records statistics.
 */
(function (D) {
  'use strict';

  const { E, C, KEYS, store } = D;

  D.state = {
    game: null,          // engine game object (see js/engine.js)
    cfg: null,           // { cols, rows, players: [{ name, color, type, symbol }] }
    players: [],
    labels: [],          // symbol shown in boxes, per player
    redoStack: [],
    paused: false,       // computer players paused
    hintMove: null,
    hintsUsed: 0,
    gameStart: 0,
    gameEnd: 0,
    statsRecorded: false,
    replay: null,        // { final, moves, idx, timer } while watching a replay
    cursor: { r: 0, c: 0 },
    pendingDraw: false   // keyboard: Enter pressed, waiting for a direction
  };
  const st = D.state;

  const isHuman = i => !!st.players[i] && st.players[i].type === 'human';
  const isAITurn = () => !!st.game && !st.game.over && !isHuman(st.game.current);
  const hasAI = () => st.players.some(p => p.type !== 'human');
  const hasHuman = () => st.players.some(p => p.type === 'human');
  D.who = { isHuman, isAITurn, hasAI, hasHuman };

  /* ---------- Saved game (resume) ---------- */
  function saveGame() {
    const g = st.game;
    if (!g || st.replay) return;
    if (g.over) { store.del(KEYS.save); return; }
    store.set(KEYS.save, {
      v: 2, cfg: st.cfg, start: st.gameStart, hints: st.hintsUsed,
      moves: g.history.map(m => [m.type, m.r, m.c])
    });
  }

  function loadSave() {
    const s = store.get(KEYS.save);
    if (!s || s.v !== 2 || !s.cfg || !Array.isArray(s.moves) || !Array.isArray(s.cfg.players)) return null;
    const c = s.cfg;
    if (!E.validSize(c.cols) || !E.validSize(c.rows) || c.players.length < 2 || c.players.length > 4) return null;
    const okPlayer = p => p && typeof p.name === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) && C.TYPES.includes(p.type) &&
      (p.symbol === undefined || (typeof p.symbol === 'string' && p.symbol.length <= 16));
    if (!c.players.every(okPlayer)) return null;
    try {
      const g = E.replay(c.cols, c.rows, c.players.length, s.moves);
      if (g.over) return null;
      return { cfg: c, game: g, start: Number(s.start) || Date.now(), hints: Number(s.hints) || 0 };
    } catch (e) { return null; }
  }

  /* ---------- Statistics ---------- */
  function loadStats() {
    const s = store.get(KEYS.stats);
    return s && typeof s === 'object' && s.players ? s : { games: 0, boxes: 0, players: {} };
  }

  function recordStats() {
    const g = st.game;
    if (st.statsRecorded || !g || !g.over) return;
    st.statsRecorded = true;
    const stats = loadStats();
    const lead = E.leaders(g);
    stats.games++;
    stats.boxes += g.totalBoxes;
    st.players.forEach((p, i) => {
      const key = p.type === 'human' ? 'h:' + p.name.toLowerCase() : 'c:' + p.type;
      const rec = stats.players[key] || (stats.players[key] = { name: '', games: 0, wins: 0, ties: 0, boxes: 0, best: 0 });
      rec.name = p.type === 'human' ? p.name : C.TYPE_LABEL[p.type];
      rec.games++;
      rec.boxes += g.scores[i];
      rec.best = Math.max(rec.best, g.scores[i]);
      if (lead.includes(i)) { if (lead.length === 1) rec.wins++; else rec.ties++; }
    });
    store.set(KEYS.stats, stats);
  }

  D.persist = { saveGame, loadSave, loadStats, recordStats };
})(window.DAB);
