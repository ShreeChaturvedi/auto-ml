import { useState } from 'react';
import { Trash2, Eye, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { UploadedFile } from '@/types/file';
import { resolveFileIcon, formatFileSize } from '@/lib/fileUtils';
import { FilePreview } from './FilePreview';
import { cn } from '@/lib/utils';

interface FileRowProps {
  file: UploadedFile;
  onRemove: (fileId: string) => void;
  status?: 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
}

export function FileRow({ file, onRemove, status, errorMessage }: FileRowProps) {
  const [showPreview, setShowPreview] = useState(false);

  const { Icon, colorClass } = resolveFileIcon(file.type);
  const isUploading = status === 'uploading';
  const isError = status === 'error';

  return (
    <>
      <div className="group flex items-center gap-3 py-1.5 px-1 rounded-md hover:bg-accent/30 transition-colors">
        {/* Icon / Spinner / Error — crossfade container */}
        <div className={cn('relative flex-shrink-0 h-5 w-5', colorClass)}>
          {/* File icon — visible when uploaded */}
          <Icon
            className={cn(
              'h-5 w-5 absolute inset-0 transition-opacity duration-300',
              isUploading || isError ? 'opacity-0 pointer-events-none' : 'opacity-100',
            )}
          />
          {/* Spinner — visible while uploading */}
          <Loader2
            className={cn(
              'h-5 w-5 absolute inset-0 text-muted-foreground transition-opacity duration-300',
              isUploading ? 'animate-spin-slow opacity-100' : 'opacity-0 pointer-events-none',
            )}
          />
          {/* Error icon */}
          {isError && (
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertCircle className="h-5 w-5 absolute inset-0 text-destructive" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">{errorMessage ?? 'Upload failed'}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Filename */}
        <p
          title={file.name}
          className={cn(
            'flex-1 min-w-0 text-sm font-medium text-foreground truncate',
            isUploading && 'shimmer-text',
          )}
        >
          {file.name}
        </p>

        {/* File size / Actions — actions overlay size on hover */}
        <div className="relative flex-shrink-0 flex items-center justify-end">
          <span className="text-xs text-muted-foreground font-mono group-hover:opacity-0">
            {formatFileSize(file.size)}
          </span>
          <div className="absolute inset-y-0 right-0 flex items-center gap-1 pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary"
                  onClick={() => setShowPreview(true)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="sr-only">Preview file</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Preview</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => onRemove(file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="sr-only">Delete file</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Delete</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <FilePreview file={file} open={showPreview} onOpenChange={setShowPreview} />
    </>
  );
}
