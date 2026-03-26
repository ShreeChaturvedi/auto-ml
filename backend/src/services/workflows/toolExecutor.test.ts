import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowGraphState } from './graphState.js';
import { MAX_SINGLE_TOOL_CALLS } from './graphState.js';
import type { PhaseConfig } from './phaseConfig.js';
import { executeToolsNode } from './toolExecutor.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

const executePhaseSpecificToolMock = vi.fn();

vi.mock('../mcp/mcpAdapter.js', () => ({
  executeMcpTool: vi.fn()
}));

function createPhaseConfig(): PhaseConfig {
  return {
    phase: 'preprocessing',
    lifecycle: [],
    classifyTurn: vi.fn(async () => 'action' as const),
    getStageConfig: vi.fn(() => ({
      name: 'commit',
      mode: 'action' as const,
      allowedTools: [],
      toolChoice: 'auto' as const,
      requiresApproval: false,
      allowAssistantMessage: false,
      allowAskUser: false,
      allowRenderUi: false,
      allowPlanExit: false,
      requireToolCall: true
    })),
    buildSystemPrompt: vi.fn(() => ''),
    buildUserContext: vi.fn(() => []),
    resolveNextStage: vi.fn(() => null),
    isPhaseSpecificTool: vi.fn((toolName: string) => toolName === 'commit_transformation_step'),
    executePhaseSpecificTool: executePhaseSpecificToolMock
  };
}

function createFeaturePhaseConfig(): PhaseConfig {
  return {
    phase: 'feature_engineering',
    lifecycle: [],
    classifyTurn: vi.fn(async () => 'action' as const),
    getStageConfig: vi.fn(() => ({
      name: 'continue_feature_pipeline',
      mode: 'text' as const,
      allowedTools: [],
      toolChoice: 'auto' as const,
      requiresApproval: false,
      allowAssistantMessage: true,
      allowAskUser: true,
      allowRenderUi: true,
      allowPlanExit: false,
      requireToolCall: false
    })),
    buildSystemPrompt: vi.fn(() => ''),
    buildUserContext: vi.fn(() => []),
    resolveNextStage: vi.fn(() => null),
    isPhaseSpecificTool: vi.fn((toolName: string) => toolName === 'propose_feature'),
    executePhaseSpecificTool: executePhaseSpecificToolMock
  };
}

function createState(): WorkflowGraphState {
  const turn: WorkflowTurnRequest = {
    projectId: 'project-1',
    phase: 'preprocessing',
    datasetId: 'dataset-1',
    prompt: 'Approve it.'
  };

  const run: WorkflowRunState = {
    runId: 'wf-1',
    threadId: 'thread-1',
    projectId: 'project-1',
    phase: 'preprocessing',
    status: 'paused',
    currentNode: 'commit',
    revision: 1,
    activeDatasetId: 'dataset-1',
    pendingInputKind: 'approval',
    pauseReason: 'awaiting_approval',
    retryBudget: 3,
    repairAttemptCount: 0,
    createdAt: '2026-03-13T00:00:00.000Z',
    updatedAt: '2026-03-13T00:00:00.000Z'
  };

  return {
    turn,
    run,
    request: null,
    latestMessage: '',
    pendingToolCalls: [{
      id: 'wf-call-1',
      tool: 'commit_transformation_step',
      args: {
        runId: 'prep-1',
        stepId: 'step-1',
        approved: true
      },
      rationale: 'Commit the approved step.'
    }],
    toolCallHistory: [],
    toolResultHistory: [],
    askUserPayload: null,
    planExitPayload: null,
    uiPayload: null,
    controllerSummary: {
      runId: 'prep-1',
      currentNode: 'commit',
      pendingApproval: true
    },
    iteration: 0,
    nextStep: 'execute_tools',
    pendingInputKind: null,
    pauseReason: null,
    errorMessage: null,
    errorCode: null
  };
}

describe('executeToolsNode', () => {
  beforeEach(() => {
    executePhaseSpecificToolMock.mockReset();
    executePhaseSpecificToolMock.mockResolvedValue({
      output: {
        runId: 'prep-1',
        stepId: 'step-1',
        status: 'applied'
      }
    });
  });

  it('marks approval commits as explicit user decisions', async () => {
    const phaseConfig = createPhaseConfig();
    const sinkMock = {
      emit: vi.fn()
    };

    await executeToolsNode(createState(), {
      configurable: {
        sink: sinkMock,
        phaseConfig
      }
    } as never);

    expect(executePhaseSpecificToolMock).toHaveBeenCalledWith(
      'commit_transformation_step',
      expect.objectContaining({
        approvalSource: 'user',
        approved: true,
        datasetId: 'dataset-1'
      }),
      expect.objectContaining({
        projectId: 'project-1',
        toolCallId: 'wf-call-1'
      })
    );
  });

  it('binds feature lifecycle tools to the current workflow run when runId is omitted', async () => {
    const phaseConfig = createFeaturePhaseConfig();
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.runId = 'wf-feature-1';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-feature-1',
      tool: 'propose_feature',
      args: {
        featureName: 'tenure_bucket',
        method: 'binning',
        rationale: 'Capture churn behavior by tenure bucket.'
      },
      rationale: 'Create a candidate feature for churn prediction.'
    }];
    state.controllerSummary = {
      currentNode: 'continue_feature_pipeline'
    };

    await executeToolsNode(state, {
      configurable: {
        phaseConfig
      }
    } as never);

    expect(executePhaseSpecificToolMock).toHaveBeenCalledWith(
      'propose_feature',
      expect.objectContaining({
        runId: 'wf-feature-1',
        datasetId: 'dataset-1'
      }),
      expect.objectContaining({
        projectId: 'project-1',
        toolCallId: 'wf-call-feature-1'
      })
    );
  });

  it('fails with TOOL_CALL_LIMIT_EXCEEDED when a single tool exceeds MAX_SINGLE_TOOL_CALLS', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => true);
    executePhaseSpecificToolMock.mockResolvedValue({ output: { experimentId: 'exp-1' } });

    const state = createState();
    state.turn.phase = 'training' as WorkflowTurnRequest['phase'];
    state.run.phase = 'training' as WorkflowRunState['phase'];
    state.run.currentNode = 'configure_experiment';

    // Populate history with MAX_SINGLE_TOOL_CALLS calls already made
    state.toolCallHistory = Array.from({ length: MAX_SINGLE_TOOL_CALLS }, (_, i) => ({
      id: `prev-call-${i}`,
      tool: 'configure_experiment',
      args: { experimentName: `exp-${i}` }
    }));

    // One more pending call tips it over the limit
    state.pendingToolCalls = [{
      id: 'wf-call-overflow',
      tool: 'configure_experiment',
      args: { experimentName: 'exp-overflow' }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('fail');
    expect(result.errorCode).toBe('TOOL_CALL_LIMIT_EXCEEDED');
    expect(result.errorMessage).toContain('configure_experiment');
    expect(result.errorMessage).toContain('without advancing');
  });

  it('does not fail when tool calls are within the per-tool limit', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => true);
    executePhaseSpecificToolMock.mockResolvedValue({ output: { experimentId: 'exp-1' } });

    const state = createState();
    state.turn.phase = 'training' as WorkflowTurnRequest['phase'];
    state.run.phase = 'training' as WorkflowRunState['phase'];
    state.run.currentNode = 'configure_experiment';

    // History has fewer than the limit
    state.toolCallHistory = Array.from({ length: MAX_SINGLE_TOOL_CALLS - 1 }, (_, i) => ({
      id: `prev-call-${i}`,
      tool: 'configure_experiment',
      args: { experimentName: `exp-${i}` }
    }));

    state.pendingToolCalls = [{
      id: 'wf-call-ok',
      tool: 'configure_experiment',
      args: { experimentName: 'exp-ok' }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.errorCode).toBeNull();
  });
});
