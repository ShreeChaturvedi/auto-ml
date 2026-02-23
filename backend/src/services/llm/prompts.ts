import type { DatasetProfile } from '../../types/dataset.js';
import type { FeatureMethod } from '../featureEngineering.js';
import type {
  LlmRequest,
  LlmToolDefinition,
  LlmToolCallHistory,
  LlmToolResultHistory
} from './llmClient.js';
import type { ToolResult } from '../../types/llm.js';
import { LLM_ALL_TOOLS } from './toolRegistry.js';

function buildSystemPrompt() {
  return `You are an ML assistant. You help users explore datasets, write code, and train machine learning models.

RESPONSE FORMAT:
- Respond in proper markdown. Use **bold**, *italic*, bullet points, headers, and code blocks.
- Never output JSON, XML, or custom structured data as your response text. Markdown only.
- When you need to show tabular data, use markdown tables.
- For code blocks, ALWAYS use triple backticks with language identifier:
  \`\`\`python
  print("Hello")
  \`\`\`
  Never write code without proper triple backtick fencing.
- For inline code, use single backticks: \`variable_name\`
- For mathematical equations, use LaTeX with proper delimiters:
  - Inline math: $E = mc^2$
  - Display math: $$x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}$$
  - Do NOT use code blocks with "latex" label. Always use $ or $$ delimiters.

DATASET ACCESS:
When writing Python code to access datasets, use the resolve_dataset_path() function:
\`\`\`python
dataset_path = resolve_dataset_path("filename.csv", "datasetId")
df = pd.read_csv(dataset_path)
\`\`\`
The resolve_dataset_path function is pre-defined in the execution environment. Never use direct file paths.

WORKFLOW:
- Use the provided tools via native function calling when you need to take actions
- After tools complete, summarize results in plain markdown
- Be conversational. Answer questions directly.`;
}

export function buildFeatureEngineeringRequest(params: {
  dataset: DatasetProfile;
  targetColumn?: string;
  prompt?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  featureMethods: FeatureMethod[];
  toolDefinitions?: LlmToolDefinition[];
  enableThinking?: boolean;
}): LlmRequest {
  const {
    dataset,
    targetColumn,
    prompt,
    ragSnippets,
    toolResults,
    toolCallHistory,
    toolResultHistory,
    featureMethods,
    toolDefinitions,
    enableThinking
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const toolSummary = toolResults?.length
    ? `Tool results available for: ${toolResults.map((result) => result.tool).join(', ')}.`
    : 'Tool results: (none)';

  const userContent = [
    `Goal: Generate a feature engineering plan and UI for dataset "${dataset.filename}".`,
    prompt ? `User intent: ${prompt}` : 'User intent: (not provided)',
    `Target column: ${targetColumn ?? 'unspecified'}`,
    `Dataset summary: ${dataset.nRows} rows, ${dataset.nCols} columns.`,
    `Columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}`,
    'Dataset access: use resolve_dataset_path(filename, datasetId) when writing Python code.',
    dataset.sample?.length
      ? `Sample rows: ${JSON.stringify(dataset.sample.slice(0, 5))}`
      : 'Sample rows: (none)',
    ragSnippets?.length
      ? `RAG snippets:\n${ragSnippets.map((doc, idx) => `${idx + 1}. ${doc.filename}: ${doc.snippet}`).join('\n')}`
      : 'RAG snippets: (none)',
    toolSummary,
    toolResults?.length
      ? 'If the tool results are sufficient, call render_ui. Otherwise call another tool.'
      : '',
    `Supported feature methods: ${featureMethods.join(', ')}.`,
    'Select only relevant UI items. Use code_cell only when runnable code is essential.'
  ].filter(Boolean).join('\n');

  return {
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    maxOutputTokens: 2048,
    tools,
    toolChoice: 'auto',
    toolCallHistory,
    toolResultHistory,
    enableThinking,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}

export function buildTrainingRequest(params: {
  dataset: DatasetProfile;
  targetColumn?: string;
  prompt?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  featureSummary?: string;
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  toolDefinitions?: LlmToolDefinition[];
  enableThinking?: boolean;
}): LlmRequest {
  const {
    dataset,
    targetColumn,
    prompt,
    ragSnippets,
    toolResults,
    featureSummary,
    toolCallHistory,
    toolResultHistory,
    toolDefinitions,
    enableThinking
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;

  // Build context block that is INFORMATIONAL, not instructional
  const contextParts = [
    `[Context - Available dataset: "${dataset.filename}" (${dataset.nRows} rows, ${dataset.nCols} columns)]`,
    targetColumn ? `[Target column: ${targetColumn}]` : null,
    `[Columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}]`,
    featureSummary ? `[Feature engineering applied: ${featureSummary}]` : null,
    ragSnippets?.length
      ? `[Relevant docs:\n${ragSnippets.map((doc) => `- ${doc.filename}: ${doc.snippet.slice(0, 200)}`).join('\n')}]`
      : null,
    toolResults?.length
      ? `[Previous tool results: ${toolResults.map((r) => `${r.tool}: ${r.error ?? 'success'}`).join(', ')}]`
      : null
  ].filter(Boolean);

  // User prompt is the PRIMARY content
  // If no prompt (shouldn't happen), just pass context
  const userContent = prompt
    ? `${prompt}\n\n${contextParts.join('\n')}`
    : contextParts.join('\n');

  return {
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4,
    maxOutputTokens: 4096,
    tools,
    toolChoice: 'auto',
    toolCallHistory,
    toolResultHistory,
    enableThinking,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}
