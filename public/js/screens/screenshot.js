import { state, setState } from '../state.js';
import { icons } from '../icons.js';
import { formatLevels } from '../format.js';
import { ALLOWED_TYPES, prepareImage, ImageError } from '../image.js';
import { postAnalyze, ApiError } from '../api.js';
import { startScan } from '../scan.js';
import { BRAND } from '../brand.js';

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
  // В демо-режиме сервер не присылает ID вовсе -- строки просто нет, вместо
  // прочерка на её месте. Прочерк в кадре читался бы как поломка.
  const id = profile?.telegramId == null ? '' : `<div class="profile__id">ID ${profile.telegramId}</div>`;
  header.innerHTML = `
    ${avatar}
    <div class="profile__meta">
      <div class="profile__name">${profile?.firstName ?? 'Гость'}</div>
      ${id}
    </div>
    <div class="wordmark">${BRAND}</div>
  `;
  return header;
}

const DROPZONE_HINT =
  'В т.ч. с телефона: без логотипа, таймер учитывается. PNG, JPG, WebP до 5MB. ' +
  'На iPhone используйте скриншот, а не фото из галереи.';

/**
 * Единственная точка приёма файла: input, drop и вставка из буфера обмена
 * ведут сюда, чтобы проверка формата и освобождение прежнего previewUrl не
 * разъехались по трём копиям.
 */
export function acceptFile(file) {
  if (!file) return;
  if (state.phase === 'analyzing') return;
  if (!ALLOWED_TYPES.includes(file.type)) {
    setState({
      phase: 'error',
      error: { title: 'Неподдерживаемый формат', text: 'Подойдут PNG, JPG или WebP.', action: 'retry' },
    });
    return;
  }
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  setState({ phase: 'selected', file, previewUrl: URL.createObjectURL(file), signal: null, error: null });
}

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
    acceptFile(event.target.files[0]);
  });
  return zone;
}

/**
 * Оверлей лежит внутри `.shot`, а не в `.dropzone`: рамка обязана обводить
 * саму картинку, а картинка занимает только часть коробки и центрируется.
 */
const SCAN_OVERLAY = `
  <div class="scan">
    <div class="scan__beam"></div>
    <div class="scan__mark">${BRAND}</div>
    <div class="scan__foot">
      <div class="scan__phase">
        <div class="scan__title"></div>
        <div class="scan__subtitle"></div>
      </div>
      <div class="scan__percent">0%</div>
    </div>
  </div>
`;

function renderPreview() {
  const scanning = state.phase === 'analyzing';
  const box = document.createElement('section');
  box.className = 'dropzone dropzone--filled';
  box.innerHTML = `
    <div class="shot${scanning ? ' shot--scanning' : ''}">
      <img class="dropzone__preview" src="${state.previewUrl}" alt="" />
      ${scanning ? SCAN_OVERLAY : ''}
    </div>
  `;
  box.addEventListener('click', () => {
    // Во время анализа картинка -- не кнопка. Без этой проверки клик по ней
    // выбрасывал начатый разбор, а под оверлеем в неё как раз хочется ткнуть.
    if (state.phase === 'analyzing') return;
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
        title: 'Нужен полный доступ',
        text: 'Бесплатный разбор уже использован. Полный доступ открывает сигналы целиком.',
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

/**
 * Узлы ищутся заново на каждом тике, а не захватываются один раз: любой
 * `setState` перерисовывает экран целиком, и сохранённые ссылки указывали бы
 * на оторванные от документа элементы -- счётчик молча замирал бы.
 */
function paintScan({ percent, phase }) {
  const root = document.querySelector('.scan');
  if (!root) return;
  root.querySelector('.scan__percent').textContent = `${percent}%`;
  const title = root.querySelector('.scan__title');
  if (title.textContent === phase.title) return;
  title.textContent = phase.title;
  root.querySelector('.scan__subtitle').textContent = phase.subtitle;
}

async function runAnalysis() {
  setState({ phase: 'analyzing', error: null });
  const scan = startScan(paintScan);

  try {
    const prepared = await prepareImage(state.file);
    const data = await postAnalyze(prepared);
    // Ждём добега до 100%: оборванный на 63% счётчик читается как падение.
    await scan.finish();
    // Успешный закрытый разбор сам по себе означает, что тизер израсходован;
    // перезапрашивать /api/me ради факта, который только что произошёл, незачем.
    setState({
      phase: 'result',
      signal: data.signal,
      teaserUsed: state.hasAccess ? state.teaserUsed : true,
      signals: null, // история устарела, перезагрузится при открытии таба
    });
  } catch (err) {
    // На ошибке счётчик не догоняется: «100%» и следом «не удалось разобрать»
    // -- противоречие. Отказ должен приходить сразу.
    scan.stop();
    setState({ phase: 'error', error: errorFor(err) });
  }
}

function renderAnalyzeButton() {
  // Во время скана кнопки нет вовсе. Приглушить её мало: сплошная плита во всю
  // ширину перетягивает кадр на себя, а смотреть надо на картинку. Экран от
  // этого не прыгает -- кнопка лежит под изображением, и та остаётся на месте.
  if (state.phase === 'analyzing') return null;

  // Третье состояние: тизер потрачен, доступа нет. Кнопку анализа показывать
  // нечестно -- сервер всё равно ответит 403, а пользователь заплатит за это
  // выгрузкой картинки.
  if (!state.hasAccess && state.teaserUsed) {
    const cta = document.createElement('button');
    cta.className = 'button button--primary';
    cta.dataset.action = 'cta';
    cta.textContent = 'Получить полный доступ';
    return cta;
  }

  const button = document.createElement('button');
  button.className = 'button button--primary';
  button.innerHTML = `${icons.camera}Анализировать скриншот`;
  button.addEventListener('click', runAnalysis);
  return button;
}

const TREND = {
  bullish: { label: 'Вверх · BUY', modifier: 'up', icon: 'arrowUp' },
  bearish: { label: 'Вниз · SELL', modifier: 'down', icon: 'arrowDown' },
  neutral: { label: 'Нейтрально', modifier: 'flat', icon: 'clock' },
};

const MAX_KEY_POINTS = 5;

/**
 * Карточка сигнала без CTA: её же показывает история, где кнопка «получить
 * доступ» неуместна. Второй вариант карточки для истории был бы копией,
 * которая разойдётся.
 */
export function renderSignalCard(signal) {
  const trend = TREND[signal.trend] ?? TREND.neutral;

  const labels = ['Вход', 'Стоп-лосс', 'ТП1', 'ТП2', 'ТП3'];
  const formatted = formatLevels([
    signal.entryPrice,
    signal.stopLoss,
    signal.takeProfit1,
    signal.takeProfit2,
    signal.takeProfit3,
  ]);
  const levels = labels.map((label, index) => [label, formatted[index]]);

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
          <div class="level__value">${value}</div>
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
  `;
  return wrapper;
}

function renderResult() {
  const card = renderSignalCard(state.signal);
  card.insertAdjacentHTML(
    'beforeend',
    '<button class="button button--primary" data-action="cta">Получить полный доступ</button>'
  );
  return card;
}

/** Под окном тизера: доказательство, что график прочитан, и больше ничего. */
function renderLockedResult(signal) {
  const wrapper = document.createElement('section');
  wrapper.className = 'result';
  wrapper.innerHTML = `
    <div class="verdict verdict--flat">
      <span class="verdict__icon">${icons.lock}</span>
      <div class="verdict__label">Сигнал готов</div>
      <div class="verdict__instrument">${signal.instrument ?? 'Инструмент не определён'}</div>
      <div class="badge">
        ${icons.clock}
        <span class="badge__label">Таймфрейм</span>
        <span class="badge__value">${signal.timeframe ?? 'не определён'}</span>
      </div>
    </div>
  `;
  return wrapper;
}

function renderTeaser(signal) {
  // Распознанная пара живёт внутри окна, а не только в карточке под ним:
  // под затемнением она нечитаема ни на телефоне, ни на десктопе, а это
  // единственное доказательство, что график действительно прочитан.
  const pair = [signal.instrument ?? 'Инструмент не определён', signal.timeframe].filter(Boolean).join(' · ');

  const overlay = document.createElement('div');
  overlay.className = 'teaser';
  overlay.innerHTML = `
    <div class="teaser__box">
      <span class="teaser__icon">${icons.lock}</span>
      <div class="teaser__title">Сигнал готов</div>
      <div class="teaser__pair">${pair}</div>
      <p class="teaser__text">
        График разобран, уровни входа и защиты рассчитаны. Сигнал сохранён — он появится во вкладке «Сигналы»,
        как только вы откроете полный доступ.
      </p>
      <button class="button button--primary" data-action="cta">Получить полный доступ</button>
      <button class="button button--ghost" data-action="reset">Загрузить другой скриншот</button>
    </div>
  `;
  overlay.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="reset"]')) {
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      setState({ phase: 'idle', file: null, previewUrl: null, signal: null });
    }
  });
  return overlay;
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

/**
 * График и крупное название -- одна коробка, а не два элемента грида: вторым
 * элементом название встало бы в новую строку, то есть под всей карточкой
 * разбора, а не под графиком. Вне двухколоночной раскладки коробка объявлена
 * `display: contents` и на расстановку не влияет вовсе.
 */
function renderShotColumn() {
  const column = document.createElement('div');
  column.className = 'shotcol';
  column.appendChild(renderPreview());
  column.insertAdjacentHTML('beforeend', `<div class="bigmark">${BRAND}</div>`);
  return column;
}

export function renderScreenshot() {
  const section = document.createElement('section');
  // Маркер для CSS: двухколоночная раскладка на >=1000px включается только в
  // результате и только когда есть превью для левой колонки.
  // Закрытый результат в две колонки не раскладывается: справа нечего показать.
  section.className =
    state.phase === 'result' && state.previewUrl && !state.signal?.locked ? 'screen is-result' : 'screen';
  section.appendChild(renderProfile());

  if (state.phase === 'idle' || state.phase === 'loading') {
    section.appendChild(renderDropzone());
    return section;
  }

  if (state.previewUrl) section.appendChild(renderShotColumn());

  if (state.phase === 'selected' || state.phase === 'analyzing') {
    const button = renderAnalyzeButton();
    if (button) section.appendChild(button);
  }
  if (state.phase === 'result' && state.signal) {
    if (state.signal.locked) {
      section.appendChild(renderLockedResult(state.signal));
      section.appendChild(renderTeaser(state.signal));
    } else {
      section.appendChild(renderResult());
    }
  }
  if (state.phase === 'error' && state.error) {
    section.appendChild(renderError());
  }
  return section;
}
