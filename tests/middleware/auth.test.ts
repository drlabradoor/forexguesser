import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import { createAuthMiddleware } from '../../src/middleware/auth.js';

const BOT_TOKEN = 'test-bot-token';

function buildInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function buildApp() {
  const app = express();
  app.get('/protected', createAuthMiddleware(BOT_TOKEN), (req, res) => {
    res.json({ user: req.telegramUser });
  });
  return app;
}

describe('createAuthMiddleware', () => {
  it('attaches req.telegramUser and calls next for valid initData', async () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 5, first_name: 'Test' });
    const initData = buildInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const response = await request(buildApp()).get('/protected').set('X-Telegram-Init-Data', initData);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: 5, firstName: 'Test', username: undefined });
  });

  it('returns 401 when the header is missing', async () => {
    const response = await request(buildApp()).get('/protected');
    expect(response.status).toBe(401);
  });

  it('returns 401 when initData is invalid', async () => {
    const response = await request(buildApp()).get('/protected').set('X-Telegram-Init-Data', 'garbage=1');
    expect(response.status).toBe(401);
  });
});
