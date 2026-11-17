// ================= СОСТОЯНИЕ =================
let peer = null, conn = null, isHost = false, code = '';
let view = null, myId = null, localDone = false, lastChatTs = 0;
const notes = [];
let H = null; // состояние хоста

// ================= P2P ПОДКЛЮЧЕНИЕ =================
function createRoom(name) {
  isHost = true;
  code = genCode();
  H = newHostState();
  addHostPlayer(name);
  busy('Создаём комнату…');
  bootPeer();
}

function bootPeer() {
  const peerId = genPeerId(code);
  console.log('Создаём хост с ID:', peerId);
  
  peer = new Peer(peerId, {
    debug: 1, // Включить логирование
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    }
  });
  
  peer.on('open', (id) => {
    console.log('Хост открыт:', id);
    busy('');
    showScreen('scr-lobby');
    pushAll();
  });
  
  peer.on('connection', c => {
    console.log('Новое подключение:', c.peer);
    c.on('data', d => {
      if (!H) return;
      if (d && d.t === 'join') {
        hostJoin(c, d.name);
        return;
      }
      const p = H.players.find(q => q.conn === c);
      if (p) hostCmd(p, d || {});
    });
    c.on('close', () => hostLeave(c));
    c.on('error', (err) => console.error('Ошибка соединения:', err));
  });
  
  peer.on('error', e => {
    console.error('Ошибка Peer:', e.type, e);
    if (e.type === 'unavailable-id') {
      // ID занят — пробуем другой код
      peer.destroy();
      code = genCode();
      setTimeout(bootPeer, 150);
    } else if (e.type === 'network' || e.type === 'server-error') {
      showErr('Ошибка сети. Проверьте подключение к интернету.');
    } else if (e.type === 'socket-error' || e.type === 'socket-closed') {
      showErr('Не удалось подключиться к серверу. Попробуйте позже.');
    } else {
      showErr('Ошибка сети (' + e.type + '). Попробуйте ещё раз.');
    }
  });
}

function joinRoom(c, name) {
  code = c.toUpperCase();
  busy('Подключаемся к комнате ' + code + '…');
  
  // Пробуем разные ID хоста
  const tryConnect = (attempt = 0) => {
    console.log('Попытка подключения #' + (attempt + 1) + ' к коду:', code);
    
    peer = new Peer({
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });
    
    peer.on('open', () => {
      // Пробуем подключиться к хосту
      const hostId = `${PEER_PREFIX}${code}`;
      console.log('Подключаемся к хосту:', hostId);
      
      conn = peer.connect(hostId, { reliable: true });
      
      conn.on('open', () => {
        console.log('Подключение установлено');
        conn.send({ t: 'join', name });
      });
      
      conn.on('data', d => ingest(d));
      
      conn.on('close', () => {
        console.log('Соединение закрыто');
        showErr('Хост отключился. Комната закрыта.');
      });
      
      conn.on('error', (err) => {
        console.error('Ошибка соединения:', err);
        showErr('Ошибка соединения с хостом.');
      });
    });
    
    peer.on('error', e => {
      console.error('Ошибка подключения:', e.type, e);
      busy('');
      
      if (e.type === 'peer-unavailable') {
        if (attempt < 2) {
          // Повторная попытка через 2 секунды
          toast('Повторная попытка подключения...', false);
          setTimeout(() => tryConnect(attempt + 1), 2000);
        } else {
          toast('Комната ' + code + ' не найдена. Проверьте код.', true);
        }
      } else if (e.type === 'network') {
        showErr('Ошибка сети. Проверьте подключение к интернету.');
      } else {
        showErr('Ошибка сети (' + e.type + ').');
      }
    });
  };
  
  tryConnect();
}

// Отправка действия (хост вызывает обработчики сам)
function act(o) {
  if (isHost) {
    const p = meH();
    if (p) hostCmd(p, o);
  } else if (conn) {
    conn.send(o);
  }
}