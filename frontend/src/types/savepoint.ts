export interface Savepoint {
  savepointId: string;
  notebookId: string;
  turnIndex: number;
  turnMessageId: string;
  createdAt: string;
}

export interface SavepointDiff {
  cellsAdded: number;
  cellsModified: number;
  cellsDeleted: number;
  linesAdded: number;
  linesRemoved: number;
  hasManualEdits: boolean;
  details: { cellId: string; title: string | null; changeType: 'added' | 'modified' | 'deleted'; linesAdded: number; linesRemoved: number }[];
}
