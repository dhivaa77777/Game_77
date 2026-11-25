/* Dots and Boxes: user interface.
 * Depends on js/engine.js (window.DBEngine) and js/ai.js (window.DBAI).
 */
(() => {
  'use strict';

  const E = window.DBEngine;
  const AI = window.DBAI;
  const $ = id => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* =====================================================================
   * STORAGE
   * ===================================================================== */
  const KEYS = { settings: 'dab:settings:v2', save: 'dab:save:v2', stats: 'dab:stats:v2' };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* =====================================================================
   * SETTINGS
   * ===================================================================== */
  const DEFAULT_COLORS = ['#2563eb', '#e11d48', '#16a34a', '#d97706'];
  const CPU_NAMES = ['Ada', 'Bolt', 'Cog', 'Dash'];
  const TYPES = ['human', 'easy', 'medium', 'hard'];
  const TYPE_LABEL = { human: 'Human', easy: 'Computer · Easy', medium: 'Computer · Medium', hard: 'Computer · Hard' };
  const TYPE_SHORT = { human: 'Person', easy: '🤖 Easy', medium: '🤖 Medium', hard: '🤖 Hard' };
  const SPEED_MS = { slow: 950, normal: 520, fast: 170 };
  const THEMES = ['light', 'dark', 'paper', 'auto'];
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const settings = {
    numPlayers: 2,
    players: DEFAULT_COLORS.map((color, i) => ({ name: `Player ${i + 1}`, color, type: 'human', symbol: '', symbolAuto: true })),
    cols: 6, rows: 6,
    sound: true, haptics: true, anim: !reducedMotion, assist: false,
    theme: 'light', speed: 'normal', timer: 0
  };
  (function loadSettings() {
    const s = store.get(KEYS.settings);
    if (!s || typeof s !== 'object') return;
    if ([2, 3, 4].includes(s.numPlayers)) settings.numPlayers = s.numPlayers;
    if (Array.isArray(s.players)) s.players.slice(0, 4).forEach((p, i) => {
      if (!p) return;
      if (typeof p.name === 'string') settings.players[i].name = p.name.slice(0, 16);
      if (/^#[0-9a-f]{6}$/i.test(p.color)) settings.players[i].color = p.color;
      if (TYPES.includes(p.type)) settings.players[i].type = p.type;
      if (typeof p.symbol === 'string' && p.symbol && p.symbol.length <= 16 && p.symbolAuto === false) {
        settings.players[i].symbol = p.symbol; settings.players[i].symbolAuto = false;
      }
    });
    if (E.validSize(s.cols)) settings.cols = s.cols;
    if (E.validSize(s.rows)) settings.rows = s.rows;
    for (const k of ['sound', 'haptics', 'anim', 'assist']) if (typeof s[k] === 'boolean') settings[k] = s[k];
    if (THEMES.includes(s.theme)) settings.theme = s.theme;
    if (SPEED_MS[s.speed]) settings.speed = s.speed;
    if ([0, 10, 20, 30, 60].includes(s.timer)) settings.timer = s.timer;
  })();
  const saveSettings = () => store.set(KEYS.settings, settings);

  /* =====================================================================
   * HELPERS
   * ===================================================================== */
  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const textOn = hex => (luminance(hex) > 0.4 ? '#0f172a' : '#ffffff');
  const colorDistance = (a, b) => { const x = hexToRgb(a), y = hexToRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const plural = (n, word, pl) => `${n} ${n === 1 ? word : (pl || word + 's')}`;
  const fmtTime = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const colLetter = c => String.fromCharCode(65 + c);
  function moveName(m) {
    return m.type === 'h'
      ? `${colLetter(m.c)}${m.r + 1}–${colLetter(m.c + 1)}${m.r + 1}`
      : `${colLetter(m.c)}${m.r + 1}–${colLetter(m.c)}${m.r + 2}`;
  }
  function joinNames(names) {
    return names.length <= 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  /** Short label per player for boxes: initial, or 2 letters if initials clash, else number. */
  function computeLabels(names) {
    const clean = names.map(n => n.replace(/[^\p{L}\p{N}]/gu, ''));
    for (let len = 1; len <= 2; len++) {
      const labels = clean.map(n => (Array.from(n).slice(0, len).join('') || '?').toUpperCase());
      if (new Set(labels).size === labels.length) return labels.map(l => l.charAt(0) + l.slice(1).toLowerCase());
    }
    return names.map((_, i) => String(i + 1));
  }

  /* =====================================================================
   * THEME
   * ===================================================================== */
  const darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    let t = settings.theme;
    if (t === 'auto') t = darkMq && darkMq.matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#0b1120' : t === 'paper' ? '#efe9dc' : '#f4f6fb';
  }
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', () => { if (settings.theme === 'auto') applyTheme(); });
  function applyAnim() { document.body.classList.toggle('anim', settings.anim); }

  /* =====================================================================
   * SOUND & HAPTICS
   * ===================================================================== */
  let actx = null;
  function tone(freq, dur, type, vol, delay) {
    if (!settings.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime + (delay || 0);
      const o = actx.createOscillator(), gn = actx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(vol || 0.08, t + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* audio not available */ }
  }
  const sfx = {
    line: () => tone(520, 0.08, 'triangle', 0.07),
    cpu: () => tone(440, 0.07, 'triangle', 0.05),
    box: n => { tone(660, 0.12, 'sine', 0.09); tone(880, 0.16, 'sine', 0.09, 0.08); if (n > 1) tone(1175, 0.2, 'sine', 0.08, 0.16); },
    error: () => tone(150, 0.12, 'square', 0.035),
    undo: () => tone(330, 0.09, 'triangle', 0.06),
    tick: () => tone(980, 0.05, 'square', 0.03),
    hint: () => { tone(740, 0.08, 'sine', 0.06); tone(988, 0.1, 'sine', 0.06, 0.07); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.08, i * 0.12)),
    tie: () => [523, 659, 523, 659].forEach((f, i) => tone(f, 0.2, 'triangle', 0.07, i * 0.14))
  };
  function vibrate(pattern) {
    if (settings.haptics && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }

  /* =====================================================================
   * TOAST, ANNOUNCER, DIALOGS
   * ===================================================================== */
  const toastEl = $('toast');
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }
  const announcer = $('announcer');
  function announce(msg) {
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 30);
  }
  const dialogOpen = () => !!document.querySelector('dialog[open]');
  function openDialog(dlg) {
    pauseFlow();
    if (!dlg.open) dlg.showModal();
  }
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('close', () => setTimeout(resumeFlow, 0));
    d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
    // click on backdrop closes informational dialogs
    if (d.id !== 'confirmDialog') d.addEventListener('click', e => { if (e.target === d) d.close(); });
  });
  const confirmDialog = $('confirmDialog');
  function confirmAction(title, msg, okLabel) {
    return new Promise(resolve => {
      $('confirmTitle').textContent = title;
      $('confirmMsg').textContent = msg;
      $('confirmOk').textContent = okLabel;
      confirmDialog.returnValue = '';
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
      openDialog(confirmDialog);
    });
  }

  // Rules content (setup page + dialog)
  const rulesTpl = $('rulesTpl');
  $('setupRules').appendChild(rulesTpl.content.cloneNode(true));
  $('rulesDialogBody').appendChild(rulesTpl.content.cloneNode(true));

  /* =====================================================================
   * SETUP SCREEN
   * ===================================================================== */
  const setupScreen = $('setup'), gameScreen = $('game');
  const form = $('setupForm'), playerRows = $('playerRows');
  const colsInput = $('cols'), rowsInput = $('rows');
  const setupError = $('setupError'), boardInfo = $('boardInfo');

  const isDefaultHumanName = (name, i) => !name.trim() || name.trim() === `Player ${i + 1}`;
  const isDefaultCpuName = (name, i) => name.trim() === CPU_NAMES[i];

  /* ---------- Player symbols (shown inside the boxes a player claims) ---------- */
  const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const graphemes = str => (segmenter ? Array.from(segmenter.segment(str), x => x.segment) : Array.from(str));
  const MAX_SYMBOL = 2;
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
  /** Fill in symbols for players who haven't typed their own, keeping all symbols different. */
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

  function setPlayerType(i, type) {
    const p = settings.players[i];
    const wasHuman = p.type === 'human';
    p.type = type;
    if (type !== 'human' && wasHuman && isDefaultHumanName(p.name, i)) p.name = CPU_NAMES[i];
    if (type === 'human' && !wasHuman && isDefaultCpuName(p.name, i)) p.name = `Player ${i + 1}`;
  }

  function renderPlayerRows() {
    playerRows.textContent = '';
    for (let i = 0; i < settings.numPlayers; i++) {
      const p = settings.players[i];
      const row = document.createElement('div');
      row.className = 'player-row';
      const num = document.createElement('span');
      num.className = 'num'; num.textContent = i + 1; num.setAttribute('aria-hidden', 'true');
      const color = document.createElement('input');
      color.type = 'color'; color.className = 'color-input'; color.value = p.color;
      color.setAttribute('aria-label', `Colour for player ${i + 1}`);
      color.dataset.idx = i; color.dataset.field = 'color';
      const name = document.createElement('input');
      name.type = 'text'; name.className = 'text-input'; name.value = p.name; name.maxLength = 16;
      name.placeholder = `Player ${i + 1} name`; name.autocomplete = 'off'; name.spellcheck = false;
      name.setAttribute('aria-label', `Name of player ${i + 1}`);
      name.dataset.idx = i; name.dataset.field = 'name';
      const sym = document.createElement('input');
      sym.type = 'text'; sym.className = 'text-input symbol-input'; sym.value = p.symbol || '';
      sym.autocomplete = 'off'; sym.spellcheck = false;
      sym.setAttribute('aria-label', `Symbol for player ${i + 1}, shown in boxes they claim`);
      sym.title = 'Symbol shown in boxes this player claims (1–2 letters or an emoji)';
      sym.dataset.idx = i; sym.dataset.field = 'symbol';
      const type = document.createElement('select');
      type.className = 'select'; type.dataset.idx = i; type.dataset.field = 'type';
      type.setAttribute('aria-label', `Player ${i + 1} is played by`);
      for (const t of TYPES) {
        const o = document.createElement('option');
        o.value = t; o.textContent = t === 'human' ? 'Person' : TYPE_LABEL[t]; o.selected = p.type === t;
        type.appendChild(o);
      }
      row.append(num, color, name, sym, type);
      playerRows.appendChild(row);
    }
    refreshAutoSymbols();
  }
  playerRows.addEventListener('input', e => {
    const t = e.target, i = Number(t.dataset.idx);
    const f = t.dataset.field;
    if (!f || f === 'type') return;
    const p = settings.players[i];
    t.removeAttribute('aria-invalid');
    if (f === 'symbol') {
      const g = graphemes(t.value.replace(/\s+/g, ''));
      if (g.length > MAX_SYMBOL) t.value = g.slice(0, MAX_SYMBOL).join('');
      const v = t.value.replace(/\s+/g, '');
      p.symbolAuto = v === '';
      if (v) p.symbol = v;
    } else {
      p[f] = t.value;
    }
    refreshAutoSymbols();
  });
  playerRows.addEventListener('focusout', e => {
    if (e.target.dataset.field === 'symbol') refreshAutoSymbols();
  });
  playerRows.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.field !== 'type') return;
    const i = Number(t.dataset.idx);
    setPlayerType(i, t.value);
    playerRows.querySelector(`.text-input[data-idx="${i}"]`).value = settings.players[i].name;
    refreshAutoSymbols();
  });

  form.querySelectorAll('input[name="numPlayers"]').forEach(r => {
    r.checked = Number(r.value) === settings.numPlayers;
    r.addEventListener('change', () => { settings.numPlayers = Number(r.value); renderPlayerRows(); });
  });

  /* ---------- Step 1: board size with live preview ---------- */
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
    for (let y = 0; y < r; y++) svgEl('line', { class: 'pg', x1: pad, y1: pad + y * sp, x2: pad + (c - 1) * sp, y2: pad + y * sp }, svg);
    for (let x = 0; x < c; x++) svgEl('line', { class: 'pg', x1: pad + x * sp, y1: pad, x2: pad + x * sp, y2: pad + (r - 1) * sp }, svg);
    for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) svgEl('circle', { class: 'pd', cx: pad + x * sp, cy: pad + y * sp, r: 3 }, svg);
    const t1 = svgEl('text', { class: 'pdim', x: W / 2, y: 11 }, svg); t1.textContent = `${c} across`;
    const t2 = svgEl('text', { class: 'pdim', x: 9, y: H / 2, transform: `rotate(-90 9 ${H / 2})` }, svg); t2.textContent = `${r} down`;
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
  [colsInput, rowsInput].forEach(inp => inp.addEventListener('input', () => { inp.removeAttribute('aria-invalid'); $('step1Error').hidden = true; updateBoardInfo(); }));
  form.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => {
    const inp = $(btn.dataset.step);
    let v = parseInt(inp.value, 10);
    if (!Number.isFinite(v)) v = 6;
    inp.value = clamp(v + Number(btn.dataset.delta), E.MIN_DOTS, E.MAX_DOTS);
    inp.removeAttribute('aria-invalid');
    $('step1Error').hidden = true;
    updateBoardInfo();
  }));
  form.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
    const [c, r] = btn.dataset.preset.split('x');
    colsInput.value = c; rowsInput.value = r;
    colsInput.removeAttribute('aria-invalid'); rowsInput.removeAttribute('aria-invalid');
    $('step1Error').hidden = true;
    updateBoardInfo();
  }));

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
  function showErrors(box, errors, firstInvalid) {
    box.textContent = '';
    const ul = document.createElement('ul');
    errors.forEach(msg => { const li = document.createElement('li'); li.textContent = msg; ul.appendChild(li); });
    box.appendChild(ul);
    box.hidden = false;
    if (firstInvalid) firstInvalid.focus();
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
    if (errors.length) { showErrors($('step1Error'), errors, firstInvalid); return; }
    $('step1Error').hidden = true;
    settings.cols = Number(colsInput.value);
    settings.rows = Number(rowsInput.value);
    saveSettings();
    showStep(2);
    const firstName = playerRows.querySelector('.text-input');
    if (firstName) firstName.focus();
  });
  $('backBtn').addEventListener('click', () => { setupError.hidden = true; showStep(1); colsInput.focus(); });

  // Options on the setup page share state with the settings dialog
  $('setupTimer').addEventListener('change', e => { settings.timer = Number(e.target.value); saveSettings(); syncSettingsUI(); });
  $('setupSpeed').addEventListener('change', e => { settings.speed = e.target.value; saveSettings(); syncSettingsUI(); });
  $('setupAssist').addEventListener('change', e => { settings.assist = e.target.checked; saveSettings(); syncSettingsUI(); });

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
      if (!nm) { nm = settings.players[i].type === 'human' ? `Player ${i + 1}` : CPU_NAMES[i]; nameInputs[i].value = nm; }
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

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if ($('step2').hidden) { $('nextBtn').click(); return; } // Enter on step 1 = Next
    const dims = validateDims();
    if (dims.errors.length) { showStep(1); showErrors($('step1Error'), dims.errors, dims.firstInvalid); return; }
    const { errors, firstInvalid } = validatePlayers();
    if (errors.length) { showErrors(setupError, errors, firstInvalid); return; }
    setupError.hidden = true;
    settings.cols = Number(colsInput.value);
    settings.rows = Number(rowsInput.value);
    saveSettings();
    if (store.get(KEYS.save) && !(await confirmAction('Start a new game?', 'You have a saved game in progress. Starting a new game will replace it.', 'Start new game'))) return;
    startGame({
      cols: settings.cols, rows: settings.rows,
      players: settings.players.slice(0, settings.numPlayers).map(p => ({ name: p.name, color: p.color, type: p.type, symbol: p.symbol }))
    });
  });

  function renderResumeCard() {
    const save = loadSave();
    $('resumeCard').hidden = !save;
    if (save) {
      const g = save.game;
      $('resumeInfo').textContent = `${joinNames(save.cfg.players.map(p => p.name))} · ${save.cfg.cols}×${save.cfg.rows} dots · ${g.claimedCount}/${g.totalBoxes} boxes claimed`;
    }
  }
  $('resumeBtn').addEventListener('click', () => {
    const save = loadSave();
    if (!save) { renderResumeCard(); return; }
    startGame(save.cfg, save);
  });
  $('discardBtn').addEventListener('click', async () => {
    if (!(await confirmAction('Discard saved game?', 'The game in progress will be deleted.', 'Discard'))) return;
    store.del(KEYS.save);
    renderResumeCard();
  });
  $('setupStatsBtn').addEventListener('click', showStats);
  $('setupSettingsBtn').addEventListener('click', () => openDialog($('settingsDialog')));

  /* ---------- Animated logo on the setup screen (a tiny game playing itself) ---------- */
  const logo = $('heroLogo');
  let logoTimer = 0;
  const LOGO_COLORS = ['#2563eb', '#e11d48', '#16a34a', '#d97706'];
  function logoStart() {
    logoStop();
    const g = E.createGame(4, 3, 4);
    const S = 44, PX = 12, PY = 12;
    const draw = () => {
      logo.textContent = '';
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const o = g.boxes[r][c];
        if (o !== -1) svgEl('rect', { x: PX + c * S + 5, y: PY + r * S + 5, width: S - 10, height: S - 10, rx: 6, fill: LOGO_COLORS[o] }, logo);
      }
      for (const e of E.undrawnEdges(E.createGame(4, 3, 2))) {
        const x1 = PX + e.c * S, y1 = PY + e.r * S;
        const x2 = e.type === 'h' ? x1 + S : x1, y2 = e.type === 'h' ? y1 : y1 + S;
        svgEl('line', { class: E.isDrawn(g, e.type, e.r, e.c) ? 'l' : 'g', x1, y1, x2, y2 }, logo);
      }
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) svgEl('circle', { class: 'd', cx: PX + c * S, cy: PY + r * S, r: 4.5 }, logo);
    };
    const step = () => {
      if (g.over) {
        logoTimer = setTimeout(() => { if (!setupScreen.hidden) logoStart(); }, 1600);
        return;
      }
      const m = AI.chooseMove(g, 'medium');
      E.playMove(g, m.type, m.r, m.c);
      draw();
      logoTimer = setTimeout(step, settings.anim ? 420 : 0);
    };
    if (!settings.anim) {
      while (!g.over) { const m = AI.chooseMove(g, 'medium'); E.playMove(g, m.type, m.r, m.c); }
      draw();
      return;
    }
    draw();
    logoTimer = setTimeout(step, 500);
  }
  function logoStop() { clearTimeout(logoTimer); logoTimer = 0; }

  /* =====================================================================
   * SAVE / LOAD
   * ===================================================================== */
  function saveGame() {
    if (!game || replay) return;
    if (game.over) { store.del(KEYS.save); return; }
    store.set(KEYS.save, {
      v: 2, cfg, start: gameStart, hints: hintsUsed,
      moves: game.history.map(m => [m.type, m.r, m.c])
    });
  }
  function loadSave() {
    const s = store.get(KEYS.save);
    if (!s || s.v !== 2 || !s.cfg || !Array.isArray(s.moves) || !Array.isArray(s.cfg.players)) return null;
    const c = s.cfg;
    if (!E.validSize(c.cols) || !E.validSize(c.rows) || c.players.length < 2 || c.players.length > 4) return null;
    if (!c.players.every(p => p && typeof p.name === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) && TYPES.includes(p.type) && (p.symbol === undefined || (typeof p.symbol === 'string' && p.symbol.length <= 16)))) return null;
    try {
      const g = E.replay(c.cols, c.rows, c.players.length, s.moves);
      if (g.over) return null;
      return { cfg: c, game: g, start: Number(s.start) || Date.now(), hints: Number(s.hints) || 0 };
    } catch (e) { return null; }
  }

  /* =====================================================================
   * STATS
   * ===================================================================== */
  function loadStats() {
    const s = store.get(KEYS.stats);
    return s && typeof s === 'object' && s.players ? s : { games: 0, boxes: 0, players: {} };
  }
  function recordStats() {
    if (statsRecorded || !game || !game.over) return;
    statsRecorded = true;
    const st = loadStats();
    const lead = E.leaders(game);
    st.games++;
    st.boxes += game.totalBoxes;
    players.forEach((p, i) => {
      const key = p.type === 'human' ? 'h:' + p.name.toLowerCase() : 'c:' + p.type;
      const rec = st.players[key] || (st.players[key] = { name: '', games: 0, wins: 0, ties: 0, boxes: 0, best: 0 });
      rec.name = p.type === 'human' ? p.name : TYPE_LABEL[p.type];
      rec.games++;
      rec.boxes += game.scores[i];
      rec.best = Math.max(rec.best, game.scores[i]);
      if (lead.includes(i)) { if (lead.length === 1) rec.wins++; else rec.ties++; }
    });
    store.set(KEYS.stats, st);
  }
  function showStats() {
    const st = loadStats();
    const body = $('statsBody');
    body.textContent = '';
    const rows = Object.values(st.players).sort((a, b) => b.wins - a.wins || (b.wins / b.games) - (a.wins / a.games) || b.games - a.games);
    const summary = document.createElement('div');
    summary.className = 'stats-summary';
    const best = rows.reduce((m, r) => Math.max(m, r.best), 0);
    [[st.games, 'Games played'], [st.boxes, 'Boxes claimed'], [best, 'Best score']].forEach(([v, l]) => {
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
    openDialog($('statsDialog'));
  }
  $('resetStatsBtn').addEventListener('click', async () => {
    $('statsDialog').close();
    if (await confirmAction('Reset statistics?', 'All recorded games and scores will be deleted.', 'Reset')) {
      store.del(KEYS.stats);
      toast('Statistics reset');
    }
    showStats();
  });

  /* =====================================================================
   * GAME STATE
   * ===================================================================== */
  const S = 40, PAD = 22;
  const board = $('board'), boardWrap = $('boardWrap');
  const scoreboard = $('scoreboard'), statusEl = $('status');
  let game = null, cfg = null, players = [], labels = [];
  let redoStack = [], aiTimer = 0, paused = false, hintMove = null, hintsUsed = 0;
  let gameStart = 0, gameEnd = 0, statsRecorded = false, resultTimer = 0;
  let replay = null;
  let layers = {}, hitMap = new Map();
  let cursor = { r: 0, c: 0 }, pendingDraw = false;
  let logCount = 0;

  const isHuman = i => players[i] && players[i].type === 'human';
  const isAITurn = () => game && !game.over && !isHuman(game.current);
  const hasAI = () => players.some(p => p.type !== 'human');
  const hasHuman = () => players.some(p => p.type === 'human');

  function startGame(config, save) {
    stopAll();
    cfg = { cols: config.cols, rows: config.rows, players: config.players.map(p => ({ ...p })) };
    players = cfg.players;
    const fallback = computeLabels(players.map(p => p.name));
    labels = players.map((p, i) => (typeof p.symbol === 'string' && p.symbol.trim() ? p.symbol.trim() : fallback[i]));
    game = save ? save.game : E.createGame(cfg.cols, cfg.rows, players.length);
    gameStart = save ? save.start : Date.now();
    hintsUsed = save ? save.hints : 0;
    gameEnd = 0;
    redoStack = []; paused = false; hintMove = null; statsRecorded = false; replay = null;
    cursor = { r: 0, c: 0 }; pendingDraw = false; logCount = 0;
    setupScreen.hidden = true;
    gameScreen.hidden = false;
    logoStop();
    $('replayBar').hidden = true;
    $('gameMeta').textContent = `${cfg.cols}×${cfg.rows} · ${players.length} players`;
    $('pauseBtn').hidden = !hasAI();
    $('hintBtn').hidden = !hasHuman();
    buildBoard();
    buildScoreboard();
    $('moveLog').textContent = '';
    refresh(null);
    saveGame();
    announce(save
      ? `Game resumed. ${players[game.current].name}'s turn.`
      : `New game. ${cfg.cols} by ${cfg.rows} dots. ${players[0].name} goes first.`);
    if (save) toast('Game resumed');
    afterTurn();
  }

  function stopAll() {
    clearTimeout(aiTimer); aiTimer = 0;
    clearTimeout(resultTimer); resultTimer = 0;
    stopTurnTimer();
    if (replay) stopReplayPlayback();
  }

  /* =====================================================================
   * BOARD RENDERING
   * ===================================================================== */
  const dotX = c => PAD + c * S;
  const dotY = r => PAD + r * S;
  function edgeCoords(type, r, c) {
    return type === 'h'
      ? { x1: dotX(c), y1: dotY(r), x2: dotX(c + 1), y2: dotY(r) }
      : { x1: dotX(c), y1: dotY(r), x2: dotX(c), y2: dotY(r + 1) };
  }

  function buildBoard() {
    board.textContent = '';
    hitMap.clear();
    const W = PAD * 2 + (game.cols - 1) * S, H = PAD * 2 + (game.rows - 1) * S;
    board.setAttribute('viewBox', `0 0 ${W} ${H}`);
    board.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    board.style.maxWidth = `${W * 2.2}px`;
    board.style.maxHeight = `${H * 2.2}px`;

    layers.guides = svgEl('g', { 'aria-hidden': 'true' }, board);
    layers.danger = svgEl('g', { 'aria-hidden': 'true' }, board);
    layers.boxes = svgEl('g', { 'aria-hidden': 'true' }, board);
    layers.lines = svgEl('g', { 'aria-hidden': 'true' }, board);
    layers.hint = svgEl('line', { class: 'hint-line', visibility: 'hidden' }, board);
    layers.preview = svgEl('line', { class: 'preview', visibility: 'hidden', pathLength: 1 }, board);
    layers.dots = svgEl('g', { 'aria-hidden': 'true' }, board);
    layers.hits = svgEl('g', {}, board);
    layers.cursor = svgEl('circle', { class: 'cursor', r: 11 }, board);

    const half = S / 2;
    const addEdge = (type, r, c) => {
      const e = edgeCoords(type, r, c);
      svgEl('line', { class: 'guide', ...e }, layers.guides);
      // Diamond-shaped hit areas tile the board, so every tap lands on the nearest line slot.
      const mx = (e.x1 + e.x2) / 2, my = (e.y1 + e.y2) / 2;
      const pts = type === 'h'
        ? `${e.x1},${e.y1} ${mx},${my - half} ${e.x2},${e.y2} ${mx},${my + half}`
        : `${e.x1},${e.y1} ${mx - half},${my} ${e.x2},${e.y2} ${mx + half},${my}`;
      const hit = svgEl('polygon', { class: 'hit', points: pts, 'data-type': type, 'data-r': r, 'data-c': c }, layers.hits);
      hitMap.set(`${type}-${r}-${c}`, hit);
    };
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols - 1; c++) addEdge('h', r, c);
    for (let r = 0; r < game.rows - 1; r++) for (let c = 0; c < game.cols; c++) addEdge('v', r, c);
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols; c++) {
      svgEl('circle', { class: 'dot', cx: dotX(c), cy: dotY(r), r: 4.5 }, layers.dots);
    }
    placeCursor();
  }

  function buildScoreboard() {
    scoreboard.textContent = '';
    players.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.style.setProperty('--pc', p.color);
      card.innerHTML = '<span class="turn-badge">Turn</span><span class="swatch" aria-hidden="true"></span><span class="pname"></span><span class="pscore">0</span><span class="ptype"></span><span class="timer-bar" aria-hidden="true"></span>';
      const sw = card.querySelector('.swatch');
      sw.textContent = labels[i];
      sw.style.color = textOn(p.color);
      card.querySelector('.pname').textContent = p.name;
      card.querySelector('.pname').title = p.name;
      card.querySelector('.ptype').textContent = TYPE_SHORT[p.type];
      scoreboard.appendChild(card);
    });
  }

  function swatch(color, cls) {
    const s = document.createElement('span');
    s.className = cls || 'swatch'; s.style.background = color; s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /** Redraw everything that depends on the game state. */
  function refresh(lastResult) {
    const last = game.history[game.history.length - 1];
    const animate = !!(lastResult && lastResult.ok && settings.anim);

    // Lines
    layers.lines.textContent = '';
    const drawLine = (type, r, c, owner) => {
      const isLast = last && last.type === type && last.r === r && last.c === c;
      const cls = 'edge' + (isLast ? ' last' : '') + (isLast && animate ? ' draw' : '');
      const el = svgEl('line', { class: cls, ...edgeCoords(type, r, c), pathLength: 1 }, layers.lines);
      if (isLast) el.style.stroke = players[owner].color;
    };
    for (let r = 0; r < game.rows; r++) for (let c = 0; c < game.cols - 1; c++) if (game.h[r][c] !== -1) drawLine('h', r, c, game.h[r][c]);
    for (let r = 0; r < game.rows - 1; r++) for (let c = 0; c < game.cols; c++) if (game.v[r][c] !== -1) drawLine('v', r, c, game.v[r][c]);

    hitMap.forEach((el, key) => {
      const [type, r, c] = key.split('-');
      el.classList.toggle('taken', E.isDrawn(game, type, Number(r), Number(c)));
    });

    // Boxes
    layers.boxes.textContent = '';
    const fresh = new Set((animate && last ? last.claimed : []).map(([r, c]) => `${r}-${c}`));
    const inset = 5;
    const fontSize = Math.max(...labels.map(l => graphemes(l).length)) > 1 ? 15 : 19;
    for (let r = 0; r < game.rows - 1; r++) for (let c = 0; c < game.cols - 1; c++) {
      const owner = game.boxes[r][c];
      if (owner === -1) continue;
      const g = svgEl('g', { class: 'box' + (fresh.has(`${r}-${c}`) ? ' pop' : '') }, layers.boxes);
      svgEl('rect', { x: dotX(c) + inset, y: dotY(r) + inset, width: S - inset * 2, height: S - inset * 2, rx: 5, fill: players[owner].color }, g);
      const t = svgEl('text', { class: 'box-label', x: dotX(c) + S / 2, y: dotY(r) + S / 2 + 1, 'font-size': fontSize, fill: textOn(players[owner].color) }, g);
      t.textContent = labels[owner];
    }

    // Assist: boxes that can be taken right now
    layers.danger.textContent = '';
    if (settings.assist && !game.over && !replay) {
      const col = players[game.current].color;
      for (const [r, c] of AI.threeSidedBoxes(game)) {
        svgEl('rect', { class: 'danger-box', x: dotX(c) + 6, y: dotY(r) + 6, width: S - 12, height: S - 12, rx: 5, fill: col, stroke: col }, layers.danger);
      }
    }

    // Hint
    if (hintMove && !game.over && !replay) {
      const e = edgeCoords(hintMove.type, hintMove.r, hintMove.c);
      for (const k in e) layers.hint.setAttribute(k, e[k]);
      layers.hint.setAttribute('visibility', 'visible');
    } else layers.hint.setAttribute('visibility', 'hidden');

    // Scoreboard
    const lead = game.claimedCount ? E.leaders(game) : [];
    [...scoreboard.children].forEach((card, i) => {
      const active = !game.over && i === game.current;
      card.classList.toggle('active', active);
      card.classList.toggle('leader', lead.includes(i));
      card.classList.toggle('thinking', active && !isHuman(i) && !paused && !replay);
      if (active) card.setAttribute('aria-current', 'true'); else card.removeAttribute('aria-current');
      card.querySelector('.pscore').textContent = game.scores[i];
      card.querySelector('.turn-badge').textContent = isHuman(i) && hasAI() ? 'Your turn' : 'Turn';
      card.setAttribute('aria-label', `${players[i].name}, ${TYPE_LABEL[players[i].type]}: ${plural(game.scores[i], 'box', 'boxes')}${active ? ', current turn' : ''}`);
      card.classList.remove('bump');
    });
    if (animate && last.claimed.length) {
      const card = scoreboard.children[last.player];
      void card.offsetWidth;
      card.classList.add('bump');
    }

    // Score bar + progress
    const bar = $('scorebar');
    bar.textContent = '';
    players.forEach((p, i) => {
      const s = document.createElement('span');
      s.style.background = p.color;
      s.style.width = (game.scores[i] / game.totalBoxes * 100) + '%';
      bar.appendChild(s);
    });
    $('progressBoxes').textContent = `${game.claimedCount}/${game.totalBoxes} boxes`;
    $('progressLines').textContent = `${game.history.length}/${game.totalLines} lines`;

    renderLog();
    renderStatus(lastResult);
    updateButtons();
    boardWrap.classList.toggle('locked', isAITurn() && !replay);
    boardWrap.classList.toggle('replaying', !!replay);
    hidePreview();
  }

  function renderLog() {
    const ol = $('moveLog');
    const h = game.history;
    if (h.length < logCount) { ol.textContent = ''; logCount = 0; }
    for (let i = logCount; i < h.length; i++) {
      const m = h[i];
      const li = document.createElement('li');
      const n = document.createElement('span'); n.className = 'n'; n.textContent = i + 1;
      const who = document.createElement('span'); who.className = 'who'; who.textContent = `${players[m.player].name} · ${moveName(m)}`;
      li.append(n, swatch(players[m.player].color, 'sw'), who);
      if (m.claimed.length) { const g = document.createElement('span'); g.className = 'gain'; g.textContent = '+' + m.claimed.length; li.appendChild(g); }
      ol.appendChild(li);
    }
    logCount = h.length;
    if (ol.lastElementChild) ol.lastElementChild.scrollIntoView({ block: 'nearest' });
  }

  function renderStatus(lastResult) {
    statusEl.textContent = '';
    const txt = document.createElement('span');
    if (replay) {
      txt.textContent = replay.idx === 0 ? 'Replay: start of game' : `Replay: move ${replay.idx} of ${replay.moves.length}`;
      statusEl.append(txt);
      return;
    }
    if (game.over) {
      const lead = E.leaders(game);
      txt.textContent = lead.length > 1 ? 'Game over: it\'s a tie!' : `Game over: ${players[lead[0]].name} wins!`;
      const btn = document.createElement('button');
      btn.className = 'link'; btn.type = 'button'; btn.textContent = 'View results';
      btn.addEventListener('click', showResult);
      statusEl.append(txt, btn);
      return;
    }
    const p = players[game.current];
    if (paused && !isHuman(game.current)) {
      txt.textContent = 'Paused. ';
      const btn = document.createElement('button');
      btn.className = 'link'; btn.type = 'button'; btn.textContent = 'Resume';
      btn.addEventListener('click', togglePause);
      statusEl.append(swatch(p.color), txt, btn);
      return;
    }
    if (lastResult && lastResult.extraTurn) {
      txt.textContent = `${p.name} completed ${lastResult.claimed.length === 2 ? 'two boxes' : 'a box'}. ${isHuman(game.current) ? 'Go again!' : 'Playing again…'}`;
    } else if (!isHuman(game.current)) {
      txt.textContent = `${p.name} is thinking…`;
    } else {
      txt.textContent = `${p.name}'s turn`;
    }
    if (pendingDraw) txt.textContent += ' (press an arrow key to draw)';
    statusEl.append(swatch(p.color), txt);
  }

  function updateButtons() {
    $('undoBtn').disabled = !canUndo();
    $('redoBtn').disabled = !canRedo();
    $('hintBtn').disabled = !game || game.over || !!replay || !isHuman(game.current);
    $('hintBtn').classList.toggle('hint-on', !!hintMove);
    const pb = $('pauseBtn');
    pb.disabled = !game || game.over || !!replay;
    pb.querySelector('use').setAttribute('href', paused ? '#i-play' : '#i-pause');
    pb.querySelector('.label').textContent = paused ? 'Resume' : 'Pause';
    pb.setAttribute('aria-pressed', String(paused));
    $('restartBtn').disabled = !!replay;
  }

  /* =====================================================================
   * MOVES & TURN FLOW
   * ===================================================================== */
  function attemptMove(type, r, c, source) {
    if (!game || game.over || replay) return false;
    if (source === 'human' && isAITurn()) {
      toast(`Wait for ${players[game.current].name} to move`);
      return false;
    }
    const res = E.playMove(game, type, r, c);
    if (!res.ok) {
      if (res.reason === 'taken' && source === 'human') {
        sfx.error();
        if (settings.anim) { board.classList.remove('shake'); void board.getBoundingClientRect(); board.classList.add('shake'); }
        announce('That line has already been drawn.');
      }
      return false;
    }
    redoStack = [];
    hintMove = null;
    stopTurnTimer();
    if (res.claimed.length) { sfx.box(res.claimed.length); vibrate(res.claimed.length > 1 ? [18, 40, 18] : 22); }
    else if (source === 'ai') sfx.cpu(); else sfx.line();
    refresh(res);
    saveGame();

    const who = players[res.player].name;
    let msg = `${who} drew ${moveName({ type, r, c })}.`;
    if (res.claimed.length) msg += ` ${who} claimed ${res.claimed.length === 2 ? 'two boxes' : 'a box'} and has ${game.scores[res.player]}.`;
    if (res.over) msg += ' All boxes are claimed. Game over.';
    else msg += res.extraTurn ? ` ${who} goes again.` : ` ${players[game.current].name}'s turn.`;
    announce(msg);

    if (res.over) onGameOver();
    else afterTurn(res);
    return true;
  }

  /** Decide what happens next: schedule the computer or start the human's timer. */
  function afterTurn(lastRes) {
    clearTimeout(aiTimer); aiTimer = 0;
    stopTurnTimer();
    if (!game || game.over || replay || dialogOpen() || gameScreen.hidden) return;
    if (isAITurn()) {
      if (paused) return;
      let delay = SPEED_MS[settings.speed] || 520;
      if (lastRes && lastRes.extraTurn) delay *= 0.65;
      aiTimer = setTimeout(() => {
        aiTimer = 0;
        if (!isAITurn() || paused || replay || dialogOpen()) return;
        const m = AI.chooseMove(game, players[game.current].type);
        if (m) attemptMove(m.type, m.r, m.c, 'ai');
      }, delay);
    } else {
      startTurnTimer();
    }
  }
  function pauseFlow() { clearTimeout(aiTimer); aiTimer = 0; stopTurnTimer(); if (replay) stopReplayPlayback(); }
  function resumeFlow() { if (!dialogOpen() && game && !gameScreen.hidden) { refresh(null); afterTurn(); } }

  function onGameOver() {
    clearTimeout(aiTimer); aiTimer = 0;
    stopTurnTimer();
    gameEnd = Date.now();
    store.del(KEYS.save);
    recordStats();
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => {
      const lead = E.leaders(game);
      if (lead.length > 1) sfx.tie(); else sfx.win();
      launchConfetti(lead.map(i => players[i].color));
      showResult();
    }, settings.anim ? 700 : 150);
  }

  // ---- Undo / redo (undo also rewinds the computer's replies back to your last move) ----
  function canUndo() {
    return !!game && !game.over && !replay && hasHuman() && game.history.some(m => isHuman(m.player));
  }
  function canRedo() {
    return !!game && !game.over && !replay && redoStack.length > 0 && isHuman(game.current);
  }
  function doUndo() {
    if (!canUndo()) return;
    clearTimeout(aiTimer); aiTimer = 0;
    stopTurnTimer();
    const batch = [];
    while (game.history.length) {
      const m = E.undoMove(game);
      batch.unshift([m.type, m.r, m.c]);
      if (isHuman(m.player)) break;
    }
    redoStack.push(batch);
    hintMove = null;
    sfx.undo();
    refresh(null);
    saveGame();
    announce(`Undid ${plural(batch.length, 'move')}. ${players[game.current].name}'s turn.`);
    afterTurn();
  }
  function doRedo() {
    if (!canRedo()) return;
    const batch = redoStack.pop();
    let res = null;
    for (const [t, r, c] of batch) res = E.playMove(game, t, r, c);
    hintMove = null;
    sfx.line();
    refresh(null);
    saveGame();
    announce(`Redid ${plural(batch.length, 'move')}.`);
    if (game.over) onGameOver(); else afterTurn(res);
  }
  $('undoBtn').addEventListener('click', doUndo);
  $('redoBtn').addEventListener('click', doRedo);

  // ---- Hint ----
  function doHint() {
    if (!game || game.over || replay || !isHuman(game.current)) return;
    if (hintMove) { hintMove = null; refresh(null); return; }
    hintMove = AI.chooseMove(game, 'hard');
    if (!hintMove) return;
    hintsUsed++;
    sfx.hint();
    refresh(null);
    saveGame();
    announce(`Hint: draw ${moveName(hintMove)}.`);
  }
  $('hintBtn').addEventListener('click', doHint);

  // ---- Pause (computer players) ----
  function togglePause() {
    if (!game || game.over || !hasAI()) return;
    paused = !paused;
    toast(paused ? 'Computer paused' : 'Computer resumed');
    refresh(null);
    afterTurn();
  }
  $('pauseBtn').addEventListener('click', togglePause);

  // ---- Turn timer ----
  let timerRaf = 0;
  function startTurnTimer() {
    stopTurnTimer();
    if (!settings.timer || !game || game.over || replay || isAITurn() || dialogOpen()) return;
    const dur = settings.timer * 1000;
    const end = performance.now() + dur;
    const bar = scoreboard.children[game.current].querySelector('.timer-bar');
    let lastSec = Infinity;
    const tick = () => {
      const left = end - performance.now();
      bar.style.width = Math.max(0, left / dur * 100) + '%';
      const sec = Math.ceil(left / 1000);
      if (sec <= 3 && sec < lastSec && sec > 0) { lastSec = sec; sfx.tick(); }
      if (left <= 0) {
        timerRaf = 0;
        bar.style.width = '0';
        const p = players[game.current];
        const m = AI.chooseMove(game, 'medium');
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
    scoreboard.querySelectorAll('.timer-bar').forEach(b => { b.style.width = '0'; });
  }

  /* =====================================================================
   * INPUT: pointer
   * ===================================================================== */
  board.addEventListener('click', e => {
    const hit = e.target.closest && e.target.closest('.hit');
    if (!hit) return;
    board.classList.remove('kbd');
    attemptMove(hit.dataset.type, Number(hit.dataset.r), Number(hit.dataset.c), 'human');
  });
  board.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch' || !game || game.over || replay || isAITurn()) return;
    const hit = e.target.closest && e.target.closest('.hit');
    if (!hit) { hidePreview(); return; }
    const type = hit.dataset.type, r = Number(hit.dataset.r), c = Number(hit.dataset.c);
    if (E.isDrawn(game, type, r, c)) { hidePreview(); return; }
    showPreview(type, r, c);
  });
  board.addEventListener('pointerleave', hidePreview);

  /** Would this line hand a box to the next player (gives a box its third side, completes none)? */
  function givesAway(type, r, c) {
    let completes = false, third = false;
    for (const [br, bc] of E.adjacentBoxes(game, type, r, c)) {
      const s = E.sidesOf(game, br, bc);
      if (s === 3) completes = true;
      if (s === 2) third = true;
    }
    return third && !completes;
  }
  function showPreview(type, r, c) {
    const e = edgeCoords(type, r, c);
    for (const k in e) layers.preview.setAttribute(k, e[k]);
    const warn = settings.assist && givesAway(type, r, c);
    layers.preview.classList.toggle('warn', warn);
    layers.preview.style.stroke = warn ? '#dc2626' : players[game.current].color;
    layers.preview.setAttribute('visibility', 'visible');
  }
  function hidePreview() { if (layers.preview) layers.preview.setAttribute('visibility', 'hidden'); }

  /* =====================================================================
   * INPUT: keyboard
   * ===================================================================== */
  function placeCursor() {
    layers.cursor.setAttribute('cx', dotX(cursor.c));
    layers.cursor.setAttribute('cy', dotY(cursor.r));
    layers.cursor.classList.toggle('pending', pendingDraw);
  }
  const DIRS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  board.addEventListener('keydown', e => {
    if (!game || replay) return;
    const d = DIRS[e.key];
    if (d) {
      e.preventDefault();
      board.classList.add('kbd');
      const tr = cursor.r + d[0], tc = cursor.c + d[1];
      if (e.shiftKey || pendingDraw) {
        pendingDraw = false;
        if (tr >= 0 && tr < game.rows && tc >= 0 && tc < game.cols) {
          const t = d[0] === 0 ? 'h' : 'v';
          const rr = d[0] === 0 ? cursor.r : Math.min(cursor.r, tr);
          const cc = d[0] === 0 ? Math.min(cursor.c, tc) : cursor.c;
          if (E.isDrawn(game, t, rr, cc)) { sfx.error(); announce('That line has already been drawn.'); }
          else attemptMove(t, rr, cc, 'human');
        } else sfx.error();
        placeCursor();
        if (!game.over) renderStatus(null);
      } else {
        cursor.r = clamp(tr, 0, game.rows - 1);
        cursor.c = clamp(tc, 0, game.cols - 1);
        placeCursor();
        announce(`Dot ${colLetter(cursor.c)}${cursor.r + 1}`);
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (game.over || isAITurn()) return;
      board.classList.add('kbd');
      pendingDraw = !pendingDraw;
      placeCursor(); renderStatus(null);
      if (pendingDraw) announce('Choose a direction with an arrow key to draw a line.');
    } else if (e.key === 'Escape' && pendingDraw) {
      pendingDraw = false; placeCursor(); renderStatus(null);
    }
  });

  document.addEventListener('keydown', e => {
    if (gameScreen.hidden || dialogOpen()) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'h') doHint();
    else if (k === 'p' && hasAI()) togglePause();
    else if (k === 'm') { settings.sound = !settings.sound; saveSettings(); syncSettingsUI(); toast(settings.sound ? 'Sound on' : 'Sound off'); }
    else if (k === 'f') toggleFullscreen();
    else if (e.key === '?') openDialog($('rulesDialog'));
    else if (e.key === 'Escape' && replay) exitReplay();
    else if (replay && e.key === 'ArrowRight' && e.target !== board) replayGoto(replay.idx + 1, true);
    else if (replay && e.key === 'ArrowLeft' && e.target !== board) replayGoto(replay.idx - 1, false);
  });

  /* =====================================================================
   * TOOLBAR
   * ===================================================================== */
  const inProgress = () => game && game.history.length > 0 && !game.over;
  $('restartBtn').addEventListener('click', async () => {
    if (inProgress() && !(await confirmAction('Restart game?', 'The board will be cleared and all scores reset. Players and board size stay the same.', 'Restart'))) return;
    startGame(cfg);
  });
  $('newBtn').addEventListener('click', async () => {
    if (inProgress() && !(await confirmAction('Leave this game?', 'Your game is saved: you can resume it from the setup screen until you start another one.', 'Go to setup'))) return;
    goToSetup();
  });
  $('settingsBtn').addEventListener('click', () => openDialog($('settingsDialog')));
  $('rulesBtn').addEventListener('click', () => openDialog($('rulesDialog')));

  function goToSetup() {
    stopAll();
    if (replay) { game = replay.final; replay = null; }
    const rd = $('resultDialog');
    if (rd.open) rd.close();
    game = null;
    gameScreen.hidden = true;
    setupScreen.hidden = false;
    colsInput.value = settings.cols; rowsInput.value = settings.rows;
    form.querySelectorAll('input[name="numPlayers"]').forEach(r => { r.checked = Number(r.value) === settings.numPlayers; });
    showStep(1);
    updateBoardInfo();
    renderResumeCard();
    logoStart();
    window.scrollTo(0, 0);
  }

  // Fullscreen
  const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  $('fullBtn').hidden = !fsSupported;
  function toggleFullscreen() {
    if (!fsSupported) return;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
    } catch (e) { /* ignore */ }
  }
  $('fullBtn').addEventListener('click', toggleFullscreen);

  /* =====================================================================
   * SETTINGS DIALOG
   * ===================================================================== */
  function syncSettingsUI() {
    $('optSound').checked = settings.sound;
    $('optHaptics').checked = settings.haptics;
    $('optAnim').checked = settings.anim;
    $('optAssist').checked = settings.assist;
    $('optTheme').value = settings.theme;
    $('optSpeed').value = settings.speed;
    $('optTimer').value = String(settings.timer);
    $('setupTimer').value = String(settings.timer);
    $('setupSpeed').value = settings.speed;
    $('setupAssist').checked = settings.assist;
    applyTheme();
    applyAnim();
  }
  const bindSetting = (id, key, parse) => $(id).addEventListener('change', e => {
    settings[key] = parse(e.target);
    saveSettings();
    syncSettingsUI();
    if (key === 'assist' && game) refresh(null);
    if (key === 'anim' && !setupScreen.hidden) logoStart();
  });
  bindSetting('optSound', 'sound', t => t.checked);
  bindSetting('optHaptics', 'haptics', t => t.checked);
  bindSetting('optAnim', 'anim', t => t.checked);
  bindSetting('optAssist', 'assist', t => t.checked);
  bindSetting('optTheme', 'theme', t => t.value);
  bindSetting('optSpeed', 'speed', t => t.value);
  bindSetting('optTimer', 'timer', t => Number(t.value));
  $('settingsDialog').addEventListener('close', () => { if (settings.sound) sfx.line(); });

  /* =====================================================================
   * RESULTS
   * ===================================================================== */
  const resultDialog = $('resultDialog');
  function resultText() {
    const lead = E.leaders(game);
    const order = players.map((_, i) => i).sort((a, b) => game.scores[b] - game.scores[a] || a - b);
    const lines = [`Dots and Boxes · ${game.cols}×${game.rows} dots (${game.totalBoxes} boxes)`];
    lines.push(lead.length > 1 ? `🤝 Tie between ${joinNames(lead.map(i => players[i].name))}` : `🏆 ${players[lead[0]].name} wins!`);
    order.forEach((i, k) => lines.push(`${k + 1}. ${players[i].name}: ${game.scores[i]}`));
    if (gameEnd) lines.push(`Played in ${fmtTime(gameEnd - gameStart)}`);
    return lines.join('\n');
  }
  function showResult() {
    if (!game || !game.over) return;
    const lead = E.leaders(game);
    const sw = $('winnerSwatch');
    sw.className = 'winner-swatch';
    sw.style.background = '';
    const humanWinner = lead.length === 1 && isHuman(lead[0]);
    const humanLost = hasAI() && hasHuman() && lead.every(i => !isHuman(i));
    $('trophy').textContent = lead.length > 1 ? '🤝' : humanLost ? '🤖' : '🏆';
    if (lead.length === 1) {
      const w = players[lead[0]];
      sw.style.background = w.color; sw.style.color = textOn(w.color); sw.textContent = labels[lead[0]];
      $('resultTitle').textContent = `${w.name} wins!`;
      $('resultTitle').style.color = w.color;
      const runnerUp = Math.max(...game.scores.filter((_, i) => i !== lead[0]));
      const margin = game.scores[lead[0]] - runnerUp;
      let sub = `${w.name} claimed ${game.scores[lead[0]]} of ${game.totalBoxes} boxes, winning by ${plural(margin, 'box', 'boxes')}.`;
      if (humanLost) sub += ' Try again or lower the difficulty.';
      else if (humanWinner && hasAI()) sub += ' Nicely played!';
      $('resultSub').textContent = sub;
    } else {
      sw.classList.add('tie'); sw.textContent = '';
      sw.style.setProperty('--c1', players[lead[0]].color);
      sw.style.setProperty('--c2', players[lead[1]].color);
      $('resultTitle').textContent = 'It\'s a tie!';
      $('resultTitle').style.color = '';
      $('resultSub').textContent = `${joinNames(lead.map(i => players[i].name))} share the top score with ${plural(game.scores[lead[0]], 'box', 'boxes')} each.`;
    }
    const ol = $('resultList');
    ol.textContent = '';
    const order = players.map((_, i) => i).sort((a, b) => game.scores[b] - game.scores[a] || a - b);
    let rank = 0, prev = null;
    order.forEach((i, pos) => {
      if (game.scores[i] !== prev) { rank = pos + 1; prev = game.scores[i]; }
      const li = document.createElement('li');
      if (lead.includes(i)) li.className = 'top';
      const rk = document.createElement('span'); rk.className = 'rank'; rk.textContent = rank;
      const nm = document.createElement('span'); nm.className = 'n'; nm.textContent = players[i].name;
      const bar = document.createElement('span'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.width = (game.scores[i] / game.totalBoxes * 100) + '%'; fill.style.background = players[i].color;
      bar.appendChild(fill);
      const sc = document.createElement('span'); sc.className = 's'; sc.textContent = game.scores[i];
      li.append(rk, swatch(players[i].color), nm, bar, sc);
      li.setAttribute('aria-label', `Rank ${rank}: ${players[i].name}, ${plural(game.scores[i], 'box', 'boxes')}`);
      ol.appendChild(li);
    });
    const meta = $('resultMeta');
    meta.textContent = '';
    const items = [`Total squares: ${game.totalBoxes}`, `${game.cols}×${game.rows} dots`, `${game.history.length} lines`];
    if (gameEnd) items.push(`Time ${fmtTime(gameEnd - gameStart)}`);
    if (hintsUsed) items.push(plural(hintsUsed, 'hint'));
    items.forEach(t => { const s = document.createElement('span'); s.textContent = t; meta.appendChild(s); });
    openDialog(resultDialog);
    $('playAgainBtn').focus();
  }
  $('playAgainBtn').addEventListener('click', () => { resultDialog.close(); startGame(cfg); });
  $('toSetupBtn').addEventListener('click', () => { resultDialog.close(); goToSetup(); });
  $('replayBtn').addEventListener('click', () => { resultDialog.close(); enterReplay(); });
  $('copyBtn').addEventListener('click', async () => {
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
  });

  /* =====================================================================
   * REPLAY
   * ===================================================================== */
  function enterReplay() {
    if (!game || !game.over || replay) return;
    stopAll();
    replay = { final: game, moves: game.history.map(m => [m.type, m.r, m.c]), idx: 0, timer: 0 };
    $('replayBar').hidden = false;
    $('rpSlider').max = replay.moves.length;
    replayGoto(0, false);
    replayPlay();
  }
  function replayGoto(i, animate) {
    if (!replay) return;
    replay.idx = clamp(i, 0, replay.moves.length);
    game = E.replay(replay.final.cols, replay.final.rows, replay.final.numPlayers, replay.moves, replay.idx);
    refresh(animate && replay.idx > 0 ? { ok: true } : null);
    $('rpSlider').value = replay.idx;
    $('rpCount').textContent = `${replay.idx} / ${replay.moves.length}`;
  }
  function replayPlay() {
    if (!replay) return;
    if (replay.timer) { stopReplayPlayback(); return; }
    if (replay.idx >= replay.moves.length) replayGoto(0, false);
    $('rpPlay').querySelector('use').setAttribute('href', '#i-pause');
    const stepMs = { slow: 650, normal: 380, fast: 150 }[settings.speed] || 380;
    replay.timer = setInterval(() => {
      if (replay.idx >= replay.moves.length) { stopReplayPlayback(); return; }
      replayGoto(replay.idx + 1, true);
      const m = game.history[game.history.length - 1];
      if (m && m.claimed.length) sfx.box(m.claimed.length); else sfx.cpu();
    }, stepMs);
  }
  function stopReplayPlayback() {
    if (!replay) return;
    clearInterval(replay.timer);
    replay.timer = 0;
    $('rpPlay').querySelector('use').setAttribute('href', '#i-play');
  }
  function exitReplay() {
    if (!replay) return;
    stopReplayPlayback();
    game = replay.final;
    replay = null;
    $('replayBar').hidden = true;
    logCount = 0; $('moveLog').textContent = '';
    refresh(null);
  }
  $('rpPlay').addEventListener('click', replayPlay);
  $('rpFirst').addEventListener('click', () => { stopReplayPlayback(); replayGoto(0, false); });
  $('rpLast').addEventListener('click', () => { stopReplayPlayback(); replayGoto(Infinity, false); });
  $('rpPrev').addEventListener('click', () => { stopReplayPlayback(); replayGoto(replay.idx - 1, false); });
  $('rpNext').addEventListener('click', () => { stopReplayPlayback(); replayGoto(replay.idx + 1, true); });
  $('rpSlider').addEventListener('input', e => { stopReplayPlayback(); replayGoto(Number(e.target.value), false); });
  $('rpExit').addEventListener('click', exitReplay);

  /* =====================================================================
   * CONFETTI
   * ===================================================================== */
  const confettiCanvas = $('confetti');
  let confettiRaf = 0;
  function launchConfetti(colors) {
    if (!settings.anim) return;
    cancelAnimationFrame(confettiRaf);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    confettiCanvas.width = W * dpr; confettiCanvas.height = H * dpr;
    confettiCanvas.hidden = false;
    const ctx = confettiCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = colors.concat(['#facc15', '#ffffff', ...colors]);
    const parts = Array.from({ length: Math.min(220, Math.round(W / 5)) }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: palette[Math.floor(Math.random() * palette.length)]
    }));
    const t0 = performance.now();
    const frame = now => {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 3200);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
        ctx.restore();
      }
      if (t < 3200) confettiRaf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); confettiCanvas.hidden = true; }
    };
    confettiRaf = requestAnimationFrame(frame);
  }

  /* =====================================================================
   * INIT
   * ===================================================================== */
  colsInput.value = settings.cols;
  rowsInput.value = settings.rows;
  renderPlayerRows();
  updateBoardInfo();
  syncSettingsUI();
  renderResumeCard();
  logoStart();

  // Exposed for automated tests and the console.
  window.DotsAndBoxesApp = {
    get game() { return game; },
    get players() { return players; },
    get replaying() { return !!replay; },
    settings
  };
})();
