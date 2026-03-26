import { describe, expect, it } from 'vitest';

import {
  getModelOption,
  normalizeAssistantModelValue,
  type AssistantModelOption
} from './modelOptions';

const MODEL_OPTIONS: AssistantModelOption[] = [
  {
    value: 'gpt-5.4',
    label: 'GPT 5.4',
    kind: 'base',
    description: 'Strongest model for complex planning, tool orchestration, and high-stakes work.',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true
  },
  {
    value: 'gpt-5.4-mini',
    label: 'GPT 5.4 Mini',
    kind: 'mini',
    description: 'Use for most everyday tasks with strong quality at lower cost.',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'medium',
    featured: true
  },
  {
    value: 'gpt-5.4-nano',
    label: 'GPT 5.4 Nano',
    kind: 'nano',
    description: 'Use for fast, simple tasks and high-volume requests.',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'low',
    featured: true
  }
];

describe('modelOptions', () => {
  it('maps legacy mini and nano values to the GPT-5.4 catalog values', () => {
    expect(normalizeAssistantModelValue('gpt-5-mini')).toBe('gpt-5.4-mini');
    expect(normalizeAssistantModelValue('gpt-5-nano')).toBe('gpt-5.4-nano');
  });

  it('resolves legacy values to the matching current model option', () => {
    expect(getModelOption('gpt-5-mini', MODEL_OPTIONS).value).toBe('gpt-5.4-mini');
    expect(getModelOption('gpt-5-nano', MODEL_OPTIONS).value).toBe('gpt-5.4-nano');
  });
});
