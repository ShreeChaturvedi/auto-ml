import { useCallback, useEffect, useRef } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { VoiceState } from '@/hooks/useVoiceInput';
import { WaveformIcon } from './WaveformIcon';

interface VoiceInputButtonProps {
  state: VoiceState;
  analyserRef: React.RefObject<AnalyserNode | null>;
  onToggle: () => void;
  themeColor?: string;
  disabled?: boolean;
}

/**
 * Animated waveform button that shows visual feedback for voice recording state.
 * Uses requestAnimationFrame to read the live audio envelope and drive
 * waveform bar heights via CSS custom properties (no React re-renders per frame).
 */
export function VoiceInputButton({
  state,
  analyserRef,
  onToggle,
  themeColor,
  disabled,
}: VoiceInputButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<number>(0);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothedLevelRef = useRef(0);
  const phaseRef = useRef(0);

  const updateWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const button = buttonRef.current;

    if (!analyser || !button) {
      rafRef.current = 0;
      return;
    }

    if (!timeDataRef.current || timeDataRef.current.length !== analyser.fftSize) {
      timeDataRef.current = new Uint8Array(analyser.fftSize);
    }
    const samples = timeDataRef.current;
    analyser.getByteTimeDomainData(samples);

    let sumSquares = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const centered = (samples[index] - 128) / 128;
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    smoothedLevelRef.current = smoothedLevelRef.current * 0.78 + rms * 0.22;
    phaseRef.current += 0.35 + smoothedLevelRef.current * 0.9;

    const level = smoothedLevelRef.current;
    const weights = [0.66, 0.9, 1.14, 0.9, 0.66];

    for (let band = 0; band < weights.length; band += 1) {
      const ripple = Math.sin(phaseRef.current + band * 0.72) * (0.11 + level * 0.42);
      const scale = Math.min(
        1.95,
        Math.max(0.48, 0.64 + level * 3.4 * weights[band] + ripple),
      );
      button.style.setProperty(`--bar-${band}`, scale.toFixed(2));
    }

    rafRef.current = requestAnimationFrame(updateWaveform);
  }, [analyserRef]);

  // Start/stop rAF loop based on recording state
  useEffect(() => {
    if (state === 'listening') {
      rafRef.current = requestAnimationFrame(updateWaveform);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      smoothedLevelRef.current = 0;
      phaseRef.current = 0;
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [state, updateWaveform]);

  const isActive = state === 'listening';
  const isConnecting = state === 'connecting';
  const isError = state === 'error';
  const isButtonDisabled = disabled || isError;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tooltipText =
    isActive ? 'Stop recording'
    : isConnecting ? 'Connecting...'
    : 'Voice input';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={buttonRef}
            variant="ghost"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggle}
            disabled={isButtonDisabled}
            aria-label={isActive ? 'Stop voice recording' : 'Start voice recording'}
            aria-pressed={isActive}
            className={cn(
              'h-9 w-9 rounded-full p-0 shrink-0 transition-[color,background-color,opacity] focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2',
              (isActive || isConnecting) && 'text-white hover:opacity-90',
              isError && 'text-destructive',
              !isActive && !isConnecting && !isError && 'text-muted-foreground voice-idle-btn',
            )}
            style={
              (isActive || isConnecting)
                ? { backgroundColor: themeColor || 'hsl(var(--primary))' }
                : themeColor
                  ? { '--voice-theme-color': themeColor } as React.CSSProperties
                  : undefined
            }
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isActive && !prefersReducedMotion ? (
              <WaveformIcon live />
            ) : prefersReducedMotion && isActive ? (
              <Mic className="h-4 w-4" />
            ) : (
                <WaveformIcon />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top"><p>{tooltipText}</p></TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
