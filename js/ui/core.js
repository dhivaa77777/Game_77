/* Dots and Boxes UI: shared foundation.
 * Creates the window.DAB namespace used by every other js/ui file, plus constants,
 * small helpers and local storage access. Loaded first.
 */
window.DAB = window.DAB || {};
(function (D) {
  'use strict';

  D.E = window.DBEngine;
  D.AI = window.DBAI;
  D.$ = id => document.getElementById(id);

  /* ---------- Constants ---------- */
  D.C = {
    DEFAULT_COLORS: ['#2563eb', '#e11d48', '#16a34a', '#d97706'],
    CPU_NAMES: ['Ada', 'Bolt', 'Cog', 'Dash'],
    TYPES: ['human', 'easy', 'medium', 'hard'],
    TYPE_LABEL: { human: 'Human', easy: 'Computer · Easy', medium: 'Computer · Medium', hard: 'Computer · Hard' },
    TYPE_SHORT: { human: 'Person', easy: '🤖 Easy', medium: '🤖 Medium', hard: '🤖 Hard' },
    SPEED_MS: { slow: 950, normal: 520, fast: 170 },
    REPLAY_MS: { slow: 650, normal: 380, fast: 150 },
    THEMES: ['light', 'dark', 'paper', 'auto'],
    TIMERS: [0, 10, 20, 30, 60],
    MAX_SYMBOL: 2
  };

  /* ---------- Storage (fails quietly in private mode etc.) ---------- */
  D.KEYS = { settings: 'dab:settings:v2', save: 'dab:save:v2', stats: 'dab:stats:v2' };
  D.store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  /* ---------- Helpers ---------- */
  const SVG_NS = 'http://www.w3.org/2000/svg';
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
  const moveName = m => (m.type === 'h'
    ? `${colLetter(m.c)}${m.r + 1}–${colLetter(m.c + 1)}${m.r + 1}`
    : `${colLetter(m.c)}${m.r + 1}–${colLetter(m.c)}${m.r + 2}`);
  const joinNames = names => (names.length <= 2 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);

  // User-perceived characters, so an emoji like 👩‍🚀 counts as one symbol.
  const segmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const graphemes = str => (segmenter ? Array.from(segmenter.segment(str), x => x.segment) : Array.from(str));

  /** Fallback box labels from names (used only if a saved game has no symbols). */
  function computeLabels(names) {
    const clean = names.map(n => n.replace(/[^\p{L}\p{N}]/gu, ''));
    for (let len = 1; len <= 2; len++) {
      const labels = clean.map(n => (Array.from(n).slice(0, len).join('') || '?').toUpperCase());
      if (new Set(labels).size === labels.length) return labels.map(l => l.charAt(0) + l.slice(1).toLowerCase());
    }
    return names.map((_, i) => String(i + 1));
  }

  /** Small coloured dot used in the status line, log and results. */
  function swatch(color, cls) {
    const s = document.createElement('span');
    s.className = cls || 'swatch';
    s.style.background = color;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  D.util = {
    svgEl, textOn, colorDistance, clamp, plural, fmtTime, colLetter, moveName,
    joinNames, graphemes, computeLabels, swatch
  };
})(window.DAB);
