export interface NlSuggestion {
  id: string;
  prompt: string;
  label: string;
  category: string;
  tables: string[];
  rationale: string;
}

export interface GetNlSuggestionsOptions {
  projectId: string;
  limit?: number;
}

export interface WorkflowPlaceholders {
  preprocessing: string[];
  featureEngineering: string[];
  training: string[];
  explore?: string[];
}

export interface StoredNlSuggestionSet {
  suggestionSetId: string;
  projectId: string;
  schemaFingerprint: string;
  modelId: string;
  promptVersion: number;
  createdAt: string;
  updatedAt: string;
  suggestions: NlSuggestion[];
  workflowPlaceholders?: WorkflowPlaceholders;
}

export interface SchemaColumnSummary {
  name: string;
  dtype: string;
}

export interface SchemaTableSummary {
  tableName: string;
  sourceFilename: string;
  rowCount: number;
  columns: SchemaColumnSummary[];
}

export interface RelationshipHint {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  strength: number;
  reason: string;
}

export interface NlSuggestionServiceDeps {
  datasetRepository: import('../../repositories/datasetRepository.js').DatasetRepository;
  suggestionRepository: import('../../repositories/nlSuggestionRepository.js').NlSuggestionRepository;
  getClient: (model: string) => import('../llm/llmClient.js').LlmClient;
}
