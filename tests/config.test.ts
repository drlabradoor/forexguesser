import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

const REQUIRED_ENV = {
  BOT_TOKEN: 'bot-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
  OWNER_TELEGRAM_ID: '123',
  NIKOLAI_BOT_USERNAME: 'nikolai_bot',
  APP_URL: 'https://example.com',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, ...REQUIRED_ENV };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('reads all required fields', () => {
    const config = loadConfig();
    expect(config.botToken).toBe('bot-token');
    expect(config.ownerTelegramId).toBe(123);
    expect(config.nikolaiBotUsername).toBe('nikolai_bot');
    expect(config.appUrl).toBe('https://example.com');
    expect(config.port).toBe(3000);
    expect(config.dbPath).toBe('data.sqlite');
  });

  it('throws when a required variable is missing', () => {
    delete process.env.BOT_TOKEN;
    expect(() => loadConfig()).toThrow('Missing required environment variable: BOT_TOKEN');
  });
});
