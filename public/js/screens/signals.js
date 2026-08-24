import { state, setState } from '../state.js';
import { icons } from '../icons.js';
import { formatSignalDate } from '../format.js';
import { renderSignalCard } from './screenshot.js';
import { renderLocked } from './locked.js';

const BADGE = {
  bullish: { label: 'BUY', modifier: 'up' },
  bearish: { label: 'SELL', modifier: 'down' },
  neutral: { label: 'FLAT', modifier: 'flat' },
};

function renderRow(signal) {
  const row = document.createElement('div');
  row.className = 'sigrow-wrap';

  const title = [signal.instrument ?? 'Инструмент не определён', signal.timeframe].filter(Boolean).join(' · ');
  const badge = BADGE[signal.trend] ?? BADGE.neutral;

  const right = signal.locked
    ? `<span class="sigrow__lock">${icons.lock}</span>`
    : `<span class="sigrow__badge sigrow__badge--${badge.modifier}">${badge.label}</span>`;

  row.innerHTML = `
    <button class="sigrow" data-signal="${signal.id}">
      <span class="sigrow__meta">
        <span class="sigrow__title">${title}</span>
        <span class="sigrow__date">${formatSignalDate(signal.createdAt)}</span>
      </span>
      ${right}
    </button>
  `;

  if (!signal.locked && state.expandedSignalId === signal.id) {
    const card = renderSignalCard(signal);
    card.classList.add('sigrow__card');
    row.appendChild(card);
  }

  row.addEventListener('click', (event) => {
    if (!event.target.closest('[data-signal]')) return;
    // Закрытая строка не раскрывается: раскрывать нечего, и клик, который
    // ничего не делает, читается как поломка.
    if (signal.locked) return;
    setState({ expandedSignalId: state.expandedSignalId === signal.id ? null : signal.id });
  });

  return row;
}

function renderError() {
  const card = document.createElement('section');
  card.className = 'errorbox';
  card.innerHTML = `
    <span class="errorbox__icon">${icons.warn}</span>
    <div class="errorbox__title">Не удалось загрузить сигналы</div>
    <p class="errorbox__text">Проверьте соединение и попробуйте снова.</p>
    <button class="button button--primary" data-action="retry-signals">Попробовать снова</button>
  `;
  return card;
}

export function renderSignals() {
  if (state.signalsError) return renderError();

  // null = запрос ещё не вернулся. Спиннера нет намеренно: на любой живой сети
  // он успел бы только мигнуть.
  if (state.signals === null) return document.createElement('div');

  if (state.signals.length === 0) {
    return state.hasAccess
      ? renderLocked({
          icon: icons.signals,
          title: 'Здесь появятся твои сигналы',
          subtitle: 'Загрузите скриншот графика — разбор сохранится и останется в этой вкладке.',
          buttonLabel: 'Загрузить скриншот',
          action: 'go-screenshot',
        })
      : renderLocked({
          icon: icons.signals,
          title: 'Доступно в полной версии',
          subtitle: 'История сигналов и уведомления о новых входах открываются вместе с полным доступом.',
        });
  }

  const section = document.createElement('section');
  section.className = 'siglist';
  for (const signal of state.signals) {
    section.appendChild(renderRow(signal));
  }

  if (!state.hasAccess) {
    section.insertAdjacentHTML(
      'beforeend',
      `<p class="siglist__note">Сигналы сохранены. Откройте полный доступ, чтобы прочитать их целиком.</p>
       <button class="button button--primary" data-action="cta">Получить полный доступ</button>`
    );
  }

  return section;
}
