import { MessageSquare } from 'lucide-react';
import { PlanSelector } from '@/components/layout/PlanSelector';
import { DescriptionInput } from './DescriptionInput';

interface PlanChatToolbarProps {
  chatName: string;
  onChatNameChange: (name: string) => void;
}

export function PlanChatToolbar({ chatName, onChatNameChange }: PlanChatToolbarProps) {
  return (
    <div className="flex h-14 items-center justify-between border-b px-3 shrink-0">
      <div className="min-w-0 flex-1">
        <DescriptionInput
          value={chatName}
          onChange={onChatNameChange}
          icon={MessageSquare}
          placeholder="Untitled chat"
        />
      </div>
      <PlanSelector
        className="h-7 gap-1.5 border-0 bg-transparent shadow-none hover:bg-accent text-sm px-2 shrink-0"
        nameMaxWidthClass="max-w-[160px]"
      />
    </div>
  );
}
