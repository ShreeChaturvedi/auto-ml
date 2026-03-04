/**
 * NlFlowConnector
 *
 * Vertical connector between NL workflow blocks.
 * Pulses intentionally mirror ComputeAnimation's line-particle behavior.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  FLOW_BASE_STROKE_WIDTH,
  FLOW_PARTICLE_DASHARRAY,
  FLOW_PARTICLE_DURATION,
  FLOW_PARTICLE_OFFSET_END,
  FLOW_PARTICLE_OFFSET_START,
  FLOW_PARTICLE_PATH_LENGTH,
  FLOW_PARTICLE_STROKE_WIDTH,
} from '@/lib/animation/flowPulseTokens';

interface NlFlowConnectorProps {
  state: 'active' | 'settled';
  variant?: 'fan-in' | 'fan-out';
  stretch?: boolean;
  className?: string;
}

type ConnectorBranch = {
  d: string;
  start: [number, number];
  end: [number, number];
};

const SVG_WIDTH = 156;
const BASE_HEIGHT = 64;
const CX = SVG_WIDTH / 2;
const EDGE_LEFT = 12;
const EDGE_RIGHT = SVG_WIDTH - EDGE_LEFT;
const CONTROL_LEFT = 24;
const CONTROL_RIGHT = SVG_WIDTH - CONTROL_LEFT;

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildFanOutBranches(height: number): readonly ConnectorBranch[] {
  const h = roundCoord(height);
  return [
    {
      d: `M ${CX} 0 C ${CX} ${roundCoord(h * 0.34)}, ${CONTROL_LEFT} ${roundCoord(h * 0.56)}, ${EDGE_LEFT} ${h}`,
      start: [CX, 0],
      end: [EDGE_LEFT, h],
    },
    {
      d: `M ${CX} 0 C ${CX} ${roundCoord(h * 0.22)}, ${CX} ${roundCoord(h * 0.7)}, ${CX} ${h}`,
      start: [CX, 0],
      end: [CX, h],
    },
    {
      d: `M ${CX} 0 C ${CX} ${roundCoord(h * 0.34)}, ${CONTROL_RIGHT} ${roundCoord(h * 0.56)}, ${EDGE_RIGHT} ${h}`,
      start: [CX, 0],
      end: [EDGE_RIGHT, h],
    },
  ] as const;
}

function buildFanInBranches(height: number): readonly ConnectorBranch[] {
  const h = roundCoord(height);
  return [
    {
      d: `M ${EDGE_LEFT} 0 C ${EDGE_LEFT} ${roundCoord(h * 0.46)}, ${CX} ${roundCoord(h * 0.62)}, ${CX} ${h}`,
      start: [EDGE_LEFT, 0],
      end: [CX, h],
    },
    {
      d: `M ${CX} 0 C ${CX} ${roundCoord(h * 0.24)}, ${CX} ${roundCoord(h * 0.72)}, ${CX} ${h}`,
      start: [CX, 0],
      end: [CX, h],
    },
    {
      d: `M ${EDGE_RIGHT} 0 C ${EDGE_RIGHT} ${roundCoord(h * 0.46)}, ${CX} ${roundCoord(h * 0.62)}, ${CX} ${h}`,
      start: [EDGE_RIGHT, 0],
      end: [CX, h],
    },
  ] as const;
}

const BRANCH_DELAYS_FAN_IN = ['0s', '0.2s', '0.4s'] as const;
const BRANCH_DELAYS_FAN_OUT = ['0s', '0.3s', '0.6s'] as const;

function NlFlowConnector({
  state,
  variant = 'fan-out',
  stretch = false,
  className
}: NlFlowConnectorProps) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(BASE_HEIGHT);

  const gradientRootId = `nl-grad-${uid}`;
  const animName = `nl-particle-${uid}`;

  useEffect(() => {
    if (!stretch) {
      return;
    }
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextHeight = Math.round(entry.contentRect.height);
      if (nextHeight > 0) {
        setMeasuredHeight(nextHeight);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [stretch]);

  const connectorHeight = stretch
    ? Math.max(BASE_HEIGHT, measuredHeight)
    : BASE_HEIGHT;

  const isActive = state === 'active';
  const branches = useMemo(
    () => variant === 'fan-in'
      ? buildFanInBranches(connectorHeight)
      : buildFanOutBranches(connectorHeight),
    [variant, connectorHeight]
  );
  const branchDelays = variant === 'fan-in' ? BRANCH_DELAYS_FAN_IN : BRANCH_DELAYS_FAN_OUT;

  return (
    <div
      ref={containerRef}
      className={cn('flex w-full items-center justify-center text-primary', className)}
      style={{ height: stretch ? '100%' : BASE_HEIGHT }}
    >
      <style>{`
        @keyframes ${animName} {
          0%   { stroke-dashoffset: ${FLOW_PARTICLE_OFFSET_START}; }
          100% { stroke-dashoffset: ${FLOW_PARTICLE_OFFSET_END}; }
        }
        @media (prefers-reduced-motion: reduce) {
          .nl-conn-${uid} * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

      <svg
        width={SVG_WIDTH}
        height={connectorHeight}
        viewBox={`0 0 ${SVG_WIDTH} ${connectorHeight}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        className={`nl-conn-${uid}`}
      >
        <defs>
          {branches.map((branch, index) => {
            const gradientId = `${gradientRootId}-${index}`;
            return (
              <linearGradient
                key={gradientId}
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1={branch.start[0]}
                y1={branch.start[1]}
                x2={branch.end[0]}
                y2={branch.end[1]}
              >
                <stop offset="0%" style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
                <stop offset="50%" style={{ stopColor: 'currentColor', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: 'currentColor', stopOpacity: 0 }} />
              </linearGradient>
            );
          })}
        </defs>

        {branches.map((branch, index) => {
          const gradientId = `${gradientRootId}-${index}`;
          return (
            <g key={gradientId}>
              <path
                d={branch.d}
                fill="none"
                strokeWidth={FLOW_BASE_STROKE_WIDTH}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{
                  stroke: 'hsl(var(--border))',
                  opacity: isActive ? 1 : 0.72,
                  transition: 'opacity 0.45s ease',
                }}
              />

              <path
                d={branch.d}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={FLOW_PARTICLE_STROKE_WIDTH}
                strokeLinecap="round"
                strokeDasharray={FLOW_PARTICLE_DASHARRAY}
                pathLength={FLOW_PARTICLE_PATH_LENGTH}
                vectorEffect="non-scaling-stroke"
                style={{
                  opacity: isActive ? 1 : 0,
                  transition: 'opacity 0.35s ease',
                  animation: `${animName} ${FLOW_PARTICLE_DURATION} linear infinite`,
                  animationDelay: branchDelays[index],
                }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

NlFlowConnector.displayName = 'NlFlowConnector';

export { NlFlowConnector };
export type { NlFlowConnectorProps };
