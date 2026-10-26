const Database = require('better-sqlite3');
const path = require('path');

// Путь к файлу БД (на хостинге можно переопределить через process.env)
const dbPath = process.env.DB_PATH || path.join(__dirname, 'catan.db');
const db = new Database(dbPath);

// Оптимизации для SQLite (WAL режим быстрее для чтения/записи)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Создаём таблицы, если их нет
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login    INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
`);

console.log('[DB] База данных инициализирована');
module.exports = db;