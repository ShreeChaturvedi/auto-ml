import { create } from 'zustand';

const EMPTY_SET = new Set<string>();

interface HighlightState {
  highlightedCellIds: Set<string>;
  setHighlightedCells: (ids: string[]) => void;
  clearHighlights: () => void;
}

export const useHighlightStore = create<HighlightState>((set) => ({
  highlightedCellIds: EMPTY_SET,
  setHighlightedCells: (ids) => set({ highlightedCellIds: new Set(ids) }),
  clearHighlights: () => set({ highlightedCellIds: EMPTY_SET })
}));
