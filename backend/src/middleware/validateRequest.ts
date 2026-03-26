import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export type ValidationSource = 'body' | 'query' | 'params';

/**
 * Express middleware for request validation using Zod schemas
 * Validates the specified source (body, query, or params) against the schema
 * On failure: Returns standardized 400 response with validation errors
 * On success: Replaces the source with validated data and calls next()
 */
export function validateRequest(schema: ZodSchema, source: ValidationSource = 'body') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dataToValidate = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      const result = await schema.parseAsync(dataToValidate);

      // Replace the source with validated data for downstream handlers
      if (source === 'body') {
        req.body = result;
      } else if (source === 'query') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.query = result as any;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.params = result as any;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          issues: error.issues
        });
      }
      next(error);
    }
  };
}
