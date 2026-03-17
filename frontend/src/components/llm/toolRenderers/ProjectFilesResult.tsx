import { Database, FileText } from 'lucide-react';

export interface ProjectFile {
  datasetId?: string;
  documentId?: string;
  filename: string;
  nRows?: number;
  nCols?: number;
  columns?: string[];
  mimeType?: string;
}

export interface ProjectFilesOutput {
  datasets?: ProjectFile[];
  documents?: ProjectFile[];
}

export function ProjectFilesResult({ data }: { data: ProjectFilesOutput }) {
  const datasets = data.datasets ?? [];
  const documents = data.documents ?? [];
  const total = datasets.length + documents.length;

  if (total === 0) {
    return <p className="text-xs text-muted-foreground italic">No files in project.</p>;
  }

  return (
    <div className="space-y-2">
      {datasets.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Datasets
          </p>
          {datasets.map((ds, i) => (
            <div
              key={ds.datasetId ?? i}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-card/40 border border-border/30"
            >
              <Database className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-foreground truncate flex-1">
                {ds.filename}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {ds.nRows != null && (
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {ds.nRows.toLocaleString()} rows
                  </span>
                )}
                {ds.nCols != null && (
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    · {ds.nCols} cols
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {documents.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Documents
          </p>
          {documents.map((doc, i) => (
            <div
              key={doc.documentId ?? i}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-card/40 border border-border/30"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-foreground truncate flex-1">
                {doc.filename}
              </span>
              {doc.mimeType && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {doc.mimeType}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
