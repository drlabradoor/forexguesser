import type { Request, Response, NextFunction } from 'express';
import type { UsersRepo } from '../db/users.repo.js';
import type { TelegramUser } from '../types.js';
import { hasAccess } from '../signals/visibility.js';

/** Имя вместо настоящего, когда приложение показывают на камеру. */
export const DEMO_FIRST_NAME = 'Трейдер';

interface ProfileView {
  telegramId: number | null;
  firstName: string;
  photoUrl: string | null;
}

/**
 * Подмена делается на сервере, а не скрытием на клиенте, по той же причине,
 * по которой на сервере держится пейволл: скрытое стилями имя всё равно
 * уезжает в разметку, а ролик снимается ровно с этого экрана.
 */
function profileFor(telegramUser: TelegramUser, demoMode: boolean): ProfileView {
  if (demoMode) {
    return { telegramId: null, firstName: DEMO_FIRST_NAME, photoUrl: null };
  }
  return {
    telegramId: telegramUser.id,
    firstName: telegramUser.firstName,
    photoUrl: telegramUser.photoUrl ?? null,
  };
}

export function createMeHandler(usersRepo: UsersRepo) {
  return async function meHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const user = await usersRepo.getOrCreate(telegramUser.id);
      res.json({
        user: profileFor(telegramUser, user.demoMode),
        hasAccess: hasAccess(user),
        // Клиенту нужно знать не «потрачен ли прогон», а можно ли жать кнопку:
        // иначе отказ стоил бы пользователю выгрузки мегабайта на мобильной связи.
        // В демо-режиме тизер не расходуется, значит и запрещать нечего.
        teaserUsed: user.demoMode ? false : user.freeRunUsed,
      });
    } catch (err) {
      next(err);
    }
  };
}
