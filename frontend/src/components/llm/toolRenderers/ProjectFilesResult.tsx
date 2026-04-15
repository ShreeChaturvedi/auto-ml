import { resolveFileIconByFilename } from '@/lib/fileUtils';
import { DimensionPill } from './sharedComponents';

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
          {datasets.map((ds, i) => {
            const { Icon, colorClass } = resolveFileIconByFilename(ds.filename);
            return (
              <div key={ds.datasetId ?? i} className="flex items-center gap-2 py-1">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${colorClass}`} />
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {ds.filename}
                </span>
                {(ds.nRows != null || ds.nCols != null) && (
                  <DimensionPill rows={ds.nRows} cols={ds.nCols} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {documents.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Documents
          </p>
          {documents.map((doc, i) => {
            const { Icon, colorClass } = resolveFileIconByFilename(doc.filename);
            return (
              <div key={doc.documentId ?? i} className="flex items-center gap-2 py-1">
                <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${colorClass}`} />
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {doc.filename}
                </span>
                {doc.mimeType && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {doc.mimeType}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
