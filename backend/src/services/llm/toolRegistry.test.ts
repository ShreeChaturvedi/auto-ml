import { describe, expect, it } from 'vitest';

import {
  ASK_USER_TOOL,
  LLM_ALL_TOOLS,
  LLM_ONBOARDING_TOOLS
} from './toolRegistry.js';

describe('toolRegistry', () => {
  it('defines ask_user with expected parameter shape', () => {
    expect(ASK_USER_TOOL.name).toBe('ask_user');
    expect(ASK_USER_TOOL.parameters).toMatchObject({
      type: 'object',
      required: ['questions'],
      properties: {
        questions: {
          type: 'array'
        }
      }
    });

    const questions = (ASK_USER_TOOL.parameters.properties as Record<string, unknown>).questions as {
      items?: {
        properties?: {
          type?: {
            enum?: string[];
          };
        };
      };
    };
    expect(questions.items?.properties?.type?.enum).toEqual(['single_select', 'multi_select', 'free_text']);
  });

  it('excludes ask_user from global tools and includes it in onboarding tools', () => {
    expect(LLM_ALL_TOOLS.some((tool) => tool.name === 'ask_user')).toBe(false);
    expect(LLM_ONBOARDING_TOOLS.some((tool) => tool.name === 'ask_user')).toBe(true);

    expect(LLM_ONBOARDING_TOOLS.map((tool) => tool.name)).toEqual([
      'list_project_files',
      'get_dataset_profile',
      'get_dataset_sample',
      'search_documents',
      'ask_user'
    ]);
  });
});
