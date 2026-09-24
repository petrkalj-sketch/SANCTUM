// migrate.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./shtab.db');

db.serialize(() => {
  db.all("PRAGMA table_info(rooms)", (err, columns) => {
    if (err) throw err;
    const hasColumn = columns.some(col => col.name === 'is_public');
    if (!hasColumn) {
      db.run("ALTER TABLE rooms ADD COLUMN is_public INTEGER DEFAULT 0", (err) => {
        if (err) console.error('Ошибка миграции:', err);
        else console.log('✅ Миграция успешно выполнена');
        db.close();
      });
    } else {
      console.log('ℹ️ Колонка is_public уже существует');
      db.close();
    }
  });
});