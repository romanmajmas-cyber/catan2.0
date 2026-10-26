const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 12; // Надежное шифрование пароля

// --- РЕГИСТРАЦИЯ ---
function register(username, password) {
  if (!username || username.length < 3 || username.length > 20) {
    return { ok: false, error: 'Логин от 3 до 20 символов' };
  }
  if (!/^[a-zA-Z0-9_а-яА-Я]+$/.test(username)) {
    return { ok: false, error: 'Логин: буквы, цифры, _' };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: 'Пароль минимум 8 символов' };
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return { ok: false, error: 'Логин уже занят' };

  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);

  return { ok: true, user: { id: info.lastInsertRowid, username } };
}

// --- ЛОГИН ---
function login(username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Защита от перебора (не говорим, что именно неверно: логин или пароль)
  if (!user) return { ok: false, error: 'Неверный логин или пароль' };

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return { ok: false, error: 'Неверный логин или пароль' };

  db.prepare('UPDATE users SET last_login = unixepoch() WHERE id = ?').run(user.id);

  // Создаём сессию
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, user.id, expiresAt);

  // Генерируем JWT токен
  const token = jwt.sign({ sid: sessionId, uid: user.id }, JWT_SECRET, { expiresIn: SESSION_DAYS * 86400 });

  return { ok: true, token, user: { id: user.id, username: user.username } };
}

// --- ПРОВЕРКА ТОКЕНА ---
function verify(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > unixepoch()').get(payload.sid);
    if (!session) return null;

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(payload.uid);
    return user || null;
  } catch {
    return null; // Токен просрочен или невалиден
  }
}

// --- ВЫХОД ---
function logout(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(payload.sid);
  } catch {}
}

module.exports = { register, login, verify, logout };