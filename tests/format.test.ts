import { describe, it, expect } from 'vitest';
import { formatSignalDate } from '../public/js/format.js';

function at(offsetDays: number, hours: number, minutes: number): string {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString();
}

describe('formatSignalDate', () => {
  it('labels today by time', () => {
    expect(formatSignalDate(at(0, 14, 32))).toBe('сегодня, 14:32');
  });

  it('labels just after midnight as today, not yesterday', () => {
    expect(formatSignalDate(at(0, 0, 5))).toBe('сегодня, 00:05');
  });

  it('labels yesterday', () => {
    expect(formatSignalDate(at(-1, 9, 12))).toBe('вчера, 09:12');
  });

  it('falls back to a day and month for older entries', () => {
    expect(formatSignalDate(at(-8, 9, 12))).toMatch(/^\d{2}\.\d{2}, 09:12$/);
  });

  it('returns an empty string for garbage', () => {
    expect(formatSignalDate('not a date')).toBe('');
  });
});
