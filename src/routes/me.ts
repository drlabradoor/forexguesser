import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';

export function createMeHandler(usersRepo: UsersRepo) {
  return async function meHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const user = await usersRepo.getOrCreate(telegramUser.id);
      res.json({
        user: {
          telegramId: telegramUser.id,
          firstName: telegramUser.firstName,
          photoUrl: telegramUser.photoUrl ?? null,
        },
        hasAccess: user.unlimitedAccess,
        // Клиенту нужно знать не «потрачен ли прогон», а можно ли жать кнопку:
        // иначе отказ стоил бы пользователю выгрузки мегабайта на мобильной связи.
        teaserUsed: user.freeRunUsed,
      });
    } catch (err) {
      next(err);
    }
  };
}
