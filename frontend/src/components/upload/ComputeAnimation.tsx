/**
 * ComputeAnimation — Animated inline SVG data-pipeline visualization
 *
 * Layout:
 *   [Left: Input Files] ──flowing lines──▸ [Center: Compute Mesh] ──flowing lines──▸ [Right: Result Cards]
 *
 * Uses pure CSS @keyframes for flowing dash-offset animations (GPU-composited)
 * and CSS transitions for staggered entrance/exit of file icons and result cards.
 * Includes `prefers-reduced-motion` fallback that disables all motion.
 *
 * Color palette: grayscale + subtle blue-gray accent (#94a3b8)
 */

import { useEffect, useState, useId, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { ComputeAnimationProps } from '@/types/processing';

// ── Mesh geometry ────────────────────────────────────────────────
// Hexagonal-ish mesh of interconnected nodes in the center.
// Coordinates are in the SVG viewBox (0 0 900 460) space.

interface MeshNode { x: number; y: number }

const MESH_NODES: MeshNode[] = [
  // outer ring
  { x: 450, y: 130 },
  { x: 510, y: 155 },
  { x: 530, y: 220 },
  { x: 510, y: 285 },
  { x: 450, y: 310 },
  { x: 390, y: 285 },
  { x: 370, y: 220 },
  { x: 390, y: 155 },
  // inner ring
  { x: 450, y: 175 },
  { x: 485, y: 195 },
  { x: 485, y: 245 },
  { x: 450, y: 265 },
  { x: 415, y: 245 },
  { x: 415, y: 195 },
  // center
  { x: 450, y: 220 },
];

// Edges as [fromIdx, toIdx] pairs
const MESH_EDGES: [number, number][] = [
  // outer ring
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0],
  // outer → inner
  [0, 8], [1, 9], [2, 10], [3, 11], [4, 11], [5, 12], [6, 13], [7, 13],
  // inner ring
  [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 8],
  // inner → center
  [8, 14], [9, 14], [10, 14], [11, 14], [12, 14], [13, 14],
];

// ── File type to icon SVG path snippets ─────────────────────────
function fileTypeIcon(type: string): { path: string; color: string } {
  switch (type) {
    case 'csv':
    case 'json':
    case 'excel':
      return {
        // table/grid icon
        path: 'M3 3h18v18H3V3zm2 4h14M3 11h18M9 7v14M15 7v14',
        color: '#6b7280',
      };
    case 'pdf':
      return {
        // document icon
        path: 'M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 0v6h6M8 13h8M8 17h5',
        color: '#9ca3af',
      };
    default:
      return {
        // generic file
        path: 'M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm8 0v6h6',
        color: '#9ca3af',
      };
  }
}

// ── Truncate filenames ──────────────────────────────────────────
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  const ext = str.lastIndexOf('.');
  if (ext > 0 && str.length - ext <= 5) {
    const keep = max - (str.length - ext) - 1;
    return `${str.slice(0, Math.max(keep, 4))}…${str.slice(ext)}`;
  }
  return `${str.slice(0, max - 1)}…`;
}

// ── Main Component ──────────────────────────────────────────────

export function ComputeAnimation({ files, results, isComplete, onSettled }: ComputeAnimationProps) {
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
    const totalHeight = 300;
    const gap = maxSlots > 1 ? totalHeight / (maxSlots - 1) : 0;
    const startY = maxSlots > 1 ? 80 : 200;
    return startY + i * gap;
  };

  // Positions for result card slots on the right
  const resultSlotY = (i: number) => {
    const totalHeight = 280;
    const count = Math.max(results.length, 1);
    const gap = count > 1 ? totalHeight / (count - 1) : 0;
    const startY = count > 1 ? 90 : 220;
    return startY + i * gap;
  };

  return (
    <div
      className="w-full max-w-[56rem] mx-auto px-4"
      role="img"
      aria-label={
        isComplete
          ? 'Data processing complete'
          : 'Analyzing your uploaded files…'
      }
    >
      {/* CSS keyframes — scoped by unique id */}
      <style>{`
        @keyframes ca-dash-${uid} {
          to { stroke-dashoffset: -40; }
        }
        @keyframes ca-pulse-${uid} {
          0%, 100% { opacity: 0.5; r: 3.5; }
          50%      { opacity: 1;   r: 5; }
        }
        @keyframes ca-glow-${uid} {
          0%, 100% { filter: drop-shadow(0 0 2px rgba(148,163,184,0.3)); }
          50%      { filter: drop-shadow(0 0 6px rgba(148,163,184,0.55)); }
        }
        @keyframes ca-spin-${uid} {
          to { transform: rotate(360deg); }
        }
        @keyframes ca-settle-${uid} {
          0%   { stroke-dashoffset: -40; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes ca-checkmark-${uid} {
          0%   { stroke-dashoffset: 30; opacity: 0; }
          50%  { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
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
          {/* Gradient for mesh edges */}
          <linearGradient id={`mesh-grad-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e5e7eb" />
            <stop offset="50%" stopColor="#9ca3af" />
            <stop offset="100%" stopColor="#374151" />
          </linearGradient>

          {/* Subtle radial glow behind mesh */}
          <radialGradient id={`mesh-bg-${uid}`} cx="50%" cy="48%" r="28%">
            <stop offset="0%" stopColor="#e5e7eb" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#e5e7eb" stopOpacity="0" />
          </radialGradient>

          {/* Accent gradient for flowing particles */}
          <linearGradient id={`accent-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity="0" />
            <stop offset="50%" stopColor="#94a3b8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#94a3b8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ─── Background glow behind mesh ─── */}
        <circle cx="450" cy="220" r="130" fill={`url(#mesh-bg-${uid})`} />

        {/* ─── Left: flowing connector lines from files → mesh ─── */}
        {files.slice(0, 6).map((_, i) => {
          const y = fileSlotY(i);
          const visible = i < visibleFiles;
          return (
            <path
              key={`flow-l-${i}`}
              d={`M 170 ${y} C 270 ${y}, 310 220, 370 220`}
              fill="none"
              stroke="#d1d5db"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity={visible ? 1 : 0}
              style={{
                transition: 'opacity 0.5s ease',
                animation: visible && !isComplete
                  ? `ca-dash-${uid} 1.2s linear infinite`
                  : 'none',
              }}
            />
          );
        })}

        {/* Accent flow overlay — left */}
        {files.slice(0, 6).map((_, i) => {
          const y = fileSlotY(i);
          const visible = i < visibleFiles;
          return (
            <path
              key={`accent-l-${i}`}
              d={`M 170 ${y} C 270 ${y}, 310 220, 370 220`}
              fill="none"
              stroke={`url(#accent-${uid})`}
              strokeWidth="2.5"
              strokeDasharray="20 80"
              opacity={visible && !isComplete ? 0.6 : 0}
              style={{
                transition: 'opacity 0.5s ease',
                animation: visible && !isComplete
                  ? `ca-dash-${uid} 2s linear infinite`
                  : 'none',
              }}
            />
          );
        })}

        {/* ─── Right: flowing connector lines from mesh → result cards ─── */}
        {results.map((_, i) => {
          const y = resultSlotY(i);
          const visible = i < visibleResults;
          return (
            <path
              key={`flow-r-${i}`}
              d={`M 530 220 C 590 220, 620 ${y}, 680 ${y}`}
              fill="none"
              stroke="#d1d5db"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity={visible ? 1 : 0}
              style={{
                transition: 'opacity 0.5s ease',
                animation: visible && !isComplete
                  ? `ca-dash-${uid} 1.2s linear infinite`
                  : isComplete
                    ? `ca-settle-${uid} 0.8s ease forwards`
                    : 'none',
              }}
            />
          );
        })}

        {/* ─── Center: Compute Mesh ─── */}
        <g
          style={{
            animation: !isComplete
              ? `ca-glow-${uid} 3s ease-in-out infinite`
              : 'none',
            transition: 'filter 1s ease',
          }}
        >
          {/* Mesh edges */}
          {MESH_EDGES.map(([a, b], i) => (
            <line
              key={`edge-${i}`}
              x1={MESH_NODES[a].x}
              y1={MESH_NODES[a].y}
              x2={MESH_NODES[b].x}
              y2={MESH_NODES[b].y}
              stroke={`url(#mesh-grad-${uid})`}
              strokeWidth="1.2"
              opacity={isComplete ? 0.4 : 0.7}
              style={{ transition: 'opacity 1s ease' }}
            />
          ))}

          {/* Animated dash overlay on edges */}
          {MESH_EDGES.map(([a, b], i) => (
            <line
              key={`edge-anim-${i}`}
              x1={MESH_NODES[a].x}
              y1={MESH_NODES[a].y}
              x2={MESH_NODES[b].x}
              y2={MESH_NODES[b].y}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="4 8"
              opacity={isComplete ? 0 : 0.5}
              style={{
                transition: 'opacity 1s ease',
                animation: !isComplete
                  ? `ca-dash-${uid} ${1.5 + (i % 3) * 0.3}s linear infinite`
                  : 'none',
                animationDelay: `${(i % 5) * 0.15}s`,
              }}
            />
          ))}

          {/* Mesh nodes */}
          {MESH_NODES.map((node, i) => (
            <circle
              key={`node-${i}`}
              cx={node.x}
              cy={node.y}
              r={i === 14 ? 5 : 3.5}
              fill="#e5e7eb"
              stroke="#6b7280"
              strokeWidth={i === 14 ? 2 : 1.2}
              style={{
                animation: !isComplete
                  ? `ca-pulse-${uid} ${2 + (i % 4) * 0.5}s ease-in-out infinite`
                  : 'none',
                animationDelay: `${(i % 7) * 0.25}s`,
                transition: 'r 0.6s ease, opacity 0.6s ease',
              }}
            />
          ))}

          {/* Center processing spinner (hidden when complete) */}
          <g
            style={{
              transformOrigin: '450px 220px',
              animation: !isComplete
                ? `ca-spin-${uid} 4s linear infinite`
                : 'none',
              opacity: isComplete ? 0 : 0.35,
              transition: 'opacity 0.6s ease',
            }}
          >
            <circle
              cx="450"
              cy="220"
              r="18"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.5"
              strokeDasharray="28 85"
            />
          </g>

          {/* Completion checkmark (visible when complete) */}
          <g
            style={{
              opacity: isComplete ? 1 : 0,
              transition: 'opacity 0.5s ease 0.3s',
            }}
          >
            <circle cx="450" cy="220" r="16" fill="#e5e7eb" stroke="#4b5563" strokeWidth="1.5" />
            <path
              d="M441 220 l6 6 l12 -12"
              fill="none"
              stroke="#374151"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="30"
              style={{
                animation: isComplete
                  ? `ca-checkmark-${uid} 0.5s ease forwards 0.5s`
                  : 'none',
                strokeDashoffset: isComplete ? undefined : 30,
                opacity: isComplete ? undefined : 0,
              }}
            />
          </g>
        </g>

        {/* ─── Left: File icons with labels ─── */}
        {files.slice(0, 6).map((file, i) => {
          const y = fileSlotY(i);
          const visible = i < visibleFiles;
          const icon = fileTypeIcon(file.type);
          return (
            <g
              key={`file-${i}`}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-16px)',
                transition: 'opacity 0.5s ease, transform 0.5s ease',
              }}
            >
              {/* File card background */}
              <rect
                x="30"
                y={y - 22}
                width="130"
                height="44"
                rx="8"
                fill="white"
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              {/* Mini file icon */}
              <g transform={`translate(42, ${y - 10}) scale(0.8)`}>
                <path
                  d={icon.path}
                  fill="none"
                  stroke={icon.color}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              {/* Filename */}
              <text
                x="68"
                y={y - 3}
                fontSize="10"
                fontFamily="system-ui, sans-serif"
                fill="#374151"
                fontWeight="500"
              >
                {truncate(file.name, 14)}
              </text>
              {/* File type badge */}
              <text
                x="68"
                y={y + 11}
                fontSize="8"
                fontFamily="system-ui, sans-serif"
                fill="#9ca3af"
              >
                {file.type.toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* ─── Right: Result cards ─── */}
        {results.map((result, i) => {
          const y = resultSlotY(i);
          const visible = i < visibleResults;
          // Clamp label length for SVG rendering
          const displayLabel = truncate(result.label, 32);
          return (
            <g
              key={`result-${i}`}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(16px)',
                transition: 'opacity 0.6s ease, transform 0.6s ease',
              }}
            >
              {/* Card background */}
              <rect
                x="690"
                y={y - 18}
                width="190"
                height="36"
                rx="8"
                fill="white"
                stroke="#e5e7eb"
                strokeWidth="1"
                filter={isComplete ? undefined : 'none'}
              />
              <rect
                x="700"
                y={y - 9}
                width="24"
                height="18"
                rx="4"
                fill="#e5e7eb"
                stroke="#9ca3af"
                strokeWidth="1"
              />
              <text
                x="712"
                y={y + 3}
                textAnchor="middle"
                fontSize="7"
                fontFamily="system-ui, sans-serif"
                fill="#4b5563"
                fontWeight="600"
              >
                {result.icon}
              </text>
              {/* Label */}
              <text
                x="730"
                y={y + 3}
                fontSize="9.5"
                fontFamily="system-ui, sans-serif"
                fill="#374151"
                fontWeight="500"
              >
                {displayLabel}
              </text>
            </g>
          );
        })}

        {/* ─── "Analyzing…" / "Complete" label below mesh ─── */}
        <text
          x="450"
          y="360"
          textAnchor="middle"
          fontSize="13"
          fontFamily="system-ui, sans-serif"
          fill="#6b7280"
          fontWeight="500"
          style={{
            transition: 'opacity 0.4s ease',
          }}
        >
          {isComplete ? 'Analysis complete' : 'Analyzing your data…'}
        </text>

        {/* Subtle quality bar beneath the label */}
        <rect x="375" y="375" width="150" height="3" rx="1.5" fill="#d1d5db" />
        <rect
          x="375"
          y="375"
          width={isComplete ? '150' : '0'}
          height="3"
          rx="1.5"
          fill="#94a3b8"
          style={{
            transition: 'width 0.8s ease',
          }}
        />
      </svg>
    </div>
  );
}
