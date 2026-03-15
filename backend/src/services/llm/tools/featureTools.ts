import type { LlmToolDefinition } from '../llmClient.js';

/**
 * Feature engineering lifecycle tool definitions.
 * These 6 tools mirror the preprocessing orchestration pattern but are
 * scoped to the feature engineering lifecycle (propose -> materialize ->
 * execute -> validate -> register -> checkpoint).
 */
export const FEATURE_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: 'propose_feature',
    description: 'Propose a new feature with rationale, method, and parameters before generating any code.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Feature engineering run identifier.' },
        featureId: { type: 'string', description: 'Optional user-supplied feature identifier.' },
        featureName: { type: 'string', description: 'Human-readable name for the feature.' },
        sourceColumns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Source column(s) used to derive this feature.'
        },
        method: { type: 'string', description: 'Feature engineering method (e.g. one_hot, log_transform, binning, interaction, polynomial, lag, rolling_mean, custom).' },
        rationale: { type: 'string', description: 'Why this feature is expected to improve the model.' },
        params: {
          type: 'object',
          description: 'Method-specific parameters (e.g. { bins: 5 } for binning, { degree: 2 } for polynomial).'
        },
        impact: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Expected impact on model performance.'
        }
      },
      required: ['featureName', 'method', 'rationale']
    }
  },
  {
    name: 'materialize_feature_code',
    description: 'Generate or attach executable Python code for a proposed feature.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        featureId: { type: 'string', description: 'The feature identifier from propose_feature.' },
        code: { type: 'string', description: 'Python code that creates the feature column(s).' },
        outputColumns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Column name(s) produced by this code.'
        }
      },
      required: ['featureId', 'code']
    }
  },
  {
    name: 'execute_feature',
    description: 'Run the materialized feature code and capture execution output.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        featureId: { type: 'string', description: 'The feature identifier to execute.' },
        cellId: { type: 'string', description: 'Notebook cell used for execution.' },
        succeeded: { type: 'boolean', description: 'Whether the execution succeeded.' },
        stdout: { type: 'string', description: 'Standard output from execution.' },
        stderr: { type: 'string', description: 'Standard error from execution.' }
      },
      required: ['featureId']
    }
  },
  {
    name: 'validate_feature',
    description: 'Validate a feature for null rate, correlation with target, potential leakage, and distribution quality.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        featureId: { type: 'string', description: 'The feature identifier to validate.' },
        nullRate: { type: 'number', description: 'Fraction of null values in the feature column (0.0 - 1.0).' },
        correlationWithTarget: { type: 'number', description: 'Pearson/Spearman correlation with target column.' },
        leakageRisk: {
          type: 'string',
          enum: ['none', 'low', 'medium', 'high'],
          description: 'Assessed risk of target leakage.'
        },
        distributionNotes: { type: 'string', description: 'Notes on feature distribution (skew, outliers, etc.).' },
        requiresApproval: { type: 'boolean', description: 'Whether user approval is needed before registering.' }
      },
      required: ['featureId']
    }
  },
  {
    name: 'register_feature',
    description: 'Commit a validated feature to the feature pipeline registry.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        featureId: { type: 'string', description: 'The feature identifier to register.' },
        approved: { type: 'boolean', description: 'Whether the feature was approved for registration.' },
        rejectionReason: { type: 'string', description: 'Reason for rejection if not approved.' },
        datasetId: { type: 'string', description: 'Dataset to register the feature against.' }
      },
      required: ['featureId']
    }
  },
  {
    name: 'checkpoint_feature_pipeline',
    description: 'Snapshot the current feature set as a pipeline checkpoint for reproducibility.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        label: { type: 'string', description: 'Human-readable checkpoint label.' },
        featureIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Feature identifiers included in this checkpoint.'
        },
        datasetId: { type: 'string', description: 'Associated dataset identifier.' }
      }
    }
  }
];

/** Names of all feature lifecycle tools for quick lookup. */
export const FEATURE_TOOL_NAMES: readonly string[] = FEATURE_TOOL_DEFINITIONS.map((t) => t.name);
