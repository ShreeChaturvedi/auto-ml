import { cn } from '@/lib/utils';

export function ProjectsEmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 64"
      fill="none"
      className={cn('h-12 w-auto', className)}
      aria-hidden="true"
    >
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2].map((col) => (
          <circle
            key={`${row}-${col}`}
            cx={28 + col * 12}
            cy={16 + row * 12}
            r={1}
            fill="currentColor"
            opacity={0.08}
          />
        ))
      )}

      <line
        x1={20} y1={52} x2={40} y2={20}
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '80ms' }}
      />
      <line
        x1={40} y1={20} x2={60} y2={52}
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '220ms' }}
      />

      <circle cx={40} cy={20} r={2.5} fill="currentColor" opacity={0.25} />

      <line
        x1={14} y1={56} x2={66} y2={56}
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeDasharray="3 4"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '380ms' }}
      />
    </svg>
  );
}
