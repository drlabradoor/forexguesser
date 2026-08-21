import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

const REQUIRED_ENV = {
  BOT_TOKEN: 'bot-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
  OWNER_TELEGRAM_ID: '123',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  NIKOLAI_USERNAME: 'nikolai',
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
    expect(config.databaseUrl).toBe('postgres://user:pass@localhost:5432/db');
    expect(config.nikolaiUsername).toBe('nikolai');
    expect(config.appUrl).toBe('https://example.com');
    expect(config.port).toBe(3000);
  });

  it('strips a leading @ from NIKOLAI_USERNAME', () => {
    process.env.NIKOLAI_USERNAME = '@nikolai';
    expect(loadConfig().nikolaiUsername).toBe('nikolai');
  });

  it('throws when a required variable is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow('Missing required environment variable: DATABASE_URL');
  });
});
