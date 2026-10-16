// 特效与音效：彩带、数字飘字、合成音效
const FX = (() => {
  // 彩带：带旋转与飘动的纸片
  function confetti(ms = 7000) {
    const c = document.getElementById('confetti'), x = c.getContext('2d'), dpr = Math.min(2, devicePixelRatio);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; x.scale(dpr, dpr);
    const W = innerWidth, H = innerHeight, colors = ['#f2b544', '#ef8a5b', '#e88aa8', '#74bf7e', '#5bb5d6', '#a68bd8', '#ffd76a'];
    const ps = Array.from({ length: Math.min(240, W / 4) }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * .8, vx: (Math.random() - .5) * 2.4,
      vy: 1.6 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - .5) * .2, s: 7 + Math.random() * 8, w: Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)] }));
    const end = Date.now() + ms;
    (function tick() {
      x.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.w += .08; p.x += p.vx + Math.sin(p.w) * .8; p.y += p.vy; p.r += p.vr;
        if (p.y > H + 20 && Date.now() < end) { p.y = -20; p.x = Math.random() * W; }
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.scale(1, Math.cos(p.w * 2));
        x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore();
      }
      if (Date.now() < end + 4000) requestAnimationFrame(tick); else x.clearRect(0, 0, W, H);
    })();
  }

  // 资源变化飘字
  function floatNums(el, d) {
    if (!el || !d) return;
    const r = el.getBoundingClientRect();
    let i = 0;
    for (const [k, v] of Object.entries(d)) {
      if (!v) continue;
      const s = document.createElement('div'); s.className = 'float-num';
      s.innerHTML = fmtRes({ [k]: v });
      s.style.left = (r.left + r.width / 2 - 30 + i * 22) + 'px'; s.style.top = (r.top + 10) + 'px';
      s.style.animationDelay = i * .14 + 's';
      document.body.appendChild(s); setTimeout(() => s.remove(), 2200); i++;
    }
  }

  // 合成音效（无需音频文件）
  let ac = null, muted = localStorage.getItem('ecg_mute') === '1';
  function tone(freq, dur = .12, type = 'sine', vol = .15, delay = 0, slide) {
    if (muted) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
      o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
    } catch (e) { /* 部分浏览器不支持 */ }
  }
  const sfx = {
    click: () => tone(880, .05, 'triangle', .06),
    dice: () => { for (let i = 0; i < 7; i++) tone(180 + Math.random() * 260, .045, 'square', .035, i * .09); tone(120, .15, 'sine', .12, .95); },
    step: () => tone(620, .07, 'sine', .07, 0, 820),
    card: () => { tone(300, .25, 'sine', .07, 0, 900); tone(1200, .12, 'triangle', .04, .18); },
    good: () => { tone(523, .12, 'triangle', .1); tone(659, .12, 'triangle', .1, .09); tone(1047, .3, 'triangle', .1, .18); },
    bad: () => { tone(220, .3, 'sawtooth', .05, 0, 110); },
    turn: () => { tone(784, .12, 'sine', .1); tone(1175, .25, 'sine', .1, .1); },
    win: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, .3, 'triangle', .11, i * .13)),
  };
  return { confetti, floatNums, sfx, get muted() { return muted; }, setMuted(v) { muted = v; localStorage.setItem('ecg_mute', v ? '1' : '0'); } };
})();
