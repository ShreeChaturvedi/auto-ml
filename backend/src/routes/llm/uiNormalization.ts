import { appLogger } from '../../logging/logger.js';
import type { LlmEnvelope } from '../../types/llm.js';
import { UiSchema } from '../../types/llmUi.js';

const FEATURE_ENGINEERING_FALLBACK_MESSAGE =
  'The model response was incomplete, so I generated a safe fallback feature-engineering summary.';

export function buildFeatureEngineeringFallbackEnvelope(
  reason: 'empty_render_ui' | 'empty_response' | 'blank_text'
): LlmEnvelope {
  const reasonText = reason === 'empty_render_ui'
    ? 'The model returned an empty UI payload.'
    : reason === 'blank_text'
      ? 'The model emitted text tokens, but they were blank after trimming.'
      : 'The model did not emit usable tokens, tools, or UI.';

  return {
    version: '1',
    kind: 'feature_engineering',
    message: FEATURE_ENGINEERING_FALLBACK_MESSAGE,
    ui: {
      version: '1',
      kind: 'feature_engineering',
      title: 'Feature Engineering Fallback',
      sections: [
        {
          id: 'fallback-fe-summary',
          title: 'Recovered Guidance',
          layout: 'column',
          items: [
            {
              type: 'report',
              id: 'fallback-fe-report',
              title: 'What happened',
              content: `${reasonText}\n\nUse the quick actions below to continue without losing progress:\n1. Ask for candidate features.\n2. Ask for leakage-safe validation checks.\n3. Ask for a training-ready feature summary.`,
              format: 'markdown'
            },
            {
              type: 'callout',
              tone: 'info',
              text: 'No data was modified. You can immediately retry with the suggestion pills.'
            }
          ]
        }
      ]
    }
  };
}

export function coerceLegacyUiItems(items: unknown[]): unknown[] {
  const coerced: unknown[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object') {
      continue;
    }

    const candidate = item as Record<string, unknown>;
    const type = typeof candidate.type === 'string' ? candidate.type : '';

    if (type === 'report') {
      const title = typeof candidate.title === 'string' ? candidate.title : 'Report';
      const content = typeof candidate.content === 'string' ? candidate.content : '';
      if (!content.trim()) continue;
      coerced.push({
        type: 'report',
        id: typeof candidate.id === 'string' ? candidate.id : `report-${index + 1}`,
        title,
        content,
        format: candidate.format === 'markdown' || candidate.format === 'json' ? candidate.format : 'text'
      });
      continue;
    }

    if (type === 'callout') {
      const text = typeof candidate.text === 'string' ? candidate.text : '';
      if (!text.trim()) continue;
      coerced.push({
        type: 'callout',
        tone: candidate.tone === 'warning' || candidate.tone === 'success' ? candidate.tone : 'info',
        text
      });
      continue;
    }

    if (type === 'code_cell') {
      const content = typeof candidate.content === 'string' ? candidate.content : '';
      if (!content.trim()) continue;
      coerced.push({
        type: 'code_cell',
        id: typeof candidate.id === 'string' ? candidate.id : `code-${index + 1}`,
        title: typeof candidate.title === 'string' ? candidate.title : undefined,
        language: 'python',
        content,
        autoRun: candidate.autoRun === true
      });
      continue;
    }

    if (type === 'feature_suggestion') {
      const featureName = typeof candidate.feature === 'string'
        ? candidate.feature
        : (typeof candidate.title === 'string' ? candidate.title : '');
      const method = typeof candidate.method === 'string' ? candidate.method : 'custom';
      const rationale = typeof candidate.rationale === 'string'
        ? candidate.rationale
        : 'Suggested transformation from model response.';

      const featureObject = candidate.feature && typeof candidate.feature === 'object'
        ? candidate.feature as Record<string, unknown>
        : null;

      const sourceColumn = featureObject && typeof featureObject.sourceColumn === 'string'
        ? featureObject.sourceColumn
        : null;

      const featureTitle = featureObject && typeof featureObject.featureName === 'string'
        ? featureObject.featureName
        : featureName;

      if (featureObject && sourceColumn && featureTitle) {
        const featureObjectRecord = featureObject;
        coerced.push({
          type: 'feature_suggestion',
          id: typeof candidate.id === 'string' ? candidate.id : `feature-${index + 1}`,
          feature: {
            sourceColumn,
            secondaryColumn: typeof featureObjectRecord.secondaryColumn === 'string'
              ? featureObjectRecord.secondaryColumn
              : undefined,
            featureName: featureTitle,
            description: typeof featureObjectRecord.description === 'string'
              ? featureObjectRecord.description
              : rationale,
            method: typeof featureObjectRecord.method === 'string' ? featureObjectRecord.method : method,
            params: featureObjectRecord.params && typeof featureObjectRecord.params === 'object'
              ? featureObjectRecord.params as Record<string, unknown>
              : {}
          },
          rationale,
          impact: candidate.impact === 'high' || candidate.impact === 'low' ? candidate.impact : 'medium'
        });
        continue;
      }

      if (!featureTitle && !rationale.trim()) {
        continue;
      }

      coerced.push({
        type: 'report',
        id: `legacy-feature-${index + 1}`,
        title: featureTitle ? `Suggested feature: ${featureTitle}` : 'Suggested feature',
        content: `Method: ${method}\n\n${rationale}`,
        format: 'markdown'
      });
      continue;
    }
  }

  return coerced;
}

export function normalizeUiPayload(payload: unknown, kind: 'feature_engineering' | 'training' | 'onboarding' | 'preprocessing') {
  if (!payload || typeof payload !== 'object') {
    return { version: '1', kind, sections: [] };
  }
  const candidate = payload as Record<string, unknown>;
  const rawSections = Array.isArray(candidate.sections) ? candidate.sections : [];
  const firstSection = rawSections[0];
  const sectionsLooksLikeLegacyItems = Boolean(
    firstSection
    && typeof firstSection === 'object'
    && firstSection !== null
    && typeof (firstSection as Record<string, unknown>).type === 'string'
    && !Array.isArray((firstSection as Record<string, unknown>).items)
  );

  const legacyItems = sectionsLooksLikeLegacyItems ? coerceLegacyUiItems(rawSections) : [];
  const normalizedSections = sectionsLooksLikeLegacyItems
    ? [{
      id: 'generated-section',
      title: typeof candidate.title === 'string' ? candidate.title : 'Feature plan',
      layout: 'column',
      items: legacyItems
    }]
    : rawSections;

  const normalized = {
    version: candidate.version === '1' ? '1' : '1',
    kind: candidate.kind === 'feature_engineering'
      || candidate.kind === 'training'
      || candidate.kind === 'onboarding'
      || candidate.kind === 'preprocessing'
      ? candidate.kind
      : kind,
    title: typeof candidate.title === 'string' ? candidate.title : undefined,
    summary: typeof candidate.summary === 'string' ? candidate.summary : undefined,
    sections: normalizedSections
  };

  const parsed = UiSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  appLogger.warn('[llm] normalizeUiPayload failed validation', {
    issues: parsed.error.issues.slice(0, 5).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    })),
    sectionCount: Array.isArray(normalized.sections) ? normalized.sections.length : 0
  });

  return { version: '1', kind: normalized.kind, title: normalized.title, summary: normalized.summary, sections: [] };
}
