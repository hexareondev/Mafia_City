/* ================= СЕТЬ: децентрализованные реле (Trystero / Nostr) =================
   Вместо одного сервера используется сеть публичных Nostr-реле.
   Единой точки отказа нет: если реле недоступно, подключение идёт через другое. */

let room = null, sendMsg = null;
let isHost = false, code = '', hostPeerId = null, gotWelcome = false;
let view = null, myId = null, localDone = false, lastChatTs = 0;
const notes = [];
let H = null; // состояние хоста

const APP_ID = 'mafia_city_v2';
const TRYSTERO_URL = 'https://esm.sh/trystero/nostr';
const HOST_MSGS = new Set(['welcome', 'view', 'log', 'chat', 'check', 'ack', 'join_error']);

function loadTrystero() {
  return import(TRYSTERO_URL);
}

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
        if (data && data.t === 'welcome') { gotWelcome = true; busy(''); stopHello(); }
        ingest(data);
      }
    });
    room.onPeerLeave(peerId => {
      if (isHost) hostLeave(peerId);
      else if (peerId === hostPeerId) showErr('Хост отключился. Комната закрыта.');
    });
  });
}

function sendRaw(peerId, m) {
  if (!sendMsg || !peerId) return;
  try { sendMsg(m, peerId); } catch (e) {}
}

/* ---- создание комнаты (хост) ---- */
function createRoom(name) {
  isHost = true;
  code = genCode();
  H = newHostState();
  addHostPlayer(name);
  busy('Создаём комнату…');
  initRoom()
    .then(() => { busy(''); showScreen('scr-lobby'); pushAll(); })
    .catch(e => {
      console.error(e);
      showErr('Не удалось загрузить сетевой модуль. Проверьте интернет и обновите страницу.');
    });
}

/* ---- вход в комнату (клиент) ---- */
let helloTimer = null, failTimer = null;

function stopHello() {
  if (helloTimer) { clearInterval(helloTimer); helloTimer = null; }
  if (failTimer) { clearTimeout(failTimer); failTimer = null; }
}

function joinRoom(c, name) {
  isHost = false;
  code = c.toUpperCase();
  gotWelcome = false;
  hostPeerId = null;
  busy('Подключаемся к комнате ' + code + '…');
  initRoom()
    .then(() => {
      let tries = 0;
      // повторяем «привет» несколько раз, пока хост не ответит
      helloTimer = setInterval(() => {
        if (tries++ > 8) { stopHello(); return; }
        if (sendMsg) sendMsg({ t: 'hello', name: name });
      }, 1200);
      failTimer = setTimeout(() => {
        if (!gotWelcome) {
          stopHello();
          showErr('Комната ' + code + ' не найдена. Проверьте код и убедитесь, что создатель игры онлайн.');
          try { room && room.leave(); } catch (e) {}
        }
      }, 12000);
    })
    .catch(e => {
      console.error(e);
      showErr('Не удалось загрузить сетевой модуль. Проверьте интернет и обновите страницу.');
    });
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