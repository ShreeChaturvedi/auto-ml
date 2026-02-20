# Issue Title
Tool calls fail when Thinking mode is OFF in Training chat

## Summary
When users disable Thinking mode in the Training chat panel, the LLM flow intermittently fails to execute/continue tool-calling loops. The same workflow is more reliable when Thinking mode is enabled.

## Environment
- Branch: `sprint6`
- Frontend: `frontend/src/components/training/TrainingPanel.tsx`
- Backend: `backend/src/routes/llm.ts`, `backend/src/services/llm/llmClient.ts`, `backend/src/services/llm/providers/geminiClient.ts`

## Steps to Reproduce
1. Start app with `npm run dev`.
2. Open a project with an uploaded dataset.
3. Go to the Training tab/chat.
4. Ensure Thinking mode is OFF.
5. Send a prompt that should trigger tool usage (e.g., read/list/write cell workflow).

## Actual Behavior
- Tool flow may stop early, not execute correctly, or fail to continue reliably after tool response.

## Expected Behavior
- Tool-calling loop should behave consistently regardless of Thinking mode.
- If tool calls are emitted, they should execute and the follow-up LLM continuation should complete.

## Impact
- Core AI workflow reliability is reduced.
- Users may assume tool functionality is broken.

## Suggested Investigation
- Compare event/stream payloads and function-call parsing between `enableThinking=true` vs `false`.
- Verify tool call merging/finalization in `geminiClient.ts`.
- Confirm frontend continuation loop behavior after tool execution in `TrainingPanel.tsx`.

## Acceptance Criteria
- [ ] Repro case above works with Thinking ON and OFF.
- [ ] Tool indicators show completed status consistently.
- [ ] No silent failure in continuation request after tool execution.
- [ ] Add regression test coverage for tool-calling flow with Thinking disabled.
