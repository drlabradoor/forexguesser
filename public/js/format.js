export const DEMO_BALANCE = 10000;

const balanceFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBalance(value) {
  return `${balanceFormatter.format(value)} $`;
}

/**
 * Prices keep exactly the precision the model returned: a five-decimal forex
 * quote must not be rounded to two by a well-meaning toFixed.
 */
export function formatPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}
