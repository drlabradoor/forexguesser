import type { Request, Response, NextFunction } from 'express';
import type { AdminsRepo } from '../db/admins.repo.js';

export function createRequireAdminMiddleware(adminsRepo: AdminsRepo) {
  return function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const telegramUser = req.telegramUser;
    if (!telegramUser) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    adminsRepo
      .isAdmin(telegramUser.id)
      .then((isAdmin) => {
        if (!isAdmin) {
          res.status(403).json({ error: 'FORBIDDEN' });
          return;
        }
        next();
      })
      .catch(next);
  };
}
