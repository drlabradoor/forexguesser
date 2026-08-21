import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createTestDb } from '../helpers/testDb.js';
import { UsersRepo } from '../../src/db/users.repo.js';
import { AdminsRepo } from '../../src/db/admins.repo.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { createRequireAdminMiddleware } from '../../src/middleware/requireAdmin.js';
import { createAdminRouter } from '../../src/routes/admin.js';

const BOT_TOKEN = 'test-bot-token';
const OWNER_ID = 100;
const VERSION_INFO = {
  version: '0.1.0',
  commit: '377d250',
  commitSource: 'git-dir' as const,
  startedAt: '2026-08-21T13:30:00.000Z',
};

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

let usersRepo: UsersRepo;
let adminsRepo: AdminsRepo;
let app: express.Express;

beforeEach(async () => {
  const db = await createTestDb();
  usersRepo = new UsersRepo(db);
  adminsRepo = new AdminsRepo(db);
  await adminsRepo.add(OWNER_ID, null);

  app = express();
  app.use(express.json());
  app.use(
    '/api/admin',
    createAuthMiddleware(BOT_TOKEN),
    createRequireAdminMiddleware(adminsRepo),
    createAdminRouter(usersRepo, adminsRepo, OWNER_ID, VERSION_INFO)
  );
});

describe('admin routes', () => {
  it('rejects non-admins with 403', async () => {
    const response = await request(app).get('/api/admin/users').set('X-Telegram-Init-Data', buildInitData(1));
    expect(response.status).toBe(403);
  });

  it('lists users for an admin', async () => {
    await usersRepo.getOrCreate(1);
    const response = await request(app).get('/api/admin/users').set('X-Telegram-Init-Data', buildInitData(OWNER_ID));
    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
  });

  it('sets a balance override', async () => {
    const response = await request(app)
      .post('/api/admin/users/1/balance')
      .set('X-Telegram-Init-Data', buildInitData(OWNER_ID))
      .send({ value: 4242 });
    expect(response.status).toBe(200);
    expect((await usersRepo.getOrCreate(1)).balanceOverride).toBe(4242);
  });

  it('toggles unlimited access', async () => {
    await request(app)
      .post('/api/admin/users/1/unlimited')
      .set('X-Telegram-Init-Data', buildInitData(OWNER_ID))
      .send({ enabled: true });
    expect((await usersRepo.getOrCreate(1)).unlimitedAccess).toBe(true);
  });

  it('resets the free run flag', async () => {
    await usersRepo.markRunUsed(1);
    await request(app).post('/api/admin/users/1/reset').set('X-Telegram-Init-Data', buildInitData(OWNER_ID));
    expect((await usersRepo.getOrCreate(1)).freeRunUsed).toBe(false);
  });

  it('lets the owner add a new admin', async () => {
    const response = await request(app)
      .post('/api/admin/admins')
      .set('X-Telegram-Init-Data', buildInitData(OWNER_ID))
      .send({ telegramId: 55 });
    expect(response.status).toBe(200);
    expect(await adminsRepo.isAdmin(55)).toBe(true);
  });

  it('forbids a non-owner admin from adding a new admin', async () => {
    await adminsRepo.add(2, OWNER_ID);
    const response = await request(app)
      .post('/api/admin/admins')
      .set('X-Telegram-Init-Data', buildInitData(2))
      .send({ telegramId: 55 });
    expect(response.status).toBe(403);
    expect(await adminsRepo.isAdmin(55)).toBe(false);
  });

  it('reports the running version to an admin', async () => {
    const response = await request(app)
      .get('/api/admin/version')
      .set('X-Telegram-Init-Data', buildInitData(OWNER_ID));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(VERSION_INFO);
  });

  it('keeps the version behind the admin check', async () => {
    const response = await request(app)
      .get('/api/admin/version')
      .set('X-Telegram-Init-Data', buildInitData(999));

    expect(response.status).toBe(403);
  });
});
