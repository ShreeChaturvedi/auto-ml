import { useEffect } from 'react';

import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';
import type { WorkflowPlaceholders } from '@/lib/api/query';

type Phase = keyof WorkflowPlaceholders;

export function useWorkflowPlaceholders(
  projectId: string | undefined,
  phase: Phase
): string[] {
  const fetchSuggestions = useNlSuggestionStore((s) => s.fetchProjectSuggestions);
  const placeholders = useNlSuggestionStore(
    (s) => s.byProject[projectId ?? '']?.workflowPlaceholders?.[phase] ?? []
  );

  useEffect(() => {
    if (projectId) void fetchSuggestions(projectId);
  }, [projectId, fetchSuggestions]);

  return placeholders;
}
