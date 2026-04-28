import type { LlmClient, LlmRequest, LlmStreamHandlers } from '../llmClient.js';

const MOCK_STEP_TITLE = 'Create preprocessing test checkpoint';
const MOCK_CODE = [
  '# Cell 1',
  'missing_summary = df.isna().sum()',
  'print(missing_summary.to_dict())',
  '',
  '# Cell 2',
  'df = df.copy()',
  'print(f"mock preprocessing checkpoint rows={len(df)} cols={len(df.columns)}")'
].join('\n');

function getSystemPrompt(request: LlmRequest): string {
  return request.messages.find((message) => message.role === 'system')?.content ?? '';
}

function getUserPrompt(request: LlmRequest): string {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index];
    if (message.role === 'user') {
      return message.content;
    }
  }
  return '';
}

function isClassifierRequest(request: LlmRequest): boolean {
  return request.responseMimeType === 'application/json'
    && getSystemPrompt(request).includes('strict preprocessing turn classifier');
}

function isPlannerRequest(request: LlmRequest): boolean {
  return request.responseMimeType === 'application/json'
    && getSystemPrompt(request).includes('strict workflow planner')
    && getSystemPrompt(request).includes('Workflow phase: preprocessing');
}

function isCodeGenerationRequest(request: LlmRequest): boolean {
  return getSystemPrompt(request).includes('You are a Python data preprocessing expert');
}

function classifyPromptMode(request: LlmRequest): 'answer_only' | 'action_required' {
  const prompt = getUserPrompt(request).toLowerCase();
  const wantsExplanation = /\b(why|what|how|explain|diagnose|understand)\b/.test(prompt) || prompt.includes('?');
  const wantsMutation = /\b(clean|fix|drop|scale|encode|impute|create|apply|continue|run|transform|checkpoint)\b/.test(prompt);
  return wantsExplanation && !wantsMutation ? 'answer_only' : 'action_required';
}

function buildPlannerResponse(): string {
  return JSON.stringify({
    kind: 'tool_call',
    toolName: 'propose_transformation_step',
    toolArgs: {
      title: MOCK_STEP_TITLE,
      intentType: 'checkpoint_dataset_state',
      rationale: 'Create a safe preprocessing checkpoint and summarize missing-value state before further cleaning.',
      requiresApproval: false
    },
    rationale: 'Create a deterministic preprocessing checkpoint step.'
  });
}

function buildTextResponse(request: LlmRequest): string {
  const system = getSystemPrompt(request);
  if (system.includes('This turn is answer-only')) {
    return 'Mock preprocessing mode is active. This turn explains the workflow without mutating the dataset.';
  }
  if (system.includes('The workflow is blocked on explicit user approval')) {
    return 'This preprocessing step is waiting for approval before any commit is applied.';
  }
  if (system.includes('Your next action should commit the validated step')) {
    return 'Preprocessing checkpoint committed successfully. A derived dataset snapshot is now available for the next phase.';
  }
  return 'Preprocessing checkpoint created successfully. The derived dataset is ready for the next workflow step.';
}

export class MockPreprocessingClient implements LlmClient {
  async complete(request: LlmRequest): Promise<string> {
    if (isClassifierRequest(request)) {
      return JSON.stringify({
        turnMode: classifyPromptMode(request),
        rationale: 'Mock preprocessing classifier selected a deterministic route.'
      });
    }

    if (isPlannerRequest(request)) {
      return buildPlannerResponse();
    }

    if (isCodeGenerationRequest(request)) {
      return MOCK_CODE;
    }

    throw new Error('Mock preprocessing client received an unsupported completion request shape.');
  }

  async stream(request: LlmRequest, handlers: LlmStreamHandlers): Promise<string> {
    const text = buildTextResponse(request);
    handlers.onToken(text);
    return text;
  }
}

export { MOCK_CODE, MOCK_STEP_TITLE };
