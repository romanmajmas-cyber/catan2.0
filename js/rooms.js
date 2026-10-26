'use strict';

// ==================== SOCKET.IO КЛИЕНТ ====================
let socket = null;
let currentRoom = null;

// Мы получаем токен из куки, но так как JS не может прочитать httpOnly куки,
// нам нужно брать токен из ответа сервера при логине.
// Но проще всего: сервер сам знает, кто мы, по куке при установке сокета (если same-origin).
// В нашем случае клиент и сервер на одном порту 3000, поэтому куки передадутся автоматически.
// Но socket.io требует токен явно в auth, чтобы сработал middleware на сервере.
// Мы возьмём его из глобальной переменной, которую установим в auth.js

// Инициализация сокета (вызывается после успешного логина)
function initSocket() {
  if (socket) return; // уже подключен
  
  socket = io({
    auth: {
      token: window.__catan_token || ''
    }
  });

  socket.on('connect', () => {
    console.log('[Socket] Подключено к серверу, ID:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Ошибка подключения:', err.message);
    showToast('❌ Ошибка подключения к серверу');
  });

  // Обработчики событий от сервера
  socket.on('room_update', (data) => {
    if (currentRoom && currentRoom.code === data.room.code) {
      currentRoom = data.room;
      updateRoomUI();
    }
  });

  socket.on('game_start', (data) => {
    currentRoom = data.room;
    if (typeof window.startGameFromLobby === 'function') {
      window.startGameFromLobby();
    }
  });

  socket.on('game_action', (action) => {
    if (typeof window.applyRemoteAction === 'function') {
      window.applyRemoteAction(action);
    }
  });
}

// ==================== СОЗДАНИЕ И ВХОД В КОМНАТУ ====================

function createRoom() {
  if (!currentUser) return;
  if (!socket) initSocket();

  socket.emit('room_create', { colorIdx: myColorIdx }, (res) => {
    if (!res.ok) return showToast('❌ ' + res.error);
    currentRoom = res.room;
    showScreen('room');
    updateRoomUI();
    showToast('Комната: ' + currentRoom.code);
  });
}

function attemptJoinRoom(code) {
  if (!currentUser) return;
  if (!socket) initSocket();

  socket.emit('room_join', { code: code, colorIdx: myColorIdx }, (res) => {
    if (!res.ok) {
      showToast('❌ ' + res.error);
      currentRoom = null;
      showScreen('lobby');
      return;
    }
    currentRoom = res.room;
    showScreen('room');
    updateRoomUI();
    showToast('Вы вошли в комнату');
  });
}

// ==================== UI КОМНАТЫ ====================

function updateRoomUI() {
  if (!currentRoom) return;
  document.getElementById('roomCodeDisplay').textContent = currentRoom.code;
  const list = document.getElementById('roomPlayerList');
  list.innerHTML = '';
  
  for (let i = 0; i < 4; i++) {
    const p = currentRoom.players[i];
    const div = document.createElement('div');
    if (p) {
      const color = PLAYER_COLORS[p.colorIdx];
      div.className = 'player-slot filled' + (p.isHost ? ' host' : '');
      div.innerHTML = '<div class="color-dot" style="background:' + color.css + ';color:' + color.css + '"></div>' +
        '<div class="info"><div class="name">' + p.username + (p.username === currentUser.username ? ' <span style="color:#90ff90;font-size:11px;">(вы)</span>' : '') + '</div>' +
        '<div class="tag">' + color.name + '</div></div>';
    } else {
      div.className = 'player-slot empty';
      div.innerHTML = '<div class="color-dot" style="background:#2a3a4a"></div><div class="info"><div class="name" style="color:#4a7a9a">Свободно</div></div>';
    }
    list.appendChild(div);
  }

  const isHost = currentRoom.players.find(p => p.username === currentUser.username)?.isHost;
  const startBtn = document.getElementById('btnStartGame');
  
  if (isHost) {
    startBtn.style.display = 'block';
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Начать (' + currentRoom.players.length + ')';
  } else {
    startBtn.style.display = 'none';
  }

  const status = document.getElementById('roomStatus');
  if (isHost) {
    status.className = 'status-tag';
    status.textContent = '✅ Готово к запуску';
  } else {
    status.className = 'status-tag waiting';
    status.textContent = 'Ожидание хоста...';
  }
}

// ==================== ОБРАБОТЧИКИ КНОПОК ====================

document.getElementById('btnStartGame').onclick = function() {
  if (!currentRoom) return;
  const me = currentRoom.players.find(p => p.username === currentUser.username);
  if (!me || !me.isHost) return;

  const btn = document.getElementById('btnStartGame');
  btn.disabled = true;
  btn.textContent = 'Запуск...';

  socket.emit('game_start', { code: currentRoom.code }, (res) => {
    if (!res || !res.ok) {
      showToast('❌ Ошибка запуска');
      btn.disabled = false;
      btn.textContent = '🚀 Начать';
    }
  });
};

document.getElementById('btnLeaveRoom').onclick = function() {
  if (currentRoom) {
    socket.emit('room_leave', { code: currentRoom.code });
    currentRoom = null;
  }
  showScreen('menu');
};

window.addEventListener('beforeunload', function() {
  if (currentRoom) socket.emit('room_leave', { code: currentRoom.code });
});

console.log('[rooms] OK — Socket.io готов');