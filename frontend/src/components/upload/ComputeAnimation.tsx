import { useId } from 'react';
import { cn } from '@/lib/utils';
import type { ComputeAnimationProps } from '@/types/processing';
import { useComputeAnimationState } from './useComputeAnimationState';
import { ComputeAnimationSvg } from './ComputeAnimationSvg';

// ── Main Component ──────────────────────────────────────────────

export function ComputeAnimation({
  files,
  results,
  isComplete,
  accentClassName,
  onSettled,
  durationScale = 1,
}: ComputeAnimationProps) {
  const uid = useId().replace(/:/g, '');
  const { visibleFiles, visibleResults } = useComputeAnimationState(
    files,
    results,
    isComplete,
    onSettled
  );

  return (
    <div
      className={cn('mx-auto w-full max-w-[56rem] px-4', accentClassName)}
      role="img"
      aria-label={
        isComplete
          ? 'Data processing complete'
          : 'Analyzing your uploaded files…'
      }
    >
      <ComputeAnimationSvg
        uid={uid}
        files={files}
        results={results}
        isComplete={isComplete}
        visibleFiles={visibleFiles}
        visibleResults={visibleResults}
        durationScale={durationScale}
      />
    </div>
  );
}
