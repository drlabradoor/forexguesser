export interface Config {
  port: number;
  botToken: string;
  anthropicApiKey: string;
  ownerTelegramId: number;
  dbPath: string;
  nikolaiBotUsername: string;
  appUrl: string;
  skipBotPolling: boolean;
}

const REQUIRED_KEYS = ['BOT_TOKEN', 'ANTHROPIC_API_KEY', 'OWNER_TELEGRAM_ID', 'NIKOLAI_BOT_USERNAME', 'APP_URL'];

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
    dbPath: process.env.DB_PATH ?? 'data.sqlite',
    nikolaiBotUsername: process.env.NIKOLAI_BOT_USERNAME!,
    appUrl: process.env.APP_URL!,
    skipBotPolling: process.env.SKIP_BOT_POLLING === 'true',
  };
}
