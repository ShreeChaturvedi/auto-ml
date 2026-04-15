import { cn } from '@/lib/utils';
import { DotGrid, GrainFilter } from './shared';

export function AlertEmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      className={cn('h-20 w-auto', className)}
      aria-hidden="true"
    >
      <GrainFilter id="grain-a" seed={5} />
      <DotGrid cx={90} cy={6} />

      {/* Faint horizontal reference lines */}
      <line x1={14} y1={26} x2={106} y2={26} stroke="currentColor" strokeWidth={0.4} opacity={0.05} />
      <line x1={14} y1={38} x2={106} y2={38} stroke="currentColor" strokeWidth={0.5} opacity={0.08} />
      <line x1={14} y1={50} x2={106} y2={50} stroke="currentColor" strokeWidth={0.4} opacity={0.05} />

      {/* Area fill under the wave — with grain */}
      <path
        d="M 14,38 C 18,38 20,16 26,16 C 32,16 34,60 40,60 C 46,60 46,24 52,24 C 58,24 58,50 62,50 C 66,50 66,40 70,38 L 106,38 L 106,62 L 14,62 Z"
        fill="currentColor" opacity={0.05} filter="url(#grain-a)"
      />

      {/* The main wave — damped oscillation */}
      <path
        d="M 14,38 C 18,38 20,16 26,16 C 32,16 34,60 40,60 C 46,60 46,24 52,24 C 58,24 58,50 62,50 C 66,50 66,40 70,38"
        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '80ms' }}
      />

      {/* Flatline — the signal dies */}
      <line
        x1={70} y1={38} x2={106} y2={38}
        stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '340ms' }}
      />

      {/* Ghost wave — dashed, what the signal SHOULD have been */}
      <path
        d="M 70,38 C 74,38 74,28 78,28 C 82,28 82,48 86,48 C 90,48 90,30 94,30"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="2 3" opacity={0.15}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '440ms' }}
      />

      {/* Transition marker — vertical dashed line where signal dies */}
      <line
        x1={70} y1={18} x2={70} y2={58}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round"
        strokeDasharray="2 4" opacity={0.2}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '400ms' }}
      />

      {/* Marker dots at key points */}
      <circle cx={26} cy={16} r={2.5} fill="currentColor" opacity={0.2} />
      <circle cx={52} cy={24} r={2} fill="currentColor" opacity={0.15} />
      <circle cx={70} cy={38} r={2.5} fill="currentColor" opacity={0.25} />

      {/* Small terminal dot on flatline */}
      <circle cx={102} cy={38} r={1.5} fill="currentColor" opacity={0.12} />

      <line
        x1={8} y1={78} x2={112} y2={78}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '520ms' }}
      />
    </svg>
  );
}
