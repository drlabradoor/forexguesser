import { state, setState, subscribe } from './state.js';
import { icons } from './icons.js';
import { getConfig, getMe, getSignals } from './api.js';
import { renderScreenshot, acceptFile } from './screens/screenshot.js';
import { renderSignals } from './screens/signals.js';
import { renderLocked } from './screens/locked.js';
import { openAccessChat } from './cta.js';

const tg = window.Telegram?.WebApp;

const TABS = [
  { id: 'signals', label: 'Сигналы', icon: icons.signals },
  { id: 'screenshot', label: 'Скриншот', icon: icons.camera },
  { id: 'trading', label: 'Торговля', icon: icons.trading },
];

function renderTabBar() {
  const nav = document.getElementById('tabbar');
  nav.innerHTML = TABS.map(
    (tab) => `
      <button class="tabbar__item ${tab.id === state.tab ? 'is-active' : ''}" data-tab="${tab.id}">
        <span class="tabbar__icon">${tab.icon}</span>
        <span class="tabbar__label">${tab.label}</span>
      </button>`
  ).join('');
}

function renderContent() {
  const root = document.getElementById('content');
  root.innerHTML = '';
  // Пустые экраны центрируются по вертикали, но только на широких экранах --
  // правило живёт в @media (min-width: 600px). Список сигналов не пустой экран.
  root.classList.toggle(
    'content--centered',
    state.tab === 'trading' || (state.tab === 'signals' && !state.signals?.length)
  );
  if (state.tab === 'screenshot') {
    root.appendChild(renderScreenshot());
  } else if (state.tab === 'signals') {
    root.appendChild(renderSignals());
  } else {
    root.appendChild(
      renderLocked({
        icon: icons.trading,
        title: 'Доступно в полной версии',
        subtitle: 'Сопровождение сделок и разбор точек входа — в полном доступе.',
      })
    );
  }
}

function render() {
  renderTabBar();
  renderContent();
}

// Флаг вне state: это транспорт, а не то, что рисуется. В state он вызывал бы
// лишние перерисовки на каждый старт запроса.
let signalsLoading = false;

async function loadSignals() {
  if (signalsLoading || state.signals !== null) return;
  signalsLoading = true;
  try {
    const data = await getSignals();
    setState({ signals: data.signals, hasAccess: data.hasAccess, signalsError: false });
  } catch {
    setState({ signalsError: true });
  } finally {
    signalsLoading = false;
  }
}

document.getElementById('tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  setState({ tab: button.dataset.tab });
  if (button.dataset.tab === 'signals') loadSignals();
});

const content = document.getElementById('content');

content.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="cta"]')) {
    openAccessChat(state.targetUrl);
    return;
  }
  if (event.target.closest('[data-action="go-screenshot"]')) {
    setState({ tab: 'screenshot' });
    return;
  }
  if (event.target.closest('[data-action="retry-signals"]')) {
    setState({ signalsError: false, signals: null });
    loadSignals();
  }
});

// Браузер по умолчанию открывает брошенный файл как страницу -- в вебвью это
// уводит из приложения без возврата. Гасим на уровне документа, а принимаем
// только внутри контента.
document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => event.preventDefault());

function setDragover(on) {
  document.querySelector('.dropzone')?.classList.toggle('dropzone--dragover', on);
}

// Дроп ловит вся область контента, а не пунктирный прямоугольник: промахнуться
// мышью легко, а «файл упал в никуда» -- худший исход.
content.addEventListener('dragover', (event) => {
  if (state.tab !== 'screenshot' || state.phase === 'analyzing') return;
  event.preventDefault();
  setDragover(true);
});

content.addEventListener('dragleave', (event) => {
  if (event.relatedTarget && content.contains(event.relatedTarget)) return;
  setDragover(false);
});

content.addEventListener('drop', (event) => {
  if (state.tab !== 'screenshot') return;
  event.preventDefault();
  setDragover(false);
  acceptFile(event.dataTransfer?.files?.[0]);
});

// Только на табе «Скриншот» и без автопереключения: вставка, телепортирующая
// пользователя с заглушки на другой экран, -- фокус, а не функция.
window.addEventListener('paste', (event) => {
  if (state.tab !== 'screenshot') return;
  const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.kind === 'file');
  if (!item) return;
  event.preventDefault();
  acceptFile(item.getAsFile());
});

subscribe(render);

async function init() {
  tg?.ready();
  tg?.expand();

  const [config, me] = await Promise.allSettled([getConfig(), getMe()]);

  const patch = { phase: 'idle' };
  if (config.status === 'fulfilled') patch.targetUrl = config.value.targetUrl;
  if (me.status === 'fulfilled') {
    patch.profile = me.value.user;
    patch.hasAccess = me.value.hasAccess;
    patch.teaserUsed = me.value.teaserUsed;
  } else {
    // Falling back to initDataUnsafe keeps the header populated when /api/me
    // is down.
    const unsafe = tg?.initDataUnsafe?.user;
    patch.profile = unsafe
      ? { telegramId: unsafe.id, firstName: unsafe.first_name, photoUrl: unsafe.photo_url ?? null }
      : null;
  }
  setState(patch);
}

init();
