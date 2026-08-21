import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createTestDb } from './helpers/testDb.js';
import { UsersRepo } from '../src/db/users.repo.js';
import { AdminsRepo } from '../src/db/admins.repo.js';
import { buildApp } from '../src/app.js';

let app: express.Express;

beforeEach(async () => {
  const db = await createTestDb();
  app = buildApp({
    usersRepo: new UsersRepo(db),
    adminsRepo: new AdminsRepo(db),
    claude: { messages: { create: vi.fn() } } as any,
    botToken: 'test-bot-token',
    ownerTelegramId: 1,
    targetUrl: 'https://t.me/targetuser',
    freeRunLimitEnabled: true,
    versionInfo: { version: '0.1.0', commit: '377d250', startedAt: '2026-08-21T13:30:00.000Z' },
  });
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

describe('full app wiring', () => {
  it('serves /api/config publicly', async () => {
    const response = await request(app).get('/api/config');
    expect(response.status).toBe(200);
    expect(response.body.targetUrl).toBe('https://t.me/targetuser');
  });

  it('rejects /api/me without initData', async () => {
    const response = await request(app).get('/api/me');
    expect(response.status).toBe(401);
  });

  it('serves the mini app shell', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<div id="app"');
  });

  it('serves the front-end modules', async () => {
    for (const path of ['/js/app.js', '/js/state.js', '/js/api.js', '/js/screens/screenshot.js']) {
      const response = await request(app).get(path);
      expect(response.status, path).toBe(200);
    }
  });
});
