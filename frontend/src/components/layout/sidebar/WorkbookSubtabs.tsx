/**
 * WorkbookSubtabs — renders workbooks under Processing/FE/Training phases.
 * Reads from workbookRegistryStore for reactive updates.
 * Reads its own URL params to determine the active workbook, keeping
 * searchParams reactivity isolated from the parent WorkflowPhaseTree.
 */

import { useNavigate, useSearchParams } from 'react-router-dom';
import { Notebook } from 'lucide-react';
import { useWorkbookRegistryStore, type WorkbookPhase } from '@/stores/workbookRegistryStore';
import { getWorkbookParam } from '@/lib/workbookParam';
import { SubtabItem } from './SubtabItem';

interface WorkbookSubtabsProps {
  projectId: string;
  /** Phase key — doubles as both the registry store key and URL path segment. */
  phase: WorkbookPhase;
  /** Whether this phase is the currently active one in the sidebar. */
  isActivePhase: boolean;
}

export function WorkbookSubtabs({
  projectId,
  phase,
  isActivePhase
}: WorkbookSubtabsProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workbooks = useWorkbookRegistryStore((state) => state[phase]);
  const activeWorkbookId = isActivePhase ? getWorkbookParam(searchParams) : undefined;

  const handleClick = (workbookId: string) => {
    navigate(`/project/${projectId}/${phase}?workbook=${workbookId}`);
  };

  if (workbooks.length === 0) {
    return (
      <SubtabItem
        icon={Notebook}
        label="New workbook"
        isActive={false}
        onClick={() => navigate(`/project/${projectId}/${phase}`)}
      />
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
