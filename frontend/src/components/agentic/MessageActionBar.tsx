import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Copy, Check, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface MessageActionBarProps {
  messageType: 'user' | 'assistant';
  messageContent: string;
  onEdit?: () => void;
  onRevert?: () => void;
  isGenerating?: boolean;
  className?: string;
}

export function MessageActionBar({
  messageType,
  messageContent,
  onEdit,
  onRevert,
  isGenerating,
  className
}: MessageActionBarProps) {
  const [copied, copy] = useCopyToClipboard();

  const handleCopy = () => void copy(messageContent);

  return (
    <div
      className={cn(
        'flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150',
        className
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            disabled={isGenerating}
            aria-label={copied ? 'Copied' : 'Copy message'}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{copied ? 'Copied!' : 'Copy'}</p>
        </TooltipContent>
      </Tooltip>

      {messageType === 'user' && onEdit && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
              disabled={isGenerating}
              aria-label="Edit message"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Edit</p>
          </TooltipContent>
        </Tooltip>
      )}

      {messageType === 'user' && onRevert && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onRevert}
              disabled={isGenerating}
              aria-label="Revert to this point"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Revert to this point</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
