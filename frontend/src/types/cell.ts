export type CellType = 'code' | 'markdown' | 'output' | 'chat';
export type CellStatus = 'idle' | 'running' | 'success' | 'error';

export interface Cell {
  id: string;
  type: CellType;
  content: string;
  output?: CellOutput;
  status: CellStatus;
  createdAt: string;
  executedAt?: string;
  executionDurationMs?: number;
}

export interface CellOutput {
  type: 'text' | 'table' | 'chart' | 'error' | 'html';
  content: string;
  data?: unknown;
}
