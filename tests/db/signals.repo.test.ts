import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/testDb.js';
import { SignalsRepo } from '../../src/db/signals.repo.js';
import type { Signal } from '../../src/types.js';

const SIGNAL: Signal = {
  trend: 'bullish',
  instrument: 'AUD/CHF',
  timeframe: 'M15',
  entryPrice: 1.08234,
  stopLoss: 1.0791,
  takeProfit1: 1.0856,
  takeProfit2: 1.0879,
  takeProfit3: 1.0904,
  keyPoints: [{ text: 'пробой подтверждён', status: 'ok' }],
  rationale: 'разбор',
};

let repo: SignalsRepo;

beforeEach(async () => {
  repo = new SignalsRepo(await createTestDb());
});

describe('SignalsRepo', () => {
  it('returns the stored signal with an id and a timestamp', async () => {
    const stored = await repo.save(42, SIGNAL);

    expect(stored.telegramId).toBe(42);
    expect(stored.signal).toEqual(SIGNAL);
    expect(typeof stored.id).toBe('number');
    expect(Number.isNaN(Date.parse(stored.createdAt))).toBe(false);
  });

  it('round-trips every field through the payload column', async () => {
    const stored = await repo.save(42, SIGNAL);
    const [read] = await repo.listByUser(42, 10);

    expect(read.signal).toEqual(stored.signal);
    expect(read.signal.keyPoints[0].text).toBe('пробой подтверждён');
  });

  it('lists newest first even when timestamps collide', async () => {
    const first = await repo.save(1, { ...SIGNAL, instrument: 'A/A' });
    const second = await repo.save(1, { ...SIGNAL, instrument: 'B/B' });
    const third = await repo.save(1, { ...SIGNAL, instrument: 'C/C' });

    const list = await repo.listByUser(1, 10);

    expect(list.map((row) => row.signal.instrument)).toEqual(['C/C', 'B/B', 'A/A']);
    expect(list.map((row) => row.id)).toEqual([third.id, second.id, first.id]);
  });

  it('honours the limit', async () => {
    await repo.save(2, SIGNAL);
    await repo.save(2, SIGNAL);
    await repo.save(2, SIGNAL);

    expect(await repo.listByUser(2, 2)).toHaveLength(2);
  });

  it('never returns another user signals', async () => {
    await repo.save(10, SIGNAL);
    await repo.save(11, SIGNAL);

    const list = await repo.listByUser(10, 10);

    expect(list).toHaveLength(1);
    expect(list[0].telegramId).toBe(10);
  });

  it('returns an empty list for a user without signals', async () => {
    expect(await repo.listByUser(999, 10)).toEqual([]);
  });
});
