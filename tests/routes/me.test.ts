import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createMeHandler } from '../../src/routes/me.js';
import { generateBalance } from '../../src/balance.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(telegramId: number, extraUserFields: Record<string, unknown> = {}): string {
  const fields = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: telegramId, first_name: 'Max', ...extraUserFields }),
  };
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${(fields as any)[k]}`);
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(pairs.join('\n')).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let usersRepo: UsersRepo;
let app: express.Express;

beforeEach(async () => {
  usersRepo = new UsersRepo(await createTestDb());
  app = express();
  app.get('/api/me', createAuthMiddleware(BOT_TOKEN), createMeHandler(usersRepo));
});

describe('GET /api/me', () => {
  it('returns the profile, the generated balance and alreadyUsed=false for a new user', async () => {
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(10));

    expect(response.status).toBe(200);
    expect(response.body.alreadyUsed).toBe(false);
    expect(response.body.user).toEqual({ telegramId: 10, firstName: 'Max', photoUrl: null });
    expect(response.body.balance).toBe(generateBalance(10));
  });

  it('passes photo_url through as photoUrl', async () => {
    const initData = buildInitData(11, { photo_url: 'https://t.me/i/userpic/320/x.jpg' });
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', initData);

    expect(response.body.user.photoUrl).toBe('https://t.me/i/userpic/320/x.jpg');
  });

  it('prefers balanceOverride over the generated balance', async () => {
    await usersRepo.setBalanceOverride(12, 32688.59);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(12));

    expect(response.body.balance).toBe(32688.59);
  });

  it('reports alreadyUsed=true once the free run is spent', async () => {
    await usersRepo.markRunUsed(13);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(13));

    expect(response.body.alreadyUsed).toBe(true);
  });

  it('reports alreadyUsed=false for a spent run when unlimited access is granted', async () => {
    await usersRepo.markRunUsed(14);
    await usersRepo.setUnlimited(14, true);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(14));

    expect(response.body.alreadyUsed).toBe(false);
  });
});
