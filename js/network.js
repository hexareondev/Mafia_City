/* ================= СЕТЬ: Firebase Realtime Database =================
   Хост хранит состояние партии, клиенты шлют команды в его «входящие».
   Каждое сообщение удаляется сразу после доставки — база остаётся пустой. */

let db = null, roomRef = null, upRef = null, downRef = null, presRef = null, hostRef = null, connRef = null;
let room = null, netStatus = 'offline';
let isHost = false, code = '', gotWelcome = false, joinName = '';
let view = null, myId = null, localDone = false, lastChatTs = 0;
const notes = [];
let H = null;
let hostPeerId = 'host';
const myPeerId = 'u' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const bindings = [];
let helloTimer = null, failTimer = null, pingTimer = null;

const RULES_TEXT = '{\n  "rules": {\n    "rooms": {\n      ".read": true,\n      ".write": true\n    }\n  }\n}';

/* ---------- загрузка SDK с запасным CDN ---------- */
function loadScript(url, ms) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    const t = setTimeout(() => { s.remove(); reject(new Error('timeout ' + url)); }, ms || 9000);
    s.onload = () => { clearTimeout(t); resolve(); };
    s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('load ' + url)); };
    document.head.appendChild(s);
  });
}

async function ensureFirebase() {
  if (window.firebase && firebase.database) return;
  const sets = [
    ['https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
     'https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js'],
    ['https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-app-compat.js',
     'https://cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-database-compat.js']
  ];
  for (const pair of sets) {
    try {
      for (const url of pair) await loadScript(url);
      if (window.firebase && firebase.database) return;
    } catch (e) {
      console.warn('Firebase CDN недоступен:', e.message);
    }
  }
  throw new Error('sdk');
}

function configReady() {
  const c = window.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.databaseURL && !/PASTE|ВСТАВ/i.test(c.apiKey + c.databaseURL));
}

function initApp() {
  if (!configReady()) throw new Error('config');
  if (!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG);
  db = firebase.database();
}

/* ---------- статус связи ---------- */
function setNetStatus(s) {
  netStatus = s;
  const el = $('#lob-net'), btn = $('#btn-net-retry'), help = $('#db-help');
  if (help) help.hidden = s !== 'denied';
  if (!el) return;
  if (s === 'connecting') {
    el.textContent = 'Подключаемся к базе';
    el.className = 'hint wait';
    if (btn) btn.hidden = true;
  } else if (s === 'online') {
    el.textContent = 'Связь установлена. Комната открыта для входа.';
    el.className = 'hint ok';
    if (btn) btn.hidden = true;
  } else if (s === 'config') {
    el.textContent = 'Firebase не настроен: заполните js/firebase-config.js';
    el.className = 'hint err';
    if (btn) btn.hidden = false;
  } else if (s === 'denied') {
    el.textContent = 'База отклонила запрос: нужно опубликовать правила доступа.';
    el.className = 'hint err';
    if (btn) btn.hidden = false;
  } else {
    el.textContent = 'Нет связи с базой. Проверьте интернет и повторите.';
    el.className = 'hint err';
    if (btn) btn.hidden = false;
  }
  if (view && view.phase === 'lobby') renderLobby();
}

function isDenied(e) {
  const s = String((e && (e.code || e.message)) || '');
  return /permission[_ ]?denied/i.test(s);
}

function netError(e) {
  console.error(e);
  if (isDenied(e)) { setNetStatus('denied'); return; }
  const kind = e && e.message;
  if (kind === 'config') {
    setNetStatus('config');
    if (!isHost) { busy(''); showErr('Firebase не настроен. Заполните js/firebase-config.js.'); }
    return;
  }
  setNetStatus('error');
  if (!isHost) {
    busy('');
    showErr(kind === 'sdk'
      ? 'Не удалось загрузить Firebase SDK. Проверьте интернет и обновите страницу.'
      : 'Нет связи с базой Firebase. Проверьте databaseURL и правила базы.');
  }
}

/* ---------- подписки ---------- */
function bind(ref, event, fn) {
  ref.on(event, fn, netError);
  bindings.push({ ref, event, fn });
}

function unbindAll() {
  while (bindings.length) {
    const b = bindings.pop();
    try { b.ref.off(b.event, b.fn); } catch (e) {}
  }
}

function stopTimers() {
  stopHello();
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
}

function cleanup(removeRoom) {
  stopTimers();
  unbindAll();
  try { if (!isHost && presRef) presRef.remove(); } catch (e) {}
  try { if (isHost && removeRoom && roomRef) roomRef.remove(); } catch (e) {}
  roomRef = upRef = downRef = presRef = hostRef = connRef = null;
}

/* ---------- отправка ---------- */
function sendRaw(peerId, m) {
  if (!m || !roomRef || !peerId) return;
  roomRef.child('down/' + peerId).push(m).catch(netError);
}

function sendUp(o) {
  if (!roomRef) return;
  roomRef.child('up').push(Object.assign({}, o, { from: myPeerId })).catch(netError);
}

async function pickFreeCode() {
  for (let i = 0; i < 10; i++) {
    const c = genCode();
    const snap = await db.ref('rooms/' + c).once('value');
    if (!snap.exists()) return c;
  }
  throw new Error('code');
}

/* ---------- переподключение ---------- */
function watchConnection() {
  connRef = db.ref('.info/connected');
  bind(connRef, 'value', s => {
    if (!s.val()) {
      if (netStatus === 'online') setNetStatus('connecting');
      return;
    }
    if (isHost) {
      if (roomRef) {
        roomRef.onDisconnect().remove();
        roomRef.child('host/ts').set(firebase.database.ServerValue.TIMESTAMP).catch(netError);
      }
      setNetStatus('online');
    } else {
      if (presRef) {
        presRef.set({ name: joinName, ts: firebase.database.ServerValue.TIMESTAMP }).catch(netError);
        presRef.onDisconnect().remove();
      }
      if (gotWelcome) setNetStatus('online');
      else startHello();
    }
  });

  if (!isHost) {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (gotWelcome) sendUp({ t: 'ping' }); }, 12000);
  }
}

/* ---------- хост ---------- */
function wireHost() {
  upRef = roomRef.child('up');
  bind(upRef, 'child_added', snap => {
    const d = snap.val();
    snap.ref.remove();
    if (!d || !d.from) return;
    if (d.t === 'hello') { hostJoin(d.from, d.name); return; }
    if (d.t === 'bye') { hostLeave(d.from); return; }
    if (d.t === 'ping') return;
    const p = H.players.find(q => q.conn === d.from);
    if (p) hostCmd(p, d);
  });

  presRef = roomRef.child('presence');
  bind(presRef, 'child_removed', snap => hostLeave(snap.key));
}

async function openHostRoom() {
  code = await pickFreeCode();
  roomRef = db.ref('rooms/' + code);
  await roomRef.set({
    host: { id: myPeerId, ts: firebase.database.ServerValue.TIMESTAMP },
    created: firebase.database.ServerValue.TIMESTAMP
  });
  await roomRef.onDisconnect().remove();
  room = { leave() { cleanup(true); } };
  wireHost();
  watchConnection();
}

async function createRoom(name) {
  isHost = true;
  H = newHostState();
  addHostPlayer(name);
  showScreen('scr-lobby');
  setNetStatus('connecting');
  pushAll();
  try {
    await ensureFirebase();
    initApp();
    await openHostRoom();
    pushAll();
    setNetStatus('online');
    logLine('Город основан. Ждём жителей.');
  } catch (e) {
    netError(e);
    pushAll();
  }
}

/* ---------- клиент ---------- */
function wireClient() {
  downRef = roomRef.child('down/' + myPeerId);
  bind(downRef, 'child_added', snap => {
    const d = snap.val();
    snap.ref.remove();
    if (!d) return;
    if (d.t === 'welcome') {
      gotWelcome = true;
      stopHello();
      busy('');
      setNetStatus('online');
    }
    ingest(d);
  });

  hostRef = roomRef.child('host');
  bind(hostRef, 'value', s => {
    if (gotWelcome && !s.exists()) showErr('Хост отключился. Комната закрыта.');
  });
}

async function joinRoom(c, name) {
  isHost = false;
  code = c.toUpperCase();
  joinName = name;
  gotWelcome = false;
  busy('Подключаемся к комнате ' + code);
  setNetStatus('connecting');
  try {
    await ensureFirebase();
    initApp();
    roomRef = db.ref('rooms/' + code);
    const snap = await roomRef.child('host').once('value');
    if (!snap.exists()) {
      busy('');
      showErr('Комната ' + code + ' не найдена. Проверьте код и убедитесь, что создатель игры онлайн.');
      return;
    }
    room = { leave() { cleanup(false); } };
    wireClient();
    presRef = roomRef.child('presence/' + myPeerId);
    await presRef.set({ name: joinName, ts: firebase.database.ServerValue.TIMESTAMP });
    await presRef.onDisconnect().remove();
    watchConnection();
    startHello();
  } catch (e) {
    netError(e);
  }
}

function connectNet() {
  if (isHost) createRoomRetry();
  else joinRoom(code, joinName);
}

async function createRoomRetry() {
  setNetStatus('connecting');
  try {
    await ensureFirebase();
    initApp();
    if (!roomRef) await openHostRoom();
    pushAll();
    setNetStatus('online');
  } catch (e) {
    netError(e);
  }
}

/* ---------- поиск хоста с повторами ---------- */
function stopHello() {
  if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
  if (failTimer) { clearTimeout(failTimer); failTimer = null; }
}

function startHello() {
  stopHello();
  let tries = 0;
  const send = () => { if (!gotWelcome) sendUp({ t: 'hello', name: joinName }); };
  send();
  helloTimer = setInterval(() => {
    if (gotWelcome || tries++ > 16) { stopHello(); return; }
    send();
  }, 1200);
  failTimer = setTimeout(() => {
    if (!gotWelcome) {
      stopHello();
      busy('');
      showErr('Комната ' + code + ' не отвечает. Проверьте код и убедитесь, что создатель игры онлайн.');
    }
  }, 28000);
}

/* ---------- исходящее действие ---------- */
function act(o) {
  if (isHost) {
    const p = meH();
    if (p) hostCmd(p, o);
  } else {
    sendUp(o);
  }
}

/* ---------- кнопки панели связи ---------- */
const netRetryBtn = $('#btn-net-retry');
if (netRetryBtn) netRetryBtn.onclick = () => connectNet();

const rulesPre = $('#rules-text');
if (rulesPre) rulesPre.textContent = RULES_TEXT;

const copyRulesBtn = $('#btn-copy-rules');
if (copyRulesBtn) copyRulesBtn.onclick = () => copyText(RULES_TEXT, 'Текст правил');