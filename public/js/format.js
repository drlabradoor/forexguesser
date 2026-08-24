function isPrice(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function decimalsOf(value) {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * Prices keep every digit the model returned -- rounding 1.08234 to 1.08 is a
 * different price -- but trailing zeros are already gone by the time we see
 * the number, since 0.54680 parses to 0.5468. Left alone that leaves a ragged
 * column, so every level is padded out to the widest precision in the set:
 * nothing invented, nothing rounded away, and the digits line up.
 */
export function formatLevels(values) {
  const decimals = Math.max(0, ...values.filter(isPrice).map(decimalsOf));
  return values.map((value) => (isPrice(value) ? value.toFixed(decimals) : '—'));
}

const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });

/**
 * Относительные подписи для свежих записей: «сегодня» -- самый частый случай
 * в истории, которая пополняется вручную, и читается быстрее полной даты.
 */
export function formatSignalDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const time = timeFormatter.format(date);
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  if (date >= midnight) return `сегодня, ${time}`;
  if (date >= new Date(midnight.getTime() - 86400000)) return `вчера, ${time}`;
  return `${dayFormatter.format(date)}, ${time}`;
}
