import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamPreprocessingPlan, type LlmStreamEvent } from '../llm';

function createNdjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    }
  });

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' }
  });
}

describe('streamPreprocessingPlan workflow events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses backend-owned workflow runtime events and appends a terminal done event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createNdjsonResponse([
        `${JSON.stringify({
          type: 'workflow_state',
          state: {
            runId: 'workflow-run-1',
            threadId: 'workflow-thread-1',
            phase: 'preprocessing',
            currentNode: 'validate_step',
            status: 'running',
            mode: 'action',
            revision: 3
          }
        })}\n`,
        `${JSON.stringify({
          type: 'tool_executed',
          call: {
            id: 'call-1',
            tool: 'validate_step_result',
            args: {
              stepId: 'step-1'
            }
          },
          result: {
            id: 'call-1',
            tool: 'validate_step_result',
            output: {
              status: 'awaiting_approval'
            }
          }
        })}\n`,
        `${JSON.stringify({
          type: 'artifact_updated',
          artifact: {
            kind: 'ui',
            ui: {
              version: '1',
              kind: 'preprocessing',
              sections: []
            }
          }
        })}\n`,
        `${JSON.stringify({
          type: 'workflow_pause',
          reason: 'awaiting_approval',
          pendingInputKind: 'approval',
          message: 'Approval required.'
        })}\n`
      ])
    );

    const events: LlmStreamEvent[] = [];
    await streamPreprocessingPlan(
      {
        projectId: 'project-1',
        datasetId: 'dataset-1',
        prompt: 'Validate and pause if needed.'
      },
      (event) => events.push(event)
    );

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'workflow_state',
        state: expect.objectContaining({
          currentNode: 'validate_step',
          status: 'running'
        })
      }),
      expect.objectContaining({
        type: 'tool_executed',
        call: expect.objectContaining({
          tool: 'validate_step_result'
        }),
        result: expect.objectContaining({
          output: expect.objectContaining({
            status: 'awaiting_approval'
          })
        })
      }),
      expect.objectContaining({
        type: 'artifact_updated',
        artifact: expect.objectContaining({
          kind: 'ui'
        })
      }),
      expect.objectContaining({
        type: 'workflow_pause',
        reason: 'awaiting_approval'
      })
    ]));
    expect(events.at(-1)?.type).toBe('done');
  });
});
