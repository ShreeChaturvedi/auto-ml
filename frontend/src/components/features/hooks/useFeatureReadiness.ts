import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildReadinessReport,
  hasRequiredReadinessEvidence
} from '../featureEngineeringUtils';
import { useFeatureStore } from '@/stores/featureStore';
import type { FeatureSpec, PipelineVersion, ReadinessReport } from '@/types/feature';

export interface FeatureReadinessResult {
  readinessReport: ReadinessReport;
  isReadyForApproval: boolean;
  readinessReportUnlocked: boolean;
  isReadinessExpanded: boolean;
  setIsReadinessExpanded: (expanded: boolean) => void;
}

/**
 * Computes the readiness report for a feature pipeline version and
 * persists updates back to the feature store when the report changes.
 */
export function useFeatureReadiness(
  projectId: string,
  activeFeatures: FeatureSpec[],
  datasetColumns: string[],
  currentVersion: PipelineVersion | undefined
): FeatureReadinessResult {
  const updateReadinessReport = useFeatureStore((state) => state.updateReadinessReport);

  const [isReadinessExpanded, setIsReadinessExpanded] = useState(false);

  const lastPersistedReadinessRef = useRef(new Map<string, string>());

  // --- Computed readiness report ---
  const computedReadinessReport = useMemo(
    () => buildReadinessReport(activeFeatures, datasetColumns),
    [activeFeatures, datasetColumns]
  );

  const readinessReport = currentVersion?.readinessReport ?? computedReadinessReport;

  const isReadyForApproval = Boolean(currentVersion)
    && activeFeatures.length > 0
    && hasRequiredReadinessEvidence(readinessReport);

  const readinessReportUnlocked = activeFeatures.length > 0;

  // --- Readiness collapse effect ---
  useEffect(() => {
    if (!readinessReportUnlocked && isReadinessExpanded) {
      setIsReadinessExpanded(false);
    }
  }, [isReadinessExpanded, readinessReportUnlocked]);

  // --- Readiness report persist effect ---
  useEffect(() => {
    if (!currentVersion) return;

    const versionKey = currentVersion.id;
    const nextSerialized = JSON.stringify(computedReadinessReport);
    const persistedSerialized = lastPersistedReadinessRef.current.get(versionKey);

    if (persistedSerialized === nextSerialized) return;

    const currentSerialized = JSON.stringify(currentVersion.readinessReport);
    if (currentSerialized === nextSerialized) {
      lastPersistedReadinessRef.current.set(versionKey, nextSerialized);
      return;
    }

    lastPersistedReadinessRef.current.set(versionKey, nextSerialized);
    updateReadinessReport(projectId, currentVersion.id, computedReadinessReport);
  }, [computedReadinessReport, currentVersion, projectId, updateReadinessReport]);

  return {
    readinessReport,
    isReadyForApproval,
    readinessReportUnlocked,
    isReadinessExpanded,
    setIsReadinessExpanded
  };
}
