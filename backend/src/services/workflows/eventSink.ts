import type { Response } from 'express';

// ---------------------------------------------------------------------------
// WorkflowEventSink — transport abstraction that decouples the workflow
// engine from Express. Graph nodes, the executor, and the finalizer all
// receive the same WorkflowEventSink — never raw `res`.
// ---------------------------------------------------------------------------

export interface WorkflowEventSink {
  emit(event: unknown): void;
  isOpen(): boolean;
}

export class NdjsonResponseSink implements WorkflowEventSink {
  constructor(private readonly res: Response) {}

  emit(event: unknown): void {
    if (this.isOpen()) {
      this.res.write(`${JSON.stringify(event)}\n`);
    }
  }

  isOpen(): boolean {
    return !this.res.writableEnded && !this.res.destroyed;
  }
}
