/**
 * usePlanEditor - Manages plan draft editing state for the planning chat.
 *
 * Extracted from usePlanningChat to isolate the plan-editing UI concern
 * (start edit, cancel edit, save edit, track drafts & active editing ID).
 */

import { useCallback, useState } from 'react';
import type { ChatMessage } from '@/types/llmUi';

export interface UsePlanEditorReturn {
  editingPlanId: string | null;
  setEditingPlanId: React.Dispatch<React.SetStateAction<string | null>>;
  planDrafts: Record<string, string>;
  setPlanDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleStartPlanEdit: (planId: string, currentContent: string) => void;
  handleCancelPlanEdit: (planId: string, currentContent: string) => void;
  handleSavePlanEdit: (
    planId: string,
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  ) => void;
}

export function usePlanEditor(): UsePlanEditorReturn {
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planDrafts, setPlanDrafts] = useState<Record<string, string>>({});

  const handleStartPlanEdit = useCallback((planId: string, currentContent: string) => {
    setEditingPlanId(planId);
    setPlanDrafts((prev) => ({ ...prev, [planId]: prev[planId] ?? currentContent }));
  }, []);

  const handleCancelPlanEdit = useCallback((planId: string, currentContent: string) => {
    setEditingPlanId(null);
    setPlanDrafts((prev) => ({ ...prev, [planId]: currentContent }));
  }, []);

  const handleSavePlanEdit = useCallback(
    (planId: string, setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>) => {
      const draft = planDrafts[planId];
      if (!draft?.trim()) {
        return;
      }

      const nextContent = draft.trim();
      setMessages((prev) =>
        prev.map((message) =>
          message.type === 'plan' && message.id === planId
            ? { ...message, content: nextContent }
            : message
        )
      );
      setPlanDrafts((prev) => ({ ...prev, [planId]: nextContent }));
      setEditingPlanId(null);
    },
    [planDrafts]
  );

  return {
    editingPlanId,
    setEditingPlanId,
    planDrafts,
    setPlanDrafts,
    handleStartPlanEdit,
    handleCancelPlanEdit,
    handleSavePlanEdit,
  };
}
