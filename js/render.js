// ================= ПРИЁМ ДАННЫХ =================
function ingest(d) {
  if (!d) return;
  switch (d.t) {
    case 'welcome': myId = d.id; break;
	case 'join_error':
      busy('');
      toast(d.msg, true);
      try { room && room.leave(); } catch (e) {}
      break;
    case 'view':
      const prev = view ? view.phase + ':' + view.round : '';
      view = d;
      localDone = false;
      fx(prev);
      render();
      break;
    case 'chat': addChat(d); break;
    case 'log': addLog(d.text); break;
    case 'ack':
      localDone = true;
      if (view && view.you) view.you.acted = true;
      render();
      break;
    case 'check':
      const msg = d.don
        ? (d.isSheriff ? d.name + ' — ШЕРИФ!' : d.name + ' — не шериф.')
        : (d.isMafia ? d.name + ' — МАФИЯ!' : d.name + ' — мирный житель.');
      toast((d.don ? '🎩 ' : '⭐ ') + msg, d.don ? d.isSheriff : d.isMafia);
      notes.push(msg);
      renderNotes();
      break;
  }
}

function fx(prev) {
  if (!view || !view.started) return;
  const key = view.phase + ':' + view.round;
  if (prev === key) return;
  if (view.phase === 'night') {
    banner('НОЧЬ ' + view.round, '#9db4ff');
    beep(98, .7, 'sine', .06);
  } else if (view.phase === 'day') {
    banner('ДЕНЬ ' + view.round, 'var(--gold2)');
    beep(392, .16);
    setTimeout(() => beep(523, .2), 140);
  } else if (view.phase === 'voting') {
    banner('ГОЛОСОВАНИЕ', 'var(--red2)');
    beep(220, .3, 'square', .03);
  } else if (view.phase === 'over') {
    banner(view.winner === 'mafia' ? 'МАФИЯ ПОБЕДИЛА' : 'ГОРОД ПОБЕДИЛ', view.winner === 'mafia' ? 'var(--red2)' : 'var(--gold2)');
    beep(262, .2);
    setTimeout(() => beep(330, .2), 180);
    setTimeout(() => beep(392, .3), 360);
  }
}

// ================= ЧАТ/ЛЕНТА =================
const feed = $('#feed');
function scrollFeed() { feed.scrollTop = feed.scrollHeight; }

function addChat(m) {
  const d = document.createElement('div');
  d.className = 'msg' + (m.dead ? ' dead' : '');
  d.innerHTML = '<span class="who" style="color:' + esc(m.color) + '">' + esc(m.name) + '</span>' + esc(m.text);
  feed.append(d);
  scrollFeed();
}

function addLog(t) {
  const d = document.createElement('div');
  d.className = 'msg sys';
  d.textContent = t;
  feed.append(d);
  scrollFeed();
}

function renderNotes() {
  const box = $('#notes-box');
  if (!notes.length) { box.hidden = true; return; }
  box.hidden = false;
  $('#notes-list').innerHTML = notes.map(n => '<li>— <b>' + esc(n) + '</b></li>').join('');
}

// ================= ГЛАВНЫЙ РЕНДЕР =================
let revealKey = '', nightKey = '';

function render() {
  if (!view) return;
  document.body.dataset.phase = view.phase;
  if (view.phase === 'lobby') renderLobby();
  else if (view.phase === 'reveal') renderReveal();
  else if (view.phase === 'over') renderOver();
  else renderGame();
}

// ================= ЛОББИ =================
function fillSelect(el, pairs, val) {
  if (el.dataset.init !== code) {
    el.innerHTML = pairs.map(p => '<option value="' + p[0] + '">' + p[1] + '</option>').join('');
    el.dataset.init = code;
  }
  if (document.activeElement !== el) el.value = String(val);
}

function renderLobby() {
  showScreen('scr-lobby');
  $('#lob-code').textContent = code;
  $('#lob-count').textContent = view.players.length + ' / ' + MAX_PLAYERS + ' игроков';
  $('#lob-players').innerHTML = view.players.map(p =>
    '<div class="prow"><div class="av" style="--c:' + p.color + '">' + esc(p.name[0].toUpperCase()) + '</div>' +
    '<span class="pname">' + esc(p.name) + (p.id === view.you.id ? ' <i>(вы)</i>' : '') + (p.host ? ' <b title="хост">♛</b>' : '') + '</span>' +
    (p.host ? '<span class="tag">хост</span>' : '') + '</div>').join('');
  
  const s = view.settings, host = isHost;
  $$('#lob-settings input,#lob-settings select').forEach(el => el.disabled = !host);
  $('#set-sheriff').checked = s.sheriff;
  $('#set-doctor').checked = s.doctor;
  $('#set-reveal').checked = s.reveal;
  fillSelect($('#set-discuss'), DISCUSS_OPTIONS, s.discuss);
  fillSelect($('#set-vote'), VOTE_OPTIONS, s.vote);
  fillSelect($('#set-night'), NIGHT_OPTIONS, s.night);
  $('#btn-start').hidden = !host;
  $('#btn-start').disabled = !view.canStart;
  const n = view.players.length;
  $('#lob-hint').textContent = !host ? 'Игру начнёт хост, когда все соберутся.'
    : n < MIN_PLAYERS ? 'Нужно минимум ' + MIN_PLAYERS + ' игрока. Отправьте друзьям код или ссылку.'
    : n < 6 ? 'Можно начинать, но классическая партия — от 6 игроков.'
    : 'Город готов. Начинаем?';
}

function syncSettings() {
  if (!isHost || !H) return;
  H.settings.sheriff = $('#set-sheriff').checked;
  H.settings.doctor = $('#set-doctor').checked;
  H.settings.reveal = $('#set-reveal').checked;
  H.settings.discuss = +$('#set-discuss').value;
  H.settings.vote = +$('#set-vote').value;
  H.settings.night = +$('#set-night').value;
  pushAll();
}

// ================= РАЗДАЧА РОЛИ =================
function renderReveal() {
  showScreen('scr-reveal');
  const y = view.you, key = code + ':' + view.round + ':' + y.id;
  if (revealKey !== key) {
    revealKey = key;
    const r = ROLES[y.role];
    $('#rface-front').innerHTML = '<div class="ico">' + r.icon + '</div><h3>' + r.name + '</h3><p>' + r.desc + '</p>' +
      (y.team ? '<div class="team">Ваша команда: ' + y.team.map(t => esc(t.name)).join(', ') + '</div>' : '');
    $('#rcard').classList.remove('flip');
    $('#btn-ready').disabled = true;
  }
  $('#btn-ready').textContent = y.ready ? 'Готово ✓' : 'Я готов';
  $('#btn-ready').disabled = y.ready || !$('#rcard').classList.contains('flip');
  $('#ready-count').textContent = 'Готовы ' + view.readyCount + ' из ' + view.readyTotal;
}

// ================= ИГРОВОЙ ЭКРАН =================
function pcardHTML(q, i) {
  const me = view.you.id === q.id;
  const roleTag = q.role ? '<div class="rtag ' + q.role + '">' + ROLES[q.role].icon + ' ' + ROLES[q.role].name + '</div>'
    : (q.alive ? '' : '<div class="deadmark">✝</div>');
  const pips = view.phase === 'voting'
    ? '<div class="vpips">' + (q.voted ? '<span class="ok">✓</span> ' : '') + '●'.repeat(Math.min(q.votes, 8)) + (q.votes > 8 ? ' ' + q.votes : '') + '</div>' : '';
  const click = view.phase === 'voting' && view.you.alive && view.myVote == null && q.alive && !me;
  return '<div class="pcard' + (q.alive ? '' : ' dead') + (me ? ' mine' : '') + (view.myVote === q.id ? ' sel' : '') + (click ? ' click' : '') +
    '" data-id="' + q.id + '" style="animation-delay:' + (i * 40) + 'ms">' +
    '<div class="av" style="--c:' + q.color + '">' + esc(q.name[0].toUpperCase()) + '</div>' +
    '<div class="pname">' + esc(q.name) + (me ? ' <i>(вы)</i>' : '') + (q.host ? ' <b>♛</b>' : '') + (q.gone ? ' <i>(вышел)</i>' : '') + '</div>' +
    roleTag + pips + '</div>';
}

function renderGame() {
  showScreen('scr-game');
  const v = view, y = v.you;
  $('#hud-phase').textContent = v.phase === 'night' ? 'НОЧЬ ' + v.round : v.phase === 'voting' ? 'ДЕНЬ ' + v.round + ' · СУД' : 'ДЕНЬ ' + v.round;
  $('#hud-sub').textContent = v.phase === 'night' ? 'Ночью город молчит. Действуют особые роли.'
    : v.phase === 'voting' ? 'Выберите, кого изгнать, или проголосуйте против всех.'
    : 'Обсуждайте в чате и ищите мафию. Голосование — по таймеру.';
  $('#hud-code').textContent = '♠ ' + v.code;
  $('#hud-role').textContent = y.alive ? ROLES[y.role].icon + ' ' + ROLES[y.role].name : '👻 вы погибли';
  $('#hud-alive').textContent = v.players.filter(p => p.alive).length + ' в игре';
  const night = v.phase === 'night';
  $('#players-grid').hidden = night;
  $('#night-zone').hidden = !night;
  $('#vote-bar').hidden = v.phase !== 'voting';
  if (!night) $('#players-grid').innerHTML = v.players.map(pcardHTML).join('');
  else renderNight();
  if (v.phase === 'voting') {
    const mv = v.myVote;
    $('#my-vote').textContent = mv == null ? '' : mv === 'none' ? 'Ваш голос: против всех'
      : 'Ваш голос: ' + (v.players.find(p => p.id === mv) || {}).name;
    $('#vote-note').textContent = y.alive ? (mv == null ? 'Нажмите на игрока, чтобы голосовать' : 'Голос принят.') : 'Мёртвые не голосуют.';
    $('#btn-vote-none').disabled = !y.alive || mv != null;
  }
  const dead = v.started && !y.alive;
  $('#chat-input').disabled = dead && false;
  $('#chat-input').placeholder = dead ? 'Вас слышат только мёртвые…' : 'Ваша реплика…';
  $('#chat-mode').textContent = dead ? 'режим призрака' : 'живые + призраки';
}

// ================= НОЧНАЯ ПАНЕЛЬ =================
function chipsHTML(list) {
  return '<div class="chips">' + list.map(p => '<button class="chip" data-id="' + p.id + '"><span class="dot" style="--c:' + p.color + '"></span>' + esc(p.name) + '</button>').join('') + '</div>';
}

function renderNight() {
  const y = view.you, key = view.round + ':' + y.acted + ':' + y.donCheckDone + ':' + localDone;
  if (nightKey === key) return;
  nightKey = key;
  const nz = $('#night-zone');
  const aliveP = view.players.filter(p => p.alive);
  const doneBox = '<div class="done">Выбор сделан. Ждём рассвета…</div>';
  let html = '';
  
  if (y.role === 'civilian') {
    html = '<div class="npanel"><div class="sleep"><div class="big">🌙</div><h3>Вы спите</h3>' +
      '<p class="ntext">Город утопает в тумане. Кто-то крадётся по улицам…</p></div></div>';
  } else if (y.role === 'sheriff') {
    html = '<div class="npanel"><div class="nrole"><span class="ico">⭐</span><h3>Шериф ведёт проверку</h3></div>' +
      (y.acted ? doneBox : '<p class="ntext">Кого вы хотите проверить этой ночью?</p><div data-kind="check">' + chipsHTML(aliveP.filter(p => p.id !== y.id)) + '</div>') + '</div>';
  } else if (y.role === 'doctor') {
    const lock = view.players.find(p => p.id === y.healLock);
    const opts = aliveP.filter(p => p.id !== y.healLock);
    html = '<div class="npanel"><div class="nrole"><span class="ico">💉</span><h3>Доктор выходит на смену</h3></div>' +
      (y.acted ? doneBox : '<p class="ntext">Кого вы будете лечить? Можно выбрать себя.</p>' +
      (lock ? '<p class="hint" style="margin-bottom:8px">Нельзя лечить ' + esc(lock.name) + ' второй раз подряд.</p>' : '') +
      '<div data-kind="heal">' + chipsHTML(opts) + '</div>') + '</div>';
  } else {
    const targets = aliveP.filter(p => !y.team.some(t => t.id === p.id));
    const team = '<div class="chips">' + y.team.map(t => '<span class="chip static"><span class="dot" style="--c:' + (view.players.find(p => p.id === t.id) || { color: '#888' }).color + '"></span>' + esc(t.name) + '</span>').join('') + '</div>';
    html = '<div class="npanel mafia"><div class="nrole"><span class="ico">' + (y.role === 'don' ? '🎩' : '🔪') + '</span><h3>' + (y.role === 'don' ? 'Дон мафии' : 'Мафия') + ' просыпается</h3></div>' +
      '<p class="ntext">Ваша команда этой ночью:</p>' + team;
    if (view.round === 1) {
      html += '<p class="ntext">Первая ночь — знакомство. Вы запоминаете друг друга. Убийства начнутся со следующей ночи.</p>';
    } else {
      html += (y.acted || localDone) ? doneBox : '<p class="ntext">Кто не увидит рассвет?</p><div data-kind="kill">' + chipsHTML(targets) + '</div>';
    }
    if (y.role === 'don' && view.round > 0) {
      html += '<div class="nsection"><p class="ntext"><b>Проверка дона:</b> кто из игроков — шериф?</p>' +
        (y.donCheckDone ? '<div class="done">Проверка завершена.</div>'
        : '<div data-kind="doncheck">' + chipsHTML(aliveP.filter(p => p.id !== y.id)) + '</div><button class="btn ghost sm" data-act="donskip">Не проверять</button>');
      html += '</div>';
    }
    html += '</div>';
  }
  nz.innerHTML = html;
}

// ================= ФИНАЛ =================
function renderOver() {
  showScreen('scr-over');
  const t = $('#over-title');
  t.textContent = view.winner === 'mafia' ? 'МАФИЯ ПОБЕДИЛА' : 'ГОРОД ПОБЕДИЛ';
  t.className = view.winner === 'mafia' ? 'mafia' : 'city';
  $('#over-sub').textContent = view.winner === 'mafia'
    ? 'Тёмные дельцы контролируют каждую улицу. Город молчит.'
    : 'Все члены мафии разоблачены. Улицы снова безопасны.';
  $('#over-list').innerHTML = view.players.map(p =>
    '<div class="orow"><div class="av" style="--c:' + p.color + '">' + esc(p.name[0].toUpperCase()) + '</div>' +
    '<span class="pname">' + esc(p.name) + '</span>' +
    '<span class="rtag ' + (p.role || 'civilian') + '">' + (ROLES[p.role] || ROLES.civilian).icon + ' ' + roleName(p.role || 'civilian') + '</span>' +
    '<span class="fate">' + (p.gone ? 'покинул игру' : p.alive ? 'выжил' : 'погиб') + '</span></div>').join('');
  const host = isHost;
  $('#btn-again').hidden = !host;
  $('#btn-tolobby').hidden = !host;
  $('#over-wait').hidden = host;
}