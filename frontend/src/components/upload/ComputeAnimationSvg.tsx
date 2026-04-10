import type { ProcessingResult } from '@/types/processing';
import {
  ComputeAnimationStatus,
  CompletionBadge,
  ComputeCube,
  FileCards,
  FlowPaths,
  ResultCards,
} from './ComputeAnimationSvgSections';
import { MAX_VISIBLE_FILE_SLOTS } from './computeAnimationSvgLayout';
import { buildComputeAnimationStyles } from './computeAnimationSvgStyles';

// ── SVG Props ──────────────────────────────────────────────

export interface ComputeAnimationSvgProps {
  uid: string;
  files: Array<{ name: string; type: string }>;
  results: ProcessingResult[];
  isComplete: boolean;
  visibleFiles: number;
  visibleResults: number;
  /** Multiplier applied to all internal animation durations. Default 1.0. */
  durationScale?: number;
}

export function ComputeAnimationSvg({
  uid,
  files,
  results,
  isComplete,
  visibleFiles,
  visibleResults,
  durationScale = 1,
}: ComputeAnimationSvgProps) {
  const visibleFileSlots = files.slice(0, MAX_VISIBLE_FILE_SLOTS);

  return (
    <>
      <style>{buildComputeAnimationStyles(uid, durationScale)}</style>

      <svg
        viewBox="0 0 900 460"
        className={`h-auto w-full ca-anim-${uid}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`particle-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
            <stop offset="50%" style={{ stopColor: 'currentColor', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
          </linearGradient>

          {/* Subtle neutral glow behind cube */}
          <radialGradient id={`cube-bg-${uid}`} cx="50%" cy="50%" r="35%">
            <stop offset="0%" style={{ stopColor: 'hsl(var(--muted-foreground))', stopOpacity: 0.12 }} />
            <stop offset="100%" style={{ stopColor: 'hsl(var(--muted-foreground))', stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* Background glow */}
        <circle cx="450" cy="230" r="140" fill={`url(#cube-bg-${uid})`} />

        <FlowPaths
          uid={uid}
          files={visibleFileSlots}
          results={results}
          visibleFiles={visibleFiles}
          visibleResults={visibleResults}
          isComplete={isComplete}
          durationScale={durationScale}
        />
        <ComputeCube uid={uid} isComplete={isComplete} />
        <CompletionBadge isComplete={isComplete} />
        <FileCards files={visibleFileSlots} visibleFiles={visibleFiles} />
        <ResultCards results={results} visibleResults={visibleResults} />
        <ComputeAnimationStatus isComplete={isComplete} />
      </svg>
    </>
  );
}
