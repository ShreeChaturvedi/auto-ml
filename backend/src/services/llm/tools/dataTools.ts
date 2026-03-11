import type { LlmToolDefinition } from '../llmClient.js';

export const DATA_TOOL_DEFINITIONS: LlmToolDefinition[] = [
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
  }
];
