import type { LlmToolDefinition } from '../llmClient.js';

export const PREPROCESSING_ORCHESTRATION_TOOLS: LlmToolDefinition[] = [
  {
    name: 'list_project_datasets',
    description: 'List project datasets for preprocessing context selection.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Optional preprocessing run identifier.' }
      }
    }
  },
  {
    name: 'set_active_dataset',
    description: 'Set active dataset context for the preprocessing run.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        datasetId: { type: 'string' }
      },
      required: ['datasetId']
    }
  },
  {
    name: 'profile_active_dataset',
    description: 'Fetch profile details for the active dataset context.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        datasetId: { type: 'string' }
      }
    }
  },
  {
    name: 'checkpoint_dataset',
    description: 'Create a dataset checkpoint in preprocessing lineage.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        datasetId: { type: 'string' },
        label: { type: 'string' },
        stepIds: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'register_derived_dataset',
    description: 'Register derived dataset metadata after transformation.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        datasetId: { type: 'string' }
      },
      required: ['datasetId']
    }
  },
  {
    name: 'list_checkpoints',
    description: 'List all checkpoints created in the preprocessing run.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' }
      }
    }
  },
  {
    name: 'restore_checkpoint',
    description: 'Restore a prior preprocessing checkpoint into active context.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        checkpointId: { type: 'string' },
        operation: {
          type: 'string',
          enum: ['restore', 'replay', 'compatibility_check'],
          description: 'restore (default) updates active context. replay/compatibility_check validates event replay compatibility against active dataset schema.'
        },
        replayDatasetId: { type: 'string', description: 'Optional target dataset override for replay compatibility check.' }
      },
      required: ['checkpointId']
    }
  },
  {
    name: 'propose_transformation_step',
    description: 'Declare a transformation intent before writing any executable code.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        stepId: { type: 'string' },
        title: { type: 'string' },
        intentType: { type: 'string' },
        rationale: { type: 'string' },
        requiresApproval: { type: 'boolean' }
      },
      required: ['title', 'intentType']
    }
  },
  {
    name: 'materialize_step_code',
    description: 'Attach or revise executable notebook code for a step.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        stepId: { type: 'string' },
        code: { type: 'string' }
      },
      required: ['stepId', 'code']
    }
  },
  {
    name: 'execute_transformation_step',
    description: 'Record execution state for a bound transformation step.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        stepId: { type: 'string' },
        cellId: { type: 'string' },
        cellIds: { type: 'array', items: { type: 'string' } },
        succeeded: { type: 'boolean' },
        stdout: { type: 'string' },
        stderr: { type: 'string' }
      },
      required: ['stepId']
    }
  },
  {
    name: 'validate_step_result',
    description: 'Validate post-step invariants and flag risky drift for review.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        stepId: { type: 'string' },
        rowCountBefore: { type: 'number' },
        rowCountAfter: { type: 'number' },
        nullCountBefore: { type: 'number' },
        nullCountAfter: { type: 'number' },
        schemaDrift: { type: 'boolean' },
        notes: { type: 'string' },
        requiresApproval: { type: 'boolean' }
      },
      required: ['stepId']
    }
  },
  {
    name: 'commit_transformation_step',
    description: 'Finalize an approved step and persist lineage checkpoint metadata.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        stepId: { type: 'string' },
        approved: { type: 'boolean' },
        rejectionReason: { type: 'string' },
        datasetId: { type: 'string' },
        label: { type: 'string' }
      },
      required: ['stepId']
    }
  },
  {
    name: 'detect_step_divergence',
    description: 'Detect backend-authoritative divergence between bound notebook cells and semantic preprocessing steps.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        stepId: { type: 'string', description: 'Optional single-step divergence check target.' },
        cellId: { type: 'string', description: 'Optional single-cell divergence check target.' }
      }
    }
  },
  {
    name: 'reconcile_diverged_step',
    description: 'Reconcile a diverged preprocessing step by absorbing edits or creating a linked revised step.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string' },
        stepId: { type: 'string' },
        strategy: {
          type: 'string',
          enum: ['absorb_edit', 'create_linked_step'],
          description: 'absorb_edit updates the existing step; create_linked_step leaves old step diverged and creates a new linked step.'
        },
        title: { type: 'string', description: 'Optional title override when creating a linked step.' }
      },
      required: ['stepId']
    }
  }
];
