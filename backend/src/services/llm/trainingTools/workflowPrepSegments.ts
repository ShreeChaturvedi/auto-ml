function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

const STOP_SEGMENT_PATTERNS = [
  /\.fit\(/,
  /fit_predict\(/,
  /predict\(/,
  /joblib\.dump\(/,
  /__TRAIN_COMPLETE__/,
];

function normalizePrepSegmentCode(segment: string): string {
  return segment
    // Older workflow cells sometimes used Series.view("int64"), which is not
    // portable across the pandas versions used during later evaluation replay.
    .replace(/\.view\(\s*(['"])int64\1\s*\)/g, '.astype("int64")');
}

export function normalizeWorkflowPrepSegments(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((segment): segment is string => typeof segment === 'string' && segment.trim().length > 0)
    .map((segment) => normalizePrepSegmentCode(segment));
}

export function extractWorkflowPrepSegmentsFromSegments(segments: unknown): string[] {
  const rawSegments = Array.isArray(segments) ? segments : [];
  const contents = rawSegments
    .map((segment) => asRecord(segment)?.content)
    .filter((content): content is string => typeof content === 'string' && content.trim().length > 0);

  const prepSegments: string[] = [];
  for (const segment of contents) {
    if (STOP_SEGMENT_PATTERNS.some((pattern) => pattern.test(segment))) {
      break;
    }
    prepSegments.push(segment);
  }
  return prepSegments;
}

export function extractWorkflowPrepSegmentsFromToolCalls(
  toolCalls: unknown,
  experimentId: string,
  cellIds?: Iterable<string> | null,
): string[] {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const allowedCellIds = cellIds ? new Set(cellIds) : null;

  let latestSegments: string[] = [];
  for (const toolCall of calls) {
    const args = asRecord(asRecord(toolCall)?.args);
    const metadata = asRecord(args?.metadata);
    const trainingDraft = asRecord(metadata?.trainingDraft);

    if (trainingDraft?.experimentId !== experimentId) {
      continue;
    }
    if (allowedCellIds && typeof args?.cellId === 'string' && !allowedCellIds.has(args.cellId)) {
      continue;
    }

    const extracted = extractWorkflowPrepSegmentsFromSegments(trainingDraft?.segments);
    if (extracted.length > 0) {
      latestSegments = extracted;
    }
  }

  return latestSegments;
}
