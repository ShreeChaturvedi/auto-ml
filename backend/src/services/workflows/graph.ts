import { END, START, StateGraph } from '@langchain/langgraph';
import type { Response } from 'express';

import { InternalWorkflowState, type WorkflowGraphState } from './graphState.js';
import { invokeModelNode } from './modelTurnCollector.js';
import { buildPhaseRequest } from './phaseRequestBuilder.js';
import { executeToolsNode } from './toolExecutor.js';

function routeNextStep(state: WorkflowGraphState) {
  return state.nextStep;
}

export function buildWorkflowGraph(res: Response) {
  return new StateGraph(InternalWorkflowState)
    .addNode('prepare', buildPhaseRequest)
    .addNode('invoke_model', (state: WorkflowGraphState) => invokeModelNode(state, res))
    .addNode('execute_tools', (state: WorkflowGraphState) => executeToolsNode(state, res))
    .addNode('pause', async (state: WorkflowGraphState) => state)
    .addNode('complete', async (state: WorkflowGraphState) => state)
    .addNode('fail', async (state: WorkflowGraphState) => state)
    .addEdge(START, 'prepare')
    .addConditionalEdges('prepare', routeNextStep)
    .addConditionalEdges('invoke_model', routeNextStep)
    .addConditionalEdges('execute_tools', routeNextStep)
    .addEdge('pause', END)
    .addEdge('complete', END)
    .addEdge('fail', END)
    .compile({
      name: 'shared-workflow-turn-executor'
    });
}
