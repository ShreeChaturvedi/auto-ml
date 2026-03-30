import { describe, expect, it, vi } from 'vitest';

import { appLogger } from '../../logging/logger.js';
import { handleStdinError, isIgnorableStdinError } from '../stdinError.js';

function createErrnoError(code: string, syscall: string): NodeJS.ErrnoException {
  const error = new Error(`${code}:${syscall}`) as NodeJS.ErrnoException;
  error.code = code;
  error.syscall = syscall;
  return error;
}

describe('isIgnorableStdinError', () => {
  it('returns true for TTY EIO read errors', () => {
    expect(isIgnorableStdinError(createErrnoError('EIO', 'read'), true)).toBe(true);
  });

  it('returns false for non-EIO errors', () => {
    expect(isIgnorableStdinError(createErrnoError('ECONNRESET', 'read'), true)).toBe(false);
  });

  it('returns false for non-read syscalls', () => {
    expect(isIgnorableStdinError(createErrnoError('EIO', 'write'), true)).toBe(false);
  });

  it('returns false for non-TTY stdin', () => {
    expect(isIgnorableStdinError(createErrnoError('EIO', 'read'), false)).toBe(false);
  });
});

describe('handleStdinError', () => {
  it('warns and pauses stdin for ignorable TTY EIO errors', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});
    const onFatal = vi.fn();
    const pause = vi.fn();

    handleStdinError(createErrnoError('EIO', 'read'), { isTTY: true, pause }, onFatal);

    expect(warnSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      '[server] Ignoring stdin TTY read EIO'
    );
    expect(pause).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(onFatal).not.toHaveBeenCalled();
  });

  it('logs and invokes the fatal path for unexpected stdin errors', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});
    const onFatal = vi.fn();
    const unexpectedError = createErrnoError('ECONNRESET', 'read');

    handleStdinError(unexpectedError, { isTTY: true, pause: vi.fn() }, onFatal);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      { err: unexpectedError },
      '[server] Unexpected stdin error'
    );
    expect(onFatal).toHaveBeenCalledOnce();
  });

  it('does not suppress EIO read errors on non-TTY stdin', () => {
    const warnSpy = vi.spyOn(appLogger, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(appLogger, 'error').mockImplementation(() => {});
    const onFatal = vi.fn();
    const ttyError = createErrnoError('EIO', 'read');

    handleStdinError(ttyError, { isTTY: false, pause: vi.fn() }, onFatal);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      { err: ttyError },
      '[server] Unexpected stdin error'
    );
    expect(onFatal).toHaveBeenCalledOnce();
  });
});
