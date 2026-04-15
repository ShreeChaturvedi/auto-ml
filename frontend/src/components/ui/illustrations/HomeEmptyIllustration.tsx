import { cn } from '@/lib/utils';
import { GrainFilter } from './shared';

export function HomeEmptyIllustration({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      className={cn('h-20 w-auto', className)}
      style={style}
      aria-hidden="true"
    >
      <defs>
        {/* Mask to ensure grain fill is perfectly bound to the organic leaf shapes without rectangular artifacts */}
        <mask id="leaf-mask">
          <path d="M 58 65 C 45 55, 30 45, 25 40 C 35 55, 50 62, 58 65 Z" fill="white" />
          <path d="M 63 50 C 75 40, 90 30, 95 25 C 85 45, 75 50, 63 50 Z" fill="white" />
          <path d="M 62 35 C 53 25, 45 20, 43 15 C 51 28, 58 33, 62 35 Z" fill="white" />
          <path d="M 65 25 C 73 18, 78 15, 80 12 C 73 22, 68 24, 65 25 Z" fill="white" />
        </mask>
      </defs>

      <GrainFilter id="grain-home" seed={3} />

      {/* Dashed baseline */}
      <line
        x1={14} y1={84} x2={106} y2={84}
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" strokeDasharray="3 5"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '60ms' }}
      />

      {/* Root hints - curved cleanly into the ground */}
      <path
        d="M 60 84 C 55 86, 50 88, 48 88"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.3}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '100ms' }}
      />
      <path
        d="M 60 84 C 65 87, 72 87, 75 87"
        stroke="currentColor" strokeWidth={1} strokeLinecap="round" opacity={0.3}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '120ms' }}
      />

      {/* Main Stem - Elegant S curve */}
      <path
        d="M 60 84 C 55 60, 70 35, 60 15"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '160ms' }}
      />

      {/* Leaf Fills with Grain (Using a single rect masked by the leaves) */}
      <rect 
        x={20} y={10} width={80} height={60} 
        fill="currentColor" opacity={0.06} 
        filter="url(#grain-home)" mask="url(#leaf-mask)" 
      />

      {/* Leaf 1 (Bottom Left) */}
      <path
        d="M 58 65 C 45 55, 30 45, 25 40 C 35 55, 50 62, 58 65"
        stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '260ms' }}
      />
      <path
        d="M 56 63 C 45 57, 35 48, 28 42"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.5}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '340ms' }}
      />

      {/* Leaf 2 (Middle Right) */}
      <path
        d="M 63 50 C 75 40, 90 30, 95 25 C 85 45, 75 50, 63 50"
        stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '320ms' }}
      />
      <path
        d="M 65 48 C 75 42, 85 33, 91 28"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.5}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '400ms' }}
      />

      {/* Leaf 3 (Top Left) */}
      <path
        d="M 62 35 C 53 25, 45 20, 43 15 C 51 28, 58 33, 62 35"
        stroke="currentColor" strokeWidth={1} strokeLinejoin="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '380ms' }}
      />
      <path
        d="M 60 33 C 53 27, 48 22, 45 17"
        stroke="currentColor" strokeWidth={0.8} strokeLinecap="round" opacity={0.5}
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '460ms' }}
      />

      {/* Leaf 4 (Top Right) */}
      <path
        d="M 65 25 C 73 18, 78 15, 80 12 C 73 22, 68 24, 65 25"
        stroke="currentColor" strokeWidth={1} strokeLinejoin="round" fill="none"
        pathLength={1} className="stroke-draw-on"
        style={{ animationDelay: '420ms' }}
      />

    </svg>
  );
}