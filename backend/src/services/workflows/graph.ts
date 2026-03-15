import type { RunnableConfig } from '@langchain/core/runnables';
import { END, START, StateGraph } from '@langchain/langgraph';

import { InternalWorkflowState, type WorkflowGraphState } from './graphState.js';
import { invokeModelNode } from './modelTurnCollector.js';
import { buildPhaseRequest } from './phaseRequestBuilder.js';
import { executeToolsNode } from './toolExecutor.js';

function routeNextStep(state: WorkflowGraphState) {
  return state.nextStep;
}

export function buildWorkflowGraph() {
  return new StateGraph(InternalWorkflowState)
    .addNode('prepare', buildPhaseRequest)
    .addNode('invoke_model', (state: WorkflowGraphState, config?: RunnableConfig) =>
      invokeModelNode(state, config))
    .addNode('execute_tools', (state: WorkflowGraphState, config?: RunnableConfig) =>
      executeToolsNode(state, config))
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

// Pre-compiled singleton — graph is compiled once at import time.
let _compiledGraph: ReturnType<typeof buildWorkflowGraph> | null = null;

export function getCompiledGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildWorkflowGraph();
  }
  return _compiledGraph;
}
