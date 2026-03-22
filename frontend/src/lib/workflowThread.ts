/**
 * Detect whether a run-reference string is actually a workflow thread ID
 * (rather than a real preprocessing run ID).
 *
 * Matches patterns like `thread-<uuid>`, `workflow-thread-<id>`, etc.
 */
export function isWorkflowThreadId(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return /^(?:[a-z]+-)*thread[-:]/i.test(value.trim());
}
