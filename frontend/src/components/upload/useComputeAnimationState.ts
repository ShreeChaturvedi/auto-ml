import { useEffect, useRef, useState } from 'react';
import type { ProcessingResult } from '@/types/processing';

export interface ComputeAnimationState {
  visibleFiles: number;
  visibleResults: number;
}

export function useComputeAnimationState(
  files: Array<{ name: string; type: string }>,
  results: ProcessingResult[],
  isComplete: boolean,
  onSettled?: () => void
): ComputeAnimationState {
  const [visibleFiles, setVisibleFiles] = useState(0);
  const [visibleResults, setVisibleResults] = useState(0);
  const settledRef = useRef(false);

  // Stagger file appearance
  useEffect(() => {
    if (files.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    files.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleFiles(i + 1), 300 + i * 250));
    });
    return () => timers.forEach(clearTimeout);
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stagger result card appearance
  useEffect(() => {
    if (results.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    results.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleResults(i + 1), i * 350));
    });
    return () => timers.forEach(clearTimeout);
  }, [results.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire onSettled once all result cards are visible AND the completion state is set
  useEffect(() => {
    if (!isComplete || !onSettled || settledRef.current) return;
    if (visibleResults < results.length) return;
    // Wait for the checkmark animation (0.5s delay + 0.5s draw = 1s) to finish
    const timer = setTimeout(() => {
      if (!settledRef.current) {
        settledRef.current = true;
        onSettled();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isComplete, visibleResults, results.length, onSettled]);

  return { visibleFiles, visibleResults };
}
