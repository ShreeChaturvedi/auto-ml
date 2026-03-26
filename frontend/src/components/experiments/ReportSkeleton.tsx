const SECTIONS = [
  'Executive Summary',
  'Model Performance Rankings',
  'Metric-by-Metric Analysis',
  'Training Efficiency',
  'Recommendations',
  'Potential Issues',
];

const BAR_WIDTHS = ['w-full', 'w-3/4', 'w-5/6'] as const;

export function ReportSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {SECTIONS.map((title, i) => (
        <div key={title} className="space-y-2.5">
          <h2 className="text-lg font-semibold text-muted-foreground/60">{title}</h2>
          {BAR_WIDTHS.slice(0, i % 2 === 0 ? 3 : 2).map((w, j) => (
            <div
              key={j}
              className={`h-3 animate-pulse rounded bg-muted/40 ${w}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
