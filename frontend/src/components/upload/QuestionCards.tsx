import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AskUserQuestion, QuestionAnswer } from '@/types/llmUi';
import { cn } from '@/lib/utils';

interface QuestionCardsProps {
  questions: AskUserQuestion[];
  onSubmit: (answers: QuestionAnswer[]) => void;
  disabled?: boolean;
}

type AnswerState = Record<string, string | string[]>;

export function QuestionCards({ questions, onSubmit, disabled = false }: QuestionCardsProps) {
  const [answers, setAnswers] = useState<AnswerState>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});

  const canSubmit = useMemo(() => {
    return questions.every((question) => {
      const value = answers[question.id];
      if (typeof value === 'string') {
        return value.trim().length > 0;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }

      if ((question.allowCustom ?? true) && customAnswers[question.id]?.trim()) {
        return true;
      }

      return false;
    });
  }, [answers, customAnswers, questions]);

  const getCardClassName = (selected: boolean) =>
    cn(
      'cursor-pointer border transition-colors hover:border-primary/40',
      selected && 'border-primary bg-primary/5'
    );

  const normalizeAnswer = (question: AskUserQuestion): string | string[] => {
    const current = answers[question.id];
    const custom = customAnswers[question.id]?.trim();

    if (question.type === 'multi_select') {
      const selected = Array.isArray(current) ? [...current] : [];
      if (custom && !selected.includes(custom)) {
        selected.push(custom);
      }
      return selected;
    }

    if (typeof current === 'string' && current.trim()) {
      return current.trim();
    }

    return custom ?? '';
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const payload: QuestionAnswer[] = questions.map((question) => ({
          questionId: question.id,
          answer: normalizeAnswer(question)
        }));
        onSubmit(payload);
      }}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="question-cards-grid">
        {questions.map((question) => {
          const selected = answers[question.id];
          const allowCustom = question.allowCustom ?? (question.type !== 'free_text');

          return (
            <Card key={question.id} className="border-border/80">
              <CardHeader className="space-y-2 pb-3">
                <CardDescription className="text-xs uppercase tracking-wide text-muted-foreground">
                  {question.header}
                </CardDescription>
                <CardTitle className="text-base leading-relaxed">{question.question}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {question.type === 'single_select' && question.options?.length ? (
                  <div className="space-y-2">
                    {question.options.map((option) => {
                      const isSelected = selected === option.label;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setAnswers((prev) => ({ ...prev, [question.id]: option.label }));
                          }}
                          className={cn(getCardClassName(isSelected), 'w-full rounded-md p-3 text-left')}
                          data-testid={`single-option-${question.id}-${option.label}`}
                        >
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === 'multi_select' && question.options?.length ? (
                  <div className="space-y-2">
                    {question.options.map((option) => {
                      const selectedValues = Array.isArray(selected) ? selected : [];
                      const isSelected = selectedValues.includes(option.label);
                      return (
                        <button
                          key={option.label}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setAnswers((prev) => {
                              const existingValue = prev[question.id];
                              const currentValues = Array.isArray(existingValue) ? existingValue : [];
                              const nextValues = currentValues.includes(option.label)
                                ? currentValues.filter((entry: string) => entry !== option.label)
                                : [...currentValues, option.label];

                              return { ...prev, [question.id]: nextValues };
                            });
                          }}
                          className={cn(getCardClassName(isSelected), 'flex w-full items-start gap-3 rounded-md p-3 text-left')}
                          data-testid={`multi-option-${question.id}-${option.label}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="mt-0.5 h-4 w-4 rounded border-input"
                          />
                          <div>
                            <p className="text-sm font-medium">{option.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === 'free_text' ? (
                  <div className="space-y-2">
                    <Textarea
                      value={typeof selected === 'string' ? selected : ''}
                      onChange={(event) => {
                        setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }));
                      }}
                      placeholder="Type your response"
                      className="min-h-[120px]"
                      disabled={disabled}
                      data-testid={`free-text-${question.id}`}
                    />
                    {question.options?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {question.options.map((option) => (
                          <Button
                            key={option.label}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={disabled}
                            onClick={() => {
                              setAnswers((prev) => ({ ...prev, [question.id]: option.label }));
                            }}
                            className="h-7 rounded-full px-3 text-xs"
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {allowCustom ? (
                  <Input
                    placeholder="Custom answer"
                    value={customAnswers[question.id] ?? ''}
                    onChange={(event) => {
                      setCustomAnswers((prev) => ({ ...prev, [question.id]: event.target.value }));
                    }}
                    disabled={disabled}
                    data-testid={`custom-answer-${question.id}`}
                  />
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={disabled || !canSubmit} data-testid="question-submit-button">
          Submit Answers
        </Button>
      </div>
    </form>
  );
}
