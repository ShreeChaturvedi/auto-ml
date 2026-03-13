import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRealtimeSessionMock } = vi.hoisted(() => ({
  createRealtimeSessionMock: vi.fn(),
}));

vi.mock('@/lib/api/realtimeSession', () => ({
  createRealtimeSession: createRealtimeSessionMock,
}));

import { useVoiceInput } from '@/hooks/useVoiceInput';

function createDeferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe('useVoiceInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stays idle when startup is canceled before the realtime session resolves', async () => {
    const sessionRequest = createDeferred<{ clientSecret: string; expiresAt: number }>();
    createRealtimeSessionMock.mockReturnValue(sessionRequest.promise);

    const getUserMedia = vi.fn();
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const onRecordingStop = vi.fn();

    const { result } = renderHook(() => useVoiceInput({
      onTranscriptEvent: vi.fn(),
      onRecordingStop,
    }));

    act(() => {
      result.current.startRecording();
    });

    expect(result.current.state).toBe('connecting');

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.state).toBe('idle');
    expect(onRecordingStop).toHaveBeenCalledTimes(1);

    await act(async () => {
      sessionRequest.resolve({ clientSecret: 'secret-1', expiresAt: 123 });
      await sessionRequest.promise;
      await Promise.resolve();
    });

    expect(result.current.state).toBe('idle');
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('cleans up a pending media stream when canceled during microphone startup', async () => {
    createRealtimeSessionMock.mockResolvedValue({
      clientSecret: 'secret-1',
      expiresAt: 123,
    });

    const mediaRequest = createDeferred<MediaStream>();
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;

    const getUserMedia = vi.fn().mockReturnValue(mediaRequest.promise);
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    const audioContextSpy = vi.fn();
    vi.stubGlobal('AudioContext', audioContextSpy);

    const { result } = renderHook(() => useVoiceInput({
      onTranscriptEvent: vi.fn(),
    }));

    act(() => {
      result.current.startRecording();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('connecting');

    act(() => {
      result.current.stopRecording();
    });

    await act(async () => {
      mediaRequest.resolve(stream);
      await mediaRequest.promise;
      await Promise.resolve();
    });

    expect(result.current.state).toBe('idle');
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(audioContextSpy).not.toHaveBeenCalled();
  });
});
