import type { ReactNode } from 'react';
import { ClipboardList, MessageSquare, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useShallow } from 'zustand/react/shallow';
import { useProjectStore } from '@/stores/projectStore';
import { usePlanChatStore, selectInProgressChats } from '@/stores/planChatStore';
import { useProjectPlans, selectActivePlanChatId } from '@/hooks/useProjectPlans';
import { cn } from '@/lib/utils';

interface PlanSelectorProps {
  className?: string;
  menuAlign?: 'start' | 'center' | 'end';
  nameMaxWidthClass?: string;
  menuContentClassName?: string;
  iconSlot?: ReactNode;
}

export function PlanSelector({
  className,
  menuAlign = 'end',
  nameMaxWidthClass,
  menuContentClassName,
  iconSlot
}: PlanSelectorProps) {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const activeProjectId = useProjectStore((state) => state.activeProjectId);

  const effectiveProjectId = projectId || activeProjectId;

  const { plans, selectedPlanId, handleOpenPlan, handleCreateNewPlan } = useProjectPlans(
    effectiveProjectId ?? ''
  );

  const isInitialized = usePlanChatStore((s) => s.isInitialized);
  const inProgressChats = usePlanChatStore(useShallow((s) => selectInProgressChats(s, effectiveProjectId)));

  const activePlanChatId = useProjectStore(selectActivePlanChatId(effectiveProjectId));

  if (!isInitialized || !effectiveProjectId || (plans.length === 0 && inProgressChats.length === 0)) {
    return null;
  }

  const activeChat = activePlanChatId ? inProgressChats.find((c) => c.id === activePlanChatId) : null;
  const activePlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  // Show active chat name if a chat is selected, otherwise show plan name
  const triggerLabel = activeChat?.name ?? activePlan?.name ?? 'Plans';
  const triggerIcon = activeChat
    ? <MessageSquare className="h-4 w-4 text-muted-foreground" />
    : <ClipboardList className="h-4 w-4 text-muted-foreground" />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-2 border-border bg-background shadow-sm transition-colors',
            className
          )}
        >
          {iconSlot ?? triggerIcon}
          <span className={cn('truncate text-left', nameMaxWidthClass ?? 'max-w-[150px]')}>
            {triggerLabel}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={menuAlign}
        className={cn('w-[240px]', menuContentClassName)}
      >
        {inProgressChats.length > 0 && (
          <>
            {inProgressChats.map((chat) => (
              <DropdownMenuItem
                key={chat.id}
                onClick={() => navigate(`/project/${effectiveProjectId}/upload?chatId=${chat.id}`)}
                className={cn(
                  "cursor-pointer",
                  activePlanChatId === chat.id && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <MessageSquare className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="truncate flex-1">{chat.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">Draft</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {plans.map((plan) => (
          <DropdownMenuItem
            key={plan.id}
            onClick={() => handleOpenPlan(plan.id)}
            className={cn(
              "cursor-pointer",
              !activePlanChatId && plan.id === selectedPlanId && "bg-accent text-accent-foreground font-medium"
            )}
          >
            <ClipboardList className="h-4 w-4 mr-2 opacity-70" />
            <span className="truncate flex-1">{plan.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateNewPlan} className="cursor-pointer text-primary">
          <Plus className="h-4 w-4 mr-2" />
          New Plan
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
