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
    lastHeal: null
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
    role: 'civilian',
    ready: false
  });
}

const meH = () => H ? H.players.find(p => p.host && !p.conn) : null;
const byId = id => H.players.find(p => p.id === id);
const alive = () => H.players.filter(p => p.alive);
const aliveMafia = () => alive().filter(p => p.role === 'mafia' || p.role === 'don');

function sendP(p, m) {
  if (!m) return;
  if (p.conn) sendRaw(p.conn, m);
  else ingest(m);
}

function pushAll() {
  H.players.forEach(p => sendP(p, viewFor(p)));
}

function logLine(text, kind) {
  const m = { t: 'log', text, kind: kind || null };
  H.players.forEach(p => sendP(p, m));
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
  assignRoles();
  H.phase = 'reveal';
  H.round = 0;
  H.started = true;
  H.winner = null;
  H.votes = {};
  H.voteResolved = false;
  H.lastHeal = null;
  H.players.forEach(p => {
    p.ready = false;
    p.alive = true;
    p.action = null;
    p.killDone = false;
    p.checkDone = false;
    p.docDone = false;
    p.donCheckDone = false;
    p.gone = false;
  });
  logLine('Роли розданы. Никому не верьте.');
  pushAll();
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

// ================= ФАЗА: НОЧЬ =================
function goNight() {
  clearTimeout(H.timer);
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
  H.timer = setTimeout(resolveNight, H.settings.night * 1000);
}

function tryEarlyNight() {
  if (H.phase !== 'night') return;
  const a = alive();
  const killers = a.filter(q => q.role === 'mafia' || q.role === 'don');
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
  const kills = alive().filter(p => p.role === 'mafia' || p.role === 'don').map(p => p.action).filter(Boolean);
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
    logLine('Этой ночью был убит ' + v.name + '.' + (H.settings.reveal ? ' ' + v.name + ' — ' + roleName(v.role).toLowerCase() + '.' : ''), 'death');
  } else {
    logLine(victimId ? 'Этой ночью никто не пострадал. Доктор успел вовремя.' : 'Этой ночью выстрелов не было.', healed ? 'heal' : null);
  }
  H.lastHeal = healed || null;
  if (checkWin()) return;
  goDay();
}

// ================= ФАЗА: ДЕНЬ И ГОЛОСОВАНИЕ =================
function goDay() {
  clearTimeout(H.timer);
  H.phase = 'day';
  H.votes = {};
  H.deadline = Date.now() + H.settings.discuss * 1000;
  logLine('День ' + H.round + '. Обсуждение началось.');
  pushAll();
  H.timer = setTimeout(goVote, H.settings.discuss * 1000);
}

function goVote() {
  clearTimeout(H.timer);
  H.phase = 'voting';
  H.votes = {};
  H.voteResolved = false;
  H.deadline = Date.now() + H.settings.vote * 1000;
  logLine('Голосование: кто покинет город?');
  pushAll();
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
    logLine('Город решил: ' + v.name + ' покидает игру.' + (H.settings.reveal ? ' ' + v.name + ' — ' + roleName(v.role).toLowerCase() + '.' : ''), 'death');
  } else {
    logLine('Голоса разделились. Сегодня никто не изгнан.');
  }
  pushAll();
  if (checkWin()) return;
  setTimeout(() => {
    if (H.phase === 'voting') goNight();
  }, 3200);
}

// ================= НОЧНЫЕ ДЕЙСТВИЯ =================
function hostAction(p, d) {
  if (H.phase !== 'night' || !p.alive) return;
  const r = p.role, t = byId(d.target);

  if (d.kind === 'kill' && (r === 'mafia' || r === 'don')) {
    if (!t || !t.alive || t.role === 'mafia' || t.role === 'don' || p.killDone) return;
    p.action = t.id;
    p.killDone = true;
    sendP(p, { t: 'ack' });
    tryEarlyNight();
  } else if (d.kind === 'check' && r === 'sheriff') {
    if (!t || !t.alive || t.id === p.id || p.checkDone) return;
    p.checkDone = true;
    sendP(p, { t: 'check', name: t.name, isMafia: t.role === 'mafia' });
    sendP(p, { t: 'ack' });
    tryEarlyNight();
  } else if (d.kind === 'heal' && r === 'doctor') {
    if (!t || !t.alive || p.docDone || t.id === H.lastHeal) return;
    p.action = t.id;
    p.docDone = true;
    sendP(p, { t: 'ack' });
    tryEarlyNight();
  } else if (d.kind === 'doncheck' && r === 'don') {
    if (!t || !t.alive || t.id === p.id || p.donCheckDone) return;
    p.donCheckDone = true;
    sendP(p, { t: 'check', don: true, name: t.name, isSheriff: t.role === 'sheriff' });
    sendP(p, { t: 'ack' });
    tryEarlyNight();
  } else if (d.kind === 'donskip' && r === 'don') {
    if (p.donCheckDone) return;
    p.donCheckDone = true;
    sendP(p, { t: 'ack' });
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
  H.phase = 'over';
  H.winner = w;
  H.deadline = 0;
  logLine(w === 'mafia' ? 'Мафия захватила город!' : 'Город очищен от мафии!');
  pushAll();
}

function toLobby() {
  clearTimeout(H.timer);
  H.phase = 'lobby';
  H.started = false;
  H.winner = null;
  H.round = 0;
  H.deadline = 0;
  H.votes = {};
  H.voteResolved = false;
  H.players = H.players.filter(p => p.host || p.conn);
  H.players.forEach(p => {
    p.alive = true;
    p.gone = false;
    p.ready = false;
    p.role = 'civilian';
  });
  pushAll();
}

// ================= ЧАТ =================
function hostChat(p, text) {
  text = String(text || '').trim().slice(0, 200);
  if (!text) return;
  const dead = H.started && !p.alive;
  const m = { t: 'chat', name: p.name, color: p.color, text, dead };
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
    case 'mafia': case 'don': return !!p.killDone;
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
    settings: { ...H.settings },
    you: {
      id: p.id,
      name: p.name,
      role: p.role,
      alive: p.alive,
      ready: p.ready,
      team: (p.role === 'mafia' || p.role === 'don')
        ? H.players.filter(q => q.role === 'mafia' || q.role === 'don').map(q => ({ id: q.id, name: q.name }))
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
      gone: !!q.gone,
      role: (over || (H.started && !q.alive && H.settings.reveal)) ? q.role : null,
      voted: H.phase === 'voting' && H.votes[q.id] != null,
      votes: H.phase === 'voting' ? va(q.id) : 0
    })),
    myVote: H.votes[p.id] != null ? H.votes[p.id] : null
  };
}