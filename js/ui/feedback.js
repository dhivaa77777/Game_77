/* Dots and Boxes UI: feedback.
 * Sound effects (generated with Web Audio, no files), vibration, toast messages,
 * screen-reader announcements and the end-of-game confetti.
 */
(function (D) {
  'use strict';

  const { $ } = D;

  /* ---------- Sound ---------- */
  let actx = null;
  function tone(freq, dur, type, vol, delay) {
    if (!D.settings.sound) return;
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
    if (D.settings.haptics && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignore */ } }
  }

  /* ---------- Toast & screen-reader announcements ---------- */
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

  /* ---------- Confetti ---------- */
  const canvas = $('confetti');
  let raf = 0;
  function confetti(colors) {
    if (!D.settings.anim) return;
    cancelAnimationFrame(raf);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.hidden = false;
    const ctx = canvas.getContext('2d');
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
      ctx.globalAlpha = Math.max(0, 1 - t / 3200);
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
        ctx.restore();
      }
      if (t < 3200) raf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); canvas.hidden = true; }
    };
    raf = requestAnimationFrame(frame);
  }

  D.fx = { sfx, vibrate, toast, announce, confetti };
})(window.DAB);
