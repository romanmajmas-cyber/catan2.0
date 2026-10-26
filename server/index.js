require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const http = require('http'); // ДОБАВИЛИ
const { Server } = require('socket.io'); // ДОБАВИЛИ
const auth = require('./auth');

const app = express();
const server = http.createServer(app); // Создаем HTTP сервер
const io = new Server(server, { cors: { origin: true, credentials: true } }); // Подключаем Socket.io
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(express.static(path.join(__dirname, '..')));

// --- API ЭНДПОИНТЫ ---
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  res.json(auth.register(username, password));
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = auth.login(username, password);
  if (result.ok) {
    res.cookie('catan_token', result.token, {
      httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 86400 * 1000,
    });
  }
  res.json(result);
});

app.post('/api/logout', (req, res) => {
  auth.logout(req.cookies.catan_token);
  res.clearCookie('catan_token');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const token = req.cookies.catan_token;
  const user = auth.verify(token);
  res.json({ user, token }); // ← Теперь возвращаем и токен тоже
});

// socket.io

const rooms = new Map(); // Хранилище комнат в памяти сервера

// Middleware: проверяем токен при подключении сокета
io.use((socket, next) => {
  // Токен передается в socket.handshake.auth.token
  const token = socket.handshake.auth.token;
  const user = auth.verify(token);
  if (!user) return next(new Error('Unauthorized'));
  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  console.log(`[Socket] Игрок подключился: ${socket.user.username}`);

  // Создание комнаты
  socket.on('room_create', (data, callback) => {
    const code = generateRoomCode();
    const room = {
      code: code,
      host: socket.user.username,
      hostSocketId: socket.id,
      players: [{ username: socket.user.username, colorIdx: data.colorIdx, socketId: socket.id, isHost: true }],
      started: false,
      seed: null
    };
    rooms.set(code, room);
    socket.join(code);
    callback({ ok: true, room });
  });

  // Подключение к комнате
  socket.on('room_join', (data, callback) => {
    const room = rooms.get(data.code);
    if (!room) return callback({ ok: false, error: 'Комната не найдена' });
    if (room.started) return callback({ ok: false, error: 'Игра уже началась' });
    if (room.players.length >= 4) return callback({ ok: false, error: 'Комната заполнена' });
    if (room.players.find(p => p.colorIdx === data.colorIdx)) return callback({ ok: false, error: 'Этот цвет занят' });
    if (room.players.find(p => p.username === socket.user.username)) return callback({ ok: false, error: 'Вы уже в комнате' });

    room.players.push({ username: socket.user.username, colorIdx: data.colorIdx, socketId: socket.id, isHost: false });
    socket.join(data.code);
    
    io.to(data.code).emit('room_update', { room });
    callback({ ok: true, room });
  });

  // Выход из комнаты
  socket.on('room_leave', (data) => {
    const room = rooms.get(data.code);
    if (!room) return;
    room.players = room.players.filter(p => p.socketId !== socket.id);
    socket.leave(data.code);
    
    if (room.players.length === 0) {
      rooms.delete(data.code);
    } else {
      if (room.hostSocketId === socket.id) {
        room.players[0].isHost = true;
        room.hostSocketId = room.players[0].socketId;
        room.host = room.players[0].username;
      }
      io.to(data.code).emit('room_update', { room });
    }
  });

  // Старт игры (только хост)
  socket.on('game_start', (data, callback) => {
    const room = rooms.get(data.code);
    if (!room || room.hostSocketId !== socket.id) return;
    room.started = true;
    room.seed = Math.floor(Math.random() * 1e9);
    io.to(data.code).emit('game_start', { room });
    callback({ ok: true });
  });

  // Пересылка игровых действий
  socket.on('game_action', (data) => {
    const room = rooms.get(data.code);
    if (!room || !room.started) return;
    socket.to(data.code).emit('game_action', data.action);
  });

  // Отключение (закрыл вкладку)
  socket.on('disconnect', () => {
    console.log(`[Socket] Отключился: ${socket.user.username}`);
    // Ищем, в какой комнате он был
    for (const [code, room] of rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        room.players = room.players.filter(p => p.socketId !== socket.id);
        if (room.players.length === 0) rooms.delete(code);
        else {
          if (room.hostSocketId === socket.id) {
            room.players[0].isHost = true;
            room.hostSocketId = room.players[0].socketId;
            room.host = room.players[0].username;
          }
          io.to(code).emit('room_update', { room });
        }
      }
    }
  });
});

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

// Меняем app.listen на server.listen (чтобы работал и HTTP, и WebSocket)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Сервер запущен на http://localhost:${PORT}`);
  console.log(`   WebSocket (Socket.io) готов к работе\n`);
});