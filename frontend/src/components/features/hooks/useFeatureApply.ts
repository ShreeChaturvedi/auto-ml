import { useCallback, useEffect, useState } from 'react';
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
    if (!applyMessage) return;
    const timer = setTimeout(() => {
      setApplyMessage(null);
      setApplyStatus('idle');
    }, 4000);
    return () => clearTimeout(timer);
  }, [applyMessage]);

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

    const enabledFeatures = projectFeatures.filter((feature) => feature.enabled);
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

    const missingSecondary = enabledFeatures.find(
      (feature) =>
        ['ratio', 'difference', 'product'].includes(feature.method) && !feature.secondaryColumn
    );

    if (missingSecondary) {
      setApplyStatus('error');
      setApplyMessage(`"${missingSecondary.featureName}" needs a secondary column.`);
      return;
    }

    const missingTarget = enabledFeatures.find(
      (feature) =>
        feature.method === 'target_encode' && typeof feature.params?.targetColumn !== 'string'
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
      setApplyMessage(error instanceof Error ? error.message : 'Failed to apply features.');
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
