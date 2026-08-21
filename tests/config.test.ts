import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

const REQUIRED_ENV = {
  BOT_TOKEN: 'bot-token',
  ANTHROPIC_API_KEY: 'anthropic-key',
  OWNER_TELEGRAM_ID: '123',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  TARGET_USERNAME: 'targetuser',
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
    expect(config.targetUsername).toBe('targetuser');
    expect(config.appUrl).toBe('https://example.com');
    expect(config.port).toBe(3000);
  });

  it('strips a leading @ from TARGET_USERNAME', () => {
    process.env.TARGET_USERNAME = '@targetuser';
    expect(loadConfig().targetUsername).toBe('targetuser');
  });

  it('throws when a required variable is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow('Missing required environment variable: DATABASE_URL');
  });

  it('enables the free run limit by default', () => {
    delete process.env.FREE_RUN_LIMIT_ENABLED;
    expect(loadConfig().freeRunLimitEnabled).toBe(true);
  });

  it('disables the free run limit only for the literal "false"', () => {
    process.env.FREE_RUN_LIMIT_ENABLED = 'false';
    expect(loadConfig().freeRunLimitEnabled).toBe(false);
  });

  it('keeps the limit enabled for any other value', () => {
    process.env.FREE_RUN_LIMIT_ENABLED = 'true';
    expect(loadConfig().freeRunLimitEnabled).toBe(true);
    process.env.FREE_RUN_LIMIT_ENABLED = 'no';
    expect(loadConfig().freeRunLimitEnabled).toBe(true);
  });
});
