import { cn } from '@/lib/utils';
import { DotGrid, GrainFilter } from './shared';

export function DeployEmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      className={cn('h-20 w-auto', className)}
      aria-hidden="true"
    >
      <GrainFilter id="grain-p" seed={3} />
      <DotGrid cx={90} cy={6} />

      {/* Expansion field — faint filled area suggesting the deployed space */}
      <ellipse cx={60} cy={32} rx={38} ry={26} fill="currentColor" opacity={0.035} filter="url(#grain-p)" />
      <ellipse
        cx={60} cy={32} rx={38} ry={26}
        stroke="currentColor" strokeWidth={0.6} opacity={0.06}
        strokeDasharray="3 5"
      />

      {/* Origin platform */}
      <rect x={48} y={64} width={24} height={8} rx={2} fill="currentColor" opacity={0.06} filter="url(#grain-p)" />
      <rect
        x={48} y={64} width={24} height={8} rx={2}
        stroke="currentColor" strokeWidth={1.2}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '60ms' }}
      />
      {/* Origin detail */}
      <line x1={53} y1={68} x2={59} y2={68} stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.3}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '100ms' }}
      />
      <circle cx={65} cy={68} r={1.2} fill="currentColor" opacity={0.2} />

      {/* Main trunk — curves upward from origin */}
      <path
        d="M 60,64 C 60,56 60,50 60,42"
        stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '140ms' }}
      />

      {/* Left branch — organic curve */}
      <path
        d="M 60,50 C 52,46 42,42 32,34"
        stroke="currentColor" strokeWidth={1.2} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '220ms' }}
      />
      {/* Left sub-branch */}
      <path
        d="M 42,42 C 38,36 30,32 24,26"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.4}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '300ms' }}
      />

      {/* Right branch */}
      <path
        d="M 60,48 C 68,44 78,38 88,32"
        stroke="currentColor" strokeWidth={1.2} strokeLinecap="round"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '260ms' }}
      />
      {/* Right sub-branch */}
      <path
        d="M 78,38 C 84,32 92,28 98,22"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.4}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '340ms' }}
      />

      {/* Center upward branch */}
      <path
        d="M 60,42 C 58,34 56,26 54,18"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.6}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '280ms' }}
      />

      {/* Endpoint nodes — distributed targets */}
      <circle cx={32} cy={34} r={3.5} fill="currentColor" opacity={0.06} />
      <circle cx={32} cy={34} r={3.5} stroke="currentColor" strokeWidth={1} opacity={0.4}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '380ms' }}
      />

      <circle cx={88} cy={32} r={3.5} fill="currentColor" opacity={0.06} />
      <circle cx={88} cy={32} r={3.5} stroke="currentColor" strokeWidth={1} opacity={0.4}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '400ms' }}
      />

      <circle cx={54} cy={18} r={3} fill="currentColor" opacity={0.05} />
      <circle cx={54} cy={18} r={3} stroke="currentColor" strokeWidth={0.8} opacity={0.3}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '420ms' }}
      />

      <circle cx={24} cy={26} r={2.5} fill="currentColor" opacity={0.04} />
      <circle cx={24} cy={26} r={2.5} stroke="currentColor" strokeWidth={0.7} opacity={0.2}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '440ms' }}
      />

      <circle cx={98} cy={22} r={2.5} fill="currentColor" opacity={0.04} />
      <circle cx={98} cy={22} r={2.5} stroke="currentColor" strokeWidth={0.7} opacity={0.2}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '460ms' }}
      />

      {/* Junction accent at first split */}
      <circle cx={60} cy={48} r={2} fill="currentColor" opacity={0.2} />

      {/* Node label lines — secondary detail system */}
      <line x1={36} y1={34} x2={44} y2={34}
        stroke="currentColor" strokeWidth={0.7} strokeLinecap="round" opacity={0.15}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '400ms' }}
      />
      <line x1={36} y1={37} x2={42} y2={37}
        stroke="currentColor" strokeWidth={0.5} strokeLinecap="round" opacity={0.1}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '410ms' }}
      />
      <line x1={78} y1={32} x2={84} y2={32}
        stroke="currentColor" strokeWidth={0.7} strokeLinecap="round" opacity={0.15}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '420ms' }}
      />
      <line x1={78} y1={35} x2={82} y2={35}
        stroke="currentColor" strokeWidth={0.5} strokeLinecap="round" opacity={0.1}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '430ms' }}
      />

      {/* Pulse ring around active node */}
      <circle cx={32} cy={34} r={6} stroke="currentColor" strokeWidth={0.5} opacity={0.08}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '450ms' }}
      />

      {/* Dashed pending connections — suggesting more to come */}
      <path
        d="M 32,34 C 28,30 26,24 28,18"
        stroke="currentColor" strokeWidth={0.7} strokeLinecap="round" opacity={0.15}
        strokeDasharray="2 3"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '500ms' }}
      />
      <path
        d="M 88,32 C 94,28 98,22 102,16"
        stroke="currentColor" strokeWidth={0.7} strokeLinecap="round" opacity={0.15}
        strokeDasharray="2 3"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '520ms' }}
      />

      <line
        x1={16} y1={82} x2={104} y2={82}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '580ms' }}
      />
    </svg>
  );
}
