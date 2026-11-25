/* Dots and Boxes UI: setup screen.
 * Step 1 chooses the board (dots across and down, with a live preview).
 * Step 2 adds the players: name, colour, symbol (auto-filled from the name) and who plays them.
 * Also: the resume card, the animated logo, and validation before a game starts.
 */
(function (D) {
  'use strict';

  const { $, E, AI, C, KEYS, store } = D;
  const { svgEl, colorDistance, clamp, plural, joinNames, graphemes } = D.util;
  const settings = D.settings;

  const setupScreen = $('setup');
  const form = $('setupForm'), playerRows = $('playerRows');
  const colsInput = $('cols'), rowsInput = $('rows');
  const setupError = $('setupError'), step1Error = $('step1Error'), boardInfo = $('boardInfo');

  /* =====================================================================
   * Player symbols (shown inside the boxes a player claims)
   * ===================================================================== */
  const capFirst = g => g.charAt(0).toUpperCase() + g.slice(1);

  /** Possible automatic symbols for a name, best first: "Ravi" → R, Ra; "Ravi Kumar" → R, RK, Ra. */
  function symbolCandidates(name, i) {
    const t = name.trim();
    const words = t.split(/\s+/).filter(Boolean);
    const letters = graphemes(t.replace(/\s+/g, ''));
    const out = [];
    if (letters.length) out.push(letters[0].toUpperCase());
    if (words.length > 1) out.push((graphemes(words[0])[0] + graphemes(words[1])[0]).toUpperCase());
    if (letters.length > 1) out.push(capFirst(letters[0].toUpperCase() + letters[1].toLowerCase()));
    out.push(String(i + 1));
    return out;
  }

  /** Fill in symbols for players who haven't typed their own, keeping every symbol different. */
  function refreshAutoSymbols() {
    const ps = settings.players.slice(0, settings.numPlayers);
    const taken = new Set(ps.filter(p => !p.symbolAuto && p.symbol).map(p => p.symbol.toLowerCase()));
    const firsts = ps.map((p, i) => (p.symbolAuto ? symbolCandidates(p.name || `Player ${i + 1}`, i)[0].toLowerCase() : null));
    ps.forEach((p, i) => {
      if (!p.symbolAuto) return;
      const cands = symbolCandidates(p.name || `Player ${i + 1}`, i);
      let chosen = cands.find(c => !taken.has(c.toLowerCase()) && !firsts.some((f, j) => j !== i && f === c.toLowerCase()));
      if (!chosen) chosen = cands.find(c => !taken.has(c.toLowerCase())) || String(i + 1);
      p.symbol = chosen;
      taken.add(chosen.toLowerCase());
    });
    playerRows.querySelectorAll('.symbol-input').forEach(inp => {
      const p = settings.players[Number(inp.dataset.idx)];
      if (p.symbolAuto && document.activeElement !== inp) inp.value = p.symbol;
      if (p.symbolAuto) inp.placeholder = p.symbol;
    });
  }

  /* =====================================================================
   * Player rows
   * ===================================================================== */
  const isDefaultHumanName = (name, i) => !name.trim() || name.trim() === `Player ${i + 1}`;
  const isDefaultCpuName = (name, i) => name.trim() === C.CPU_NAMES[i];

  function setPlayerType(i, type) {
    const p = settings.players[i];
    const wasHuman = p.type === 'human';
    p.type = type;
    if (type !== 'human' && wasHuman && isDefaultHumanName(p.name, i)) p.name = C.CPU_NAMES[i];
    if (type === 'human' && !wasHuman && isDefaultCpuName(p.name, i)) p.name = `Player ${i + 1}`;
  }

  function input(cls, idx, field, label) {
    const el = document.createElement('input');
    el.type = field === 'color' ? 'color' : 'text';
    el.className = cls;
    el.dataset.idx = idx; el.dataset.field = field;
    el.setAttribute('aria-label', label);
    if (field !== 'color') { el.autocomplete = 'off'; el.spellcheck = false; }
    return el;
  }

  function renderPlayerRows() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < settings.numPlayers; i++) {
      const p = settings.players[i];
      const row = document.createElement('div');
      row.className = 'player-row';
      const num = document.createElement('span');
      num.className = 'num'; num.textContent = i + 1; num.setAttribute('aria-hidden', 'true');
      const color = input('color-input', i, 'color', `Colour for player ${i + 1}`);
      color.value = p.color;
      const name = input('text-input', i, 'name', `Name of player ${i + 1}`);
      name.value = p.name; name.maxLength = 16; name.placeholder = `Player ${i + 1} name`;
      const sym = input('text-input symbol-input', i, 'symbol', `Symbol for player ${i + 1}, shown in boxes they claim`);
      sym.value = p.symbol || '';
      sym.title = 'Symbol shown in boxes this player claims (1–2 letters or an emoji)';
      const type = document.createElement('select');
      type.className = 'select'; type.dataset.idx = i; type.dataset.field = 'type';
      type.setAttribute('aria-label', `Player ${i + 1} is played by`);
      for (const t of C.TYPES) {
        const o = document.createElement('option');
        o.value = t; o.textContent = t === 'human' ? 'Person' : C.TYPE_LABEL[t]; o.selected = p.type === t;
        type.appendChild(o);
      }
      row.append(num, color, name, sym, type);
      frag.appendChild(row);
    }
    playerRows.textContent = '';
    playerRows.appendChild(frag);
    refreshAutoSymbols();
  }

  playerRows.addEventListener('input', e => {
    const t = e.target, f = t.dataset.field;
    if (!f || f === 'type') return;
    const p = settings.players[Number(t.dataset.idx)];
    t.removeAttribute('aria-invalid');
    if (f === 'symbol') {
      const g = graphemes(t.value.replace(/\s+/g, ''));
      if (g.length > C.MAX_SYMBOL) t.value = g.slice(0, C.MAX_SYMBOL).join('');
      const v = t.value.replace(/\s+/g, '');
      p.symbolAuto = v === '';
      if (v) p.symbol = v;
    } else {
      p[f] = t.value;
    }
    refreshAutoSymbols();
  });
  playerRows.addEventListener('focusout', e => { if (e.target.dataset.field === 'symbol') refreshAutoSymbols(); });
  playerRows.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.field !== 'type') return;
    const i = Number(t.dataset.idx);
    setPlayerType(i, t.value);
    playerRows.querySelector(`.text-input[data-idx="${i}"]`).value = settings.players[i].name;
    refreshAutoSymbols();
  });
  form.querySelectorAll('input[name="numPlayers"]').forEach(r => {
    r.addEventListener('change', () => { settings.numPlayers = Number(r.value); renderPlayerRows(); });
  });

  /* =====================================================================
   * Step 1: board size with live preview
   * ===================================================================== */
  function readDims() {
    const c = Number(colsInput.value), r = Number(rowsInput.value);
    return { c, r, ok: colsInput.value.trim() !== '' && rowsInput.value.trim() !== '' && E.validSize(c) && E.validSize(r) };
  }
  function renderPreview() {
    const svg = $('boardPreview');
    svg.textContent = '';
    const { c, r, ok } = readDims();
    if (!ok) return;
    const sp = 20, pad = 18;
    const W = pad * 2 + (c - 1) * sp, H = pad * 2 + (r - 1) * sp;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const frag = document.createDocumentFragment();
    for (let y = 0; y < r; y++) svgEl('line', { class: 'pg', x1: pad, y1: pad + y * sp, x2: pad + (c - 1) * sp, y2: pad + y * sp }, frag);
    for (let x = 0; x < c; x++) svgEl('line', { class: 'pg', x1: pad + x * sp, y1: pad, x2: pad + x * sp, y2: pad + (r - 1) * sp }, frag);
    for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) svgEl('circle', { class: 'pd', cx: pad + x * sp, cy: pad + y * sp, r: 3 }, frag);
    svgEl('text', { class: 'pdim', x: W / 2, y: 11 }, frag).textContent = `${c} across`;
    svgEl('text', { class: 'pdim', x: 9, y: H / 2, transform: `rotate(-90 9 ${H / 2})` }, frag).textContent = `${r} down`;
    svg.appendChild(frag);
    svg.setAttribute('aria-label', `Board preview: ${c} dots across by ${r} dots down`);
  }
  function updateBoardInfo() {
    const { c, r, ok } = readDims();
    if (ok) {
      const boxes = (c - 1) * (r - 1);
      const lines = r * (c - 1) + (r - 1) * c;
      boardInfo.textContent = `${c} dots across × ${r} dots down = ${plural(boxes, 'box', 'boxes')} to claim (${lines} lines to draw).`;
    } else {
      boardInfo.textContent = `Choose between ${E.MIN_DOTS} and ${E.MAX_DOTS} dots in each direction.`;
    }
    renderPreview();
  }
  const dimsChanged = () => {
    colsInput.removeAttribute('aria-invalid'); rowsInput.removeAttribute('aria-invalid');
    step1Error.hidden = true;
    updateBoardInfo();
  };
  [colsInput, rowsInput].forEach(inp => inp.addEventListener('input', dimsChanged));
  form.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => {
    const inp = $(btn.dataset.step);
    let v = parseInt(inp.value, 10);
    if (!Number.isFinite(v)) v = 6;
    inp.value = clamp(v + Number(btn.dataset.delta), E.MIN_DOTS, E.MAX_DOTS);
    dimsChanged();
  }));
  form.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    const [c, r] = btn.dataset.preset.split('x');
    colsInput.value = c; rowsInput.value = r;
    dimsChanged();
  }));

  /* =====================================================================
   * Validation & steps
   * ===================================================================== */
  function showErrors(box, errors, firstInvalid) {
    box.textContent = '';
    const ul = document.createElement('ul');
    errors.forEach(msg => { const li = document.createElement('li'); li.textContent = msg; ul.appendChild(li); });
    box.appendChild(ul);
    box.hidden = false;
    if (firstInvalid) firstInvalid.focus();
  }

  function validateDims() {
    const errors = [];
    let firstInvalid = null;
    for (const [inp, label] of [[colsInput, 'Horizontal dots'], [rowsInput, 'Vertical dots']]) {
      const raw = inp.value.trim();
      if (raw === '' || !E.validSize(Number(raw))) {
        errors.push(`${label} must be a whole number from ${E.MIN_DOTS} to ${E.MAX_DOTS}.`);
        inp.setAttribute('aria-invalid', 'true');
        firstInvalid = firstInvalid || inp;
      }
    }
    return { errors, firstInvalid };
  }

  function validatePlayers() {
    const errors = [];
    let firstInvalid = null;
    const mark = el => { el.setAttribute('aria-invalid', 'true'); firstInvalid = firstInvalid || el; };
    const n = settings.numPlayers;
    const nameInputs = playerRows.querySelectorAll('.text-input:not(.symbol-input)');
    const symInputs = playerRows.querySelectorAll('.symbol-input');
    const colorInputs = playerRows.querySelectorAll('.color-input');
    const names = [];
    for (let i = 0; i < n; i++) {
      let nm = settings.players[i].name.trim().replace(/\s+/g, ' ');
      if (!nm) { nm = settings.players[i].type === 'human' ? `Player ${i + 1}` : C.CPU_NAMES[i]; nameInputs[i].value = nm; }
      settings.players[i].name = nm;
      names.push(nm.toLowerCase());
    }
    refreshAutoSymbols();
    for (let i = 0; i < n; i++) {
      if (names.indexOf(names[i]) !== i) {
        errors.push(`Each player needs a different name ("${settings.players[i].name}" is used twice).`);
        mark(nameInputs[i]);
        break;
      }
    }
    const syms = settings.players.slice(0, n).map(p => (p.symbol || '').toLowerCase());
    for (let i = 0; i < n; i++) {
      if (!syms[i]) { errors.push(`Player ${i + 1} needs a symbol.`); mark(symInputs[i]); break; }
      if (syms.indexOf(syms[i]) !== i) {
        errors.push(`Each player needs a different symbol ("${settings.players[i].symbol}" is used twice).`);
        mark(symInputs[i]);
        break;
      }
    }
    outer: for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (colorDistance(settings.players[i].color, settings.players[j].color) < 60) {
          errors.push(`${settings.players[i].name} and ${settings.players[j].name} have colours that are too similar. Pick more distinct colours.`);
          mark(colorInputs[j]);
          break outer;
        }
      }
    }
    return { errors, firstInvalid };
  }

  function showStep(n) {
    $('step1').hidden = n !== 1;
    $('step2').hidden = n !== 2;
    $('stepTab1').className = n === 1 ? 'current' : 'done';
    $('stepTab2').className = n === 2 ? 'current' : '';
    if (n === 2) {
      $('boardChip').textContent = `${colsInput.value} × ${rowsInput.value} dots (${plural((colsInput.value - 1) * (rowsInput.value - 1), 'box', 'boxes')})`;
      renderPlayerRows();
    }
    const card = document.querySelector('.setup-card');
    if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
  }

  $('nextBtn').addEventListener('click', () => {
    const { errors, firstInvalid } = validateDims();
    if (errors.length) { showErrors(step1Error, errors, firstInvalid); return; }
    step1Error.hidden = true;
    settings.cols = Number(colsInput.value);
    settings.rows = Number(rowsInput.value);
    D.prefs.save();
    showStep(2);
    const firstName = playerRows.querySelector('.text-input');
    if (firstName) firstName.focus();
  });
  $('backBtn').addEventListener('click', () => { setupError.hidden = true; showStep(1); colsInput.focus(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if ($('step2').hidden) { $('nextBtn').click(); return; } // Enter on step 1 = Next
    const dims = validateDims();
    if (dims.errors.length) { showStep(1); showErrors(step1Error, dims.errors, dims.firstInvalid); return; }
    const { errors, firstInvalid } = validatePlayers();
    if (errors.length) { showErrors(setupError, errors, firstInvalid); return; }
    setupError.hidden = true;
    settings.cols = Number(colsInput.value);
    settings.rows = Number(rowsInput.value);
    D.prefs.save();
    if (store.get(KEYS.save) && !(await D.dialogs.confirm('Start a new game?', 'You have a saved game in progress. Starting a new game will replace it.', 'Start new game'))) return;
    D.game.start({
      cols: settings.cols, rows: settings.rows,
      players: settings.players.slice(0, settings.numPlayers).map(p => ({ name: p.name, color: p.color, type: p.type, symbol: p.symbol }))
    });
  });

  /* =====================================================================
   * Resume card, header buttons
   * ===================================================================== */
  function renderResumeCard() {
    const save = D.persist.loadSave();
    $('resumeCard').hidden = !save;
    if (save) {
      const g = save.game;
      $('resumeInfo').textContent = `${joinNames(save.cfg.players.map(p => p.name))} · ${save.cfg.cols}×${save.cfg.rows} dots · ${g.claimedCount}/${g.totalBoxes} boxes claimed`;
    }
  }
  $('resumeBtn').addEventListener('click', () => {
    const save = D.persist.loadSave();
    if (!save) { renderResumeCard(); return; }
    D.game.start(save.cfg, save);
  });
  $('discardBtn').addEventListener('click', async () => {
    if (!(await D.dialogs.confirm('Discard saved game?', 'The game in progress will be deleted.', 'Discard'))) return;
    store.del(KEYS.save);
    renderResumeCard();
  });
  $('setupStatsBtn').addEventListener('click', () => D.results.showStats());
  $('setupSettingsBtn').addEventListener('click', () => D.dialogs.open($('settingsDialog')));

  /* =====================================================================
   * Animated logo: a tiny game playing itself
   * ===================================================================== */
  const logo = $('heroLogo');
  const LOGO_COLORS = C.DEFAULT_COLORS;
  let logoTimer = 0;
  function logoStart() {
    logoStop();
    const g = E.createGame(4, 3, 4);
    const S = 44, P = 12;
    const allEdges = E.undrawnEdges(g);
    const draw = () => {
      const frag = document.createDocumentFragment();
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const o = g.boxes[r][c];
        if (o !== -1) svgEl('rect', { x: P + c * S + 5, y: P + r * S + 5, width: S - 10, height: S - 10, rx: 6, fill: LOGO_COLORS[o] }, frag);
      }
      for (const e of allEdges) {
        const x1 = P + e.c * S, y1 = P + e.r * S;
        svgEl('line', { class: E.isDrawn(g, e.type, e.r, e.c) ? 'l' : 'g', x1, y1, x2: e.type === 'h' ? x1 + S : x1, y2: e.type === 'h' ? y1 : y1 + S }, frag);
      }
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) svgEl('circle', { class: 'd', cx: P + c * S, cy: P + r * S, r: 4.5 }, frag);
      logo.textContent = '';
      logo.appendChild(frag);
    };
    const play = () => { const m = AI.chooseMove(g, 'medium'); E.playMove(g, m.type, m.r, m.c); };
    if (!settings.anim) { while (!g.over) play(); draw(); return; }
    const step = () => {
      if (g.over) { logoTimer = setTimeout(() => { if (!setupScreen.hidden) logoStart(); }, 1600); return; }
      play(); draw();
      logoTimer = setTimeout(step, 420);
    };
    draw();
    logoTimer = setTimeout(step, 500);
  }
  function logoStop() { clearTimeout(logoTimer); logoTimer = 0; }

  /** Show the setup screen at step 1 with current settings. */
  function show() {
    colsInput.value = settings.cols;
    rowsInput.value = settings.rows;
    form.querySelectorAll('input[name="numPlayers"]').forEach(r => { r.checked = Number(r.value) === settings.numPlayers; });
    showStep(1);
    updateBoardInfo();
    renderResumeCard();
    logoStart();
  }

  D.setup = { show, logoStart, logoStop };
})(window.DAB);
