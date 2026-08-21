import express from 'express';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import type { UsersRepo } from './db/users.repo.js';
import type { AdminsRepo } from './db/admins.repo.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRequireAdminMiddleware } from './middleware/requireAdmin.js';
import { createConfigHandler } from './routes/config.js';
import { createMeHandler } from './routes/me.js';
import { createAnalyzeHandler } from './routes/analyze.js';
import { createAdminRouter } from './routes/admin.js';

export interface AppDeps {
  usersRepo: UsersRepo;
  adminsRepo: AdminsRepo;
  claude: Anthropic;
  botToken: string;
  ownerTelegramId: number;
  targetUrl: string;
}

export function buildApp(deps: AppDeps): express.Express {
  const authMiddleware = createAuthMiddleware(deps.botToken);
  const requireAdmin = createRequireAdminMiddleware(deps.adminsRepo);

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use(express.static(path.join(process.cwd(), 'public')));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/config', createConfigHandler(deps.targetUrl));
  app.get('/api/me', authMiddleware, createMeHandler(deps.usersRepo));
  app.post('/api/analyze', authMiddleware, createAnalyzeHandler(deps.usersRepo, deps.claude));
  app.use(
    '/api/admin',
    authMiddleware,
    requireAdmin,
    createAdminRouter(deps.usersRepo, deps.adminsRepo, deps.ownerTelegramId)
  );

  return app;
}
