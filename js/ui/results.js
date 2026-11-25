/* Dots and Boxes UI: end of game.
 * Results dialog (winner, scores, copy result), move-by-move replay, and the statistics dialog.
 */
(function (D) {
  'use strict';

  const { $, E, C, KEYS, store } = D;
  const { textOn, plural, fmtTime, joinNames, swatch, clamp } = D.util;
  const st = D.state;
  const { isHuman, hasAI, hasHuman } = D.who;
  const { sfx, toast } = D.fx;

  const resultDialog = $('resultDialog');
  const ranking = g => st.players.map((_, i) => i).sort((a, b) => g.scores[b] - g.scores[a] || a - b);

  /* ---------- Results ---------- */
  function resultText() {
    const g = st.game;
    const lead = E.leaders(g);
    const lines = [`Dots and Boxes · ${g.cols}×${g.rows} dots (${g.totalBoxes} boxes)`];
    lines.push(lead.length > 1 ? `🤝 Tie between ${joinNames(lead.map(i => st.players[i].name))}` : `🏆 ${st.players[lead[0]].name} wins!`);
    ranking(g).forEach((i, k) => lines.push(`${k + 1}. ${st.players[i].name} (${st.labels[i]}): ${g.scores[i]}`));
    if (st.gameEnd) lines.push(`Played in ${fmtTime(st.gameEnd - st.gameStart)}`);
    return lines.join('\n');
  }

  function show() {
    const g = st.game;
    if (!g || !g.over) return;
    const lead = E.leaders(g);
    const sw = $('winnerSwatch');
    sw.className = 'winner-swatch';
    sw.style.background = '';
    const humanWinner = lead.length === 1 && isHuman(lead[0]);
    const humanLost = hasAI() && hasHuman() && lead.every(i => !isHuman(i));
    $('trophy').textContent = lead.length > 1 ? '🤝' : humanLost ? '🤖' : '🏆';

    if (lead.length === 1) {
      const w = st.players[lead[0]];
      sw.style.background = w.color; sw.style.color = textOn(w.color); sw.textContent = st.labels[lead[0]];
      $('resultTitle').textContent = `${w.name} wins!`;
      $('resultTitle').style.color = w.color;
      const runnerUp = Math.max(...g.scores.filter((_, i) => i !== lead[0]));
      let sub = `${w.name} claimed ${g.scores[lead[0]]} of ${g.totalBoxes} boxes, winning by ${plural(g.scores[lead[0]] - runnerUp, 'box', 'boxes')}.`;
      if (humanLost) sub += ' Try again or lower the difficulty.';
      else if (humanWinner && hasAI()) sub += ' Nicely played!';
      $('resultSub').textContent = sub;
    } else {
      sw.classList.add('tie'); sw.textContent = '';
      sw.style.setProperty('--c1', st.players[lead[0]].color);
      sw.style.setProperty('--c2', st.players[lead[1]].color);
      $('resultTitle').textContent = 'It\'s a tie!';
      $('resultTitle').style.color = '';
      $('resultSub').textContent = `${joinNames(lead.map(i => st.players[i].name))} share the top score with ${plural(g.scores[lead[0]], 'box', 'boxes')} each.`;
    }

    const ol = $('resultList');
    ol.textContent = '';
    let rank = 0, prev = null;
    ranking(g).forEach((i, pos) => {
      if (g.scores[i] !== prev) { rank = pos + 1; prev = g.scores[i]; }
      const li = document.createElement('li');
      if (lead.includes(i)) li.className = 'top';
      const rk = document.createElement('span'); rk.className = 'rank'; rk.textContent = rank;
      const nm = document.createElement('span'); nm.className = 'n'; nm.textContent = st.players[i].name;
      const bar = document.createElement('span'); bar.className = 'bar';
      const fill = document.createElement('i');
      fill.style.width = (g.scores[i] / g.totalBoxes * 100) + '%';
      fill.style.background = st.players[i].color;
      bar.appendChild(fill);
      const sc = document.createElement('span'); sc.className = 's'; sc.textContent = g.scores[i];
      li.append(rk, swatch(st.players[i].color), nm, bar, sc);
      li.setAttribute('aria-label', `Rank ${rank}: ${st.players[i].name}, ${plural(g.scores[i], 'box', 'boxes')}`);
      ol.appendChild(li);
    });

    const meta = $('resultMeta');
    meta.textContent = '';
    const items = [`Total squares: ${g.totalBoxes}`, `${g.cols}×${g.rows} dots`, `${g.history.length} lines`];
    if (st.gameEnd) items.push(`Time ${fmtTime(st.gameEnd - st.gameStart)}`);
    if (st.hintsUsed) items.push(plural(st.hintsUsed, 'hint'));
    items.forEach(t => { const s = document.createElement('span'); s.textContent = t; meta.appendChild(s); });
    D.dialogs.open(resultDialog);
    $('playAgainBtn').focus();
  }

  async function copyResult() {
    const text = resultText();
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { /* fall back */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      resultDialog.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    toast(ok ? 'Result copied to clipboard' : 'Could not copy. Select and copy manually.');
  }

  $('playAgainBtn').addEventListener('click', () => { resultDialog.close(); D.game.start(st.cfg); });
  $('toSetupBtn').addEventListener('click', () => { resultDialog.close(); D.game.goToSetup(); });
  $('replayBtn').addEventListener('click', () => { resultDialog.close(); enterReplay(); });
  $('copyBtn').addEventListener('click', copyResult);

  /* ---------- Replay ---------- */
  function enterReplay() {
    const g = st.game;
    if (!g || !g.over || st.replay) return;
    D.game.stopAll();
    st.replay = { final: g, moves: g.history.map(m => [m.type, m.r, m.c]), idx: 0, timer: 0 };
    $('replayBar').hidden = false;
    $('rpSlider').max = st.replay.moves.length;
    replayGoto(0, false);
    replayPlay();
  }
  function replayGoto(i, animate) {
    const rp = st.replay;
    if (!rp) return;
    rp.idx = clamp(i, 0, rp.moves.length);
    st.game = E.replay(rp.final.cols, rp.final.rows, rp.final.numPlayers, rp.moves, rp.idx);
    D.game.refresh(animate && rp.idx > 0 ? { ok: true } : null);
    $('rpSlider').value = rp.idx;
    $('rpCount').textContent = `${rp.idx} / ${rp.moves.length}`;
  }
  function replayPlay() {
    const rp = st.replay;
    if (!rp) return;
    if (rp.timer) { stopReplayPlayback(); return; }
    if (rp.idx >= rp.moves.length) replayGoto(0, false);
    $('rpPlay').querySelector('use').setAttribute('href', '#i-pause');
    rp.timer = setInterval(() => {
      if (rp.idx >= rp.moves.length) { stopReplayPlayback(); return; }
      replayGoto(rp.idx + 1, true);
      const m = st.game.history[st.game.history.length - 1];
      if (m && m.claimed.length) sfx.box(m.claimed.length); else sfx.cpu();
    }, C.REPLAY_MS[D.settings.speed] || 380);
  }
  function stopReplayPlayback() {
    if (!st.replay) return;
    clearInterval(st.replay.timer);
    st.replay.timer = 0;
    $('rpPlay').querySelector('use').setAttribute('href', '#i-play');
  }
  function exitReplay() {
    if (!st.replay) return;
    stopReplayPlayback();
    st.game = st.replay.final;
    st.replay = null;
    $('replayBar').hidden = true;
    D.hud.resetLog();
    D.game.refresh(null);
  }
  const step = (delta, animate) => () => { stopReplayPlayback(); replayGoto(st.replay.idx + delta, animate); };
  $('rpPlay').addEventListener('click', replayPlay);
  $('rpFirst').addEventListener('click', () => { stopReplayPlayback(); replayGoto(0, false); });
  $('rpLast').addEventListener('click', () => { stopReplayPlayback(); replayGoto(Infinity, false); });
  $('rpPrev').addEventListener('click', step(-1, false));
  $('rpNext').addEventListener('click', step(1, true));
  $('rpSlider').addEventListener('input', e => { stopReplayPlayback(); replayGoto(Number(e.target.value), false); });
  $('rpExit').addEventListener('click', exitReplay);

  /* ---------- Statistics dialog ---------- */
  function showStats() {
    const stats = D.persist.loadStats();
    const body = $('statsBody');
    body.textContent = '';
    const rows = Object.values(stats.players).sort((a, b) => b.wins - a.wins || (b.wins / b.games) - (a.wins / a.games) || b.games - a.games);
    const summary = document.createElement('div');
    summary.className = 'stats-summary';
    const best = rows.reduce((m, r) => Math.max(m, r.best), 0);
    [[stats.games, 'Games played'], [stats.boxes, 'Boxes claimed'], [best, 'Best score']].forEach(([v, l]) => {
      const d = document.createElement('div');
      const s = document.createElement('strong'); s.textContent = v;
      const sm = document.createElement('small'); sm.textContent = l;
      d.append(s, sm); summary.appendChild(d);
    });
    body.appendChild(summary);
    if (!rows.length) {
      const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No finished games yet. Play one to start tracking stats.';
      body.appendChild(p);
    } else {
      const wrap = document.createElement('div'); wrap.className = 'stats-wrap';
      const tbl = document.createElement('table'); tbl.className = 'stats-table';
      tbl.innerHTML = '<thead><tr><th scope="col">Player</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Tied</th><th scope="col">Win %</th><th scope="col">Avg</th><th scope="col">Best</th></tr></thead>';
      const tb = document.createElement('tbody');
      rows.forEach(r => {
        const tr = document.createElement('tr');
        [r.name, r.games, r.wins, r.ties, Math.round(r.wins / r.games * 100) + '%', (r.boxes / r.games).toFixed(1), r.best].forEach((v, i) => {
          const td = document.createElement(i === 0 ? 'th' : 'td');
          if (i === 0) td.scope = 'row';
          td.textContent = v; tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb); wrap.appendChild(tbl); body.appendChild(wrap);
    }
    D.dialogs.open($('statsDialog'));
  }
  $('resetStatsBtn').addEventListener('click', async () => {
    $('statsDialog').close();
    if (await D.dialogs.confirm('Reset statistics?', 'All recorded games and scores will be deleted.', 'Reset')) {
      store.del(KEYS.stats);
      toast('Statistics reset');
    }
    showStats();
  });

  D.results = { show, enterReplay, exitReplay, replayGoto, stopReplayPlayback, showStats };
})(window.DAB);
