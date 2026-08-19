const BASE_BALANCE = 1000;
const MIN_GROWTH_PERCENT = 30;
const MAX_GROWTH_PERCENT = 180;

export function generateBalance(): number {
  const growthPercent = MIN_GROWTH_PERCENT + Math.random() * (MAX_GROWTH_PERCENT - MIN_GROWTH_PERCENT);
  return Math.round(BASE_BALANCE * (1 + growthPercent / 100));
}
