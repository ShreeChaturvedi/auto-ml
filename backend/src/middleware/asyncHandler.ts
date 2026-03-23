import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async Express route handler so rejected promises are forwarded
 * to the Express error handler instead of causing an unhandled rejection.
 *
 * Accepts handlers typed with Request subtypes (e.g. AuthenticatedRequest)
 * so routes behind auth middleware can safely narrow the request type.
 *
 * Usage:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler<Req extends Request = Request>(
    fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
    return (req, res, next) => {
        Promise.resolve(fn(req as Req, res, next)).catch(next);
    };
}
