import { cn } from '@/lib/utils';
import { DotGrid, GrainFilter } from './shared';

export function DataEmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      className={cn('h-20 w-auto', className)}
      aria-hidden="true"
    >
      <GrainFilter id="grain-d" seed={1} />
      <DotGrid cx={88} cy={6} />

      {/* Back document — offset, faint fill for depth */}
      <rect x={40} y={8} width={46} height={60} rx={3} fill="currentColor" opacity={0.03} filter="url(#grain-d)" />
      <rect
        x={40} y={8} width={46} height={60} rx={3}
        stroke="currentColor" strokeWidth={0.8} opacity={0.12}
      />

      {/* Front document — main form */}
      <rect x={26} y={16} width={46} height={60} rx={3} fill="currentColor" opacity={0.05} filter="url(#grain-d)" />
      <rect
        x={26} y={16} width={46} height={60} rx={3}
        stroke="currentColor" strokeWidth={1.2}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '60ms' }}
      />

      {/* Header bar */}
      <line
        x1={26} y1={28} x2={72} y2={28}
        stroke="currentColor" strokeWidth={0.8} opacity={0.15}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '140ms' }}
      />

      {/* Corner fold */}
      <path
        d="M 58,16 L 58,26 L 72,16"
        stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round"
        fill="currentColor" fillOpacity={0.03} opacity={0.3}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '180ms' }}
      />

      {/* Data rows — staggered lengths */}
      <line
        x1={33} y1={36} x2={64} y2={36}
        stroke="currentColor" strokeWidth={1.2} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '220ms' }}
      />
      <line
        x1={33} y1={44} x2={58} y2={44}
        stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.7}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '300ms' }}
      />
      <line
        x1={33} y1={52} x2={52} y2={52}
        stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" opacity={0.45}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '380ms' }}
      />
      <line
        x1={33} y1={60} x2={46} y2={60}
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.25}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '440ms' }}
      />

      {/* Row accent dots */}
      <circle cx={30} cy={36} r={1.5} fill="currentColor" opacity={0.3} />
      <circle cx={30} cy={44} r={1.5} fill="currentColor" opacity={0.2} />
      <circle cx={30} cy={52} r={1.5} fill="currentColor" opacity={0.12} />
      <circle cx={30} cy={60} r={1.5} fill="currentColor" opacity={0.08} />

      {/* Small sparkline in header area */}
      <polyline
        points="60,20 62,23 64,19 66,22 68,18"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round"
        fill="none" opacity={0.2}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '500ms' }}
      />

      <line
        x1={14} y1={84} x2={106} y2={84}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '560ms' }}
      />
    </svg>
  );
}
