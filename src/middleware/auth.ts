import type { Request, Response, NextFunction } from 'express';
import { validateInitData } from '../telegram/initData.js';
import type { TelegramUser } from '../types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      telegramUser?: TelegramUser;
    }
  }
}

export function createAuthMiddleware(botToken: string) {
  return function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const initData = req.header('X-Telegram-Init-Data');
    if (!initData) {
      res.status(401).json({ error: 'MISSING_INIT_DATA' });
      return;
    }
    const user = validateInitData(initData, botToken);
    if (!user) {
      res.status(401).json({ error: 'INVALID_INIT_DATA' });
      return;
    }
    req.telegramUser = user;
    next();
  };
}
