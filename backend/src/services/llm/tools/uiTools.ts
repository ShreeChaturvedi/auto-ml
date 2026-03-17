import type { LlmToolDefinition } from '../llmClient.js';

export const LLM_RENDER_UI_TOOL: LlmToolDefinition = {
  name: 'render_ui',
  description: 'Render the structured UI schema for this response. Pass the UI JSON as a stringified payload.',
  parameters: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Optional message to accompany the UI.' },
      payload: {
        type: 'string',
        description: 'Stringified JSON for the UI schema. Must be valid JSON string.'
      }
    },
    required: ['payload']
  }
};

export const ASK_USER_TOOL: LlmToolDefinition = {
  name: 'ask_user',
  description: 'Ask the user one or more questions to clarify their intent. Each question can have predefined options (multiple choice) or be free-text. The user will see these as interactive UI cards and respond. Use this to gather requirements before generating a plan.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for this question' },
            question: { type: 'string', description: 'The full question text' },
            header: { type: 'string', description: 'Short label (max 30 chars)' },
            type: {
              type: 'string',
              enum: ['single_select', 'multi_select', 'free_text'],
              description: 'Question type'
            },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'Short display text (1-5 words)' },
                  description: { type: 'string', description: 'Explanation of this choice' }
                },
                required: ['label', 'description']
              },
              description: 'Available choices. For free_text type, this can be empty or contain suggestions.'
            },
            allowCustom: {
              type: 'boolean',
              description: 'Whether user can type a custom answer in addition to selecting options. Defaults to true for single_select/multi_select.'
            }
          },
          required: ['id', 'question', 'header', 'type']
        }
      }
    },
    required: ['questions']
  }
};

export const PLAN_EXIT_TOOL: LlmToolDefinition = {
  name: 'plan_exit',
  description: 'Finalize onboarding planning and return the complete plan file content. Use this only when you are done asking questions and have enough context.',
  parameters: {
    type: 'object',
    properties: {
      planName: {
        type: 'string',
        description: 'Short filename slug for the plan, without directories. Example: customer-churn-plan.md'
      },
      planMarkdown: {
        type: 'string',
        description: 'Full markdown content of the final project plan. Include all required sections.'
      }
    },
    required: ['planMarkdown']
  }
};
