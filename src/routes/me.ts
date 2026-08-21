import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import { generateBalance } from '../balance.js';

export function createMeHandler(usersRepo: UsersRepo) {
  return async function meHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const user = await usersRepo.getOrCreate(telegramUser.id);
      res.json({
        alreadyUsed: user.freeRunUsed && !user.unlimitedAccess,
        user: {
          telegramId: telegramUser.id,
          firstName: telegramUser.firstName,
          photoUrl: telegramUser.photoUrl ?? null,
        },
        balance: user.balanceOverride ?? generateBalance(telegramUser.id),
      });
    } catch (err) {
      next(err);
    }
  };
}
