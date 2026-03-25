import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const UUID_SCHEMA = z.string().uuid();

export function validateUuidParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value !== undefined && !UUID_SCHEMA.safeParse(value).success) {
        res.status(400).json({ error: `Invalid ${name}: must be a valid UUID` });
        return;
      }
    }
    next();
  };
}
