import { describe, it, expect } from 'vitest';
import { forViewer, hasAccess } from '../../src/signals/visibility.js';
import type { StoredSignal } from '../../src/types.js';

const RECORD: StoredSignal = {
  id: 7,
  telegramId: 42,
  createdAt: '2026-08-24T10:15:00.000Z',
  signal: {
    trend: 'bearish',
    instrument: 'AUD/CHF',
    timeframe: 'M15',
    entryPrice: 1.08234,
    stopLoss: 1.0791,
    takeProfit1: 1.0856,
    takeProfit2: 1.0879,
    takeProfit3: 1.0904,
    keyPoints: [{ text: 'пробой подтверждён', status: 'ok' }],
    rationale: 'подробный разбор',
  },
};

describe('forViewer without access', () => {
  it('exposes exactly id, createdAt, instrument, timeframe and locked', () => {
    const view = forViewer(RECORD, false);

    expect(Object.keys(view).sort()).toEqual(['createdAt', 'id', 'instrument', 'locked', 'timeframe']);
  });

  it('leaks no part of the signal itself', () => {
    const serialised = JSON.stringify(forViewer(RECORD, false));

    expect(serialised).not.toContain('bearish');
    expect(serialised).not.toContain('1.08234');
    expect(serialised).not.toContain('подробный разбор');
    expect(serialised).not.toContain('пробой подтверждён');
  });

  it('keeps the proof that the chart was read', () => {
    const view = forViewer(RECORD, false);

    expect(view).toMatchObject({ id: 7, instrument: 'AUD/CHF', timeframe: 'M15', locked: true });
  });

  it('passes nulls through when the chart was unreadable', () => {
    const record = { ...RECORD, signal: { ...RECORD.signal, instrument: null, timeframe: null } };

    expect(forViewer(record, false)).toMatchObject({ instrument: null, timeframe: null, locked: true });
  });
});

describe('forViewer with access', () => {
  it('returns the whole signal plus id, createdAt and locked=false', () => {
    const view = forViewer(RECORD, true);

    expect(view).toEqual({
      id: 7,
      createdAt: '2026-08-24T10:15:00.000Z',
      locked: false,
      ...RECORD.signal,
    });
  });

  it('never exposes the telegram id', () => {
    expect(Object.keys(forViewer(RECORD, true))).not.toContain('telegramId');
  });
});

describe('hasAccess', () => {
  it('opens the signal for a user granted unlimited access', () => {
    expect(hasAccess({ unlimitedAccess: true, demoMode: false })).toBe(true);
  });

  it('opens the signal for the demo account used to record the promo', () => {
    expect(hasAccess({ unlimitedAccess: false, demoMode: true })).toBe(true);
  });

  it('keeps it closed for a plain user', () => {
    expect(hasAccess({ unlimitedAccess: false, demoMode: false })).toBe(false);
  });
});
