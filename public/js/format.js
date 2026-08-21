export const DEMO_BALANCE = 10000;

const balanceFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBalance(value) {
  return `${balanceFormatter.format(value)} $`;
}

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
