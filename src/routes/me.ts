import type { Request, Response } from 'express';
import type { UsersRepo } from '../db/users.repo.js';

export function createMeHandler(usersRepo: UsersRepo) {
  return function meHandler(req: Request, res: Response) {
    const telegramUser = req.telegramUser!;
    const user = usersRepo.getOrCreate(telegramUser.id);
    const alreadyUsed = user.freeRunUsed && !user.unlimitedAccess;
    res.json({ alreadyUsed });
  };
}
