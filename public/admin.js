const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

function apiFetch(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'X-Telegram-Init-Data': tg.initData,
      'Content-Type': 'application/json',
    },
  });
}

function formatStarted(iso) {
  const started = new Date(iso);
  if (Number.isNaN(started.getTime())) return 'время неизвестно';
  const stamp = started.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const hours = Math.floor((Date.now() - started.getTime()) / 3600000);
  return hours >= 1 ? `${stamp} (${hours} ч назад)` : stamp;
}

async function loadVersion() {
  const el = document.getElementById('version');
  if (!el) return;
  try {
    const response = await apiFetch('/api/admin/version');
    if (!response.ok) throw new Error(String(response.status));
    const info = await response.json();
    const commit = info.commit ?? 'коммит неизвестен';
    el.textContent = `v${info.version} · ${commit} · запущен ${formatStarted(info.startedAt)}`;
  } catch {
    el.textContent = 'версия недоступна';
  }
}

async function loadUsers() {
  const response = await apiFetch('/api/admin/users');
  if (!response.ok) {
    document.body.innerHTML = '<p>Доступ запрещён.</p>';
    return;
  }
  const data = await response.json();
  const tbody = document.getElementById('users-body');
  tbody.innerHTML = '';
  for (const user of data.users) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.telegramId}</td>
      <td>${user.freeRunUsed ? 'да' : 'нет'}</td>
      <td>${user.unlimitedAccess ? 'да' : 'нет'}</td>
      <td>${user.balanceOverride ?? '-'}</td>
      <td>
        <button data-action="reset" data-id="${user.telegramId}">Сброс</button>
        <button data-action="unlimited" data-id="${user.telegramId}">Безлимит вкл/выкл</button>
        <button data-action="balance" data-id="${user.telegramId}">Задать баланс</button>
      </td>
    `;
    tbody.appendChild(row);
  }
}

document.getElementById('users-body').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const { action, id } = button.dataset;

  if (action === 'reset') {
    await apiFetch(`/api/admin/users/${id}/reset`, { method: 'POST' });
  } else if (action === 'unlimited') {
    const enabled = confirm('Включить безлимит для этого пользователя?');
    await apiFetch(`/api/admin/users/${id}/unlimited`, { method: 'POST', body: JSON.stringify({ enabled }) });
  } else if (action === 'balance') {
    const value = prompt('Новый баланс:');
    if (value === null) return;
    await apiFetch(`/api/admin/users/${id}/balance`, { method: 'POST', body: JSON.stringify({ value: Number(value) }) });
  }
  await loadUsers();
});

// Version first: a denied loadUsers() replaces the whole body, taking the
// version element with it.
loadVersion().then(loadUsers);
