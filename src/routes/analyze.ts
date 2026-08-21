import type { Request, Response, NextFunction } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import type { UsersRepo } from '../db/users.repo.js';
import { analyzeChart } from '../claude/analyzeChart.js';

const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

function isAllowedMediaType(value: unknown): value is AllowedMediaType {
  return ALLOWED_MEDIA_TYPES.includes(value as AllowedMediaType);
}

export function createAnalyzeHandler(usersRepo: UsersRepo, claude: Anthropic, freeRunLimitEnabled: boolean) {
  return async function analyzeHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const telegramUser = req.telegramUser!;
      const { imageBase64, mediaType } = req.body as { imageBase64?: string; mediaType?: string };

      if (!imageBase64 || !isAllowedMediaType(mediaType)) {
        res.status(400).json({ error: 'MISSING_IMAGE' });
        return;
      }

      const user = await usersRepo.getOrCreate(telegramUser.id);
      if (freeRunLimitEnabled && user.freeRunUsed && !user.unlimitedAccess) {
        res.status(403).json({ error: 'ALREADY_USED' });
        return;
      }

      const signal = await analyzeChart(claude, imageBase64, mediaType);

      // Recorded even while the limit is off, so flipping the flag back on
      // does not hand everyone a fresh free run.
      if (!user.unlimitedAccess) {
        await usersRepo.markRunUsed(telegramUser.id);
      }

      res.json({ signal });
    } catch (err) {
      next(err);
    }
  };
}
