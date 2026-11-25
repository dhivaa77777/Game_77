/* Dots and Boxes UI: user settings.
 * Loads/saves settings, applies theme and animation preference, and wires the Settings dialog
 * and the options on the setup screen (they share the same values).
 */
(function (D) {
  'use strict';

  const { $, E, C, KEYS, store } = D;
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const settings = {
    numPlayers: 2,
    players: C.DEFAULT_COLORS.map((color, i) => ({ name: `Player ${i + 1}`, color, type: 'human', symbol: '', symbolAuto: true })),
    cols: 6, rows: 6,
    sound: true, haptics: true, anim: !reducedMotion, assist: false,
    theme: 'light', speed: 'normal', timer: 0
  };

  (function load() {
    const s = store.get(KEYS.settings);
    if (!s || typeof s !== 'object') return;
    if ([2, 3, 4].includes(s.numPlayers)) settings.numPlayers = s.numPlayers;
    if (Array.isArray(s.players)) s.players.slice(0, 4).forEach((p, i) => {
      if (!p) return;
      const t = settings.players[i];
      if (typeof p.name === 'string') t.name = p.name.slice(0, 16);
      if (/^#[0-9a-f]{6}$/i.test(p.color)) t.color = p.color;
      if (C.TYPES.includes(p.type)) t.type = p.type;
      if (typeof p.symbol === 'string' && p.symbol && p.symbol.length <= 16 && p.symbolAuto === false) {
        t.symbol = p.symbol; t.symbolAuto = false;
      }
    });
    if (E.validSize(s.cols)) settings.cols = s.cols;
    if (E.validSize(s.rows)) settings.rows = s.rows;
    for (const k of ['sound', 'haptics', 'anim', 'assist']) if (typeof s[k] === 'boolean') settings[k] = s[k];
    if (C.THEMES.includes(s.theme)) settings.theme = s.theme;
    if (C.SPEED_MS[s.speed]) settings.speed = s.speed;
    if (C.TIMERS.includes(s.timer)) settings.timer = s.timer;
  })();

  D.settings = settings;
  const save = () => store.set(KEYS.settings, settings);

  /* ---------- Theme & animation ---------- */
  const darkMq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    let t = settings.theme;
    if (t === 'auto') t = darkMq && darkMq.matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'dark' ? '#0b1120' : t === 'paper' ? '#efe9dc' : '#f4f6fb';
  }
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener('change', () => { if (settings.theme === 'auto') applyTheme(); });
  const applyAnim = () => document.body.classList.toggle('anim', settings.anim);

  /** Push current values into every settings control (dialog + setup page). */
  function syncUI() {
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

  function set(key, value) {
    settings[key] = value;
    save();
    syncUI();
    if (key === 'assist' && D.state.game) D.game.refresh(null);
    if (key === 'anim' && !$('setup').hidden) D.setup.logoStart();
  }

  const bind = (id, key, parse) => $(id).addEventListener('change', e => set(key, parse(e.target)));
  bind('optSound', 'sound', t => t.checked);
  bind('optHaptics', 'haptics', t => t.checked);
  bind('optAnim', 'anim', t => t.checked);
  bind('optAssist', 'assist', t => t.checked);
  bind('optTheme', 'theme', t => t.value);
  bind('optSpeed', 'speed', t => t.value);
  bind('optTimer', 'timer', t => Number(t.value));
  bind('setupTimer', 'timer', t => Number(t.value));
  bind('setupSpeed', 'speed', t => t.value);
  bind('setupAssist', 'assist', t => t.checked);
  $('settingsDialog').addEventListener('close', () => D.fx.sfx.line());

  D.prefs = { save, set, syncUI, applyTheme };
})(window.DAB);
