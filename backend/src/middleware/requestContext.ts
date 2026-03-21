import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';

import { baseLogger, runWithRequestLogger } from '../logging/logger.js';

const httpLogger = pinoHttp<IncomingMessage, ServerResponse>({
  autoLogging: false,
  genReqId: (req, res) => {
    const incomingRequestId = req.headers['x-request-id'];
    const requestId = typeof incomingRequestId === 'string' && incomingRequestId.trim().length > 0
      ? incomingRequestId
      : randomUUID();

    res.setHeader('X-Request-Id', requestId);
    return requestId;
  },
  logger: baseLogger,
  quietReqLogger: true
});

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
  httpLogger(req, res);

  const requestId = typeof req.id === 'string' ? req.id : String(req.id);
  const requestLogger = req.log.child({
    requestId,
    route: req.path
  });

  runWithRequestLogger(requestLogger, next);
};
