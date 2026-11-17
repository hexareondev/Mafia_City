// ================= УТИЛИТЫ =================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function cleanName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function genCode() {
  return Array.from({ length: 4 }, () => CODE_CH[Math.random() * CODE_CH.length | 0]).join('');
}

function genPeerId(code) {
  // Уникальный ID пира с временной меткой для избежания конфликтов
  const timestamp = Date.now().toString(36);
  return `${PEER_PREFIX}${code}-${timestamp}`;
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
let AC = null;
function beep(f = 440, d = .18, type = 'sine', g = .05) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const o = AC.createOscillator(), v = AC.createGain();
    o.type = type;
    o.frequency.value = f;
    v.gain.value = g;
    o.connect(v);
    v.connect(AC.destination);
    o.start();
    v.gain.exponentialRampToValueAtTime(.0001, AC.currentTime + d);
    o.stop(AC.currentTime + d);
  } catch (e) {}
}