/**
 * FileTabBar - Horizontal tab bar for files and query artifacts with drag-drop
 *
 * Features:
 * - Drag-and-drop tab reordering with @dnd-kit
 * - Blue underline for active tab
 * - Tab close buttons
 * - Shows both uploaded files and query results as tabs
 * - Handles file type icons (CSV, JSON, etc.) and query mode indicators
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
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { useMemo, useState, useEffect, useRef } from 'react';
import { SortableTab } from './SortableTab';

// Combined tab type
type FileTab = {
  id: string;
  name: string;
  type: 'file' | 'artifact';
  fileType?: string; // For files: 'csv', 'json', 'excel', etc.
  queryMode?: 'english' | 'sql'; // For artifacts
};

interface FileTabBarProps {
  projectId: string;
  queryIconColorClassName?: string;
}

export function FileTabBar({ projectId, queryIconColorClassName }: FileTabBarProps) {
  const allFiles = useDataStore((state) => state.files);
  const allArtifacts = useDataStore((state) => state.queryArtifacts);
  const activeFileTabId = useDataStore((state) => state.activeFileTabId);
  const setActiveFileTab = useDataStore((state) => state.setActiveFileTab);
  const openFileTabs = useDataStore((state) => state.openFileTabs);
  const closeFileTab = useDataStore((state) => state.closeFileTab);
  const removeArtifact = useDataStore((state) => state.removeArtifact);

  const { projects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === projectId);
  const themeBorderAccentClass = activeProject ? 'border-accent-fill' : undefined;

  // Get files and artifacts for this project
  const files = useMemo(
    () => allFiles.filter((f) => f.projectId === projectId),
    [allFiles, projectId]
  );

  const openFiles = useMemo(
    () =>
      openFileTabs
        .map((tabId) => files.find((file) => file.id === tabId))
        .filter((file): file is NonNullable<typeof file> => Boolean(file)),
    [openFileTabs, files]
  );

  const artifacts = useMemo(
    () => allArtifacts.filter((a) => a.projectId === projectId),
    [allArtifacts, projectId]
  );

  // Combine files and artifacts into tabs
  const baseTabs: FileTab[] = useMemo(() => {
    const fileTabs: FileTab[] = openFiles.map((file) => ({
      id: file.id,
      name: file.name,
      type: 'file' as const,
      fileType: file.type
    }));

    const artifactTabs: FileTab[] = artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      type: 'artifact' as const,
      queryMode: artifact.mode
    }));

    return [...fileTabs, ...artifactTabs];
  }, [openFiles, artifacts]);

  // Maintain tab order state for drag-drop persistence
  const [orderedTabs, setOrderedTabs] = useState<FileTab[]>(baseTabs);

  const activeTabRef = useRef<HTMLDivElement | null>(null);

  // Scroll active tab into view when it changes (e.g. new query opened off-screen)
  useEffect(() => {
    if (!activeFileTabId) return;
    const tabExists = orderedTabs.some((t) => t.id === activeFileTabId);
    if (!tabExists) return;
    const el = activeTabRef.current;
    if (!el) return;
    const rafId = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(rafId);
  }, [activeFileTabId, orderedTabs]);

  // Update ordered tabs when base tabs change
  useEffect(() => {
    setOrderedTabs((prevOrdered) => {
      // Preserve order for existing tabs, add new tabs at the end
      const existingIds = new Set(baseTabs.map((t) => t.id));
      const prevIds = new Set(prevOrdered.map((t) => t.id));

      // Keep tabs that still exist, in their current order
      const stillExisting = prevOrdered.filter((t) => existingIds.has(t.id));

      // Add new tabs
      const newTabs = baseTabs.filter((t) => !prevIds.has(t.id));

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
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleTabClick = (tab: FileTab) => {
    setActiveFileTab(tab.id, tab.type);
  };

  const handleCloseTab = (tab: FileTab) => {
    if (tab.type === 'file') {
      closeFileTab(tab.id);
      return;
    }

    removeArtifact(tab.id);

    if (tab.id === activeFileTabId) {
      const remainingTabs = orderedTabs.filter((t) => t.id !== tab.id);
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
              modifiers={[restrictToHorizontalAxis]}
            >
              <SortableContext items={orderedTabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
                {orderedTabs.map((tab) => (
                  <SortableTab
                    key={tab.id}
                    id={tab.id}
                    name={tab.name}
                    isActive={tab.id === activeFileTabId}
                    fileType={tab.fileType}
                    queryMode={tab.queryMode}
                    queryIconColorClassName={queryIconColorClassName}
                    themeBorderAccentClass={themeBorderAccentClass}
                    onClose={() => handleCloseTab(tab)}
                    onClick={() => handleTabClick(tab)}
                    activeTabRef={activeTabRef}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
}
