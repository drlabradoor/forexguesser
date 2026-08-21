import { state, setState } from '../state.js';
import { icons } from '../icons.js';
import { formatBalance, formatPrice, DEMO_BALANCE } from '../format.js';
import { ALLOWED_TYPES, prepareImage, ImageError } from '../image.js';
import { postAnalyze, ApiError } from '../api.js';
import { startStatusRotation } from '../statuses.js';

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

function errorFor(err) {
  if (err instanceof ImageError) {
    return { title: 'Не удалось прочитать изображение', text: 'Попробуйте другой скриншот.', action: 'retry' };
  }
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return {
        title: 'Бесплатный анализ уже использован',
        text: 'Полный доступ открывает неограниченный разбор графиков.',
        action: 'cta',
      };
    }
    if (err.status === 401) {
      return { title: 'Сессия устарела', text: 'Закройте и откройте приложение заново.', action: 'none' };
    }
    if (err.status === 400) {
      return { title: 'Не удалось прочитать изображение', text: 'Попробуйте другой скриншот.', action: 'retry' };
    }
  }
  return { title: 'Не удалось разобрать график', text: 'Попробуйте другой скриншот.', action: 'retry' };
}

async function runAnalysis() {
  setState({ phase: 'analyzing', error: null });
  const statusEl = document.querySelector('.analysis__status');
  const rotation = statusEl ? startStatusRotation(statusEl) : null;

  try {
    const prepared = await prepareImage(state.file);
    const data = await postAnalyze(prepared);
    if (rotation) await rotation.finish();
    setState({ phase: 'result', signal: data.signal });
  } catch (err) {
    if (rotation) await rotation.finish();
    setState({ phase: 'error', error: errorFor(err) });
  }
}

function renderAnalyzeButton() {
  const button = document.createElement('button');
  button.className = 'button button--primary';
  button.disabled = state.phase === 'analyzing';
  button.innerHTML =
    state.phase === 'analyzing'
      ? '<span class="spinner"></span>Анализ'
      : `${icons.camera}Анализировать скриншот`;
  button.addEventListener('click', runAnalysis);
  return button;
}

function renderAnalysisCard() {
  const card = document.createElement('section');
  card.className = 'analysis';
  card.innerHTML = `
    <div class="analysis__label">${icons.clock}Технический разбор</div>
    <div class="analysis__status"></div>
  `;
  return card;
}

const TREND = {
  bullish: { label: 'Вверх · BUY', modifier: 'up', icon: 'arrowUp' },
  bearish: { label: 'Вниз · SELL', modifier: 'down', icon: 'arrowDown' },
  neutral: { label: 'Нейтрально', modifier: 'flat', icon: 'clock' },
};

const MAX_KEY_POINTS = 5;

function renderResult() {
  const signal = state.signal;
  const trend = TREND[signal.trend] ?? TREND.neutral;

  const levels = [
    ['Вход', signal.entryPrice],
    ['Стоп-лосс', signal.stopLoss],
    ['ТП1', signal.takeProfit1],
    ['ТП2', signal.takeProfit2],
    ['ТП3', signal.takeProfit3],
  ];

  const keyPoints = (signal.keyPoints ?? []).slice(0, MAX_KEY_POINTS);

  const wrapper = document.createElement('section');
  wrapper.className = 'result';
  wrapper.innerHTML = `
    <div class="verdict verdict--${trend.modifier}">
      <span class="verdict__icon">${icons[trend.icon]}</span>
      <div class="verdict__label">${trend.label}</div>
      <div class="verdict__instrument">${signal.instrument ?? 'Инструмент не определён'}</div>
      <div class="badge">
        ${icons.clock}
        <span class="badge__label">Таймфрейм</span>
        <span class="badge__value">${signal.timeframe ?? 'не определён'}</span>
      </div>
    </div>

    <div class="levels">
      ${levels
        .map(
          ([label, value]) => `
        <div class="level">
          <div class="level__label">${label}</div>
          <div class="level__value">${formatPrice(value)}</div>
        </div>`
        )
        .join('')}
    </div>

    ${
      keyPoints.length
        ? `<div class="keypoints">
             <div class="keypoints__label">Ключевые признаки</div>
             ${keyPoints
               .map(
                 (point) => `
               <div class="keypoint keypoint--${point.status}">
                 <span class="keypoint__icon">${point.status === 'warn' ? icons.warn : icons.check}</span>
                 <span>${point.text}</span>
               </div>`
               )
               .join('')}
           </div>`
        : ''
    }

    <details class="breakdown">
      <summary class="breakdown__summary">Технический разбор</summary>
      <p class="breakdown__text">${signal.rationale}</p>
    </details>

    <button class="button button--primary" data-action="cta">Получить полный доступ</button>
  `;
  return wrapper;
}

function renderError() {
  const { title, text, action } = state.error;
  const card = document.createElement('section');
  card.className = 'errorbox';
  const button =
    action === 'cta'
      ? '<button class="button button--primary" data-action="cta">Получить полный доступ</button>'
      : action === 'retry'
        ? '<button class="button button--primary" data-action="retry">Попробовать снова</button>'
        : '';
  card.innerHTML = `
    <span class="errorbox__icon">${icons.warn}</span>
    <div class="errorbox__title">${title}</div>
    <p class="errorbox__text">${text}</p>
    ${button}
  `;
  card.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry"]')) {
      setState({ phase: state.file ? 'selected' : 'idle', error: null });
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

  if (state.phase === 'idle' || state.phase === 'loading') {
    section.appendChild(renderDropzone());
    return section;
  }

  if (state.previewUrl) section.appendChild(renderPreview());

  if (state.phase === 'selected' || state.phase === 'analyzing') {
    section.appendChild(renderAnalyzeButton());
  }
  if (state.phase === 'analyzing') {
    section.appendChild(renderAnalysisCard());
  }
  if (state.phase === 'result' && state.signal) {
    section.appendChild(renderResult());
  }
  if (state.phase === 'error' && state.error) {
    section.appendChild(renderError());
  }
  return section;
}
