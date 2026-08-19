import type { Request, Response } from 'express';

export function createConfigHandler(nikolaiBotUrl: string) {
  return function configHandler(_req: Request, res: Response) {
    res.json({ nikolaiBotUrl });
  };
}
