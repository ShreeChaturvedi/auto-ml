import { useState } from 'react';
import { Trash2, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { UploadedFile } from '@/types/file';
import { resolveFileIcon, formatFileSize } from '@/lib/fileUtils';
import { FilePreview } from './FilePreview';
import { cn } from '@/lib/utils';
import type { FileType } from '@/types/file';

/** Background/text/border color classes for the icon container in card view. */
const cardIconColorMap: Record<FileType, string> = {
  csv: 'bg-green-500/10 text-green-500 border-green-500/20',
  json: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  excel: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  pdf: 'bg-red-500/10 text-red-500 border-red-500/20',
  markdown: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  word: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  text: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  other: 'bg-gray-500/10 text-gray-500 border-gray-500/20'
};

interface FileCardProps {
  file: UploadedFile;
  onRemove: (fileId: string) => void;
  status?: 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
}

export function FileCard({ file, onRemove, status, errorMessage }: FileCardProps) {
  const [showPreview, setShowPreview] = useState(false);

  const { Icon } = resolveFileIcon(file.type);

  return (
    <>
      <Card
        data-testid={`file-card-${file.id}`}
        className="group relative overflow-hidden hover:shadow-md hover:border-primary/20 transition-all duration-200"
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon - Type-specific colors */}
            <div
              className={cn(
                'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border transition-all duration-200',
                cardIconColorMap[file.type as FileType] ?? cardIconColorMap.other,
                'group-hover:scale-105'
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            {/* File Info */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-sm font-medium text-foreground truncate leading-tight">
                      {file.name}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="start" className="max-w-sm">
                    <p className="text-xs break-all">{file.name}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* File Metadata */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs font-medium">
                  {file.type.toUpperCase()}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {formatFileSize(file.size)}
                </span>
                {status === 'uploading' && (
                  <Badge variant="outline" className="text-xs">
                    Uploading…
                  </Badge>
                )}
                {status === 'uploaded' && file.metadata?.datasetId && (
                  <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-500/40">
                    Synced
                  </Badge>
                )}
                {status === 'uploaded' && file.metadata?.documentId && (
                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-500/40">
                    Ingested
                  </Badge>
                )}
              </div>
              {status === 'error' && (
                <p className="text-xs text-destructive">{errorMessage ?? 'Upload failed'}</p>
              )}
              {status === 'uploaded' && file.metadata?.tableName && (
                <p className="text-xs text-muted-foreground font-mono">
                  Table: {file.metadata.tableName}
                </p>
              )}
              {file.metadata?.documentId && (
                <p className="text-xs text-muted-foreground">
                  Document ID: {file.metadata.documentId}
                </p>
              )}
              {typeof file.metadata?.chunkCount === 'number' && (
                <p className="text-xs text-muted-foreground">
                  {file.metadata.chunkCount} chunks
                  {typeof file.metadata?.embeddingDimension === 'number'
                    ? ` • ${file.metadata.embeddingDimension}d`
                    : ''}
                </p>
              )}
            </div>

            {/* Actions - Show on hover */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                      onClick={() => setShowPreview(true)}
                    >
                      <Eye className="h-4 w-4" />
                      <span className="sr-only">Preview file</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Preview</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onRemove(file.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete file</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Delete</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <FilePreview file={file} open={showPreview} onOpenChange={setShowPreview} />
    </>
  );
}
