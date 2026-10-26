'use strict';

// ==================== АВТОРИЗАЦИЯ (SERVER API) ====================

// Отправка запроса на регистрацию
async function registerUser(u, p) {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  });
  const data = await res.json();
  if (data.ok && data.token) {
    window.__catan_token = data.token;
    if (typeof initSocket === 'function') initSocket();
  }
  return data;
}

// Отправка запроса на логин
async function loginUser(u, p) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Важно: позволяет браузеру принимать и отправлять куки
    body: JSON.stringify({ username: u, password: p }),
  });
  const data = await res.json();
  if (data.ok && data.token) {
    window.__catan_token = data.token;
    if (typeof initSocket === 'function') initSocket(); // Подключаем сокет сразу после входа
  }
  return data;
}

// Проверка, залогинен ли игрок (при загрузке страницы)
async function loadSession() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    const data = await res.json();
    
    // Сохраняем токен в глобальную переменную для Socket.io
    if (data.user && data.token) {
      window.__catan_token = data.token;
    }
    return data.user;
  } catch (e) {
    return null;
  }
}

// Выход из аккаунта
async function clearSession() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch (e) {}
  currentUser = null;
  updateMenuUserUI();
}

// ==================== TOAST ====================
let toastTimer = null;
function showToast(msg, duration) {
  duration = duration || 2600;
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('visible'); }, duration);
}

// ==================== ЭКРАНЫ ====================
const SCREENS = ['menu', 'login', 'register', 'lobby', 'room'];
function showScreen(name) {
  for (let i = 0; i < SCREENS.length; i++) {
    const el = document.getElementById('screen-' + SCREENS[i]);
    if (el) el.classList.toggle('active', SCREENS[i] === name);
  }
  document.getElementById('gameContainer').classList.toggle('active', name === 'game');
}

// ==================== ЦВЕТА ====================
const PLAYER_COLORS = [
  { id: 'blue',   hex: 0x3498db, css: '#3498db', dark: 0x1f6690, roof: 0xa02020, name: 'Синий' },
  { id: 'red',    hex: 0xe74c3c, css: '#e74c3c', dark: 0xa02820, roof: 0x203060, name: 'Красный' },
  { id: 'green',  hex: 0x2ecc71, css: '#2ecc71', dark: 0x1a8a4a, roof: 0xd4a020, name: 'Зелёный' },
  { id: 'orange', hex: 0xf39c12, css: '#f39c12', dark: 0xa06a10, roof: 0x502090, name: 'Оранжевый' }
];

let currentUser = null;
let myColorIdx = 0;

// ==================== UI АВТОРИЗАЦИИ ====================
function updateMenuUserUI() {
  const badge = document.getElementById('menuUserBadge');
  const showLoginReg = document.getElementById('btnShowLogin');
  const showRegister = document.getElementById('btnShowRegister');
  const showLogout = document.getElementById('btnLogout');
  const showCreate = document.getElementById('btnCreateRoom');
  const showJoin = document.getElementById('btnShowJoin');
  const showSwitch = document.getElementById('btnSwitchAccount');
  const joinForm = document.getElementById('joinForm');

  if (currentUser) {
    badge.style.display = 'flex';
    document.getElementById('menuUserName').textContent = currentUser.username;
    document.getElementById('menuAvatar').textContent = currentUser.username[0].toUpperCase();
    showLoginReg.style.display = 'none';
    showRegister.style.display = 'none';
    showLogout.style.display = 'block';
    showCreate.style.display = 'block';
    showJoin.style.display = 'block';
    showSwitch.style.display = 'block';
  } else {
    badge.style.display = 'none';
    showLoginReg.style.display = 'block';
    showRegister.style.display = 'block';
    showLogout.style.display = 'none';
    showCreate.style.display = 'none';
    showJoin.style.display = 'none';
    showSwitch.style.display = 'none';
    joinForm.style.display = 'none';
  }
}

// ==================== ОБРАБОТЧИКИ КНОПОК ====================

document.getElementById('btnShowLogin').onclick = function() {
  document.getElementById('loginError').classList.remove('visible');
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  showScreen('login');
  setTimeout(function() { document.getElementById('loginUsername').focus(); }, 100);
};

document.getElementById('btnShowRegister').onclick = function() {
  document.getElementById('registerError').classList.remove('visible');
  document.getElementById('registerSuccess').classList.remove('visible');
  document.getElementById('regUsername').value = '';
  document.getElementById('regPassword').value = '';
  document.getElementById('regPassword2').value = '';
  showScreen('register');
  setTimeout(function() { document.getElementById('regUsername').focus(); }, 100);
};

document.getElementById('btnBackFromLogin').onclick = function() { showScreen('menu'); };
document.getElementById('btnBackFromRegister').onclick = function() { showScreen('menu'); };

document.getElementById('btnLogout').onclick = async function() {
  await clearSession(); 
  showToast('Вы вышли');
};

document.getElementById('btnSwitchAccount').onclick = async function() {
  await clearSession();
  showScreen('login');
  setTimeout(function() { document.getElementById('loginUsername').focus(); }, 100);
};

document.getElementById('btnDoLogin').onclick = async function() {
  const u = document.getElementById('loginUsername').value.trim();
  const p = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  
  if (!u || !p) { err.textContent = 'Введите логин и пароль'; err.classList.add('visible'); return; }
  
  // Блокируем кнопку на время запроса (чтобы не спамили)
  const btn = document.getElementById('btnDoLogin');
  btn.disabled = true;
  btn.textContent = 'Вход...';

  const r = await loginUser(u, p);
  
  btn.disabled = false;
  btn.innerHTML = '<span>→</span> Войти';

  if (!r.ok) { err.textContent = r.error; err.classList.add('visible'); return; }
  
  currentUser = r.user;
  err.classList.remove('visible');
  showToast('Добро пожаловать, ' + currentUser.username + '!');
  updateMenuUserUI();
  showScreen('menu');
};

document.getElementById('btnDoRegister').onclick = async function() {
  const u = document.getElementById('regUsername').value.trim();
  const p = document.getElementById('regPassword').value;
  const p2 = document.getElementById('regPassword2').value;
  const err = document.getElementById('registerError');
  const suc = document.getElementById('registerSuccess');
  
  err.classList.remove('visible'); suc.classList.remove('visible');
  
  if (p !== p2) { err.textContent = 'Пароли не совпадают'; err.classList.add('visible'); return; }
  
  const btn = document.getElementById('btnDoRegister');
  btn.disabled = true;
  btn.textContent = 'Создание...';

  const r = await registerUser(u, p);
  if (!r.ok) { 
    btn.disabled = false;
    btn.innerHTML = '<span>✓</span> Создать аккаунт';
    err.textContent = r.error; err.classList.add('visible'); return; 
  }

  suc.textContent = 'Аккаунт создан! Входим...'; suc.classList.add('visible');
  
  // Сразу логинимся после успешной регистрации
  setTimeout(async function() {
    const lr = await loginUser(u, p);
    btn.disabled = false;
    btn.innerHTML = '<span>✓</span> Создать аккаунт';
    
    if (lr.ok) { 
      currentUser = lr.user; 
      updateMenuUserUI(); 
      showToast('Добро пожаловать!'); 
      showScreen('menu'); 
    }
  }, 500);
};

// Поддержка Enter на полях ввода
['loginUsername', 'loginPassword'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e) { 
    if (e.key === 'Enter') document.getElementById('btnDoLogin').click(); 
  });
});
['regUsername', 'regPassword', 'regPassword2'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e) { 
    if (e.key === 'Enter') document.getElementById('btnDoRegister').click(); 
  });
});

// ==================== ЛОББИ ====================
function renderColorPicker() {
  const picker = document.getElementById('lobbyColorPicker');
  if (!picker) return;
  picker.innerHTML = '';
  PLAYER_COLORS.forEach(function(color, i) {
    const div = document.createElement('div');
    div.className = 'color-option' + (i === myColorIdx ? ' selected' : '');
    div.style.background = color.css;
    div.style.color = color.css;
    div.title = color.name;
    div.onclick = function() { myColorIdx = i; renderColorPicker(); };
    picker.appendChild(div);
  });
}

document.getElementById('btnCreateRoom').onclick = function() {
  if (!currentUser) return;
  myColorIdx = 0;
  renderColorPicker();
  showScreen('lobby');
};
document.getElementById('btnShowJoin').onclick = function() {
  if (!currentUser) return;
  const form = document.getElementById('joinForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
  if (form.style.display === 'block') {
    document.getElementById('joinCodeInput').value = '';
    setTimeout(function() { document.getElementById('joinCodeInput').focus(); }, 100);
  }
};
document.getElementById('btnCancelJoin').onclick = function() { document.getElementById('joinForm').style.display = 'none'; };
document.getElementById('btnJoinRoom').onclick = function() {
  const code = document.getElementById('joinCodeInput').value.toUpperCase().trim();
  if (code.length !== 4) { showToast('Код из 4 символов'); return; }
  attemptJoinRoom(code);
};
document.getElementById('joinCodeInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('btnJoinRoom').click(); });
document.getElementById('btnLobbyCreate').onclick = function() { createRoom(); };
document.getElementById('btnLobbyJoin').onclick = function() {
  const f = document.getElementById('lobbyJoinForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
  if (f.style.display === 'block') setTimeout(function() { document.getElementById('lobbyJoinCode').focus(); }, 100);
};
document.getElementById('btnLobbyJoinCancel').onclick = function() { document.getElementById('lobbyJoinForm').style.display = 'none'; };
document.getElementById('btnLobbyJoinGo').onclick = function() {
  const code = document.getElementById('lobbyJoinCode').value.toUpperCase().trim();
  if (code.length !== 4) { showToast('Код из 4 символов'); return; }
  attemptJoinRoom(code);
};
document.getElementById('lobbyJoinCode').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('btnLobbyJoinGo').click(); });
document.getElementById('btnBackToMenu').onclick = function() { showScreen('menu'); };

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
(async function() {
  // Проверяем, есть ли активная сессия на сервере
  const saved = await loadSession();
  if (saved) { 
    currentUser = saved; 
    updateMenuUserUI(); 
  }
  renderColorPicker();
  showScreen('menu');
})();

console.log('[auth] OK — переход на серверную авторизацию');