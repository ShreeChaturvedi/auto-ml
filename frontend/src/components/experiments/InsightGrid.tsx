import type { ModelRecord } from '@/types/model';
import type { EvaluationResult } from '@/types/experiments';
import { cn } from '@/lib/utils';
import { useKpiMetrics } from './hooks/useKpiMetrics';
import { buildKpiCards } from './utils/buildKpiCards';

/* ── Section link map ─────────────────────────────────────── */

const CARD_SECTION_MAP: Record<string, string> = {
  'best-score': 'report-executive-summary',
  'score-trend': 'report-model-performance-rankings',
  'models-trained': 'report-model-performance-rankings',
  'avg-training-time': 'report-training-efficiency',
  'overfit-risk': 'report-potential-issues',
  'algo-diversity': 'report-metric-by-metric-analysis',
  'metric-spread': 'report-potential-issues',
  convergence: 'report-recommendations',
};

/* ── Single card cell ─────────────────────────────────────── */

interface CardDef {
  id: string;
  label: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  viz: React.ReactNode;
}

function KpiCell({
  card,
  index,
  onClick,
}: {
  card: CardDef;
  index: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col text-left p-3.5 gap-0.5 overflow-hidden',
        'border-b border-r border-border',
        '[&:nth-child(even)]:border-r-0',
        '[&:nth-last-child(-n+2)]:border-b-0',
        'transition-colors duration-150 hover:bg-muted/20',
        'card-enter focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70 leading-none">
        {card.label}
      </span>
      <span className="text-xl font-semibold text-foreground tabular-nums leading-tight">
        {card.primary}
      </span>
      <span className="text-xs text-muted-foreground/60 leading-snug truncate w-full">
        {card.secondary}
      </span>
      <div className="mt-auto pt-1.5 w-full">
        {card.viz}
      </div>
    </button>
  );
}

/* ── Props ────────────────────────────────────────────────── */

interface InsightGridProps {
  models: ModelRecord[];
  evaluations: Record<string, EvaluationResult | null>;
  onCardClick?: (sectionSlug: string) => void;
}

/* ── Main component ───────────────────────────────────────── */

export function InsightGrid({ models, evaluations, onCardClick }: InsightGridProps) {
  const kpis = useKpiMetrics(models, evaluations);
  const cards = buildKpiCards(kpis);

  if (models.length === 0) return null;

  return (
    <div className="grid grid-cols-2 rounded-xl border border-border shadow-sm dark:shadow-none overflow-hidden">
      {cards.map((card, i) => (
        <KpiCell
          key={card.id}
          card={card}
          index={i}
          onClick={onCardClick ? () => onCardClick(CARD_SECTION_MAP[card.id]) : undefined}
        />
      ))}
    </div>
  );
}
