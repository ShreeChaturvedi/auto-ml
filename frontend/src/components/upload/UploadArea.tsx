/**
 * UploadArea - Main upload interface with split-column layout
 *
 * Layout Structure:
 * ┌─────────────────────────────────────────────────────┐
 * │  Project Header (icon, title, description)          │
 * ├─────────────────────┬───────────────────────────────┤
 * │  Custom Instructions│  Data Upload Panel            │
 * │  (Left Column)      │  (Right Column)               │
 * │                     │                               │
 * │  - Domain context   │  - Drag & drop area           │
 * │  - Instructions     │  - File cards                 │
 * │  - Business goals   │  - Proceed button             │
 * └─────────────────────┴───────────────────────────────┘
 *
 * Features:
 * - Professional project header with colored icon
 * - Split-column layout for instructions and upload
 * - Responsive design (stacks on mobile)
 * - Proper overflow handling for long content
 * - Clean, polished aesthetic
 *
 * Design Philosophy:
 * - Establish project context first (header)
 * - Instructions on left guide the user
 * - Upload actions on right for natural flow
 * - Everything visible without excessive scrolling
 */

import { useEffect } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useDataStore } from '@/stores/dataStore';
import { ProjectHeader } from './ProjectHeader';
import { CustomInstructions } from './CustomInstructions';
import { DataUploadPanel } from './DataUploadPanel';
import { AlertCircle } from 'lucide-react';

export function UploadArea() {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const projects = useProjectStore((state) => state.projects);
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : undefined;
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);

  // Hydrate persisted datasets on mount
  useEffect(() => {
    if (activeProjectId) {
      void hydrateFromBackend(activeProjectId);
    }
  }, [activeProjectId, hydrateFromBackend]);

  // Safety check - should not happen in normal flow
  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center space-y-3 max-w-md">
          <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">No Active Project</h3>
            <p className="text-sm text-muted-foreground">
              Please select or create a project from the sidebar to upload data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Project Header - Fixed at top */}
      <ProjectHeader project={activeProject} />

      {/* Split Column Layout - Fills remaining space */}
      {/* On mobile: stack vertically with full width for each section */}
      {/* On desktop (lg+): side-by-side with divider */}
      <div className="flex-1 flex flex-col lg:flex-row lg:divide-x divide-border overflow-hidden">
        {/* Left Column: Custom Instructions */}
        <div className="flex flex-col min-h-0 p-4 sm:p-6 lg:pr-4 lg:w-1/2 border-b lg:border-b-0">
          <CustomInstructions projectId={activeProject.id} />
        </div>

        {/* Right Column: Data Upload */}
        <div className="flex flex-col min-h-0 p-4 sm:p-6 lg:pl-4 lg:w-1/2">
          <DataUploadPanel projectId={activeProject.id} />
        </div>
      </div>
    </div>
  );
}