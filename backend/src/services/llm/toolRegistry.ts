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

export const LLM_ALL_TOOLS: LlmToolDefinition[] = [
  ...LLM_TOOL_DEFINITIONS,
  LLM_RENDER_UI_TOOL
];

export function buildToolDescriptionText(tools: LlmToolDefinition[] = LLM_ALL_TOOLS): string {
  return tools.map((tool) => {
    const params = JSON.stringify(tool.parameters);
    return `- ${tool.name}(${params}): ${tool.description}`;
  }).join('\n');
}
