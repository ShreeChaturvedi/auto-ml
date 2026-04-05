import { describe, expect, it } from 'vitest';

import type { ToolResult } from '../../../types/llm.js';

import { trainingPhaseConfig } from './training.js';

function makeToolResult(tool: string, overrides: Partial<ToolResult> = {}): ToolResult {
  return { tool, id: `call-${tool}`, ...overrides };
}

function makeRunCellSuccess(): ToolResult {
  return makeToolResult('run_cell', {
    output: { status: 'success', stdout: 'RMSE: 0.4321', stderr: '', cellId: 'c-1', executionMs: 1200 }
  });
}

function makeRunCellError(): ToolResult {
  return makeToolResult('run_cell', {
    output: { status: 'error', stdout: '', stderr: 'NameError: name "foo" is not defined', cellId: 'c-1' }
  });
}

function makeRunCellMcpError(): ToolResult {
  return makeToolResult('run_cell', { error: 'Cell not found: c-999' });
}

function makeExecuteTrainingSuccess(): ToolResult {
  return makeToolResult('execute_training', {
    output: { experimentId: 'exp-1', status: 'training', metrics: { rmse: 0.43 } }
  });
}

function makeExecuteTrainingFailed(): ToolResult {
  // LLM called execute_training(succeeded: false) — handler returns
  // { output: { status: 'failed' } } with result.error = null.
  return makeToolResult('execute_training', {
    output: { experimentId: 'exp-1', status: 'failed', errorMessage: 'Training code failed.' }
  });
}

function makeExecuteTrainingHandlerError(): ToolResult {
  // MCP/handler-level error (missing experimentId, etc.)
  return makeToolResult('execute_training', { error: 'This operation requires experimentId.' });
}

describe('trainingPhaseConfig.resolveNextStage', () => {
  const resolve = trainingPhaseConfig.resolveNextStage.bind(trainingPhaseConfig);

  describe('linear stage progression (no gating)', () => {
    it('advances configure_experiment → propose_model', () => {
      expect(resolve('configure_experiment', [])).toBe('propose_model');
    });

    it('advances propose_model → generate_code', () => {
      expect(resolve('propose_model', [])).toBe('generate_code');
    });

    it('advances generate_code → write_code', () => {
      expect(resolve('generate_code', [])).toBe('write_code');
    });

    it('advances evaluate_results → await_review', () => {
      expect(resolve('evaluate_results', [])).toBe('await_review');
    });

    it('advances register_model → summarize', () => {
      expect(resolve('register_model', [])).toBe('summarize');
    });

    it('returns null at summarize (end of lifecycle)', () => {
      expect(resolve('summarize', [])).toBeNull();
    });

    it('returns null for unknown stage', () => {
      expect(resolve('nonexistent_stage', [])).toBeNull();
    });
  });

  describe('write_code stage gate (Fix 1)', () => {
    it('stays at write_code when no run_cell in history', () => {
      expect(resolve('write_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } })
      ])).toBe('write_code');
    });

    it('stays at write_code when run_cell failed (status: error)', () => {
      expect(resolve('write_code', [makeRunCellError()])).toBe('write_code');
    });

    it('stays at write_code when run_cell had MCP-level error', () => {
      expect(resolve('write_code', [makeRunCellMcpError()])).toBe('write_code');
    });

    it('advances write_code → execute_training when run_cell succeeded', () => {
      expect(resolve('write_code', [makeRunCellSuccess()])).toBe('execute_training');
    });

    it('advances if run_cell succeeded earlier (e.g., at generate_code stage)', () => {
      // An early run_cell from generate_code is in cumulative toolResultHistory
      // and should satisfy the gate — if code was already run, write_code is skip-worthy.
      expect(resolve('write_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
        makeRunCellSuccess()
      ])).toBe('execute_training');
    });

    it('stays at write_code when only non-run_cell tools are in history', () => {
      expect(resolve('write_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
        makeToolResult('edit_cell', { output: { cellId: 'c-1' } }),
        makeToolResult('read_cell', { output: { cellId: 'c-1' } })
      ])).toBe('write_code');
    });
  });

  describe('execute_training failure detection (Fix 2)', () => {
    it('loops back to generate_code on handler error (result.error set)', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingHandlerError()
      ])).toBe('generate_code');
    });

    it('loops back to generate_code on LLM-reported failure (output.status=failed)', () => {
      // This is the bug Fix 2 addresses: the old check only matched
      // result.error, missing the output.status='failed' path.
      expect(resolve('execute_training', [
        makeExecuteTrainingFailed()
      ])).toBe('generate_code');
    });

    it('advances execute_training → evaluate_results on success', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingSuccess()
      ])).toBe('evaluate_results');
    });

    it('does NOT loop back from a different stage even with execute_training failure in history', () => {
      // The loop-back is guarded by `current === 'execute_training'`.
      // A failure from a prior stage should not affect the current stage.
      expect(resolve('evaluate_results', [
        makeExecuteTrainingFailed()
      ])).toBe('await_review');
    });
  });
});

describe('trainingPhaseConfig.getStageConfig (Path A — forced stages)', () => {
  it('forces execute_training stage to only lifecycle + ask_user + render_ui', () => {
    const config = trainingPhaseConfig.getStageConfig('execute_training');
    const toolNames = config.allowedTools.map((t) => t.name);

    expect(toolNames).toContain('execute_training');
    expect(toolNames).toContain('ask_user');
    expect(toolNames).toContain('render_ui');
    expect(toolNames).not.toContain('write_cell');
    expect(toolNames).not.toContain('run_cell');
    expect(toolNames).not.toContain('edit_cell');
    expect(toolNames).not.toContain('read_cell');
    expect(config.requireToolCall).toBe(true);
    expect(config.allowAssistantMessage).toBe(false);
  });

  it('forces evaluate_results stage to only lifecycle + ask_user + render_ui', () => {
    const config = trainingPhaseConfig.getStageConfig('evaluate_results');
    const toolNames = config.allowedTools.map((t) => t.name);

    expect(toolNames).toContain('evaluate_results');
    expect(toolNames).not.toContain('write_cell');
    expect(config.requireToolCall).toBe(true);
  });

  it('forces register_model stage to only lifecycle + ask_user + render_ui', () => {
    const config = trainingPhaseConfig.getStageConfig('register_model');
    const toolNames = config.allowedTools.map((t) => t.name);

    expect(toolNames).toContain('register_model');
    expect(toolNames).not.toContain('write_cell');
    expect(config.requireToolCall).toBe(true);
  });

  it('keeps notebook tools available at write_code stage (not forced)', () => {
    const config = trainingPhaseConfig.getStageConfig('write_code');
    const toolNames = config.allowedTools.map((t) => t.name);

    expect(toolNames).toContain('write_cell');
    expect(toolNames).toContain('run_cell');
    expect(toolNames).toContain('edit_cell');
    expect(toolNames).toContain('read_cell');
    expect(config.requireToolCall).toBe(false);
    expect(config.allowAssistantMessage).toBe(true);
  });

  it('keeps notebook tools available at generate_code stage (not forced)', () => {
    const config = trainingPhaseConfig.getStageConfig('generate_code');
    const toolNames = config.allowedTools.map((t) => t.name);

    expect(toolNames).toContain('write_cell');
    expect(toolNames).toContain('run_cell');
    expect(config.requireToolCall).toBe(false);
  });
});
