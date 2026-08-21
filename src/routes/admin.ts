import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import type { AdminsRepo } from '../db/admins.repo.js';

export function createAdminRouter(usersRepo: UsersRepo, adminsRepo: AdminsRepo, ownerTelegramId: number): Router {
  const router = Router();

  router.get('/users', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ users: await usersRepo.listAll() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:telegramId/balance', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const telegramId = Number(req.params.telegramId);
      const { value } = req.body as { value: number | null };
      await usersRepo.setBalanceOverride(telegramId, value);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:telegramId/unlimited', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const telegramId = Number(req.params.telegramId);
      const { enabled } = req.body as { enabled: boolean };
      await usersRepo.setUnlimited(telegramId, enabled);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users/:telegramId/reset', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const telegramId = Number(req.params.telegramId);
      await usersRepo.resetRun(telegramId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admins', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const telegramUser = req.telegramUser!;
      if (telegramUser.id !== ownerTelegramId) {
        res.status(403).json({ error: 'OWNER_ONLY' });
        return;
      }
      const { telegramId } = req.body as { telegramId: number };
      await adminsRepo.add(telegramId, telegramUser.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
