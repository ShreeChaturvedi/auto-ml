import { memo, useState } from 'react';
import { Code, Type } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NotebookCellType } from '@/types/notebook';

interface NotebookInsertCellRowProps {
  position: number;
  onInsert: (position: number, cellType: NotebookCellType) => void;
  disabled?: boolean;
  className?: string;
}

export const NotebookInsertCellRow = memo(function NotebookInsertCellRow({
  position,
  onInsert,
  disabled,
  className
}: NotebookInsertCellRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn('group relative flex h-6 items-center justify-center', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors duration-150',
          isHovered ? 'bg-primary/40' : 'bg-transparent'
        )}
      />

      <div
        className={cn(
          'relative z-10 flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5 shadow-sm transition-opacity duration-150 dark:shadow-none',
          isHovered ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-5 gap-1 px-1.5 text-[10px] hover:bg-primary/10"
          onClick={() => onInsert(position, 'code')}
          disabled={disabled}
        >
          <Code className="h-3 w-3" />
          Code
        </Button>
        <div className="h-3 w-px bg-border" />
        <Button
          variant="ghost"
          size="sm"
          className="h-5 gap-1 px-1.5 text-[10px] hover:bg-primary/10"
          onClick={() => onInsert(position, 'markdown')}
          disabled={disabled}
        >
          <Type className="h-3 w-3" />
          Text
        </Button>
      </div>
    </div>
  );
});
