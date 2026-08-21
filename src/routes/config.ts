import type { Request, Response } from 'express';

export function createConfigHandler(targetUrl: string) {
  return function configHandler(_req: Request, res: Response) {
    res.json({ targetUrl });
  };
}
