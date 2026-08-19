import { describe, it, expect } from 'vitest';
import { generateBalance } from '../src/balance.js';

describe('generateBalance', () => {
  it('returns a whole number between 1300 and 2800', () => {
    for (let i = 0; i < 200; i++) {
      const value = generateBalance();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1300);
      expect(value).toBeLessThanOrEqual(2800);
    }
  });
});
