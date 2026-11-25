/* Dots and Boxes UI: game flow.
 * Starting a game, playing moves, scheduling computer turns, the turn timer,
 * undo/redo, hints, pause, the toolbar and keyboard shortcuts.
 */
(function (D) {
  'use strict';

  const { $, E, AI, C, KEYS, store } = D;
  const { computeLabels, plural, moveName } = D.util;
  const st = D.state;
  const { isHuman, isAITurn, hasAI, hasHuman } = D.who;
  const { sfx, toast, announce, vibrate } = D.fx;

  const setupScreen = $('setup'), gameScreen = $('game');
  let aiTimer = 0, resultTimer = 0, timerRaf = 0;

  /** Redraw board + surrounding panels. */
  function refresh(lastResult) {
    D.board.sync(lastResult);
    D.hud.update(lastResult);
  }

  /** Start a game from a config ({cols, rows, players}); pass `save` to resume a saved game. */
  function start(config, save) {
    stopAll();
    st.cfg = { cols: config.cols, rows: config.rows, players: config.players.map(p => ({ ...p })) };
    st.players = st.cfg.players;
    const fallback = computeLabels(st.players.map(p => p.name));
    st.labels = st.players.map((p, i) => (typeof p.symbol === 'string' && p.symbol.trim() ? p.symbol.trim() : fallback[i]));
    st.game = save ? save.game : E.createGame(st.cfg.cols, st.cfg.rows, st.players.length);
    st.gameStart = save ? save.start : Date.now();
    st.hintsUsed = save ? save.hints : 0;
    st.gameEnd = 0;
    st.redoStack = []; st.paused = false; st.hintMove = null; st.statsRecorded = false; st.replay = null;
    st.cursor = { r: 0, c: 0 }; st.pendingDraw = false;

    setupScreen.hidden = true;
    gameScreen.hidden = false;
    D.setup.logoStop();
    $('replayBar').hidden = true;
    $('gameMeta').textContent = `${st.cfg.cols}×${st.cfg.rows} · ${st.players.length} players`;
    $('pauseBtn').hidden = !hasAI();
    $('hintBtn').hidden = !hasHuman();
    D.board.build();
    D.hud.buildScoreboard();
    refresh(null);
    D.persist.saveGame();
    announce(save
      ? `Game resumed. ${st.players[st.game.current].name}'s turn.`
      : `New game. ${st.cfg.cols} by ${st.cfg.rows} dots. ${st.players[0].name} goes first.`);
    if (save) toast('Game resumed');
    afterTurn();
  }

  function stopAll() {
    clearTimeout(aiTimer); aiTimer = 0;
    clearTimeout(resultTimer); resultTimer = 0;
    stopTurnTimer();
    if (st.replay) D.results.stopReplayPlayback();
  }

  /* ---------- Moves ---------- */
  function attemptMove(type, r, c, source) {
    const g = st.game;
    if (!g || g.over || st.replay) return false;
    if (source === 'human' && isAITurn()) {
      toast(`Wait for ${st.players[g.current].name} to move`);
      return false;
    }
    const res = E.playMove(g, type, r, c);
    if (!res.ok) {
      if (res.reason === 'taken' && source === 'human') {
        sfx.error();
        D.board.shake();
        announce('That line has already been drawn.');
      }
      return false;
    }
    st.redoStack = [];
    st.hintMove = null;
    stopTurnTimer();
    if (res.claimed.length) { sfx.box(res.claimed.length); vibrate(res.claimed.length > 1 ? [18, 40, 18] : 22); }
    else if (source === 'ai') sfx.cpu(); else sfx.line();
    refresh(res);
    D.persist.saveGame();

    const who = st.players[res.player].name;
    let msg = `${who} drew ${moveName({ type, r, c })}.`;
    if (res.claimed.length) msg += ` ${who} claimed ${res.claimed.length === 2 ? 'two boxes' : 'a box'} and has ${g.scores[res.player]}.`;
    if (res.over) msg += ' All boxes are claimed. Game over.';
    else msg += res.extraTurn ? ` ${who} goes again.` : ` ${st.players[g.current].name}'s turn.`;
    announce(msg);

    if (res.over) onGameOver();
    else afterTurn(res);
    return true;
  }

  /** What happens next: schedule the computer's move, or start the person's turn timer. */
  function afterTurn(lastRes) {
    clearTimeout(aiTimer); aiTimer = 0;
    stopTurnTimer();
    const g = st.game;
    if (!g || g.over || st.replay || D.dialogs.isOpen() || gameScreen.hidden) return;
    if (isAITurn()) {
      if (st.paused) return;
      let delay = C.SPEED_MS[D.settings.speed] || 520;
      if (lastRes && lastRes.extraTurn) delay *= 0.65;
      aiTimer = setTimeout(() => {
        aiTimer = 0;
        if (!isAITurn() || st.paused || st.replay || D.dialogs.isOpen()) return;
        const m = AI.chooseMove(st.game, st.players[st.game.current].type);
        if (m) attemptMove(m.type, m.r, m.c, 'ai');
      }, delay);
    } else {
      startTurnTimer();
    }
  }
  function pauseFlow() {
    clearTimeout(aiTimer); aiTimer = 0;
    stopTurnTimer();
    if (st.replay) D.results.stopReplayPlayback();
  }
  function resumeFlow() {
    if (!D.dialogs.isOpen() && st.game && !gameScreen.hidden) { refresh(null); afterTurn(); }
  }

  function onGameOver() {
    clearTimeout(aiTimer); aiTimer = 0;
    stopTurnTimer();
    st.gameEnd = Date.now();
    store.del(KEYS.save);
    D.persist.recordStats();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
      const lead = E.leaders(st.game);
      if (lead.length > 1) sfx.tie(); else sfx.win();
      D.fx.confetti(lead.map(i => st.players[i].color));
      D.results.show();
    }, D.settings.anim ? 700 : 150);
  }

  /* ---------- Undo / redo (undo also takes back the computer's replies) ---------- */
  const canUndo = () => !!st.game && !st.game.over && !st.replay && hasHuman() && st.game.history.some(m => isHuman(m.player));
  const canRedo = () => !!st.game && !st.game.over && !st.replay && st.redoStack.length > 0 && isHuman(st.game.current);

  function undo() {
    if (!canUndo()) return;
    clearTimeout(aiTimer); aiTimer = 0;
    stopTurnTimer();
    const batch = [];
    while (st.game.history.length) {
      const m = E.undoMove(st.game);
      batch.unshift([m.type, m.r, m.c]);
      if (isHuman(m.player)) break;
    }
    st.redoStack.push(batch);
    st.hintMove = null;
    sfx.undo();
    refresh(null);
    D.persist.saveGame();
    announce(`Undid ${plural(batch.length, 'move')}. ${st.players[st.game.current].name}'s turn.`);
    afterTurn();
  }
  function redo() {
    if (!canRedo()) return;
    const batch = st.redoStack.pop();
    let res = null;
    for (const [t, r, c] of batch) res = E.playMove(st.game, t, r, c);
    st.hintMove = null;
    sfx.line();
    refresh(null);
    D.persist.saveGame();
    announce(`Redid ${plural(batch.length, 'move')}.`);
    if (st.game.over) onGameOver(); else afterTurn(res);
  }

  /* ---------- Hint & pause ---------- */
  function hint() {
    const g = st.game;
    if (!g || g.over || st.replay || !isHuman(g.current)) return;
    if (st.hintMove) { st.hintMove = null; refresh(null); return; }
    st.hintMove = AI.chooseMove(g, 'hard');
    if (!st.hintMove) return;
    st.hintsUsed++;
    sfx.hint();
    refresh(null);
    D.persist.saveGame();
    announce(`Hint: draw ${moveName(st.hintMove)}.`);
  }
  function togglePause() {
    if (!st.game || st.game.over || !hasAI()) return;
    st.paused = !st.paused;
    toast(st.paused ? 'Computer paused' : 'Computer resumed');
    refresh(null);
    afterTurn();
  }

  /* ---------- Turn timer ---------- */
  function startTurnTimer() {
    stopTurnTimer();
    const g = st.game;
    if (!D.settings.timer || !g || g.over || st.replay || isAITurn() || D.dialogs.isOpen()) return;
    const dur = D.settings.timer * 1000;
    const end = performance.now() + dur;
    const bar = D.hud.timerBar(g.current);
    let lastSec = Infinity;
    const tick = () => {
      const left = end - performance.now();
      bar.style.width = Math.max(0, left / dur * 100) + '%';
      const sec = Math.ceil(left / 1000);
      if (sec <= 3 && sec < lastSec && sec > 0) { lastSec = sec; sfx.tick(); }
      if (left <= 0) {
        timerRaf = 0;
        bar.style.width = '0';
        const p = st.players[st.game.current];
        const m = AI.chooseMove(st.game, 'medium');
        toast(`Time's up! A move was made for ${p.name}.`);
        if (m) attemptMove(m.type, m.r, m.c, 'timer');
        return;
      }
      timerRaf = requestAnimationFrame(tick);
    };
    timerRaf = requestAnimationFrame(tick);
  }
  function stopTurnTimer() {
    if (timerRaf) cancelAnimationFrame(timerRaf);
    timerRaf = 0;
    D.hud.clearTimerBars();
  }

  /* ---------- Toolbar ---------- */
  const inProgress = () => st.game && st.game.history.length > 0 && !st.game.over;

  function goToSetup() {
    stopAll();
    if (st.replay) { st.game = st.replay.final; st.replay = null; }
    if ($('resultDialog').open) $('resultDialog').close();
    st.game = null;
    gameScreen.hidden = true;
    setupScreen.hidden = false;
    D.setup.show();
    window.scrollTo(0, 0);
  }

  const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  $('fullBtn').hidden = !fsSupported;
  function toggleFullscreen() {
    if (!fsSupported) return;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
    } catch (e) { /* ignore */ }
  }

  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('hintBtn').addEventListener('click', hint);
  $('pauseBtn').addEventListener('click', togglePause);
  $('fullBtn').addEventListener('click', toggleFullscreen);
  $('settingsBtn').addEventListener('click', () => D.dialogs.open($('settingsDialog')));
  $('rulesBtn').addEventListener('click', () => D.dialogs.open($('rulesDialog')));
  $('restartBtn').addEventListener('click', async () => {
    if (inProgress() && !(await D.dialogs.confirm('Restart game?', 'The board will be cleared and all scores reset. Players and board size stay the same.', 'Restart'))) return;
    start(st.cfg);
  });
  $('newBtn').addEventListener('click', async () => {
    if (inProgress() && !(await D.dialogs.confirm('Leave this game?', 'Your game is saved: you can resume it from the setup screen until you start another one.', 'Go to setup'))) return;
    goToSetup();
  });

  /* ---------- Keyboard shortcuts ---------- */
  document.addEventListener('keydown', e => {
    if (gameScreen.hidden || D.dialogs.isOpen()) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const rp = st.replay;
    if (k === 'h') hint();
    else if (k === 'p' && hasAI()) togglePause();
    else if (k === 'm') { D.prefs.set('sound', !D.settings.sound); toast(D.settings.sound ? 'Sound on' : 'Sound off'); }
    else if (k === 'f') toggleFullscreen();
    else if (e.key === '?') D.dialogs.open($('rulesDialog'));
    else if (e.key === 'Escape' && rp) D.results.exitReplay();
    else if (rp && e.key === 'ArrowRight' && e.target !== $('board')) D.results.replayGoto(rp.idx + 1, true);
    else if (rp && e.key === 'ArrowLeft' && e.target !== $('board')) D.results.replayGoto(rp.idx - 1, false);
  });

  D.game = {
    start, stopAll, refresh, attemptMove, afterTurn, pauseFlow, resumeFlow,
    canUndo, canRedo, undo, redo, hint, togglePause, goToSetup
  };
})(window.DAB);
