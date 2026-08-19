import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { validateInitData } from '../../src/telegram/initData.js';

const BOT_TOKEN = 'test-bot-token-123';

function buildInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`);
  const dataCheckString = pairs.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

describe('validateInitData', () => {
  it('returns the parsed user for a validly signed initData string', () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 42, first_name: 'Dima', username: 'dima' });
    const initData = buildInitData({ auth_date: authDate, user }, BOT_TOKEN);

    const result = validateInitData(initData, BOT_TOKEN);

    expect(result).toEqual({ id: 42, firstName: 'Dima', username: 'dima' });
  });

  it('returns null when the hash was signed with the wrong bot token', () => {
    const authDate = String(Math.floor(Date.now() / 1000));
    const user = JSON.stringify({ id: 42, first_name: 'Dima' });
    const initData = buildInitData({ auth_date: authDate, user }, 'wrong-token');

    expect(validateInitData(initData, BOT_TOKEN)).toBeNull();
  });

  it('returns null when auth_date is older than maxAgeSeconds', () => {
    const oldAuthDate = String(Math.floor(Date.now() / 1000) - 100000);
    const user = JSON.stringify({ id: 42, first_name: 'Dima' });
    const initData = buildInitData({ auth_date: oldAuthDate, user }, BOT_TOKEN);

    expect(validateInitData(initData, BOT_TOKEN, 86400)).toBeNull();
  });

  it('returns null when the hash field is missing', () => {
    expect(validateInitData('auth_date=123&user=%7B%7D', BOT_TOKEN)).toBeNull();
  });
});
