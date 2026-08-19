import { Router } from 'express';
import type { Request, Response } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import type { AdminsRepo } from '../db/admins.repo.js';

export function createAdminRouter(usersRepo: UsersRepo, adminsRepo: AdminsRepo, ownerTelegramId: number): Router {
  const router = Router();

  router.get('/users', (_req: Request, res: Response) => {
    res.json({ users: usersRepo.listAll() });
  });

  router.post('/users/:telegramId/balance', (req: Request, res: Response) => {
    const telegramId = Number(req.params.telegramId);
    const { value } = req.body as { value: number | null };
    usersRepo.setBalanceOverride(telegramId, value);
    res.json({ ok: true });
  });

  router.post('/users/:telegramId/unlimited', (req: Request, res: Response) => {
    const telegramId = Number(req.params.telegramId);
    const { enabled } = req.body as { enabled: boolean };
    usersRepo.setUnlimited(telegramId, enabled);
    res.json({ ok: true });
  });

  router.post('/users/:telegramId/reset', (req: Request, res: Response) => {
    const telegramId = Number(req.params.telegramId);
    usersRepo.resetRun(telegramId);
    res.json({ ok: true });
  });

  router.post('/admins', (req: Request, res: Response) => {
    const telegramUser = req.telegramUser!;
    if (telegramUser.id !== ownerTelegramId) {
      res.status(403).json({ error: 'OWNER_ONLY' });
      return;
    }
    const { telegramId } = req.body as { telegramId: number };
    adminsRepo.add(telegramId, telegramUser.id);
    res.json({ ok: true });
  });

  return router;
}
