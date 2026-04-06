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
  return makeToolResult('execute_training', {
    output: { experimentId: 'exp-1', status: 'failed', errorMessage: 'Training code failed.' }
  });
}

function makeExecuteTrainingHandlerError(): ToolResult {
  return makeToolResult('execute_training', { error: 'This operation requires experimentId.' });
}

describe('trainingPhaseConfig.resolveNextStage', () => {
  const resolve = trainingPhaseConfig.resolveNextStage.bind(trainingPhaseConfig);

  describe('linear stage progression', () => {
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

  describe('write_code stage gate', () => {
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

    it('advances if run_cell succeeded earlier (cumulative history)', () => {
      expect(resolve('write_code', [
        makeToolResult('write_cell', { output: { cellId: 'c-1' } }),
        makeRunCellSuccess()
      ])).toBe('execute_training');
    });
  });

  describe('execute_training failure detection', () => {
    it('loops back to generate_code on handler error', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingHandlerError()
      ])).toBe('generate_code');
    });

    it('loops back to generate_code on output.status=failed', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingFailed()
      ])).toBe('generate_code');
    });

    it('advances execute_training → evaluate_results on success', () => {
      expect(resolve('execute_training', [
        makeExecuteTrainingSuccess()
      ])).toBe('evaluate_results');
    });

    it('does NOT loop back from a different stage', () => {
      expect(resolve('evaluate_results', [
        makeExecuteTrainingFailed()
      ])).toBe('await_review');
    });
  });
});

describe('trainingPhaseConfig.getStageConfig', () => {
  it('uses text mode for all stages (no planner)', () => {
    const stages = [
      'answer', 'configure_experiment', 'propose_model',
      'generate_code', 'write_code', 'execute_training',
      'evaluate_results', 'await_review', 'register_model', 'summarize'
    ];
    for (const stage of stages) {
      const config = trainingPhaseConfig.getStageConfig(stage);
      expect(config.mode).toBe('text');
    }
  });

  it('includes all training lifecycle tools at every stage', () => {
    const config = trainingPhaseConfig.getStageConfig('write_code');
    const toolNames = config.allowedTools.map((t) => t.name);
    expect(toolNames).toContain('configure_experiment');
    expect(toolNames).toContain('propose_training_plan');
    expect(toolNames).toContain('execute_training');
    expect(toolNames).toContain('evaluate_results');
    expect(toolNames).toContain('register_model');
    expect(toolNames).toContain('compare_models');
    expect(toolNames).toContain('write_cell');
    expect(toolNames).toContain('run_cell');
  });
});
