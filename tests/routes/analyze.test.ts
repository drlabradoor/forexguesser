import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
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

function buildApp(usersRepo: UsersRepo, signal: unknown, freeRunLimitEnabled = true) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  const fakeClaude = {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'provide_signal', input: signal }] }),
    },
  } as any;
  app.post(
    '/api/analyze',
    createAuthMiddleware(BOT_TOKEN),
    createAnalyzeHandler(usersRepo, fakeClaude, freeRunLimitEnabled)
  );
  return app;
}

const SAMPLE_SIGNAL = {
  trend: 'bullish',
  instrument: 'EUR/USD',
  timeframe: 'M15',
  entry_price: 1.1,
  stop_loss: 1.09,
  take_profit_1: 1.11,
  take_profit_2: 1.12,
  take_profit_3: 1.13,
  key_points: [{ text: 'a', status: 'ok' }],
  rationale: 'test rationale',
};

let usersRepo: UsersRepo;

beforeEach(async () => {
  usersRepo = new UsersRepo(await createTestDb());
});

describe('POST /api/analyze', () => {
  it('returns the signal without a balance on first use', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal.trend).toBe('bullish');
    expect(response.body.signal.instrument).toBe('EUR/USD');
    expect(response.body.balance).toBeUndefined();
    expect((await usersRepo.getOrCreate(1)).freeRunUsed).toBe(true);
  });

  it('returns 403 ALREADY_USED on the second attempt', async () => {
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(2))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(403);
    expect(second.body).toEqual({ error: 'ALREADY_USED' });
  });

  it('allows a second attempt when the limit is disabled', async () => {
    const app = buildApp(usersRepo, SAMPLE_SIGNAL, false);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(6))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(200);
  });

  it('still records the spent run while the limit is disabled', async () => {
    await request(buildApp(usersRepo, SAMPLE_SIGNAL, false))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(7))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect((await usersRepo.getOrCreate(7)).freeRunUsed).toBe(true);
  });

  it('allows repeated use when unlimited_access is set', async () => {
    await usersRepo.setUnlimited(3, true);
    const app = buildApp(usersRepo, SAMPLE_SIGNAL);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(3))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(200);
  });

  it('accepts image/webp', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(8))
      .send({ imageBase64: 'abc', mediaType: 'image/webp' });

    expect(response.status).toBe(200);
  });

  it('returns 400 for an unsupported media type', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(9))
      .send({ imageBase64: 'abc', mediaType: 'image/gif' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'MISSING_IMAGE' });
  });

  it('returns 400 when imageBase64 is missing', async () => {
    const response = await request(buildApp(usersRepo, SAMPLE_SIGNAL))
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(5))
      .send({ mediaType: 'image/png' });

    expect(response.status).toBe(400);
  });
});
