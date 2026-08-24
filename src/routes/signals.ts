import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import type { SignalsRepo } from '../db/signals.repo.js';
import { forViewer } from '../signals/visibility.js';

/**
 * Потолок, который на практике не наступит: каждый разбор -- это ручной
 * скриншот. Нужен, чтобы ответ не распух, если кто-то устроит марафон.
 */
export const HISTORY_LIMIT = 50;

export function createSignalsHandler(usersRepo: UsersRepo, signalsRepo: SignalsRepo) {
  return async function signalsHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const user = await usersRepo.getOrCreate(telegramUser.id);
      const records = await signalsRepo.listByUser(telegramUser.id, HISTORY_LIMIT);

      // Доступ проверяется на каждом чтении: отзыв доступа должен закрывать
      // историю обратно, а не работать наполовину.
      res.json({
        hasAccess: user.unlimitedAccess,
        signals: records.map((record) => forViewer(record, user.unlimitedAccess)),
      });
    } catch (err) {
      next(err);
    }
  };
}
