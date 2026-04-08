import { cn } from '@/lib/utils';
import { DotGrid, GrainFilter } from './shared';

export function ToolsEmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      className={cn('h-20 w-auto', className)}
      aria-hidden="true"
    >
      <GrainFilter id="grain-t" seed={4} />
      <DotGrid cx={8} cy={6} />

      {/* Large gear — filled circle + tooth bumps */}
      <circle cx={52} cy={36} r={18} fill="currentColor" opacity={0.05} filter="url(#grain-t)" />
      <circle
        cx={52} cy={36} r={18}
        stroke="currentColor" strokeWidth={1.3}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '80ms' }}
      />
      {/* Gear teeth — short radial lines */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 52 + 18 * Math.cos(rad);
        const y1 = 36 + 18 * Math.sin(rad);
        const x2 = 52 + 22 * Math.cos(rad);
        const y2 = 36 + 22 * Math.sin(rad);
        return (
          <line
            key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" opacity={0.2}
            pathLength={1} className="stroke-draw-on"
            style={{ animationDelay: `${120 + i * 25}ms` }}
          />
        );
      })}
      {/* Gear inner hub */}
      <circle
        cx={52} cy={36} r={6}
        stroke="currentColor" strokeWidth={1} opacity={0.3}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '160ms' }}
      />
      <circle cx={52} cy={36} r={2} fill="currentColor" opacity={0.2} />

      {/* Small gear — interlocking */}
      <circle cx={80} cy={52} r={11} fill="currentColor" opacity={0.04} filter="url(#grain-t)" />
      <circle
        cx={80} cy={52} r={11}
        stroke="currentColor" strokeWidth={1} opacity={0.5}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '320ms' }}
      />
      {/* Small gear teeth */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 80 + 11 * Math.cos(rad);
        const y1 = 52 + 11 * Math.sin(rad);
        const x2 = 80 + 14 * Math.cos(rad);
        const y2 = 52 + 14 * Math.sin(rad);
        return (
          <line
            key={deg} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" opacity={0.15}
            pathLength={1} className="stroke-draw-on"
            style={{ animationDelay: `${360 + i * 20}ms` }}
          />
        );
      })}
      <circle cx={80} cy={52} r={3.5} stroke="currentColor" strokeWidth={0.8} opacity={0.25}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '350ms' }}
      />
      <circle cx={80} cy={52} r={1.2} fill="currentColor" opacity={0.15} />

      {/* Circuit traces — left side component path */}
      <path
        d="M 34,36 L 22,36 L 22,56 L 30,56"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
        opacity={0.25}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '460ms' }}
      />
      <rect x={30} y={52} width={10} height={10} rx={2} fill="currentColor" opacity={0.05} filter="url(#grain-t)" />
      <rect x={30} y={52} width={10} height={10} rx={2}
        stroke="currentColor" strokeWidth={0.8} opacity={0.25}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '500ms' }}
      />
      {/* Component internal detail */}
      <line x1={33} y1={56} x2={37} y2={56} stroke="currentColor" strokeWidth={0.6} strokeLinecap="round" opacity={0.15} />
      <line x1={33} y1={59} x2={36} y2={59} stroke="currentColor" strokeWidth={0.6} strokeLinecap="round" opacity={0.1} />

      {/* Top circuit path */}
      <path
        d="M 52,18 L 52,10 L 78,10 L 78,18"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
        opacity={0.2}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '480ms' }}
      />
      <circle cx={65} cy={10} r={1.5} fill="currentColor" opacity={0.12} />

      {/* Right side — toggle + label trace */}
      <path
        d="M 91,52 L 100,52 L 100,40 L 96,40"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round"
        opacity={0.18}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '510ms' }}
      />
      <rect x={96} y={36} width={14} height={7} rx={3.5} fill="currentColor" opacity={0.04} filter="url(#grain-t)" />
      <rect x={96} y={36} width={14} height={7} rx={3.5}
        stroke="currentColor" strokeWidth={0.8} opacity={0.22}
        pathLength={1} className="stroke-draw-on" style={{ animationDelay: '530ms' }}
      />
      <circle cx={106} cy={39.5} r={2.2} fill="currentColor" opacity={0.15} />

      <line
        x1={10} y1={78} x2={110} y2={78}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '580ms' }}
      />
    </svg>
  );
}
