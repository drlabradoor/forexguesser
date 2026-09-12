import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { SignalsRepo } from '../../src/db/signals.repo.js';
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

function fakeClaudeReturning(signal: unknown) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'provide_signal', input: signal }] }),
    },
  } as any;
}

function buildApp(usersRepo: UsersRepo, signalsRepo: SignalsRepo, claude: any) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.post('/api/analyze', createAuthMiddleware(BOT_TOKEN), createAnalyzeHandler(usersRepo, signalsRepo, claude));
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
let signalsRepo: SignalsRepo;

beforeEach(async () => {
  const db = await createTestDb();
  usersRepo = new UsersRepo(db);
  signalsRepo = new SignalsRepo(db);
});

describe('POST /api/analyze', () => {
  it('returns a locked signal for the free teaser', async () => {
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    const response = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal).toMatchObject({ instrument: 'EUR/USD', timeframe: 'M15', locked: true });
    expect(response.body.signal.trend).toBeUndefined();
    expect(response.body.signal.entryPrice).toBeUndefined();
    expect(response.body.signal.rationale).toBeUndefined();
  });

  it('stores the signal even though the viewer cannot read it', async () => {
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(4))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    const stored = await signalsRepo.listByUser(4, 10);

    expect(stored).toHaveLength(1);
    expect(stored[0].signal.trend).toBe('bullish');
    expect(stored[0].signal.rationale).toBe('test rationale');
  });

  it('spends the teaser', async () => {
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(1))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect((await usersRepo.getOrCreate(1)).freeRunUsed).toBe(true);
  });

  it('returns 403 NO_ACCESS on the second attempt without access', async () => {
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(2))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(403);
    expect(second.body).toEqual({ error: 'NO_ACCESS' });
  });

  it('does not call Claude once the teaser is spent', async () => {
    const claude = fakeClaudeReturning(SAMPLE_SIGNAL);
    const app = buildApp(usersRepo, signalsRepo, claude);
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(12))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    await send();

    expect(claude.messages.create).toHaveBeenCalledTimes(1);
  });

  it('returns the full signal when access is granted', async () => {
    await usersRepo.setUnlimited(3, true);
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    const response = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(3))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.signal).toMatchObject({ trend: 'bullish', entryPrice: 1.1, locked: false });
  });

  it('never spends the teaser of a user with access', async () => {
    await usersRepo.setUnlimited(13, true);
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    const send = () =>
      request(app)
        .post('/api/analyze')
        .set('X-Telegram-Init-Data', buildInitData(13))
        .send({ imageBase64: 'abc', mediaType: 'image/png' });

    await send();
    const second = await send();

    expect(second.status).toBe(200);
    expect((await usersRepo.getOrCreate(13)).freeRunUsed).toBe(false);
  });

  it('accepts image/webp', async () => {
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    const response = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(8))
      .send({ imageBase64: 'abc', mediaType: 'image/webp' });

    expect(response.status).toBe(200);
  });

  it('returns 400 for an unsupported media type', async () => {
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    const response = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(9))
      .send({ imageBase64: 'abc', mediaType: 'image/gif' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'MISSING_IMAGE' });
  });

  it('returns 400 when imageBase64 is missing', async () => {
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));
    const response = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(5))
      .send({ mediaType: 'image/png' });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/analyze in demo mode', () => {
  it('runs again after the teaser was already spent', async () => {
    await usersRepo.markRunUsed(30);
    await usersRepo.setDemoMode(30, true);
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));

    const response = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(30))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.status).toBe(200);
  });

  it('returns the signal open, not behind the teaser', async () => {
    await usersRepo.setDemoMode(31, true);
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));

    const response = await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(31))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect(response.body.signal.locked).toBe(false);
    expect(response.body.signal.entryPrice).toBe(1.1);
  });

  it('does not spend the teaser, so takes can be repeated', async () => {
    await usersRepo.setDemoMode(32, true);
    const app = buildApp(usersRepo, signalsRepo, fakeClaudeReturning(SAMPLE_SIGNAL));

    await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(32))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    expect((await usersRepo.getOrCreate(32)).freeRunUsed).toBe(false);
  });

  it('asks the model for the short write-up', async () => {
    await usersRepo.setDemoMode(33, true);
    const claude = fakeClaudeReturning(SAMPLE_SIGNAL);
    const app = buildApp(usersRepo, signalsRepo, claude);

    await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(33))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    const sent = claude.messages.create.mock.calls[0][0];
    expect(sent.system).toContain('1-2 предложения');
    expect(sent.tools[0].input_schema.properties.key_points.maxItems).toBe(3);
  });

  it('still asks a paying user for the full write-up', async () => {
    await usersRepo.setUnlimited(34, true);
    const claude = fakeClaudeReturning(SAMPLE_SIGNAL);
    const app = buildApp(usersRepo, signalsRepo, claude);

    await request(app)
      .post('/api/analyze')
      .set('X-Telegram-Init-Data', buildInitData(34))
      .send({ imageBase64: 'abc', mediaType: 'image/png' });

    const sent = claude.messages.create.mock.calls[0][0];
    expect(sent.system).toContain('2-3 предложения');
    expect(sent.tools[0].input_schema.properties.key_points.maxItems).toBe(5);
  });
});
