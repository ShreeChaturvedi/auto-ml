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
  useSortable,
  horizontalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { X, FileText, Database, FileCode, FileType, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDataStore } from '@/stores/dataStore';
import { useProjectStore } from '@/stores/projectStore';
import { projectColorClasses } from '@/types/project';
import { CsvIcon } from './CsvIcon';
import { XlsIcon } from './XlsIcon';
import { cn } from '@/lib/utils';
import { useMemo, useState, useEffect, useRef } from 'react';

// Combined tab type
type FileTab = {
  id: string;
  name: string;
  type: 'file' | 'artifact';
  fileType?: string; // For files: 'csv', 'json', 'excel', etc.
  queryMode?: 'english' | 'sql'; // For artifacts
};

interface SortableTabProps {
  id: string;
  name: string;
  isActive: boolean;
  fileType?: string;
  queryMode?: 'english' | 'sql';
  queryIconColorClassName?: string;
  themeColorClass?: string;
  themeBorderAccentClass?: string;
  onClose: () => void;
  onClick: () => void;
  /** Ref for the active tab, used to scroll it into view */
  activeTabRef?: React.RefObject<HTMLDivElement | null>;
}

function SortableTab({
  id,
  name,
  isActive,
  fileType,
  queryMode,
  queryIconColorClassName,
  themeColorClass,
  themeBorderAccentClass,
  onClose,
  onClick,
  activeTabRef
}: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  });

  const setRef = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (isActive && activeTabRef) (activeTabRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  // Get icon based on type
  const getIcon = () => {
    if (queryMode) {
      const colorClass = queryIconColorClassName ?? 'text-muted-foreground';
      return queryMode === 'sql' ? (
        <Database className={cn('h-4 w-4', colorClass)} />
      ) : (
        <FileText className={cn('h-4 w-4', colorClass)} />
      );
    }

    switch (fileType) {
      case 'csv':
        return <CsvIcon className="h-4 w-4" themeColorClass={themeColorClass} isActive={isActive} />;
      case 'excel':
        return <XlsIcon className="h-4 w-4" themeColorClass={themeColorClass} isActive={isActive} />;
      case 'json':
      case 'pdf':
        return <FileText className="h-4 w-4 text-rose-500" />;
      case 'markdown':
        return <FileCode className="h-4 w-4 text-purple-500" />;
      case 'word':
        return <FileType className="h-4 w-4 text-sky-500" />;
      case 'text':
        return <FileText className="h-4 w-4 text-slate-500" />;
      default:
        return <File className="h-4 w-4 text-gray-500" />;
    }
  };

  const handleClick = () => {
    if (!isDragging) onClick();
  };

  return (
    <div
      ref={setRef}
      style={style}
      className={cn(
        // `relative` anchors the absolutely-positioned close button.
        // `overflow-hidden + isolate` keep the button clipped/layered within this tab only.
        'group relative isolate flex h-14 cursor-pointer items-center border-b-2 px-4 transition-colors flex-none overflow-hidden',
        isActive
          ? cn(themeBorderAccentClass ?? 'border-primary', 'bg-muted text-foreground')
          : 'border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      {/* Icon and title */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        {getIcon()}
        {/*
         * On hover, a CSS mask fades the text toward the right so it naturally
         * dissolves beneath the close button instead of being hard-clipped.
         * The mask is purely alpha-based and therefore works over any background.
         */}
        <span
          className="text-sm font-medium max-w-[150px] truncate
            group-hover:[mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_44px),transparent_calc(100%_-_32px),transparent_100%)]
            group-hover:[-webkit-mask-image:linear-gradient(to_right,black_0,black_calc(100%_-_44px),transparent_calc(100%_-_32px),transparent_100%)]"
        >
          {name}
        </span>
      </div>

      {/*
       * Close button — absolutely positioned at the right edge of the tab so
       * it superimposes over the content without pushing the tab wider.
       * `pointer-events-none` while invisible prevents ghost clicks.
       */}
      <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

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

  // Get project theme color
  const { projects } = useProjectStore();
  const activeProject = projects.find((project) => project.id === projectId);
  const themeColorClass = activeProject
    ? projectColorClasses[activeProject.color]?.text
    : undefined;
  const themeBorderAccentClass = activeProject
    ? projectColorClasses[activeProject.color]?.borderAccent
    : undefined;

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
      <div className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <span className="text-sm text-muted-foreground">No files or queries to display</span>
      </div>
    );
  }

  return (
    <div className="h-14 border-b border-border bg-card">
      <div className="flex h-full items-center">
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                    themeColorClass={themeColorClass}
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
