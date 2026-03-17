import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AskUserQuestion, QuestionAnswer } from '@/types/llmUi';
import { cn } from '@/lib/utils';

export const CUSTOM_OPTION = '__custom__' as const;
export const CUSTOM_OPTION_LABEL = 'Type your own answer...';

interface QuestionCardsProps {
  questions: AskUserQuestion[];
  onSubmit: (answers: QuestionAnswer[]) => void;
  disabled?: boolean;
}

type AnswerState = Record<string, string | string[]>;

const getCardClassName = (selected: boolean) =>
  cn(
    'cursor-pointer border transition-colors hover:border-primary/40',
    selected && 'border-primary bg-primary/5'
  );

function OptionCard({
  optionLabel,
  optionDescription,
  isSelected,
  disabled,
  inputType,
  questionId,
  onToggle,
}: {
  optionLabel: string;
  optionDescription?: string;
  isSelected: boolean;
  disabled: boolean;
  inputType: 'radio' | 'checkbox';
  questionId: string;
  onToggle: () => void;
}) {
  if (inputType === 'radio') {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={isSelected}
        disabled={disabled}
        onClick={onToggle}
        className={cn(getCardClassName(isSelected), 'w-full rounded-md p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        data-testid={`single-option-${questionId}-${optionLabel}`}
      >
        <p className="text-sm font-medium">{optionLabel}</p>
        {optionDescription ? <p className="mt-1 text-xs text-muted-foreground">{optionDescription}</p> : null}
      </button>
    );
  }

  return (
    <label
      className={cn(getCardClassName(isSelected), 'flex w-full cursor-pointer items-start gap-3 rounded-md p-3 text-left focus-within:ring-2 focus-within:ring-ring', disabled && 'pointer-events-none opacity-50')}
      data-testid={`multi-option-${questionId}-${optionLabel}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        disabled={disabled}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input focus-visible:outline-none"
      />
      <div>
        <p className="text-sm font-medium">{optionLabel}</p>
        {optionDescription ? <p className="mt-1 text-xs text-muted-foreground">{optionDescription}</p> : null}
      </div>
    </label>
  );
}

export function QuestionCards({ questions, onSubmit, disabled = false }: QuestionCardsProps) {
  const [answers, setAnswers] = useState<AnswerState>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const customInputRef = useRef<HTMLInputElement>(null);

  const currentQuestion = questions[currentIndex];
  const selected = currentQuestion ? answers[currentQuestion.id] : undefined;

  const allowCustom = currentQuestion
    ? currentQuestion.type !== 'free_text' && (currentQuestion.allowCustom ?? true)
    : false;

  const showCustomInput = allowCustom && (
    selected === CUSTOM_OPTION ||
    (Array.isArray(selected) && selected.includes(CUSTOM_OPTION))
  );

  useEffect(() => {
    if (showCustomInput) {
      customInputRef.current?.focus();
    }
  }, [showCustomInput]);

  const isQuestionAnswered = useCallback(
    (question: AskUserQuestion): boolean => {
      const value = answers[question.id];

      if (typeof value === 'string') {
        if (value === CUSTOM_OPTION) {
          return Boolean(customAnswers[question.id]?.trim());
        }
        return value.trim().length > 0;
      }

      if (Array.isArray(value)) {
        const nonSentinel = value.filter((v) => v !== CUSTOM_OPTION);
        const hasSentinel = value.includes(CUSTOM_OPTION);
        if (hasSentinel) {
          return nonSentinel.length > 0 || Boolean(customAnswers[question.id]?.trim());
        }
        return value.length > 0;
      }

      return false;
    },
    [answers, customAnswers]
  );

  const canSubmit = useMemo(() => {
    return questions.every((question) => isQuestionAnswered(question));
  }, [isQuestionAnswered, questions]);

  const normalizeAnswer = (question: AskUserQuestion): string | string[] => {
    const current = answers[question.id];
    const custom = customAnswers[question.id]?.trim();

    if (question.type === 'multi_select') {
      const values = Array.isArray(current) ? current.filter((v) => v !== CUSTOM_OPTION) : [];
      if (Array.isArray(current) && current.includes(CUSTOM_OPTION) && custom) {
        values.push(custom);
      }
      return values;
    }

    if (typeof current === 'string') {
      if (current === CUSTOM_OPTION) {
        return custom ?? '';
      }
      if (current.trim()) {
        return current.trim();
      }
    }

    return custom ?? '';
  };

  if (!currentQuestion) {
    return null;
  }

  const missingSelectableOptions =
    (currentQuestion.type === 'single_select' || currentQuestion.type === 'multi_select')
    && (!currentQuestion.options || currentQuestion.options.length === 0);

  const hasOptions = currentQuestion.options && currentQuestion.options.length > 0;

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
      <Card className="border-border/80" data-testid="question-card-single">
        <CardHeader className="space-y-3 pb-3">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs text-muted-foreground">
            <span>Question {currentIndex + 1} of {questions.length}</span>
            <CardDescription className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {currentQuestion.header}
            </CardDescription>
            <div className="flex items-center justify-end gap-1" role="group" aria-label="Question navigation">
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`Go to question ${index + 1}`}
                  aria-current={index === currentIndex ? 'step' : undefined}
                  className="flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`question-dot-${index}`}
                >
                  <div
                    className={cn(
                      'h-2.5 w-2.5 rounded-full transition-colors',
                      index === currentIndex
                        ? 'bg-primary'
                        : isQuestionAnswered(question)
                          ? 'bg-primary/50'
                          : 'bg-muted-foreground/30'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <CardTitle className="text-base leading-relaxed">{currentQuestion.question}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentQuestion.type === 'single_select' && hasOptions ? (
            <div
              className="space-y-2"
              role="radiogroup"
              aria-label={currentQuestion.question}
            >
              {currentQuestion.options.map((option) => (
                <OptionCard
                  key={option.label}
                  optionLabel={option.label}
                  optionDescription={option.description}
                  isSelected={selected === option.label}
                  disabled={disabled}
                  inputType="radio"
                  questionId={currentQuestion.id}
                  onToggle={() => {
                    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: option.label }));
                  }}
                />
              ))}
              {allowCustom ? (
                <OptionCard
                  optionLabel={CUSTOM_OPTION_LABEL}
                  isSelected={selected === CUSTOM_OPTION}
                  disabled={disabled}
                  inputType="radio"
                  questionId={currentQuestion.id}
                  onToggle={() => {
                    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: CUSTOM_OPTION }));
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {currentQuestion.type === 'multi_select' && hasOptions ? (
            <div className="space-y-2">
              {currentQuestion.options.map((option) => {
                const selectedValues = Array.isArray(selected) ? selected : [];
                return (
                  <OptionCard
                    key={option.label}
                    optionLabel={option.label}
                    optionDescription={option.description}
                    isSelected={selectedValues.includes(option.label)}
                    disabled={disabled}
                    inputType="checkbox"
                    questionId={currentQuestion.id}
                    onToggle={() => {
                      setAnswers((prev) => {
                        const existingValue = prev[currentQuestion.id];
                        const currentValues = Array.isArray(existingValue) ? existingValue : [];
                        const nextValues = currentValues.includes(option.label)
                          ? currentValues.filter((entry: string) => entry !== option.label)
                          : [...currentValues, option.label];
                        return { ...prev, [currentQuestion.id]: nextValues };
                      });
                    }}
                  />
                );
              })}
              {allowCustom ? (
                <OptionCard
                  optionLabel={CUSTOM_OPTION_LABEL}
                  isSelected={Array.isArray(selected) && selected.includes(CUSTOM_OPTION)}
                  disabled={disabled}
                  inputType="checkbox"
                  questionId={currentQuestion.id}
                  onToggle={() => {
                    setAnswers((prev) => {
                      const existingValue = prev[currentQuestion.id];
                      const currentValues = Array.isArray(existingValue) ? existingValue : [];
                      const nextValues = currentValues.includes(CUSTOM_OPTION)
                        ? currentValues.filter((entry: string) => entry !== CUSTOM_OPTION)
                        : [...currentValues, CUSTOM_OPTION];
                      return { ...prev, [currentQuestion.id]: nextValues };
                    });
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {missingSelectableOptions ? (
            <Textarea
              value={typeof selected === 'string' ? selected : ''}
              onChange={(event) => {
                setAnswers((prev) => ({ ...prev, [currentQuestion.id]: event.target.value }));
              }}
              aria-label={`${currentQuestion.question} (manual answer)`}
              placeholder="Type your response"
              className="min-h-[120px]"
              disabled={disabled}
              data-testid={`fallback-free-text-${currentQuestion.id}`}
            />
          ) : null}

          {currentQuestion.type === 'free_text' ? (
            <div className="space-y-2">
              <Textarea
                value={typeof selected === 'string' ? selected : ''}
                onChange={(event) => {
                  setAnswers((prev) => ({ ...prev, [currentQuestion.id]: event.target.value }));
                }}
                aria-label={currentQuestion.question}
                placeholder="Type your response"
                className="min-h-[120px]"
                disabled={disabled}
                data-testid={`free-text-${currentQuestion.id}`}
              />
              {currentQuestion.options?.length ? (
                <div className="flex flex-wrap gap-2">
                  {currentQuestion.options.map((option) => (
                    <Button
                      key={option.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        setAnswers((prev) => ({ ...prev, [currentQuestion.id]: option.label }));
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

          {showCustomInput ? (
            <Input
              ref={customInputRef}
              placeholder="Type your own answer"
              aria-label={`Custom answer for ${currentQuestion.header}`}
              value={customAnswers[currentQuestion.id] ?? ''}
              onChange={(event) => {
                setCustomAnswers((prev) => ({ ...prev, [currentQuestion.id]: event.target.value }));
              }}
              disabled={disabled}
              data-testid={`custom-answer-${currentQuestion.id}`}
            />
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-4 border-t border-border/40 mt-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || currentIndex === 0}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              aria-label="Previous question"
              className="h-9 px-3"
              data-testid="question-nav-prev"
            >
              <ChevronLeft className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="flex items-center gap-2">
              {currentIndex < questions.length - 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
                  aria-label="Next question"
                  className="h-9 px-3"
                  data-testid="question-nav-next"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              ) : null}

              <Button type="submit" size="sm" disabled={disabled || !canSubmit} className="h-9" data-testid="question-submit-button">
                Submit Answers
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sr-only" aria-live="polite">
        Showing question {currentIndex + 1} of {questions.length}
      </div>
    </form>
  );
}
