import { cn } from '@/lib/utils';
import { DotGrid, GrainFilter } from './shared';

export function ChartEmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      className={cn('h-20 w-auto', className)}
      aria-hidden="true"
    >
      <GrainFilter id="grain-c" seed={2} />
      <DotGrid cx={8} cy={6} />

      {/* Axes */}
      <line
        x1={24} y1={10} x2={24} y2={70}
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.2}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '40ms' }}
      />
      <line
        x1={24} y1={70} x2={104} y2={70}
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.2}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '80ms' }}
      />

      {/* Axis tick marks */}
      {[28, 42, 56, 70].map((y, i) => (
        <line
          key={`ty${y}`} x1={22} y1={y} x2={24} y2={y}
          stroke="currentColor" strokeWidth={0.8} opacity={0.15}
          pathLength={1} className="stroke-draw-on"
          style={{ animationDelay: `${90 + i * 15}ms` }}
        />
      ))}

      {/* Grid lines */}
      {[28, 42, 56].map((y, i) => (
        <line
          key={`g${y}`} x1={26} y1={y} x2={102} y2={y}
          stroke="currentColor" strokeWidth={0.4} opacity={0.06}
          pathLength={1} className="stroke-draw-on"
          style={{ animationDelay: `${100 + i * 20}ms` }}
        />
      ))}

      {/* Bar fills — low-opacity rectangles for visual weight */}
      <rect x={32} y={48} width={8} height={22} rx={1.5} fill="currentColor" opacity={0.07} filter="url(#grain-c)"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '160ms' }}
      />
      <rect x={48} y={26} width={8} height={44} rx={1.5} fill="currentColor" opacity={0.09} filter="url(#grain-c)"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '200ms' }}
      />
      <rect x={64} y={36} width={8} height={34} rx={1.5} fill="currentColor" opacity={0.08} filter="url(#grain-c)"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '240ms' }}
      />
      <rect x={80} y={18} width={8} height={52} rx={1.5} fill="currentColor" opacity={0.1} filter="url(#grain-c)"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '280ms' }}
      />

      {/* Bar strokes — top caps for definition */}
      <line x1={32} y1={48} x2={40} y2={48} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '180ms' }}
      />
      <line x1={48} y1={26} x2={56} y2={26} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '220ms' }}
      />
      <line x1={64} y1={36} x2={72} y2={36} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '260ms' }}
      />
      <line x1={80} y1={18} x2={88} y2={18} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '300ms' }}
      />

      {/* Area fill under trend curve */}
      <path
        d="M 36,48 C 44,44 50,26 52,26 C 60,28 66,36 68,36 C 74,34 80,18 84,18 L 84,70 L 36,70 Z"
        fill="currentColor" opacity={0.05} filter="url(#grain-c)"
      />

      {/* Trend curve — the star stroke */}
      <path
        d="M 36,48 C 44,44 50,26 52,26 C 60,28 66,36 68,36 C 74,34 80,18 84,18"
        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '360ms' }}
      />

      {/* Dashed projection */}
      <path
        d="M 84,18 C 90,14 96,12 100,10"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round"
        strokeDasharray="2 3" opacity={0.25}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '480ms' }}
      />

      {/* Data point markers */}
      <circle cx={52} cy={26} r={2.5} fill="currentColor" opacity={0.2} />
      <circle cx={84} cy={18} r={2.5} fill="currentColor" opacity={0.25} />
      <circle cx={68} cy={36} r={1.8} fill="currentColor" opacity={0.12} />

      {/* Small donut fragment — top right corner detail */}
      <path
        d="M 100,14 A 6,6 0 1,1 94,20"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.12}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '520ms' }}
      />

      <line
        x1={10} y1={82} x2={110} y2={82}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '580ms' }}
      />
    </svg>
  );
}
