/**
 * TrainingPanel - Jupyter-style training interface with AI assistance
 *
 * Features:
 * - Model selection with template code
 * - Code cells with cloud Docker execution
 * - Package management
 * - Chat input for AI assistance (RAG-enabled)
 * - Rich output visualization
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable';
import {
  Plus,
  Code,
  Loader2,
  Wand2,
  Brain,
  Pencil,
  Trash2,
  Check,
  X,
  Copy
} from 'lucide-react';
import { CodeCell } from './CodeCell';
import { RuntimeManagerDialog } from './RuntimeManagerDialog';
import type { Cell } from '@/types/cell';
import type { ModelTemplate } from '@/types/model';
import { uploadDocument } from '@/lib/api/documents';
import { streamTrainingPlan, executeToolCalls } from '@/lib/api/llm';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/executionStore';
import { useDataStore } from '@/stores/dataStore';
import { useFeatureStore } from '@/stores/featureStore';
import { generateFeatureEngineeringCode } from '@/lib/features/codeGenerator';
import { getFileType, type UploadedFile } from '@/types/file';
import type { ToolCall, ToolResult, UiItem, UiSchema, ChatMessage } from '@/types/llmUi';
import { LlmChatComposer } from '@/components/llm/LlmChatComposer';
import {
  ASSISTANT_MODEL_OPTIONS,
  getModelOption,
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  type ReasoningEffort
} from '@/components/llm/modelOptions';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import { ThinkingBlock } from './ThinkingBlock';
import { NotebookEditor } from '@/components/notebook/NotebookEditor';
import { useNotebookStore } from '@/stores/notebookStore';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';

const stripAssistantArtifacts = (text: string) => {
  if (!text) return '';
  let cleaned = text.trim();

  // Check if the entire text is a JSON object with a "message" field
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed.message === 'string') {
        return parsed.message.trim();
      }
    } catch {
      // Not valid JSON, continue with regular processing
    }
  }

  cleaned = cleaned.replace(/```(?:json)?/g, '').replace(/```/g, '');
  const markerIndex = cleaned.indexOf('<<<JSON>>>');
  if (markerIndex !== -1) {
    cleaned = cleaned.slice(0, markerIndex);
  }
  const endIndex = cleaned.indexOf('<<<END>>>');
  if (endIndex !== -1) {
    cleaned = cleaned.slice(0, endIndex);
  }
  const jsonIndex = cleaned.search(/{\s*"version"\s*:\s*"1"/);
  if (jsonIndex !== -1) {
    cleaned = cleaned.slice(0, jsonIndex);
  }
  return cleaned.trim();
};

interface TrainingSuggestion {
  id: string;
  label: string;
  prompt: string;
}

function dedupeTrainingSuggestions(suggestions: TrainingSuggestion[]): TrainingSuggestion[] {
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

function buildTrainingSuggestions(
  messages: ChatMessage[],
  datasetFiles: UploadedFile[],
  documentFiles: UploadedFile[],
  isAiThinking: boolean,
): TrainingSuggestion[] {
  if (isAiThinking) {
    return [];
  }

  const hasUserMessages = messages.some((message) => message.type === 'user');
  const latestUserMessage = [...messages].reverse().find((message) => message.type === 'user');
  const latestError = [...messages].reverse().find((message) => message.type === 'error');
  const latestAssistantText = [...messages].reverse().find((message) => message.type === 'assistant_text');

  const suggestions: TrainingSuggestion[] = [];

  if (!hasUserMessages) {
    if (datasetFiles.length > 0) {
      suggestions.push(
        {
          id: 'train-initial-baseline',
          label: 'Baseline model',
          prompt: 'Suggest a strong baseline training plan for this dataset with sensible defaults.'
        },
        {
          id: 'train-initial-target',
          label: 'Pick target + metric',
          prompt: 'Help me choose the right target column and evaluation metrics for this project.'
        }
      );
    }

    if (documentFiles.length > 0) {
      suggestions.push({
        id: 'train-initial-docs',
        label: 'Use docs in training',
        prompt: 'Use the uploaded documents to suggest useful feature hypotheses and validation checks.'
      });
    }

    suggestions.push({
      id: 'train-initial-sanity',
      label: 'Data sanity checks',
      prompt: 'Before modeling, propose a concise data sanity-check checklist for this training workflow.'
    });

    return dedupeTrainingSuggestions(suggestions).slice(0, 6);
  }

  if (latestError?.type === 'error') {
    suggestions.push(
      {
        id: 'train-error-debug',
        label: 'Debug latest error',
        prompt: 'Debug the latest training error step by step and suggest the minimum safe fix.'
      },
      {
        id: 'train-error-robust',
        label: 'Harden pipeline',
        prompt: 'Refactor this training flow to be more robust to schema and data edge cases.'
      }
    );
  }

  if (latestUserMessage?.type === 'user') {
    const text = latestUserMessage.content.toLowerCase();
    if (text.includes('overfit') || text.includes('generaliz')) {
      suggestions.push({
        id: 'train-overfit',
        label: 'Reduce overfitting',
        prompt: 'Propose targeted changes to reduce overfitting while keeping accuracy strong.'
      });
    }
    if (text.includes('speed') || text.includes('slow')) {
      suggestions.push({
        id: 'train-speed',
        label: 'Faster training',
        prompt: 'Optimize this training workflow for speed and explain the performance trade-offs.'
      });
    }
  }

  if (latestAssistantText?.type === 'assistant_text') {
    suggestions.push({
      id: 'train-summary',
      label: 'Summarize next steps',
      prompt: 'Summarize the next 5 concrete training steps from our current context.'
    });
  }

  if (datasetFiles.length > 0) {
    suggestions.push({
      id: 'train-validation',
      label: 'Validation strategy',
      prompt: 'Refine the validation strategy with leakage checks, folds, and metric thresholds.'
    });
  }

  suggestions.push({
    id: 'train-compare',
    label: 'Compare models',
    prompt: 'Recommend two additional model families to compare and explain why they are good fits.'
  });

  return dedupeTrainingSuggestions(suggestions).slice(0, 7);
}

export function TrainingPanel() {
  const { projectId } = useParams<{ projectId: string }>();

  const [selectedModel, _setSelectedModel] = useState<ModelTemplate | null>(null);
  void _setSelectedModel; // Reserved for future use
  const [cells, setCells] = useState<Cell[]>([]);
  const cellsRef = useRef<Cell[]>(cells);
  const [chatInput, setChatInput] = useState('');
  const [assistantModel, setAssistantModel] = useState(ASSISTANT_MODEL_OPTIONS[0]?.value ?? 'auto');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    getDefaultReasoningEffort(ASSISTANT_MODEL_OPTIONS[0]?.value ?? 'auto')
  );
  const [enableThinking, setEnableThinking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState<'idle' | 'uploading' | 'error' | 'success'>('idle');
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const [trainingPrompt, setTrainingPrompt] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_trainingText, setTrainingText] = useState('');
  const [trainingUi, setTrainingUi] = useState<UiSchema | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_trainingToolCalls, setTrainingToolCalls] = useState<ToolCall[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_trainingToolResults, setTrainingToolResults] = useState<ToolResult[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_trainingError, setTrainingError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_thinkingContent, setThinkingContent] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isThinkingComplete, setIsThinkingComplete] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_isTrainingGenerating, setIsTrainingGenerating] = useState(false);
  const [trainingDatasetId, setTrainingDatasetId] = useState<string | null>(null);
  const [trainingTargetColumn, setTrainingTargetColumn] = useState<string | undefined>();
  const trainingToolHistoryRef = useRef<{ calls: ToolCall[]; results: ToolResult[] }>({ calls: [], results: [] });

  // Interleaved chat messages for rendering
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const currentThinkingIdRef = useRef<string | null>(null);
  const currentTextIdRef = useRef<string | null>(null);

  // Edit/delete message state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trainingAbortRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const autoRunIdsRef = useRef(new Set<string>());
  // Pending cell executions scheduled by run_cell tool
  const [pendingRunCells, setPendingRunCells] = useState<string[]>([]);

  // Keep cellsRef in sync with cells state
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  // Execution store (cloud-only)
  const {
    cloudAvailable,
    cloudInitializing,
    sessionId,
    initializeCloud,
    checkCloudHealth,
    executeCode: executeWithStore
  } = useExecutionStore();

  // Notebook store for backend-managed cells
  const {
    initializeNotebook,
    disconnect: disconnectNotebook,
    createCell: createNotebookCell
  } = useNotebookStore();

  // Initialize notebook when projectId changes
  useEffect(() => {
    if (projectId) {
      initializeNotebook(projectId);
    }
    return () => {
      disconnectNotebook();
    };
  }, [projectId, initializeNotebook, disconnectNotebook]);

  // Track if notebook pane should be visible (always true for demo)
  const showNotebook = true;

  // Get dataset files for autocomplete
  const files = useDataStore((s) => s.files);
  const addFile = useDataStore((s) => s.addFile);
  const setFileMetadata = useDataStore((s) => s.setFileMetadata);
  const hydrateFromBackend = useDataStore((s) => s.hydrateFromBackend);
  const projectFiles = useMemo(() =>
    projectId ? files.filter(f => f.projectId === projectId) : [],
    [files, projectId]
  );
  const datasetFiles = useMemo(
    () => projectFiles.filter((file) => file.metadata?.datasetId),
    [projectFiles]
  );
  const trainingDatasetOptions = useMemo(
    () =>
      datasetFiles
        .map((file) => ({
          datasetId: file.metadata?.datasetId,
          name: file.name,
          columns: file.metadata?.columns ?? []
        }))
        .filter((file): file is { datasetId: string; name: string; columns: string[] } => Boolean(file.datasetId)),
    [datasetFiles]
  );
  const datasetCompletionFiles = useMemo(
    () => datasetFiles.map((file) => file.name),
    [datasetFiles]
  );
  const selectedTrainingFile = useMemo(
    () => datasetFiles.find((file) => file.metadata?.datasetId === trainingDatasetId),
    [datasetFiles, trainingDatasetId]
  );
  const documentFiles = useMemo(
    () => projectFiles.filter((file) => file.metadata?.documentId),
    [projectFiles]
  );
  const hasUserMessages = useMemo(
    () => messages.some((message) => message.type === 'user'),
    [messages]
  );
  const trainingSuggestions = useMemo(
    () => buildTrainingSuggestions(messages, datasetFiles, documentFiles, isAiThinking),
    [messages, datasetFiles, documentFiles, isAiThinking]
  );
  const showCenteredTrainingSuggestions = !hasUserMessages && !isAiThinking && messages.length === 0 && trainingSuggestions.length > 0;
  const reasoningEffortOptions = useMemo(
    () => getReasoningEffortOptions(assistantModel),
    [assistantModel]
  );
  const assistantModelOption = useMemo(
    () => getModelOption(assistantModel),
    [assistantModel]
  );
  const shouldIncludeThoughts = assistantModelOption.supportsThinking
    && (assistantModelOption.thinkingAlwaysOn || enableThinking);

  useEffect(() => {
    const supportsCurrent = reasoningEffortOptions.some((option) => option.value === reasoningEffort);
    if (!supportsCurrent) {
      setReasoningEffort(getDefaultReasoningEffort(assistantModel));
    }
  }, [assistantModel, reasoningEffort, reasoningEffortOptions]);

  const llmCodeCells = useMemo(() => {
    if (!trainingUi) return [];
    return trainingUi.sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.type === 'code_cell'
          ? [{
            id: item.id,
            content: item.content,
            autoRun: item.autoRun ?? false,
            title: item.title
          }]
          : []
      )
    );
  }, [trainingUi]);
  const manualCells = useMemo(
    () => cells.filter((cell) => !cell.id.startsWith('llm-')),
    [cells]
  );

  // Get feature specs for this project
  const features = useFeatureStore((s) => s.features);
  const hydrateFeatures = useFeatureStore((s) => s.hydrateFromProject);
  const projectFeatures = useMemo(() =>
    projectId ? features.filter(f => f.projectId === projectId && f.enabled) : [],
    [features, projectId]
  );

  useEffect(() => {
    if (!projectId) return;
    hydrateFeatures(projectId);
  }, [projectId, hydrateFeatures]);

  useEffect(() => {
    if (!projectId) return;
    hydrateFromBackend(projectId);
  }, [projectId, hydrateFromBackend]);

  // Load messages from localStorage on mount
  useEffect(() => {
    if (!projectId) return;
    const stored = localStorage.getItem(`training-messages-${projectId}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ChatMessage[];
        setMessages(parsed);
      } catch {
        // Ignore invalid stored data
      }
    }
  }, [projectId]);

  // Save messages to localStorage when they change
  useEffect(() => {
    if (!projectId || messages.length === 0) return;
    localStorage.setItem(`training-messages-${projectId}`, JSON.stringify(messages));
  }, [projectId, messages]);

  useEffect(() => {
    if (!trainingDatasetId && trainingDatasetOptions.length > 0) {
      setTrainingDatasetId(trainingDatasetOptions[0].datasetId);
    }
  }, [trainingDatasetId, trainingDatasetOptions]);

  useEffect(() => {
    const selected = trainingDatasetOptions.find((dataset) => dataset.datasetId === trainingDatasetId);
    if (!selected) return;
    if (!trainingTargetColumn || !selected.columns.includes(trainingTargetColumn)) {
      setTrainingTargetColumn(selected.columns[0]);
    }
  }, [trainingDatasetOptions, trainingDatasetId, trainingTargetColumn]);

  useEffect(() => {
    if (llmCodeCells.length === 0) return;
    setCells((prev) => {
      const manualCells = prev.filter((cell) => !cell.id.startsWith('llm-'));
      const existingMap = new Map(prev.map((cell) => [cell.id, cell]));
      const nextLlmCells = llmCodeCells.map((item) => {
        const id = `llm-${item.id}`;
        const existing = existingMap.get(id);
        if (existing) {
          if (existing.content === item.content) return existing;
          return { ...existing, content: item.content };
        }
        return {
          id,
          type: 'code' as const,
          content: item.content,
          status: 'idle' as const,
          createdAt: new Date().toISOString()
        };
      });
      return [...manualCells, ...nextLlmCells];
    });
  }, [llmCodeCells]);

  useEffect(() => {
    checkCloudHealth().catch(() => undefined);
  }, [checkCloudHealth]);

  useEffect(() => {
    if (projectId && cloudAvailable && !sessionId && !cloudInitializing) {
      initializeCloud(projectId).catch(console.error);
    }
  }, [projectId, cloudAvailable, sessionId, cloudInitializing, initializeCloud]);

  // Scroll to bottom when cells change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [cells]);

  // Auto-resize chat composer
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const nextHeight = Math.min(220, Math.max(80, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
  }, [chatInput]);

  useEffect(() => {
    if (!attachmentMessage) return;
    const timeout = setTimeout(() => {
      setAttachmentMessage(null);
      setAttachmentStatus('idle');
    }, 4000);
    return () => clearTimeout(timeout);
  }, [attachmentMessage]);

  // Generate unique ID for cells
  const generateCellId = () => `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Add a new code cell
  const addCodeCell = useCallback((content: string = '') => {
    const newCell: Cell = {
      id: generateCellId(),
      type: 'code',
      content,
      status: 'idle',
      createdAt: new Date().toISOString()
    };
    setCells(prev => [...prev, newCell]);
  }, []);

  // Generate feature engineering code and add as a cell
  const handleGenerateFeatureCode = useCallback(() => {
    if (projectFeatures.length === 0 || datasetFiles.length === 0) return;

    // Use the first dataset file
    const datasetFile = datasetFiles[0];
    const code = generateFeatureEngineeringCode(projectFeatures, datasetFile.name, {
      datasetId: datasetFile.metadata?.datasetId
    });
    addCodeCell(code);
  }, [projectFeatures, datasetFiles, addCodeCell]);

  const buildFeatureSummary = useCallback(() => {
    if (projectFeatures.length === 0) return undefined;
    const names = projectFeatures.slice(0, 6).map((feature) => feature.featureName);
    const suffix = projectFeatures.length > 6 ? ` +${projectFeatures.length - 6} more` : '';
    return `${projectFeatures.length} enabled features: ${names.join(', ')}${suffix}`;
  }, [projectFeatures]);

  const resetTrainingToolHistory = useCallback(() => {
    trainingToolHistoryRef.current = { calls: [], results: [] };
    setTrainingToolCalls([]);
    setTrainingToolResults([]);
  }, []);

  const handleGenerateTrainingPlan = useCallback(async (
    promptOverride?: string,
    toolResultsOverride?: ToolResult[],
    toolCallsOverride?: ToolCall[]
  ) => {
    if (!projectId || !selectedTrainingFile?.metadata?.datasetId) return;

    trainingAbortRef.current?.abort();
    const requestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    trainingAbortRef.current = controller;

    const promptValue = (promptOverride ?? trainingPrompt).trim();

    // Only reset state completely on fresh user requests (no tool results)
    // When re-streaming with tool results, preserve the conversation context
    const isRestream = Boolean(toolResultsOverride?.length);

    if (!isRestream) {
      resetTrainingToolHistory();
      setTrainingText('');
      setTrainingUi(null);
      setTrainingToolCalls([]);
      // Reset thinking state for new conversation
      setThinkingContent('');
      setIsThinkingComplete(false);
    } else {
      // On restream, DON'T clear tool calls - they should remain visible as executed
    }

    setTrainingError(null);
    setTrainingToolResults(toolResultsOverride ?? []);
    setIsTrainingGenerating(true);

    try {
      console.log('[TrainingPanel] Calling streamTrainingPlan', {
        model: assistantModel,
        thinkingLevel: reasoningEffort
      });
      await streamTrainingPlan(
        {
          projectId,
          datasetId: selectedTrainingFile.metadata.datasetId,
          targetColumn: trainingTargetColumn,
          prompt: promptValue || undefined,
          toolCalls: toolCallsOverride?.length ? toolCallsOverride : undefined,
          toolResults: toolResultsOverride?.length ? toolResultsOverride : undefined,
          featureSummary: buildFeatureSummary(),
          enableThinking: shouldIncludeThoughts,
          thinkingLevel: reasoningEffort,
          model: assistantModel !== 'auto' ? assistantModel : undefined
        },
        (event) => {
          if (requestId !== activeRequestIdRef.current) {
            return;
          }

          if (event.type === 'token') {
            // If we were thinking, mark thinking as complete now that tokens are arriving
            if (currentThinkingIdRef.current) {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, isComplete: true }
                  : msg
              ));
              setIsThinkingComplete(true);
              currentThinkingIdRef.current = null;
            }
            setTrainingText((prev) => prev + event.text);
            // Append to current text message or create new one
            if (!currentTextIdRef.current) {
              const id = `text-${Date.now()}`;
              currentTextIdRef.current = id;
              setMessages((prev) => [...prev, { id, type: 'assistant_text', content: event.text }]);
            } else {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentTextIdRef.current && msg.type === 'assistant_text'
                  ? { ...msg, content: msg.content + event.text }
                  : msg
              ));
            }
          }
          if (event.type === 'envelope') {
            // If we were thinking, mark thinking as complete
            if (currentThinkingIdRef.current) {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, isComplete: true }
                  : msg
              ));
              setIsThinkingComplete(true);
              currentThinkingIdRef.current = null;
            }
            if (event.envelope.tool_calls?.length) {
              // End current text message, add tool call messages
              currentTextIdRef.current = null;
              setTrainingToolCalls(event.envelope.tool_calls);
              trainingToolHistoryRef.current.calls = mergeToolCalls(
                trainingToolHistoryRef.current.calls,
                event.envelope.tool_calls
              );
              // Add each tool call as a separate message
              for (const call of event.envelope.tool_calls) {
                setMessages((prev) => [...prev, { id: `tool-${call.id}`, type: 'tool_call', call }]);
              }

              // Execute tool calls and update messages with results
              const toolCalls = event.envelope.tool_calls;
              executeToolCalls(projectId, toolCalls)
                .then(({ results }) => {
                  if (requestId !== activeRequestIdRef.current) {
                    return;
                  }

                  // Update each tool call message with its result
                  setMessages((prev) =>
                    prev.map((msg) => {
                      if (msg.type === 'tool_call') {
                        const result = results.find((r) => r.id === msg.call.id);
                        if (result) {
                          return { ...msg, result };
                        }
                      }
                      return msg;
                    })
                  );
                  // Store merged results for LLM context to avoid tool-history amnesia.
                  const mergedResults = [...trainingToolHistoryRef.current.results, ...results];
                  trainingToolHistoryRef.current.results = mergedResults;
                  setTrainingToolResults(mergedResults);

                  // Re-invoke LLM with tool results to continue the agentic loop
                  // Use setTimeout to allow state updates to settle
                  setTimeout(() => {
                    if (requestId !== activeRequestIdRef.current) {
                      return;
                    }

                    void handleGenerateTrainingPlan(
                      trainingPrompt, // Keep same prompt
                      mergedResults,                      // Pass full tool result history
                      trainingToolHistoryRef.current.calls // Pass full tool call history
                    );
                  }, 100);
                })
                .catch((toolError) => {
                  if (requestId !== activeRequestIdRef.current) {
                    return;
                  }

                  console.error('[TrainingPanel] Tool execution failed:', toolError);
                  // Mark tools as failed
                  setMessages((prev) =>
                    prev.map((msg) => {
                      if (msg.type === 'tool_call' && toolCalls.some((tc: ToolCall) => tc.id === msg.call.id)) {
                        return {
                          ...msg,
                          result: {
                            id: msg.call.id,
                            tool: msg.call.tool,
                            error: toolError instanceof Error ? toolError.message : 'Tool execution failed'
                          }
                        };
                      }
                      return msg;
                    })
                  );
                });
            }
            if (event.envelope.ui) {
              setTrainingUi(event.envelope.ui);
              const id = `ui-${Date.now()}`;
              setMessages((prev) => [...prev, { id, type: 'ui', schema: event.envelope.ui! }]);
            }
            if (event.envelope.message) {
              setTrainingText((prev) => (prev.trim() ? prev : event.envelope.message ?? ''));
            }
          }
          if (event.type === 'error') {
            setTrainingError(event.message);
            const id = `error-${Date.now()}`;
            setMessages((prev) => [...prev, { id, type: 'error', message: event.message }]);
            // Mark thinking as complete on error to stop timer
            if (currentThinkingIdRef.current) {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, isComplete: true }
                  : msg
              ));
              currentThinkingIdRef.current = null;
            }
            setIsThinkingComplete(true);
            setIsTrainingGenerating(false);
          }
          if (event.type === 'thinking') {
            // End current text message, start new thinking message or append to current
            currentTextIdRef.current = null;
            setIsThinkingComplete(false);
            setThinkingContent((prev) => prev + event.text);
            if (!currentThinkingIdRef.current) {
              const id = `thinking-${Date.now()}`;
              currentThinkingIdRef.current = id;
              setMessages((prev) => [...prev, { id, type: 'thinking', content: event.text, isComplete: false, startTime: Date.now() }]);
            } else {
              setMessages((prev) => prev.map((msg) =>
                msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
                  ? { ...msg, content: msg.content + event.text }
                  : msg
              ));
            }
          }
          if (event.type === 'done') {
            setIsTrainingGenerating(false);
            // Mark ALL incomplete thinking blocks as complete (not just the current ref)
            // This ensures thinking timers stop even if the ref was cleared elsewhere
            setMessages((prev) => prev.map((msg) =>
              msg.type === 'thinking' && !msg.isComplete
                ? { ...msg, isComplete: true }
                : msg
            ));
            setIsThinkingComplete(true);
            // Reset refs for next generation
            currentThinkingIdRef.current = null;
            currentTextIdRef.current = null;
          }
        },
        controller.signal
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;

      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      setTrainingError(error instanceof Error ? error.message : 'Failed to generate training plan.');
      setIsTrainingGenerating(false);
      // Mark thinking as complete on catch to stop timer
      if (currentThinkingIdRef.current) {
        setMessages((prev) => prev.map((msg) =>
          msg.id === currentThinkingIdRef.current && msg.type === 'thinking'
            ? { ...msg, isComplete: true }
            : msg
        ));
        currentThinkingIdRef.current = null;
      }
      setIsThinkingComplete(true);
    } finally {
      if (trainingAbortRef.current === controller) {
        trainingAbortRef.current = null;
      }
    }
  }, [
    projectId,
    selectedTrainingFile,
    trainingTargetColumn,
    trainingPrompt,
    buildFeatureSummary,
    resetTrainingToolHistory,
    assistantModel,
    shouldIncludeThoughts,
    reasoningEffort
  ]);

  // NOTE: Cell tool execution code was removed since ToolIndicator no longer has onRun prop.
  // The LLM tools (list_cells, read_cell, write_cell, edit_cell, run_cell) were processed by
  // handleRunTrainingTools which was removed. Auto-run was disabled due to infinite loops.
  // If tool execution needs to be restored, implement it with proper safeguards.

  const handleStopTraining = useCallback(() => {
    activeRequestIdRef.current += 1;
    trainingAbortRef.current?.abort();
    trainingAbortRef.current = null;
    setIsTrainingGenerating(false);
    setMessages((prev) => prev.map((msg) =>
      msg.type === 'thinking' && !msg.isComplete
        ? { ...msg, isComplete: true }
        : msg
    ));
    currentThinkingIdRef.current = null;
    currentTextIdRef.current = null;
  }, []);

  const mergeToolCalls = (previous: ToolCall[], next: ToolCall[]) => {
    const merged = new Map(previous.map((call) => [call.id, call]));
    next.forEach((call) => merged.set(call.id, call));
    return Array.from(merged.values());
  };

  const renderTrainingItem = (item: UiItem) => {
    switch (item.type) {
      case 'dataset_summary':
        return (
          <Card key={item.datasetId} className="border-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dataset snapshot</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-center justify-between">
                <span>{item.filename}</span>
                <Badge variant="outline" className="text-[10px]">{item.rows} rows</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span>{item.columns} columns</span>
                <Badge variant="secondary" className="text-[10px]">{item.datasetId.slice(0, 8)}</Badge>
              </div>
              {item.notes?.length ? (
                <ul className="space-y-1">
                  {item.notes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        );
      case 'report':
        return (
          <Card key={item.id} className="border-muted/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {item.format === 'markdown' ? (
                <div className="prose prose-sm dark:prose-invert">{item.content}</div>
              ) : item.format === 'json' ? (
                <pre className="bg-muted p-2 rounded text-[11px] overflow-x-auto">{item.content}</pre>
              ) : (
                <p className="whitespace-pre-wrap">{item.content}</p>
              )}
            </CardContent>
          </Card>
        );
      case 'input_form':
        return (
          <Card key={item.id} className="border-muted/40">
            {item.title && (
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{item.title}</CardTitle>
              </CardHeader>
            )}
            <CardContent className="space-y-3">
              {item.controls.map((control) => (
                <div key={control.key} className="space-y-1">
                  <label className="text-xs font-medium">{control.label}</label>
                  {control.type === 'select' && control.options ? (
                    <Select defaultValue={String(control.value)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {control.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : control.type === 'number' || control.type === 'slider' ? (
                    <input
                      type="number"
                      className="w-full h-8 px-2 text-xs border rounded"
                      defaultValue={Number(control.value)}
                      min={control.min}
                      max={control.max}
                      step={control.step}
                    />
                  ) : control.type === 'boolean' ? (
                    <input type="checkbox" defaultChecked={Boolean(control.value)} />
                  ) : (
                    <input
                      type="text"
                      className="w-full h-8 px-2 text-xs border rounded"
                      defaultValue={String(control.value)}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      case 'model_recommendation':
        return (
          <Card key={item.id} className="border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{item.template.name}</p>
                  <p className="text-xs text-muted-foreground">{item.rationale}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{item.template.library}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {item.template.metrics.map((metric) => (
                  <Badge key={metric} variant="secondary" className="text-[10px]">{metric}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      case 'code_cell':
        {
          const cellId = `llm-${item.id}`;
          const cell = cells.find((entry) => entry.id === cellId);
          if (!cell) return null;
          const cellNumber = Math.max(1, cells.findIndex((entry) => entry.id === cellId) + 1);
          return (
            <div key={item.id} className="space-y-2">
              {item.title && <p className="text-xs font-medium text-muted-foreground">{item.title}</p>}
              <CodeCell
                cell={cell}
                cellNumber={cellNumber}
                onRun={cell.type === 'code' ? () => handleRunCell(cell.id) : undefined}
                onDelete={() => handleDeleteCell(cell.id)}
                onContentChange={cell.type === 'code' ? (content) => handleCellContentChange(cell.id, content) : undefined}
                isRunning={cell.status === 'running'}
                datasetFiles={datasetCompletionFiles}
              />
            </div>
          );
        }
      case 'callout':
        return (
          <div
            key={item.text}
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              item.tone === 'warning' && 'border-amber-500/40 text-amber-600',
              item.tone === 'success' && 'border-emerald-500/40 text-emerald-600'
            )}
          >
            {item.text}
          </div>
        );
      case 'action':
        // Legacy - actions are now handled via tool calls
        return null;
      default:
        return null;
    }
  };

  // Handle cell content change
  const handleCellContentChange = useCallback((cellId: string, content: string) => {
    setCells(prev => prev.map(cell =>
      cell.id === cellId ? { ...cell, content } : cell
    ));
  }, []);

  // Handle cell deletion
  const handleDeleteCell = useCallback((cellId: string) => {
    setCells(prev => prev.filter(cell => cell.id !== cellId));
  }, []);

  // Execute a cell with real Python runtime
  const handleRunCell = useCallback(async (cellId: string) => {
    console.log('[handleRunCell] START - cellId:', cellId, 'projectId:', projectId);

    if (!projectId) {
      console.log('[handleRunCell] ABORT - no projectId');
      return;
    }

    // Use cellsRef.current to get fresh cells (avoids stale closure)
    const currentCells = cellsRef.current;
    const cell = currentCells.find(c => c.id === cellId);
    console.log('[handleRunCell] Found cell:', cell ? 'YES' : 'NO', 'type:', cell?.type, 'totalCells:', currentCells.length);

    if (!cell || cell.type !== 'code') {
      console.log('[handleRunCell] ABORT - cell not found or not code type');
      return;
    }

    console.log('[handleRunCell] Setting status to running...');
    // Update cell status to running
    setCells(prev => prev.map(c =>
      c.id === cellId
        ? { ...c, status: 'running' as const, executedAt: new Date().toISOString() }
        : c
    ));

    try {
      console.log('[handleRunCell] Calling executeWithStore, content length:', cell.content.length);
      const result = await executeWithStore(cell.content, projectId);
      console.log('[handleRunCell] executeWithStore returned:', result.status);

      // Update cell with result
      setCells(prev => prev.map(c => {
        if (c.id !== cellId) return c;

        return {
          ...c,
          status: result.status === 'success' ? 'success' as const : 'error' as const,
          executionDurationMs: result.executionMs,
          output: {
            type: result.status === 'error' ? 'error' as const : 'text' as const,
            content: result.stdout || result.stderr || '',
            data: result.outputs
          }
        };
      }));
    } catch (error) {
      console.error('Execution error:', error);
      setCells(prev => prev.map(c =>
        c.id === cellId
          ? {
            ...c,
            status: 'error' as const,
            output: {
              type: 'error' as const,
              content: error instanceof Error ? error.message : 'Execution failed'
            }
          }
          : c
      ));
    }
  }, [projectId, executeWithStore]); // Note: uses cellsRef.current for fresh cells

  useEffect(() => {
    if (llmCodeCells.length === 0) return;
    llmCodeCells.forEach((item) => {
      if (!item.autoRun) return;
      const cellId = `llm-${item.id}`;
      if (autoRunIdsRef.current.has(cellId)) return;
      const cell = cells.find((entry) => entry.id === cellId);
      if (!cell || cell.status !== 'idle') return;
      autoRunIdsRef.current.add(cellId);
      void handleRunCell(cellId);
    });
  }, [cells, handleRunCell, llmCodeCells]);

  // Process pending cell executions from run_cell tool
  useEffect(() => {
    if (pendingRunCells.length === 0) return;
    // Clear pending cells and execute them
    const cellsToRun = pendingRunCells;
    setPendingRunCells([]);
    cellsToRun.forEach((cellId) => {
      void handleRunCell(cellId);
    });
  }, [handleRunCell, pendingRunCells]);

  const handleAttachFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId) return;

    const uploadedFile: UploadedFile = {
      id: crypto.randomUUID(),
      name: file.name,
      type: getFileType(file),
      size: file.size,
      uploadedAt: new Date(),
      projectId,
      file
    };

    addFile(uploadedFile);
    setAttachmentStatus('uploading');
    setAttachmentMessage(null);

    try {
      const response = await uploadDocument(projectId, file);
      const document = response.document;

      setFileMetadata(uploadedFile.id, {
        documentId: document.documentId,
        chunkCount: document.chunkCount,
        embeddingDimension: document.embeddingDimension
      });

      setAttachmentStatus('success');
      setAttachmentMessage(`Added ${file.name} to context`);
    } catch (error) {
      setAttachmentStatus('error');
      setAttachmentMessage(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      event.target.value = '';
    }
  }, [projectId, addFile, setFileMetadata]);

  // Edit message handlers
  const handleEditMessage = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId);
    if (msg?.type === 'user') {
      setEditingMessageId(msgId);
      setEditContent(msg.content);
    }
  }, [messages]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditContent('');
  }, []);

  const handleSaveEdit = useCallback((msgId: string) => {
    const trimmedEdit = editContent.trim();
    if (!trimmedEdit || isAiThinking || !projectId) return;

    // Find message index
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;
    const existing = messages[idx];
    if (existing?.type !== 'user') return;
    if (existing.content.trim() === trimmedEdit) return;

    // Truncate all messages after edited one
    const newMessages = messages.slice(0, idx);
    // Add the edited message with new content
    newMessages.push({ ...existing, content: trimmedEdit } as ChatMessage);
    setMessages(newMessages);

    // Reset edit state
    setEditingMessageId(null);
    setEditContent('');

    // Re-send edited message immediately so submit button behaves like expected.
    setTrainingPrompt(trimmedEdit);
    setIsAiThinking(true);
    void handleGenerateTrainingPlan(trimmedEdit).finally(() => {
      setIsAiThinking(false);
      textareaRef.current?.focus();
    });
  }, [messages, editContent, isAiThinking, projectId, handleGenerateTrainingPlan]);

  const handleDeleteMessage = useCallback((msgId: string) => {
    // Find message index
    const idx = messages.findIndex(m => m.id === msgId);
    if (idx === -1) return;

    // Remove this message and all subsequent messages
    setMessages(messages.slice(0, idx));
  }, [messages]);

  const submitChatPrompt = useCallback(async (rawPrompt: string) => {
    const userMessage = rawPrompt.trim();
    if (!userMessage || !projectId || isAiThinking) return;

    setChatInput('');
    setTrainingPrompt(userMessage);
    setIsAiThinking(true);

    // Add user message to chat history
    const userChatMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: userMessage,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userChatMessage]);

    try {
      await handleGenerateTrainingPlan(userMessage);
    } finally {
      setIsAiThinking(false);
      textareaRef.current?.focus();
    }
  }, [projectId, isAiThinking, handleGenerateTrainingPlan]);

  const handleChatSubmit = useCallback(async () => {
    await submitChatPrompt(chatInput);
  }, [chatInput, submitChatPrompt]);

  const handleSuggestionClick = useCallback((prompt: string) => {
    void submitChatPrompt(prompt);
  }, [submitChatPrompt]);

  const handleChatKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleChatSubmit();
    }
  }, [handleChatSubmit]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compact toolbar - h-14 to align with sidebar */}
      <div className="flex h-14 items-center justify-between gap-2 px-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          {/* Cloud status indicator */}
          <Badge
            variant={cloudAvailable ? 'default' : 'secondary'}
            className={cn(
              'text-xs gap-1.5',
              cloudInitializing && 'animate-pulse'
            )}
          >
            {cloudInitializing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : cloudAvailable ? (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            ) : (
              <span className="h-2 w-2 rounded-full bg-destructive" />
            )}
            {cloudInitializing ? 'Connecting...' : cloudAvailable ? 'Cloud' : 'Unavailable'}
          </Badge>
          {projectId && <RuntimeManagerDialog projectId={projectId} />}
          {selectedModel && (
            <Badge variant="outline" className="text-xs gap-1">
              <Code className="h-3 w-3" />
              {selectedModel.name}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Generate Features button - only show if features exist */}
          {projectFeatures.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="hover:bg-purple-500/10 hover:text-purple-500 transition-transform hover:scale-110"
                    onClick={handleGenerateFeatureCode}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Generate feature code ({projectFeatures.length} features)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Add Cell - Opens notebook panel and adds cell */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-primary/10 hover:text-primary transition-transform hover:scale-110"
            onClick={() => createNotebookCell({ content: '', cellType: 'code' })}
            title="Add notebook cell"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Split-pane: Chat left, Notebook right */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* Chat Panel - Left side */}
        <ResizablePanel defaultSize={showNotebook ? 50 : 100} minSize={30}>
          <div className="flex flex-col h-full min-h-0">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-4">
                {showCenteredTrainingSuggestions ? (
                  <div className="mx-auto flex min-h-[55vh] w-full max-w-5xl flex-col items-center justify-center gap-5 text-center">
                    <p className="text-base font-medium text-foreground">What are you trying to do today?</p>
                    <div className="flex max-w-3xl flex-wrap items-center justify-center gap-2">
                      {trainingSuggestions.map((suggestion) => (
                        <Button
                          key={suggestion.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          disabled={isAiThinking}
                          onClick={() => handleSuggestionClick(suggestion.prompt)}
                        >
                          {suggestion.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : projectId ? (
                  <>
                    {/* Conversation content - no controls, model uses tools */}
                    <div className="space-y-4">
                      {/* Render messages in order of arrival */}
                      {messages.map((msg) => {
                        switch (msg.type) {
                          case 'user':
                            return (
                              <div key={msg.id} className="flex flex-col items-end group">
                                {/* Message bubble - right aligned */}
                                <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                                  {editingMessageId === msg.id ? (
                                    <div className="flex flex-col gap-1">
                                      <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' && !event.shiftKey) {
                                            event.preventDefault();
                                            void handleSaveEdit(msg.id);
                                          }
                                        }}
                                        className="w-full min-w-[220px] bg-transparent p-0 text-sm leading-relaxed text-foreground resize-none border-0 shadow-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                                        style={{ minHeight: '1.5em' }}
                                        rows={Math.max(1, msg.content.split('\n').length)}
                                        autoFocus
                                      />
                                      <div className="flex justify-end gap-0.5 -mr-2 -mb-1">
                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          className="h-6 w-6"
                                          onClick={handleCancelEdit}
                                          title="Cancel"
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          className="h-6 w-6"
                                          onClick={() => handleSaveEdit(msg.id)}
                                          title="Save and re-send"
                                          disabled={
                                            isAiThinking ||
                                            !editContent.trim() ||
                                            editContent.trim() === msg.content.trim()
                                          }
                                        >
                                          <Check className="h-3 w-3 text-emerald-600" />
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    msg.content
                                  )}
                                </div>
                                {/* Controls below message - shown on hover */}
                                {editingMessageId !== msg.id && (
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5 mt-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      className="h-6 w-6 p-1"
                                      onClick={() => navigator.clipboard.writeText(msg.content)}
                                      title="Copy message"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      className="h-6 w-6 p-1"
                                      onClick={() => handleEditMessage(msg.id)}
                                      title="Edit message"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      className="h-6 w-6 p-1"
                                      onClick={() => handleDeleteMessage(msg.id)}
                                      title="Delete message and all following"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          case 'thinking':
                            return (
                              <ThinkingBlock
                                key={msg.id}
                                content={msg.content}
                                isComplete={msg.isComplete}
                              />
                            );
                          case 'assistant_text':
                            return msg.content.trim() ? (
                              <div key={msg.id} className="text-sm text-foreground max-w-none [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeKatex]}
                                  components={{
                                    p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc pl-4 text-sm">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal pl-4 text-sm">{children}</ol>,
                                    li: ({ children }) => <li className="text-sm">{children}</li>,
                                    code: ({ className, children, ...props }) => {
                                      const isInline = !className;
                                      if (isInline) {
                                        return (
                                          <code className="bg-muted px-1.5 py-0.5 rounded text-[13px] font-mono" {...props}>
                                            {children}
                                          </code>
                                        );
                                      }
                                      return (
                                        <code className={cn(className, 'text-[13px]')} {...props}>
                                          {children}
                                        </code>
                                      );
                                    },
                                    pre: ({ children }) => (
                                      <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-4 rounded-md overflow-x-auto text-[13px] font-mono my-3">
                                        {children}
                                      </pre>
                                    )
                                  }}
                                >
                                  {stripAssistantArtifacts(msg.content)}
                                </ReactMarkdown>
                              </div>
                            ) : null;
                          case 'tool_call':
                            return (
                              <ToolIndicator
                                key={msg.id}
                                toolCalls={[msg.call]}
                                results={msg.result ? [msg.result] : []}
                                isRunning={!msg.result}
                              />
                            );
                          case 'ui':
                            return (
                              <div key={msg.id} className="space-y-3">
                                {msg.schema.sections.map((section) => (
                                  <div key={section.id} className="space-y-3">
                                    {section.title && <p className="text-sm font-semibold">{section.title}</p>}
                                    <div
                                      className={cn(
                                        section.layout === 'grid' && 'grid gap-3',
                                        section.layout === 'grid' && section.columns === 2 && 'md:grid-cols-2',
                                        section.layout === 'grid' && section.columns === 3 && 'md:grid-cols-3',
                                        (!section.layout || section.layout === 'column') && 'space-y-3'
                                      )}
                                    >
                                      {section.items.map(renderTrainingItem)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          case 'error':
                            return (
                              <div key={msg.id} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {msg.message}
                              </div>
                            );
                          case 'code_cell':
                            // Code cells are rendered separately below
                            return null;
                          default:
                            return null;
                        }
                      })}

                      {/* Code cells - inline without "Notebook" header */}
                      {manualCells.length > 0 && (
                        <div className="space-y-4">
                          {manualCells.map((cell, index) => (
                            <CodeCell
                              key={cell.id}
                              cell={cell}
                              cellNumber={index + 1}
                              onRun={cell.type === 'code' ? () => handleRunCell(cell.id) : undefined}
                              onDelete={() => handleDeleteCell(cell.id)}
                              onContentChange={cell.type === 'code' ? (content) => handleCellContentChange(cell.id, content) : undefined}
                              isRunning={cell.status === 'running'}
                              datasetFiles={datasetCompletionFiles}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}

                {/* AI thinking indicator */}
                {isAiThinking && (
                  <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="py-4 flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                      <span className="text-sm text-purple-700 dark:text-purple-300">
                        AI is thinking...
                      </span>
                    </CardContent>
                  </Card>
                )}

                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {/* AI Chat Input */}
            <div className="shrink-0 border-t bg-background">
              {hasUserMessages && trainingSuggestions.length > 0 ? (
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {trainingSuggestions.map((suggestion) => (
                      <Button
                        key={suggestion.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 rounded-full px-3 text-xs"
                        disabled={isAiThinking}
                        onClick={() => handleSuggestionClick(suggestion.prompt)}
                      >
                        {suggestion.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="p-4">
                <LlmChatComposer
                  value={chatInput}
                  onValueChange={setChatInput}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask AI for help with training, tuning, or debugging..."
                  disabled={isAiThinking}
                  isStreaming={isAiThinking}
                  onSend={handleChatSubmit}
                  onStop={handleStopTraining}
                  model={assistantModel}
                  onModelChange={setAssistantModel}
                  modelOptions={ASSISTANT_MODEL_OPTIONS}
                  reasoningEffort={reasoningEffort}
                  onReasoningEffortChange={setReasoningEffort}
                  reasoningOptions={reasoningEffortOptions}
                  enableThinking={enableThinking}
                  onToggleThinking={() => setEnableThinking((prev) => !prev)}
                  metaSlot={(
                    <Badge variant="outline" className="text-[11px] gap-1 shrink-0">
                      <Brain className="h-3 w-3" />
                      {documentFiles.length} doc{documentFiles.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                  attachment={{
                    onAttachFile: handleAttachFile,
                    status: attachmentStatus,
                    message: attachmentMessage
                  }}
                  maxWidthClassName="max-w-5xl"
                  textareaRef={textareaRef}
                />
              </div>
            </div>
          </div>
        </ResizablePanel>

        {/* Notebook Panel - Right side (only when cells exist) */}
        {showNotebook && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={30}>
              <NotebookEditor projectId={projectId ?? ''} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
