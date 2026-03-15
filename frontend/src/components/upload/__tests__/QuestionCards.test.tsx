import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QuestionCards, CUSTOM_OPTION } from '../QuestionCards';
import type { AskUserQuestion } from '@/types/llmUi';

const QUESTIONS: AskUserQuestion[] = [
  {
    id: 'q1',
    header: 'Target',
    question: 'What is the target type?',
    type: 'single_select',
    options: [
      { label: 'Binary', description: 'Two classes' },
      { label: 'Regression', description: 'Continuous target' }
    ]
  },
  {
    id: 'q2',
    header: 'Metrics',
    question: 'Which metrics matter?',
    type: 'multi_select',
    options: [
      { label: 'Precision', description: 'Minimize false positives' },
      { label: 'Recall', description: 'Minimize false negatives' }
    ]
  },
  {
    id: 'q3',
    header: 'Constraints',
    question: 'Any business constraints?',
    type: 'free_text',
    options: [{ label: 'Prioritize interpretability', description: 'Transparent model behavior' }]
  }
];

describe('QuestionCards', () => {
  it('renders all question types and submits normalized answers', () => {
    const onSubmit = vi.fn();
    render(<QuestionCards questions={QUESTIONS} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('single-option-q1-Binary'));
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));

    // multi_select uses a label with a checkbox now, we click the input
    fireEvent.click(screen.getByTestId('multi-option-q2-Precision'));
    fireEvent.click(screen.getByTestId('multi-option-q2-Recall'));

    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));

    fireEvent.change(screen.getByTestId('free-text-q3'), {
      target: { value: 'Need <= 50ms latency.' }
    });

    fireEvent.click(screen.getByTestId('question-submit-button'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith([
      { questionId: 'q1', answer: 'Binary' },
      { questionId: 'q2', answer: ['Precision', 'Recall'] },
      { questionId: 'q3', answer: 'Need <= 50ms latency.' }
    ]);
  });

  it('supports semantic navigation controls and keyboard interaction', () => {
    const onSubmit = vi.fn();
    render(<QuestionCards questions={QUESTIONS} onSubmit={onSubmit} />);

    const prevButton = screen.getByRole('button', { name: 'Previous question' });
    const nextButton = screen.getByRole('button', { name: 'Next question' });
    const dot1 = screen.getByRole('button', { name: 'Go to question 1' });
    const dot2 = screen.getByRole('button', { name: 'Go to question 2' });

    // Initially on question 1
    expect(prevButton).toBeDisabled();
    expect(nextButton).toBeEnabled();
    expect(dot1).toHaveAttribute('aria-current', 'step');
    expect(dot2).not.toHaveAttribute('aria-current');

    // Select an option using semantic radio role
    const binaryOption = screen.getByRole('radio', { name: /Binary/i });
    expect(binaryOption).toHaveAttribute('aria-checked', 'false');

    // Use keyboard to navigate to next question using the dot
    dot2.focus();
    fireEvent.click(dot2); // Keyboard enter/space triggers click

    // Now on question 2
    expect(prevButton).toBeEnabled();
    expect(dot2).toHaveAttribute('aria-current', 'step');
  });

  it('accepts custom answers when enabled (must click Other first)', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCards
        questions={[{
          id: 'q4',
          header: 'Custom',
          question: 'Choose one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={onSubmit}
      />
    );

    // Click "Other" to reveal custom input
    fireEvent.click(screen.getByTestId('single-option-q4-Type your own answer...'));

    fireEvent.change(screen.getByTestId('custom-answer-q4'), {
      target: { value: 'Something else' }
    });

    fireEvent.click(screen.getByTestId('question-submit-button'));

    expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'q4', answer: 'Something else' }]);
  });

  // --- New tests for "Other" option flow ---

  it('"Other" option appears in single_select when allowCustom is true', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByTestId('single-option-q1-Type your own answer...')).toBeInTheDocument();
  });

  it('selecting "Other" shows custom input; selecting predefined hides it', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
      />
    );

    // No custom input initially
    expect(screen.queryByTestId('custom-answer-q1')).not.toBeInTheDocument();

    // Click "Other"
    fireEvent.click(screen.getByTestId('single-option-q1-Type your own answer...'));
    expect(screen.getByTestId('custom-answer-q1')).toBeInTheDocument();

    // Click predefined option
    fireEvent.click(screen.getByTestId('single-option-q1-A'));
    expect(screen.queryByTestId('custom-answer-q1')).not.toBeInTheDocument();
  });

  it('selecting "Other" auto-focuses the custom input', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('single-option-q1-Type your own answer...'));
    expect(screen.getByTestId('custom-answer-q1')).toHaveFocus();
  });

  it('typing custom text + submit yields typed text, not sentinel', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByTestId('single-option-q1-Type your own answer...'));
    fireEvent.change(screen.getByTestId('custom-answer-q1'), {
      target: { value: 'My custom' }
    });
    fireEvent.click(screen.getByTestId('question-submit-button'));

    expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'q1', answer: 'My custom' }]);
    // Sentinel never escapes
    const payload = onSubmit.mock.calls[0]![0] as { answer: string }[];
    expect(payload[0]!.answer).not.toContain(CUSTOM_OPTION);
  });

  it('switching back to predefined hides custom input, sentinel not in payload', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={onSubmit}
      />
    );

    // Select Other, type, switch back to A
    fireEvent.click(screen.getByTestId('single-option-q1-Type your own answer...'));
    fireEvent.change(screen.getByTestId('custom-answer-q1'), {
      target: { value: 'ignored text' }
    });
    fireEvent.click(screen.getByTestId('single-option-q1-A'));
    fireEvent.click(screen.getByTestId('question-submit-button'));

    expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'q1', answer: 'A' }]);
  });

  it('custom text preserved when navigating between questions and returning', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCards
        questions={[
          {
            id: 'q1',
            header: 'Test',
            question: 'Pick one',
            type: 'single_select',
            options: [{ label: 'A', description: 'Option A' }],
            allowCustom: true
          },
          {
            id: 'q2',
            header: 'Other',
            question: 'Another question',
            type: 'free_text'
          }
        ]}
        onSubmit={onSubmit}
      />
    );

    // Select Other, type
    fireEvent.click(screen.getByTestId('single-option-q1-Type your own answer...'));
    fireEvent.change(screen.getByTestId('custom-answer-q1'), {
      target: { value: 'preserved text' }
    });

    // Go to next question
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }));

    // Go back
    fireEvent.click(screen.getByRole('button', { name: 'Previous question' }));

    // Custom input should still be visible with the text
    expect(screen.getByTestId('custom-answer-q1')).toHaveValue('preserved text');
  });

  it('isQuestionAnswered returns false when "Other" selected but custom text empty', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
      />
    );

    // Click Other but don't type anything
    fireEvent.click(screen.getByTestId('single-option-q1-Type your own answer...'));

    // Submit button should be disabled (not answered)
    expect(screen.getByTestId('question-submit-button')).toBeDisabled();
  });

  it('isQuestionAnswered returns true when "Other" selected + custom text non-empty', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('single-option-q1-Type your own answer...'));
    fireEvent.change(screen.getByTestId('custom-answer-q1'), {
      target: { value: 'filled' }
    });

    expect(screen.getByTestId('question-submit-button')).toBeEnabled();
  });

  it('multi_select "Other" checkbox appears and toggles', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick many',
          type: 'multi_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
      />
    );

    const otherOption = screen.getByTestId('multi-option-q1-Type your own answer...');
    expect(otherOption).toBeInTheDocument();

    // Toggle on
    fireEvent.click(otherOption);
    expect(screen.getByTestId('custom-answer-q1')).toBeInTheDocument();

    // Toggle off
    fireEvent.click(otherOption);
    expect(screen.queryByTestId('custom-answer-q1')).not.toBeInTheDocument();
  });

  it('multi_select mixed selection (predefined + Other + text) yields all labels + custom string, no sentinel', () => {
    const onSubmit = vi.fn();
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick many',
          type: 'multi_select',
          options: [
            { label: 'A', description: 'Option A' },
            { label: 'B', description: 'Option B' }
          ],
          allowCustom: true
        }]}
        onSubmit={onSubmit}
      />
    );

    // Select A + Other + type custom
    fireEvent.click(screen.getByTestId('multi-option-q1-A'));
    fireEvent.click(screen.getByTestId('multi-option-q1-Type your own answer...'));
    fireEvent.change(screen.getByTestId('custom-answer-q1'), {
      target: { value: 'Custom entry' }
    });
    fireEvent.click(screen.getByTestId('question-submit-button'));

    const payload = onSubmit.mock.calls[0]![0] as { answer: string | string[] }[];
    const answer = payload[0]!.answer as string[];
    expect(answer).toContain('A');
    expect(answer).toContain('Custom entry');
    expect(answer).not.toContain(CUSTOM_OPTION);
    expect(answer).not.toContain('B');
  });

  it('multi_select only "Other" + empty text disables submit', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick many',
          type: 'multi_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
      />
    );

    // Only select Other, no text
    fireEvent.click(screen.getByTestId('multi-option-q1-Type your own answer...'));
    expect(screen.getByTestId('question-submit-button')).toBeDisabled();
  });

  it('allowCustom: false hides "Other" option', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: false
        }]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByTestId('single-option-q1-Type your own answer...')).not.toBeInTheDocument();
    expect(screen.queryByTestId('custom-answer-q1')).not.toBeInTheDocument();
  });

  it('free_text does not render "Other" option regardless of allowCustom', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Describe',
          type: 'free_text',
          options: [{ label: 'A', description: 'Suggestion' }]
        }]}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByTestId('single-option-q1-Type your own answer...')).not.toBeInTheDocument();
    expect(screen.queryByTestId('multi-option-q1-Type your own answer...')).not.toBeInTheDocument();
    expect(screen.queryByTestId('custom-answer-q1')).not.toBeInTheDocument();
  });

  it('disabled prop disables the "Other" card', () => {
    render(
      <QuestionCards
        questions={[{
          id: 'q1',
          header: 'Test',
          question: 'Pick one',
          type: 'single_select',
          options: [{ label: 'A', description: 'Option A' }],
          allowCustom: true
        }]}
        onSubmit={vi.fn()}
        disabled
      />
    );

    const otherOption = screen.getByTestId('single-option-q1-Type your own answer...');
    expect(otherOption).toBeDisabled();
  });
});
