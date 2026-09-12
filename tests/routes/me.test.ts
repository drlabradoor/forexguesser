import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createMeHandler } from '../../src/routes/me.js';

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
  it('returns the profile with no access and an unspent teaser for a new user', async () => {
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(10));

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ telegramId: 10, firstName: 'Max', photoUrl: null });
    expect(response.body.hasAccess).toBe(false);
    expect(response.body.teaserUsed).toBe(false);
    expect(response.body.alreadyUsed).toBeUndefined();
  });

  it('passes photo_url through as photoUrl', async () => {
    const initData = buildInitData(11, { photo_url: 'https://t.me/i/userpic/320/x.jpg' });
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', initData);

    expect(response.body.user.photoUrl).toBe('https://t.me/i/userpic/320/x.jpg');
  });

  it('reports a spent teaser', async () => {
    await usersRepo.markRunUsed(13);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(13));

    expect(response.body.teaserUsed).toBe(true);
    expect(response.body.hasAccess).toBe(false);
  });

  it('reports access independently of the spent teaser', async () => {
    await usersRepo.markRunUsed(14);
    await usersRepo.setUnlimited(14, true);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(14));

    expect(response.body.hasAccess).toBe(true);
    expect(response.body.teaserUsed).toBe(true);
  });
});

describe('GET /api/me in demo mode', () => {
  it('replaces the real name and drops the avatar', async () => {
    await usersRepo.setDemoMode(20, true);
    const initData = buildInitData(20, { photo_url: 'https://t.me/i/userpic/320/x.jpg' });
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', initData);

    expect(response.body.user.firstName).toBe('Трейдер');
    expect(response.body.user.photoUrl).toBeNull();
  });

  it('never lets the telegram id reach the page', async () => {
    await usersRepo.setDemoMode(21, true);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(21));

    // Именно не доезжает до клиента, а не прячется стилями: ролик снимается
    // с этого экрана, и скрытое разметкой всё равно лежало бы в ответе.
    expect(response.body.user.telegramId).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('21');
  });

  it('grants access without the unlimited flag', async () => {
    await usersRepo.setDemoMode(22, true);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(22));

    expect(response.body.hasAccess).toBe(true);
  });

  it('reports an unspent teaser even after a run, so takes can be repeated', async () => {
    await usersRepo.markRunUsed(23);
    await usersRepo.setDemoMode(23, true);
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(23));

    expect(response.body.teaserUsed).toBe(false);
  });

  it('leaves a normal user untouched', async () => {
    const response = await request(app).get('/api/me').set('X-Telegram-Init-Data', buildInitData(24));

    expect(response.body.user).toEqual({ telegramId: 24, firstName: 'Max', photoUrl: null });
    expect(response.body.hasAccess).toBe(false);
  });
});
