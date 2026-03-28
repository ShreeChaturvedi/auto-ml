/**
 * WorkbookSubtabs — renders workbooks under Processing/FE/Training phases.
 * Reads from workbookRegistryStore for reactive updates.
 */

import { useNavigate } from 'react-router-dom';
import { Notebook } from 'lucide-react';
import { useWorkbookRegistryStore, type WorkbookPhase } from '@/stores/workbookRegistryStore';
import { SubtabItem } from './SubtabItem';

interface WorkbookSubtabsProps {
  projectId: string;
  /** Phase key — doubles as both the registry store key and URL path segment. */
  phase: WorkbookPhase;
  activeWorkbookId?: string;
}

export function WorkbookSubtabs({
  projectId,
  phase,
  activeWorkbookId
}: WorkbookSubtabsProps) {
  const navigate = useNavigate();
  const workbooks = useWorkbookRegistryStore((state) => state[phase]);

  const handleClick = (workbookId: string) => {
    navigate(`/project/${projectId}/${phase}?workbook=${workbookId}`);
  };

  if (workbooks.length === 0) {
    return (
      <div
        className="px-3 py-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground hover:underline underline-offset-2 decoration-muted-foreground/50"
        onClick={() => navigate(`/project/${projectId}/${phase}`)}
      >
        New workbook
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {workbooks.map((wb) => (
        <SubtabItem
          key={wb.id}
          icon={Notebook}
          label={wb.name}
          isActive={wb.id === activeWorkbookId}

          onClick={() => handleClick(wb.id)}
        />
      ))}
    </div>
  );
}
