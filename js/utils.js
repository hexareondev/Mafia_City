// ================= УТИЛИТЫ =================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function genCode() {
  return Array.from({ length: 4 }, () => CODE_CH[Math.random() * CODE_CH.length | 0]).join('');
}

function roleName(r) {
  return ROLES[r] ? ROLES[r].name : '?';
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmt(s) {
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ================= ЗВУК =================
const Sound = {
  on: localStorage.getItem('mafia-sound') !== '0',
  ctx: null,
  ready() {
    if (!this.on) return null;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch (e) { return null; }
  }
};

function beep(f = 440, d = .18, type = 'sine', g = .05) {
  const ctx = Sound.ready();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(), v = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    v.gain.value = g;
    o.connect(v);
    v.connect(ctx.destination);
    o.start();
    v.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + d);
    o.stop(ctx.currentTime + d);
  } catch (e) {}
}

function paintSound() {
  const b = $('#sound-btn');
  if (!b) return;
  b.textContent = Sound.on ? '🔊 Звук' : '🔇 Тихо';
  b.classList.toggle('off', !Sound.on);
  b.title = Sound.on ? 'Звук включён — нажмите, чтобы выключить' : 'Звук выключен — нажмите, чтобы включить';
}

const soundBtn = $('#sound-btn');
if (soundBtn) {
  soundBtn.onclick = () => {
    Sound.on = !Sound.on;
    localStorage.setItem('mafia-sound', Sound.on ? '1' : '0');
    paintSound();
    if (Sound.on) beep(660, .12, 'sine', .04);
  };
}
paintSound();

document.addEventListener('pointerdown', () => { Sound.ready(); }, { once: true });