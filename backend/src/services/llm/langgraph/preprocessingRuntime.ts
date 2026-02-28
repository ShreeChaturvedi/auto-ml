import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

export type PreprocessingStage =
  | 'context_ready'
  | 'plan_step'
  | 'generate_code'
  | 'execute_code'
  | 'validate_outcome'
  | 'await_approval'
  | 'commit_or_revise'
  | 'completed';

export type ApprovalDecision = 'pending' | 'approved' | 'rejected';

export interface PreprocessingGraphStep {
  stepId: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'applied' | 'failed' | 'diverged';
  cellIds: string[];
  codeHash?: string;
  version: number;
}

export interface PreprocessingGraphCheckpoint {
  checkpointId: string;
  stepIds: string[];
  replayUntilEventSequence: number;
  createdAt: string;
}

const PreprocessingGraphAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  projectId: Annotation<string>(),
  activeDatasetId: Annotation<string | undefined>(),
  currentStage: Annotation<PreprocessingStage>(),
  nextStage: Annotation<PreprocessingStage>(),
  currentStepId: Annotation<string | undefined>(),
  contextReady: Annotation<boolean>(),
  planReady: Annotation<boolean>(),
  codeReady: Annotation<boolean>(),
  executeSucceeded: Annotation<boolean>(),
  validationPassed: Annotation<boolean>(),
  requiresApproval: Annotation<boolean>(),
  approvalDecision: Annotation<ApprovalDecision>(),
  autoRepairAllowed: Annotation<boolean>(),
  autoRepairAttempts: Annotation<number>(),
  maxAutoRepairAttempts: Annotation<number>(),
  isCompleted: Annotation<boolean>(),
  steps: Annotation<Record<string, PreprocessingGraphStep>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({})
  }),
  stepOrder: Annotation<string[]>({
    reducer: (left, right) => [...new Set([...left, ...right])],
    default: () => []
  }),
  checkpoints: Annotation<Record<string, PreprocessingGraphCheckpoint>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({})
  }),
  nodeVisits: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => []
  }),
  lastError: Annotation<string | undefined>(),
  updatedAt: Annotation<string>()
});

export type PreprocessingGraphState = typeof PreprocessingGraphAnnotation.State;

export interface PreprocessingRuntimeBootstrapInput {
  runId: string;
  projectId: string;
  activeDatasetId?: string;
  initialStage?: Exclude<PreprocessingStage, 'completed'>;
}

export interface PreprocessingLangGraphRuntime {
  bootstrapRun(input: PreprocessingRuntimeBootstrapInput): Promise<PreprocessingGraphState>;
  advanceRun(state: PreprocessingGraphState, patch?: Partial<PreprocessingGraphState>): Promise<PreprocessingGraphState>;
}

interface PreprocessingTransition {
  nextStage: PreprocessingStage;
  autoRepairAttemptDelta: 0 | 1;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function resolvePreprocessingTransition(state: PreprocessingGraphState): PreprocessingTransition {
  if (state.isCompleted || state.currentStage === 'completed') {
    return { nextStage: 'completed', autoRepairAttemptDelta: 0 };
  }

  switch (state.currentStage) {
    case 'context_ready': {
      return {
        nextStage: state.contextReady ? 'plan_step' : 'context_ready',
        autoRepairAttemptDelta: 0
      };
    }
    case 'plan_step': {
      return {
        nextStage: state.planReady ? 'generate_code' : 'plan_step',
        autoRepairAttemptDelta: 0
      };
    }
    case 'generate_code': {
      return {
        nextStage: state.codeReady ? 'execute_code' : 'generate_code',
        autoRepairAttemptDelta: 0
      };
    }
    case 'execute_code': {
      if (state.executeSucceeded) {
        return { nextStage: 'validate_outcome', autoRepairAttemptDelta: 0 };
      }
      if (state.autoRepairAllowed && state.autoRepairAttempts < state.maxAutoRepairAttempts) {
        return { nextStage: 'generate_code', autoRepairAttemptDelta: 1 };
      }
      return { nextStage: 'commit_or_revise', autoRepairAttemptDelta: 0 };
    }
    case 'validate_outcome': {
      if (!state.validationPassed) {
        if (state.autoRepairAllowed && state.autoRepairAttempts < state.maxAutoRepairAttempts) {
          return { nextStage: 'generate_code', autoRepairAttemptDelta: 1 };
        }
        return { nextStage: 'commit_or_revise', autoRepairAttemptDelta: 0 };
      }
      if (state.requiresApproval && state.approvalDecision !== 'approved') {
        return { nextStage: 'await_approval', autoRepairAttemptDelta: 0 };
      }
      return { nextStage: 'commit_or_revise', autoRepairAttemptDelta: 0 };
    }
    case 'await_approval': {
      if (state.approvalDecision === 'approved' || state.approvalDecision === 'rejected') {
        return { nextStage: 'commit_or_revise', autoRepairAttemptDelta: 0 };
      }
      return { nextStage: 'await_approval', autoRepairAttemptDelta: 0 };
    }
    case 'commit_or_revise': {
      if (state.approvalDecision === 'rejected') {
        return { nextStage: 'completed', autoRepairAttemptDelta: 0 };
      }
      if (
        state.executeSucceeded
        && state.validationPassed
        && (!state.requiresApproval || state.approvalDecision === 'approved')
      ) {
        return { nextStage: 'completed', autoRepairAttemptDelta: 0 };
      }
      if (state.autoRepairAllowed && state.autoRepairAttempts < state.maxAutoRepairAttempts) {
        return { nextStage: 'generate_code', autoRepairAttemptDelta: 1 };
      }
      return { nextStage: 'completed', autoRepairAttemptDelta: 0 };
    }
    default:
      return { nextStage: 'completed', autoRepairAttemptDelta: 0 };
  }
}

function createInitialState(input: PreprocessingRuntimeBootstrapInput): PreprocessingGraphState {
  const startingStage = input.initialStage ?? 'context_ready';
  return {
    runId: input.runId,
    projectId: input.projectId,
    activeDatasetId: input.activeDatasetId,
    currentStage: startingStage,
    nextStage: startingStage,
    currentStepId: undefined,
    contextReady: Boolean(input.activeDatasetId),
    planReady: false,
    codeReady: false,
    executeSucceeded: false,
    validationPassed: false,
    requiresApproval: false,
    approvalDecision: 'pending',
    autoRepairAllowed: true,
    autoRepairAttempts: 0,
    maxAutoRepairAttempts: 2,
    isCompleted: false,
    steps: {},
    stepOrder: [],
    checkpoints: {},
    nodeVisits: [],
    lastError: undefined,
    updatedAt: nowIso()
  };
}

async function supervisorNode(
  state: PreprocessingGraphState
): Promise<Partial<PreprocessingGraphState>> {
  const transition = resolvePreprocessingTransition(state);
  return {
    nextStage: transition.nextStage,
    autoRepairAttempts: state.autoRepairAttempts + transition.autoRepairAttemptDelta,
    nodeVisits: ['Supervisor'],
    updatedAt: nowIso()
  };
}

function createStageNode(
  stage: PreprocessingStage,
  label: string
): (state: PreprocessingGraphState) => Promise<Partial<PreprocessingGraphState>> {
  return async (state: PreprocessingGraphState): Promise<Partial<PreprocessingGraphState>> => {
    const completed = stage === 'completed';
    return {
      currentStage: stage,
      nextStage: stage,
      currentStepId: state.currentStepId,
      isCompleted: completed,
      nodeVisits: [label],
      updatedAt: nowIso()
    };
  };
}

function stageRouter(state: PreprocessingGraphState): PreprocessingStage {
  return state.nextStage;
}

function mergeState(
  state: PreprocessingGraphState,
  patch: Partial<PreprocessingGraphState> | undefined
): PreprocessingGraphState {
  if (!patch) {
    return state;
  }

  return {
    ...state,
    ...patch,
    steps: {
      ...state.steps,
      ...(patch.steps ?? {})
    },
    checkpoints: {
      ...state.checkpoints,
      ...(patch.checkpoints ?? {})
    },
    updatedAt: nowIso()
  };
}

export function buildPreprocessingLangGraph() {
  const graph = new StateGraph(PreprocessingGraphAnnotation)
    .addNode('supervisor', supervisorNode)
    .addNode('context_ready', createStageNode('context_ready', 'ContextReady'))
    .addNode('plan_step', createStageNode('plan_step', 'PlanStep'))
    .addNode('generate_code', createStageNode('generate_code', 'GenerateCode'))
    .addNode('execute_code', createStageNode('execute_code', 'ExecuteCode'))
    .addNode('validate_outcome', createStageNode('validate_outcome', 'ValidateOutcome'))
    .addNode('await_approval', createStageNode('await_approval', 'AwaitApproval'))
    .addNode('commit_or_revise', createStageNode('commit_or_revise', 'CommitOrRevise'))
    .addNode('completed', createStageNode('completed', 'Completed'))
    .addEdge(START, 'supervisor')
    .addConditionalEdges('supervisor', stageRouter);

  return graph
    .addEdge('context_ready', END)
    .addEdge('plan_step', END)
    .addEdge('generate_code', END)
    .addEdge('execute_code', END)
    .addEdge('validate_outcome', END)
    .addEdge('await_approval', END)
    .addEdge('commit_or_revise', END)
    .addEdge('completed', END)
    .compile({
      name: 'preprocessing-langgraph-scaffold',
      description: 'LangGraph preprocessing lifecycle state-machine scaffold with guarded stage routing.'
    });
}

export function createPreprocessingLangGraphRuntime(): PreprocessingLangGraphRuntime {
  const graph = buildPreprocessingLangGraph();

  return {
    async bootstrapRun(input: PreprocessingRuntimeBootstrapInput): Promise<PreprocessingGraphState> {
      const initialState = createInitialState(input);
      const finalState = await graph.invoke(initialState);
      return finalState as PreprocessingGraphState;
    },
    async advanceRun(
      state: PreprocessingGraphState,
      patch?: Partial<PreprocessingGraphState>
    ): Promise<PreprocessingGraphState> {
      const nextInput = mergeState(state, patch);
      const finalState = await graph.invoke(nextInput);
      return finalState as PreprocessingGraphState;
    }
  };
}
