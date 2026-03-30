import { appLogger } from '../logging/logger.js';

type StdinLike = Pick<NodeJS.ReadStream, 'isTTY' | 'pause'>;

export function isIgnorableStdinError(error: unknown, isTTY: boolean): boolean {
  if (!isTTY || !(error instanceof Error)) {
    return false;
  }

  const errnoError = error as NodeJS.ErrnoException;
  return errnoError?.code === 'EIO' && errnoError.syscall === 'read';
}

export function handleStdinError(error: unknown, stdin: StdinLike, onFatal: () => void): void {
  if (isIgnorableStdinError(error, stdin.isTTY === true)) {
    appLogger.warn({ err: error }, '[server] Ignoring stdin TTY read EIO');
    stdin.pause();
    return;
  }

  appLogger.error({ err: error }, '[server] Unexpected stdin error');
  onFatal();
}
