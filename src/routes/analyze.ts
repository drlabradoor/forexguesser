import type { Request, Response, NextFunction } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import type { UsersRepo } from '../db/users.repo.js';
import type { SignalsRepo } from '../db/signals.repo.js';
import { analyzeChart } from '../claude/analyzeChart.js';
import { forViewer, hasAccess } from '../signals/visibility.js';

const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

function isAllowedMediaType(value: unknown): value is AllowedMediaType {
  return ALLOWED_MEDIA_TYPES.includes(value as AllowedMediaType);
}

export function createAnalyzeHandler(usersRepo: UsersRepo, signalsRepo: SignalsRepo, claude: Anthropic) {
  return async function analyzeHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const { imageBase64, mediaType } = req.body as { imageBase64?: string; mediaType?: string };

      if (!imageBase64 || !isAllowedMediaType(mediaType)) {
        res.status(400).json({ error: 'MISSING_IMAGE' });
        return;
      }

      const user = await usersRepo.getOrCreate(telegramUser.id);
      const access = hasAccess(user);

      // Тизер один на пользователя навсегда. Без этой проверки любой гоняет
      // vision-разборы бесконечно за наш счёт, не приближаясь к покупке:
      // результат он всё равно не увидит. Демо-режим проходит здесь как
      // доступ, поэтому дубль за дублем снимается без сброса через админку.
      if (!access && user.freeRunUsed) {
        res.status(403).json({ error: 'NO_ACCESS' });
        return;
      }

      // Короткий разбор -- единственный рычаг, заметно режущий задержку:
      // выходные токены генерируются последовательно, а входная картинка нет.
      // Платящий получает полный разбор, за него и платят.
      const signal = await analyzeChart(claude, imageBase64, mediaType, { brief: user.demoMode });
      const stored = await signalsRepo.save(telegramUser.id, signal);

      if (!access) {
        await usersRepo.markRunUsed(telegramUser.id);
      }

      res.json({ signal: forViewer(stored, access) });
    } catch (err) {
      next(err);
    }
  };
}
