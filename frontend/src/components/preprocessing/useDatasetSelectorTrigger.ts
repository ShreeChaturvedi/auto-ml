import { useCallback, useState } from 'react';

/** Imperative trigger so the parent can force-open the DatasetSelector dialog */
export function useDatasetSelectorTrigger() {
  const [forceOpen, setForceOpen] = useState(false);

  const openSelector = useCallback(() => {
    setForceOpen(true);
    // Reset immediately so re-triggers work
    queueMicrotask(() => setForceOpen(false));
  }, []);

  return { forceOpen, openSelector };
}
