import { state, setState } from '../state.js';
import { icons } from '../icons.js';
import { formatBalance, DEMO_BALANCE } from '../format.js';

function initials(name) {
  return (name || '?').trim().slice(0, 1).toUpperCase();
}

function renderProfile() {
  const profile = state.profile;
  const header = document.createElement('header');
  header.className = 'profile';
  const avatar = profile?.photoUrl
    ? `<img class="profile__avatar" src="${profile.photoUrl}" alt="" />`
    : `<div class="profile__avatar profile__avatar--fallback">${initials(profile?.firstName)}</div>`;
  header.innerHTML = `
    ${avatar}
    <div class="profile__meta">
      <div class="profile__name">${profile?.firstName ?? 'Гость'}</div>
      <div class="profile__id">ID ${profile?.telegramId ?? '—'}</div>
    </div>
  `;
  return header;
}

function currentBalance() {
  return state.balanceMode === 'demo' ? DEMO_BALANCE : state.balance;
}

function animateBalance(el, target) {
  const duration = 800;
  const start = performance.now();
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatBalance(target * eased);
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function renderBalance() {
  if (state.balance === null) return null;
  const card = document.createElement('section');
  card.className = 'balance';
  card.innerHTML = `
    <div class="balance__top">
      <span class="balance__label">${icons.wallet}Баланс</span>
      <div class="balance__controls">
        <div class="chips">
          <button class="chip ${state.balanceMode === 'demo' ? 'is-active' : ''}" data-mode="demo">Демо</button>
          <button class="chip chip--real ${state.balanceMode === 'real' ? 'is-active' : ''}" data-mode="real">Реал</button>
        </div>
        <button class="icon-button" data-action="refresh-balance">${icons.refresh}</button>
      </div>
    </div>
    <div class="balance__value">0,00 $</div>
  `;

  const value = card.querySelector('.balance__value');
  animateBalance(value, currentBalance());

  card.addEventListener('click', (event) => {
    const chip = event.target.closest('[data-mode]');
    if (chip) {
      const mode = chip.dataset.mode;
      localStorage.setItem('balanceMode', mode);
      setState({ balanceMode: mode });
      return;
    }
    if (event.target.closest('[data-action="refresh-balance"]')) {
      animateBalance(value, currentBalance());
    }
  });

  return card;
}

export function renderScreenshot() {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(renderProfile());
  const balance = renderBalance();
  if (balance) section.appendChild(balance);
  return section;
}
