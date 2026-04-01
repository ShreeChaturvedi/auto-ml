import type { NotebookCell as NotebookCellModel } from '@/types/notebook';

export interface RenderItem {
  cell: NotebookCellModel;
  kind: 'code' | 'markdown';
  nestedUnderMarkdown: boolean;
  isSectionCollapsed: boolean;
  hiddenCodeCount: number;
}

export function getSectionRange(
  cells: NotebookCellModel[],
  markdownIndex: number
): { count: number; end: number } {
  let end = markdownIndex;
  for (let index = markdownIndex + 1; index < cells.length; index += 1) {
    if (cells[index].cellType === 'markdown') {
      break;
    }
    end = index;
  }
  return { count: end - markdownIndex, end };
}

export function buildRenderItems(
  cells: NotebookCellModel[],
  collapsedSections: Record<string, boolean>
): RenderItem[] {
  const items: RenderItem[] = [];
  let activeMarkdownId: string | null = null;
  let activeSectionCollapsed = false;

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell.cellType === 'markdown') {
      const collapsed = Boolean(collapsedSections[cell.cellId]);
      const hiddenCodeCount = collapsed ? getSectionRange(cells, index).count : 0;
      activeMarkdownId = cell.cellId;
      activeSectionCollapsed = collapsed;
      items.push({
        cell,
        kind: 'markdown',
        nestedUnderMarkdown: false,
        isSectionCollapsed: collapsed,
        hiddenCodeCount
      });
      continue;
    }

    if (activeSectionCollapsed) {
      continue;
    }

    items.push({
      cell,
      kind: 'code',
      nestedUnderMarkdown: activeMarkdownId !== null,
      isSectionCollapsed: false,
      hiddenCodeCount: 0
    });
  }

  return items;
}
