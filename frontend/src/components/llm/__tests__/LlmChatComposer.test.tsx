import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { LlmChatComposer, type ChatInputConfig, type ModelConfig, type ReasoningConfig } from '../LlmChatComposer';
import {
  buildInlineModelOptions,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  type AssistantModelOption,
  type ReasoningEffort
} from '../modelOptions';

const MODEL_OPTIONS: AssistantModelOption[] = [
  {
    value: 'gpt-5.4',
    label: 'GPT 5.4',
    kind: 'base',
    description: 'Strongest model for complex planning, tool orchestration, and high-stakes work.',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
  },
  {
    value: 'gpt-5.3-codex',
    label: 'GPT 5.3 Codex',
    kind: 'codex',
    description: 'Best when the chat is code-heavy or tool-oriented.',
    supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
    defaultReasoningEffort: 'high',
    featured: true,
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT 5 Mini',
    kind: 'mini',
    description: 'Faster and cheaper while still strong for everyday work.',
    supportedReasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'medium',
    featured: true,
  },
  {
    value: 'gpt-5-nano',
    label: 'GPT 5 Nano',
    kind: 'nano',
    description: 'Best for quick lightweight tasks and short prompts.',
    supportedReasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'low',
    featured: true,
  },
];

function ComposerHarness({ initialReasoningEffort = 'high' }: { initialReasoningEffort?: ReasoningEffort }) {
  const [model, setModel] = useState('gpt-5.4');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(initialReasoningEffort);
  const inlineModelOptions = buildInlineModelOptions(MODEL_OPTIONS);

  const handleModelChange = (nextModel: string) => {
    setModel(nextModel);
    setReasoningEffort(getDefaultReasoningEffort(nextModel, MODEL_OPTIONS));
  };

  return (
    <>
      <LlmChatComposer
        chatInput={{
          value: "hello",
          onValueChange: () => undefined,
          onKeyDown: () => undefined,
          placeholder: "Ask something",
          disabled: false,
          isStreaming: false,
          onSend: () => undefined,
          onStop: () => undefined,
        } satisfies ChatInputConfig}
        modelConfig={{
          model,
          onModelChange: handleModelChange,
          modelOptions: inlineModelOptions,
        } satisfies ModelConfig}
        reasoningConfig={{
          reasoningEffort,
          onReasoningEffortChange: setReasoningEffort,
          reasoningOptions: getReasoningEffortOptions(model, MODEL_OPTIONS),
        } satisfies ReasoningConfig}
      />
      <div data-testid="selection-state">{`${model}:${reasoningEffort}`}</div>
    </>
  );
}

async function openSelect(index: number) {
  const trigger = screen.getAllByRole('combobox')[index];
  await act(async () => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  });
}

describe('LlmChatComposer', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  it('shows only the approved four models and keeps usage tips out of the collapsed trigger', async () => {
    render(<ComposerHarness />);

    expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('GPT 5.4');
    expect(screen.queryByLabelText('GPT 5.4 usage tip')).not.toBeInTheDocument();

    await openSelect(0);
    const listbox = await screen.findByRole('listbox');

    expect(within(listbox).getByText('GPT 5.4')).toBeInTheDocument();
    expect(within(listbox).getByText('GPT 5.3 Codex')).toBeInTheDocument();
    expect(within(listbox).getByText('GPT 5 Mini')).toBeInTheDocument();
    expect(within(listbox).getByText('GPT 5 Nano')).toBeInTheDocument();
    expect(within(listbox).queryByText('Other…')).not.toBeInTheDocument();
    expect(within(listbox).getByLabelText('GPT 5.4 usage tip')).toBeInTheDocument();
    expect(within(listbox).getByLabelText('GPT 5.3 Codex usage tip')).toBeInTheDocument();
  });

  it('renders the top reasoning label as Extra High', async () => {
    render(<ComposerHarness initialReasoningEffort="xhigh" />);

    await openSelect(1);
    const listbox = await screen.findByRole('listbox');

    expect(within(listbox).getByText('Extra High')).toBeInTheDocument();
    expect(within(listbox).queryByText('X-High')).not.toBeInTheDocument();
  });

  it('does not expose a None reasoning option for GPT models', async () => {
    render(<ComposerHarness />);

    await openSelect(1);
    const listbox = await screen.findByRole('listbox');

    expect(within(listbox).queryByText('None')).not.toBeInTheDocument();
    expect(within(listbox).getByText('Low')).toBeInTheDocument();
  });

  it('resets reasoning to the selected model default when the model changes', async () => {
    render(<ComposerHarness initialReasoningEffort="xhigh" />);

    expect(screen.getByTestId('selection-state')).toHaveTextContent('gpt-5.4:xhigh');

    await openSelect(0);
    await act(async () => {
      fireEvent.click(await screen.findByText('GPT 5 Mini'));
    });

    expect(screen.getByTestId('selection-state')).toHaveTextContent('gpt-5-mini:medium');
  });

});
