// ================= СОСТОЯНИЕ ХОСТА =================
function newHostState() {
  return {
    phase: 'lobby',
    round: 0,
    seq: 1,
    players: [],
    winner: null,
    started: false,
    settings: { ...DEFAULT_SETTINGS },
    deadline: 0,
    timer: null,
    votes: {},
    voteResolved: false,
    lastHeal: null,
    suspicion: {},
    donFound: null
  };
}

function addHostPlayer(name) {
  H.players.push({
    id: 'p' + (H.seq++),
    conn: null,
    name: name,
    color: PALETTE[0],
    alive: true,
    host: true,
    bot: false,
    role: 'civilian',
    ready: false
  });
}

const meH = () => H ? H.players.find(p => p.host && !p.conn) : null;
const byId = id => H.players.find(p => p.id === id);
const alive = () => H.players.filter(p => p.alive);
const aliveMafia = () => alive().filter(p => p.role === 'mafia' || p.role === 'don');
const isMafiaRole = r => r === 'mafia' || r === 'don';

function sendP(p, m) {
  if (!m || p.bot) return;
  if (p.conn) sendRaw(p.conn, m);
  else ingest(m);
}

function pushAll() {
  H.players.forEach(p => { if (!p.bot) sendP(p, viewFor(p)); });
}

function logLine(text, kind) {
  const m = { t: 'log', text, kind: kind || null };
  H.players.forEach(p => sendP(p, m));
}

function confirmAction(p, kind) {
  sendP(p, { t: 'ack', kind: kind });
  sendP(p, viewFor(p));
}

function bump(id, delta) {
  if (!id) return;
  H.suspicion[id] = Math.max(0, Math.min(8, (H.suspicion[id] || 0) + delta));
}

// ================= ПОДКЛЮЧЕНИЕ ИГРОКОВ =================
function hostJoin(peerId, name) {
  if (H.players.some(q => q.conn === peerId)) return;
  name = cleanName(name);
  if (!name) return sendRaw(peerId, { t: 'join_error', msg: 'Пустое имя' });
  if (H.phase !== 'lobby') return sendRaw(peerId, { t: 'join_error', msg: 'Игра уже началась — дождитесь конца партии' });
  if (H.players.length >= MAX_PLAYERS) return sendRaw(peerId, { t: 'join_error', msg: 'Комната заполнена (' + MAX_PLAYERS + ')' });

  const p = {
    id: 'p' + (H.seq++),
    conn: peerId,
    name: name,
    color: PALETTE[H.players.length % PALETTE.length],
    alive: true,
    host: false,
    bot: false,
    role: 'civilian',
    ready: false
  };
  H.players.push(p);
  sendRaw(peerId, { t: 'welcome', id: p.id });
  logLine(name + ' входит в город.');
  pushAll();
}

function hostLeave(c) {
  if (!H) return;
  const p = H.players.find(q => q.conn === c);
  if (!p) return;

  if (H.phase === 'lobby' || H.phase === 'reveal') {
    H.players = H.players.filter(q => q !== p);
    if (H.phase === 'reveal') {
      H.phase = 'lobby';
      clearTimeout(H.timer);
      clearBotTimers();
    }
    logLine(p.name + ' покинул город.');
    pushAll();
    return;
  }

  p.conn = null;
  p.alive = false;
  p.gone = true;
  logLine(p.name + ' покинул игру.', 'death');
  if (checkWin()) return;
  pushAll();
  if (H.phase === 'night') tryEarlyNight();
  if (H.phase === 'voting' && !H.voteResolved && alive().every(q => H.votes[q.id] != null)) {
    clearTimeout(H.timer);
    resolveVote();
  }
}

// ================= РОЛИ И СТАРТ =================
function startGame() {
  if (H.players.length < MIN_PLAYERS) return;
  clearTimeout(H.timer);
  clearBotTimers();
  assignRoles();
  H.phase = 'reveal';
  H.round = 0;
  H.started = true;
  H.winner = null;
  H.votes = {};
  H.voteResolved = false;
  H.lastHeal = null;
  H.suspicion = {};
  H.donFound = null;
  H.players.forEach(p => {
    p.ready = false;
    p.alive = true;
    p.action = null;
    p.killDone = false;
    p.checkDone = false;
    p.docDone = false;
    p.donCheckDone = false;
    p.foundMafia = null;
    p.gone = false;
  });
  logLine('Роли розданы. Никому не верьте.');
  pushAll();
  botsReady();
  H.timer = setTimeout(() => {
    if (H.phase === 'reveal') goNight();
  }, 25000);
}

function assignRoles() {
  const n = H.players.length;
  const mCount = n < 5 ? 1 : n < 8 ? 2 : n < 11 ? 3 : n < 14 ? 4 : 5;
  const pool = shuffle([...H.players]);
  pool.forEach((p, i) => {
    p.role = i < mCount ? (i === 0 ? 'don' : 'mafia') : 'civilian';
  });
  let extra = mCount;
  if (H.settings.sheriff && extra < pool.length) pool[extra++].role = 'sheriff';
  if (H.settings.doctor && extra < pool.length) pool[extra++].role = 'doctor';
}

// ================= ПРОПУСК ХОДА ХОСТОМ =================
function skipLabel() {
  if (!H) return '';
  if (H.phase === 'reveal') return 'начать ночь, не дожидаясь остальных';
  if (H.phase === 'night') return 'завершить ночь и подвести итоги';
  if (H.phase === 'day') return 'прервать обсуждение и перейти к голосованию';
  if (H.phase === 'voting') return 'закрыть голосование и подсчитать голоса';
  return '';
}

function hostSkip() {
  if (!isHost || !H) return;
  clearTimeout(H.timer);
  clearBotTimers();
  if (H.phase === 'reveal') {
    H.players.forEach(p => p.ready = true);
    logLine('Хост не стал ждать. Город засыпает.');
    goNight();
  } else if (H.phase === 'night') {
    logLine('Хост торопит рассвет.');
    resolveNight();
  } else if (H.phase === 'day') {
    logLine('Хост закрыл обсуждение досрочно.');
    goVote();
  } else if (H.phase === 'voting') {
    logLine('Хост закрыл голосование досрочно.');
    resolveVote();
  }
}

// ================= ФАЗА: НОЧЬ =================
function goNight() {
  clearTimeout(H.timer);
  clearBotTimers();
  H.round++;
  H.phase = 'night';
  H.votes = {};
  H.voteResolved = false;
  H.players.forEach(p => {
    p.action = null;
    p.killDone = H.round === 1;
    p.checkDone = false;
    p.docDone = false;
    p.donCheckDone = false;
  });
  H.deadline = Date.now() + H.settings.night * 1000;
  logLine('Ночь ' + H.round + '. Город засыпает…');
  pushAll();
  botsNight();
  H.timer = setTimeout(resolveNight, H.settings.night * 1000);
}

function tryEarlyNight() {
  if (H.phase !== 'night') return;
  const a = alive();
  const killers = a.filter(q => isMafiaRole(q.role));
  if (!killers.every(q => q.killDone)) return;
  const sh = a.find(q => q.role === 'sheriff');
  if (sh && !sh.checkDone) return;
  const doc = a.find(q => q.role === 'doctor');
  if (doc && !doc.docDone) return;
  const don = a.find(q => q.role === 'don');
  if (don && !don.donCheckDone) return;
  clearTimeout(H.timer);
  resolveNight();
}

function resolveNight() {
  if (H.phase !== 'night') return;
  clearTimeout(H.timer);
  clearBotTimers();
  const killers = alive().filter(p => isMafiaRole(p.role));
  const kills = killers.map(p => p.action).filter(Boolean);
  let victimId = null;
  if (kills.length) {
    const cnt = {};
    kills.forEach(id => cnt[id] = (cnt[id] || 0) + 1);
    const max = Math.max(...Object.values(cnt));
    const top = Object.keys(cnt).filter(k => cnt[k] === max);
    victimId = top[Math.random() * top.length | 0];
  }
  const doc = alive().find(p => p.role === 'doctor');
  const healed = doc ? doc.action : null;

  if (victimId && victimId !== healed) {
    const v = byId(victimId);
    v.alive = false;
    H.suspicion[v.id] = 0;
    logLine('Этой ночью был убит ' + v.name + '.' + (H.settings.reveal ? ' ' + v.name + ' — ' + roleName(v.role).toLowerCase() + '.' : ''), 'death');
  } else if (victimId) {
    logLine('Этой ночью никто не пострадал. Доктор успел вовремя.', 'heal');
  } else if (H.round === 1) {
    logLine('Первая ночь прошла тихо: мафия только знакомилась.');
  } else if (killers.length) {
    logLine('Мафия не выбрала жертву — этой ночью выстрелов не было.');
  } else {
    logLine('Этой ночью выстрелов не было.');
  }

  H.lastHeal = healed || null;
  if (checkWin()) return;
  goDay();
}

// ================= ФАЗА: ДЕНЬ И ГОЛОСОВАНИЕ =================
function goDay() {
  clearTimeout(H.timer);
  clearBotTimers();
  H.phase = 'day';
  H.votes = {};
  H.deadline = Date.now() + H.settings.discuss * 1000;
  logLine('День ' + H.round + '. Обсуждение началось.');
  pushAll();
  botsDay();
  H.timer = setTimeout(goVote, H.settings.discuss * 1000);
}

function goVote() {
  clearTimeout(H.timer);
  clearBotTimers();
  H.phase = 'voting';
  H.votes = {};
  H.voteResolved = false;
  H.deadline = Date.now() + H.settings.vote * 1000;
  logLine('Голосование: кто покинет город?');
  pushAll();
  botsVote();
  H.timer = setTimeout(resolveVote, H.settings.vote * 1000);
}

function hostVote(p, target) {
  if (H.phase !== 'voting' || H.voteResolved || !p.alive || H.votes[p.id] != null) return;
  if (target !== 'none') {
    const t = byId(target);
    if (!t || !t.alive || t.id === p.id) return;
  }
  H.votes[p.id] = target;
  pushAll();
  if (alive().every(q => H.votes[q.id] != null)) {
    clearTimeout(H.timer);
    resolveVote();
  }
}

function resolveVote() {
  if (H.phase !== 'voting' || H.voteResolved) return;
  H.voteResolved = true;
  clearTimeout(H.timer);
  clearBotTimers();
  const cnt = {};
  Object.values(H.votes).forEach(t => {
    if (t !== 'none') cnt[t] = (cnt[t] || 0) + 1;
  });
  const entries = Object.entries(cnt);
  let out = null;
  if (entries.length) {
    const max = Math.max(...entries.map(e => e[1]));
    const top = entries.filter(e => e[1] === max);
    if (top.length === 1) out = top[0][0];
  }
  if (out) {
    const v = byId(out);
    v.alive = false;
    if (H.settings.reveal) {
      if (isMafiaRole(v.role)) {
        Object.keys(H.votes).forEach(voter => { if (H.votes[voter] === v.id) bump(voter, -2); });
      } else {
        H.suspicion[v.id] = 0;
      }
    }
    logLine('Город решил: ' + v.name + ' покидает игру.' + (H.settings.reveal ? ' ' + v.name + ' — ' + roleName(v.role).toLowerCase() + '.' : ''), 'death');
  } else {
    logLine('Голоса разделились. Сегодня никто не изгнан.');
  }
  pushAll();
  if (checkWin()) return;
  H.timer = setTimeout(() => {
    if (H.phase === 'voting') goNight();
  }, 3200);
}

// ================= НОЧНЫЕ ДЕЙСТВИЯ =================
function hostAction(p, d) {
  if (H.phase !== 'night' || !p.alive) return;
  const r = p.role, t = byId(d.target);

  if (d.kind === 'kill' && isMafiaRole(r)) {
    if (H.round === 1) return;
    if (!t || !t.alive || isMafiaRole(t.role) || p.killDone) return;
    p.action = t.id;
    p.killDone = true;
    confirmAction(p, 'kill');
    tryEarlyNight();

  } else if (d.kind === 'check' && r === 'sheriff') {
    if (!t || !t.alive || t.id === p.id || p.checkDone) return;
    p.checkDone = true;
    const mafia = t.role === 'mafia';
    sendP(p, { t: 'check', name: t.name, isMafia: mafia });
    if (p.bot) {
      if (mafia) { p.foundMafia = t.id; bump(t.id, 5); }
      else bump(t.id, -3);
    }
    confirmAction(p, 'check');
    tryEarlyNight();

  } else if (d.kind === 'heal' && r === 'doctor') {
    if (!t || !t.alive || p.docDone || t.id === H.lastHeal) return;
    p.action = t.id;
    p.docDone = true;
    confirmAction(p, 'heal');
    tryEarlyNight();

  } else if (d.kind === 'doncheck' && r === 'don') {
    if (!t || !t.alive || t.id === p.id || p.donCheckDone) return;
    p.donCheckDone = true;
    const sheriff = t.role === 'sheriff';
    sendP(p, { t: 'check', don: true, name: t.name, isSheriff: sheriff });
    if (sheriff) H.donFound = t.id;
    confirmAction(p, 'doncheck');
    tryEarlyNight();

  } else if (d.kind === 'donskip' && r === 'don') {
    if (p.donCheckDone) return;
    p.donCheckDone = true;
    confirmAction(p, 'donskip');
    tryEarlyNight();
  }
}

// ================= ПОБЕДА =================
function checkWin() {
  const m = aliveMafia().length, c = alive().length - m;
  if (m === 0) { endGame('city'); return true; }
  if (m >= c) { endGame('mafia'); return true; }
  return false;
}

function endGame(w) {
  clearTimeout(H.timer);
  clearBotTimers();
  H.phase = 'over';
  H.winner = w;
  H.deadline = 0;
  logLine(w === 'mafia' ? 'Мафия захватила город!' : 'Город очищен от мафии!');
  pushAll();
}

function toLobby() {
  clearTimeout(H.timer);
  clearBotTimers();
  H.phase = 'lobby';
  H.started = false;
  H.winner = null;
  H.round = 0;
  H.deadline = 0;
  H.votes = {};
  H.voteResolved = false;
  H.suspicion = {};
  H.donFound = null;
  H.players = H.players.filter(p => p.host || p.conn || p.bot);
  H.players.forEach(p => {
    p.alive = true;
    p.gone = false;
    p.ready = false;
    p.role = 'civilian';
    p.foundMafia = null;
  });
  pushAll();
}

// ================= ЧАТ =================
function hostChat(p, text) {
  text = String(text || '').trim().slice(0, 200);
  if (!text) return;
  const low = text.toLowerCase();
  if (H.started) {
    H.players.forEach(q => {
      if (q.id !== p.id && q.alive && q.name.length > 2 && low.includes(q.name.toLowerCase())) bump(q.id, 1);
    });
  }
  const dead = H.started && !p.alive;
  const m = { t: 'chat', name: p.name, color: p.color, text, dead, bot: !!p.bot };
  H.players.forEach(q => {
    if (!dead || !q.alive) sendP(q, m);
  });
}

// ================= РОУТЕР КОМАНД =================
function hostCmd(p, d) {
  if (!p || !d) return;
  switch (d.t) {
    case 'chat': hostChat(p, d.text); break;
    case 'vote': hostVote(p, d.target); break;
    case 'action': hostAction(p, d); break;
    case 'ready':
      if (H.phase === 'reveal' && !p.ready) {
        p.ready = true;
        pushAll();
        if (H.players.every(q => q.ready)) {
          clearTimeout(H.timer);
          clearBotTimers();
          goNight();
        }
      }
      break;
  }
}

// ================= ПЕРСОНАЛЬНОЕ ПРЕДСТАВЛЕНИЕ =================
function actedOf(p) {
  if (H.phase !== 'night') return true;
  switch (p.role) {
    case 'mafia': case 'don': return !!p.killDone || H.round === 1;
    case 'sheriff': return !!p.checkDone;
    case 'doctor': return !!p.docDone;
    default: return true;
  }
}

function viewFor(p) {
  const over = H.phase === 'over';
  const va = id => Object.values(H.votes).filter(v => v === id).length;
  return {
    t: 'view',
    code,
    phase: H.phase,
    round: H.round,
    deadline: H.deadline,
    winner: H.winner,
    started: H.started,
    canStart: H.players.length >= MIN_PLAYERS,
    readyTotal: H.players.length,
    readyCount: H.players.filter(q => q.ready).length,
    botCount: H.players.filter(q => q.bot).length,
    settings: { ...H.settings },
    you: {
      id: p.id,
      name: p.name,
      role: p.role,
      alive: p.alive,
      ready: p.ready,
      team: isMafiaRole(p.role)
        ? H.players.filter(q => isMafiaRole(q.role)).map(q => ({ id: q.id, name: q.name }))
        : null,
      acted: actedOf(p),
      donCheckDone: !!p.donCheckDone,
      healLock: H.lastHeal
    },
    players: H.players.map(q => ({
      id: q.id,
      name: q.name,
      color: q.color,
      alive: q.alive,
      host: q.host,
      bot: !!q.bot,
      gone: !!q.gone,
      role: (over || (H.started && !q.alive && H.settings.reveal)) ? q.role : null,
      voted: H.phase === 'voting' && H.votes[q.id] != null,
      votes: H.phase === 'voting' ? va(q.id) : 0
    })),
    myVote: H.votes[p.id] != null ? H.votes[p.id] : null
  };
}