import crypto from 'node:crypto';
import type { TelegramUser } from '../types.js';

export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs: string[] = [];
  for (const key of Array.from(params.keys()).sort()) {
    pairs.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSeconds) return null;

  const userJson = params.get('user');
  if (!userJson) return null;

  const parsed = JSON.parse(userJson) as { id: number; first_name: string; username?: string };
  return {
    id: parsed.id,
    firstName: parsed.first_name,
    username: parsed.username,
  };
}
