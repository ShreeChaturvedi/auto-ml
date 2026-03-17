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

export interface NlSuggestionCacheEntry {
  expiresAt: number;
  suggestions: NlSuggestion[];
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
  getClient: (model: string) => import('../llm/llmClient.js').LlmClient;
  now: () => number;
  cacheTtlMs: number;
}
