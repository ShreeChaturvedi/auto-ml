import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { LlmChatComposer } from '../LlmChatComposer';
import {
  buildInlineModelOptions,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  type AssistantModelOption,
  type ReasoningEffort
} from '../modelOptions';

const ALL_MODEL_OPTIONS: AssistantModelOption[] = [
  {
    value: 'gpt-5.4',
    label: 'GPT 5.4',
    kind: 'base',
    description: 'Best default for most chats and agentic planning.',
    supportedReasoningEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
  },
  {
    value: 'gpt-5.3-codex',
    label: 'GPT 5.3 Codex',
    kind: 'codex',
    description: 'Best when the chat is code-heavy or tool-oriented.',
    supportedReasoningEfforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT 5 Mini',
    kind: 'mini',
    description: 'Faster and cheaper while still strong for everyday work.',
    supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    featured: true,
  },
  {
    value: 'gpt-5-nano',
    label: 'GPT 5 Nano',
    kind: 'nano',
    description: 'Best for quick lightweight tasks and short prompts.',
    supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
    defaultReasoningEffort: 'low',
    featured: true,
  },
  {
    value: 'gpt-5.4-pro',
    label: 'GPT 5.4 Pro',
    kind: 'pro',
    description: 'Highest-effort reasoning for the hardest tasks.',
    supportedReasoningEfforts: ['high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: false,
  },
  {
    value: 'gpt-5.3-chat-latest',
    label: 'GPT 5.3 Chat',
    kind: 'chat',
    description: 'Latest ChatGPT-tuned GPT-5 chat model for conversational use.',
    supportedReasoningEfforts: [],
    defaultReasoningEffort: 'none',
    featured: false,
  },
  {
    value: 'gpt-5.2',
    label: 'GPT 5.2',
    kind: 'base',
    description: 'Previous flagship GPT-5 base model.',
    supportedReasoningEfforts: ['minimal', 'low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    featured: false,
  },
];

const FEATURED_MODEL_OPTIONS = ALL_MODEL_OPTIONS.filter((option) => option.featured);

function ComposerHarness({ initialReasoningEffort = 'high' }: { initialReasoningEffort?: ReasoningEffort }) {
  const [model, setModel] = useState('gpt-5.4');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(initialReasoningEffort);
  const inlineModelOptions = buildInlineModelOptions(FEATURED_MODEL_OPTIONS, ALL_MODEL_OPTIONS, model);

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel);
    setReasoningEffort(getDefaultReasoningEffort(nextModel, ALL_MODEL_OPTIONS));
  };

  return (
    <>
      <LlmChatComposer
        value="hello"
        onValueChange={() => undefined}
        onKeyDown={() => undefined}
        placeholder="Ask something"
        disabled={false}
        isStreaming={false}
        onSend={() => undefined}
        onStop={() => undefined}
        model={model}
        onModelChange={handleModelChange}
        modelOptions={inlineModelOptions}
        searchModelOptions={ALL_MODEL_OPTIONS}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={setReasoningEffort}
        reasoningOptions={getReasoningEffortOptions(model, ALL_MODEL_OPTIONS)}
      />
      <div data-testid="selection-state">{`${model}:${reasoningEffort}`}</div>
    </>
  );
}

function openModelSelect() {
  const trigger = screen.getAllByRole('combobox')[0];
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
}

describe('LlmChatComposer', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it('shows only featured latest-per-kind GPT-5 models inline and includes usage tip affordances', async () => {
    render(<ComposerHarness />);

    openModelSelect();
    const listbox = await screen.findByRole('listbox');

    expect(within(listbox).getByText('GPT 5.4')).toBeInTheDocument();
    expect(within(listbox).getByText('GPT 5.3 Codex')).toBeInTheDocument();
    expect(within(listbox).getByText('GPT 5 Mini')).toBeInTheDocument();
    expect(within(listbox).getByText('GPT 5 Nano')).toBeInTheDocument();
    expect(within(listbox).getByText('Other…')).toBeInTheDocument();
    expect(within(listbox).queryByText('GPT 5.2')).not.toBeInTheDocument();
    expect(within(listbox).queryByText('GPT 5.4 Pro')).not.toBeInTheDocument();
    expect(within(listbox).queryByText('GPT 5.3 Chat')).not.toBeInTheDocument();
    expect(within(listbox).getByLabelText('GPT 5.4 usage tip')).toBeInTheDocument();
    expect(within(listbox).getByLabelText('GPT 5.3 Codex usage tip')).toBeInTheDocument();
  });

  it('opens the Other dialog and searches the full GPT-5 catalog', async () => {
    const handleModelChange = vi.fn();
    const inlineModelOptions = buildInlineModelOptions(FEATURED_MODEL_OPTIONS, ALL_MODEL_OPTIONS, 'gpt-5.4');

    render(
      <LlmChatComposer
        value="hello"
        onValueChange={() => undefined}
        onKeyDown={() => undefined}
        placeholder="Ask something"
        disabled={false}
        isStreaming={false}
        onSend={() => undefined}
        onStop={() => undefined}
        model="gpt-5.4"
        onModelChange={handleModelChange}
        modelOptions={inlineModelOptions}
        searchModelOptions={ALL_MODEL_OPTIONS}
        reasoningEffort="high"
        onReasoningEffortChange={() => undefined}
        reasoningOptions={getReasoningEffortOptions('gpt-5.4', ALL_MODEL_OPTIONS)}
      />
    );

    openModelSelect();
    fireEvent.click(await screen.findByText('Other…'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Other GPT-5 models')).toBeInTheDocument();
    expect(screen.getByText('GPT 5.4 Pro')).toBeInTheDocument();
    expect(screen.getByText('GPT 5.3 Chat')).toBeInTheDocument();
    expect(screen.getByText('GPT 5.2')).toBeInTheDocument();
    expect(screen.getByText('Highest-effort reasoning for the hardest tasks.')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search GPT-5 models');
    fireEvent.change(searchInput, { target: { value: 'chat' } });

    expect(screen.getByText('GPT 5.3 Chat')).toBeInTheDocument();
    expect(screen.queryByText('GPT 5.2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /GPT 5.3 Chat/i }));
    expect(handleModelChange).toHaveBeenCalledWith('gpt-5.3-chat-latest');
  });

  it('resets reasoning to the selected model default when the model changes', async () => {
    render(<ComposerHarness initialReasoningEffort="xhigh" />);

    expect(screen.getByTestId('selection-state')).toHaveTextContent('gpt-5.4:xhigh');

    openModelSelect();
    fireEvent.click(await screen.findByText('GPT 5 Mini'));

    expect(screen.getByTestId('selection-state')).toHaveTextContent('gpt-5-mini:medium');
  });
});
