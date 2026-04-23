import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeToolCall } from '../llm/tools.js';
import { executeMcpTool } from '../mcp/mcpAdapter.js';

import type { WorkflowGraphState } from './graphState.js';
import { MAX_IDENTICAL_TOOL_CALLS, MAX_SINGLE_TOOL_CALLS } from './graphState.js';
import type { PhaseConfig } from './phaseConfig.js';
import { executeToolsNode } from './toolExecutor.js';
import type { WorkflowRunState, WorkflowTurnRequest } from './types.js';

const executePhaseSpecificToolMock = vi.fn();
const { mockGetDatasetById } = vi.hoisted(() => ({
  mockGetDatasetById: vi.fn()
}));

vi.mock('../mcp/mcpAdapter.js', () => ({
  executeMcpTool: vi.fn()
}));

vi.mock('../llm/tools.js', () => ({
  executeToolCall: vi.fn()
}));

vi.mock('../../repositories/datasetRepository.js', () => ({
  createDatasetRepository: () => ({
    getById: mockGetDatasetById
  })
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
  const featureTools = new Set([
    'propose_feature',
    'materialize_feature_code',
    'execute_feature',
    'validate_feature',
    'register_feature',
    'checkpoint_feature_pipeline'
  ]);
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
    isPhaseSpecificTool: vi.fn((toolName: string) => featureTools.has(toolName)),
    executePhaseSpecificTool: executePhaseSpecificToolMock
  };
}

function createTrainingPhaseConfig(): PhaseConfig {
  return {
    phase: 'training',
    lifecycle: [],
    classifyTurn: vi.fn(async () => 'action' as const),
    getStageConfig: vi.fn(() => ({
      name: 'write_code',
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
    isPhaseSpecificTool: vi.fn(() => false),
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
    turnStartToolCallCount: 0,
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
    vi.mocked(executeMcpTool).mockReset();
    vi.mocked(executeToolCall).mockReset();
    mockGetDatasetById.mockReset();
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

  it('overrides hallucinated preprocessing runIds with controllerSummary.runId', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn((toolName: string) => toolName === 'profile_active_dataset');
    const state = createState();
    state.run.status = 'running';
    state.run.currentNode = 'plan_step';
    state.pendingInputKind = null;
    state.pauseReason = null;
    state.pendingToolCalls = [{
      id: 'wf-call-prep-profile',
      tool: 'profile_active_dataset',
      args: {
        runId: 'run-short-preprocess'
      },
      rationale: 'Profile the active preprocessing dataset.'
    }];
    state.controllerSummary = {
      runId: 'prep-real-1',
      currentNode: 'plan_step',
      pendingApproval: false
    };
    executePhaseSpecificToolMock.mockResolvedValue({
      output: {
        runId: 'prep-real-1',
        datasetId: 'dataset-1'
      }
    });

    await executeToolsNode(state, {
      configurable: {
        phaseConfig
      }
    } as never);

    expect(executePhaseSpecificToolMock).toHaveBeenCalledWith(
      'profile_active_dataset',
      expect.objectContaining({
        runId: 'prep-real-1',
        datasetId: 'dataset-1'
      }),
      expect.objectContaining({
        projectId: 'project-1',
        toolCallId: 'wf-call-prep-profile'
      })
    );
  });

  it('forwards the tool call rationale into the phase-specific tool context', async () => {
    const phaseConfig = createFeaturePhaseConfig();
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.runId = 'wf-feature-2';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-feature-rationale',
      tool: 'propose_feature',
      args: {
        featureName: 'division_missing_flag',
        method: 'missing_indicator',
        sourceColumns: ['CF EE Division']
      },
      rationale: 'Flag rows where CF EE Division is blank or null.'
    }];

    await executeToolsNode(state, {
      configurable: {
        phaseConfig
      }
    } as never);

    expect(executePhaseSpecificToolMock).toHaveBeenCalledWith(
      'propose_feature',
      expect.objectContaining({
        runId: 'wf-feature-2',
        datasetId: 'dataset-1'
      }),
      expect.objectContaining({
        rationale: 'Flag rows where CF EE Division is blank or null.'
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
    // Each call uses different args so they don't trigger the identical-call check
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

    // Raw-count repetition is now a soft warning — workflow continues
    expect(result.nextStep).toBe('prepare');
    expect(result.errorCode).toBeNull();
  });

  it('does not fail when tool calls are within the per-tool limit', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => true);
    executePhaseSpecificToolMock.mockResolvedValue({ output: { experimentId: 'exp-1' } });

    const state = createState();
    state.turn.phase = 'training' as WorkflowTurnRequest['phase'];
    state.run.phase = 'training' as WorkflowRunState['phase'];
    state.run.currentNode = 'configure_experiment';

    // History has fewer than the limit; each call uses different args
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

  it('fails when the same tool is called with identical arguments more than MAX_IDENTICAL_TOOL_CALLS times', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => true);
    executePhaseSpecificToolMock.mockResolvedValue({ output: { ok: true } });

    const state = createState();
    state.turn.phase = 'preprocessing';
    state.run.phase = 'preprocessing';
    state.run.currentNode = 'plan_step';

    // All calls have the exact same arguments — the model is stuck
    const identicalArgs = { runId: 'r1', stepId: 's1' };
    state.toolCallHistory = Array.from({ length: MAX_IDENTICAL_TOOL_CALLS }, (_, i) => ({
      id: `stuck-call-${i}`,
      tool: 'propose_transformation_step',
      args: identicalArgs
    }));

    state.pendingToolCalls = [{
      id: 'stuck-call-final',
      tool: 'propose_transformation_step',
      args: identicalArgs
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('fail');
    expect(result.errorCode).toBe('TOOL_CALL_LIMIT_EXCEEDED');
    expect(result.errorMessage).toContain('identical arguments');
    expect(result.errorMessage).toContain('propose_transformation_step');
  });

  it('does not fail for repeated tool with different arguments within the raw-count limit', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => true);
    executePhaseSpecificToolMock.mockResolvedValue({ output: { ok: true } });

    const state = createState();
    state.turn.phase = 'feature_engineering' as WorkflowTurnRequest['phase'];
    state.run.phase = 'feature_engineering' as WorkflowRunState['phase'];
    state.run.currentNode = 'propose_feature';

    // 8 calls with different args — below the default MAX_SINGLE_TOOL_CALLS (10)
    state.toolCallHistory = Array.from({ length: 8 }, (_, i) => ({
      id: `feature-call-${i}`,
      tool: 'propose_feature',
      args: { featureName: `feature_${i}` }
    }));

    state.pendingToolCalls = [{
      id: 'feature-call-9',
      tool: 'propose_feature',
      args: { featureName: 'feature_9' }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.errorCode).toBeNull();
  });

  it('does not treat repeated run_cell on the same cell as an identical-args stuck loop', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';

    const identicalRunArgs = { cellId: 'cell-1' };
    state.toolCallHistory = Array.from({ length: MAX_IDENTICAL_TOOL_CALLS }, (_, i) => ({
      id: `run-call-${i}`,
      tool: 'run_cell',
      args: identicalRunArgs
    }));
    state.pendingToolCalls = [{
      id: 'run-call-final',
      tool: 'run_cell',
      args: identicalRunArgs
    }];

    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        status: 'error',
        stderr: 'NameError'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.errorCode).toBeNull();
  });

  it('rejects list_cells during training execution stages', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-list-cells',
      tool: 'list_cells',
      args: {}
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(vi.mocked(executeMcpTool)).not.toHaveBeenCalled();
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'list_cells',
        error: expect.stringContaining('not allowed during training execution')
      })
    ]);
  });

  it('rejects markdown write_cell calls during training execution stages', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-markdown',
      tool: 'write_cell',
      args: {
        cellType: 'markdown',
        content: '## Training Plan'
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(vi.mocked(executeMcpTool)).not.toHaveBeenCalled();
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        error: expect.stringContaining('Markdown cells are not allowed during training execution')
      })
    ]);
  });

  it('fails training turns immediately when run_cell times out', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-timeout',
      tool: 'run_cell',
      args: {
        cellId: 'cell-timeout'
      }
    }];

    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        status: 'timeout',
        stdout: '',
        stderr: '',
        executionMs: 30000,
        error: 'Execution timed out after 30000ms'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('fail');
    expect(result.errorCode).toBe('TRAINING_RUN_CELL_TIMEOUT');
    expect(result.errorMessage).toContain('Execution timed out after 30000ms');
    expect(result.errorMessage).toContain('kernel was interrupted');
  });

  it('fails training turns immediately when run_cell hits an MCP request timeout', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-mcp-timeout',
      tool: 'run_cell',
      args: {
        cellId: 'cell-timeout'
      }
    }];

    vi.mocked(executeMcpTool).mockResolvedValue({
      error: 'MCP error -32001: Request timed out'
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('fail');
    expect(result.errorCode).toBe('TRAINING_RUN_CELL_TIMEOUT');
    expect(result.errorMessage).toContain('Request timed out');
    expect(result.errorMessage).toContain('kernel was interrupted');
  });

  it('fails training turns immediately when install_package cannot install the required library', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'generate_code';
    state.pendingToolCalls = [{
      id: 'wf-call-install-package',
      tool: 'install_package',
      args: {
        packageName: 'catboost'
      }
    }];

    vi.mocked(executeToolCall).mockResolvedValue({
      id: 'wf-call-install-package',
      tool: 'install_package',
      output: {
        success: false,
        message: 'No compatible binary wheels found for catboost on this runtime.'
      },
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('fail');
    expect(result.errorCode).toBe('TRAINING_PACKAGE_INSTALL_FAILED');
    expect(result.errorMessage).toContain('catboost');
    expect(result.errorMessage).toContain('could not be installed');
    expect(executeToolCall).toHaveBeenCalledWith('project-1', expect.objectContaining({
      tool: 'install_package',
      args: expect.objectContaining({ packageName: 'catboost' })
    }));
    expect(executeMcpTool).not.toHaveBeenCalled();
  });

  it('respects per-phase maxSingleToolCalls override', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => true);
    phaseConfig.maxSingleToolCalls = 15;
    executePhaseSpecificToolMock.mockResolvedValue({ output: { ok: true } });

    const state = createState();
    state.turn.phase = 'preprocessing';
    state.run.phase = 'preprocessing';
    state.run.currentNode = 'plan_step';

    // 12 calls with different args — would exceed default (10) but under override (15)
    state.toolCallHistory = Array.from({ length: 12 }, (_, i) => ({
      id: `pp-call-${i}`,
      tool: 'profile_active_dataset',
      args: { variant: `v${i}` }
    }));

    state.pendingToolCalls = [{
      id: 'pp-call-13',
      tool: 'profile_active_dataset',
      args: { variant: 'v13' }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.errorCode).toBeNull();
  });

  it('auto-runs a newly written FE code cell before returning to the model', async () => {
    const phaseConfig = createFeaturePhaseConfig();
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-write-cell',
      tool: 'write_cell',
      args: {
        title: 'Create signup_month feature',
        cellType: 'code',
        content: 'print("hello")'
      }
    }];
    state.toolResultHistory = [{
      id: 'wf-call-materialize',
      tool: 'materialize_feature_code',
      output: {
        featureId: 'feat-signup-month'
      }
    }];
    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        cellId: 'cell-1'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('execute_tools');
    expect(result.pendingToolCalls).toEqual([
      expect.objectContaining({
        tool: 'run_cell',
        args: { cellId: 'cell-1' }
      })
    ]);
  });

  it('auto-writes a FE notebook code cell after materializing feature code', async () => {
    const phaseConfig = createFeaturePhaseConfig();
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-materialize',
      tool: 'materialize_feature_code',
      args: {
        featureId: 'feat-signup-month',
        code: 'df["signup_month"] = pd.to_datetime(df["signup_date"]).dt.month'
      }
    }];
    executePhaseSpecificToolMock.mockResolvedValue({
      output: {
        featureId: 'feat-signup-month',
        status: 'ok'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('execute_tools');
    expect(result.pendingToolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          cellType: 'code',
          content: 'df["signup_month"] = pd.to_datetime(df["signup_date"]).dt.month'
        })
      })
    ]);
  });

  it('does not auto-insert another FE dataset load cell after one already succeeded in the current turn', async () => {
    const phaseConfig = createFeaturePhaseConfig();
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-materialize-next',
      tool: 'materialize_feature_code',
      args: {
        featureId: 'feat-date-month',
        code: 'df["DATE_month"] = pd.to_datetime(df["DATE"]).dt.month'
      }
    }];
    state.toolCallHistory = [
      {
        id: 'wf-call-load-cell',
        tool: 'write_cell',
        args: {
          cellType: 'code',
          metadata: {
            phase: 'feature-engineering',
            role: 'feature-lifecycle-load',
            datasetId: 'dataset-1',
            featureId: 'feat-division-missing'
          }
        }
      },
      {
        id: 'wf-call-run-load',
        tool: 'run_cell',
        args: {
          cellId: 'cell-load-1',
          metadata: {
            phase: 'feature-engineering',
            role: 'feature-lifecycle-load',
            datasetId: 'dataset-1',
            featureId: 'feat-division-missing'
          }
        }
      }
    ];
    state.toolResultHistory = [
      {
        id: 'wf-call-load-cell',
        tool: 'write_cell',
        output: {
          cellId: 'cell-load-1'
        }
      },
      {
        id: 'wf-call-run-load',
        tool: 'run_cell',
        output: {
          status: 'success',
          cellId: 'cell-load-1'
        }
      }
    ];
    executePhaseSpecificToolMock.mockResolvedValue({
      output: {
        featureId: 'feat-date-month',
        status: 'ok'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('execute_tools');
    expect(result.pendingToolCalls).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        args: expect.objectContaining({
          cellType: 'code',
          content: 'df["DATE_month"] = pd.to_datetime(df["DATE"]).dt.month',
          metadata: {
            phase: 'feature-engineering',
            featureId: 'feat-date-month',
            source: 'feature-lifecycle'
          }
        })
      })
    ]);
  });

  it('records FE run_cell output via execute_feature before returning to the model', async () => {
    const phaseConfig = createFeaturePhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => false);
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-run-cell',
      tool: 'run_cell',
      args: {
        cellId: 'cell-1'
      }
    }];
    state.toolResultHistory = [
      {
        id: 'wf-call-materialize',
        tool: 'materialize_feature_code',
        output: {
          featureId: 'feat-signup-month'
        }
      },
      {
        id: 'wf-call-write-cell',
        tool: 'write_cell',
        output: {
          cellId: 'cell-1'
        }
      }
    ];
    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        status: 'success',
        stdout: 'ok',
        stderr: ''
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('execute_tools');
    expect(result.pendingToolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_feature',
        args: expect.objectContaining({
          featureId: 'feat-signup-month',
          cellId: 'cell-1',
          succeeded: true,
          stdout: 'ok',
          stderr: ''
        })
      })
    ]);
  });

  it('preserves run_cell success metadata when truncating oversized outputs', async () => {
    const phaseConfig = createFeaturePhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => false);
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.turn.notebookId = 'notebook-1';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-run-cell-big',
      tool: 'run_cell',
      args: {
        cellId: 'cell-1'
      }
    }];
    state.toolResultHistory = [
      {
        id: 'wf-call-materialize',
        tool: 'materialize_feature_code',
        output: {
          featureId: 'feat-signup-month'
        }
      },
      {
        id: 'wf-call-write-cell',
        tool: 'write_cell',
        output: {
          cellId: 'cell-1'
        }
      }
    ];
    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        status: 'success',
        stdout: 'x'.repeat(60_000),
        stderr: '',
        executionMs: 42,
        cellId: 'cell-1'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('execute_tools');
    expect(result.pendingToolCalls).toEqual([
      expect.objectContaining({
        tool: 'execute_feature',
        args: expect.objectContaining({
          featureId: 'feat-signup-month',
          cellId: 'cell-1',
          succeeded: true,
          stderr: '',
          executionMs: 42,
          stdout: expect.any(String)
        })
      })
    ]);
    const followUp = result.pendingToolCalls?.[0];
    expect(typeof followUp?.args?.stdout).toBe('string');
    expect((followUp?.args?.stdout as string).length).toBeGreaterThan(0);
  });

  it('auto-runs a newly written training cell before returning to the model', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-cell',
      tool: 'write_cell',
      args: {
        title: 'Train subject area classifier',
        content: 'print("train")'
      }
    }];
    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        cellId: 'training-cell-1'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('execute_tools');
    expect(result.pendingToolCalls).toEqual([
      expect.objectContaining({
        tool: 'run_cell',
        args: { cellId: 'training-cell-1' }
      })
    ]);
  });

  it('does not auto-run explicit markdown training cells', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-markdown',
      tool: 'write_cell',
      args: {
        title: 'Training plan',
        cellType: 'markdown',
        content: '## Training Plan'
      }
    }];
    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        cellId: 'training-cell-markdown'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.pendingToolCalls).toEqual([]);
  });

  it('rejects list_cells during training execution stages', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-list-training-cells',
      tool: 'list_cells',
      args: {}
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'list_cells',
        error: expect.stringContaining('not allowed during training execution')
      })
    ]);
  });

  it('rejects markdown cell writes during training execution stages', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-markdown-hard-block',
      tool: 'write_cell',
      args: {
        title: 'Training plan',
        cellType: 'markdown',
        content: '## Training Plan'
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        error: expect.stringContaining('Markdown cells are not allowed during training execution')
      })
    ]);
  });

  it('rejects oversized training code cells during training execution stages', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-huge',
      tool: 'write_cell',
      args: {
        title: 'All training at once',
        cellType: 'code',
        content: Array.from({ length: 140 }, (_, index) => `print(${index})`).join('\n')
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        error: expect.stringContaining('Training code cell is too large')
      })
    ]);
  });

  it('rejects training code using GPU device acceleration (cuda/mps) in the CPU-only runtime', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-gpu',
      tool: 'write_cell',
      args: {
        title: 'GPU training',
        cellType: 'code',
        content: "model = build_model(device='cuda')\nmodel.fit(X_train, y_train)"
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        error: expect.stringMatching(/GPU\/MPS device acceleration|device='cuda'/)
      })
    ]);
  });

  it('rejects training code calling .cuda() or .to("mps") in the CPU-only runtime', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-to-cuda',
      tool: 'write_cell',
      args: {
        title: 'Accelerator',
        cellType: 'code',
        content: "model.to('cuda')\noutput = model(batch)"
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        error: expect.stringMatching(/GPU\/MPS device acceleration/)
      })
    ]);
  });

  it('does not falsely reject torch.cuda.is_available() (non-execution probe)', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    // Oversized on purpose so validation short-circuits before tool execution;
    // we assert the error is the size message, NOT a GPU/MPS message, proving
    // torch.cuda.is_available() didn't trip the device validator.
    const body = [
      'import torch',
      'use_gpu = torch.cuda.is_available()',
      ...Array.from({ length: 140 }, (_, i) => `print(${i})`),
    ].join('\n');
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-cpu-probe',
      tool: 'write_cell',
      args: {
        title: 'CPU probe',
        cellType: 'code',
        content: body
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    const entry = (result.toolResultHistory ?? [])[0];
    expect(entry?.error).toMatch(/Training code cell is too large/);
    expect(entry?.error ?? '').not.toMatch(/GPU\/MPS device acceleration/);
  });

  it('rejects training code that references a dataset different from the selected dataset', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.turn.datasetId = 'dataset-1';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-wrong-dataset',
      tool: 'write_cell',
      args: {
        title: 'Dataset prep',
        cellType: 'code',
        content: 'dataset_path = resolve_dataset_path("other.csv", "dataset-1")'
      }
    }];
    mockGetDatasetById.mockResolvedValue({
      datasetId: 'dataset-1',
      filename: 'feature_v1.csv',
      projectId: 'project-1'
    } as never);

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        error: expect.stringContaining('selected dataset for this turn is "feature_v1.csv"')
      })
    ]);
  });

  it('rejects training code that references a target different from the selected target', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.turn.targetColumn = 'usage_log1p';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-write-training-wrong-target',
      tool: 'write_cell',
      args: {
        title: 'Dataset prep',
        cellType: 'code',
        content: 'target_col = "Subject Area"'
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'write_cell',
        error: expect.stringContaining('selected target column for this turn is "usage_log1p"')
      })
    ]);
  });

  it('rejects training edits that reference a target different from the selected target via direct y assignment', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.turn.targetColumn = 'usage_log1p';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-edit-training-wrong-target',
      tool: 'edit_cell',
      args: {
        cellId: 'cell-1',
        startLine: 10,
        endLine: 10,
        newContent: 'y = df["Subject Area"]'
      }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'edit_cell',
        error: expect.stringContaining('selected target column for this turn is "usage_log1p"')
      })
    ]);
  });

  it('returns to prepare after a successful staged training run_cell so write_code owns the next segment', async () => {
    const phaseConfig = createTrainingPhaseConfig();
    const state = createState();
    state.turn.phase = 'training';
    state.run.phase = 'training';
    state.run.currentNode = 'write_code';
    state.pendingToolCalls = [{
      id: 'wf-call-run-training-segment-1',
      tool: 'run_cell',
      args: {
        cellId: 'cell-1',
        metadata: {
          trainingDraft: {
            draftId: 'draft-1',
            segmentIndex: 0,
            segments: [
              { title: 'Imports and Config', content: 'import json' },
              { title: 'Dataset Prep', content: 'df = load_df()' },
              { title: 'Fit', content: 'model.fit(X_train, y_train)' }
            ]
          }
        }
      }
    }];
    vi.mocked(executeMcpTool).mockResolvedValue({
      output: {
        cellId: 'cell-1',
        status: 'success',
        stdout: 'segment ok'
      }
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.pendingToolCalls).toEqual([]);
  });

  it('still fails when per-phase override is exceeded', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => true);
    phaseConfig.maxSingleToolCalls = 6;
    executePhaseSpecificToolMock.mockResolvedValue({ output: { ok: true } });

    const state = createState();
    state.turn.phase = 'preprocessing';
    state.run.phase = 'preprocessing';
    state.run.currentNode = 'plan_step';

    // 6 calls + 1 pending = 7, exceeds override of 6
    state.toolCallHistory = Array.from({ length: 6 }, (_, i) => ({
      id: `pp-call-${i}`,
      tool: 'profile_active_dataset',
      args: { variant: `v${i}` }
    }));

    state.pendingToolCalls = [{
      id: 'pp-call-overflow',
      tool: 'profile_active_dataset',
      args: { variant: 'v-overflow' }
    }];

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    // Raw-count repetition is now a soft warning — workflow continues
    expect(result.nextStep).toBe('prepare');
    expect(result.errorCode).toBeNull();
  });

  it('does not crash when a tool result has undefined output', async () => {
    const phaseConfig = createPhaseConfig();
    phaseConfig.isPhaseSpecificTool = vi.fn(() => false);
    const state = createState();
    state.turn.phase = 'feature_engineering';
    state.run.phase = 'feature_engineering';
    state.run.currentNode = 'continue_feature_pipeline';
    state.pendingToolCalls = [{
      id: 'wf-call-render-ui',
      tool: 'render_ui',
      args: {
        version: '1',
        kind: 'feature_engineering',
        sections: []
      }
    }];
    vi.mocked(executeMcpTool).mockResolvedValue({
      output: undefined,
      error: undefined
    });

    const result = await executeToolsNode(state, {
      configurable: { phaseConfig }
    } as never);

    expect(result.nextStep).toBe('prepare');
    expect(result.errorCode).toBeNull();
    expect(result.toolResultHistory).toEqual([
      expect.objectContaining({
        tool: 'render_ui',
        output: undefined,
        error: undefined
      })
    ]);
  });
});
