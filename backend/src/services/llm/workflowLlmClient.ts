import { env } from '../../config.js';

import type { LlmClient } from './llmClient.js';
import { createLlmClient } from './llmClient.js';
import { MockPreprocessingClient } from './providers/mockPreprocessingClient.js';

interface WorkflowLlmClientOptions {
  phase?: string;
  modelOverride?: string;
  timeoutMsOverride?: number;
}

export function createWorkflowLlmClient(options: WorkflowLlmClientOptions = {}): LlmClient {
  if (env.llmProvider === 'mock' && options.phase === 'preprocessing') {
    return new MockPreprocessingClient();
  }

  return createLlmClient(options.modelOverride, options.timeoutMsOverride);
}
