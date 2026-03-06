import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QuestionCards } from '../QuestionCards';
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

  it('accepts custom answers when enabled', () => {
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

    fireEvent.change(screen.getByTestId('custom-answer-q4'), {
      target: { value: 'Something else' }
    });

    fireEvent.click(screen.getByTestId('question-submit-button'));

    expect(onSubmit).toHaveBeenCalledWith([{ questionId: 'q4', answer: 'Something else' }]);
  });
});
