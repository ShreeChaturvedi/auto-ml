import type { DatasetProfile } from '../../types/dataset.js';
import type { ToolResult } from '../../types/llm.js';
import type { FeatureMethod } from '../featureEngineering.js';

import type {
  LlmRequest,
  LlmThinkingLevel,
  LlmToolDefinition,
  LlmToolCallHistory,
  LlmToolResultHistory
} from './llmClient.js';
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
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  featureMethods: FeatureMethod[];
  toolDefinitions?: LlmToolDefinition[];
  enableThinking?: boolean;
  thinkingLevel?: LlmThinkingLevel;
}): LlmRequest {
  const {
    dataset,
    targetColumn,
    prompt,
    projectPlan,
    ragSnippets,
    toolResults,
    toolCallHistory,
    toolResultHistory,
    featureMethods,
    toolDefinitions,
    enableThinking,
    thinkingLevel
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const systemPrompt = projectPlan?.trim()
    ? `${buildSystemPrompt()}\n\n## Project Plan (approved by user)\n${projectPlan}\n\nFollow this plan closely. It represents the user's approved approach.`
    : buildSystemPrompt();
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
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    maxOutputTokens: 2048,
    tools,
    toolChoice: 'auto',
    toolCallHistory,
    toolResultHistory,
    enableThinking,
    thinkingLevel,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}

export function buildTrainingRequest(params: {
  dataset: DatasetProfile;
  targetColumn?: string;
  prompt?: string;
  projectPlan?: string;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  toolResults?: ToolResult[];
  featureSummary?: string;
  toolCallHistory?: LlmToolCallHistory[];
  toolResultHistory?: LlmToolResultHistory[];
  toolDefinitions?: LlmToolDefinition[];
  enableThinking?: boolean;
  thinkingLevel?: LlmThinkingLevel;
}): LlmRequest {
  const {
    dataset,
    targetColumn,
    prompt,
    projectPlan,
    ragSnippets,
    toolResults,
    featureSummary,
    toolCallHistory,
    toolResultHistory,
    toolDefinitions,
    enableThinking,
    thinkingLevel
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const systemPrompt = projectPlan?.trim()
    ? `${buildSystemPrompt()}\n\n## Project Plan (approved by user)\n${projectPlan}\n\nFollow this plan closely. It represents the user's approved approach.`
    : buildSystemPrompt();

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
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.4,
    maxOutputTokens: 4096,
    tools,
    toolChoice: 'auto',
    toolCallHistory,
    toolResultHistory,
    enableThinking,
    thinkingLevel,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}

export function buildOnboardingRequest(opts: {
  projectTitle: string;
  projectDescription: string;
  fileSummaries: Array<{ filename: string; type: 'dataset' | 'document'; stats?: Record<string, unknown> }>;
  userIntent?: string;
  questionAnswers?: Array<{ questionId: string; answer: string | string[] }>;
  ragSnippets?: Array<{ filename: string; snippet: string }>;
  round: number;
  toolCallHistory?: Array<{ name: string; args: Record<string, unknown> }>;
  toolResultHistory?: Array<{ name: string; response: Record<string, unknown> }>;
  toolDefinitions: LlmToolDefinition[];
  enableThinking?: boolean;
  thinkingLevel?: LlmThinkingLevel;
}): LlmRequest {
  const systemPrompt = `You are an expert data scientist and ML engineer helping a user plan their machine learning project.

## Your Mission
The user has uploaded data files and will tell you what they want to achieve. Your job is to understand their goal, inspect their data with tools, ask smart clarifying questions, and produce a comprehensive project plan.

## Your Tools
- list_project_files: See what files are available
- get_dataset_profile: Get detailed statistics for a dataset
- get_dataset_sample: See sample rows from a dataset
- search_documents: Search uploaded context documents
- ask_user: Ask the user clarifying questions (renders as interactive UI)

## Workflow
${opts.round === 0
    ? `This is the FIRST round. The user has just told you their goal.
1. FIRST: Use your data tools (list_project_files, get_dataset_profile, get_dataset_sample) to inspect the uploaded files and understand the data in context of the user's stated goal.
2. THEN: Based on what you found in the data AND the user's goal, call ask_user with 2-4 smart, data-informed clarifying questions. Reference actual columns, data patterns, and statistics you discovered. Include suggested options based on your analysis.
3. Do NOT generate the plan yet — wait for the user's answers first.`
    : `This is round ${opts.round}/5. You have the user's goal and previous answers.
1. If you need more information, use data tools and/or call ask_user with follow-up questions (2-4 per round).
2. If you have enough context, generate the final project plan as markdown text.`}

## Critical Rules
- Do NOT call render_ui. Ever.
- Do NOT generate unsolicited content or make assumptions about the user's goal.
- Use ask_user for clarifying questions — do not just print questions as text.
- When you generate the final plan, produce it as markdown text (not a tool call).
- Keep your text responses concise and focused. Do not ramble.

## Plan Format (generate as your final text response)
# Project Plan: {title}

## Objective
[Clear statement of what we're trying to achieve]

## Data Summary
[What was uploaded, key statistics, quality observations, relationships between files]

## Approach
[Methodology, algorithm candidates, rationale for choices]

## Feature Engineering Strategy
[Transformations, encodings, derived features to consider]

## Target & Evaluation
[Target variable, train/test split strategy, success metrics (accuracy, RMSE, etc.)]

## Risks & Assumptions
[Data quality issues, potential pitfalls, assumptions being made]

## Next Steps
[Ordered list of what to do next in the workflow]`;

  const formattedFileSummaries = opts.fileSummaries.length
    ? opts.fileSummaries
      .map((file, index) => {
        const stats = file.stats ? `\n  Stats: ${JSON.stringify(file.stats)}` : '';
        return `${index + 1}. ${file.filename} (${file.type})${stats}`;
      })
      .join('\n')
    : '(none)';

  const formattedAnswers = opts.questionAnswers?.length
    ? opts.questionAnswers
      .map((entry, index) => {
        const answerText = Array.isArray(entry.answer) ? entry.answer.join(', ') : entry.answer;
        return `${index + 1}. ${entry.questionId}: ${answerText}`;
      })
      .join('\n')
    : '(none)';

  const userSections: string[] = [
    `Project title: ${opts.projectTitle}`,
    `Project description: ${opts.projectDescription || '(none)'}`,
    `Current round: ${opts.round}`,
    `Uploaded files:\n${formattedFileSummaries}`,
    opts.ragSnippets?.length
      ? `RAG snippets:\n${opts.ragSnippets.map((doc, index) => `${index + 1}. ${doc.filename}: ${doc.snippet}`).join('\n')}`
      : 'RAG snippets: (none)'
  ];

  if (opts.round === 0) {
    userSections.push(`User intent: ${opts.userIntent?.trim() || '(not provided yet)'}`);
  } else {
    userSections.push(`Latest user intent note: ${opts.userIntent?.trim() || '(none)'}`);
    userSections.push(`Question answers received:\n${formattedAnswers}`);
  }

  userSections.push('If you need more clarification, call ask_user. If you have enough context, produce the final markdown plan.');

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userSections.join('\n\n') }
    ],
    temperature: 0.3,
    maxOutputTokens: 4096,
    tools: opts.toolDefinitions,
    toolChoice: 'auto',
    toolCallHistory: opts.toolCallHistory,
    toolResultHistory: opts.toolResultHistory,
    enableThinking: opts.enableThinking,
    thinkingLevel: opts.thinkingLevel,
    contextId: opts.projectTitle
  };
}
