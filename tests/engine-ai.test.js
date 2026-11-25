// Run with: node tests/engine-ai.test.js   (no dependencies)
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'engine.js'));
const AI = require(path.join(__dirname, '..', 'js', 'ai', 'ai.js'));

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('FAIL ' + msg); } };

// ---- Engine: random full games on many board shapes and player counts ----
const sizes = [[2, 2], [2, 5], [5, 2], [3, 3], [4, 6], [10, 10], [10, 11], [11, 10], [12, 12], [20, 20]];
let games = 0, doubles = 0;
for (const [cols, rows] of sizes) for (const np of [2, 3, 4]) for (let t = 0; t < 8; t++) {
  const g = E.createGame(cols, rows, np); games++;
  const edges = E.undrawnEdges(g).sort(() => Math.random() - 0.5);
  edges.forEach((e, idx) => {
    const before = g.current;
    const res = E.playMove(g, e.type, e.r, e.c);
    check(res.ok, 'legal move rejected');
    let complete = 0;
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const full = E.sidesOf(g, r, c) === 4;
      if (full) complete++;
      check(full === (g.boxes[r][c] !== -1), 'box ownership matches completion');
    }
    check(complete === g.claimedCount, 'claimed count');
    check(g.scores.reduce((a, b) => a + b, 0) === complete, 'scores add up');
    if (res.claimed.length === 2) doubles++;
    if (res.claimed.length && !g.over) check(g.current === before, 'extra turn after completing a box');
    if (!res.claimed.length) check(g.current === (before + 1) % np, 'turn passes when no box completed');
    check(!E.playMove(g, e.type, e.r, e.c).ok, 'duplicate line rejected');
    check(g.over === (idx === edges.length - 1), 'game ends exactly on the last line');
  });
  check(!E.playMove(g, 'h', 0, 0).ok, 'no moves after game end');
  while (g.history.length) E.undoMove(g);
  check(g.claimedCount === 0 && g.current === 0 && !g.over && g.scores.every(s => s === 0), 'undo back to start');
}
for (const bad of [[1, 5], [5, 1], [21, 5], [5.5, 5], [NaN, 4]]) {
  let threw = false; try { E.createGame(bad[0], bad[1], 2); } catch (e) { threw = true; }
  check(threw, 'rejects board size ' + bad);
}
{ // explicit double box: 3x2 dots, middle line last
  const g = E.createGame(3, 2, 3);
  [['h', 0, 0], ['h', 0, 1], ['h', 1, 0], ['h', 1, 1], ['v', 0, 0], ['v', 0, 2]].forEach(m => E.playMove(g, ...m));
  const who = g.current, r = E.playMove(g, 'v', 0, 1);
  check(r.claimed.length === 2 && g.scores[who] === 2 && g.over, 'one line completes two boxes');
}
console.log(`engine: ${games} random games, ${doubles} double-box moves`);

// ---- AI: legal play everywhere, and stronger levels win more ----
function play(cols, rows, levels) {
  const g = E.createGame(cols, rows, levels.length);
  while (!g.over) {
    const m = AI.chooseMove(g, levels[g.current]);
    check(E.playMove(g, m.type, m.r, m.c).ok, 'AI move is legal');
  }
  return g.scores;
}
for (const [c, r] of [[2, 2], [2, 9], [9, 2], [10, 11]]) for (const np of [2, 3, 4]) {
  play(c, r, ['easy', 'medium', 'hard', 'hard'].slice(0, np));
}
function winRate(a, b, n, size) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const flip = i % 2 === 1;
    const s = play(size, size, flip ? [b, a] : [a, b]);
    if ((flip ? s[1] : s[0]) > (flip ? s[0] : s[1])) wins++;
  }
  return wins / n;
}
const hm = winRate('hard', 'medium', 60, 5);
const me = winRate('medium', 'easy', 60, 5);
console.log(`ai: hard beats medium ${(hm * 100).toFixed(0)}%, medium beats easy ${(me * 100).toFixed(0)}% (5x5)`);
check(hm > 0.65, 'hard should clearly beat medium');
check(me > 0.85, 'medium should clearly beat easy');

console.log(failures ? `${failures} FAILURE(S)` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
