import { useEffect } from 'react';

import { useDataStore } from '@/stores/dataStore';
import { useDeploymentStore } from '@/stores/deploymentStore';
import { useExperimentsStore } from '@/stores/experimentsStore';
import { useModelStore } from '@/stores/modelStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { usePlanChatStore } from '@/stores/planChatStore';
import { usePreprocessingStore } from '@/stores/preprocessingStore';
import { useFeatureStore } from '@/stores/featureStore';
import type { ChatMessage } from '@/types/llmUi';

import type { LandingPreviewCapturePreset } from './previewCapturePresets';

type CaptureStatus = 'booting' | 'ready' | 'running' | 'finished' | 'cancelled';

type CaptureRuntime = {
  preset: LandingPreviewCapturePreset;
  status: CaptureStatus;
  step: string;
  start: () => Promise<void>;
};

declare global {
  interface Window {
    __landingPreviewCapture?: CaptureRuntime;
  }
}

const TRAINING_NOTEBOOK_ID = 'training-demo-training-wb-1';
const TRAINING_CELL_ID = 'training-code-1';
const PREPROCESS_NOTEBOOK_ID = 'preprocess-demo-processing-tab-1';
const PREPROCESS_CELL_ID = 'preprocess-code-1';
const FEATURE_NOTEBOOK_ID = 'feature-demo-feature-demo-draft-v1';
const FEATURE_CELL_ID = 'feature-code-1';
const PLAN_CHAT_ID = 'chat-retention-iteration';
const DEMO_FILE_ID = 'landing-demo-file';
const DEMO_QUERY_ARTIFACT_ID = 'artifact-high-risk-customers';
const NOVAFOREST_MODEL_ID = 'model-novaforest';
const XGBOOST_MODEL_ID = 'model-xgboost';
const FINAL_DEPLOYMENT_URL = 'https://api.agentic.dev/v1/deployments/churn-champion';

const INGEST_MESSAGES: ChatMessage[] = [
  {
    id: 'upload-user-1',
    type: 'user' as const,
    content:
      'Analyze this retention dataset and outline the fastest path to a deployable churn-risk model.',
    timestamp: new Date('2026-04-13T15:30:00.000Z').getTime(),
  },
  {
    id: 'upload-assistant-1',
    type: 'assistant_text' as const,
    content:
      'I found a clean churn-label dataset with spend, adoption, and support signals. I drafted a workflow that moves from audit to deployment without leaving this workspace.',
  },
  {
    id: 'upload-plan-1',
    type: 'plan' as const,
    planName: 'Retention Recovery Plan',
    content: [
      '## Modeling objective',
      '- Predict churn risk within the next 30 days.',
      '',
      '## Workflow',
      '- Audit segment churn by tenure and support intensity.',
      '- Clean missing adoption signals and stabilize long-tail spend values.',
      '- Derive support velocity and expansion ratio features.',
      '- Train two classification candidates and promote the best F1 performer.',
      '- Deploy the winning model behind a monitored prediction endpoint.',
    ].join('\n'),
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function setCaptureRuntime(
  preset: LandingPreviewCapturePreset,
  status: CaptureStatus,
  step: string,
  start: () => Promise<void>,
) {
  document.body.dataset.capturePreset = preset;
  document.body.dataset.captureStatus = status;
  document.body.dataset.captureStep = step;
  window.__landingPreviewCapture = { preset, status, step, start };
}

function updateTrainingNotebookOutput(content: string) {
  useNotebookStore.setState((state) => ({
    cells: state.cells.map((cell) => (
      cell.cellId === TRAINING_CELL_ID
        ? {
            ...cell,
            executionStatus: 'success',
            output: [{ type: 'text', content }],
            updatedAt: new Date().toISOString(),
          }
        : cell
    )),
  }));
}

function updateNotebookOutput(cellId: string, content: string) {
  useNotebookStore.setState((state) => ({
    cells: state.cells.map((cell) => (
      cell.cellId === cellId
        ? {
            ...cell,
            executionStatus: 'success',
            output: [{ type: 'text', content }],
            updatedAt: new Date().toISOString(),
          }
        : cell
    )),
  }));
}

async function runIngestScenario(cancelledRef: { value: boolean }) {
  usePlanChatStore.setState((state) => ({
    chats: {
      ...state.chats,
      [PLAN_CHAT_ID]: {
        ...state.chats[PLAN_CHAT_ID],
        messages: [INGEST_MESSAGES[0]],
      },
    },
  }));
  await sleep(700);
  if (cancelledRef.value) return;

  usePlanChatStore.setState((state) => ({
    chats: {
      ...state.chats,
      [PLAN_CHAT_ID]: {
        ...state.chats[PLAN_CHAT_ID],
        messages: [INGEST_MESSAGES[0], INGEST_MESSAGES[1]],
      },
    },
  }));
  await sleep(900);
  if (cancelledRef.value) return;

  usePlanChatStore.setState((state) => ({
    chats: {
      ...state.chats,
      [PLAN_CHAT_ID]: {
        ...state.chats[PLAN_CHAT_ID],
        messages: [...INGEST_MESSAGES],
      },
    },
  }));
}

async function runExploreScenario(cancelledRef: { value: boolean }) {
  useDataStore.setState({
    activeFileTabId: DEMO_FILE_ID,
    fileTabType: 'file',
  });
  await sleep(800);
  if (cancelledRef.value) return;

  useDataStore.setState({
    activeFileTabId: DEMO_QUERY_ARTIFACT_ID,
    fileTabType: 'artifact',
  });
}

async function runPreprocessScenario(cancelledRef: { value: boolean }) {
  useNotebookStore.getState().setActiveNotebook(PREPROCESS_NOTEBOOK_ID);
  usePreprocessingStore.setState((state) => ({
    timeline: state.timeline.map((event) => ({
      ...event,
      status: 'running',
      updatedAt: Date.now(),
    })),
  }));
  updateNotebookOutput(
    PREPROCESS_CELL_ID,
    'Generating replay-safe preprocessing code and validating row-count stability...',
  );
  await sleep(1100);
  if (cancelledRef.value) return;

  usePreprocessingStore.setState((state) => ({
    timeline: state.timeline.map((event) => ({
      ...event,
      status: 'applied',
      updatedAt: Date.now(),
    })),
  }));
  updateNotebookOutput(
    PREPROCESS_CELL_ID,
    'Filled 128 sparse adoption scores and clipped 14 extreme spend outliers without changing row counts.',
  );
}

async function runEngineerScenario(cancelledRef: { value: boolean }) {
  useNotebookStore.getState().setActiveNotebook(FEATURE_NOTEBOOK_ID);
  useFeatureStore.setState({
    currentStage: 'execute_feature',
    featureSteps: {
      'feature-support-ticket-velocity': {
        stepId: 'feature-support-ticket-velocity',
        name: 'Derive support ticket velocity',
        method: 'ratio',
        status: 'executing',
      },
      'feature-expansion-ratio': {
        stepId: 'feature-expansion-ratio',
        name: 'Blend spend and adoption into expansion ratio',
        method: 'product',
        status: 'proposed',
      },
    },
  });
  updateNotebookOutput(
    FEATURE_CELL_ID,
    'Materializing notebook steps for support velocity and expansion ratio...',
  );
  await sleep(1000);
  if (cancelledRef.value) return;

  useFeatureStore.setState({
    currentStage: 'register_feature',
    featureSteps: {
      'feature-support-ticket-velocity': {
        stepId: 'feature-support-ticket-velocity',
        name: 'Derive support ticket velocity',
        method: 'ratio',
        status: 'registered',
      },
      'feature-expansion-ratio': {
        stepId: 'feature-expansion-ratio',
        name: 'Blend spend and adoption into expansion ratio',
        method: 'product',
        status: 'registered',
      },
    },
  });
  updateNotebookOutput(
    FEATURE_CELL_ID,
    'Registered 2 candidate features. Validation improved recall by 3.1 points while keeping the feature set explainable.',
  );
}

async function runTrainingScenario(cancelledRef: { value: boolean }) {
  useNotebookStore.getState().setActiveNotebook(TRAINING_NOTEBOOK_ID);
  useModelStore.setState({
    isTraining: true,
    currentStage: 'training',
    trainingRunStates: {
      'experiment-novaforest': {
        experimentId: 'experiment-novaforest',
        experimentName: 'NovaForest Classifier',
        modelType: 'Random Forest',
        status: 'training',
        hyperparameters: {
          n_estimators: 400,
          max_depth: 12,
          min_samples_leaf: 4,
        },
      },
      'experiment-xgboost': {
        experimentId: 'experiment-xgboost',
        experimentName: 'XGBoost Retention',
        modelType: 'XGBoost',
        status: 'training',
        hyperparameters: {
          max_depth: 6,
          learning_rate: 0.08,
          n_estimators: 320,
        },
      },
    },
  });
  updateTrainingNotebookOutput('Launching two model candidates and evaluating validation folds...');
  await sleep(900);
  if (cancelledRef.value) return;

  useModelStore.getState().updateTrainingRun('experiment-xgboost', {
    status: 'evaluated',
    metrics: {
      accuracy: 0.9073,
      precision: 0.8541,
      recall: 0.8119,
      f1: 0.8324,
    },
  });
  updateTrainingNotebookOutput('XGBoost finished. NovaForest is still training and currently leading on F1.');
  await sleep(1000);
  if (cancelledRef.value) return;

  useModelStore.getState().updateTrainingRun('experiment-novaforest', {
    status: 'registered',
    metrics: {
      accuracy: 0.9142,
      precision: 0.8611,
      recall: 0.8245,
      f1: 0.8424,
    },
  });
  useModelStore.setState({
    isTraining: false,
    currentStage: 'register_model',
  });
  updateTrainingNotebookOutput(
    'Champion: NovaForest Classifier | F1 0.8424 | Precision 0.8611 | Recall 0.8245',
  );
}

async function runDeploymentScenario(cancelledRef: { value: boolean }) {
  const selectedDeploymentId = useDeploymentStore.getState().selectedDeploymentId;
  if (!selectedDeploymentId) {
    return;
  }

  useDeploymentStore.setState((state) => ({
    deployments: state.deployments.map((deployment) => (
      deployment.deploymentId === selectedDeploymentId
        ? {
            ...deployment,
            status: 'creating',
            endpointUrl: undefined,
            updatedAt: new Date().toISOString(),
          }
        : deployment
    )),
  }));

  await sleep(800);
  if (cancelledRef.value) return;

  useDeploymentStore.getState().updateDeploymentStatus(selectedDeploymentId, 'starting');

  await sleep(1100);
  if (cancelledRef.value) return;

  useDeploymentStore.setState((state) => ({
    deployments: state.deployments.map((deployment) => (
      deployment.deploymentId === selectedDeploymentId
        ? {
            ...deployment,
            status: 'healthy',
            endpointUrl: FINAL_DEPLOYMENT_URL,
            updatedAt: new Date().toISOString(),
          }
        : deployment
    )),
  }));
}

async function runExperimentsScenario(cancelledRef: { value: boolean }) {
  useExperimentsStore.setState({
    comparisonModelIds: [NOVAFOREST_MODEL_ID],
    selectedModelId: null,
  });
  await sleep(700);
  if (cancelledRef.value) return;

  useExperimentsStore.setState({
    comparisonModelIds: [NOVAFOREST_MODEL_ID, XGBOOST_MODEL_ID],
    selectedModelId: NOVAFOREST_MODEL_ID,
  });
}

async function runScenario(
  preset: LandingPreviewCapturePreset,
  cancelledRef: { value: boolean },
) {
  if (preset === 'train' || preset === 'hero-train') {
    await runTrainingScenario(cancelledRef);
    return;
  }

  if (preset === 'deploy' || preset === 'hero-deploy') {
    await runDeploymentScenario(cancelledRef);
    return;
  }

  if (preset === 'ingest' || preset === 'hero-upload') {
    await runIngestScenario(cancelledRef);
    return;
  }

  if (preset === 'explore' || preset === 'hero-explore') {
    await runExploreScenario(cancelledRef);
    return;
  }

  if (preset === 'preprocess' || preset === 'hero-preprocess') {
    await runPreprocessScenario(cancelledRef);
    return;
  }

  if (preset === 'engineer') {
    await runEngineerScenario(cancelledRef);
    return;
  }

  if (preset === 'experiments') {
    await runExperimentsScenario(cancelledRef);
    return;
  }

  await sleep(200);
}

export function useLandingPreviewCaptureScenario(
  preset: LandingPreviewCapturePreset,
) {
  useEffect(() => {
    const cancelledRef = { value: false };
    let started = false;

    const start = async () => {
      if (started || cancelledRef.value) {
        return;
      }
      started = true;
      setCaptureRuntime(preset, 'running', 'scenario-running', start);
      await runScenario(preset, cancelledRef);
      if (cancelledRef.value) {
        return;
      }
      setCaptureRuntime(preset, 'finished', 'scenario-finished', start);
    };

    setCaptureRuntime(preset, 'ready', 'scenario-ready', start);

    return () => {
      cancelledRef.value = true;
      setCaptureRuntime(preset, 'cancelled', 'scenario-cancelled', start);
    };
  }, [preset]);
}
