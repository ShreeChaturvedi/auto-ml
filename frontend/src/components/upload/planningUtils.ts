import type { ChatMessage } from '@/types/llmUi';
import type { UploadedFile } from '@/types/file';

export interface SuggestionPill {
  id: string;
  label: string;
  prompt: string;
}

export function generatePlanName(): string {
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

export function normalizePlanFileName(planName?: string): string {
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

export function toPlanPath(planName: string): string {
  return `plans/${normalizePlanFileName(planName)}`;
}

export function dedupeSuggestions(suggestions: SuggestionPill[]): SuggestionPill[] {
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

export function truncateSuggestionLabel(label: string, maxLength = 56): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

export function buildInitialSuggestions(
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

export function buildFollowUpSuggestions(
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
