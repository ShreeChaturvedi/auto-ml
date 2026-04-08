/**
 * PlanSubtabs — renders saved plans + separator + in-progress plan chats under Data Upload phase.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Download, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { RenameTabDialog } from '@/components/preprocessing/PreprocessingDialogs';
import { useProjectPlans } from '@/hooks/useProjectPlans';
import { useProjectStore } from '@/stores/projectStore';
import { usePlanChatStore, selectInProgressChats } from '@/stores/planChatStore';
import { downloadMarkdownFile } from '@/lib/exportMarkdown';
import { SidebarSubtabSectionDivider } from './SidebarSubtabSectionDivider';
import { SubtabItem } from './SubtabItem';
import { SidebarSubtabActionMenu } from './SidebarSubtabActionMenu';
import { useSidebarDeleteConfirm } from './useSidebarDeleteConfirm';

interface PlanSubtabsProps {
  projectId: string;
}

export function PlanSubtabs({ projectId }: PlanSubtabsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { plans, selectedPlanId, handleOpenPlan, handleRenamePlan, handleDeletePlan } = useProjectPlans(projectId);
  const isInitialized = usePlanChatStore((s) => s.isInitialized);
  const inProgressChats = usePlanChatStore(useShallow((s) => selectInProgressChats(s, projectId)));
  const renameChat = usePlanChatStore((s) => s.renameChat);
  const deleteChat = usePlanChatStore((s) => s.deleteChat);
  const isOnUpload = location.pathname.endsWith('/upload');

  // Read activePlanChatId from project metadata (not URL params — those are transient)
  const activePlanChatId = useProjectStore((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    const val = (project?.metadata as Record<string, unknown> | undefined)?.activePlanChatId;
    return typeof val === 'string' && val.length > 0 ? val : null;
  });

  const { requestDelete, confirmDialog } = useSidebarDeleteConfirm();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameKind, setRenameKind] = useState<'chat' | 'plan'>('chat');

  if (!isInitialized) return null;
  if (plans.length === 0 && inProgressChats.length === 0) return null;

  const openRename = (id: string, currentName: string, kind: 'chat' | 'plan') => {
    setRenamingId(id);
    setRenameValue(currentName);
    setRenameKind(kind);
  };

  const handleRenameConfirm = () => {
    if (!renamingId || !renameValue.trim()) return;
    if (renameKind === 'chat') {
      void renameChat(renamingId, renameValue.trim());
    } else {
      handleRenamePlan(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <>
      <div className="space-y-0.5">
        {plans.map((plan) => (
          <SubtabItem
            key={plan.id}
            icon={ClipboardList}
            label={plan.name}
            isActive={isOnUpload && plan.id === selectedPlanId && !activePlanChatId}
            onClick={() => handleOpenPlan(plan.id)}
            actionSlot={
              <SidebarSubtabActionMenu ariaLabel="Plan options">
                <DropdownMenuItem onClick={() => openRename(plan.id, plan.name, 'plan')}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadMarkdownFile(plan.name, plan.content)}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    requestDelete({
                      title: 'Delete plan?',
                      description: `Permanently remove "${plan.name}". This cannot be undone.`,
                      onConfirm: () => handleDeletePlan(plan.id),
                    })
                  }
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </SidebarSubtabActionMenu>
            }
          />
        ))}

        {plans.length > 0 && inProgressChats.length > 0 && <SidebarSubtabSectionDivider />}

        {inProgressChats.map((chat) => (
          <SubtabItem
            key={chat.id}
            icon={MessageSquare}
            label={chat.name}
            isActive={isOnUpload && activePlanChatId === chat.id}
            onClick={() => navigate(`/project/${projectId}/upload?chatId=${chat.id}`)}
            actionSlot={
              <SidebarSubtabActionMenu ariaLabel="Chat options">
                <DropdownMenuItem onClick={() => openRename(chat.id, chat.name, 'chat')}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    requestDelete({
                      title: 'Delete chat?',
                      description: `Permanently remove "${chat.name}". This cannot be undone.`,
                      onConfirm: () => void deleteChat(chat.id),
                    })
                  }
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </SidebarSubtabActionMenu>
            }
          />
        ))}
      </div>

      {confirmDialog}

      <RenameTabDialog
        open={!!renamingId}
        onOpenChange={(open) => { if (!open) setRenamingId(null); }}
        value={renameValue}
        onValueChange={setRenameValue}
        onSave={handleRenameConfirm}
        title={renameKind === 'chat' ? 'Rename chat' : 'Rename plan'}
        description={renameKind === 'chat' ? 'Enter a new name for this chat.' : 'Enter a new name for this plan.'}
        placeholder={renameKind === 'chat' ? 'Chat name' : 'Plan name'}
      />
    </>
  );
}
