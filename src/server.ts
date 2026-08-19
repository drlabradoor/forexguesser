import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { createDb } from './db/db.js';
import { UsersRepo } from './db/users.repo.js';
import { AdminsRepo } from './db/admins.repo.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRequireAdminMiddleware } from './middleware/requireAdmin.js';
import { createConfigHandler } from './routes/config.js';
import { createMeHandler } from './routes/me.js';
import { createAnalyzeHandler } from './routes/analyze.js';
import { createAdminRouter } from './routes/admin.js';
import { createBotPoller } from './telegram/bot.js';

const config = loadConfig();
const db = createDb(config.dbPath);
const usersRepo = new UsersRepo(db);
const adminsRepo = new AdminsRepo(db);
adminsRepo.add(config.ownerTelegramId, null);

const claude = new Anthropic({ apiKey: config.anthropicApiKey });
const authMiddleware = createAuthMiddleware(config.botToken);
const requireAdmin = createRequireAdminMiddleware(adminsRepo);
const nikolaiBotUrl = `https://t.me/${config.nikolaiBotUsername}`;

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.get('/api/config', createConfigHandler(nikolaiBotUrl));
app.get('/api/me', authMiddleware, createMeHandler(usersRepo));
app.post('/api/analyze', authMiddleware, createAnalyzeHandler(usersRepo, claude));
app.use('/api/admin', authMiddleware, requireAdmin, createAdminRouter(usersRepo, adminsRepo, config.ownerTelegramId));

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });

  if (!config.skipBotPolling) {
    createBotPoller(config.botToken, config.appUrl, adminsRepo).start();
  }
}

export { app };
