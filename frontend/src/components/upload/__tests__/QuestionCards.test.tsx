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
    fireEvent.click(screen.getByTestId('multi-option-q2-Precision'));
    fireEvent.click(screen.getByTestId('multi-option-q2-Recall'));

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
