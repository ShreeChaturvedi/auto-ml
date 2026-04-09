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
      <GrainFilter id="grain-home" seed={2} />
      <DotGrid cx={88} cy={6} />
      <DotGrid cx={12} cy={20} gap={6} />

      {/* Dashed baseline */}
      <line
        x1={14} y1={84} x2={106} y2={84}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '60ms' }}
      />

      {/* Root Network */}
      <path
        d="M 38 84 C 45 80, 50 82, 55 84"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.7}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '100ms' }}
      />
      <path
        d="M 82 84 C 75 80, 70 82, 65 84"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.7}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '120ms' }}
      />

      {/* Main Trunk Splitting (Organic Curves) */}
      <path
        d="M 55 84 C 55 60, 40 45, 35 25"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '200ms' }}
      />
      <path
        d="M 65 84 C 65 55, 80 40, 85 20"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '240ms' }}
      />
      
      {/* Inner twist (DNA/braid feel) */}
      <path
        d="M 60 84 C 60 65, 52 55, 60 35 C 65 25, 60 15, 60 15"
        stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" fill="none" opacity={0.8}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '280ms' }}
      />

      {/* Cross-branching wisps */}
      <path
        d="M 45 53 Q 55 45 60 48"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" fill="none" opacity={0.4}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '350ms' }}
      />
      <path
        d="M 72 45 Q 65 35 60 35"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" fill="none" opacity={0.4}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '380ms' }}
      />

      {/* Left Node - Project Document */}
      <rect x={20} y={9} width={28} height={32} rx={4} fill="currentColor" opacity={0.03} filter="url(#grain-home)" />
      <rect
        x={20} y={9} width={28} height={32} rx={4}
        stroke="currentColor" strokeWidth={1}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '400ms' }}
      />
      <rect
        x={24} y={14} width={20} height={12} rx={2}
        stroke="currentColor" strokeWidth={0.8} opacity={0.4} fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '450ms' }}
      />
      <line x1={24} y1={31} x2={36} y2={31} stroke="currentColor" strokeWidth={1} strokeLinecap="round" pathLength={1} className="stroke-draw-on" style={{ animationDelay: '480ms' }} />
      <line x1={24} y1={35} x2={44} y2={35} stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.5} pathLength={1} className="stroke-draw-on" style={{ animationDelay: '520ms' }} />

      {/* Right Node - Abstract Diamond */}
      <g transform="rotate(45 85 20)">
        <rect x={73} y={8} width={24} height={24} rx={4} fill="currentColor" opacity={0.04} filter="url(#grain-home)" />
        <rect
          x={73} y={8} width={24} height={24} rx={4}
          stroke="currentColor" strokeWidth={1.2}
          pathLength={1} className="stroke-draw-on"
          style={{ animationDelay: '460ms' }}
        />
        <rect
          x={78} y={13} width={14} height={14} rx={2}
          stroke="currentColor" strokeWidth={0.8} opacity={0.5} fill="none"
          pathLength={1} className="stroke-draw-on"
          style={{ animationDelay: '520ms' }}
        />
        <circle cx={85} cy={20} r={2.5} fill="currentColor" opacity={0.3} />
      </g>

      {/* Center Node - Circular Portal */}
      <circle cx={60} cy={15} r={12} fill="currentColor" opacity={0.03} filter="url(#grain-home)" />
      <circle
        cx={60} cy={15} r={12}
        stroke="currentColor" strokeWidth={1}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '500ms' }}
      />
      <circle
        cx={60} cy={15} r={8}
        stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 3" opacity={0.6} fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '550ms' }}
      />
      <path
        d="M 60 11 L 60 19 M 56 15 L 64 15"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '600ms' }}
      />
      
      {/* Orbiting element & Network lines */}
      <circle cx={72} cy={7} r={1.5} fill="currentColor" opacity={0.5} />
      <path
        d="M 72 7 Q 68 3 60 3"
        stroke="currentColor" strokeWidth={0.8} fill="none" opacity={0.4} strokeDasharray="1 2"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '650ms' }}
      />
      <path
        d="M 48 25 Q 55 20 60 15"
        stroke="currentColor" strokeWidth={0.6} fill="none" strokeDasharray="2 4" opacity={0.4}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '700ms' }}
      />
      <path
        d="M 70 20 Q 65 25 60 35"
        stroke="currentColor" strokeWidth={0.6} fill="none" strokeDasharray="2 4" opacity={0.3}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '720ms' }}
      />

      {/* Floating Particles */}
      <circle cx={18} cy={45} r={1.5} fill="currentColor" opacity={0.2} />
      <circle cx={25} cy={60} r={1} fill="currentColor" opacity={0.15} />
      <circle cx={95} cy={35} r={1.2} fill="currentColor" opacity={0.25} />
      <circle cx={88} cy={55} r={1.5} fill="currentColor" opacity={0.1} />
      <circle cx={42} cy={20} r={1} fill="currentColor" opacity={0.2} />
      <path d="M 10 30 L 12 30 M 11 29 L 11 31" stroke="currentColor" strokeWidth={0.8} opacity={0.3} strokeLinecap="round" />
      <path d="M 80 10 L 82 10 M 81 9 L 81 11" stroke="currentColor" strokeWidth={0.8} opacity={0.4} strokeLinecap="round" />
    </svg>
  );
}