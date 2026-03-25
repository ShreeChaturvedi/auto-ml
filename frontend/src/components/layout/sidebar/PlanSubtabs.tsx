/**
 * PlanSubtabs — renders plan items and in-progress chats under Data Upload phase.
 */

import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, MessageSquare } from 'lucide-react';
import { useProjectPlans } from '@/hooks/useProjectPlans';
import { usePlanChatStore } from '@/stores/planChatStore';
import { SubtabItem } from './SubtabItem';

interface PlanSubtabsProps {
  projectId: string;
  themeColorClass: string;
}

export function PlanSubtabs({ projectId, themeColorClass }: PlanSubtabsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { plans, selectedPlanId, handleOpenPlan } = useProjectPlans(projectId);
  const inProgressChats = usePlanChatStore((s) =>
    Object.values(s.chats)
      .filter((c) => c.projectId === projectId && c.status === 'in_progress')
      .sort((a, b) => b.updatedAt - a.updatedAt)
  );
  const isOnUpload = location.pathname.endsWith('/upload');
  const activeChatId = new URLSearchParams(location.search).get('chatId');

  if (plans.length === 0 && inProgressChats.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {inProgressChats.map((chat) => (
        <SubtabItem
          key={chat.id}
          icon={MessageSquare}
          label={chat.name}
          isActive={isOnUpload && activeChatId === chat.id}
          themeColorClass={themeColorClass}
          onClick={() => navigate(`/project/${projectId}/upload?chatId=${chat.id}`)}
          actionSlot={
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
          }
        />
      ))}
      {plans.map((plan) => (
        <SubtabItem
          key={plan.id}
          icon={ClipboardList}
          label={plan.name}
          isActive={isOnUpload && plan.id === selectedPlanId}
          themeColorClass={themeColorClass}
          onClick={() => handleOpenPlan(plan.id)}
        />
      ))}
    </div>
  );
}
