// ================= ЭКРАНЫ =================
function showScreen(id) {
  $$('.scr').forEach(s => s.classList.remove('on'));
  $('#' + id).classList.add('on');
}

function busy(t) {
  const el = $('#home-busy');
  el.textContent = t || '';
  el.classList.toggle('waiting', !!t);
}

// ================= УВЕДОМЛЕНИЯ =================
function toast(text, red) {
  const d = document.createElement('div');
  d.className = 'toast' + (red ? ' red' : '');
  d.textContent = text;
  $('#toasts').append(d);
  setTimeout(() => d.remove(), 3800);
}

function banner(text, color) {
  const b = $('#banner');
  $('#banner-text').textContent = text;
  $('#banner-text').style.color = color || 'var(--txt)';
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

function showErr(msg) {
  $('#err-msg').textContent = msg;
  showScreen('scr-err');
}

// ================= ОБРАТНАЯ СВЯЗЬ =================
function shakeScreen() {
  const el = $('.scr.on');
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

function hitFlash() {
  const el = $('#hit-flash');
  if (!el) return;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

// ================= ЧАСТИЦЫ =================
const FX = (() => {
  const cv = $('#fx');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!cv || !cv.getContext) return { burst() {} };
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, parts = [], raf = null, prev = 0, dust = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const PALETTES = {
    blood: ['#ff6152', '#c8352c', '#7d1a14', '#ffb0a4'],
    gold: ['#ffd479', '#e0a83c', '#a9761f', '#fff3d0'],
    ice: ['#9dbcff', '#7fa8ff', '#4f6fc4', '#e6efff'],
    heal: ['#8fe0a6', '#5fbf7a', '#2f7a4a', '#dff7e6']
  };

  function push(p) { if (parts.length < 320) parts.push(p); }

  function burst(kind, count) {
    const cols = PALETTES[kind] || PALETTES.gold;
    const n = reduce ? 18 : (count || 70);
    const cx = w / 2, cy = kind === 'gold' ? h * 0.18 : h * 0.42;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 320;
      push({
        x: cx + (Math.random() - .5) * w * .25,
        y: cy + (Math.random() - .5) * h * .12,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (kind === 'gold' ? 40 : 90),
        g: kind === 'gold' ? 260 : 190,
        life: 1,
        decay: .35 + Math.random() * .5,
        r: 1.4 + Math.random() * 3.2,
        c: cols[Math.random() * cols.length | 0],
        spin: (Math.random() - .5) * 8,
        rot: Math.random() * 6.28,
        rect: kind === 'gold'
      });
    }
    start();
  }

  function ambient(dt) {
    if (reduce) return;
    dust -= dt;
    if (dust <= 0) {
      dust = .28;
      push({
        x: Math.random() * w, y: h + 8,
        vx: (Math.random() - .5) * 12, vy: -8 - Math.random() * 16,
        g: -2, life: 1, decay: .12, r: .8 + Math.random() * 1.4,
        c: 'rgba(224,168,60,.5)', spin: 0, rot: 0, rect: false
      });
    }
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((ts - prev) / 1000 || 0, .05);
    prev = ts;
    ctx.clearRect(0, 0, w, h);
    ambient(dt);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y > h + 40 || p.y < -80) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.c;
      if (p.rect) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.r, -p.r * 1.8, p.r * 2, p.r * 3.6);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (raf === null && !document.hidden) { prev = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function stop() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  resize();
  start();
  return { burst };
})();

// ================= МОДАЛЬНОЕ ОКНО =================
let modalOk = null;

function ask(text, ok) {
  $('#modal-text').textContent = text;
  modalOk = ok;
  $('#modal').hidden = false;
}

$('#modal-ok').onclick = () => {
  $('#modal').hidden = true;
  const fn = modalOk;
  modalOk = null;
  if (fn) fn();
};

$('#modal-no').onclick = () => {
  $('#modal').hidden = true;
  modalOk = null;
};

// ================= КОПИРОВАНИЕ =================
function copyText(t, label) {
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(() => toast(label + ' скопирован'))
    .catch(() => { prompt('Скопируйте вручную:', t); });
}