/**
 * Feature engineering workflow prompt builder.
 */

import type { DatasetProfile } from '../../../types/dataset.js';
import type { ToolResult } from '../../../types/llm.js';
import type { FeatureMethod } from '../../featureEngineering.js';
import type {
  LlmRequest,
  LlmToolDefinition,
  LlmToolCallHistory,
  LlmToolResultHistory
} from '../llmClient.js';
import type { LlmReasoningEffort } from '../modelCatalog.js';
import { LLM_ALL_TOOLS } from '../toolRegistry.js';

import { FEATURE_ENGINEERING_CONTRACT } from './featureContract.js';
import { buildSystemPrompt } from './system.js';
import {
  truncateText,
  summarizeFeatureSampleRows,
  summarizeFeatureToolResults,
  MAX_FEATURE_PLAN_CHARS,
  MAX_FEATURE_RAG_SNIPPET_CHARS
} from './toolUsage.js';

/** Ordered lifecycle stages — index determines what comes "next". */
const LIFECYCLE_SEQUENCE: readonly string[] = [
  'propose_feature',
  'materialize_feature_code',
  'execute_feature',
  'validate_feature',
  'register_feature',
  'checkpoint_feature_pipeline'
];

const LIFECYCLE_SET = new Set(LIFECYCLE_SEQUENCE);

function extractSelectedFeatureIds(userPrompt: string | undefined): string[] {
  if (!userPrompt) {
    return [];
  }

  const match = userPrompt.match(/^Selected feature IDs to implement:\s*(.+)$/im);
  if (!match) {
    return [];
  }

  return match[1]
    .split(/\s*,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Walk backwards through tool results, find the most recent lifecycle tool,
 * extract the featureId from its output, and return a one-line directive
 * telling the model exactly which tool to call next and for which feature.
 */
function buildContinuationDirective(
  toolResults: ToolResult[] | undefined,
  userPrompt: string | undefined
): string | undefined {
  const selectedFeatureIds = extractSelectedFeatureIds(userPrompt);

  if (!toolResults?.length) {
    if (selectedFeatureIds.length > 0) {
      return `The user already selected feature "${selectedFeatureIds[0]}" for implementation. Call materialize_feature_code for "${selectedFeatureIds[0]}" first using the enabled feature definition from the user message. Do NOT propose more features.`;
    }
    return undefined;
  }

  // Filter to lifecycle-only results (ignore notebook/data tools)
  const lifecycleResults = toolResults.filter((r) => LIFECYCLE_SET.has(r.tool));
  if (!lifecycleResults.length) {
    if (selectedFeatureIds.length > 0) {
      return `The user already selected feature "${selectedFeatureIds[0]}" for implementation. Call materialize_feature_code for "${selectedFeatureIds[0]}" first using the enabled feature definition from the user message. Do NOT propose more features.`;
    }
    return undefined;
  }

  const last = lifecycleResults[lifecycleResults.length - 1];
  const output = last.output && typeof last.output === 'object' && !Array.isArray(last.output)
    ? (last.output as Record<string, unknown>)
    : undefined;
  const featureId = typeof output?.featureId === 'string' ? output.featureId : undefined;

  // If the last tool errored, retry the same stage
  if (last.error) {
    return featureId
      ? `Retry ${last.tool} for feature "${featureId}" — the previous attempt failed: ${last.error}`
      : `Retry ${last.tool} — the previous attempt failed: ${last.error}`;
  }

  // Checkpoint was the last call — lifecycle complete
  if (last.tool === 'checkpoint_feature_pipeline') {
    return 'The feature pipeline has been checkpointed. Summarize progress via render_ui.';
  }

  // Pause after proposals until the user explicitly selects feature IDs.
  const allProposals = lifecycleResults.every((r) => r.tool === 'propose_feature');
  if (allProposals) {
    const countMatch = userPrompt?.match(/\b(\d+)\s*(?:features?|columns?|transforms?|transformations?)\b/i)
      ?? userPrompt?.match(/\b(?:features?|columns?|transforms?|transformations?)\s*.*?(\d+)\b/i);
    const requestedCount = countMatch ? Math.min(parseInt(countMatch[1], 10), 10) : 0;
    const proposedCount = lifecycleResults.filter((r) => r.tool === 'propose_feature' && !r.error).length;

    // Enforce minimum 3 proposals (or explicit count if higher)
    const targetCount = Math.max(requestedCount, 3);
    if (proposedCount < targetCount) {
      return `You have proposed ${proposedCount} of ${targetCount} features. Call propose_feature for ${targetCount - proposedCount} more diverse candidate(s).`;
    }

    if (selectedFeatureIds.length === 0) {
      return 'All features have been proposed. Present proposals via render_ui with feature_suggestion items. Do NOT materialize code — wait for the user to select which features to implement.';
    }

    if (selectedFeatureIds.length > 0) {
      const selectedSet = new Set(selectedFeatureIds);
      const selectedProposals = lifecycleResults
        .filter((result) => result.tool === 'propose_feature' && !result.error)
        .map((result) => {
          const proposalOutput = result.output && typeof result.output === 'object' && !Array.isArray(result.output)
            ? (result.output as Record<string, unknown>)
            : undefined;
          if (!proposalOutput || typeof proposalOutput.featureId !== 'string' || !selectedSet.has(proposalOutput.featureId)) {
            return undefined;
          }

          return {
            featureId: proposalOutput.featureId,
            featureName: typeof proposalOutput.featureName === 'string' ? proposalOutput.featureName : proposalOutput.featureId,
            method: typeof proposalOutput.method === 'string' ? proposalOutput.method : 'custom',
            sourceColumns: Array.isArray(proposalOutput.sourceColumns)
              ? proposalOutput.sourceColumns.filter((value): value is string => typeof value === 'string')
              : []
          };
        })
        .filter((proposal): proposal is {
          featureId: string;
          featureName: string;
          method: string;
          sourceColumns: string[];
        } => Boolean(proposal));

      if (selectedProposals.length > 0) {
        const [firstSelectedProposal] = selectedProposals;
        const proposalSummary = selectedProposals
          .map((proposal) => `"${proposal.featureId}" (${proposal.featureName}: ${proposal.method} on ${proposal.sourceColumns.join(', ') || 'unspecified columns'})`)
          .join(', ');
        return selectedProposals.length === 1
          ? `The user enabled feature ${proposalSummary}. Call materialize_feature_code for "${firstSelectedProposal.featureId}" first, using the proposed feature definition exactly as reviewed. Do NOT materialize or execute unselected proposals.`
          : `The user enabled ${selectedProposals.length} proposed features: ${proposalSummary}. Start with "${firstSelectedProposal.featureId}" by calling materialize_feature_code using the reviewed proposal details for that feature. Do NOT materialize or execute unselected proposals.`;
      }
    }

    return 'Selected feature IDs were not found in the current proposal set. Present proposals via render_ui and ask the user to re-select features before implementation.';
  }

  // Determine the next lifecycle tool
  const lastIndex = LIFECYCLE_SEQUENCE.indexOf(last.tool);
  if (lastIndex < 0 || lastIndex >= LIFECYCLE_SEQUENCE.length - 1) return undefined;
  const nextTool = LIFECYCLE_SEQUENCE[lastIndex + 1];

  return featureId
    ? `Next: call ${nextTool} for feature "${featureId}".`
    : `Next: call ${nextTool} for the feature currently being processed.`;
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
  reasoningEffort?: LlmReasoningEffort;
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
    reasoningEffort
  } = params;
  const tools = toolDefinitions ?? LLM_ALL_TOOLS;
  const trimmedProjectPlan = projectPlan?.trim()
    ? truncateText(projectPlan.trim(), MAX_FEATURE_PLAN_CHARS)
    : undefined;
  const basePrompt = trimmedProjectPlan
    ? `${buildSystemPrompt()}\n\n## Project Plan (approved by user)\n${trimmedProjectPlan}\n\nFollow this plan closely. It represents the user's approved approach.`
    : buildSystemPrompt();
  const systemPrompt = `${basePrompt}

${FEATURE_ENGINEERING_CONTRACT}

CRITICAL: NEVER write executable code as markdown in chat text. ALL Python code MUST be authored via write_cell into notebook cells.

TOOL USAGE INSTRUCTIONS:
You MUST use the feature engineering lifecycle tools (propose_feature, materialize_feature_code,
execute_feature, validate_feature, register_feature, checkpoint_feature_pipeline) to drive the
feature engineering process. Do NOT describe features in plain text -- call propose_feature for
each feature you want to create. The lifecycle tools are the primary mechanism for this phase.

When no prior tool results exist, call propose_feature for each candidate feature. Propose at least 3 diverse features (covering different methods and column types) before presenting results. More is better — aim for 3-5 proposals per turn.
When prior tool results exist, continue the lifecycle for the feature currently being processed
by calling the exact next tool in the sequence (propose -> materialize -> execute -> validate ->
register -> checkpoint). Follow the CONTINUATION directive in the user message.

OUTPUT ENVELOPE:
- After completing lifecycle tool work for this turn, end with exactly one of:
  1) render_ui with a non-empty ui.sections list summarizing progress, OR
  2) ask_user with concrete clarifying questions when blocked by missing requirements.
- Never call render_ui with empty sections.
- Never end the turn with only internal tool calls and no user-facing envelope.
- Prefer render_ui content that includes:
  - at least one report or callout summarizing what changed
  - feature_suggestion items when feasible
  - code_cell only when runnable code is necessary for review.
- feature_suggestion items must use this structure:
  { "id": "...", "feature": { "sourceColumn": "...", "featureName": "...", "method": "...", "params": {} }, "rationale": "...", "impact": "high|medium|low" }.
- Only call render_ui when directed by the CONTINUATION instruction in the user message, or after all lifecycle stages are complete.`;
  const toolSummary = summarizeFeatureToolResults(toolResults);
  const continuationDirective = buildContinuationDirective(toolResults, prompt);
  // When a continuation directive exists, the model MUST produce a tool call
  // (the next lifecycle tool or render_ui).  Using 'required' prevents the model
  // from consuming its entire output budget on reasoning with no actionable output.
  const effectiveToolChoice = continuationDirective ? 'any' as const : 'auto' as const;

  const userContent = [
    `Goal: Generate a feature engineering plan and UI for dataset "${dataset.filename}".`,
    prompt ? `User intent: ${prompt}` : 'User intent: (not provided)',
    `Target column: ${targetColumn ?? 'unspecified'}`,
    `Dataset summary: ${dataset.nRows} rows, ${dataset.nCols} columns.`,
    `Columns: ${dataset.columns.map((column) => `${column.name} (${column.dtype})`).join(', ')}`,
    'Dataset access: use resolve_dataset_path(filename, datasetId) when writing Python code.',
    `Sample rows: ${summarizeFeatureSampleRows(dataset.sample)}`,
    ragSnippets?.length
      ? `RAG snippets:\n${ragSnippets.map((doc, idx) => `${idx + 1}. ${doc.filename}: ${truncateText(doc.snippet, MAX_FEATURE_RAG_SNIPPET_CHARS)}`).join('\n')}`
      : 'RAG snippets: (none)',
    toolSummary,
    continuationDirective
      ? `CONTINUATION: ${continuationDirective}`
      : toolResults?.length
        ? 'Continue the feature lifecycle from the current stage.'
        : 'No prior tool results exist. Begin by calling propose_feature. Propose at least 3 diverse candidate features before stopping.',
    `Supported feature methods: ${featureMethods.join(', ')}.`,
    'Select only relevant UI items. Use code_cell only when runnable code is essential.',
    'Required: advance the lifecycle by calling the next tool in sequence. Only call render_ui or ask_user after reaching the register/checkpoint stage or when the user only requested proposals.'
  ].filter(Boolean).join('\n');

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    // Reasoning models consume output-token budget for thinking, so 4096 often leaves
    // nothing for the actual response body (rich JSON with feature suggestions, code cells).
    maxOutputTokens: 12000,
    tools,
    toolChoice: effectiveToolChoice,
    toolCallHistory,
    toolResultHistory,
    reasoningEffort,
    contextId: dataset.projectId ?? dataset.datasetId
  };
}
