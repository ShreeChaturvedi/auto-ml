import type { FeatureSpec, ReadinessReport, TransformationStep } from '@/types/feature';
import type { UiItem, UiSchema } from '@/types/llmUi';
import { sanitizeAssistantText } from '@/lib/llm/sanitizeAssistantText';

export type FeatureSuggestionItem = Extract<UiItem, { type: 'feature_suggestion' }>;

export const HIDDEN_ACTIVITY_TOOLS = new Set([
  'set_active_dataset',
  'list_project_datasets',
  'profile_active_dataset'
]);

export const HIDDEN_LEGACY_ERROR_MESSAGES = new Set([
  'LLM render_ui returned empty UI content.',
  'LLM returned empty response.',
  'This operation was aborted'
]);

let pendingFeatureLeftPaneScrollTop: number | null = null;

export function stripAssistantArtifacts(text: string): string {
  return sanitizeAssistantText(text);
}

export function captureFeatureLeftPaneScrollTop(scrollTop: number) {
  pendingFeatureLeftPaneScrollTop = scrollTop;
}

export function peekFeatureLeftPaneScrollTop(): number | null {
  return pendingFeatureLeftPaneScrollTop;
}

export function clearFeatureLeftPaneScrollTop() {
  pendingFeatureLeftPaneScrollTop = null;
}

export function hasUiItems(ui: UiSchema | null | undefined): boolean {
  if (!ui || !Array.isArray(ui.sections)) return false;
  return ui.sections.some((section) => Array.isArray(section.items) && section.items.length > 0);
}

export function buildReadinessReport(features: FeatureSpec[], sourceColumns: string[]): ReadinessReport {
  const addedColumns = features
    .map((feature) => feature.featureName)
    .filter((name): name is string => Boolean(name?.trim()));
  const uniqueAddedColumns = Array.from(new Set(addedColumns));

  const steps: TransformationStep[] = features.map((feature, index) => ({
    id: feature.id,
    name: feature.featureName || `${feature.sourceColumn}_${feature.method}`,
    rationale: feature.description || `Apply ${feature.method} to ${feature.sourceColumn}`,
    codeReference: `pipeline.step.${index + 1}:${feature.id}`,
    method: feature.method,
    columns: [feature.sourceColumn, feature.secondaryColumn].filter(
      (column): column is string => Boolean(column)
    )
  }));

  const missingSourceColumns = features
    .filter((feature) => !sourceColumns.includes(feature.sourceColumn))
    .map((feature) => feature.sourceColumn);

  const warnings: string[] = [];
  if (features.some((feature) => feature.method === 'target_encode')) {
    warnings.push('Target encoding requires split-aware fitting to avoid leakage.');
  }
  if (missingSourceColumns.length > 0) {
    warnings.push(
      `Some source columns are missing in the selected dataset: ${Array.from(new Set(missingSourceColumns)).join(', ')}`
    );
  }
  if (features.length === 0) {
    warnings.push('No transformations enabled. Pipeline currently preserves raw inputs.');
  }

  return {
    dataSummary: {
      addedColumns: uniqueAddedColumns,
      removedColumns: [],
      renamedColumns: [],
      typeChanges: [],
      nullDeltas: [],
      warnings
    },
    steps
  };
}

export function hasRequiredReadinessEvidence(report: ReadinessReport): boolean {
  return report.steps.length > 0
    && report.dataSummary.addedColumns.length > 0
    && Array.isArray(report.dataSummary.warnings);
}

export function buildSuggestionDefaults(item: FeatureSuggestionItem): Record<string, unknown> {
  const controlDefaults = (item.controls ?? []).reduce<Record<string, unknown>>((acc, control) => {
    acc[control.key] = control.value;
    return acc;
  }, {});

  return {
    ...(item.feature.params ?? {}),
    ...controlDefaults
  };
}
