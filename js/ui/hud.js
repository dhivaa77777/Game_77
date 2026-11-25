/* Dots and Boxes UI: heads-up display around the board.
 * Scoreboard cards, status line, score bar, progress counts, move history and toolbar button states.
 * Elements are created once per game and then updated in place.
 */
(function (D) {
  'use strict';

  const { $, E, C } = D;
  const { textOn, plural, moveName, swatch } = D.util;
  const st = D.state;
  const { isHuman, isAITurn, hasAI } = D.who;

  const scoreboard = $('scoreboard'), statusEl = $('status'), scorebar = $('scorebar'), logEl = $('moveLog');
  const wideMq = window.matchMedia ? window.matchMedia('(min-width: 980px)') : { matches: true };
  let cards = [], barSegs = [], logCount = 0;

  function buildScoreboard() {
    scoreboard.textContent = '';
    scorebar.textContent = '';
    cards = st.players.map((p, i) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.style.setProperty('--pc', p.color);
      card.innerHTML = '<span class="turn-badge">Turn</span><span class="swatch" aria-hidden="true"></span><span class="pname"></span><span class="pscore">0</span><span class="ptype"></span><span class="timer-bar" aria-hidden="true"></span>';
      const sw = card.querySelector('.swatch');
      sw.textContent = st.labels[i];
      sw.style.color = textOn(p.color);
      const nm = card.querySelector('.pname');
      nm.textContent = p.name; nm.title = p.name;
      card.querySelector('.ptype').textContent = C.TYPE_SHORT[p.type];
      card.querySelector('.turn-badge').textContent = isHuman(i) && hasAI() ? 'Your turn' : 'Turn';
      scoreboard.appendChild(card);
      return { card, score: card.querySelector('.pscore'), timer: card.querySelector('.timer-bar') };
    });
    barSegs = st.players.map(p => {
      const s = document.createElement('span');
      s.style.background = p.color;
      s.style.width = '0%';
      scorebar.appendChild(s);
      return s;
    });
    resetLog();
  }

  function resetLog() { logEl.textContent = ''; logCount = 0; }

  function renderLog() {
    const h = st.game.history;
    if (h.length < logCount) resetLog();
    if (h.length === logCount) return;
    const frag = document.createDocumentFragment();
    for (let i = logCount; i < h.length; i++) {
      const m = h[i];
      const li = document.createElement('li');
      const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
      const who = document.createElement('span'); who.className = 'who'; who.textContent = `${st.players[m.player].name} · ${moveName(m)}`;
      li.append(n, swatch(st.players[m.player].color, 'sw'), who);
      if (m.claimed.length) { const gn = document.createElement('span'); gn.className = 'gain'; gn.textContent = '+' + m.claimed.length; li.appendChild(gn); }
      frag.appendChild(li);
    }
    logEl.appendChild(frag);
    logCount = h.length;
    if (wideMq.matches) logEl.scrollTop = logEl.scrollHeight; // the log is only shown on wide screens
  }

  function renderStatus(lastResult) {
    const g = st.game;
    statusEl.textContent = '';
    const txt = document.createElement('span');
    const linkBtn = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'link'; b.type = 'button'; b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    if (st.replay) {
      txt.textContent = st.replay.idx === 0 ? 'Replay: start of game' : `Replay: move ${st.replay.idx} of ${st.replay.moves.length}`;
      statusEl.append(txt);
      return;
    }
    if (g.over) {
      const lead = E.leaders(g);
      txt.textContent = lead.length > 1 ? 'Game over: it\'s a tie!' : `Game over: ${st.players[lead[0]].name} wins!`;
      statusEl.append(txt, linkBtn('View results', D.results.show));
      return;
    }
    const p = st.players[g.current];
    if (st.paused && !isHuman(g.current)) {
      txt.textContent = 'Paused. ';
      statusEl.append(swatch(p.color), txt, linkBtn('Resume', D.game.togglePause));
      return;
    }
    if (lastResult && lastResult.extraTurn) {
      txt.textContent = `${p.name} completed ${lastResult.claimed.length === 2 ? 'two boxes' : 'a box'}. ${isHuman(g.current) ? 'Go again!' : 'Playing again…'}`;
    } else if (!isHuman(g.current)) {
      txt.textContent = `${p.name} is thinking…`;
    } else {
      txt.textContent = `${p.name}'s turn`;
    }
    if (st.pendingDraw) txt.textContent += ' (press an arrow key to draw)';
    statusEl.append(swatch(p.color), txt);
  }

  function updateButtons() {
    const g = st.game;
    $('undoBtn').disabled = !D.game.canUndo();
    $('redoBtn').disabled = !D.game.canRedo();
    $('hintBtn').disabled = !g || g.over || !!st.replay || !isHuman(g.current);
    $('hintBtn').classList.toggle('hint-on', !!st.hintMove);
    const pb = $('pauseBtn');
    pb.disabled = !g || g.over || !!st.replay;
    pb.querySelector('use').setAttribute('href', st.paused ? '#i-play' : '#i-pause');
    pb.querySelector('.label').textContent = st.paused ? 'Resume' : 'Pause';
    pb.setAttribute('aria-pressed', String(st.paused));
    $('restartBtn').disabled = !!st.replay;
  }

  /** Update everything around the board after a change. */
  function update(lastResult) {
    const g = st.game;
    const lead = g.claimedCount ? E.leaders(g) : [];
    const last = g.history[g.history.length - 1];
    const animate = !!(lastResult && lastResult.ok && D.settings.anim);
    cards.forEach(({ card, score }, i) => {
      const active = !g.over && i === g.current;
      card.classList.toggle('active', active);
      card.classList.toggle('leader', lead.includes(i));
      card.classList.toggle('thinking', active && !isHuman(i) && !st.paused && !st.replay);
      if (active) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
      if (score.textContent !== String(g.scores[i])) score.textContent = g.scores[i];
      card.setAttribute('aria-label', `${st.players[i].name}, ${C.TYPE_LABEL[st.players[i].type]}: ${plural(g.scores[i], 'box', 'boxes')}${active ? ', current turn' : ''}`);
    });
    if (animate && last && last.claimed.length) {
      const card = cards[last.player].card;
      card.classList.remove('bump');
      void card.offsetWidth; // restart the animation
      card.classList.add('bump');
    }
    barSegs.forEach((s, i) => { s.style.width = (g.scores[i] / g.totalBoxes * 100) + '%'; });
    $('progressBoxes').textContent = `${g.claimedCount}/${g.totalBoxes} boxes`;
    $('progressLines').textContent = `${g.history.length}/${g.totalLines} lines`;
    renderLog();
    renderStatus(lastResult);
    updateButtons();
  }

  const timerBar = i => (cards[i] ? cards[i].timer : null);
  const clearTimerBars = () => cards.forEach(c => { c.timer.style.width = '0'; });

  D.hud = { buildScoreboard, update, renderStatus, resetLog, timerBar, clearTimerBars };
})(window.DAB);
