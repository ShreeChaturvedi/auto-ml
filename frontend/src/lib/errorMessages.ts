/**
 * errorMessages — Maps backend workflow error codes to user-friendly display text.
 *
 * Each entry provides a short `title` and a longer `description` so the UI can
 * render a compact card with actionable context.
 */

export interface ErrorDisplay {
  title: string;
  description: string;
}

const ERROR_CODE_MAP: Record<string, ErrorDisplay> = {
  DATASET_NOT_FOUND: {
    title: 'Dataset not found',
    description: 'The dataset referenced by this workflow no longer exists. Upload or select a different dataset to continue.',
  },
  DATASET_REQUIRED: {
    title: 'Dataset required',
    description: 'This workflow phase requires a dataset. Go back to the upload step and select one before retrying.',
  },
  FE_PIPELINE_APPROVAL_REQUIRED: {
    title: 'Feature pipeline not approved',
    description: 'Training requires an approved feature engineering pipeline. Complete and approve the feature phase first.',
  },
  MODEL_TOOL_OUTPUT_INVALID: {
    title: 'Model produced invalid output',
    description: 'The AI model returned an unexpected response. This is usually transient — retrying often resolves it.',
  },
  TOOL_CALL_LIMIT_EXCEEDED: {
    title: 'Tool call limit exceeded',
    description: 'The workflow repeated a tool too many times without progressing. This can happen with complex multi-step requests. Try breaking your request into smaller steps or retrying.',
  },
  MAX_ITERATIONS_EXCEEDED: {
    title: 'Iteration limit reached',
    description: 'The workflow hit the maximum number of iterations for one turn. Try breaking your request into smaller steps.',
  },
  REQUEST_NOT_PREPARED: {
    title: 'Request not prepared',
    description: 'The workflow could not prepare the model request. This is unexpected — please retry.',
  },
  DETERMINISTIC_ACTION_EMPTY: {
    title: 'No actions generated',
    description: 'The workflow expected to produce tool calls but generated none. Retrying may resolve this.',
  },
  DELEGATED_ACTION_EMPTY: {
    title: 'No actions generated',
    description: 'A delegated workflow step produced no tool calls. This is usually transient — try again.',
  },
  WORKFLOW_PLAN_INVALID: {
    title: 'Invalid workflow plan',
    description: 'The model produced a plan that could not be validated. Retrying usually fixes this.',
  },
  UPSTREAM_RATE_LIMITED: {
    title: 'Model provider rate limit reached',
    description:
      'The AI model provider is temporarily throttling requests (HTTP 429). This is a short-term burst limit, not a billing quota issue. Wait a few seconds and retry.',
  },
  UPSTREAM_MODEL_UNAVAILABLE: {
    title: 'Model temporarily unavailable',
    description:
      'The selected AI model is unavailable right now. Retry in a moment, or switch to a different model from the model selector.',
  },
  UPSTREAM_AUTH_FAILED: {
    title: 'Provider authentication failed',
    description:
      'The server could not authenticate with the AI provider. This is a configuration issue — contact your administrator.',
  },
  UPSTREAM_TIMEOUT: {
    title: 'Model request timed out',
    description:
      'The AI provider took too long to respond. Retry, or switch to a faster model from the model selector.',
  },
  UPSTREAM_UNKNOWN: {
    title: 'Model provider error',
    description:
      'An unexpected error occurred while contacting the AI provider. Retrying usually resolves this.',
  },
  WORKFLOW_ALREADY_RUNNING: {
    title: 'Another workflow is already running',
    description:
      'A workflow for this phase is already in progress. Wait for it to finish or reset the draft before starting a new turn.',
  },
};

const FALLBACK_DISPLAY: ErrorDisplay = {
  title: 'Workflow error',
  description: 'Something went wrong during the workflow.',
};

/**
 * Resolve an error code (+ optional raw message) into a user-friendly display.
 * Falls back to the raw message wrapped in a generic title when the code is unknown.
 */
export function resolveErrorDisplay(code?: string | null, fallbackMessage?: string): ErrorDisplay {
  if (code && ERROR_CODE_MAP[code]) {
    return ERROR_CODE_MAP[code];
  }
  if (fallbackMessage) {
    return { title: FALLBACK_DISPLAY.title, description: fallbackMessage };
  }
  return FALLBACK_DISPLAY;
}
