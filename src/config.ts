export interface Config {
  port: number;
  botToken: string;
  anthropicApiKey: string;
  ownerTelegramId: number;
  databaseUrl: string;
  databaseSsl: boolean;
  targetUsername: string;
  appUrl: string;
  skipBotPolling: boolean;
}

const REQUIRED_KEYS = [
  'BOT_TOKEN',
  'ANTHROPIC_API_KEY',
  'OWNER_TELEGRAM_ID',
  'DATABASE_URL',
  'TARGET_USERNAME',
  'APP_URL',
];

export function loadConfig(): Config {
  for (const key of REQUIRED_KEYS) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  return {
    port: Number(process.env.PORT ?? 3000),
    botToken: process.env.BOT_TOKEN!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    ownerTelegramId: Number(process.env.OWNER_TELEGRAM_ID),
    databaseUrl: process.env.DATABASE_URL!,
    databaseSsl: process.env.DATABASE_SSL === 'true',
    targetUsername: process.env.TARGET_USERNAME!.replace(/^@/, ''),
    appUrl: process.env.APP_URL!,
    skipBotPolling: process.env.SKIP_BOT_POLLING === 'true',
  };
}
