import express from 'express';
import request from 'supertest';

import { createWorkflowRouter } from '../routes/workflows.js';

interface WorkflowQaRequest {
  projectId: string;
  phase: 'preprocessing' | 'feature_engineering' | 'training';
  datasetId?: string;
  prompt: string;
  runId?: string;
  threadId?: string;
  model?: string;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
}

function parseRequest(): WorkflowQaRequest {
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split('=');
      options.set(key, value);
      continue;
    }
    positional.push(arg);
  }

  const [projectId, phase, datasetId, prompt] = positional;

  if (!projectId || !phase || !prompt) {
    throw new Error(
      'Usage: node --import tsx/esm src/scripts/runWorkflowQa.ts <projectId> <phase> <datasetId|-> <prompt> [--runId=<id>] [--threadId=<id>]'
    );
  }

  if (phase !== 'preprocessing' && phase !== 'feature_engineering' && phase !== 'training') {
    throw new Error(`Unsupported phase: ${phase}`);
  }

  return {
    projectId,
    phase,
    datasetId: datasetId && datasetId !== '-' ? datasetId : undefined,
    prompt,
    runId: options.get('runId'),
    threadId: options.get('threadId'),
    model: 'gpt-5.4',
    reasoningEffort: 'medium'
  };
}

function summarizeToolResult(event: Record<string, unknown>): string {
  const result = event.result && typeof event.result === 'object' ? event.result as Record<string, unknown> : null;
  const output = result?.output && typeof result.output === 'object' ? result.output as Record<string, unknown> : null;
  const step = output?.step && typeof output.step === 'object' ? output.step as Record<string, unknown> : null;
  const error = typeof result?.error === 'string' ? result.error : null;
  if (error) {
    return `error=${error}`;
  }
  const stderr = typeof output?.stderr === 'string' && output.stderr.trim()
    ? `stderr=${output.stderr.trim().slice(0, 240)}`
    : null;
  return [
    typeof output?.status === 'string' ? `status=${output.status}` : null,
    typeof step?.status === 'string' ? `stepStatus=${step.status}` : null,
    typeof output?.stepId === 'string' ? `stepId=${output.stepId}` : null,
    typeof output?.datasetId === 'string' ? `datasetId=${output.datasetId}` : null,
    stderr
  ].filter((value): value is string => Boolean(value)).join(', ') || 'ok';
}

async function main() {
  const payload = parseRequest();
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', createWorkflowRouter());

  const response = await request(app)
    .post('/api/workflows/turns/stream')
    .send(payload);

  const lines = response.text.trim().split('\n').filter(Boolean);
  let assistantText = '';
  for (const line of lines) {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type === 'workflow_state') {
      const state = event.state as Record<string, unknown>;
      console.log(
        `STATE ${state.currentNode} status=${state.status} runId=${state.runId} threadId=${state.threadId}`
      );
      continue;
    }
    if (event.type === 'token') {
      assistantText += typeof event.text === 'string' ? event.text : '';
      continue;
    }
    if (event.type === 'tool_executed') {
      const call = event.call as Record<string, unknown>;
      console.log(`TOOL ${call.tool} ${summarizeToolResult(event)}`);
      continue;
    }
    if (event.type === 'workflow_pause') {
      console.log(`PAUSE ${(event.reason as string) ?? 'unknown'}`);
      continue;
    }
    if (event.type === 'workflow_error') {
      console.log(`ERROR ${(event.message as string) ?? 'unknown error'}`);
      continue;
    }
    if (event.type === 'done') {
      if (assistantText.trim()) {
        console.log(`TEXT ${assistantText.trim()}`);
      }
      console.log('DONE');
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
