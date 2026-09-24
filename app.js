// ==================== СОСТОЯНИЕ ====================
const state = {
  user: null,
  currentRoom: null,
  socket: null,
  rooms: [],
  messages: [],
  tasks: [],
  roomPasswords: {},
  pendingRoomJoin: null,
  timerInterval: null,
  roomsRefreshInterval: null
};

// === VOICE STATE ===
const voiceState = {
  active: false,
  roomId: null,
  muted: false,
  localStream: null,
  peers: new Map(),   // socketId -> { pc, remoteAudio }
  users: []           // список от сервера
};

// ==================== DOM ====================
const $ = (id) => document.getElementById(id);

const authContainer = $('authContainer');
const appContainer = $('appContainer');
const loginForm = $('loginForm');
const registerForm = $('registerForm');
const loginTab = $('loginTab');
const registerTab = $('registerTab');
const loginBtn = $('loginBtn');
const registerBtn = $('registerBtn');
const loginError = $('loginError');
const regError = $('regError');
const logoutBtn = $('logoutBtn');
const currentUserSpan = $('currentUser');
const roomList = $('roomList');
const createRoomBtn = $('createRoomBtn');
const roomPlaceholder = $('roomPlaceholder');
const roomContent = $('roomContent');
const roomTitle = $('roomTitle');
const roomSettingsBtn = $('roomSettingsBtn');
const voiceToggleBtn = $('voiceToggleBtn');
const voicePanel = $('voicePanel');
const voiceUsersEl = $('voiceUsers');
const voiceMuteBtn = $('voiceMuteBtn');
const voiceLeaveBtn = $('voiceLeaveBtn');
const messageList = $('messageList');
const messageInput = $('messageInput');
const sendBtn = $('sendBtn');
const fileInput = $('fileInput');
const taskList = $('taskList');
const createTaskBtn = $('createTaskBtn');
const profileBtn = $('profileBtn');
const searchInput = $('searchInput');
const searchBtn = $('searchBtn');
const themeToggle = $('themeToggle');
const menuToggle = $('menuToggle');
const sidebarEl = $('sidebar');
const overlayEl = $('overlay');

const createRoomModal = $('createRoomModal');
const newRoomName = $('newRoomName');
const newRoomDesc = $('newRoomDesc');
const newRoomPass = $('newRoomPass');
const newRoomPublic = $('newRoomPublic');
const confirmCreateRoom = $('confirmCreateRoom');
const createRoomError = $('createRoomError');

const joinRoomModal = $('joinRoomModal');
const joinRoomPass = $('joinRoomPass');
const confirmJoinRoom = $('confirmJoinRoom');
const joinRoomError = $('joinRoomError');

const createTaskModal = $('createTaskModal');
const taskTitle = $('taskTitle');
const taskDesc = $('taskDesc');
const taskDeadline = $('taskDeadline');
const taskAssignee = $('taskAssignee');
const confirmCreateTask = $('confirmCreateTask');
const createTaskError = $('createTaskError');

const profileModal = $('profileModal');
const profileAvatar = $('profileAvatar');
const profileUid = $('profileUid');
const avatarInput = $('avatarInput');
const profileBio = $('profileBio');
const saveProfileBtn = $('saveProfileBtn');
const profileError = $('profileError');
const deleteAccountBtn = $('deleteAccountBtn');

const searchResultModal = $('searchResultModal');
const searchResultContent = $('searchResultContent');
const searchResultError = $('searchResultError');

const viewProfileModal = $('viewProfileModal');
const viewProfileContent = $('viewProfileContent');

const roomSettingsModal = $('roomSettingsModal');
const settingsRoomName = $('settingsRoomName');
const settingsRoomDesc = $('settingsRoomDesc');
const settingsRoomPass = $('settingsRoomPass');
const settingsRemovePass = $('settingsRemovePass');
const settingsRoomPublic = $('settingsRoomPublic');
const saveRoomSettingsBtn = $('saveRoomSettingsBtn');
const deleteRoomBtn = $('deleteRoomBtn');
const roomSettingsError = $('roomSettingsError');
const membersList = $('membersList');
const membersCount = $('membersCount');

const tabButtons = document.querySelectorAll('.tabs .tab');
const settingsTabs = document.querySelectorAll('.settings-tab');

// ==================== ТЕМА ====================
(function initTheme() {
  const saved = localStorage.getItem('sanctum_theme');
  let theme = saved;
  if (!theme) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(theme);
})();

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sanctum_theme', theme);
  if (themeToggle) themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ==================== УТИЛИТЫ ====================
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
function showError(el, msg) {
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}
function toast(message, type = 'info') {
  const container = $('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = message;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2800);
}
function toggleAuth(show) {
  authContainer.style.display = show ? 'flex' : 'none';
  appContainer.style.display = show ? 'none' : 'flex';
}
function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
  $(tabId).style.display = 'flex';
  tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId.replace('Tab', '')));
}
function openSidebar() { sidebarEl.classList.add('open'); overlayEl.classList.add('active'); }
function closeSidebar() { sidebarEl.classList.remove('open'); overlayEl.classList.remove('active'); }
if (menuToggle) menuToggle.addEventListener('click', () => {
  sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlayEl?.addEventListener('click', closeSidebar);

// ==================== АУТЕНТИФИКАЦИЯ ====================
loginTab.addEventListener('click', () => {
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
});
registerTab.addEventListener('click', () => {
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
});

loginBtn.addEventListener('click', async () => {
  const username = $('loginUsername').value.trim();
  const password = $('loginPassword').value;
  if (!username || !password) return showError(loginError, 'Заполните все поля');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) return showError(loginError, data.error || 'Ошибка входа');
    showError(loginError, '');
    state.user = data.user;
    initApp();
  } catch { showError(loginError, 'Ошибка соединения с сервером'); }
});

registerBtn.addEventListener('click', async () => {
  const username = $('regUsername').value.trim();
  const password = $('regPassword').value;
  if (!username || !password) return showError(regError, 'Заполните все поля');
  if (!/^[a-zA-Z0-9]+$/.test(username)) return showError(regError, 'Логин только латиница и цифры');
  if (password.length < 4) return showError(regError, 'Пароль минимум 4 символа');
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) return showError(regError, data.error || 'Ошибка регистрации');
    showError(regError, '');
    toast('Регистрация успешна! Теперь войдите.', 'success');
    loginTab.click();
    $('loginUsername').value = username;
    $('loginPassword').value = '';
  } catch { showError(regError, 'Ошибка соединения'); }
});

logoutBtn.addEventListener('click', async () => {
  if (voiceState.active) leaveVoiceChat();
  await fetch('/api/logout', { method: 'POST' });
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  if (state.timerInterval) clearInterval(state.timerInterval);
  if (state.roomsRefreshInterval) clearInterval(state.roomsRefreshInterval);
  Object.assign(state, {
    user: null, currentRoom: null, rooms: [], messages: [], tasks: [],
    roomPasswords: {}, timerInterval: null, roomsRefreshInterval: null
  });
  toggleAuth(true);
  roomList.innerHTML = '';
});

// ==================== СТАРТ ====================
async function initApp() {
  if (!state.user) return;
  currentUserSpan.textContent = state.user.username;
  toggleAuth(false);
  await loadRooms();
  connectSocket();
  if (state.rooms.length > 0) selectRoom(state.rooms[0].id);
  updateUserUI();
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (state.currentRoom) loadTasks(state.currentRoom.id);
  }, 30000);
  if (state.roomsRefreshInterval) clearInterval(state.roomsRefreshInterval);
  state.roomsRefreshInterval = setInterval(loadRooms, 20000);
}

function updateUserUI() {
  const avatar = state.user.avatar
    ? `<img src="${state.user.avatar}" class="avatar" style="width:24px;height:24px;vertical-align:middle;">`
    : '';
  currentUserSpan.innerHTML = `${avatar} ${escapeHtml(state.user.username)}`;
}

// ==================== КОМНАТЫ ====================
async function loadRooms() {
  try {
    const res = await fetch('/api/rooms');
    if (!res.ok) return;
    state.rooms = await res.json();
    renderRoomList();
    if (state.currentRoom) {
      const fresh = state.rooms.find(r => r.id === state.currentRoom.id);
      if (!fresh) {
        state.currentRoom = null;
        roomContent.style.display = 'none';
        roomPlaceholder.style.display = 'flex';
        if (voiceState.active) leaveVoiceChat();
      } else {
        state.currentRoom = fresh;
        roomTitle.textContent = fresh.name;
      }
    }
  } catch (e) { console.error(e); }
}

function renderRoomList() {
  roomList.innerHTML = '';
  if (!state.rooms.length) {
    roomList.innerHTML = '<li style="color:var(--text-3);padding:15px;text-align:center;">Нет комнат. Создайте!</li>';
    return;
  }
  state.rooms.forEach(room => {
    const li = document.createElement('li');
    li.dataset.roomId = room.id;
    if (state.currentRoom?.id === room.id) li.classList.add('active');
    const isMember = room.is_member === 1;
    const joinBtn = !isMember ? `<button class="join-btn" data-roomid="${room.id}">Вступить</button>` : '';
    li.innerHTML = `
      <span class="room-name">${escapeHtml(room.name)}</span>
      <span class="room-meta">${room.member_count || 0} уч.</span>
      ${joinBtn}
    `;
    const joinBtnEl = li.querySelector('.join-btn');
    if (joinBtnEl) {
      joinBtnEl.addEventListener('click', (e) => { e.stopPropagation(); joinRoom(room.id); });
    } else {
      li.addEventListener('click', () => selectRoom(room.id));
    }
    roomList.appendChild(li);
  });
}

async function joinRoom(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;
  if (room.password_hash) {
    state.pendingRoomJoin = roomId;
    joinRoomModal.style.display = 'flex';
    joinRoomPass.value = '';
    joinRoomError.textContent = '';
    return;
  }
  try {
    const res = await fetch(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: '' })
    });
    if (!res.ok) { const e = await res.json(); toast(e.error || 'Ошибка', 'error'); return; }
    await loadRooms();
    selectRoom(roomId);
  } catch { toast('Ошибка соединения', 'error'); }
}

async function selectRoom(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room) return;
  if (window.innerWidth <= 768) closeSidebar();

  if (room.password_hash && !state.roomPasswords[roomId]) {
    state.pendingRoomJoin = roomId;
    joinRoomModal.style.display = 'flex';
    joinRoomPass.value = '';
    joinRoomError.textContent = '';
    return;
  }

  // Если были в голосовом чате другой комнаты — выходим
  if (voiceState.active && voiceState.roomId !== roomId) {
    leaveVoiceChat();
  }

  state.currentRoom = room;
  document.querySelectorAll('#roomList li').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.roomId) === roomId);
  });
  roomPlaceholder.style.display = 'none';
  roomContent.style.display = 'flex';
  roomTitle.textContent = room.name;

  await loadMessages(roomId);
  await loadTasks(roomId);
  switchTab('chatTab');

  if (state.socket?.connected) state.socket.emit('joinRoom', roomId);

  // Синхронизация UI голосового чата
  updateVoiceUI();
}

confirmJoinRoom.addEventListener('click', async () => {
  const roomId = state.pendingRoomJoin;
  if (!roomId) return;
  try {
    const res = await fetch(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: joinRoomPass.value })
    });
    const data = await res.json();
    if (!res.ok) return showError(joinRoomError, data.error || 'Ошибка');
    joinRoomModal.style.display = 'none';
    state.roomPasswords[roomId] = true;
    await loadRooms();
    selectRoom(roomId);
  } catch { showError(joinRoomError, 'Ошибка соединения'); }
});
document.querySelector('#joinRoomModal .close').addEventListener('click', () => {
  joinRoomModal.style.display = 'none';
});

// ==================== СООБЩЕНИЯ ====================
async function loadMessages(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}/messages`);
    if (!res.ok) return;
    state.messages = await res.json();
    renderMessages();
  } catch (e) { console.error(e); }
}

function renderMessages() {
  messageList.innerHTML = '';
  state.messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'message' + (msg.user_id === state.user.id ? ' own' : '');
    const time = formatTime(msg.timestamp);
    let fileHtml = '';
    if (msg.file_url) {
      fileHtml = msg.file_url.match(/\.(jpeg|jpg|png|gif|webp)$/i)
        ? `<img src="${msg.file_url}" class="file-attachment" />`
        : `<a href="${msg.file_url}" target="_blank">📎 Вложение</a>`;
    }
    const isAdmin = msg.sender_is_creator === 1 || msg.sender_role === 'admin';
    const adminBadge = isAdmin ? '<span class="admin-badge">Админ</span>' : '';
    const avatarUrl = msg.avatar || '/default-avatar.png';
    div.innerHTML = `
      <img src="${avatarUrl}" class="avatar" data-uid="${escapeHtml(msg.uid)}" />
      <span class="user" data-uid="${escapeHtml(msg.uid)}">${escapeHtml(msg.username)}</span>${adminBadge}
      <span class="time">${time}</span>
      <div>${escapeHtml(msg.content)}</div>
      ${fileHtml}
    `;
    div.querySelectorAll('[data-uid]').forEach(el => {
      el.addEventListener('click', () => openUserProfile(el.dataset.uid));
    });
    messageList.appendChild(div);
  });
  messageList.scrollTop = messageList.scrollHeight;
}

function formatTime(ts) {
  if (!ts) return '';
  let d;
  if (typeof ts === 'string' && ts.includes(' ') && !ts.includes('T')) {
    d = new Date(ts.replace(' ', 'T') + 'Z');
  } else {
    d = new Date(ts);
  }
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString();
}

// ==================== ЗАДАЧИ ====================
async function loadTasks(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}/tasks`);
    if (!res.ok) return;
    state.tasks = await res.json();
    renderTasks();
  } catch (e) { console.error(e); }
}

function renderTasks() {
  taskList.innerHTML = '';
  if (!state.tasks.length) {
    taskList.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:20px;">Задач пока нет</div>';
    return;
  }
  state.tasks.forEach(task => {
    const div = document.createElement('div');
    div.className = 'task-item';
    const statusClass = 'status-' + task.status;
    const statusLabel = { pending: 'Ожидает', in_progress: 'В работе', done: 'Выполнено' }[task.status] || task.status;

    let deadlineHtml = '';
    if (task.deadline) {
      const deadline = new Date(task.deadline);
      const diff = deadline - new Date();
      let timeLeft;
      if (diff > 0) {
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        timeLeft = `${d}д ${h}ч ${m}м`;
      } else timeLeft = 'Просрочено!';
      deadlineHtml = `<div class="task-deadline ${diff < 0 ? 'overdue' : ''}">⏳ ${deadline.toLocaleString()} (${timeLeft})</div>`;
    }

    div.innerHTML = `
      <div class="task-info">
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-meta">
          Создал: ${escapeHtml(task.created_by_username)} |
          ${task.assigned_username ? `Назначено: ${escapeHtml(task.assigned_username)}` : 'Не назначено'}
        </div>
        ${deadlineHtml}
      </div>
      <div class="task-actions">
        <span class="task-status ${statusClass}">${statusLabel}</span>
        <select data-taskid="${task.id}" class="task-status-select">
          <option value="pending" ${task.status==='pending'?'selected':''}>Ожидает</option>
          <option value="in_progress" ${task.status==='in_progress'?'selected':''}>В работе</option>
          <option value="done" ${task.status==='done'?'selected':''}>Выполнено</option>
        </select>
        <button data-taskid="${task.id}" class="task-delete-btn">Удалить</button>
      </div>
    `;
    div.querySelector('.task-status-select').addEventListener('change', (e) => {
      updateTask(task.id, { status: e.target.value });
    });
    div.querySelector('.task-delete-btn').addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json(); toast(e.error || 'Ошибка', 'error'); return; }
        toast('Задача удалена', 'success');
      } catch { toast('Ошибка соединения', 'error'); }
    });
    taskList.appendChild(div);
  });
}

async function updateTask(taskId, data) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) { const e = await res.json(); toast(e.error || 'Ошибка', 'error'); }
  } catch { toast('Ошибка соединения', 'error'); }
}

// ==================== СОЗДАНИЕ КОМНАТЫ ====================
createRoomBtn.addEventListener('click', () => {
  createRoomModal.style.display = 'flex';
  newRoomName.value = ''; newRoomDesc.value = ''; newRoomPass.value = '';
  newRoomPublic.checked = false; createRoomError.textContent = '';
});
document.querySelector('#createRoomModal .close').addEventListener('click', () => {
  createRoomModal.style.display = 'none';
});

confirmCreateRoom.addEventListener('click', async () => {
  const name = newRoomName.value.trim();
  if (!name) return showError(createRoomError, 'Введите название');
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: newRoomDesc.value.trim(),
        password: newRoomPass.value || undefined,
        is_public: newRoomPublic.checked
      })
    });
    const data = await res.json();
    if (!res.ok) return showError(createRoomError, data.error || 'Ошибка');
    showError(createRoomError, '');
    createRoomModal.style.display = 'none';
    toast('Комната создана', 'success');
    await loadRooms();
    selectRoom(data.id);
  } catch { showError(createRoomError, 'Ошибка соединения'); }
});

// ==================== СОЗДАНИЕ ЗАДАЧИ ====================
createTaskBtn.addEventListener('click', () => {
  if (!state.currentRoom) return;
  taskAssignee.innerHTML = '<option value="">Не назначено</option>';
  const opt = document.createElement('option');
  opt.value = state.user.id; opt.textContent = state.user.username + ' (я)';
  taskAssignee.appendChild(opt);
  taskDeadline.value = new Date().toISOString().slice(0, 16);
  createTaskModal.style.display = 'flex';
  taskTitle.value = ''; taskDesc.value = ''; taskAssignee.value = '';
  createTaskError.textContent = '';
});
document.querySelector('#createTaskModal .close').addEventListener('click', () => {
  createTaskModal.style.display = 'none';
});

confirmCreateTask.addEventListener('click', async () => {
  const title = taskTitle.value.trim();
  if (!title) return showError(createTaskError, 'Введите название');
  try {
    const res = await fetch(`/api/rooms/${state.currentRoom.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: taskDesc.value.trim() || null,
        assigned_to: taskAssignee.value ? parseInt(taskAssignee.value) : null,
        deadline: taskDeadline.value || null
      })
    });
    const data = await res.json();
    if (!res.ok) return showError(createTaskError, data.error || 'Ошибка');
    showError(createTaskError, '');
    createTaskModal.style.display = 'none';
    toast('Задача создана', 'success');
  } catch { showError(createTaskError, 'Ошибка соединения'); }
});

// ==================== ВКЛАДКИ ====================
tabButtons.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab + 'Tab')));
settingsTabs.forEach(btn => btn.addEventListener('click', () => {
  settingsTabs.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.settings-tab-content').forEach(el => el.style.display = 'none');
  $('settings' + btn.dataset.stab.charAt(0).toUpperCase() + btn.dataset.stab.slice(1)).style.display = 'block';
}));

// ==================== СООБЩЕНИЯ ====================
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const content = messageInput.value.trim();
  if (!content || !state.currentRoom || !state.user) return;
  if (state.socket?.connected) {
    state.socket.emit('sendMessage', {
      roomId: state.currentRoom.id,
      userId: state.user.id,
      content,
      fileUrl: null
    });
    messageInput.value = '';
  } else {
    toast('Нет соединения с сервером', 'error');
  }
}

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    if (state.socket?.connected) {
      state.socket.emit('sendMessage', {
        roomId: state.currentRoom.id,
        userId: state.user.id,
        content: '',
        fileUrl: data.fileUrl
      });
    }
    fileInput.value = '';
  } catch (err) { toast('Ошибка загрузки: ' + err.message, 'error'); }
});

// ==================== ПРОФИЛЬ ====================
profileBtn.addEventListener('click', () => {
  if (!state.user) return;
  profileModal.style.display = 'flex';
  profileAvatar.src = state.user.avatar || '/default-avatar.png';
  profileUid.textContent = state.user.uid || '—';
  profileBio.value = state.user.bio || '';
  profileError.textContent = '';
});
document.querySelector('#profileModal .close').addEventListener('click', () => {
  profileModal.style.display = 'none';
});

avatarInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('avatar', file);
  fd.append('bio', profileBio.value);
  try {
    const res = await fetch('/api/profile', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    state.user = data;
    updateUserUI();
    profileAvatar.src = data.avatar || '/default-avatar.png';
    if (state.currentRoom) loadMessages(state.currentRoom.id);
    toast('Профиль обновлён', 'success');
  } catch (err) { showError(profileError, err.message); }
});

saveProfileBtn.addEventListener('click', async () => {
  const fd = new FormData();
  fd.append('bio', profileBio.value);
  try {
    const res = await fetch('/api/profile', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка');
    state.user = data;
    updateUserUI();
    toast('Профиль обновлён', 'success');
    profileModal.style.display = 'none';
  } catch (err) { showError(profileError, err.message); }
});

deleteAccountBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/users/me', { method: 'DELETE' });
    if (!res.ok) { const e = await res.json(); toast(e.error || 'Ошибка', 'error'); return; }
    toast('Аккаунт удалён', 'success');
    if (voiceState.active) leaveVoiceChat();
    await fetch('/api/logout', { method: 'POST' });
    if (state.socket) { state.socket.disconnect(); state.socket = null; }
    Object.assign(state, { user: null, currentRoom: null });
    toggleAuth(true);
    roomList.innerHTML = '';
  } catch { toast('Ошибка соединения', 'error'); }
});

// ==================== ПОИСК ====================
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') performSearch(); });

async function performSearch() {
  const uid = searchInput.value.trim().toUpperCase();
  if (!uid) return toast('Введите UID', 'info');
  try {
    const res = await fetch(`/api/users/${uid}`);
    const data = await res.json();
    if (!res.ok) {
      searchResultContent.innerHTML = '';
      showError(searchResultError, data.error || 'Не найден');
      searchResultModal.style.display = 'flex';
      return;
    }
    showError(searchResultError, '');
    const avatar = data.avatar || '/default-avatar.png';
    searchResultContent.innerHTML = `
      <div class="user-card">
        <img src="${avatar}" alt="Аватар">
        <div class="info">
          <div class="username">${escapeHtml(data.username)}</div>
          <div class="uid">UID: ${escapeHtml(data.uid)}</div>
          <div class="bio">${escapeHtml(data.bio || '')}</div>
        </div>
        <div class="actions"><button class="open-profile-btn">Профиль</button></div>
      </div>
    `;
    searchResultContent.querySelector('.open-profile-btn').addEventListener('click', () => {
      searchResultModal.style.display = 'none';
      openUserProfile(data.uid);
    });
    searchResultModal.style.display = 'flex';
  } catch { showError(searchResultError, 'Ошибка соединения'); }
}
document.querySelector('#searchResultModal .close').addEventListener('click', () => {
  searchResultModal.style.display = 'none';
});

async function openUserProfile(uid) {
  if (!uid) return;
  try {
    const res = await fetch(`/api/users/${uid}`);
    const data = await res.json();
    if (!res.ok) return toast(data.error || 'Не найден', 'error');
    const avatar = data.avatar || '/default-avatar.png';
    viewProfileContent.innerHTML = `
      <div class="view-profile">
        <img src="${avatar}" class="view-profile-avatar" />
        <div class="view-profile-username">${escapeHtml(data.username)}</div>
        <div class="view-profile-uid">UID: ${escapeHtml(data.uid)}</div>
        <div class="view-profile-bio">${escapeHtml(data.bio || 'Нет описания')}</div>
      </div>
    `;
    viewProfileModal.style.display = 'flex';
  } catch { toast('Ошибка соединения', 'error'); }
}
document.querySelector('#viewProfileModal .close').addEventListener('click', () => {
  viewProfileModal.style.display = 'none';
});

// ==================== НАСТРОЙКИ КОМНАТЫ ====================
roomSettingsBtn.addEventListener('click', openRoomSettings);

async function openRoomSettings() {
  if (!state.currentRoom) return;
  const room = state.currentRoom;
  const isCreator = room.created_by === state.user.id;
  const isAdmin = room.my_role === 'admin' || isCreator;
  if (!isAdmin) { toast('Настройки доступны только создателю и админам', 'info'); return; }

  settingsRoomName.value = room.name || '';
  settingsRoomDesc.value = room.description || '';
  settingsRoomPass.value = '';
  settingsRemovePass.checked = false;
  settingsRoomPublic.checked = room.is_public === 1;
  deleteRoomBtn.style.display = isCreator ? 'block' : 'none';

  settingsTabs.forEach(b => b.classList.remove('active'));
  settingsTabs[0].classList.add('active');
  document.querySelectorAll('.settings-tab-content').forEach(el => el.style.display = 'none');
  $('settingsGeneral').style.display = 'block';

  roomSettingsError.textContent = '';
  roomSettingsModal.style.display = 'flex';
  await loadMembers(room.id);
}
document.querySelector('#roomSettingsModal .close').addEventListener('click', () => {
  roomSettingsModal.style.display = 'none';
});

saveRoomSettingsBtn.addEventListener('click', async () => {
  if (!state.currentRoom) return;
  const name = settingsRoomName.value.trim();
  if (!name) return showError(roomSettingsError, 'Введите название');
  const payload = {
    name,
    description: settingsRoomDesc.value.trim(),
    is_public: settingsRoomPublic.checked,
    remove_password: settingsRemovePass.checked
  };
  if (!settingsRemovePass.checked && settingsRoomPass.value.trim()) {
    payload.password = settingsRoomPass.value;
  }
  try {
    const res = await fetch(`/api/rooms/${state.currentRoom.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return showError(roomSettingsError, data.error || 'Ошибка');
    showError(roomSettingsError, '');
    toast('Настройки сохранены', 'success');
    roomSettingsModal.style.display = 'none';
    await loadRooms();
  } catch { showError(roomSettingsError, 'Ошибка соединения'); }
});

deleteRoomBtn.addEventListener('click', async () => {
  if (!state.currentRoom) return;
  try {
    const res = await fetch(`/api/rooms/${state.currentRoom.id}`, { method: 'DELETE' });
    if (!res.ok) { const e = await res.json(); toast(e.error || 'Ошибка', 'error'); return; }
    toast('Комната удалена', 'success');
    roomSettingsModal.style.display = 'none';
    if (voiceState.active) leaveVoiceChat();
    state.currentRoom = null;
    roomContent.style.display = 'none';
    roomPlaceholder.style.display = 'flex';
    await loadRooms();
  } catch { toast('Ошибка соединения', 'error'); }
});

async function loadMembers(roomId) {
  try {
    const res = await fetch(`/api/rooms/${roomId}/members`);
    if (!res.ok) return;
    const members = await res.json();
    membersCount.textContent = members.length;
    const isCreator = state.currentRoom.created_by === state.user.id;
    membersList.innerHTML = '';
    members.forEach(m => {
      const li = document.createElement('li');
      li.className = 'member-item';
      const avatar = m.avatar || '/default-avatar.png';
      const isAdminRole = m.role === 'admin' || m.is_creator === 1;
      const adminBadge = isAdminRole ? '<span class="admin-badge">Админ</span>' : '';
      const creatorBadge = m.is_creator === 1 ? '<span class="admin-badge" style="background:#8e44ad;">Создатель</span>' : '';
      let actionBtn = '';
      if (isCreator && m.is_creator !== 1) {
        if (isAdminRole) actionBtn = `<button class="admin-toggle" data-uid="${m.id}" data-action="demote">Снять админа</button>`;
        else actionBtn = `<button class="admin-toggle" data-uid="${m.id}" data-action="promote">Назначить админом</button>`;
      }
      li.innerHTML = `
        <img src="${avatar}" data-uid="${escapeHtml(m.uid)}" />
        <div class="member-info">
          <div class="member-name" data-uid="${escapeHtml(m.uid)}">
            ${escapeHtml(m.username)} ${creatorBadge} ${adminBadge}
          </div>
          <div class="member-uid">UID: ${escapeHtml(m.uid)}</div>
        </div>
        <div class="member-actions">${actionBtn}</div>
      `;
      li.querySelectorAll('[data-uid]').forEach(el => {
        el.addEventListener('click', () => {
          if (el.dataset.uid) {
            roomSettingsModal.style.display = 'none';
            openUserProfile(el.dataset.uid);
          }
        });
      });
      const btn = li.querySelector('.admin-toggle');
      if (btn) {
        btn.addEventListener('click', async () => {
          const newRole = btn.dataset.action === 'promote' ? 'admin' : 'member';
          try {
            const r = await fetch(`/api/rooms/${roomId}/members/${btn.dataset.uid}/role`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: newRole })
            });
            if (!r.ok) { const e = await r.json(); toast(e.error || 'Ошибка', 'error'); return; }
            toast(newRole === 'admin' ? 'Назначен админ' : 'Права сняты', 'success');
          } catch { toast('Ошибка соединения', 'error'); }
        });
      }
      membersList.appendChild(li);
    });
  } catch (e) { console.error(e); }
}

// ==================== VOICE CHAT ====================
const ICE_SERVERS = [
  { urls: 'stun:stun.sipnet.ru:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },
  { urls: 'stun:stun.l.google.com:19302' }
];

voiceToggleBtn.addEventListener('click', () => {
  if (voiceState.active) leaveVoiceChat();
  else joinVoiceChat();
});

voiceLeaveBtn.addEventListener('click', leaveVoiceChat);
voiceMuteBtn.addEventListener('click', toggleMute);

async function joinVoiceChat() {
  if (!state.currentRoom || !state.user) return;
  if (voiceState.active) return;

  try {
    voiceState.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
  } catch (err) {
    toast('Нет доступа к микрофону: ' + err.message, 'error');
    return;
  }

  voiceState.active = true;
  voiceState.roomId = state.currentRoom.id;
  voiceState.muted = false;

  state.socket.emit('voiceJoin', {
    roomId: state.currentRoom.id,
    userId: state.user.id
  });

  toast('Вы вошли в голосовой чат', 'success');
  updateVoiceUI();
}

function leaveVoiceChat() {
  if (!voiceState.active) return;

  // Останавливаем локальный поток
  if (voiceState.localStream) {
    voiceState.localStream.getTracks().forEach(t => t.stop());
    voiceState.localStream = null;
  }

  // Закрываем все peer connections
  voiceState.peers.forEach(({ pc, remoteAudio }) => {
    try { pc.close(); } catch {}
    if (remoteAudio && remoteAudio.parentNode) remoteAudio.parentNode.removeChild(remoteAudio);
  });
  voiceState.peers.clear();

  // Сообщаем серверу
  if (state.socket?.connected && voiceState.roomId) {
    state.socket.emit('voiceLeave', { roomId: voiceState.roomId });
  }

  voiceState.active = false;
  voiceState.roomId = null;
  voiceState.muted = false;
  voiceState.users = [];
  updateVoiceUI();
}

function toggleMute() {
  if (!voiceState.localStream) return;
  voiceState.muted = !voiceState.muted;
  voiceState.localStream.getAudioTracks().forEach(t => t.enabled = !voiceState.muted);
  if (state.socket?.connected && voiceState.roomId) {
    state.socket.emit('voiceMuteToggle', {
      roomId: voiceState.roomId,
      muted: voiceState.muted
    });
  }
  updateVoiceUI();
}

function updateVoiceUI() {
  if (voiceState.active) {
    voicePanel.classList.add('active');
    voiceToggleBtn.classList.add('active');
    voiceToggleBtn.textContent = '🎙️ В эфире';
    voiceMuteBtn.textContent = voiceState.muted ? '🔇 Выкл.' : '🎤 Вкл.';
    voiceMuteBtn.classList.toggle('muted', voiceState.muted);
    renderVoiceUsers();
  } else {
    voicePanel.classList.remove('active');
    voiceToggleBtn.classList.remove('active');
    voiceToggleBtn.textContent = '🎙️ Голос';
    voiceUsersEl.innerHTML = '';
  }
}

function renderVoiceUsers() {
  voiceUsersEl.innerHTML = '';
  voiceState.users.forEach(u => {
    const el = document.createElement('div');
    el.className = 'voice-user' + (u.muted ? ' muted' : '');
    const avatar = u.avatar || '/default-avatar.png';
    const muteIcon = u.muted ? '<span class="mute-icon">🔇</span>' : '';
    el.innerHTML = `
      <img src="${avatar}" />
      <span>${escapeHtml(u.username)}</span>
      ${muteIcon}
    `;
    voiceUsersEl.appendChild(el);
  });
  if (voiceState.users.length === 0) {
    voiceUsersEl.innerHTML = '<span style="color:var(--text-3);font-size:13px;">Никого нет</span>';
  }
}

function createPeerConnection(peerSocketId, initiator) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Добавляем локальные треки
  if (voiceState.localStream) {
    voiceState.localStream.getTracks().forEach(track => pc.addTrack(track, voiceState.localStream));
  }

  // Обработка удалённого трека — воспроизводим звук
  const remoteAudio = document.createElement('audio');
  remoteAudio.autoplay = true;
  remoteAudio.style.display = 'none';
  document.body.appendChild(remoteAudio);

  pc.ontrack = (event) => {
    remoteAudio.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      state.socket.emit('voiceSignal', {
        to: peerSocketId,
        from: state.socket.id,
        signal: { type: 'ice', candidate: event.candidate }
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
      closePeer(peerSocketId);
    }
  };

  voiceState.peers.set(peerSocketId, { pc, remoteAudio });

  if (initiator) {
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        state.socket.emit('voiceSignal', {
          to: peerSocketId,
          from: state.socket.id,
          signal: { type: 'offer', sdp: pc.localDescription }
        });
      } catch (e) { console.error('Ошибка создания offer:', e); }
    };
  }

  return pc;
}

async function handleVoiceSignal({ from, signal }) {
  if (!voiceState.active) return;

  let peer = voiceState.peers.get(from);
  if (!peer) {
    // Новый пир — мы инициатор? Нет, если пришёл offer — создаём pc и отвечаем
    if (signal.type === 'offer') {
      const pc = createPeerConnection(from, false);
      peer = voiceState.peers.get(from);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      state.socket.emit('voiceSignal', {
        to: from,
        from: state.socket.id,
        signal: { type: 'answer', sdp: pc.localDescription }
      });
    }
    return;
  }

  const pc = peer.pc;

  try {
    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      state.socket.emit('voiceSignal', {
        to: from,
        from: state.socket.id,
        signal: { type: 'answer', sdp: pc.localDescription }
      });
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.type === 'ice' && signal.candidate) {
      try { await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)); }
      catch (e) { console.warn('ICE error:', e); }
    }
  } catch (e) { console.error('Ошибка обработки сигнала:', e); }
}

function closePeer(peerSocketId) {
  const peer = voiceState.peers.get(peerSocketId);
  if (!peer) return;
  try { peer.pc.close(); } catch {}
  if (peer.remoteAudio && peer.remoteAudio.parentNode) peer.remoteAudio.parentNode.removeChild(peer.remoteAudio);
  voiceState.peers.delete(peerSocketId);
}

// ==================== SOCKET.IO ====================
function connectSocket() {
  if (state.socket) return;
  state.socket = io();

  state.socket.on('connect', () => {
    console.log('✅ Socket подключён:', state.socket.id);
    if (state.currentRoom) state.socket.emit('joinRoom', state.currentRoom.id);
  });

  state.socket.on('newMessage', (msg) => {
    if (state.currentRoom && msg.room_id === state.currentRoom.id) {
      if (!state.messages.find(m => m.id === msg.id)) {
        state.messages.push(msg);
        renderMessages();
      }
    }
  });

  state.socket.on('taskCreated', (task) => {
    if (state.currentRoom?.id === task.room_id) {
      if (!state.tasks.find(t => t.id === task.id)) {
        state.tasks.unshift(task);
        renderTasks();
      }
    }
  });

  state.socket.on('taskUpdated', (task) => {
    if (state.currentRoom?.id === task.room_id) {
      const idx = state.tasks.findIndex(t => t.id === task.id);
      if (idx !== -1) state.tasks[idx] = task;
      else state.tasks.unshift(task);
      renderTasks();
    }
  });

  state.socket.on('taskDeleted', (taskId) => {
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    renderTasks();
  });

  state.socket.on('roomsChanged', () => loadRooms());

  state.socket.on('roomUpdated', (room) => {
    if (state.currentRoom?.id === room.id) {
      state.currentRoom = { ...state.currentRoom, ...room };
      roomTitle.textContent = room.name;
    }
    loadRooms();
  });

  state.socket.on('roomDeleted', (roomId) => {
    if (state.currentRoom?.id === roomId) {
      if (voiceState.active) leaveVoiceChat();
      state.currentRoom = null;
      roomContent.style.display = 'none';
      roomPlaceholder.style.display = 'flex';
      toast('Комната была удалена', 'info');
    }
    loadRooms();
  });

  state.socket.on('roomMembersChanged', (roomId) => {
    if (state.currentRoom?.id === roomId && roomSettingsModal.style.display === 'flex') {
      loadMembers(roomId);
    }
    loadRooms();
  });

  // -------- VOICE EVENTS --------
  state.socket.on('voiceUsers', ({ roomId, users }) => {
    if (voiceState.active && voiceState.roomId === roomId) {
      voiceState.users = users;
      renderVoiceUsers();
    }
  });

  state.socket.on('voiceExistingUsers', async ({ roomId, users }) => {
    if (!voiceState.active || voiceState.roomId !== roomId) return;
    // Мы только что вошли — инициируем соединение с каждым
    for (const u of users) {
      if (u.socketId === state.socket.id) continue;
      if (!voiceState.peers.has(u.socketId)) {
        createPeerConnection(u.socketId, true);
      }
    }
  });

  state.socket.on('voiceUserJoined', async ({ roomId, user }) => {
    if (!voiceState.active || voiceState.roomId !== roomId) return;
    // Другой участник вошёл — ждём от него offer, но можем создать pc заранее
    if (!voiceState.peers.has(user.socketId)) {
      createPeerConnection(user.socketId, false);
    }
  });

  state.socket.on('voiceUserLeft', ({ roomId, socketId }) => {
    if (voiceState.roomId === roomId) {
      closePeer(socketId);
    }
  });

  state.socket.on('voiceSignal', handleVoiceSignal);

  state.socket.on('disconnect', (reason) => {
    console.warn('Socket отключён:', reason);
    if (voiceState.active) {
      // Закрываем все соединения, но остаёмся "в эфире" для переподключения
      voiceState.peers.forEach(({ pc, remoteAudio }) => {
        try { pc.close(); } catch {}
        if (remoteAudio && remoteAudio.parentNode) remoteAudio.parentNode.removeChild(remoteAudio);
      });
      voiceState.peers.clear();
    }
  });

  state.socket.on('reconnect', () => {
    if (state.currentRoom) state.socket.emit('joinRoom', state.currentRoom.id);
    if (voiceState.active && voiceState.roomId) {
      state.socket.emit('voiceJoin', { roomId: voiceState.roomId, userId: state.user.id });
    }
  });
}

// ==================== СТАРТ ====================
(async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      state.user = await res.json();
      initApp();
    } else {
      toggleAuth(true);
    }
  } catch { toggleAuth(true); }
})();

window.addEventListener('click', (e) => {
  [createRoomModal, joinRoomModal, createTaskModal, profileModal,
   searchResultModal, viewProfileModal, roomSettingsModal].forEach(m => {
    if (e.target === m) m.style.display = 'none';
  });
});