/**
 * DataTableHeader - Column header rendering with type icon and sort controls
 */

import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Type,
  Hash,
  Calculator,
  ToggleLeft,
  Calendar,
  CircleHelp,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { ColumnDataType } from '@/types/file';
import type { Column } from '@tanstack/react-table';

const TYPE_OPTIONS: ColumnDataType[] = ['string', 'integer', 'float', 'boolean', 'date'];

function getTypeLabel(type: ColumnDataType): string {
  switch (type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Integer';
    case 'float':
      return 'Float';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function TypeIcon({ type, className }: { type: ColumnDataType; className?: string }) {
  switch (type) {
    case 'string':
      return <Type className={className} />;
    case 'integer':
      return <Hash className={className} />;
    case 'float':
      return <Calculator className={className} />;
    case 'boolean':
      return <ToggleLeft className={className} />;
    case 'date':
      return <Calendar className={className} />;
    case 'unknown':
    default:
      return <CircleHelp className={className} />;
  }
}

interface DataTableHeaderCellProps {
  header: string;
  column: Column<Record<string, unknown>, unknown>;
  currentType: ColumnDataType;
  isUpdatingType: boolean;
  onColumnTypeChange?: (columnName: string, nextType: ColumnDataType) => Promise<void> | void;
  handleColumnTypeSelect: (columnName: string, nextType: ColumnDataType) => void;
  typeColorClassName?: string;
}

export function DataTableHeaderCell({
  header,
  column,
  currentType,
  isUpdatingType,
  onColumnTypeChange,
  handleColumnTypeSelect,
  typeColorClassName
}: DataTableHeaderCellProps) {
  const isSorted = column.getIsSorted();
  return (
    <div className="-ml-3 flex items-center gap-1">
      {onColumnTypeChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 bg-transparent transition-colors',
                typeColorClassName ?? 'text-primary',
                'hover:bg-accent/70 focus-visible:bg-accent/70 data-[state=open]:bg-accent/70 active:bg-accent/70'
              )}
              disabled={isUpdatingType}
              title={`Column type: ${getTypeLabel(currentType)}`}
            >
              <TypeIcon type={currentType} className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {TYPE_OPTIONS.map((typeOption) => {
              const selected = currentType === typeOption;
              return (
                <DropdownMenuItem
                  key={`${header}-${typeOption}`}
                  onClick={() => {
                    if (!selected) {
                      void handleColumnTypeSelect(header, typeOption);
                    }
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <TypeIcon
                      type={typeOption}
                      className={cn(
                        'h-3.5 w-3.5',
                        selected
                          ? (typeColorClassName ?? 'text-primary')
                          : 'text-muted-foreground'
                      )}
                    />
                    {getTypeLabel(typeOption)}
                  </span>
                  {selected ? (
                    <Check
                      className={cn('h-3.5 w-3.5', typeColorClassName ?? 'text-primary')}
                    />
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span
          className={cn(typeColorClassName ?? 'text-primary')}
          title={`Column type: ${getTypeLabel(currentType)}`}
        >
          <TypeIcon type={currentType} className="h-3.5 w-3.5" />
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 font-medium"
        onClick={() => column.toggleSorting()}
      >
        {header}
        {isSorted === 'asc' ? (
          <ArrowUp className="ml-2 h-3 w-3" />
        ) : isSorted === 'desc' ? (
          <ArrowDown className="ml-2 h-3 w-3" />
        ) : (
          <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />
        )}
      </Button>
    </div>
  );
}
