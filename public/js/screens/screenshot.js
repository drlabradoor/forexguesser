import { state, setState } from '../state.js';
import { icons } from '../icons.js';
import { formatBalance, DEMO_BALANCE } from '../format.js';
import { ALLOWED_TYPES } from '../image.js';

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

const DROPZONE_HINT =
  'В т.ч. с телефона: без логотипа, таймер учитывается. PNG, JPG, WebP до 5MB. ' +
  'На iPhone используйте скриншот, а не фото из галереи.';

function renderDropzone() {
  const zone = document.createElement('section');
  zone.className = 'dropzone';
  zone.innerHTML = `
    <label class="dropzone__inner" for="file-input">
      <span class="dropzone__icon">${icons.upload}</span>
      <span class="dropzone__title">Загрузите скриншот графика</span>
      <span class="dropzone__hint">${DROPZONE_HINT}</span>
    </label>
    <input type="file" id="file-input" accept="${ALLOWED_TYPES.join(',')}" />
  `;
  zone.querySelector('#file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setState({
        phase: 'error',
        error: { title: 'Неподдерживаемый формат', text: 'Подойдут PNG, JPG или WebP.', action: 'retry' },
      });
      return;
    }
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setState({ phase: 'selected', file, previewUrl: URL.createObjectURL(file), signal: null, error: null });
  });
  return zone;
}

function renderPreview() {
  const box = document.createElement('section');
  box.className = 'dropzone dropzone--filled';
  box.innerHTML = `<img class="dropzone__preview" src="${state.previewUrl}" alt="" />`;
  box.addEventListener('click', () => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    setState({ phase: 'idle', file: null, previewUrl: null });
  });
  return box;
}

export function renderScreenshot() {
  const section = document.createElement('section');
  section.className = 'screen';
  section.appendChild(renderProfile());
  const balance = renderBalance();
  if (balance) section.appendChild(balance);

  if (state.phase === 'idle' || state.phase === 'loading') {
    section.appendChild(renderDropzone());
  } else {
    section.appendChild(renderPreview());
  }
  return section;
}
