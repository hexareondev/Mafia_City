/* ================= СЕТЬ: децентрализованные реле (Trystero / Nostr) =================
   Лобби открывается сразу, подключение идёт в фоне.
   Три запасных CDN и таймауты: интерфейс больше не может зависнуть. */

let room = null, sendMsg = null, netStatus = 'offline';
let isHost = false, code = '', hostPeerId = null, gotWelcome = false, joinName = '';
let view = null, myId = null, localDone = false, lastChatTs = 0;
const notes = [];
let H = null; // состояние хоста

const APP_ID = 'mafia_city_v2';
const CDN_SOURCES = [
  'https://esm.sh/trystero/nostr',
  'https://cdn.jsdelivr.net/npm/trystero/src/nostr.js/+esm',
  'https://unpkg.com/trystero/src/nostr.js?module'
];
const HOST_MSGS = new Set(['welcome', 'view', 'log', 'chat', 'check', 'ack', 'join_error']);

/* ---- загрузка библиотеки с таймаутом и зеркалами ---- */
function importWithTimeout(url, ms) {
  return Promise.race([
    import(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + url)), ms))
  ]);
}

async function loadTrystero() {
  let lastErr = null;
  for (const url of CDN_SOURCES) {
    try { return await importWithTimeout(url, 7000); }
    catch (e) { lastErr = e; console.warn('CDN недоступен:', url); }
  }
  throw lastErr || new Error('all cdn failed');
}

/* ---- индикатор статуса связи в лобби ---- */
function setNetStatus(s) {
  netStatus = s;
  const el = $('#lob-net'), btn = $('#btn-net-retry');
  if (!el) return;
  if (s === 'connecting') { el.textContent = 'Подключаемся к реле'; el.className = 'hint wait'; btn.hidden = true; }
  else if (s === 'online') { el.textContent = 'Связь установлена: комната открыта для входа.'; el.className = 'hint ok'; btn.hidden = true; }
  else { el.textContent = 'Не удалось подключиться к реле. Проверьте сеть и повторите.'; el.className = 'hint err'; btn.hidden = false; }
}

/* ---- подключение к комнате реле ---- */
function initRoom() {
  return loadTrystero().then(T => {
    room = T.joinRoom({ appId: APP_ID }, 'room-' + code);
    const pair = room.makeAction('msg');
    sendMsg = pair[0];
    pair[1]((data, peerId) => {
      if (isHost) {
        if (!data) return;
        if (data.t === 'hello') { hostJoin(peerId, data.name); return; }
        const p = H.players.find(q => q.conn === peerId);
        if (p) hostCmd(p, data);
      } else {
        if (data && HOST_MSGS.has(data.t)) hostPeerId = peerId;
        if (data && data.t === 'welcome') {
          gotWelcome = true; stopHello(); busy(''); setNetStatus('online');
        }
        ingest(data);
      }
    });
    room.onPeerLeave(peerId => {
      if (isHost) hostLeave(peerId);
      else if (peerId === hostPeerId) showErr('Хост отключился. Комната закрыта.');
    });
    if (isHost) setNetStatus('online');
  });
}

function sendRaw(peerId, m) {
  if (!sendMsg || !peerId) return;
  try { sendMsg(m, peerId); } catch (e) {}
}

/* ---- старт: лобби открывается СРАЗУ, сеть подключается в фоне ---- */
function createRoom(name) {
  isHost = true;
  code = genCode();
  H = newHostState();
  addHostPlayer(name);
  showScreen('scr-lobby');
  pushAll();
  connectNet();
}

function joinRoom(c, name) {
  isHost = false;
  code = c.toUpperCase();
  joinName = name;
  gotWelcome = false;
  hostPeerId = null;
  busy('Подключаемся к комнате ' + code);
  connectNet();
}

function connectNet() {
  setNetStatus('connecting');
  initRoom()
    .then(() => { if (!isHost) startHello(); })
    .catch(e => {
      console.error(e);
      setNetStatus('error');
      if (!isHost) showErr('Не удалось подключиться к серверам связи. Проверьте интернет и попробуйте снова.');
    });
}

/* ---- поиск хоста с повторами ---- */
let helloTimer = null, failTimer = null;

function stopHello() {
  if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
  if (failTimer) { clearTimeout(failTimer); failTimer = null; }
}

function startHello() {
  stopHello();
  let tries = 0;
  helloTimer = setInterval(() => {
    if (gotWelcome || tries++ > 10) { stopHello(); return; }
    if (sendMsg) sendMsg({ t: 'hello', name: joinName });
  }, 1200);
  failTimer = setTimeout(() => {
    if (!gotWelcome) {
      stopHello();
      showErr('Комната ' + code + ' не найдена. Проверьте код и убедитесь, что создатель игры онлайн.');
      try { room && room.leave(); } catch (e) {}
    }
  }, 25000);
}

/* ---- исходящее действие игрока ---- */
function act(o) {
  if (isHost) {
    const p = meH();
    if (p) hostCmd(p, o);
  } else if (hostPeerId) {
    sendRaw(hostPeerId, o);
  }
}

/* ---- кнопка повтора подключения ---- */
const netRetryBtn = $('#btn-net-retry');
if (netRetryBtn) netRetryBtn.onclick = () => connectNet();