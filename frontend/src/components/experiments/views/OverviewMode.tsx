import { forwardRef } from 'react';
import { ReportPane, type ReportPaneHandle } from '../ReportPane';
import { OverviewDashboard } from '../OverviewDashboard';
import { NlFilterBar } from '../NlFilterBar';

interface OverviewModeProps {
  onCardClick: (sectionSlug: string) => void;
  experimentView: 'overview' | 'leaderboard';
  onViewChange: (val: string) => void;
}

export const OverviewMode = forwardRef<ReportPaneHandle, OverviewModeProps>(
  ({ onCardClick, experimentView, onViewChange }, ref) => {
    return (
      <div className="flex h-full overflow-hidden">
        {/* Left column */}
        <div className="flex flex-col min-w-0 flex-1">
          {/* Left ribbon */}
          <div className="flex h-14 items-center gap-3 border-b px-3 shrink-0">
            <NlFilterBar />
          </div>
          {/* Left content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <OverviewDashboard onCardClick={onCardClick} />
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col min-w-0 w-full lg:w-[55%] lg:min-w-[360px] border-t lg:border-t-0 lg:border-l border-border">
          <ReportPane
            ref={ref}
            experimentView={experimentView}
            onViewChange={onViewChange}
          />
        </div>
      </div>
    );
  }
);

OverviewMode.displayName = 'OverviewMode';
