import type { LlmToolDefinition } from './llmClient.js';

export const LLM_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: 'list_project_files',
    description: 'List datasets and documents available for the project.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_dataset_profile',
    description: 'Fetch full dataset profile (columns, dtypes, stats, sample). Use datasetId from list_project_files.',
    parameters: {
      type: 'object',
      properties: {
        datasetId: { type: 'string' }
      },
      required: ['datasetId']
    }
  },
  {
    name: 'get_dataset_sample',
    description: 'Fetch a small sample of dataset rows for inspection. Use datasetId from list_project_files.',
    parameters: {
      type: 'object',
      properties: {
        datasetId: { type: 'string' }
      },
      required: ['datasetId']
    }
  },
  {
    name: 'search_documents',
    description: 'Search uploaded documents for relevant context snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['query']
    }
  },
  {
    name: 'list_cells',
    description: 'List all code cells in the notebook. Returns each cell\'s UUID (id), title, and execution status. Use the returned id field when calling other cell tools.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'read_cell',
    description: 'Read the code content and output of a specific cell by its ID.',
    parameters: {
      type: 'object',
      properties: {
        cellId: { type: 'string', description: 'The UUID of the cell (from list_cells id field). Must be a valid UUID, not a cell name or title.' }
      },
      required: ['cellId']
    }
  },
  {
    name: 'write_cell',
    description: 'Create a new code cell or update an existing cell with Python code.',
    parameters: {
      type: 'object',
      properties: {
        cellId: { type: 'string', description: 'Optional UUID of existing cell to update. If omitted, creates a new cell.' },
        title: { type: 'string', description: 'Optional title for the cell.' },
        content: { type: 'string', description: 'The Python code content for the cell.' }
      },
      required: ['content']
    }
  },
  {
    name: 'run_cell',
    description: 'Execute a code cell by its ID and return the output.',
    parameters: {
      type: 'object',
      properties: {
        cellId: { type: 'string', description: 'The UUID of the cell to execute (from list_cells id field). Must be a valid UUID, not a cell name.' }
      },
      required: ['cellId']
    }
  },
  {
    name: 'edit_cell',
    description: 'Edit specific lines in an existing code cell. Use this for targeted changes instead of rewriting the whole cell.',
    parameters: {
      type: 'object',
      properties: {
        cellId: { type: 'string', description: 'The UUID of the cell to edit (from list_cells id field). Must be a valid UUID.' },
        startLine: { type: 'number', description: '1-indexed line number where edit starts.' },
        endLine: { type: 'number', description: '1-indexed line number where edit ends (inclusive). If same as startLine, replaces that single line.' },
        newContent: { type: 'string', description: 'The new content to replace lines startLine through endLine.' }
      },
      required: ['cellId', 'startLine', 'endLine', 'newContent']
    }
  },
  {
    name: 'delete_cell',
    description: 'Delete a cell from the notebook by its ID.',
    parameters: {
      type: 'object',
      properties: {
        cellId: { type: 'string', description: 'The UUID of the cell to delete (from list_cells id field). Must be a valid UUID.' }
      },
      required: ['cellId']
    }
  },
  {
    name: 'reorder_cells',
    description: 'Reorder cells in the notebook. Provide all cell IDs in the desired order.',
    parameters: {
      type: 'object',
      properties: {
        cellIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of cell IDs in the desired order. Must include all cells in the notebook.'
        }
      },
      required: ['cellIds']
    }
  },
  {
    name: 'insert_cell',
    description: 'Insert a new cell at a specific position in the notebook.',
    parameters: {
      type: 'object',
      properties: {
        position: { type: 'number', description: '0-indexed position where to insert the cell.' },
        content: { type: 'string', description: 'The code or markdown content for the cell.' },
        title: { type: 'string', description: 'Optional title for the cell.' },
        cellType: { type: 'string', enum: ['code', 'markdown'], description: 'Type of cell. Defaults to code.' }
      },
      required: ['position', 'content']
    }
  },
  // Package management tools
  {
    name: 'install_package',
    description: 'Install a Python package in the runtime environment. The package will be available in code cells.',
    parameters: {
      type: 'object',
      properties: {
        packageName: { type: 'string', description: 'The package name to install (e.g., "pandas", "scikit-learn>=1.0", "torch").' }
      },
      required: ['packageName']
    }
  },
  {
    name: 'uninstall_package',
    description: 'Uninstall a Python package from the runtime environment.',
    parameters: {
      type: 'object',
      properties: {
        packageName: { type: 'string', description: 'The package name to uninstall.' }
      },
      required: ['packageName']
    }
  },
  {
    name: 'list_packages',
    description: 'List all installed Python packages in the runtime environment.',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];

export const LLM_RENDER_UI_TOOL: LlmToolDefinition = {
  name: 'render_ui',
  description: 'Render the structured UI schema for this response. Pass the UI JSON as a stringified payload.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Optional message to accompany the UI.' },
      payload: {
        type: 'string',
        description: 'Stringified JSON for the UI schema. Must be valid JSON string.'
      }
    },
    required: ['payload']
  }
};

export const ASK_USER_TOOL: LlmToolDefinition = {
  name: 'ask_user',
  description: 'Ask the user one or more questions to clarify their intent. Each question can have predefined options (multiple choice) or be free-text. The user will see these as interactive UI cards and respond. Use this to gather requirements before generating a plan.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for this question' },
            question: { type: 'string', description: 'The full question text' },
            header: { type: 'string', description: 'Short label (max 30 chars)' },
            type: {
              type: 'string',
              enum: ['single_select', 'multi_select', 'free_text'],
              description: 'Question type'
            },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'Short display text (1-5 words)' },
                  description: { type: 'string', description: 'Explanation of this choice' }
                },
                required: ['label', 'description']
              },
              description: 'Available choices. For free_text type, this can be empty or contain suggestions.'
            },
            allowCustom: {
              type: 'boolean',
              description: 'Whether user can type a custom answer in addition to selecting options. Defaults to true for single_select/multi_select.'
            }
          },
          required: ['id', 'question', 'header', 'type']
        }
      }
    },
    required: ['questions']
  }
};

export const PLAN_EXIT_TOOL: LlmToolDefinition = {
  name: 'plan_exit',
  description: 'Finalize onboarding planning and return the complete plan file content. Use this only when you are done asking questions and have enough context.',
  parameters: {
    type: 'object',
    properties: {
      planName: {
        type: 'string',
        description: 'Short filename slug for the plan, without directories. Example: customer-churn-plan.md'
      },
      planMarkdown: {
        type: 'string',
        description: 'Full markdown content of the final project plan. Include all required sections.'
      }
    },
    required: ['planMarkdown']
  }
};

const PREPROCESSING_ORCHESTRATION_TOOLS: LlmToolDefinition[] = [
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
        datasetId: { type: 'string' },
        label: { type: 'string' }
      },
      required: ['stepId']
    }
  }
];

const NOTEBOOK_EXECUTION_TOOLS = [
  'list_cells',
  'read_cell',
  'write_cell',
  'edit_cell',
  'run_cell',
  'delete_cell',
  'reorder_cells',
  'insert_cell'
];

const FEATURE_DISCOVERY_TOOLS = [
  'list_project_files',
  'get_dataset_profile',
  'get_dataset_sample',
  'search_documents'
];

export const LLM_ALL_TOOLS: LlmToolDefinition[] = [
  ...LLM_TOOL_DEFINITIONS,
  LLM_RENDER_UI_TOOL
];

export const LLM_FEATURE_ENGINEERING_TOOLS: LlmToolDefinition[] = [
  ...LLM_TOOL_DEFINITIONS.filter((tool) =>
    FEATURE_DISCOVERY_TOOLS.includes(tool.name) || NOTEBOOK_EXECUTION_TOOLS.includes(tool.name)
  ),
  ASK_USER_TOOL,
  LLM_RENDER_UI_TOOL
];

export const LLM_PREPROCESSING_TOOLS: LlmToolDefinition[] = [
  ...PREPROCESSING_ORCHESTRATION_TOOLS,
  ...LLM_TOOL_DEFINITIONS.filter((tool) => NOTEBOOK_EXECUTION_TOOLS.includes(tool.name)),
  LLM_RENDER_UI_TOOL
];

export const LLM_ONBOARDING_TOOLS: LlmToolDefinition[] = [
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'list_project_files')!,
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'get_dataset_profile')!,
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'get_dataset_sample')!,
  LLM_TOOL_DEFINITIONS.find(t => t.name === 'search_documents')!,
  ASK_USER_TOOL,
  PLAN_EXIT_TOOL
];

export function buildToolDescriptionText(tools: LlmToolDefinition[] = LLM_ALL_TOOLS): string {
  return tools.map((tool) => {
    const params = JSON.stringify(tool.parameters);
    return `- ${tool.name}(${params}): ${tool.description}`;
  }).join('\n');
}
