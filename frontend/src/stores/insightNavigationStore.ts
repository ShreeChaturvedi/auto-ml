/**
 * Insight Navigation Store — cross-phase bridge for EDA → Notebook navigation.
 *
 * When a user clicks a "notebook" insight action in the Data Viewer, the
 * pending context is stashed here and consumed by the Notebook page on mount.
 */

import { create } from 'zustand';
import type { InsightCodegenContext } from '@/lib/api/insightCodegen';

interface InsightNavigationState {
  pendingInsightContext: InsightCodegenContext | null;
  setPendingInsightContext: (ctx: InsightCodegenContext | null) => void;
  clearPendingContext: () => void;
}

export const useInsightNavigationStore = create<InsightNavigationState>((set) => ({
  pendingInsightContext: null,
  setPendingInsightContext: (ctx) => set({ pendingInsightContext: ctx }),
  clearPendingContext: () => set({ pendingInsightContext: null }),
}));
