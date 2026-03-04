import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';
import { Brain, Check, Database, FileText, Loader2 } from 'lucide-react';

import { LlmChatComposer, type AttachmentStatus, type ComposerAttachmentItem } from '@/components/llm/LlmChatComposer';
import {
  ASSISTANT_MODEL_OPTIONS,
  DEFAULT_ASSISTANT_MODEL,
  getDefaultReasoningEffort,
  getModelOption,
  getReasoningEffortOptions,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { uploadDatasetFile } from '@/lib/api/datasets';
import { uploadDocument } from '@/lib/api/documents';
import {
  addAssistantTextMessage,
  addThinkingMessage,
  appendAssistantTextDelta,
  appendThinkingDelta,
  markThinkingMessageComplete
} from '@/lib/llm/streamMessageUtils';
import { ProgressiveMessageText } from '@/components/llm/ProgressiveMessageText';
import { ThinkingBlock } from '@/components/training/ThinkingBlock';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { QuestionCards } from './QuestionCards';
import { streamOnboardingPlan, executeToolCalls } from '@/lib/api/llm';
import { getFileType, type UploadedFile } from '@/types/file';
import type { ChatMessage, ToolCall, ToolResult, QuestionAnswer } from '@/types/llmUi';
import { projectColorClasses } from '@/types/project';

const MAX_TOOL_PASSES = 3;
const CONTEXT_ATTACHMENT_ACCEPT =
  '.pdf,.docx,.md,.markdown,.txt,.log,.json,.csv,.xlsx,.xls,.html,.htm,.xml,.yml,.yaml,.rtf';

type PendingAttachmentStatus = 'queued' | 'uploading' | 'success' | 'error';

interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  status: PendingAttachmentStatus;
  errorMessage?: string;
}

interface UploadedAttachmentPreview {
  name: string;
  kind: 'dataset' | 'document';
  fileType?: string;
  size: number;
  nRows?: number;
  nCols?: number;
  chunkCount?: number;
  sample?: Record<string, unknown>[];
}

interface PlanningStageProps {
  projectId: string;
  onPlanApproved: (plan: string, planName: string) => void;
}

interface SuggestionPill {
  id: string;
  label: string;
  prompt: string;
}

function generatePlanName(): string {
  const adjectives = [
    'swift', 'bold', 'calm', 'keen', 'bright', 'clear', 'prime', 'sharp',
    'warm', 'fair', 'deep', 'vast', 'wise', 'neat', 'agile', 'vivid'
  ];
  const nouns = [
    'falcon', 'river', 'summit', 'garden', 'crystal', 'bridge', 'compass',
    'beacon', 'harbor', 'meadow', 'prism', 'orbit', 'spark', 'trail'
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${adj}-${noun}-${suffix}.md`;
}

function normalizePlanFileName(planName?: string): string {
  const trimmed = planName?.trim() ?? '';
  const withoutExtension = trimmed.replace(/\.md$/i, '');
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9-\s_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);

  return `${slug || generatePlanName().replace(/\.md$/i, '')}.md`;
}

function toPlanPath(planName: string): string {
  return `plans/${normalizePlanFileName(planName)}`;
}

function dedupeSuggestions(suggestions: SuggestionPill[]): SuggestionPill[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.prompt.toLowerCase().trim();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function truncateSuggestionLabel(label: string, maxLength = 56): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function buildInitialSuggestions(
  projectFiles: UploadedFile[],
  projectTitle?: string,
  projectDescription?: string
): SuggestionPill[] {
  const datasetFiles = projectFiles.filter((file) => ['csv', 'json', 'excel'].includes(file.type));
  const documentFiles = projectFiles.filter((file) => ['pdf', 'markdown', 'word', 'text'].includes(file.type));
  const firstDatasetName = datasetFiles[0]?.name.replace(/\.[^.]+$/, '') ?? 'this dataset';
  const firstDocumentName = documentFiles[0]?.name.replace(/\.[^.]+$/, '');
  const datasetLabel = truncateSuggestionLabel(firstDatasetName, 44);

  const contextText = [
    projectTitle,
    projectDescription,
    ...projectFiles.map((file) => file.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const suggestions: SuggestionPill[] = [];

  if (/\b(forecast|time\s*series|sales|demand|trend|season)\b/.test(contextText)) {
    suggestions.push({
      id: 'initial-forecast',
      label: `Forecast ${datasetLabel}`,
      prompt: `I want a forecasting plan for ${firstDatasetName}. Focus on horizon design, backtesting, and useful features.`
    });
  }

  if (/\b(churn|classif|fraud|default|risk|predict|label|binary)\b/.test(contextText)) {
    suggestions.push({
      id: 'initial-classification',
      label: `Classify ${datasetLabel}`,
      prompt: `Help me build a classification plan for ${firstDatasetName}, including class imbalance handling and threshold strategy.`
    });
  }

  if (/\b(segment|cluster|cohort|persona|group)\b/.test(contextText)) {
    suggestions.push({
      id: 'initial-segmentation',
      label: `Segment ${datasetLabel}`,
      prompt: `Create a segmentation workflow for ${firstDatasetName} and define how to profile and operationalize each segment.`
    });
  }

  if (/\b(anomal|outlier|alert)\b/.test(contextText)) {
    suggestions.push({
      id: 'initial-anomaly',
      label: `Detect anomalies`,
      prompt: `Plan an anomaly detection approach for ${firstDatasetName}, including validation and investigation workflow.`
    });
  }

  if (datasetFiles.length > 0) {
    suggestions.push(
      {
        id: 'initial-baseline',
        label: `Baseline for ${datasetLabel}`,
        prompt: `Start with a practical baseline modeling plan for ${firstDatasetName}, then propose high-impact refinements.`
      },
      {
        id: 'initial-quality',
        label: `Audit ${datasetLabel}`,
        prompt: `Before modeling, diagnose the main data quality risks in ${firstDatasetName} and then propose the plan.`
      }
    );
  }

  if (documentFiles.length > 0) {
    suggestions.push({
      id: 'initial-doc-context',
      label: firstDocumentName ? `Use ${truncateSuggestionLabel(firstDocumentName, 32)} docs` : 'Ground plan in docs',
      prompt: 'Use the uploaded context documents to refine assumptions, feature ideas, and success criteria in the plan.'
    });
  }

  const fallbackSuggestions: SuggestionPill[] = [
    {
      id: 'initial-goal-clarify',
      label: 'Clarify goal',
      prompt: 'Help me define the right ML objective for these uploads and convert it into a practical execution plan.'
    },
    {
      id: 'initial-exec-plan',
      label: 'Execution roadmap',
      prompt: 'Draft an implementation-ready roadmap with milestones, risks, and validation steps for this project.'
    },
    {
      id: 'initial-metrics',
      label: 'Define success metrics',
      prompt: 'Define concrete success metrics, baseline targets, and acceptance criteria before implementation starts.'
    },
    {
      id: 'initial-risks',
      label: 'Surface top risks',
      prompt: 'Identify the top project risks and add mitigations directly into the initial plan.'
    },
    {
      id: 'initial-milestones',
      label: 'Plan milestones',
      prompt: 'Break the project into milestones with owners, dependencies, and deliverables.'
    },
    {
      id: 'initial-stakeholder',
      label: 'Stakeholder-ready summary',
      prompt: 'Prepare a concise stakeholder-facing version of the plan with business impact and timeline.'
    },
  ];

  const mergedSuggestions = dedupeSuggestions([...suggestions, ...fallbackSuggestions]);
  return mergedSuggestions.slice(0, 6);
}

function buildFollowUpSuggestions(
  messages: ChatMessage[],
  projectFiles: UploadedFile[],
  projectTitle?: string,
  projectDescription?: string
): SuggestionPill[] {
  const latestUserMessage = [...messages].reverse().find((message) => message.type === 'user');
  const latestAssistantMessage = [...messages].reverse().find((message) => message.type === 'assistant_text');
  const activeQuestions = [...messages].reverse().find(
    (message) => message.type === 'ask_user' && !message.answered
  );
  const draftPlan = [...messages].reverse().find(
    (message) => message.type === 'plan' && !message.approved && !message.hidden
  );

  const suggestions: SuggestionPill[] = [];

  const contextText = [projectTitle, projectDescription]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const firstDatasetName = projectFiles
    .find((file) => ['csv', 'json', 'excel'].includes(file.type))
    ?.name.replace(/\.[^.]+$/, '');

  if (activeQuestions?.type === 'ask_user') {
    const firstQuestion = activeQuestions.questions[0];
    if (firstQuestion) {
      suggestions.push({
        id: `followup-question-${firstQuestion.id}`,
        label: `Answer: ${firstQuestion.header}`,
        prompt: `For ${firstQuestion.header.toLowerCase()}, recommend the best default option and why.`
      });
    }

    suggestions.push(
      {
        id: 'followup-defaults',
        label: 'Recommend defaults',
        prompt: 'I am not sure about those answers. Recommend sensible defaults and explain trade-offs.'
      },
      {
        id: 'followup-prioritize',
        label: 'Prioritize speed',
        prompt: 'Prioritize a fast first version and keep complexity low in the plan.'
      }
    );
  }

  if (draftPlan?.type === 'plan') {
    suggestions.push(
      {
        id: 'followup-expand-plan',
        label: 'Expand evaluation',
        prompt: 'Expand the plan with explicit validation strategy, baselines, and success criteria.'
      },
      {
        id: 'followup-risk-plan',
        label: 'Add risk controls',
        prompt: 'Refine the plan with data leakage checks, monitoring, and rollback considerations.'
      }
    );
  }

  if (latestUserMessage?.type === 'user') {
    const userText = latestUserMessage.content.toLowerCase();
    if (userText.includes('forecast')) {
      suggestions.push({
        id: 'followup-forecast-metrics',
        label: 'Forecast metrics',
        prompt: 'Set up the plan with forecasting metrics, horizon design, and backtesting details.'
      });
    }
    if (userText.includes('classif') || userText.includes('predict')) {
      suggestions.push({
        id: 'followup-class-balance',
        label: 'Handle imbalance',
        prompt: 'Include class imbalance handling, thresholding strategy, and calibration in the plan.'
      });
    }
    if (userText.includes('explain') || userText.includes('interpret')) {
      suggestions.push({
        id: 'followup-interpretability',
        label: 'Increase explainability',
        prompt: 'Refine the plan to include model explainability outputs and stakeholder-friendly interpretation steps.'
      });
    }
  }

  if (latestAssistantMessage?.type === 'assistant_text') {
    suggestions.push({
      id: 'followup-summary',
      label: 'Summarize direction',
      prompt: 'Summarize the current direction in 5 concise bullets before we finalize the plan.'
    });
  }

  if (projectFiles.some((file) => ['pdf', 'markdown', 'word', 'text'].includes(file.type))) {
    suggestions.push({
      id: 'followup-docs',
      label: 'Use docs deeply',
      prompt: 'Incorporate relevant document insights into assumptions, features, and evaluation criteria.'
    });
  }

  suggestions.push({
    id: 'followup-finalize',
    label: 'Draft final plan',
    prompt: `Draft the final implementation-ready plan${firstDatasetName ? ` for ${firstDatasetName}` : ''} with milestones and deliverables.`
  });

  if (/\b(monitor|deploy|production|stakeholder)\b/.test(contextText)) {
    suggestions.push({
      id: 'followup-production',
      label: 'Production readiness',
      prompt: 'Add production monitoring, model refresh cadence, and stakeholder reporting expectations to the plan.'
    });
  }

  return dedupeSuggestions(suggestions).slice(0, 7);
}

export function PlanningStage({ projectId, onPlanApproved }: PlanningStageProps) {
  const files = useDataStore((state) => state.files);
  const projects = useProjectStore((state) => state.projects);
  const addFile = useDataStore((state) => state.addFile);
  const addPreview = useDataStore((state) => state.addPreview);
  const setFileMetadata = useDataStore((state) => state.setFileMetadata);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [enableThinking, setEnableThinking] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_ASSISTANT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    getDefaultReasoningEffort(DEFAULT_ASSISTANT_MODEL)
  );
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentFeedback, setAttachmentFeedback] = useState<{ status: AttachmentStatus; message: string } | null>(null);
  const [attachmentStatus, setAttachmentStatus] = useState<AttachmentStatus>('idle');
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, string>>({});
  const [userMessageAttachments, setUserMessageAttachments] = useState<Record<string, UploadedAttachmentPreview[]>>({});
  const [activeTextMessageId, setActiveTextMessageId] = useState<string | null>(null);
  const [activeThinkingMessageId, setActiveThinkingMessageId] = useState<string | null>(null);
  const [hydratedMessageIds] = useState<Set<string>>(new Set());

  const controllerRef = useRef<AbortController | null>(null);
  const currentThinkingIdRef = useRef<string | null>(null);
  const currentTextIdRef = useRef<string | null>(null);
  const answerHistoryRef = useRef<QuestionAnswer[]>([]);
  const toolCallHistoryRef = useRef<ToolCall[]>([]);
  const toolResultHistoryRef = useRef<ToolResult[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const project = useMemo(() => projects.find((entry) => entry.id === projectId), [projectId, projects]);
  const projectColor = project?.color ?? 'blue';
  const projectColorClass = projectColorClasses[projectColor];
  const projectFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId),
    [files, projectId]
  );
  const documentFiles = useMemo(
    () => projectFiles.filter((file) => file.metadata?.documentId),
    [projectFiles]
  );
  const reasoningEffortOptions = useMemo(
    () => getReasoningEffortOptions(selectedModel),
    [selectedModel]
  );
  const selectedModelOption = useMemo(
    () => getModelOption(selectedModel),
    [selectedModel]
  );
  const shouldIncludeThoughts = selectedModelOption.supportsThinking
    && (selectedModelOption.thinkingAlwaysOn || enableThinking);
  const hasUserMessages = useMemo(
    () => messages.some((message) => message.type === 'user'),
    [messages]
  );
  const showCenteredSuggestions = !hasUserMessages && !isStreaming && messages.length === 0;
  const centeredSuggestions = useMemo(
    () => (!hasUserMessages
      ? buildInitialSuggestions(projectFiles, project?.title, project?.description)
      : []),
    [hasUserMessages, project?.description, project?.title, projectFiles]
  );
  const followUpSuggestions = useMemo(
    () => (
      hasUserMessages && !isStreaming
        ? buildFollowUpSuggestions(messages, projectFiles, project?.title, project?.description)
        : []
    ),
    [hasUserMessages, isStreaming, messages, project?.description, project?.title, projectFiles]
  );
  const composerAttachmentItems = useMemo<ComposerAttachmentItem[]>(
    () => pendingAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      status: attachment.status,
      message: attachment.errorMessage ?? null
    })),
    [pendingAttachments]
  );

  useEffect(() => {
    const supportsCurrent = reasoningEffortOptions.some((option) => option.value === reasoningEffort);
    if (!supportsCurrent) {
      setReasoningEffort(getDefaultReasoningEffort(selectedModel));
    }
  }, [selectedModel, reasoningEffort, reasoningEffortOptions]);

  // Auto-scroll on new messages
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
    if (!viewport) {
      return;
    }

    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, isStreaming]);

  useEffect(() => {
    const uploadingCount = pendingAttachments.filter((attachment) => attachment.status === 'uploading').length;
    const erroredCount = pendingAttachments.filter((attachment) => attachment.status === 'error').length;

    if (uploadingCount > 0) {
      setAttachmentStatus('uploading');
      setAttachmentMessage(`Uploading ${uploadingCount} attachment${uploadingCount === 1 ? '' : 's'}...`);
      return;
    }

    if (erroredCount > 0) {
      setAttachmentStatus('error');
      setAttachmentMessage(`${erroredCount} attachment${erroredCount === 1 ? '' : 's'} failed. Retry or remove.`);
      return;
    }

    if (pendingAttachments.length > 0) {
      setAttachmentStatus('queued');
      setAttachmentMessage(`${pendingAttachments.length} attachment${pendingAttachments.length === 1 ? '' : 's'} ready to send.`);
      return;
    }

    if (attachmentFeedback) {
      setAttachmentStatus(attachmentFeedback.status);
      setAttachmentMessage(attachmentFeedback.message);
      return;
    }

    setAttachmentStatus('idle');
    setAttachmentMessage(null);
  }, [pendingAttachments, attachmentFeedback]);

  useEffect(() => {
    if (!attachmentFeedback) {
      return;
    }

    const timeout = setTimeout(() => {
      setAttachmentFeedback(null);
    }, 3500);

    return () => clearTimeout(timeout);
  }, [attachmentFeedback]);

  const endThinking = useCallback(() => {
    const id = currentThinkingIdRef.current;
    if (id) {
      setMessages((prev) => markThinkingMessageComplete(prev, id));
      currentThinkingIdRef.current = null;
      setActiveThinkingMessageId(null);
    }
  }, []);

  const endText = useCallback(() => {
    currentTextIdRef.current = null;
    setActiveTextMessageId(null);
  }, []);

  const requestStream = useCallback(
    async (userIntent?: string, round?: number) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      const effectiveRound = round ?? currentRound;
      setCurrentRound(effectiveRound);
      setIsStreaming(true);
      endThinking();
      endText();

      let sawAskUser = false;
      let sawPlanExit = false;
      let recoveryAttempted = false;
      let requestUserIntent = userIntent || undefined;

      const executePendingToolCalls = async (pendingToolCalls: ToolCall[]) => {
        if (pendingToolCalls.length === 0) {
          return;
        }

        const { results } = await executeToolCalls(projectId, pendingToolCalls);
        toolCallHistoryRef.current = [...toolCallHistoryRef.current, ...pendingToolCalls];
        toolResultHistoryRef.current = [...toolResultHistoryRef.current, ...results];

        setMessages((prev) =>
          prev.map((m) => {
            if (m.type !== 'tool_call') return m;
            const result = results.find((r) => r.id === m.call.id);
            return result ? { ...m, result } : m;
          })
        );
      };

      try {
        for (let pass = 0; pass < MAX_TOOL_PASSES; pass++) {
          if (controller.signal.aborted) return;

          let streamedText = '';
          let pendingToolCalls: ToolCall[] = [];
          let passTextMessageId: string | null = null;
          let passProducedPlainText = false;

          await streamOnboardingPlan(
            {
              projectId,
              userIntent: requestUserIntent,
              questionAnswers: answerHistoryRef.current.length > 0 ? answerHistoryRef.current : undefined,
              toolCalls: toolCallHistoryRef.current.length > 0 ? toolCallHistoryRef.current : undefined,
              toolResults: toolResultHistoryRef.current.length > 0 ? toolResultHistoryRef.current : undefined,
              round: effectiveRound,
              enableThinking: shouldIncludeThoughts,
              thinkingLevel: reasoningEffort,
              model: selectedModel !== 'auto' ? selectedModel : undefined,
            },
            (event) => {
              // Thinking events
              if (event.type === 'thinking') {
                endText();
                if (!currentThinkingIdRef.current) {
                  const id = `thinking-${Date.now()}`;
                  currentThinkingIdRef.current = id;
                  setActiveThinkingMessageId(id);
                  setMessages((prev) => addThinkingMessage(prev, id, event.text, Date.now()));
                } else {
                  const tid = currentThinkingIdRef.current;
                  setMessages((prev) => appendThinkingDelta(prev, tid, event.text));
                }
              }

              // Token events (assistant text or plan)
              if (event.type === 'token') {
                endThinking();
                streamedText += event.text;
                passProducedPlainText = true;
                if (!currentTextIdRef.current) {
                  const id = `text-${Date.now()}`;
                  currentTextIdRef.current = id;
                  setActiveTextMessageId(id);
                  passTextMessageId = id;
                  setMessages((prev) => addAssistantTextMessage(prev, id, event.text));
                } else {
                  const tid = currentTextIdRef.current;
                  passTextMessageId = tid;
                  setMessages((prev) => appendAssistantTextDelta(prev, tid, event.text));
                }
              }

              // Ask user questions
              if (event.type === 'ask_user') {
                endThinking();
                endText();
                sawAskUser = true;
                setMessages((prev) => [
                  ...prev,
                  { id: `ask-${Date.now()}`, type: 'ask_user', questions: event.questions },
                ]);
              }

              if (event.type === 'plan_exit') {
                const streamingTextId = currentTextIdRef.current;
                endThinking();
                endText();
                sawPlanExit = true;
                setEditingPlanId(null);

                const planContent = event.planMarkdown.trim();
                const planName = normalizePlanFileName(event.planName);
                const planMessageId = `plan-${Date.now()}`;

                setPlanDrafts((prev) => ({ ...prev, [planMessageId]: planContent }));
                setMessages((prev) => {
                  const withoutPlanText = prev.filter((message) =>
                    !(streamingTextId && message.type === 'assistant_text' && message.id === streamingTextId)
                  );
                  const next = withoutPlanText.map((message) =>
                    message.type === 'plan' && !message.approved ? { ...message, hidden: true } : message
                  );

                  return [
                    ...next,
                    { id: planMessageId, type: 'plan', content: planContent, planName, hidden: false }
                  ];
                });
              }

              // Envelope with tool calls
              if (event.type === 'envelope') {
                if (event.envelope.tool_calls?.length) {
                  endThinking();
                  endText();

                  const nextCalls = event.envelope.tool_calls.filter(
                    (call) => !pendingToolCalls.some((pending) => pending.id === call.id)
                  );
                  pendingToolCalls = [...pendingToolCalls, ...nextCalls];

                  for (const call of nextCalls) {
                    setMessages((prev) => [
                      ...prev,
                      { id: `tool-${call.id}`, type: 'tool_call', call },
                    ]);
                  }
                }
                // Fallback message if no tokens were streamed
                const fallback = event.envelope.message?.trim();
                if (
                  fallback
                  && fallback !== 'Done.'
                  && !streamedText
                  && !sawAskUser
                  && !sawPlanExit
                  && !event.envelope.ask_user
                  && !event.envelope.plan_exit
                  && pendingToolCalls.length === 0
                ) {
                  streamedText = fallback;
                  passProducedPlainText = true;
                  const id = `text-fallback-${Date.now()}`;
                  passTextMessageId = id;
                  setMessages((prev) => addAssistantTextMessage(prev, id, fallback));
                }
              }

              if (event.type === 'error') {
                setMessages((prev) => [
                  ...prev,
                  { id: `error-${Date.now()}`, type: 'error', message: event.message },
                ]);
              }

              if (event.type === 'done') {
                endThinking();
                endText();
              }
            },
            controller.signal
          );

          requestUserIntent = undefined;

          if (sawPlanExit) {
            break;
          }

          await executePendingToolCalls(pendingToolCalls);

          if (
            !sawAskUser
            && !sawPlanExit
            && pendingToolCalls.length === 0
            && passProducedPlainText
            && !recoveryAttempted
            && pass < MAX_TOOL_PASSES - 1
          ) {
            recoveryAttempted = true;

            if (passTextMessageId) {
              setMessages((prev) =>
                prev.filter((message) => !(message.type === 'assistant_text' && message.id === passTextMessageId))
              );
            }

            requestUserIntent = [
              userIntent,
              'Continue now by using exactly one structured tool call. Use ask_user if clarification is needed, otherwise use plan_exit with complete markdown.'
            ]
              .filter(Boolean)
              .join('\n\n');

            continue;
          }

          if (sawAskUser || pendingToolCalls.length === 0) {
            break;
          }
        }

      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'Stream failed';
          setMessages((prev) => [...prev, { id: `error-${Date.now()}`, type: 'error', message: msg }]);
        }
      } finally {
        endThinking();
        endText();
        setIsStreaming(false);
      }
    },
    [projectId, currentRound, selectedModel, shouldIncludeThoughts, reasoningEffort, endThinking, endText]
  );

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const uploadPendingAttachments = useCallback(
    async (targetIds?: string[]) => {
      if (!projectId) {
        return { uploaded: [] as UploadedAttachmentPreview[], failedCount: 0 };
      }

      const targetIdSet = targetIds ? new Set(targetIds) : null;
      const queue = pendingAttachments.filter((attachment) => {
        const isRetryable = attachment.status === 'queued' || attachment.status === 'error';
        return isRetryable && (!targetIdSet || targetIdSet.has(attachment.id));
      });

      if (queue.length === 0) {
        return { uploaded: [] as UploadedAttachmentPreview[], failedCount: 0 };
      }

      setAttachmentFeedback(null);

      const uploaded: UploadedAttachmentPreview[] = [];
      let failedCount = 0;

      for (const attachment of queue) {
        setPendingAttachments((prev) =>
          prev.map((item) =>
            item.id === attachment.id ? { ...item, status: 'uploading', errorMessage: undefined } : item
          )
        );

        try {
          const fileType = getFileType(attachment.file);
          const uploadedFileId = crypto.randomUUID();
          const uploadedFile: UploadedFile = {
            id: uploadedFileId,
            name: attachment.name,
            size: attachment.size,
            type: fileType,
            uploadedAt: new Date(),
            projectId,
            file: attachment.file
          };

          if (fileType === 'csv' || fileType === 'json' || fileType === 'excel') {
            const response = await uploadDatasetFile(attachment.file, projectId);
            const dataset = response.dataset;

            addFile(uploadedFile);
            setFileMetadata(uploadedFileId, {
              datasetId: dataset.datasetId,
              tableName: dataset.tableName,
              rowCount: dataset.n_rows,
              columnCount: dataset.n_cols,
              columns: dataset.columns,
              datasetProfile: {
                nRows: dataset.n_rows,
                nCols: dataset.n_cols,
                dtypes: dataset.dtypes,
                nullCounts: dataset.null_counts
              }
            });
            addPreview({
              fileId: uploadedFileId,
              headers: dataset.columns,
              rows: dataset.sample,
              totalRows: dataset.n_rows,
              previewRows: dataset.sample.length
            });
            uploaded.push({
              name: attachment.name,
              kind: 'dataset',
              fileType: fileType,
              size: attachment.size,
              nRows: dataset.n_rows,
              nCols: dataset.n_cols,
              sample: dataset.sample.slice(0, 2)
            });
          } else {
            const response = await uploadDocument(projectId, attachment.file);
            addFile(uploadedFile);
            setFileMetadata(uploadedFileId, {
              documentId: response.document.documentId,
              chunkCount: response.document.chunkCount,
              embeddingDimension: response.document.embeddingDimension
            });
            uploaded.push({
              name: attachment.name,
              kind: 'document',
              fileType: response.document.mimeType,
              size: attachment.size,
              chunkCount: response.document.chunkCount
            });
          }

          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id ? { ...item, status: 'success', errorMessage: undefined } : item
            )
          );
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : `Failed to upload ${attachment.name}. Please try again.`;

          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id ? { ...item, status: 'error', errorMessage } : item
            )
          );
        }
      }

      setPendingAttachments((prev) => prev.filter((item) => item.status !== 'success'));

      if (failedCount > 0) {
        setAttachmentFeedback({
          status: 'error',
          message: `${failedCount} attachment${failedCount === 1 ? '' : 's'} failed. Retry or remove before continuing.`
        });
      } else if (uploaded.length > 0) {
        setAttachmentFeedback({
          status: 'success',
          message: `Added ${uploaded.length} attachment${uploaded.length === 1 ? '' : 's'} to context.`
        });
      }

      return { uploaded, failedCount };
    },
    [pendingAttachments, projectId, addFile, addPreview, setFileMetadata]
  );

  const submitUserMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isStreaming) return;

    const queuedCount = pendingAttachments.filter((attachment) =>
      attachment.status === 'queued' || attachment.status === 'error'
    ).length;
    let uploadedAttachments: UploadedAttachmentPreview[] = [];

    if (queuedCount > 0) {
      const uploadResult = await uploadPendingAttachments();
      uploadedAttachments = uploadResult.uploaded;
      if (uploadResult.failedCount > 0 && uploadedAttachments.length === 0) {
        return;
      }
    }

    const userMessageId = `user-${Date.now()}`;
    setInputValue('');
    setEditingPlanId(null);
    setMessages((prev) => {
      const next = prev.map((message) =>
        message.type === 'plan' && !message.approved ? { ...message, hidden: true } : message
      );

      return [
        ...next,
        { id: userMessageId, type: 'user', content: text, timestamp: Date.now() }
      ];
    });
    if (uploadedAttachments.length > 0) {
      setUserMessageAttachments((prev) => ({ ...prev, [userMessageId]: uploadedAttachments }));
    }

    const uploadedNames = uploadedAttachments.map((item) => item.name);
    const requestText = uploadedNames.length > 0
      ? `${text}\n\nUse and prioritize these newly attached files for this response: ${uploadedNames.join(', ')}.`
      : text;

    // Use current round for the request, then advance for next interaction.
    // Round 0 = first user message (triggers data inspection + first questions).
    void requestStream(requestText, currentRound);
    setCurrentRound((prev) => Math.min(prev + 1, 5));
  }, [isStreaming, pendingAttachments, uploadPendingAttachments, currentRound, requestStream]);

  const handleSend = useCallback(() => {
    void submitUserMessage(inputValue);
  }, [inputValue, submitUserMessage]);

  const handleSuggestionClick = useCallback((prompt: string) => {
    void submitUserMessage(prompt);
  }, [submitUserMessage]);

  const handleQuestionAnswer = useCallback(
    (msgId: string, answers: QuestionAnswer[]) => {
      answerHistoryRef.current = [...answerHistoryRef.current, ...answers];

      // Mark questions as answered
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId && m.type === 'ask_user' ? { ...m, answered: true } : m))
      );

      // Add a user message summarizing answers
      const summary = answers
        .map((a) => (Array.isArray(a.answer) ? a.answer.join(', ') : a.answer))
        .join('; ');
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, type: 'user', content: summary, timestamp: Date.now() },
      ]);

      void requestStream(undefined, currentRound);
      setCurrentRound((prev) => Math.min(prev + 1, 5));
    },
    [currentRound, requestStream]
  );

  const handleApprove = useCallback(
    (planContent: string, planName: string, planId: string) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type !== 'plan') {
            return m;
          }

          if (m.id !== planId) {
            return { ...m, hidden: true };
          }

          return { ...m, approved: true, hidden: false, content: planContent, planName };
        })
      );
      onPlanApproved(planContent, normalizePlanFileName(planName));
    },
    [onPlanApproved]
  );

  const handleStartPlanEdit = useCallback((planId: string, currentContent: string) => {
    setEditingPlanId(planId);
    setPlanDrafts((prev) => ({ ...prev, [planId]: prev[planId] ?? currentContent }));
  }, []);

  const handleCancelPlanEdit = useCallback((planId: string, currentContent: string) => {
    setEditingPlanId(null);
    setPlanDrafts((prev) => ({ ...prev, [planId]: currentContent }));
  }, []);

  const handleSavePlanEdit = useCallback((planId: string) => {
    const draft = planDrafts[planId];
    if (!draft?.trim()) {
      return;
    }

    const nextContent = draft.trim();
    setMessages((prev) =>
      prev.map((message) =>
        message.type === 'plan' && message.id === planId ? { ...message, content: nextContent } : message
      )
    );
    setPlanDrafts((prev) => ({ ...prev, [planId]: nextContent }));
    setEditingPlanId(null);
  }, [planDrafts]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId) {
      event.target.value = '';
      return;
    }

    const pendingAttachment: PendingAttachment = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      status: 'queued',
    };

    setAttachmentFeedback(null);
    setPendingAttachments((prev) => [...prev, pendingAttachment]);
    event.target.value = '';
  }, [projectId]);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachmentFeedback(null);
    setPendingAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  }, []);

  const handleRetryAttachment = useCallback((attachmentId: string) => {
    void uploadPendingAttachments([attachmentId]);
  }, [uploadPendingAttachments]);

  return (
    <div className="flex h-full flex-col bg-background" data-testid="planning-stage">
      {/* Messages area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
        {showCenteredSuggestions && centeredSuggestions.length > 0 ? (
          <div className="mx-auto flex min-h-[55vh] w-full max-w-5xl flex-col items-center justify-center gap-5 px-6 py-10 text-center">
            <p className="text-base font-medium text-foreground">What are you trying to do today?</p>
            <div className="flex max-w-[40rem] flex-wrap items-center justify-center gap-2">
              {centeredSuggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 max-w-full whitespace-nowrap rounded-full px-3 text-xs"
                  disabled={isStreaming}
                  onClick={() => handleSuggestionClick(suggestion.prompt)}
                >
                  {suggestion.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full space-y-6 p-6 pb-12">
            {messages.map((msg) => {
            if (msg.type === 'user') {
              const attachedFiles = userMessageAttachments[msg.id] ?? [];
              return (
                <div key={msg.id} className="flex flex-col items-end">
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                    {msg.content}
                    {attachedFiles.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {attachedFiles.map((file) => (
                          <div
                            key={`${msg.id}-${file.name}`}
                            className="rounded-md border border-primary/30 bg-background/80 px-2 py-1.5 text-[11px] text-foreground"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 font-medium">
                                {file.kind === 'dataset' ? <Database className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                                {file.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {file.kind === 'dataset'
                                  ? `${file.nRows ?? 0} rows · ${file.nCols ?? 0} cols`
                                  : `${file.chunkCount ?? 0} chunks`}
                              </span>
                            </div>
                            {file.sample && file.sample.length > 0 ? (
                              <div className="mt-1 rounded border border-border/50 bg-muted/40 px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
                                {Object.entries(file.sample[0]).slice(0, 3).map(([key, value], idx) => (
                                  <span key={key}>
                                    {idx > 0 ? ' · ' : ''}
                                    {key}: {String(value)}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }

            if (msg.type === 'assistant_text') {
              return (
                <div key={msg.id} className="text-sm text-foreground">
                  <ProgressiveMessageText
                    messageId={msg.id}
                    text={msg.content}
                    isLive={activeTextMessageId === msg.id}
                    mode="markdown"
                    animateOnMount={!hydratedMessageIds.has(msg.id)}
                    className="llm-assistant-markdown prose prose-sm max-w-none dark:prose-invert"
                  />
                </div>
              );
            }

            if (msg.type === 'thinking') {
              return (
                <ThinkingBlock
                  key={msg.id}
                  messageId={msg.id}
                  content={msg.content}
                  isComplete={msg.isComplete}
                  isLive={activeThinkingMessageId === msg.id}
                  animateOnMount={!hydratedMessageIds.has(msg.id)}
                />
              );
            }

            if (msg.type === 'tool_call') {
              return (
                <ToolIndicator
                  key={msg.id}
                  toolCalls={[msg.call]}
                  results={msg.result ? [msg.result] : []}
                  isRunning={!msg.result}
                  autoExpandPreviewTools
                />
              );
            }

            if (msg.type === 'ask_user' && !msg.answered) {
              return (
                <div key={msg.id} className="space-y-2">
                  <QuestionCards
                    questions={msg.questions}
                    onSubmit={(answers) => handleQuestionAnswer(msg.id, answers)}
                    disabled={isStreaming}
                  />
                </div>
              );
            }

            if (msg.type === 'ask_user' && msg.answered) {
              return (
                <Card key={msg.id} className="border-muted/40 bg-muted/10 opacity-60">
                  <CardContent className="p-3 text-xs text-muted-foreground italic">
                    Questions answered
                  </CardContent>
                </Card>
              );
            }

            if (msg.type === 'plan') {
              if (msg.hidden && !msg.approved) {
                return null;
              }

              const planPath = toPlanPath(msg.planName);
              const isEditing = editingPlanId === msg.id;
              const draftValue = planDrafts[msg.id] ?? msg.content;

              return (
                <div key={msg.id} className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
                  <div className={cn(
                    "overflow-hidden rounded-lg transition-all",
                    isEditing 
                      ? "border border-primary/50 shadow-sm ring-1 ring-primary/20 bg-background" 
                      : "border border-primary/30 bg-primary/5 hover:border-primary/50"
                  )}>
                    <div className={cn(
                      "flex items-center justify-between border-b px-3 py-1.5",
                      isEditing ? "bg-muted/30 border-primary/20" : "border-primary/20 bg-muted/40"
                    )}>
                      <div className="font-mono text-[11px] text-muted-foreground" title={planPath}>
                        <span className="block truncate">{planPath}</span>
                      </div>
                      {isEditing && (
                        <div className="text-[10px] uppercase tracking-wider text-primary font-medium">
                          Editing Mode
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <textarea
                        value={draftValue}
                        onChange={(event) => {
                          setPlanDrafts((prev) => ({ ...prev, [msg.id]: event.target.value }));
                        }}
                        aria-label={`Edit plan ${planPath}`}
                        className="min-h-[350px] w-full resize-y bg-transparent px-4 py-4 font-mono text-sm leading-relaxed outline-none"
                        placeholder="Edit the proposed plan here..."
                        data-testid={`plan-editor-${msg.id}`}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartPlanEdit(msg.id, msg.content)}
                        className="w-full text-left p-4 outline-none focus-visible:bg-primary/10 transition-colors"
                        data-testid={`plan-view-${msg.id}`}
                        title="Click to edit this plan manually"
                      >
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      </button>
                    )}
                  </div>
                  {!msg.approved ? (
                    <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleCancelPlanEdit(msg.id, msg.content)}>
                              Cancel
                            </Button>
                            <Button size="sm" variant="default" onClick={() => handleSavePlanEdit(msg.id)}>
                              Save Edit
                            </Button>
                          </>
                        ) : null}
                        {!isEditing ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn('gap-1.5', projectColorClass.bg, projectColorClass.border, projectColorClass.hover, projectColorClass.text)}
                            onClick={() => handleApprove(msg.content, msg.planName, msg.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Approve Plan
                          </Button>
                        ) : null}
                      </div>
                      {!isEditing && (
                        <span className="text-xs text-muted-foreground italic">
                          Click the plan above to edit, or ask for changes below
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium',
                      projectColorClass.bg,
                      projectColorClass.border,
                      projectColorClass.text,
                    )}>
                      <Check className="h-4 w-4" />
                      Plan approved
                    </div>
                  )}
                </div>
              );
            }

            if (msg.type === 'error') {
              return (
                <div key={msg.id} className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {msg.message}
                </div>
              );
            }

            return null;
          })}

          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          )}

          </div>
        )}
      </ScrollArea>

      <div className="shrink-0 border-t bg-background">
        {hasUserMessages && followUpSuggestions.length > 0 ? (
          <div className="px-4 pt-2 pb-1">
            <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {followUpSuggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 whitespace-nowrap rounded-full px-3 text-xs"
                  disabled={isStreaming}
                  onClick={() => handleSuggestionClick(suggestion.prompt)}
                >
                  {suggestion.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="px-4 pt-2 pb-4">
          <LlmChatComposer
            value={inputValue}
            onValueChange={setInputValue}
            onKeyDown={handleKeyDown}
            placeholder="Describe your goal or request changes..."
            disabled={isStreaming}
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={() => controllerRef.current?.abort()}
            model={selectedModel}
            onModelChange={setSelectedModel}
            modelOptions={ASSISTANT_MODEL_OPTIONS}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={setReasoningEffort}
            reasoningOptions={reasoningEffortOptions}
            enableThinking={enableThinking}
            onToggleThinking={() => setEnableThinking((prev) => !prev)}
            metaSlot={(
              <Badge variant="outline" className="h-6 px-2 text-[11px] font-normal">
                <Brain className="mr-1 h-3 w-3" />
                {documentFiles.length} docs
              </Badge>
            )}
            attachment={{
              onAttachFile: handleAttachFile,
              status: attachmentStatus,
              message: attachmentMessage,
              items: composerAttachmentItems,
              onRemoveItem: handleRemoveAttachment,
              onRetryItem: handleRetryAttachment,
              accept: CONTEXT_ATTACHMENT_ACCEPT
            }}
            maxWidthClassName="max-w-5xl"
          />
        </div>
      </div>
    </div>
  );
}
