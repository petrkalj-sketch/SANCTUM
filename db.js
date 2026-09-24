const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'shtab.db');
const db = new sqlite3.Database(dbPath);

db.run('PRAGMA foreign_keys = ON');

// Обёртки-промисы
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function addColumnIfNotExists(table, column, type) {
  const rows = await dbAll(`PRAGMA table_info(${table})`);
  const exists = rows.some(r => r.name === column);
  if (exists) return;
  await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

async function initDb() {
  // 1) Все CREATE TABLE — последовательно, с await
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT,
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      password_hash TEXT,
      is_public BOOLEAN DEFAULT 0,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS room_members (
      user_id INTEGER NOT NULL,
      room_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, room_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      file_url TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to INTEGER,
      status TEXT DEFAULT 'pending',
      deadline DATETIME,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY(assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 2) Миграции для старых БД (когда таблицы уже были созданы ранее без этих колонок)
  //    Теперь таблицы ТОЧНО существуют, PRAGMA вернёт корректный результат
  try {
    await addColumnIfNotExists('users', 'avatar', 'TEXT');
    await addColumnIfNotExists('users', 'bio', 'TEXT');
    await addColumnIfNotExists('rooms', 'description', 'TEXT');
    await addColumnIfNotExists('rooms', 'password_hash', 'TEXT');
    await addColumnIfNotExists('rooms', 'is_public', 'BOOLEAN DEFAULT 0');
    await addColumnIfNotExists('messages', 'file_url', 'TEXT');
    await addColumnIfNotExists('tasks', 'deadline', 'DATETIME');
    await addColumnIfNotExists('room_members', 'role', "TEXT DEFAULT 'member'");

    // Делаем создателей комнат админами
    await dbRun(`
      UPDATE room_members
      SET role = 'admin'
      WHERE EXISTS (
        SELECT 1 FROM rooms
        WHERE rooms.id = room_members.room_id
        AND rooms.created_by = room_members.user_id
      )
      AND (role IS NULL OR role = 'member')
    `);

    console.log('База данных инициализирована успешно');
  } catch (err) {
    console.error('Ошибка миграции:', err);
  }
}

// ВАЖНО: экспортируем промис инициализации,
// чтобы server.js мог дождаться готовности БД перед запуском
const ready = initDb();

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}
function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = { db, runQuery, getQuery, allQuery, ready };