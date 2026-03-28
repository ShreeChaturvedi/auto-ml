/**
 * ProcessingStage — Orchestrates the compute animation between Upload and Chat stages
 *
 * Responsibilities:
 *  1. Reads uploaded file metadata from the data store (already populated during upload).
 *  2. Renders the ComputeAnimation SVG with real file descriptors.
 *  3. Gathers ProcessingResult[] and feeds them to the animation's right-side cards.
 *  4. Enforces a minimum animation duration so the experience never feels instant.
 *  5. After the animation settles (via onSettled callback), calls `onComplete` to advance.
 *
 * Integration contract (consumed by UploadArea stage machine):
 *   <ProcessingStage
 *     projectId={activeProject.id}
 *     onComplete={() => setStage('chat')}
 *   />
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';

import { useDataStore } from '@/stores/dataStore';
import { ComputeAnimation } from './ComputeAnimation';
import { gatherProcessingResults } from './processingUtils';
import type { ProcessingResult, ProcessingStageProps } from '@/types/processing';

/** Minimum time (ms) the animation plays before results appear */
const MIN_ANIMATION_MS = 4500;

export function ProcessingStage({ projectId, onComplete }: Omit<ProcessingStageProps, 'onBack'>) {
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  // Prevent double-fire of onComplete in strict mode
  const hasFired = useRef(false);
  const runIdRef = useRef(0);

  // Pull files for this project from the data store
  const allFiles = useDataStore((state) => state.files);
  const projectFiles = useMemo(
    () => allFiles.filter((f) => f.projectId === projectId),
    [allFiles, projectId],
  );
  const projectColorClass = 'text-accent-text';

  // Simplified file descriptors for the animation (name + type)
  const fileDescriptors = useMemo(
    () => projectFiles.map((f) => ({ name: f.name, type: f.type })),
    [projectFiles],
  );

  // Stable reference to onComplete so the effect doesn't re-run
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const runProcessing = useCallback(async () => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    hasFired.current = false;
    setIsComplete(false);

    const minDelay = new Promise<void>((r) => setTimeout(r, MIN_ANIMATION_MS));
    const dataPromise = Promise.resolve(gatherProcessingResults(projectFiles));

    const [data] = await Promise.all([dataPromise, minDelay]);

    if (runIdRef.current !== runId) {
      return;
    }

    setResults(data);
    setIsComplete(true);
    // The ComputeAnimation will call onSettled when its entrance + completion
    // animations finish — no hardcoded settle timer needed here.
  }, [projectFiles]);

  useEffect(() => {
    void runProcessing();
    return () => {
      runIdRef.current += 1;
    };
  }, [runProcessing]);

  // Called by ComputeAnimation once all result cards have staggered in
  // and the checkmark animation has completed.
  const handleSettled = useCallback(() => {
    if (!hasFired.current) {
      hasFired.current = true;
      onCompleteRef.current(results);
    }
  }, [results]);

  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-6 p-4 sm:p-6"
      data-testid="processing-stage"
    >
      <ComputeAnimation
        files={fileDescriptors}
        results={results}
        isComplete={isComplete}
        accentClassName={projectColorClass}
        onSettled={handleSettled}
      />
    </div>
  );
}
