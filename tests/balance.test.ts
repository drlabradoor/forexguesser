import { describe, it, expect } from 'vitest';
import { generateBalance } from '../src/balance.js';

describe('generateBalance', () => {
  it('returns the same balance for the same telegram id', () => {
    expect(generateBalance(8185867317)).toBe(generateBalance(8185867317));
  });

  it('stays within 5000 and 45000 with at most two decimals', () => {
    for (let id = 1; id <= 300; id++) {
      const value = generateBalance(id);
      expect(value).toBeGreaterThanOrEqual(5000);
      expect(value).toBeLessThanOrEqual(45000);
      expect(Number(value.toFixed(2))).toBe(value);
    }
  });

  it('produces different balances for different ids', () => {
    const values = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(generateBalance));
    expect(values.size).toBeGreaterThan(8);
  });

  it('produces fractional balances, not only round numbers', () => {
    const anyFractional = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((id) => !Number.isInteger(generateBalance(id)));
    expect(anyFractional).toBe(true);
  });
});
