import type { Request, Response } from 'express';

export function createConfigHandler(nikolaiUrl: string) {
  return function configHandler(_req: Request, res: Response) {
    res.json({ nikolaiUrl });
  };
}
