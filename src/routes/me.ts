import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';

export function createMeHandler(usersRepo: UsersRepo) {
  return async function meHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const user = await usersRepo.getOrCreate(telegramUser.id);
      const alreadyUsed = user.freeRunUsed && !user.unlimitedAccess;
      res.json({ alreadyUsed });
    } catch (err) {
      next(err);
    }
  };
}
