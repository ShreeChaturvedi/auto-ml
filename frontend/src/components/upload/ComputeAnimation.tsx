import { useEffect, useState, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  FileText,
  FileCode,
  Table,
  File,
  BarChart3,
  Layers,
  Database,
  CheckCircle,
  AlertTriangle,
  Type,
  Activity,
  Box
} from 'lucide-react';
import type { ComputeAnimationProps } from '@/types/processing';
import {
  FLOW_BASE_STROKE_WIDTH,
  FLOW_PARTICLE_DASHARRAY,
  FLOW_PARTICLE_DURATION,
  FLOW_PARTICLE_OFFSET_END,
  FLOW_PARTICLE_OFFSET_START,
  FLOW_PARTICLE_STROKE_WIDTH,
} from '@/lib/animation/flowPulseTokens';

// ── Dynamic Icon Helpers ──────────────────────────────────────────

const commonIcons: Record<string, React.ElementType> = {
  'dataset_stats': BarChart3,
  'document_chunks': Layers,
  'schema_analysis': Database,
  'quality_check': CheckCircle,
  'bar-chart': BarChart3,
  'table': Database,
  'file-text': FileText,
  'check': CheckCircle,
  'alert-triangle': AlertTriangle,
  'type': Type,
  'activity': Activity,
  'box': Box,
  'file-code': FileCode,
};

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const t = name.toLowerCase();
  if (commonIcons[t]) {
    const Icon = commonIcons[t];
    return <Icon className={className} />;
  }
  
  if (t.includes('chart') || t.includes('stat')) return <BarChart3 className={className} />;
  if (t.includes('chunk') || t.includes('layer')) return <Layers className={className} />;
  if (t.includes('schema') || t.includes('data')) return <Database className={className} />;
  if (t.includes('check') || t.includes('quality')) return <CheckCircle className={className} />;
  
  if (!name.match(/^[a-zA-Z-]+$/) && name.length <= 4) {
    return <span className={cn("flex items-center justify-center text-lg leading-none", className)}>{name}</span>;
  }
  
  return <FileText className={className} />;
}

function FileIcon({ type, className }: { type: string; className?: string }) {
  const t = type.toLowerCase();
  if (t.includes('csv') || t.includes('excel') || t.includes('xls')) {
    return <Table className={cn("w-6 h-6 text-emerald-600", className)} />;
  }
  if (t.includes('json')) {
    return <FileCode className={cn("w-6 h-6 text-blue-600", className)} />;
  }
  if (t.includes('pdf')) {
    return <FileText className={cn("w-6 h-6 text-red-500", className)} />;
  }
  return <File className={cn("w-6 h-6 text-slate-500", className)} />;
}

// ── Main Component ──────────────────────────────────────────────

export function ComputeAnimation({
  files,
  results,
  isComplete,
  accentClassName,
  onSettled,
}: ComputeAnimationProps) {
  const uid = useId().replace(/:/g, '');
  const [visibleFiles, setVisibleFiles] = useState(0);
  const [visibleResults, setVisibleResults] = useState(0);
  const settledRef = useRef(false);

  // Stagger file appearance
  useEffect(() => {
    if (files.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    files.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleFiles(i + 1), 300 + i * 250));
    });
    return () => timers.forEach(clearTimeout);
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stagger result card appearance
  useEffect(() => {
    if (results.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    results.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleResults(i + 1), i * 350));
    });
    return () => timers.forEach(clearTimeout);
  }, [results.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire onSettled once all result cards are visible AND the completion state is set
  useEffect(() => {
    if (!isComplete || !onSettled || settledRef.current) return;
    if (visibleResults < results.length) return;
    // Wait for the checkmark animation (0.5s delay + 0.5s draw = 1s) to finish
    const timer = setTimeout(() => {
      if (!settledRef.current) {
        settledRef.current = true;
        onSettled();
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [isComplete, visibleResults, results.length, onSettled]);

  // Positions for up to 6 file slots on the left
  const maxSlots = Math.min(files.length, 6);
  const fileSlotY = (i: number) => {
    const count = Math.max(maxSlots, 1);
    if (count === 1) return 230;
    const gap = 300 / (count - 1);
    return 80 + i * gap;
  };

  // Positions for result card slots on the right
  const resultSlotY = (i: number) => {
    const count = Math.max(results.length, 1);
    if (count === 1) return 230;
    const gap = 300 / (count - 1);
    return 80 + i * gap;
  };

  return (
    <div
      className={cn('mx-auto w-full max-w-[56rem] px-4', accentClassName)}
      role="img"
      aria-label={
        isComplete
          ? 'Data processing complete'
          : 'Analyzing your uploaded files…'
      }
    >
      <style>{`
        @keyframes ca-particle-${uid} {
          0%   { stroke-dashoffset: ${FLOW_PARTICLE_OFFSET_START}; }
          100% { stroke-dashoffset: ${FLOW_PARTICLE_OFFSET_END}; }
        }
        @keyframes ca-rotate-cube-${uid} {
          0%   { transform: rotateX(-20deg) rotateY(0deg); }
          100% { transform: rotateX(-20deg) rotateY(360deg); }
        }

        .ca-cube-wrapper-${uid} {
          perspective: 1000px;
          width: 100px;
          height: 100px;
          transform-style: preserve-3d;
          transition: transform 0.5s ease;
        }
        .ca-cube-${uid} {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
          animation: ca-rotate-cube-${uid} 12s infinite linear;
        }
        .ca-face-${uid} {
          position: absolute;
          width: 100px;
          height: 100px;
          background: hsl(var(--muted-foreground) / 0.05);
          border: 1px solid hsl(var(--muted-foreground) / 0.2);
          box-shadow: inset 0 0 20px hsl(var(--muted-foreground) / 0.1);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
        }
        .ca-face-${uid}.front  { transform: rotateY(  0deg) translateZ(50px); }
        .ca-face-${uid}.back   { transform: rotateY(180deg) translateZ(50px); }
        .ca-face-${uid}.left   { transform: rotateY(-90deg) translateZ(50px); }
        .ca-face-${uid}.right  { transform: rotateY( 90deg) translateZ(50px); }
        .ca-face-${uid}.top    { transform: rotateX( 90deg) translateZ(50px); }
        .ca-face-${uid}.bottom { transform: rotateX(-90deg) translateZ(50px); }
        
        .ca-core-${uid} {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 48px;
          height: 48px;
          transform: translate(-50%, -50%) scale(1);
          transform-style: preserve-3d;
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .ca-core-${uid}.settled {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.2);
        }

        .ca-nucleus-${uid} {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 14px;
          height: 14px;
          background: radial-gradient(
            circle at 30% 30%,
            hsl(var(--background) / 0.95) 0%,
            hsl(var(--background) / 0.4) 18%,
            currentColor 55%,
            hsl(var(--foreground) / 0.35) 100%
          );
          border-radius: 50%;
          transform: translate(-50%, -50%);
          box-shadow:
            0 0 12px currentColor,
            inset 2px 2px 3px hsl(var(--background) / 0.55),
            inset -2px -2px 4px hsl(var(--foreground) / 0.22);
        }

        .ca-orbit-${uid} {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border: 1.5px solid currentColor;
          opacity: 0.35;
          border-radius: 50%;
          transform-style: preserve-3d;
        }

        @keyframes ca-precess-1-${uid} {
          0% { transform: rotateX(65deg) rotateY(0deg) rotateZ(0deg); }
          100% { transform: rotateX(65deg) rotateY(0deg) rotateZ(360deg); }
        }
        @keyframes ca-precess-2-${uid} {
          0% { transform: rotateX(65deg) rotateY(60deg) rotateZ(0deg); }
          100% { transform: rotateX(65deg) rotateY(60deg) rotateZ(-360deg); }
        }
        @keyframes ca-precess-3-${uid} {
          0% { transform: rotateX(65deg) rotateY(120deg) rotateZ(0deg); }
          100% { transform: rotateX(65deg) rotateY(120deg) rotateZ(360deg); }
        }

        .ca-orbit-1-${uid} { animation: ca-precess-1-${uid} 6.4s linear infinite; }
        .ca-orbit-2-${uid} { animation: ca-precess-2-${uid} 7.2s linear infinite; }
        .ca-orbit-3-${uid} { animation: ca-precess-3-${uid} 8s linear infinite; }

        .ca-electron-container-${uid} {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          border-radius: 50%;
          transform-style: preserve-3d;
        }

        .ca-spin-1-${uid} { animation: ca-spin-z-${uid} 1.25s linear infinite; }
        .ca-spin-2-${uid} { animation: ca-spin-z-${uid} 1.5s linear infinite; }
        .ca-spin-3-${uid} { animation: ca-spin-z-${uid} 1.75s linear infinite; }

        @keyframes ca-spin-z-${uid} {
          0%   { transform: rotateZ(0deg); }
          100% { transform: rotateZ(360deg); }
        }

        .ca-electron-${uid} {
          position: absolute;
          top: -3px;
          left: 50%;
          width: 6px;
          height: 6px;
          background: currentColor;
          border-radius: 50%;
          transform: translateX(-50%);
          box-shadow: 0 0 8px currentColor;
        }

        .ca-electron-secondary-${uid} {
          top: calc(100% - 3px);
          opacity: 0.9;
          box-shadow: 0 0 6px currentColor;
        }

        .ca-edge-pulse-${uid} {
          animation: ca-cube-edge-${uid} 4s linear infinite;
        }
        @keyframes ca-cube-edge-${uid} {
          0%   { stroke-dashoffset: 400; }
          100% { stroke-dashoffset: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .ca-anim-${uid} * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <svg
        viewBox="0 0 900 460"
        className={cn('w-full h-auto', `ca-anim-${uid}`)}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`particle-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
            <stop offset="50%" style={{ stopColor: 'currentColor', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
          </linearGradient>

          {/* Subtle neutral glow behind cube */}
          <radialGradient id={`cube-bg-${uid}`} cx="50%" cy="50%" r="35%">
            <stop offset="0%" style={{ stopColor: 'hsl(var(--muted-foreground))', stopOpacity: 0.12 }} />
            <stop offset="100%" style={{ stopColor: 'hsl(var(--muted-foreground))', stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        {/* ─── Background glow ─── */}
        <circle cx="450" cy="230" r="140" fill={`url(#cube-bg-${uid})`} />

        {/* ─── Left: Base paths ─── */}
        {files.slice(0, 6).map((_, i) => {
          const y = fileSlotY(i);
          const visible = i < visibleFiles;
          return (
            <path
              key={`base-l-${i}`}
              d={`M 200 ${y} C 280 ${y}, 270 230, 350 230`}
              fill="none"
              strokeWidth={FLOW_BASE_STROKE_WIDTH}
              style={{ stroke: 'hsl(var(--border))', opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease' }}
            />
          );
        })}

        {/* ─── Left: Flying particles ─── */}
        {files.slice(0, 6).map((_, i) => {
          const y = fileSlotY(i);
          const visible = i < visibleFiles;
          return (
            <path
              key={`particle-l-${i}`}
              d={`M 200 ${y} C 280 ${y}, 270 230, 350 230`}
              fill="none"
              stroke={`url(#particle-grad-${uid})`}
              strokeWidth={FLOW_PARTICLE_STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={FLOW_PARTICLE_DASHARRAY}
              opacity={visible && !isComplete ? 1 : 0}
              style={{
                transition: 'opacity 0.5s ease',
                animation: `ca-particle-${uid} ${FLOW_PARTICLE_DURATION} linear infinite`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          );
        })}

        {/* ─── Right: Base paths ─── */}
        {results.map((_, i) => {
          const y = resultSlotY(i);
          const visible = i < visibleResults;
          return (
            <path
              key={`base-r-${i}`}
              d={`M 550 230 C 630 230, 620 ${y}, 700 ${y}`}
              fill="none"
              strokeWidth={FLOW_BASE_STROKE_WIDTH}
              style={{ stroke: 'hsl(var(--border))', opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease' }}
            />
          );
        })}

        {/* ─── Right: Flying particles ─── */}
        {results.map((_, i) => {
          const y = resultSlotY(i);
          const visible = i < visibleResults;
          return (
            <path
              key={`particle-r-${i}`}
              d={`M 550 230 C 630 230, 620 ${y}, 700 ${y}`}
              fill="none"
              stroke={`url(#particle-grad-${uid})`}
              strokeWidth={FLOW_PARTICLE_STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={FLOW_PARTICLE_DASHARRAY}
              opacity={visible ? 1 : 0}
              style={{
                transition: 'opacity 0.5s ease',
                animation: `ca-particle-${uid} ${FLOW_PARTICLE_DURATION} linear infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          );
        })}

        {/* ─── Center: 3D Compute Cube ─── */}
        <foreignObject x="350" y="130" width="200" height="200" className="pointer-events-none">
          <div className="w-full h-full flex items-center justify-center">
            <div className={`ca-cube-wrapper-${uid}`}>
              <div className={`ca-cube-${uid}`}>
                {['front', 'back', 'left', 'right', 'top', 'bottom'].map((face) => (
                  <div key={face} className={`ca-face-${uid} ${face}`}>
                    <svg width="100" height="100" viewBox="0 0 100 100" className="absolute top-0 left-0 pointer-events-none">
                      <rect x="0" y="0" width="100" height="100" fill="none" stroke="hsl(var(--muted-foreground) / 0.6)" strokeWidth="1" strokeDasharray="50 350" className={`ca-edge-pulse-${uid}`} />
                    </svg>
                  </div>
                ))}
                <div className={cn(`ca-core-${uid}`, isComplete && "settled")}>
                  <div className={`ca-nucleus-${uid}`}></div>
                  
                  <div className={`ca-orbit-${uid} ca-orbit-1-${uid}`}>
                    <div className={`ca-electron-container-${uid} ca-spin-1-${uid}`}>
                      <div className={`ca-electron-${uid}`}></div>
                      <div className={`ca-electron-${uid} ca-electron-secondary-${uid}`}></div>
                    </div>
                  </div>
                  
                  <div className={`ca-orbit-${uid} ca-orbit-2-${uid}`}>
                    <div className={`ca-electron-container-${uid} ca-spin-2-${uid}`}>
                      <div className={`ca-electron-${uid}`}></div>
                      <div className={`ca-electron-${uid} ca-electron-secondary-${uid}`}></div>
                    </div>
                  </div>

                  <div className={`ca-orbit-${uid} ca-orbit-3-${uid}`}>
                    <div className={`ca-electron-container-${uid} ca-spin-3-${uid}`}>
                      <div className={`ca-electron-${uid}`}></div>
                      <div className={`ca-electron-${uid} ca-electron-secondary-${uid}`}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </foreignObject>

        {/* ─── Completion checkmark (visible when complete) ─── */}
        <g
          style={{
            opacity: isComplete ? 1 : 0,
            transform: isComplete ? 'translate(450px, 230px) scale(1)' : 'translate(450px, 230px) scale(0.5)',
            transition: 'opacity 0.4s ease 0.2s, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s',
          }}
        >
          <circle cx="0" cy="0" r="28" style={{ fill: 'currentColor' }} />
          <path
            d="M -9 1 l 6 6 l 12 -12"
            fill="none"
            style={{
              stroke: 'hsl(var(--primary-foreground))',
              strokeWidth: 3.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              strokeDasharray: 40,
              strokeDashoffset: isComplete ? 0 : 40,
              transition: 'stroke-dashoffset 0.5s ease 0.5s',
            }}
          />
        </g>

        {/* ─── Left: File icons with labels ─── */}
        {files.slice(0, 6).map((file, i) => {
          const y = fileSlotY(i);
          const visible = i < visibleFiles;
          return (
            <foreignObject
              key={`file-${i}`}
              x="20"
              y={y - 24}
              width="180"
              height="48"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-16px)',
                transition: 'opacity 0.5s ease, transform 0.5s ease',
              }}
            >
              <div className="flex items-center w-full h-full px-3 bg-card text-card-foreground rounded-lg border border-border shadow-sm overflow-hidden">
                <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-muted border border-border">
                   <FileIcon type={file.type} />
                </div>
                <div className="ml-3 flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-sm font-medium text-foreground truncate">{file.name}</div>
                  <div className="text-[10px] leading-tight text-muted-foreground font-mono uppercase tracking-wider">{file.type}</div>
                </div>
              </div>
            </foreignObject>
          );
        })}

        {/* ─── Right: Result cards ─── */}
        {results.map((result, i) => {
          const y = resultSlotY(i);
          const visible = i < visibleResults;
          return (
            <foreignObject
              key={`result-${i}`}
              x="700"
              y={y - 24}
              width="180"
              height="48"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(16px)',
                transition: 'opacity 0.6s ease, transform 0.6s ease',
              }}
            >
              <div className="flex items-center w-full h-full px-3 bg-card text-card-foreground rounded-lg border border-border shadow-sm overflow-hidden">
                <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20">
                   <DynamicIcon name={result.icon || result.type} className="w-4 h-4 text-primary" />
                </div>
                <div className="ml-3 flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-sm font-medium text-foreground truncate">{result.label}</div>
                  {result.detail && (
                    <div className="text-xs text-muted-foreground truncate">{result.detail}</div>
                  )}
                </div>
              </div>
            </foreignObject>
          );
        })}

        {/* ─── "Analyzing…" / "Complete" label below center ─── */}
        <text
          x="450"
          y="410"
          textAnchor="middle"
          fontSize="14"
          fontFamily="system-ui, sans-serif"
          fontWeight="500"
          style={{ fill: 'hsl(var(--muted-foreground))', transition: 'opacity 0.4s ease' }}
        >
          {isComplete ? 'Analysis complete' : 'Analyzing your data…'}
        </text>

        {/* Subtle quality bar beneath the label */}
        <rect x="375" y="425" width="150" height="4" rx="2" style={{ fill: 'hsl(var(--muted))' }} />
        <rect
          x="375"
          y="425"
          width={isComplete ? '150' : '0'}
          height="4"
          rx="2"
          style={{ fill: 'currentColor', transition: 'width 0.8s ease' }}
        />
      </svg>
    </div>
  );
}
