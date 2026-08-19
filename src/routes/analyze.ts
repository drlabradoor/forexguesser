import type { Request, Response } from 'express';
import type Anthropic from '@anthropic-ai/sdk';
import type { UsersRepo } from '../db/users.repo.js';
import { analyzeChart } from '../claude/analyzeChart.js';
import { generateBalance } from '../balance.js';

export function createAnalyzeHandler(usersRepo: UsersRepo, claude: Anthropic) {
  return async function analyzeHandler(req: Request, res: Response) {
    const telegramUser = req.telegramUser!;
    const { imageBase64, mediaType } = req.body as {
      imageBase64?: string;
      mediaType?: 'image/png' | 'image/jpeg';
    };

    if (!imageBase64 || !mediaType) {
      res.status(400).json({ error: 'MISSING_IMAGE' });
      return;
    }

    const user = usersRepo.getOrCreate(telegramUser.id);
    if (user.freeRunUsed && !user.unlimitedAccess) {
      res.status(403).json({ error: 'ALREADY_USED' });
      return;
    }

    const signal = await analyzeChart(claude, imageBase64, mediaType);
    const balance = user.balanceOverride ?? generateBalance();

    if (!user.unlimitedAccess) {
      usersRepo.markRunUsed(telegramUser.id);
    }

    res.json({ signal, balance });
  };
}
