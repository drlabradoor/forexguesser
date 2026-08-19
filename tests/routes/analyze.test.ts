import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createDb } from '../../src/db/db.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createAnalyzeHandler } from '../../src/routes/analyze.js';

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

function buildApp(usersRepo: UsersRepo, signal: unknown) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  const fakeClaude = {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'provide_signal', input: signal }] }),
    },
  } as any;
  app.post('/api/analyze', createAuthMiddleware(BOT_TOKEN), createAnalyzeHandler(usersRepo, fakeClaude));
  return app;
}

const SAMPLE_SIGNAL = {
  trend: 'bullish',
  entry_price: 1.1,
  stop_loss: 1.09,
  take_profit_1: 1.11,
  take_profit_2: 1.12,
  take_profit_3: 1.13,
  rationale: 'test rationale',
};

let usersRepo: UsersRepo;

beforeEach(() => {
  usersRepo = new UsersRepo(createDb(':memory:'));
});

describe('POST /api/analyze', () => {
  it('returns a signal and balance on first use', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal.trend).toBe('bullish');
    expect(typeof response.body.balance).toBe('number');
    expect(usersRepo.getOrCreate(1).freeRunUsed).toBe(true);
  });

  it('returns 403 ALREADY_USED on the second attempt', async () => {
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(2))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    const second = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(2))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(second.status).toBe(403);
    expect(second.body).toEqual({ error: 'ALREADY_USED' });
  });

  it('allows repeated use when unlimited_access is set', async () => {
    usersRepo.setUnlimited(3, true);
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(3))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    const second = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(3))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(second.status).toBe(200);
  });

  it('uses balanceOverride instead of a random balance when set', async () => {
    usersRepo.setBalanceOverride(4, 9999);
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(4))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.body.balance).toBe(9999);
  });

  it('returns 400 when imageBase64 is missing', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(5))
      .send({ mediaType: 'image/png' });

    expect(response.status).toBe(400);
  });
});
