import { AsyncLocalStorage } from 'node:async_hooks';

import pino, { type Logger } from 'pino';

import { env } from '../config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type AppLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  child: (bindings: Record<string, unknown>) => AppLogger;
  raw: () => Logger;
};

const requestLoggerStorage = new AsyncLocalStorage<Logger>();

const loggerTransport = env.nodeEnv === 'production'
  ? undefined
  : pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        singleLine: false,
        translateTime: 'SYS:standard'
      }
    });

export const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL ?? (env.nodeEnv === 'production' ? 'info' : 'debug'),
    base: { service: 'backend' },
    formatters: {
      level: (label) => ({ level: label })
    },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  loggerTransport
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Error);
}

function buildMetadata(args: unknown[]): Record<string, unknown> | undefined {
  if (args.length === 0) {
    return undefined;
  }

  const metadata: Record<string, unknown> = {};
  const extraValues: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      metadata.err = arg;
      continue;
    }

    if (isPlainObject(arg)) {
      Object.assign(metadata, arg);
      continue;
    }

    extraValues.push(arg);
  }

  if (extraValues.length === 1) {
    metadata.data = extraValues[0];
  } else if (extraValues.length > 1) {
    metadata.data = extraValues;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function splitMessage(args: unknown[]) {
  if (args.length === 0) {
    return { message: undefined, metaArgs: [] as unknown[] };
  }

  if (typeof args[0] === 'string') {
    return { message: args[0], metaArgs: args.slice(1) };
  }

  const messageIndex = args.findIndex((arg) => typeof arg === 'string');
  if (messageIndex === -1) {
    return { message: undefined, metaArgs: args };
  }

  return {
    message: args[messageIndex] as string,
    metaArgs: args.filter((_, index) => index !== messageIndex)
  };
}

function emitLog(logger: Logger, level: LogLevel, args: unknown[]) {
  const { message, metaArgs } = splitMessage(args);
  const metadata = buildMetadata(metaArgs);

  if (message && metadata) {
    logger[level](metadata, message);
    return;
  }

  if (message) {
    logger[level](message);
    return;
  }

  if (metadata) {
    logger[level](metadata, 'structured-log');
    return;
  }

  logger[level]('structured-log');
}

function resolveLogger(bindings: Record<string, unknown>): Logger {
  const activeLogger = requestLoggerStorage.getStore() ?? baseLogger;
  return Object.keys(bindings).length > 0 ? activeLogger.child(bindings) : activeLogger;
}

function createLogger(bindings: Record<string, unknown> = {}): AppLogger {
  return {
    debug: (...args: unknown[]) => emitLog(resolveLogger(bindings), 'debug', args),
    info: (...args: unknown[]) => emitLog(resolveLogger(bindings), 'info', args),
    warn: (...args: unknown[]) => emitLog(resolveLogger(bindings), 'warn', args),
    error: (...args: unknown[]) => emitLog(resolveLogger(bindings), 'error', args),
    child: (childBindings: Record<string, unknown>) => createLogger({ ...bindings, ...childBindings }),
    raw: () => resolveLogger(bindings)
  };
}

export function runWithRequestLogger<T>(logger: Logger, callback: () => T): T {
  return requestLoggerStorage.run(logger, callback);
}

export function getLogger(): Logger {
  return resolveLogger({});
}

export const appLogger = createLogger();
