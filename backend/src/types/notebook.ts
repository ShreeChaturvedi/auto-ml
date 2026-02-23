import { z } from 'zod';

// ============================================================
// Cell Output Types
// ============================================================

export const CellOutputTypeSchema = z.enum(['text', 'error', 'image', 'html', 'table', 'chart']);
export type CellOutputType = z.infer<typeof CellOutputTypeSchema>;

export const CellOutputSchema = z.object({
  type: CellOutputTypeSchema,
  content: z.string(),
  data: z.record(z.unknown()).optional(),
  mimeType: z.string().optional()
});
export type CellOutput = z.infer<typeof CellOutputSchema>;

export const OutputRefSchema = z.object({
  type: z.enum(['image', 'html', 'file']),
  ref: z.string(), // e.g., "outputs/{cellId}/plot.png"
  mimeType: z.string().optional(),
  byteSize: z.number().optional()
});
export type OutputRef = z.infer<typeof OutputRefSchema>;

// ============================================================
// Cell Types
// ============================================================

export const CellTypeSchema = z.enum(['code', 'markdown']);
export type CellType = z.infer<typeof CellTypeSchema>;

export const CellStatusSchema = z.enum(['idle', 'running', 'success', 'error']);
export type CellStatus = z.infer<typeof CellStatusSchema>;

export const CellSchema = z.object({
  cellId: z.string().uuid(),
  notebookId: z.string().uuid(),
  cellType: CellTypeSchema,
  title: z.string().nullable().optional(),
  content: z.string(),
  position: z.number().int().min(0),
  executionCount: z.number().int().min(0).default(0),
  executionStatus: CellStatusSchema.default('idle'),
  executionDurationMs: z.number().int().nullable().optional(),
  output: z.array(CellOutputSchema).default([]),
  outputRefs: z.array(OutputRefSchema).default([]),
  lockedBy: z.string().nullable().optional(),
  lockedAt: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type Cell = z.infer<typeof CellSchema>;

// Summary version for list operations
export const CellSummarySchema = z.object({
  cellId: z.string().uuid(),
  cellType: CellTypeSchema,
  title: z.string().nullable().optional(),
  position: z.number().int(),
  executionStatus: CellStatusSchema,
  executionCount: z.number().int(),
  lockedBy: z.string().nullable().optional(),
  contentPreview: z.string().optional() // First 100 chars
});
export type CellSummary = z.infer<typeof CellSummarySchema>;

// ============================================================
// Notebook Types
// ============================================================

export const NotebookSchema = z.object({
  notebookId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date()
});
export type Notebook = z.infer<typeof NotebookSchema>;

// ============================================================
// Cell Lock Types
// ============================================================

export const LockOwnerSchema = z.enum(['ai', 'user']);
export type LockOwner = z.infer<typeof LockOwnerSchema>;

export const CellLockSchema = z.object({
  cellId: z.string().uuid(),
  lockedBy: LockOwnerSchema,
  lockedAt: z.date()
});
export type CellLock = z.infer<typeof CellLockSchema>;

// ============================================================
// WebSocket Event Types
// ============================================================

export const WSEventTypeSchema = z.enum([
  'cell:created',
  'cell:updated',
  'cell:deleted',
  'cell:locked',
  'cell:unlocked',
  'cell:executing',
  'cell:executed',
  'notebook:created',
  'notebook:updated',
  'error'
]);
export type WSEventType = z.infer<typeof WSEventTypeSchema>;

export const WSEventSchema = z.object({
  type: WSEventTypeSchema,
  notebookId: z.string().uuid(),
  cellId: z.string().uuid().optional(),
  data: z.unknown(),
  timestamp: z.date()
});
export type WSEvent = z.infer<typeof WSEventSchema>;

// Client -> Server messages
export const WSClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), notebookId: z.string().uuid() }),
  z.object({ type: z.literal('unsubscribe'), notebookId: z.string().uuid() }),
  z.object({ type: z.literal('ping') })
]);
export type WSClientMessage = z.infer<typeof WSClientMessageSchema>;

// Server -> Client messages
export const WSServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribed'), notebookId: z.string().uuid() }),
  z.object({ type: z.literal('unsubscribed'), notebookId: z.string().uuid() }),
  z.object({ type: z.literal('cell:created'), cell: CellSchema }),
  z.object({ type: z.literal('cell:updated'), cell: CellSchema }),
  z.object({ type: z.literal('cell:deleted'), cellId: z.string().uuid() }),
  z.object({ type: z.literal('cell:locked'), cellId: z.string().uuid(), lockedBy: z.string() }),
  z.object({ type: z.literal('cell:unlocked'), cellId: z.string().uuid() }),
  z.object({ type: z.literal('cell:executing'), cellId: z.string().uuid() }),
  z.object({ type: z.literal('cell:executed'), cell: CellSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('pong') })
]);
export type WSServerMessage = z.infer<typeof WSServerMessageSchema>;

// ============================================================
// Tool Operation Types
// ============================================================

export interface WriteCellOptions {
  cellId?: string;
  title?: string;
  content: string;
  cellType?: CellType;
}

export interface EditCellOptions {
  startLine: number;
  endLine: number;
  newContent: string;
}

export interface EditCellResult {
  cell: Cell;
  oldContent: string;
  newContent: string;
  diff: {
    linesRemoved: string[];
    linesAdded: string[];
  };
}

export interface InsertCellOptions {
  position: number;
  content: string;
  title?: string;
  cellType?: CellType;
}

// ============================================================
// Database Row Types (for repository layer)
// ============================================================

export interface NotebookRow {
  notebook_id: string;
  project_id: string;
  name: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CellRow {
  cell_id: string;
  notebook_id: string;
  cell_type: string;
  title: string | null;
  content: string;
  position: number;
  execution_count: number;
  execution_status: string;
  execution_duration_ms: number | null;
  output: CellOutput[];
  output_refs: OutputRef[];
  locked_by: string | null;
  locked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CellOutputRow {
  output_id: string;
  cell_id: string;
  output_type: string;
  file_path: string;
  mime_type: string | null;
  byte_size: number | null;
  created_at: Date;
}

// ============================================================
// Utility functions for row conversion
// ============================================================

export function notebookRowToNotebook(row: NotebookRow): Notebook {
  return {
    notebookId: row.notebook_id,
    projectId: row.project_id,
    name: row.name,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function cellRowToCell(row: CellRow): Cell {
  return {
    cellId: row.cell_id,
    notebookId: row.notebook_id,
    cellType: row.cell_type as CellType,
    title: row.title,
    content: row.content,
    position: row.position,
    executionCount: row.execution_count,
    executionStatus: row.execution_status as CellStatus,
    executionDurationMs: row.execution_duration_ms,
    output: row.output,
    outputRefs: row.output_refs,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
