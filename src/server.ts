import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { createPool, initSchema } from './db/db.js';
import { UsersRepo } from './db/users.repo.js';
import { AdminsRepo } from './db/admins.repo.js';
import { buildApp } from './app.js';
import { createBotPoller } from './telegram/bot.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const pool = createPool(config.databaseUrl);
  await initSchema(pool);

  const usersRepo = new UsersRepo(pool);
  const adminsRepo = new AdminsRepo(pool);
  await adminsRepo.add(config.ownerTelegramId, null);

  const app = buildApp({
    usersRepo,
    adminsRepo,
    claude: new Anthropic({ apiKey: config.anthropicApiKey }),
    botToken: config.botToken,
    ownerTelegramId: config.ownerTelegramId,
    targetUrl: `https://t.me/${config.targetUsername}`,
    freeRunLimitEnabled: config.freeRunLimitEnabled,
  });

  // Bind 0.0.0.0 explicitly: hosting platforms route to the container's
  // external interface, and a loopback-only listener answers nothing (502).
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Server listening on 0.0.0.0:${config.port}`);
  });

  if (!config.skipBotPolling) {
    createBotPoller(config.botToken, config.appUrl, adminsRepo).start();
  }
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
