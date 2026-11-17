// ================= ТАЙМЕР =================
setInterval(() => {
  const el = $('#hud-timer');
  if (view && view.deadline && ['night', 'day', 'voting'].includes(view.phase)) {
    const s = Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000));
    el.textContent = fmt(s);
    el.classList.toggle('low', s <= 10 && s > 0);
    el.style.visibility = 'visible';
  } else el.style.visibility = 'hidden';
}, 250);

// ================= ОБРАБОТЧИКИ ИНТЕРФЕЙСА =================
$('#btn-create').onclick = () => {
  const n = cleanName($('#home-name').value);
  if (!n) { toast('Введите имя', true); $('#home-name').focus(); return; }
  localStorage.setItem('mafia-name', n);
  $('#btn-create').disabled = true;
  $('#btn-join').disabled = true;
  createRoom(n);
};

$('#btn-join').onclick = () => {
  const n = cleanName($('#home-name').value), c = cleanName($('#home-code').value).toUpperCase();
  if (!n) { toast('Введите имя', true); return; }
  if (c.length !== 4) { toast('Код — 4 символа', true); return; }
  localStorage.setItem('mafia-name', n);
  $('#btn-create').disabled = true;
  $('#btn-join').disabled = true;
  joinRoom(c, n);
};

$('#home-code').addEventListener('input', e => e.target.value = e.target.value.toUpperCase());

$('#btn-start').onclick = () => { if (isHost) startGame(); };

$$('#lob-settings input,#lob-settings select').forEach(el => el.addEventListener('change', syncSettings));

$('#btn-again').onclick = () => { if (isHost) startGame(); };

$('#btn-tolobby').onclick = () => { if (isHost) toLobby(); };

$('#btn-ready').onclick = () => act({ t: 'ready' });

$('#rcard').onclick = () => {
  $('#rcard').classList.toggle('flip');
  if ($('#rcard').classList.contains('flip')) {
    $('#btn-ready').disabled = view.you && view.you.ready ? true : false;
    beep(660, .12, 'sine', .03);
  }
};

$('#btn-copy-code').onclick = () => copyText(code, 'Код');

$('#btn-copy-link').onclick = () => copyText(location.origin + location.pathname + '?room=' + code, 'Ссылка-приглашение');

$('#hud-code').onclick = () => view && copyText(view.code, 'Код');

$('#btn-leave').onclick = $('#btn-leave-lobby').onclick = () => {
  if (confirm('Покинуть игру?')) location.reload();
};

$('#chat-form').addEventListener('submit', e => {
  e.preventDefault();
  const now = Date.now();
  if (now - lastChatTs < 350) return;
  lastChatTs = now;
  const inp = $('#chat-input'), tx = inp.value.trim();
  if (!tx) return;
  act({ t: 'chat', text: tx });
  inp.value = '';
  inp.focus();
});

$('#players-grid').addEventListener('click', e => {
  const c = e.target.closest('.pcard');
  if (!c || !c.classList.contains('click')) return;
  const q = view.players.find(p => p.id === c.dataset.id);
  if (!q) return;
  ask('Проголосовать против игрока ' + q.name + '?', () => act({ t: 'vote', target: q.id }));
});

$('#btn-vote-none').onclick = () => ask('Проголосовать против всех?', () => act({ t: 'vote', target: 'none' }));

$('#night-zone').addEventListener('click', e => {
  const skip = e.target.closest('[data-act=donskip]');
  if (skip) { act({ t: 'action', kind: 'donskip' }); return; }
  const chip = e.target.closest('.chip[data-id]');
  if (!chip) return;
  const wrap = chip.closest('[data-kind]');
  if (!wrap) return;
  const kind = wrap.dataset.kind, id = chip.dataset.id;
  const q = view.players.find(p => p.id === id);
  if (!q) return;
  const label = {
    kill: 'Выбрать целью ' + q.name + '?',
    check: 'Проверить ' + q.name + '?',
    heal: 'Лечить ' + q.name + '?',
    doncheck: 'Проверить на шерифа: ' + q.name + '?'
  }[kind];
  ask(label, () => act({ t: 'action', kind, target: id }));
});

// ================= СТАРТ =================
(function init() {
  const saved = localStorage.getItem('mafia-name');
  if (saved) $('#home-name').value = saved;
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    $('#home-code').value = room.toUpperCase().slice(0, 4);
    $('#home-name').focus();
  }
  document.body.dataset.phase = 'home';
})();