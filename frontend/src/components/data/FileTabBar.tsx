/**
 * FileTabBar - Horizontal tab bar for files, query artifacts, and standalone
 * notebooks with drag-drop reordering.
 *
 * Features:
 * - Drag-and-drop tab reordering with @dnd-kit
 * - Project-themed active underline
 * - Tab close buttons per tab type
 * - Handles file type icons (CSV, JSON, etc.), query mode indicators,
 *   and notebook icons
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import { restrictToHorizontalAxis, restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { useNotebookStore } from '@/stores/notebookStore';
import { useMemo, useState, useEffect, useRef } from 'react';
import { SortableTab } from './SortableTab';
import type { TabType } from '@/types/dataViewer';

const DND_MODIFIERS = [restrictToHorizontalAxis, restrictToFirstScrollableAncestor];

// Unified tab descriptor used by the sortable renderer. `uniqueKey` is the
// dnd-kit id and must be unique across all tab types (ids alone can collide
// if a file and a notebook happen to share an id).
type FileTab = {
  uniqueKey: string;
  id: string;
  name: string;
  type: TabType;
  fileType?: string; // For files: 'csv', 'json', 'excel', etc.
  queryMode?: 'english' | 'sql'; // For artifacts
};

function tabKey(type: TabType, id: string) {
  return `${type}:${id}`;
}

interface FileTabBarProps {
  projectId: string;
  queryIconColorClassName?: string;
}

export function FileTabBar({ projectId, queryIconColorClassName }: FileTabBarProps) {
  const allFiles = useDataStore((state) => state.files);
  const allArtifacts = useDataStore((state) => state.queryArtifacts);
  const activeFileTabId = useDataStore((state) => state.activeFileTabId);
  const fileTabType = useDataStore((state) => state.fileTabType);
  const setActiveFileTab = useDataStore((state) => state.setActiveFileTab);
  const openFileTabs = useDataStore((state) => state.openFileTabs);
  const closeFileTab = useDataStore((state) => state.closeFileTab);
  const removeArtifact = useDataStore((state) => state.removeArtifact);
  // Subscribe to notebooks so rename/delete re-renders the bar.
  const notebooks = useNotebookStore((state) => state.notebooks);

  const { projects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === projectId);
  const themeBorderAccentClass = activeProject ? 'border-accent-fill' : undefined;

  const baseTabs: FileTab[] = useMemo(() => {
    const projectFiles = allFiles.filter((f) => f.projectId === projectId);
    const projectArtifacts = allArtifacts.filter((a) => a.projectId === projectId);

    const tabs: FileTab[] = [];
    for (const tab of openFileTabs) {
      if (tab.type === 'file') {
        const file = projectFiles.find((f) => f.id === tab.id);
        if (!file) continue;
        tabs.push({
          uniqueKey: tabKey('file', file.id),
          id: file.id,
          name: file.name,
          type: 'file',
          fileType: file.type
        });
        continue;
      }
      if (tab.type === 'notebook') {
        const notebook = notebooks.find((n) => n.notebookId === tab.id);
        if (!notebook) continue;
        tabs.push({
          uniqueKey: tabKey('notebook', notebook.notebookId),
          id: notebook.notebookId,
          name: notebook.name,
          type: 'notebook'
        });
        continue;
      }
      // Artifact tabs opened via openFileTabs (legacy path)
      if (tab.type === 'artifact') {
        const artifact = projectArtifacts.find((a) => a.id === tab.id);
        if (!artifact) continue;
        tabs.push({
          uniqueKey: tabKey('artifact', artifact.id),
          id: artifact.id,
          name: artifact.name,
          type: 'artifact',
          queryMode: artifact.mode
        });
      }
    }

    // Append any project artifacts that aren't already in the openFileTabs set
    // (artifactSlice creates artifacts without tracking them in openFileTabs).
    const trackedArtifactKeys = new Set(
      tabs.filter((t) => t.type === 'artifact').map((t) => t.uniqueKey)
    );
    for (const artifact of projectArtifacts) {
      const key = tabKey('artifact', artifact.id);
      if (trackedArtifactKeys.has(key)) continue;
      tabs.push({
        uniqueKey: key,
        id: artifact.id,
        name: artifact.name,
        type: 'artifact',
        queryMode: artifact.mode
      });
    }

    return tabs;
  }, [allFiles, allArtifacts, notebooks, openFileTabs, projectId]);

  // Maintain tab order state for drag-drop persistence
  const [orderedTabs, setOrderedTabs] = useState<FileTab[]>(baseTabs);

  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const activeTabUniqueKey =
    activeFileTabId && fileTabType && fileTabType !== 'plan'
      ? tabKey(fileTabType as TabType, activeFileTabId)
      : null;

  // Scroll active tab into view when it changes (e.g. new query opened off-screen)
  useEffect(() => {
    if (!activeTabUniqueKey) return;
    const tabExists = orderedTabs.some((t) => t.uniqueKey === activeTabUniqueKey);
    if (!tabExists) return;
    const el = activeTabRef.current;
    if (!el) return;
    const rafId = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeTabUniqueKey, orderedTabs]);

  // Update ordered tabs when base tabs change
  useEffect(() => {
    setOrderedTabs((prevOrdered) => {
      const existingKeys = new Set(baseTabs.map((t) => t.uniqueKey));
      const prevKeys = new Set(prevOrdered.map((t) => t.uniqueKey));
      // Re-index base tabs by uniqueKey so renames refresh the displayed name.
      const baseTabsByKey = new Map(baseTabs.map((t) => [t.uniqueKey, t]));

      const stillExisting = prevOrdered
        .filter((t) => existingKeys.has(t.uniqueKey))
        .map((t) => baseTabsByKey.get(t.uniqueKey) ?? t);
      const newTabs = baseTabs.filter((t) => !prevKeys.has(t.uniqueKey));

      return [...stillExisting, ...newTabs];
    });
  }, [baseTabs]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedTabs((items) => {
        const oldIndex = items.findIndex((item) => item.uniqueKey === active.id);
        const newIndex = items.findIndex((item) => item.uniqueKey === over.id);
        if (oldIndex === -1 || newIndex === -1) return items;
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleTabClick = (tab: FileTab) => {
    setActiveFileTab(tab.id, tab.type);
  };

  const handleCloseTab = (tab: FileTab) => {
    if (tab.type === 'file' || tab.type === 'notebook') {
      closeFileTab(tab.id, tab.type);
      return;
    }

    // Artifact close: remove the artifact and advance selection locally.
    removeArtifact(tab.id);

    const isActive = tab.id === activeFileTabId && fileTabType === 'artifact';
    if (isActive) {
      const remainingTabs = orderedTabs.filter((t) => t.uniqueKey !== tab.uniqueKey);
      if (remainingTabs.length > 0) {
        const nextTab = remainingTabs[0];
        setActiveFileTab(nextTab.id, nextTab.type);
      } else {
        setActiveFileTab(null, null);
      }
    }
  };

  if (orderedTabs.length === 0) {
    return (
      <div className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 dark:shadow-none">
        <span className="text-sm text-muted-foreground">No files or queries to display</span>
      </div>
    );
  }

  return (
    <div className="h-14 border-b border-border bg-card dark:shadow-none">
      <div className="flex h-full items-center">
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-hide">
          <div className="flex h-full items-center">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={DND_MODIFIERS}
            >
              <SortableContext
                items={orderedTabs.map((t) => t.uniqueKey)}
                strategy={horizontalListSortingStrategy}
              >
                {orderedTabs.map((tab) => {
                  const isActive = tab.uniqueKey === activeTabUniqueKey;
                  return (
                    <SortableTab
                      key={tab.uniqueKey}
                      id={tab.uniqueKey}
                      name={tab.name}
                      isActive={isActive}
                      type={tab.type}
                      fileType={tab.fileType}
                      queryMode={tab.queryMode}
                      queryIconColorClassName={queryIconColorClassName}
                      themeBorderAccentClass={themeBorderAccentClass}
                      onClose={() => handleCloseTab(tab)}
                      onClick={() => handleTabClick(tab)}
                      activeTabRef={activeTabRef}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
}
