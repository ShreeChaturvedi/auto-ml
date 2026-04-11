import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { applyFeatureEngineering } from '@/lib/api/featureEngineering';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import type { FeatureSpec } from '@/types/feature';

interface UseFeatureApplyOptions {
  projectId: string;
  notebookId?: string;
  projectFeatures: FeatureSpec[];
  selectedDatasetFile: { id: string; metadata?: { datasetId?: string; columns?: string[] } } | undefined;
  setSelectedDataset: (id: string | null) => void;
}

interface UseFeatureApplyReturn {
  outputName: string;
  setOutputName: (name: string) => void;
  outputFormat: 'csv' | 'json' | 'xlsx';
  setOutputFormat: (format: 'csv' | 'json' | 'xlsx') => void;
  applyStatus: 'idle' | 'loading' | 'success' | 'error';
  setApplyStatus: (status: 'idle' | 'loading' | 'success' | 'error') => void;
  applyMessage: string | null;
  setApplyMessage: (message: string | null) => void;
  handleApplyFeatures: () => Promise<void>;
}

function getPayloadMessage(payload: unknown): string | null {
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;

  for (const key of ['error', 'message', 'details']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const nestedError = record.error;
  if (nestedError && typeof nestedError === 'object') {
    const message = (nestedError as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
  }

  return null;
}

function formatApplyError(error: unknown): string {
  if (error instanceof ApiError) {
    const payloadMessage = getPayloadMessage(error.payload);
    if (payloadMessage) return payloadMessage;
  }

  if (error instanceof Error) {
    return error.message
      .replace(/^Request to .+? failed with status \d+:\s*/i, '')
      .trim() || 'Failed to apply features.';
  }

  return 'Failed to apply features.';
}

export function useFeatureApply({
  projectId,
  notebookId,
  projectFeatures,
  selectedDatasetFile,
  setSelectedDataset,
}: UseFeatureApplyOptions): UseFeatureApplyReturn {
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);
  const featureRunId = useFeatureStore((state) => state.featureRunId);

  const [outputName, setOutputName] = useState('');
  const [outputFormat, setOutputFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  // --- Apply message auto-dismiss effect ---
  useEffect(() => {
    if (!applyMessage || applyStatus === 'error') return;
    const timer = setTimeout(() => {
      setApplyMessage(null);
      setApplyStatus('idle');
    }, 4000);
    return () => clearTimeout(timer);
  }, [applyMessage, applyStatus]);

  // --- Output format sync effect ---
  useEffect(() => {
    if (!selectedDatasetFile) return;

    const fileType = (selectedDatasetFile as { type?: string }).type;
    if (fileType === 'excel') {
      setOutputFormat('xlsx');
      return;
    }

    if (fileType === 'json') {
      setOutputFormat('json');
      return;
    }

    setOutputFormat('csv');
  }, [selectedDatasetFile]);

  // --- Apply features handler ---
  const handleApplyFeatures = useCallback(async () => {
    if (!selectedDatasetFile?.metadata?.datasetId) return;

    // Read the LATEST features directly from Zustand at click time instead of
    // trusting the prop closure alone. The prop can be stale during a race:
    // adapter finishes processing `register_feature` events and calls
    // `upsertFeature` with the LLM code, but if the user clicks Apply before
    // React re-renders the parent, the callback still holds the old
    // `projectFeatures` without code. Reading via getState() sees fresh state.
    //
    // Fall back to the prop if the store is empty (test scenarios where the
    // parent wires projectFeatures without also mocking the store).
    //
    // Fall back to `featureSteps[id].code` if a feature is missing code —
    // defense-in-depth: materialize_feature_code persists code to the step,
    // register_feature bridges step.code into the feature spec. If the bridge
    // missed for any reason, the step still holds the code from materialize.
    const storeState = useFeatureStore.getState();
    const storeFeatures = storeState.features.filter(
      (feature) => feature.projectId === projectId
    );
    // Also filter the prop fallback by projectId so a future refactor that
    // wires projectFeatures from a different source cannot leak cross-project
    // features into the apply payload.
    const propFeatures = projectFeatures.filter(
      (feature) => feature.projectId === projectId
    );
    const sourceFeatures = storeFeatures.length > 0 ? storeFeatures : propFeatures;
    const enabledFeatures = sourceFeatures
      .filter((feature) => feature.enabled)
      .map((feature) => {
        if (typeof feature.code === 'string' && feature.code.trim().length > 0) {
          return feature;
        }
        const stepCode = storeState.featureSteps?.[feature.id]?.code;
        if (typeof stepCode === 'string' && stepCode.trim().length > 0) {
          return { ...feature, code: stepCode };
        }
        return feature;
      });
    if (enabledFeatures.length === 0) {
      setApplyStatus('error');
      setApplyMessage('Select at least one feature.');
      return;
    }

    if (!notebookId) {
      setApplyStatus('error');
      setApplyMessage('Feature notebook is still initializing. Try again in a moment.');
      return;
    }

    // When a feature has LLM-authored code, structural validation is
    // unnecessary — the code handles its own column references and was
    // already proven to run in the notebook. Guards only apply to features
    // that fall back to the method-based codegen template.
    const needsStructuralValidation = (feature: typeof enabledFeatures[number]) =>
      !(typeof feature.code === 'string' && feature.code.trim().length > 0);

    const missingSecondary = enabledFeatures.find(
      (feature) =>
        needsStructuralValidation(feature)
        && ['ratio', 'difference', 'product'].includes(feature.method)
        && !feature.secondaryColumn
    );

    if (missingSecondary) {
      setApplyStatus('error');
      setApplyMessage(`"${missingSecondary.featureName}" needs a secondary column.`);
      return;
    }

    const missingTarget = enabledFeatures.find(
      (feature) =>
        needsStructuralValidation(feature)
        && feature.method === 'target_encode'
        && typeof feature.params?.targetColumn !== 'string'
    );

    if (missingTarget) {
      setApplyStatus('error');
      setApplyMessage(`"${missingTarget.featureName}" needs a target column.`);
      return;
    }

    setApplyStatus('loading');
    setApplyMessage(null);

    try {
      const response = await applyFeatureEngineering({
        projectId,
        datasetId: selectedDatasetFile.metadata.datasetId,
        runId: featureRunId ?? undefined,
        notebookId,
        outputName: outputName.trim() || undefined,
        outputFormat,
        features: enabledFeatures
      });

      await hydrateFromBackend(projectId, { force: true });
      setSelectedDataset(response.dataset.datasetId);
      setApplyStatus('success');
      setApplyMessage(
        response.warning
          ? `Created ${response.dataset.filename}. ${response.warning}`
          : `Created ${response.dataset.filename}`
      );
      setOutputName('');
    } catch (error) {
      setApplyStatus('error');
      setApplyMessage(formatApplyError(error));
    }
  }, [featureRunId, hydrateFromBackend, notebookId, outputFormat, outputName, projectFeatures, projectId, selectedDatasetFile, setSelectedDataset]);

  return {
    outputName,
    setOutputName,
    outputFormat,
    setOutputFormat,
    applyStatus,
    setApplyStatus,
    applyMessage,
    setApplyMessage,
    handleApplyFeatures,
  };
}
