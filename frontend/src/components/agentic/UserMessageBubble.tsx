import type { ChatMessage } from '@/types/llmUi';
import { MessageActionBar } from './MessageActionBar';
import { cn } from '@/lib/utils';

interface UserMessageBubbleProps {
  message: ChatMessage & { type: 'user' };
  isEditing?: boolean;
  isDimmed?: boolean;
  onEdit?: () => void;
  onRevert?: () => void;
  isGenerating?: boolean;
}

export function UserMessageBubble({
  message,
  isEditing,
  isDimmed,
  onEdit,
  onRevert,
  isGenerating
}: UserMessageBubbleProps) {

  return (
    <div
      data-message-id={message.id}
      className={cn(
        'flex flex-col items-end group',
        isDimmed && 'opacity-40',
        isEditing && 'opacity-60'
      )}
    >
      <div
        className={cn(
          'rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap',
          isEditing && 'border border-dashed border-primary/40'
        )}
      >
        {message.content}
      </div>
      {isEditing ? (
        <span className="mt-1 text-[10px] text-muted-foreground">Editing...</span>
      ) : (
        <MessageActionBar
          messageType="user"
          messageContent={message.content}
          onEdit={onEdit}
          onRevert={onRevert}
          isGenerating={isGenerating}
          className="mt-1"
        />
      )}
    </div>
  );
}
