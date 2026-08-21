import { state, setState, subscribe } from './state.js';
import { icons } from './icons.js';
import { getConfig, getMe } from './api.js';
import { renderScreenshot } from './screens/screenshot.js';
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
  if (state.tab === 'screenshot') {
    root.appendChild(renderScreenshot());
  } else if (state.tab === 'signals') {
    root.appendChild(
      renderLocked({
        icon: icons.signals,
        title: 'Доступно в полной версии',
        subtitle: 'История сигналов и уведомления о новых входах открываются вместе с полным доступом.',
      })
    );
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

document.getElementById('tabbar').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (button) setState({ tab: button.dataset.tab });
});

document.getElementById('content').addEventListener('click', (event) => {
  if (event.target.closest('[data-action="cta"]')) openAccessChat(state.targetUrl);
});

subscribe(render);

async function init() {
  tg?.ready();
  tg?.expand();

  const [config, me] = await Promise.allSettled([getConfig(), getMe()]);

  const patch = { phase: 'idle' };
  patch.balanceMode = localStorage.getItem('balanceMode') === 'demo' ? 'demo' : 'real';
  if (config.status === 'fulfilled') patch.targetUrl = config.value.targetUrl;
  if (me.status === 'fulfilled') {
    patch.profile = me.value.user;
    patch.balance = me.value.balance;
  } else {
    // Falling back to initDataUnsafe keeps the header populated when /api/me
    // is down; the balance card stays hidden rather than showing a lie.
    const unsafe = tg?.initDataUnsafe?.user;
    patch.profile = unsafe
      ? { telegramId: unsafe.id, firstName: unsafe.first_name, photoUrl: unsafe.photo_url ?? null }
      : null;
  }
  setState(patch);
}

init();
