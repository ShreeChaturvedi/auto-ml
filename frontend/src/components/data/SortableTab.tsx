import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, FileText, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveFileIcon } from '@/lib/fileUtils';
import { cn } from '@/lib/utils';

export interface SortableTabProps {
  id: string;
  name: string;
  isActive: boolean;
  fileType?: string;
  queryMode?: 'english' | 'sql';
  queryIconColorClassName?: string;
  themeColorClass?: string;
  themeBorderAccentClass?: string;
  onClose: () => void;
  onClick: () => void;
  /** Ref for the active tab, used to scroll it into view */
  activeTabRef?: React.RefObject<HTMLDivElement | null>;
}

export function SortableTab({
  id,
  name,
  isActive,
  fileType,
  queryMode,
  queryIconColorClassName,
  themeColorClass,
  themeBorderAccentClass,
  onClose,
  onClick,
  activeTabRef
}: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  });

  const setRef = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (isActive && activeTabRef) (activeTabRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  // Get icon based on type
  const getIcon = () => {
    if (queryMode) {
      const colorClass = queryIconColorClassName ?? 'text-muted-foreground';
      return queryMode === 'sql' ? (
        <Database className={cn('h-4 w-4', colorClass)} />
      ) : (
        <FileText className={cn('h-4 w-4', colorClass)} />
      );
    }

    const { Icon, colorClass, usesTheme } = resolveFileIcon(fileType ?? 'other');
    return (
      <Icon
        className={cn('h-4 w-4', !usesTheme && colorClass)}
        {...(usesTheme ? { themeColorClass, isActive } : {})}
      />
    );
  };

  const handleClick = () => {
    if (!isDragging) onClick();
  };

  return (
    <div
      ref={setRef}
      style={style}
      className={cn(
        // `relative` anchors the absolutely-positioned close button.
        // `overflow-hidden + isolate` keep the button clipped/layered within this tab only.
        'group relative isolate flex h-14 cursor-pointer items-center border-b-2 px-4 transition-colors flex-none overflow-hidden',
        isActive
          ? cn(themeBorderAccentClass ?? 'border-primary', 'bg-muted text-foreground')
          : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      {/* Icon and title */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        {getIcon()}
        {/*
         * On hover, a CSS mask fades the text toward the right so it naturally
         * dissolves beneath the close button instead of being hard-clipped.
         * The mask is purely alpha-based and therefore works over any background.
         */}
        <span
          className="text-sm font-medium max-w-[150px] truncate
            group-hover:[mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_44px),transparent_calc(100%_-_32px),transparent_100%)]
            group-hover:[-webkit-mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_44px),transparent_calc(100%_-_32px),transparent_100%)]"
        >
          {name}
        </span>
      </div>

      {/*
       * Close button -- absolutely positioned at the right edge of the tab so
       * it superimposes over the content without pushing the tab wider.
       * `pointer-events-none` while invisible prevents ghost clicks.
       */}
      <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
