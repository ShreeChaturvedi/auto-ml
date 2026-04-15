import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@/components/ui/tooltip';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface CellMoveButtonsProps {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  disabled?: boolean;
}

export function CellMoveButtons({ onMoveUp, onMoveDown, canMoveUp, canMoveDown, disabled }: CellMoveButtonsProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onMoveUp}
            disabled={!canMoveUp || disabled}
            className="h-6 w-6"
            aria-label="Move cell up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Move up</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onMoveDown}
            disabled={!canMoveDown || disabled}
            className="h-6 w-6"
            aria-label="Move cell down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Move down</TooltipContent>
      </Tooltip>
    </>
  );
}
