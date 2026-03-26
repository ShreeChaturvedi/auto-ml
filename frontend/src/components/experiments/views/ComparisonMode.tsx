import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ComparisonView } from '../ComparisonView';

interface ComparisonModeProps {
  comparisonModelCount: number;
  onClearComparison: () => void;
}

export function ComparisonMode({ comparisonModelCount, onClearComparison }: ComparisonModeProps) {
  return (
    <>
      <div className="flex h-14 items-center gap-3 border-b px-3 shrink-0">
        <span className="text-sm font-semibold">Comparing {comparisonModelCount} Models</span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2" onClick={onClearComparison}>
          Clear
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClearComparison} title="Exit comparison">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <ComparisonView />
      </div>
    </>
  );
}
