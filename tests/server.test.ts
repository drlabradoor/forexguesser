import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

beforeAll(() => {
  process.env.BOT_TOKEN = 'test-bot-token';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.OWNER_TELEGRAM_ID = '1';
  process.env.NIKOLAI_BOT_USERNAME = 'nikolai_bot';
  process.env.APP_URL = 'https://example.com';
  process.env.DB_PATH = ':memory:';
  process.env.SKIP_BOT_POLLING = 'true';
});

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const { app } = await import('../src/server.js');
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

describe('full app wiring', () => {
  it('serves /api/config publicly', async () => {
    const { app } = await import('../src/server.js');
    const response = await request(app).get('/api/config');
    expect(response.status).toBe(200);
    expect(response.body.nikolaiBotUrl).toBe('https://t.me/nikolai_bot');
  });

  it('rejects /api/me without initData', async () => {
    const { app } = await import('../src/server.js');
    const response = await request(app).get('/api/me');
    expect(response.status).toBe(401);
  });
});
