const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const fs = require('fs');
const { runQuery, getQuery, allQuery } = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

function generateUid(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let uid = '';
  for (let i = 0; i < length; i++) uid += chars.charAt(Math.floor(Math.random() * chars.length));
  return uid;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + '-' + file.originalname);
  }
});
const upload = multer({ storage });

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ АУТЕНТИФИКАЦИЯ ============
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Заполните поля' });
    if (!/^[a-zA-Z0-9]+$/.test(username)) return res.status(400).json({ error: 'Логин только латиница и цифры' });
    if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });

    let uid, attempts = 0;
    do {
      uid = generateUid(10);
      if (!(await getQuery('SELECT 1 FROM users WHERE uid = ?', [uid]))) break;
      attempts++;
    } while (attempts < 10);
    if (attempts >= 10) return res.status(500).json({ error: 'Не удалось сгенерировать UID' });

    const hashed = await bcrypt.hash(password, 10);
    await runQuery('INSERT INTO users (uid, username, password) VALUES (?, ?, ?)', [uid, username, hashed]);
    res.status(201).json({ message: 'OK', uid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Логин занят' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await getQuery('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Неверные данные' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Неверные данные' });
    req.session.userId = user.id;
    res.json({ user: { id: user.id, uid: user.uid, username: user.username, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const user = await getQuery('SELECT id, uid, username, avatar, bio FROM users WHERE id = ?', [req.session.userId]);
  if (!user) { req.session.destroy(); return res.status(401).json({ error: 'Не найден' }); }
  res.json(user);
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ message: 'OK' })));

// ============ ПРОФИЛЬ ============
app.post('/api/profile', upload.single('avatar'), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { bio } = req.body;
  const avatar = req.file ? '/uploads/' + req.file.filename : null;

  const updates = [], params = [];
  if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
  if (avatar) { updates.push('avatar = ?'); params.push(avatar); }
  if (!updates.length) return res.json({ message: 'Нет изменений' });
  params.push(req.session.userId);
  await runQuery(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  const user = await getQuery('SELECT id, uid, username, avatar, bio FROM users WHERE id = ?', [req.session.userId]);
  res.json(user);
});

app.delete('/api/users/me', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const userId = req.session.userId;
  try {
    await runQuery('DELETE FROM rooms WHERE created_by = ?', [userId]);
    await runQuery('DELETE FROM messages WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM tasks WHERE created_by = ? OR assigned_to = ?', [userId, userId]);
    await runQuery('DELETE FROM room_members WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM users WHERE id = ?', [userId]);
    req.session.destroy(() => {
      io.emit('roomsChanged');
      res.json({ message: 'Аккаунт удалён' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления аккаунта' });
  }
});

app.get('/api/users/:uid', async (req, res) => {
  const user = await getQuery('SELECT uid, username, avatar, bio FROM users WHERE uid = ?', [req.params.uid]);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

// ============ КОМНАТЫ ============
app.get('/api/rooms', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const uid = req.session.userId;
  const rooms = await allQuery(
    `SELECT r.*, u.username as creator,
      (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count,
      (SELECT 1 FROM room_members WHERE user_id = ? AND room_id = r.id) as is_member,
      COALESCE((SELECT role FROM room_members WHERE user_id = ? AND room_id = r.id), '') as my_role
     FROM rooms r
     JOIN users u ON r.created_by = u.id
     WHERE r.is_public = 1 OR EXISTS (SELECT 1 FROM room_members WHERE user_id = ? AND room_id = r.id)
     ORDER BY r.created_at DESC`,
    [uid, uid, uid]
  );
  res.json(rooms);
});

app.post('/api/rooms', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const { name, description, password, is_public } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Введите название' });
  const password_hash = password && password.trim() ? await bcrypt.hash(password, 10) : null;

  const result = await runQuery(
    'INSERT INTO rooms (name, description, password_hash, is_public, created_by) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), description?.trim() || null, password_hash, is_public ? 1 : 0, req.session.userId]
  );
  // Создатель — админ
  await runQuery(
    "INSERT INTO room_members (user_id, room_id, role) VALUES (?, ?, 'admin')",
    [req.session.userId, result.lastID]
  );
  const room = await getQuery(
    `SELECT r.*, u.username as creator FROM rooms r JOIN users u ON r.created_by = u.id WHERE r.id = ?`,
    [result.lastID]
  );

  // Оповещаем всех — публичные комнаты появятся сразу
  io.emit('roomsChanged');
  res.status(201).json(room);
});

app.post('/api/rooms/:roomId/join', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const { password } = req.body;
  const room = await getQuery('SELECT id, password_hash FROM rooms WHERE id = ?', [roomId]);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  if (room.password_hash) {
    if (!password) return res.status(403).json({ error: 'Требуется пароль' });
    const ok = await bcrypt.compare(password, room.password_hash);
    if (!ok) return res.status(403).json({ error: 'Неверный пароль' });
  }
  await runQuery(
    "INSERT OR IGNORE INTO room_members (user_id, room_id, role) VALUES (?, ?, 'member')",
    [req.session.userId, roomId]
  );

  io.emit('roomsChanged');
  io.to(`room_${roomId}`).emit('roomMembersChanged', roomId);
  res.json({ message: 'OK' });
});

// ---------- ОБНОВЛЕНИЕ НАСТРОЕК КОМНАТЫ (создатель или админ) ----------
app.put('/api/rooms/:roomId', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const userId = req.session.userId;

  const room = await getQuery('SELECT created_by FROM rooms WHERE id = ?', [roomId]);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });

  const member = await getQuery(
    'SELECT role FROM room_members WHERE user_id = ? AND room_id = ?',
    [userId, roomId]
  );
  if (!member) return res.status(403).json({ error: 'Вы не участник' });

  const isCreator = room.created_by === userId;
  const isAdmin = member.role === 'admin';
  if (!isCreator && !isAdmin) return res.status(403).json({ error: 'Недостаточно прав' });

  const { name, description, password, remove_password, is_public } = req.body;
  const updates = [], params = [];

  if (name !== undefined) {
    const n = name.trim();
    if (!n) return res.status(400).json({ error: 'Название не может быть пустым' });
    updates.push('name = ?'); params.push(n);
  }
  if (description !== undefined) {
    updates.push('description = ?'); params.push(description?.trim() || null);
  }
  if (is_public !== undefined) {
    updates.push('is_public = ?'); params.push(is_public ? 1 : 0);
  }
  if (remove_password === true) {
    updates.push('password_hash = ?'); params.push(null);
  } else if (password && password.trim() !== '') {
    updates.push('password_hash = ?');
    params.push(await bcrypt.hash(password, 10));
  }

  if (!updates.length) return res.json({ message: 'Нет изменений' });

  params.push(roomId);
  await runQuery(`UPDATE rooms SET ${updates.join(', ')} WHERE id = ?`, params);

  const updated = await getQuery(
    `SELECT r.*, u.username as creator FROM rooms r JOIN users u ON r.created_by = u.id WHERE r.id = ?`,
    [roomId]
  );

  io.emit('roomsChanged');
  io.to(`room_${roomId}`).emit('roomUpdated', updated);
  res.json(updated);
});

app.delete('/api/rooms/:roomId', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const room = await getQuery('SELECT created_by FROM rooms WHERE id = ?', [roomId]);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  if (room.created_by !== req.session.userId) {
    return res.status(403).json({ error: 'Только создатель может удалить комнату' });
  }
  await runQuery('DELETE FROM rooms WHERE id = ?', [roomId]);
  io.emit('roomsChanged');
  io.to(`room_${roomId}`).emit('roomDeleted', roomId);
  res.json({ message: 'Комната удалена' });
});

// ---------- УЧАСТНИКИ КОМНАТЫ ----------
app.get('/api/rooms/:roomId/members', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const members = await allQuery(
    `SELECT u.id, u.uid, u.username, u.avatar, u.bio,
            rm.role, rm.joined_at,
            (r.created_by = u.id) as is_creator
     FROM room_members rm
     JOIN users u ON rm.user_id = u.id
     JOIN rooms r ON r.id = rm.room_id
     WHERE rm.room_id = ?
     ORDER BY is_creator DESC, rm.role DESC, u.username ASC`,
    [roomId]
  );
  res.json(members);
});

app.put('/api/rooms/:roomId/members/:memberId/role', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const memberId = parseInt(req.params.memberId);
  const { role } = req.body;

  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Неверная роль' });

  const room = await getQuery('SELECT created_by FROM rooms WHERE id = ?', [roomId]);
  if (!room) return res.status(404).json({ error: 'Комната не найдена' });
  if (room.created_by !== req.session.userId) {
    return res.status(403).json({ error: 'Только создатель может управлять ролями' });
  }
  if (memberId === room.created_by) {
    return res.status(400).json({ error: 'Нельзя изменить роль создателя' });
  }

  await runQuery(
    'UPDATE room_members SET role = ? WHERE user_id = ? AND room_id = ?',
    [role, memberId, roomId]
  );

  io.to(`room_${roomId}`).emit('roomMembersChanged', roomId);
  io.emit('roomsChanged');
  res.json({ message: 'OK' });
});

// ============ СООБЩЕНИЯ ============
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const messages = await allQuery(
    `SELECT m.id, m.room_id, m.user_id, m.content, m.file_url,
            strftime('%Y-%m-%dT%H:%M:%SZ', m.timestamp) as timestamp,
            u.username, u.avatar, u.uid,
            COALESCE(rm.role, 'member') as sender_role,
            (r.created_by = m.user_id) as sender_is_creator
     FROM messages m
     JOIN users u ON m.user_id = u.id
     JOIN rooms r ON r.id = m.room_id
     LEFT JOIN room_members rm ON rm.user_id = m.user_id AND rm.room_id = m.room_id
     WHERE m.room_id = ?
     ORDER BY m.timestamp ASC LIMIT 200`,
    [roomId]
  );
  res.json(messages);
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({ fileUrl: '/uploads/' + req.file.filename });
});

// ============ ЗАДАЧИ ============
app.get('/api/rooms/:roomId/tasks', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const tasks = await allQuery(
    `SELECT t.*, a.username as assigned_username, c.username as created_by_username
     FROM tasks t
     LEFT JOIN users a ON t.assigned_to = a.id
     JOIN users c ON t.created_by = c.id
     WHERE t.room_id = ?
     ORDER BY t.created_at DESC`,
    [roomId]
  );
  res.json(tasks);
});

app.post('/api/rooms/:roomId/tasks', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const roomId = parseInt(req.params.roomId);
  const { title, description, assigned_to, deadline } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Введите название' });
  const member = await getQuery('SELECT 1 FROM room_members WHERE user_id = ? AND room_id = ?', [req.session.userId, roomId]);
  if (!member) return res.status(403).json({ error: 'Вы не участник' });

  const result = await runQuery(
    'INSERT INTO tasks (room_id, title, description, assigned_to, deadline, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [roomId, title.trim(), description?.trim() || null, assigned_to || null, deadline || null, req.session.userId]
  );
  const task = await getQuery(
    `SELECT t.*, a.username as assigned_username, c.username as created_by_username
     FROM tasks t LEFT JOIN users a ON t.assigned_to = a.id JOIN users c ON t.created_by = c.id WHERE t.id = ?`,
    [result.lastID]
  );
  io.to(`room_${roomId}`).emit('taskCreated', task);
  res.status(201).json(task);
});

app.put('/api/tasks/:taskId', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const taskId = parseInt(req.params.taskId);
  const { status, assigned_to, deadline } = req.body;
  const task = await getQuery('SELECT room_id FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  const member = await getQuery('SELECT 1 FROM room_members WHERE user_id = ? AND room_id = ?', [req.session.userId, task.room_id]);
  if (!member) return res.status(403).json({ error: 'Вы не участник' });

  const updates = [], params = [];
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (assigned_to !== undefined) { updates.push('assigned_to = ?'); params.push(assigned_to); }
  if (deadline !== undefined) { updates.push('deadline = ?'); params.push(deadline || null); }
  if (!updates.length) return res.status(400).json({ error: 'Нет данных' });
  params.push(taskId);
  await runQuery(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params);

  const updated = await getQuery(
    `SELECT t.*, a.username as assigned_username, c.username as created_by_username
     FROM tasks t LEFT JOIN users a ON t.assigned_to = a.id JOIN users c ON t.created_by = c.id WHERE t.id = ?`,
    [taskId]
  );
  io.to(`room_${task.room_id}`).emit('taskUpdated', updated);
  res.json(updated);
});

app.delete('/api/tasks/:taskId', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const taskId = parseInt(req.params.taskId);
  const task = await getQuery('SELECT room_id, created_by FROM tasks WHERE id = ?', [taskId]);
  if (!task) return res.status(404).json({ error: 'Задача не найдена' });
  const room = await getQuery('SELECT created_by FROM rooms WHERE id = ?', [task.room_id]);
  const member = await getQuery(
    'SELECT role FROM room_members WHERE user_id = ? AND room_id = ?',
    [req.session.userId, task.room_id]
  );
  if (!member) return res.status(403).json({ error: 'Вы не участник' });

  const canDelete = task.created_by === req.session.userId
    || room.created_by === req.session.userId
    || member.role === 'admin';
  if (!canDelete) return res.status(403).json({ error: 'Недостаточно прав' });

  await runQuery('DELETE FROM tasks WHERE id = ?', [taskId]);
  io.to(`room_${task.room_id}`).emit('taskDeleted', taskId);
  res.json({ message: 'Задача удалена' });
});

// ---------- Socket.IO ----------
// Голосовые комнаты: Map<roomId, Map<socketId, { userId, username, avatar, muted }>>
const voiceRooms = new Map();

function getVoiceUsers(roomId) {
  const room = voiceRooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values());
}
function broadcastVoiceUsers(roomId) {
  io.to(`room_${roomId}`).emit('voiceUsers', {
    roomId,
    users: getVoiceUsers(roomId)
  });
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('joinRoom', (roomId) => {
    socket.join(`room_${roomId}`);
    console.log(`Socket ${socket.id} → room_${roomId}`);
    // Отправляем актуальный список голосовых участников новому подключившемуся
    socket.emit('voiceUsers', {
      roomId,
      users: getVoiceUsers(roomId)
    });
  });

  socket.on('leaveRoom', (roomId) => {
    socket.leave(`room_${roomId}`);
  });

  socket.on('sendMessage', async (data) => {
    const { roomId, userId, content, fileUrl } = data;
    if (!roomId || !userId) return;
    const member = await getQuery(
      'SELECT 1 FROM room_members WHERE user_id = ? AND room_id = ?',
      [userId, roomId]
    );
    if (!member) return;

    const result = await runQuery(
      'INSERT INTO messages (room_id, user_id, content, file_url) VALUES (?, ?, ?, ?)',
      [roomId, userId, content || '', fileUrl || null]
    );
    const msg = await getQuery(
      `SELECT m.id, m.room_id, m.user_id, m.content, m.file_url,
              strftime('%Y-%m-%dT%H:%M:%SZ', m.timestamp) as timestamp,
              u.username, u.avatar, u.uid,
              COALESCE(rm.role, 'member') as sender_role,
              (r.created_by = m.user_id) as sender_is_creator
       FROM messages m
       JOIN users u ON m.user_id = u.id
       JOIN rooms r ON r.id = m.room_id
       LEFT JOIN room_members rm ON rm.user_id = m.user_id AND rm.room_id = m.room_id
       WHERE m.id = ?`,
      [result.lastID]
    );
    io.to(`room_${roomId}`).emit('newMessage', msg);
  });

  // -------- VOICE --------
  socket.on('voiceJoin', async ({ roomId, userId }) => {
    if (!roomId || !userId) return;

    // Проверяем, что пользователь состоит в комнате
    const member = await getQuery(
      `SELECT u.id, u.username, u.avatar
       FROM room_members rm JOIN users u ON u.id = rm.user_id
       WHERE rm.user_id = ? AND rm.room_id = ?`,
      [userId, roomId]
    );
    if (!member) return;

    socket.join(`voice_${roomId}`);

    if (!voiceRooms.has(roomId)) voiceRooms.set(roomId, new Map());
    voiceRooms.get(roomId).set(socket.id, {
      socketId: socket.id,
      userId,
      username: member.username,
      avatar: member.avatar,
      muted: false
    });

    // Уже подключённые пользователи — отдаём новому, чтобы он инициировал с ними соединение
    const others = getVoiceUsers(roomId).filter(u => u.socketId !== socket.id);
    socket.emit('voiceExistingUsers', { roomId, users: others });

    // Уведомляем остальных о новом участнике
    socket.to(`voice_${roomId}`).emit('voiceUserJoined', {
      roomId,
      user: {
        socketId: socket.id,
        userId,
        username: member.username,
        avatar: member.avatar,
        muted: false
      }
    });

    broadcastVoiceUsers(roomId);
    console.log(`Voice: ${member.username} зашёл в room_${roomId}`);
  });

  socket.on('voiceLeave', ({ roomId }) => {
    if (!roomId) return;
    const room = voiceRooms.get(roomId);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) voiceRooms.delete(roomId);
    }
    socket.leave(`voice_${roomId}`);
    socket.to(`voice_${roomId}`).emit('voiceUserLeft', {
      roomId,
      socketId: socket.id
    });
    broadcastVoiceUsers(roomId);
  });

  socket.on('voiceSignal', ({ to, from, signal }) => {
    if (!to || !from || !signal) return;
    io.to(to).emit('voiceSignal', { from, signal });
  });

  socket.on('voiceMuteToggle', ({ roomId, muted }) => {
    if (!roomId) return;
    const room = voiceRooms.get(roomId);
    if (room && room.has(socket.id)) {
      room.get(socket.id).muted = !!muted;
      broadcastVoiceUsers(roomId);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', socket.id, reason);
    // Убираем из всех голосовых комнат
    for (const [roomId, room] of voiceRooms.entries()) {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        if (room.size === 0) voiceRooms.delete(roomId);
        io.to(`voice_${roomId}`).emit('voiceUserLeft', {
          roomId,
          socketId: socket.id
        });
        broadcastVoiceUsers(roomId);
      }
    }
  });
});

const { ready } = require('./db');

ready
  .then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Сервер запущен на http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Не удалось инициализировать БД:', err);
    process.exit(1);
  });