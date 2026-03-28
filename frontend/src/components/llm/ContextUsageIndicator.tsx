import { useMemo } from 'react';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent
} from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import type { LlmUsage } from '@/types/llmUi';

export interface ContextUsageIndicatorProps {
  sessionUsages: LlmUsage[];
  model: string;
  projectColorClass?: string;
  projectBgColorClass?: string;
  projectColor?: string;
}

// ---------------------------------------------------------------------------
// Model metadata — tokenlens's static catalog doesn't include our GPT-5.x
// models, so we maintain a small local table. Prices in USD per 1M tokens.
// ---------------------------------------------------------------------------

interface ModelMeta {
  contextWindow: number;
  maxOutput: number;
  inputPer1M: number;
  cachedPer1M: number;
  outputPer1M: number;
}

const MODEL_META: Record<string, ModelMeta> = {
  'gpt-5.4': {
    // Default standard limit is 272K; the 1.05M extended context requires
    // explicit opt-in via model_context_window config which we don't use.
    contextWindow: 272_000,
    maxOutput: 128_000,
    inputPer1M: 2.50,
    cachedPer1M: 0.25,
    outputPer1M: 15.00
  },
  'gpt-5.3-codex': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPer1M: 1.75,
    cachedPer1M: 0.175,
    outputPer1M: 14.00
  },
  'gpt-5.4-mini': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPer1M: 0.75,
    cachedPer1M: 0.075,
    outputPer1M: 4.50
  },
  'gpt-5.4-nano': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPer1M: 0.20,
    cachedPer1M: 0.02,
    outputPer1M: 1.25
  },
  'gpt-5-mini': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPer1M: 0.75,
    cachedPer1M: 0.075,
    outputPer1M: 4.50
  },
  'gpt-5-nano': {
    contextWindow: 400_000,
    maxOutput: 128_000,
    inputPer1M: 0.20,
    cachedPer1M: 0.02,
    outputPer1M: 1.25
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUSD(n: number): string {
  if (n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

interface SummedUsage {
  input: number;
  output: number;
  total: number;
  reasoning: number;
  cached: number;
}

function sumUsages(usages: LlmUsage[]): SummedUsage {
  let input = 0;
  let output = 0;
  let reasoning = 0;
  let cached = 0;

  for (const u of usages) {
    input += u.input_tokens;
    output += u.output_tokens;
    cached += u.input_tokens_details?.cached_tokens ?? 0;
    reasoning += u.output_tokens_details?.reasoning_tokens ?? 0;
  }

  return { input, output, total: input + output, reasoning, cached };
}

function computeCosts(usage: SummedUsage, meta: ModelMeta) {
  const inputUSD = (usage.input * meta.inputPer1M) / 1_000_000;
  const cachedUSD = (usage.cached * meta.cachedPer1M) / 1_000_000;
  const outputUSD = (usage.output * meta.outputPer1M) / 1_000_000;
  // Reasoning tokens are billed at output rate
  const reasoningUSD = (usage.reasoning * meta.outputPer1M) / 1_000_000;
  return {
    inputUSD,
    cachedUSD,
    outputUSD,
    reasoningUSD,
    totalUSD: inputUSD + cachedUSD + outputUSD + reasoningUSD
  };
}

// ---------------------------------------------------------------------------
// Ring constants
// ---------------------------------------------------------------------------

const RING_SIZE = 14;
const RING_STROKE = 1.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContextUsageIndicator({
  sessionUsages,
  model,
  projectColorClass,
  projectBgColorClass,
  projectColor
}: ContextUsageIndicatorProps) {
  const meta = MODEL_META[model] as ModelMeta | undefined;

  const { usage, costs, percentUsed, rows } = useMemo(() => {
    const usage = sumUsages(sessionUsages);
    const costs = meta ? computeCosts(usage, meta) : undefined;
    const percentUsed = meta ? (usage.total / meta.contextWindow) * 100 : 0;
    const rows = [
      { label: 'Input', tokens: usage.input, usd: costs?.inputUSD },
      { label: 'Cached', tokens: usage.cached, usd: costs?.cachedUSD },
      { label: 'Output', tokens: usage.output, usd: costs?.outputUSD },
      { label: 'Reasoning', tokens: usage.reasoning, usd: costs?.reasoningUSD }
    ].filter((r) => r.tokens > 0);
    return { usage, costs, percentUsed, rows };
  }, [sessionUsages, meta]);

  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - Math.min(percentUsed / 100, 1));

  // Resolve stroke/fill color: custom hex → inline style, theme → currentColor
  const ringStrokeStyle = projectColor ? { stroke: projectColor } : undefined;
  const barFillStyle = projectColor ? { backgroundColor: projectColor } : undefined;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
        >
          <span className={cn('inline-flex', !projectColor && projectColorClass)}>
            <svg
              width={RING_SIZE}
              height={RING_SIZE}
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              className="shrink-0"
            >
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={RING_STROKE}
                opacity={0.2}
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={RING_STROKE}
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                style={ringStrokeStyle}
              />
            </svg>
          </span>
          <span>{formatTokenCount(usage.total)}</span>
        </button>
      </HoverCardTrigger>

      <HoverCardContent side="top" align="start" className="w-60 p-0 text-xs">
        {/* Header: percentage + tokens used / context */}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="font-medium">{percentUsed.toFixed(1)}%</span>
          <span className="text-muted-foreground">
            {formatTokenCount(usage.total)}
            {meta ? ` / ${formatTokenCount(meta.contextWindow)}` : ' tokens'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="px-3 py-2 border-b">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300',
                !projectColor && !projectBgColorClass && 'bg-primary',
                !projectColor && projectBgColorClass
              )}
              style={{
                width: `${Math.max(Math.min(percentUsed, 100), 0.5)}%`,
                ...barFillStyle
              }}
            />
          </div>
        </div>

        {/* Token breakdown with costs */}
        <div className="space-y-1 px-3 py-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="tabular-nums">
                {formatTokenCount(row.tokens)}
                {row.usd != null ? (
                  <span className="text-muted-foreground">
                    {' '}&middot; {formatUSD(row.usd)}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        {/* Footer: total cost */}
        {costs ? (
          <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2 font-medium">
            <span>Total cost</span>
            <span className="tabular-nums">{formatUSD(costs.totalUSD)}</span>
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
