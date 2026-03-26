import type { Response } from 'express';

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

/**
 * Send a standardized error response
 * @param res Express response object
 * @param status HTTP status code (404, 400, 401, 403, 409, 500, etc.)
 * @param message Error message to send
 * @param details Optional additional details (omitted in production)
 */
export function sendError(
  res: Response,
  status: number,
  message: string,
  details?: Record<string, unknown>
): void {
  const response: Record<string, unknown> = { error: message };
  if (details) {
    response.details = details;
  }
  res.status(status).json(response);
}

/**
 * Send a 404 Not Found error
 */
export function sendNotFound(res: Response, resource: string): void {
  sendError(res, 404, `${resource} not found`);
}

/**
 * Send a 400 Bad Request error
 */
export function sendBadRequest(res: Response, message: string): void {
  sendError(res, 400, message);
}

/**
 * Send a 401 Unauthorized error
 */
export function sendUnauthorized(res: Response, message = 'Unauthorized'): void {
  sendError(res, 401, message);
}

/**
 * Send a 403 Forbidden error
 */
export function sendForbidden(res: Response, message = 'Forbidden'): void {
  sendError(res, 403, message);
}

/**
 * Send a 409 Conflict error (e.g., email already exists)
 */
export function sendConflict(res: Response, message: string): void {
  sendError(res, 409, message);
}

/**
 * Send a 500 Internal Server Error
 */
export function sendInternalError(res: Response, message = 'Internal server error', error?: unknown): void {
  const details = error instanceof Error ? { error: error.message } : undefined;
  sendError(res, 500, message, details);
}
