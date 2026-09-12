import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { SignalsRepo } from '../../src/db/signals.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createSignalsHandler } from '../../src/routes/signals.js';
import type { Signal } from '../../src/types.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(telegramId: number): string {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: 'T' }),
  };
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${(fields as any)[k]}`);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

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
  rationale: 'подробный разбор',
};

let usersRepo: UsersRepo;
let signalsRepo: SignalsRepo;
let app: express.Express;

beforeEach(async () => {
  const db = await createTestDb();
  usersRepo = new UsersRepo(db);
  signalsRepo = new SignalsRepo(db);
  app = express();
  app.get('/api/signals', createAuthMiddleware(BOT_TOKEN), createSignalsHandler(usersRepo, signalsRepo));
});

describe('GET /api/signals', () => {
  it('returns an empty history for a new user', async () => {
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(1));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hasAccess: false, signals: [] });
  });

  it('locks every signal for a user without access', async () => {
    await signalsRepo.save(2, SIGNAL);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(2));

    expect(response.body.hasAccess).toBe(false);
    expect(response.body.signals[0]).toMatchObject({ instrument: 'AUD/CHF', timeframe: 'M15', locked: true });
    expect(JSON.stringify(response.body)).not.toContain('подробный разбор');
    expect(JSON.stringify(response.body)).not.toContain('1.08234');
  });

  it('opens the history once access is granted', async () => {
    await signalsRepo.save(3, SIGNAL);
    await usersRepo.setUnlimited(3, true);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(3));

    expect(response.body.hasAccess).toBe(true);
    expect(response.body.signals[0]).toMatchObject({ trend: 'bullish', entryPrice: 1.08234, locked: false });
    expect(response.body.signals[0].rationale).toBe('подробный разбор');
  });

  it('closes the history again when access is revoked', async () => {
    await signalsRepo.save(4, SIGNAL);
    await usersRepo.setUnlimited(4, true);
    await usersRepo.setUnlimited(4, false);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(4));

    expect(response.body.hasAccess).toBe(false);
    expect(response.body.signals[0].locked).toBe(true);
    expect(response.body.signals[0].rationale).toBeUndefined();
  });

  it('never returns another user history', async () => {
    await signalsRepo.save(5, SIGNAL);
    await signalsRepo.save(6, SIGNAL);
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(5));

    expect(response.body.signals).toHaveLength(1);
  });

  it('caps the history at 50 entries', async () => {
    for (let i = 0; i < 55; i++) {
      await signalsRepo.save(7, SIGNAL);
    }
    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(7));

    expect(response.body.signals).toHaveLength(50);
  });
});

describe('GET /api/signals in demo mode', () => {
  it('opens the history without the unlimited flag', async () => {
    await signalsRepo.save(40, SIGNAL);
    await usersRepo.setDemoMode(40, true);

    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(40));

    expect(response.body.hasAccess).toBe(true);
    expect(response.body.signals[0].locked).toBe(false);
    expect(response.body.signals[0].rationale).toBe(SIGNAL.rationale);
  });

  it('closes it again when the flag is taken away', async () => {
    await signalsRepo.save(41, SIGNAL);
    await usersRepo.setDemoMode(41, true);
    await usersRepo.setDemoMode(41, false);

    const response = await request(app).get('/api/signals').set('X-Telegram-Init-Data', buildInitData(41));

    expect(response.body.hasAccess).toBe(false);
    expect(response.body.signals[0].locked).toBe(true);
    expect(response.body.signals[0].rationale).toBeUndefined();
  });
});
