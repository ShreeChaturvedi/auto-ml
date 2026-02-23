import { z } from 'zod';

// ============================================================
// Cell Output Types
// ============================================================

export const CellOutputTypeSchema = z.enum(['text', 'error', 'image', 'html', 'table', 'chart']);
export type CellOutputType = z.infer<typeof CellOutputTypeSchema>;

export const CellOutputSchema = z.object({
  type: CellOutputTypeSchema,
  content: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  mimeType: z.string().optional()
});
export type CellOutput = z.infer<typeof CellOutputSchema>;

export const OutputRefSchema = z.object({
  type: z.enum(['image', 'html', 'file']),
  ref: z.string(),
  mimeType: z.string().optional(),
  byteSize: z.number().optional()
});
export type OutputRef = z.infer<typeof OutputRefSchema>;

// ============================================================
// Cell Types
// ============================================================

export const NotebookCellTypeSchema = z.enum(['code', 'markdown']);
export type NotebookCellType = z.infer<typeof NotebookCellTypeSchema>;

export const NotebookCellStatusSchema = z.enum(['idle', 'running', 'success', 'error']);
export type NotebookCellStatus = z.infer<typeof NotebookCellStatusSchema>;

export const NotebookCellSchema = z.object({
  cellId: z.string(),
  notebookId: z.string(),
  cellType: NotebookCellTypeSchema,
  title: z.string().nullable().optional(),
  content: z.string(),
  position: z.number().int().min(0),
  executionCount: z.number().int().min(0).default(0),
  executionStatus: NotebookCellStatusSchema.default('idle'),
  executionDurationMs: z.number().int().nullable().optional(),
  output: z.array(CellOutputSchema).default([]),
  outputRefs: z.array(OutputRefSchema).default([]),
  lockedBy: z.string().nullable().optional(),
  lockedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type NotebookCell = z.infer<typeof NotebookCellSchema>;

// Summary version for list operations
export const CellSummarySchema = z.object({
  cellId: z.string(),
  cellType: NotebookCellTypeSchema,
  title: z.string().nullable().optional(),
  position: z.number().int(),
  executionStatus: NotebookCellStatusSchema,
  executionCount: z.number().int(),
  lockedBy: z.string().nullable().optional(),
  contentPreview: z.string().optional()
});
export type CellSummary = z.infer<typeof CellSummarySchema>;

// ============================================================
// Notebook Types
// ============================================================

export const NotebookSchema = z.object({
  notebookId: z.string(),
  projectId: z.string(),
  name: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Notebook = z.infer<typeof NotebookSchema>;

// ============================================================
// Cell Lock Types
// ============================================================

export const LockOwnerSchema = z.enum(['ai', 'user']);
export type LockOwner = z.infer<typeof LockOwnerSchema>;

export interface CellLock {
  cellId: string;
  lockedBy: LockOwner;
  lockedAt: Date;
}

// ============================================================
// WebSocket Message Types
// ============================================================

export type WSServerMessageType =
  | 'subscribed'
  | 'unsubscribed'
  | 'cell:created'
  | 'cell:updated'
  | 'cell:deleted'
  | 'cell:locked'
  | 'cell:unlocked'
  | 'cell:executing'
  | 'cell:executed'
  | 'error'
  | 'pong';

export interface WSSubscribedMessage {
  type: 'subscribed';
  notebookId: string;
}

export interface WSUnsubscribedMessage {
  type: 'unsubscribed';
  notebookId: string;
}

export interface WSCellCreatedMessage {
  type: 'cell:created';
  cell: NotebookCell;
}

export interface WSCellUpdatedMessage {
  type: 'cell:updated';
  cell: NotebookCell;
}

export interface WSCellDeletedMessage {
  type: 'cell:deleted';
  cellId: string;
}

export interface WSCellLockedMessage {
  type: 'cell:locked';
  cellId: string;
  lockedBy: string;
}

export interface WSCellUnlockedMessage {
  type: 'cell:unlocked';
  cellId: string;
}

export interface WSCellExecutingMessage {
  type: 'cell:executing';
  cellId: string;
}

export interface WSCellExecutedMessage {
  type: 'cell:executed';
  cell: NotebookCell;
}

export interface WSErrorMessage {
  type: 'error';
  message: string;
}

export interface WSPongMessage {
  type: 'pong';
}

export type WSServerMessage =
  | WSSubscribedMessage
  | WSUnsubscribedMessage
  | WSCellCreatedMessage
  | WSCellUpdatedMessage
  | WSCellDeletedMessage
  | WSCellLockedMessage
  | WSCellUnlockedMessage
  | WSCellExecutingMessage
  | WSCellExecutedMessage
  | WSErrorMessage
  | WSPongMessage;

export type WSClientMessageType = 'subscribe' | 'unsubscribe' | 'ping';

export interface WSSubscribeMessage {
  type: 'subscribe';
  notebookId: string;
}

export interface WSUnsubscribeMessage {
  type: 'unsubscribe';
  notebookId: string;
}

export interface WSPingMessage {
  type: 'ping';
}

export type WSClientMessage =
  | WSSubscribeMessage
  | WSUnsubscribeMessage
  | WSPingMessage;

// ============================================================
// API Request/Response Types
// ============================================================

export interface CreateCellRequest {
  content: string;
  title?: string;
  cellType?: NotebookCellType;
  position?: number;
}

export interface UpdateCellRequest {
  content?: string;
  title?: string;
}

export interface ReorderCellsRequest {
  cellIds: string[];
}

export interface RunCellRequest {
  projectId: string;
}

// ============================================================
// Execution Result (from cloud Docker execution)
// ============================================================

export interface ExecutionResult {
  status: 'success' | 'error' | 'timeout';
  stdout: string;
  stderr: string;
  outputs: CellOutput[];
  executionMs: number;
  error?: string;
}

// ============================================================
// Notebook Store State Types
// ============================================================

export interface NotebookState {
  notebook: Notebook | null;
  cells: NotebookCell[];
  lockedCells: Map<string, CellLock>;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

// ============================================================
// Edit Cell Diff Types (for UI display)
// ============================================================

export interface EditCellDiff {
  cellId: string;
  oldContent: string;
  newContent: string;
  linesRemoved: string[];
  linesAdded: string[];
  startLine: number;
  endLine: number;
}
