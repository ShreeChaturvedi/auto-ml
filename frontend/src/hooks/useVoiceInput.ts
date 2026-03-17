import { useCallback, useEffect, useRef, useState } from 'react';

import { createRealtimeSession } from '@/lib/api/realtimeSession';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'error';

export type VoiceTranscriptEvent =
  | { type: 'committed'; itemId: string; previousItemId: string | null }
  | { type: 'delta'; itemId: string; delta: string }
  | { type: 'completed'; itemId: string; transcript: string };

interface UseVoiceInputOptions {
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onTranscriptEvent: (event: VoiceTranscriptEvent) => void;
  disabled?: boolean;
}

interface UseVoiceInputReturn {
  state: VoiceState;
  analyserRef: React.RefObject<AnalyserNode | null>;
  startRecording: () => void;
  stopRecording: () => void;
  toggleRecording: () => void;
}

const SAMPLE_RATE = 24000;
const STOP_FLUSH_TIMEOUT_MS = 1500;
const TURN_DETECTION = {
  type: 'server_vad' as const,
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 1000,
};

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  const parts: string[] = [];

  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }

  return btoa(parts.join(''));
}

export function useVoiceInput({
  onRecordingStart,
  onRecordingStop,
  onTranscriptEvent,
  disabled,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceState>('idle');

  const stateRef = useRef(state);
  stateRef.current = state;

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItemIdsRef = useRef(new Set<string>());
  const stopRequestedRef = useRef(false);
  const startAttemptRef = useRef(0);

  const onTranscriptEventRef = useRef(onTranscriptEvent);
  onTranscriptEventRef.current = onTranscriptEvent;

  const onRecordingStartRef = useRef(onRecordingStart);
  onRecordingStartRef.current = onRecordingStart;

  const onRecordingStopRef = useRef(onRecordingStop);
  onRecordingStopRef.current = onRecordingStop;

  const clearErrorTimer = useCallback(() => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  const clearStopFlushTimer = useCallback(() => {
    if (stopFlushTimerRef.current) {
      clearTimeout(stopFlushTimerRef.current);
      stopFlushTimerRef.current = null;
    }
  }, []);

  const clearSessionTracking = useCallback(() => {
    pendingItemIdsRef.current.clear();
    stopRequestedRef.current = false;
  }, []);

  const stopAudioCapture = useCallback(() => {
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    analyserRef.current = null;
  }, []);

  const cleanupPendingStart = useCallback((
    resources: {
      stream?: MediaStream | null;
      audioContext?: AudioContext | null;
      ws?: WebSocket | null;
    },
  ) => {
    const { stream, audioContext, ws } = resources;

    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    if (audioContext) {
      void audioContext.close().catch(() => {});
    }

    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
  }, []);

  const cleanup = useCallback(() => {
    clearStopFlushTimer();

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }

    stopAudioCapture();
    clearSessionTracking();
  }, [clearSessionTracking, clearStopFlushTimer, stopAudioCapture]);

  const finishSession = useCallback((nextState: VoiceState = 'idle') => {
    cleanup();
    setState(nextState);

    if (nextState === 'idle') {
      onRecordingStopRef.current?.();
    }
  }, [cleanup]);

  const setErrorWithRecovery = useCallback(() => {
    finishSession('error');
    clearErrorTimer();
    errorTimerRef.current = setTimeout(() => setState('idle'), 2000);
  }, [clearErrorTimer, finishSession]);

  const sendMessage = useCallback((message: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    ws.send(JSON.stringify(message));
    return true;
  }, []);

  const maybeFinishStop = useCallback((force = false) => {
    if (!stopRequestedRef.current) {
      return;
    }

    if (!force && pendingItemIdsRef.current.size > 0) {
      return;
    }

    finishSession('idle');
  }, [finishSession]);

  const armStopFlushTimeout = useCallback(() => {
    clearStopFlushTimer();
    stopFlushTimerRef.current = setTimeout(() => {
      maybeFinishStop(true);
    }, STOP_FLUSH_TIMEOUT_MS);
  }, [clearStopFlushTimer, maybeFinishStop]);

  const startRecording = useCallback(async () => {
    if (disabled || stateRef.current === 'connecting' || stateRef.current === 'listening') {
      return;
    }

    const attemptId = startAttemptRef.current + 1;
    startAttemptRef.current = attemptId;
    setState('connecting');

    try {
      const { clientSecret } = await createRealtimeSession();
      if (attemptId !== startAttemptRef.current) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attemptId !== startAttemptRef.current) {
        cleanupPendingStart({ stream });
        return;
      }

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      await audioContext.audioWorklet.addModule(
        new URL('../lib/audio/pcmWorklet.js', import.meta.url).href
      );
      if (attemptId !== startAttemptRef.current) {
        cleanupPendingStart({ stream, audioContext });
        return;
      }

      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      source.connect(workletNode);

      const ws = new WebSocket(
        'wss://api.openai.com/v1/realtime?intent=transcription',
        ['realtime', `openai-insecure-api-key.${clientSecret}`, 'openai-beta.realtime-v1']
      );

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      wsRef.current = ws;

      ws.onopen = () => {
        if (attemptId !== startAttemptRef.current) {
          return;
        }

        clearSessionTracking();

        sendMessage({
          type: 'transcription_session.update',
          session: {
            input_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'gpt-4o-transcribe',
              language: 'en',
            },
            turn_detection: TURN_DETECTION,
            input_audio_noise_reduction: {
              type: 'near_field',
            },
          },
        });

        setState('listening');
        onRecordingStartRef.current?.();
      };

      workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (attemptId !== startAttemptRef.current) {
          return;
        }

        const wsInstance = wsRef.current;
        if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
          return;
        }

        const base64Audio = uint8ToBase64(new Uint8Array(event.data));
        wsInstance.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio,
        }));
      };

      ws.onmessage = (event) => {
        if (attemptId !== startAttemptRef.current) {
          return;
        }

        try {
          const data = JSON.parse(event.data as string) as {
            type: string;
            item_id?: string;
            previous_item_id?: string | null;
            delta?: string;
            transcript?: string;
          };

          if (data.type === 'input_audio_buffer.committed' && data.item_id) {
            pendingItemIdsRef.current.add(data.item_id);
            onTranscriptEventRef.current({
              type: 'committed',
              itemId: data.item_id,
              previousItemId: data.previous_item_id ?? null,
            });
            return;
          }

          if (data.type === 'conversation.item.input_audio_transcription.delta' && data.item_id && data.delta) {
            onTranscriptEventRef.current({
              type: 'delta',
              itemId: data.item_id,
              delta: data.delta,
            });
            return;
          }

          if (data.type === 'conversation.item.input_audio_transcription.completed' && data.item_id) {
            pendingItemIdsRef.current.delete(data.item_id);
            onTranscriptEventRef.current({
              type: 'completed',
              itemId: data.item_id,
              transcript: data.transcript ?? '',
            });
            maybeFinishStop();
          }
        } catch {
          // Ignore malformed messages from the realtime stream.
        }
      };

      ws.onerror = () => {
        if (attemptId !== startAttemptRef.current) {
          return;
        }

        setErrorWithRecovery();
      };

      ws.onclose = () => {
        if (attemptId !== startAttemptRef.current) {
          return;
        }

        if (stateRef.current !== 'idle' && stateRef.current !== 'error') {
          finishSession('idle');
        }
      };
    } catch (error) {
      if (attemptId !== startAttemptRef.current) {
        return;
      }

      console.error('[useVoiceInput] Failed to start recording:', error);
      setErrorWithRecovery();
    }
  }, [
    cleanupPendingStart,
    clearSessionTracking,
    disabled,
    finishSession,
    maybeFinishStop,
    sendMessage,
    setErrorWithRecovery,
  ]);

  const stopRecording = useCallback(() => {
    if (stateRef.current === 'idle' || stateRef.current === 'error') {
      finishSession('idle');
      return;
    }

    if (stateRef.current === 'connecting') {
      startAttemptRef.current += 1;
      finishSession('idle');
      return;
    }

    stopRequestedRef.current = true;
    stopAudioCapture();
    const committed = sendMessage({ type: 'input_audio_buffer.commit' });

    if (!committed && pendingItemIdsRef.current.size === 0) {
      maybeFinishStop(true);
      return;
    }

    armStopFlushTimeout();
  }, [armStopFlushTimeout, finishSession, maybeFinishStop, sendMessage, stopAudioCapture]);

  const toggleRecording = useCallback(() => {
    if (stateRef.current === 'listening' || stateRef.current === 'connecting') {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [startRecording, stopRecording]);

  useEffect(() => () => {
    cleanup();
    clearErrorTimer();
  }, [cleanup, clearErrorTimer]);

  useEffect(() => {
    if (disabled && (stateRef.current === 'listening' || stateRef.current === 'connecting')) {
      stopRecording();
    }
  }, [disabled, stopRecording]);

  return {
    state,
    analyserRef,
    startRecording: () => void startRecording(),
    stopRecording,
    toggleRecording,
  };
}
