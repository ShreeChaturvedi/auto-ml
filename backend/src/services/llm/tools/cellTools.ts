import type { LlmToolDefinition } from '../llmClient.js';

export const CELL_TOOL_DEFINITIONS: LlmToolDefinition[] = [
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
    description: 'Create a new notebook cell or update an existing cell. Use markdown cells for section headers and narrative, and code cells for executable Python.',
    parameters: {
      type: 'object',
      properties: {
        cellId: { type: 'string', description: 'Optional UUID of existing cell to update. If omitted, creates a new cell.' },
        title: { type: 'string', description: 'Optional title for the cell.' },
        content: { type: 'string', description: 'The Python code content for the cell.' },
        cellType: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type. Defaults to code.' },
        metadata: {
          type: 'object',
          description: 'Optional cell metadata. For preprocessing lineage use metadata.preprocessing with runId, stepId, toolCallId, version, codeHash.'
        }
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
        cellId: { type: 'string', description: 'The UUID of the cell to execute (from list_cells id field). Must be a valid UUID, not a cell name.' },
        metadata: {
          type: 'object',
          description: 'Optional cell metadata to persist before execution.'
        }
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
        newContent: { type: 'string', description: 'The new content to replace lines startLine through endLine.' },
        metadata: {
          type: 'object',
          description: 'Optional cell metadata. For preprocessing lineage use metadata.preprocessing with runId, stepId, toolCallId, version, codeHash.'
        }
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
  }
];
