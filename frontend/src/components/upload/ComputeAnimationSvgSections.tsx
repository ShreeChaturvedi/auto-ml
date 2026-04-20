import { cn } from '@/lib/utils';
import {
  Activity,
  BarChart3,
  Box,
  CheckCircle,
  Database,
  File,
  FileCode,
  FileText,
  Layers,
  Table,
  Type,
  AlertTriangle,
} from 'lucide-react';
import type { ProcessingResult } from '@/types/processing';
import {
  FLOW_BASE_STROKE_WIDTH,
  FLOW_PARTICLE_DASHARRAY,
  FLOW_PARTICLE_DURATION,
  FLOW_PARTICLE_STROKE_WIDTH,
} from '@/lib/animation/flowPulseTokens';
import {
  COMPUTE_CUBE_FACES,
  getFileSlotY,
  getLeftFlowPath,
  getResultSlotY,
  getRightFlowPath,
} from './computeAnimationSvgLayout';

interface ComputeAnimationFile {
  name: string;
  type: string;
}

const commonIcons = {
  dataset_stats: BarChart3,
  document_chunks: Layers,
  schema_analysis: Database,
  quality_check: CheckCircle,
  'bar-chart': BarChart3,
  table: Database,
  'file-text': FileText,
  check: CheckCircle,
  'alert-triangle': AlertTriangle,
  type: Type,
  activity: Activity,
  box: Box,
  'file-code': FileCode,
} as const;

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const normalizedName = name.toLowerCase();
  const Icon = commonIcons[normalizedName as keyof typeof commonIcons];

  if (Icon) {
    return <Icon className={className} />;
  }

  if (normalizedName.includes('chart') || normalizedName.includes('stat')) {
    return <BarChart3 className={className} />;
  }

  if (normalizedName.includes('chunk') || normalizedName.includes('layer')) {
    return <Layers className={className} />;
  }

  if (normalizedName.includes('schema') || normalizedName.includes('data')) {
    return <Database className={className} />;
  }

  if (normalizedName.includes('check') || normalizedName.includes('quality')) {
    return <CheckCircle className={className} />;
  }

  if (!name.match(/^[a-zA-Z-]+$/) && name.length <= 4) {
    return (
      <span className={cn('flex items-center justify-center text-lg leading-none', className)}>
        {name}
      </span>
    );
  }

  return <FileText className={className} />;
}

function FileIcon({ type, className }: { type: string; className?: string }) {
  const normalizedType = type.toLowerCase();

  if (
    normalizedType.includes('csv') ||
    normalizedType.includes('excel') ||
    normalizedType.includes('xls')
  ) {
    return <Table className={cn('h-6 w-6 text-emerald-600', className)} />;
  }

  if (normalizedType.includes('json')) {
    return <FileCode className={cn('h-6 w-6 text-blue-600', className)} />;
  }

  if (normalizedType.includes('pdf')) {
    return <FileText className={cn('h-6 w-6 text-red-500', className)} />;
  }

  return <File className={cn('h-6 w-6 text-slate-500', className)} />;
}

interface FlowPathsProps {
  uid: string;
  files: ComputeAnimationFile[];
  results: ProcessingResult[];
  visibleFiles: number;
  visibleResults: number;
  isComplete: boolean;
}

export function FlowPaths({
  uid,
  files,
  results,
  visibleFiles,
  visibleResults,
  isComplete,
}: FlowPathsProps) {
  return (
    <>
      {files.map((_, index) => {
        const y = getFileSlotY(index, files.length);
        const visible = index < visibleFiles;

        return (
          <path
            key={`base-l-${index}`}
            d={getLeftFlowPath(y)}
            fill="none"
            strokeWidth={FLOW_BASE_STROKE_WIDTH}
            style={{
              stroke: 'hsl(var(--border))',
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          />
        );
      })}

      {files.map((_, index) => {
        const y = getFileSlotY(index, files.length);
        const visible = index < visibleFiles;

        return (
          <path
            key={`particle-l-${index}`}
            d={getLeftFlowPath(y)}
            fill="none"
            stroke={`url(#particle-grad-${uid})`}
            strokeWidth={FLOW_PARTICLE_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={FLOW_PARTICLE_DASHARRAY}
            opacity={visible && !isComplete ? 1 : 0}
            style={{
              transition: 'opacity 0.5s ease',
              animation: `ca-particle-${uid} ${FLOW_PARTICLE_DURATION} linear infinite`,
              animationDelay: `${index * 0.2}s`,
            }}
          />
        );
      })}

      {results.map((_, index) => {
        const y = getResultSlotY(index, results.length);
        const visible = index < visibleResults;

        return (
          <path
            key={`base-r-${index}`}
            d={getRightFlowPath(y)}
            fill="none"
            strokeWidth={FLOW_BASE_STROKE_WIDTH}
            style={{
              stroke: 'hsl(var(--border))',
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.5s ease',
            }}
          />
        );
      })}

      {results.map((_, index) => {
        const y = getResultSlotY(index, results.length);
        const visible = index < visibleResults;

        return (
          <path
            key={`particle-r-${index}`}
            d={getRightFlowPath(y)}
            fill="none"
            stroke={`url(#particle-grad-${uid})`}
            strokeWidth={FLOW_PARTICLE_STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={FLOW_PARTICLE_DASHARRAY}
            opacity={visible ? 1 : 0}
            style={{
              transition: 'opacity 0.5s ease',
              animation: `ca-particle-${uid} ${FLOW_PARTICLE_DURATION} linear infinite`,
              animationDelay: `${index * 0.3}s`,
            }}
          />
        );
      })}
    </>
  );
}

export function ComputeCube({ uid, isComplete }: { uid: string; isComplete: boolean }) {
  return (
    <foreignObject x="350" y="130" width="200" height="200" className="pointer-events-none">
      <div className="flex h-full w-full items-center justify-center">
        <div className={`ca-cube-wrapper-${uid}`}>
          <div className={`ca-cube-${uid}`}>
            {COMPUTE_CUBE_FACES.map((face) => (
              <div key={face} className={`ca-face-${uid} ${face}`}>
                <svg
                  width="100"
                  height="100"
                  viewBox="0 0 100 100"
                  className="pointer-events-none absolute left-0 top-0"
                >
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                    fill="none"
                    stroke="hsl(var(--muted-foreground) / 0.6)"
                    strokeWidth="1"
                    strokeDasharray="50 350"
                    className={`ca-edge-pulse-${uid}`}
                  />
                </svg>
              </div>
            ))}

            <div className={cn(`ca-core-${uid}`, isComplete && 'settled')}>
              <div className={`ca-nucleus-${uid}`}></div>

              {[1, 2, 3].map((orbitIndex) => (
                <div key={orbitIndex} className={`ca-orbit-${uid} ca-orbit-${orbitIndex}-${uid}`}>
                  <div
                    className={`ca-electron-container-${uid} ca-spin-${orbitIndex}-${uid}`}
                  >
                    <div className={`ca-electron-${uid}`}></div>
                    <div className={`ca-electron-${uid} ca-electron-secondary-${uid}`}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </foreignObject>
  );
}

export function CompletionBadge({ isComplete }: { isComplete: boolean }) {
  return (
    <g
      style={{
        opacity: isComplete ? 1 : 0,
        transform: isComplete
          ? 'translate(450px, 230px) scale(1)'
          : 'translate(450px, 230px) scale(0.5)',
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
  );
}

interface FileCardsProps {
  files: ComputeAnimationFile[];
  visibleFiles: number;
}

export function FileCards({ files, visibleFiles }: FileCardsProps) {
  return (
    <>
      {files.map((file, index) => {
        const y = getFileSlotY(index, files.length);
        const visible = index < visibleFiles;

        return (
          <foreignObject
            key={`file-${index}`}
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
            <div className="flex h-full w-full items-center overflow-hidden rounded-lg border border-border bg-card px-3 text-card-foreground shadow-sm dark:shadow-none">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <FileIcon type={file.type} />
              </div>
              <div className="ml-3 flex min-w-0 flex-1 flex-col justify-center">
                <div className="truncate text-sm font-medium text-foreground">{file.name}</div>
                <div className="truncate text-[10px] font-mono uppercase leading-tight tracking-wider text-muted-foreground">
                  {file.type}
                </div>
              </div>
            </div>
          </foreignObject>
        );
      })}
    </>
  );
}

interface ResultCardsProps {
  results: ProcessingResult[];
  visibleResults: number;
}

export function ResultCards({ results, visibleResults }: ResultCardsProps) {
  return (
    <>
      {results.map((result, index) => {
        const y = getResultSlotY(index, results.length);
        const visible = index < visibleResults;

        return (
          <foreignObject
            key={`result-${index}`}
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
            <div className="flex h-full w-full items-center overflow-hidden rounded-lg border border-border bg-card px-3 text-card-foreground shadow-sm dark:shadow-none">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
                <DynamicIcon
                  name={result.icon || result.type}
                  className="h-4 w-4 text-primary"
                />
              </div>
              <div className="ml-3 flex min-w-0 flex-1 flex-col justify-center">
                <div className="truncate text-sm font-medium text-foreground">{result.label}</div>
                {result.detail ? (
                  <div className="truncate text-xs text-muted-foreground">{result.detail}</div>
                ) : null}
              </div>
            </div>
          </foreignObject>
        );
      })}
    </>
  );
}

export function ComputeAnimationStatus({ isComplete }: { isComplete: boolean }) {
  return (
    <>
      <text
        x="450"
        y="410"
        textAnchor="middle"
        fontSize="14"
        fontFamily="'Plus Jakarta Sans', system-ui, sans-serif"
        fontWeight="500"
        style={{ fill: 'hsl(var(--muted-foreground))', transition: 'opacity 0.4s ease' }}
      >
        {isComplete ? 'Analysis complete' : 'Analyzing your data…'}
      </text>

      <rect x="375" y="425" width="150" height="4" rx="2" style={{ fill: 'hsl(var(--muted))' }} />
      <rect
        x="375"
        y="425"
        width={isComplete ? '150' : '0'}
        height="4"
        rx="2"
        style={{ fill: 'currentColor', transition: 'width 0.8s ease' }}
      />
    </>
  );
}
