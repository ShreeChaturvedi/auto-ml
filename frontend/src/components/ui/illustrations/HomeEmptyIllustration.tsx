import { cn } from '@/lib/utils';
import { DotGrid, GrainFilter } from './shared';

export function HomeEmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      className={cn('h-20 w-auto', className)}
      aria-hidden="true"
    >
      <GrainFilter id="grain-home" seed={3} />
      <DotGrid cx={88} cy={6} />
      <DotGrid cx={12} cy={20} gap={6} />

      {/* Dashed baseline */}
      <line
        x1={14} y1={84} x2={106} y2={84}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '60ms' }}
      />

      {/* Secondary Shoots */}
      <path
        d="M 42 84 Q 36 70 32 65"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.4}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '100ms' }}
      />
      <path
        d="M 78 84 Q 84 75 88 60"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.4}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '120ms' }}
      />

      {/* Main Stem */}
      <path
        d="M 60 84 Q 52 50 60 15"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '160ms' }}
      />

      {/* Lower Left Leaf */}
      <path
        d="M 56 60 C 40 45, 25 35, 25 25 C 35 40, 50 50, 56 60"
        stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round"
        fill="currentColor" fillOpacity={0.06} filter="url(#grain-home)"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '260ms' }}
      />
      <path
        d="M 54 58 Q 40 40 28 28"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.5}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '340ms' }}
      />

      {/* Middle Right Leaf */}
      <path
        d="M 57 45 C 80 30, 95 20, 95 15 C 85 30, 70 40, 57 45"
        stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round"
        fill="currentColor" fillOpacity={0.05} filter="url(#grain-home)"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '320ms' }}
      />
      <path
        d="M 59 43 Q 80 30 90 18"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.5}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '400ms' }}
      />

      {/* Upper Left Leaf */}
      <path
        d="M 58 25 C 50 15, 40 10, 40 5 C 45 15, 55 20, 58 25"
        stroke="currentColor" strokeWidth={1} strokeLinejoin="round"
        fill="currentColor" fillOpacity={0.04} filter="url(#grain-home)"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '380ms' }}
      />
      <path
        d="M 56 23 Q 48 14 43 7"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.5}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '460ms' }}
      />

      {/* Top Right Leaf / Bud */}
      <path
        d="M 59 18 C 65 10, 75 8, 75 5 C 70 12, 65 15, 59 18"
        stroke="currentColor" strokeWidth={1} strokeLinejoin="round"
        fill="currentColor" fillOpacity={0.04} filter="url(#grain-home)"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '420ms' }}
      />

      {/* Subtle organic atmosphere (pollen/spores) */}
      <circle cx={40} cy={15} r={1.5} fill="currentColor" opacity={0.3} />
      <circle cx={80} cy={35} r={1.5} fill="currentColor" opacity={0.2} />
      <circle cx={30} cy={50} r={2} fill="currentColor" opacity={0.15} />
      <circle cx={90} cy={55} r={1} fill="currentColor" opacity={0.25} />
      <circle cx={50} cy={30} r={1} fill="currentColor" opacity={0.2} />

    </svg>
  );
}
