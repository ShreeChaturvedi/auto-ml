function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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

/**
 * Gap #1 fix: walk the tool-call history directly, group write_cell/edit_cell
 * calls by resolved cellId, and return the LATEST `args.content` per cell up
 * to (but not including) the first cell that crosses a STOP pattern. This
 * reflects the notebook's LIVE state — any mid-turn LLM correction (e.g.
 * rewriting a Dataset Prep cell with a robust pd.read_csv) replaces the
 * prior naive version in the extracted segments.
 *
 * Previously this function read `metadata.trainingDraft.segments` which is
 * a snapshot of the LLM's INITIAL plan, frozen on the first write_cell.
 * When the LLM re-wrote a cell, the notebook's actual content updated but
 * the metadata snapshot did not, so evaluation replayed the naive first
 * attempt and crashed (ragged CSV ParserError, NaN-y train_test_split).
 * The defensive pd.read_csv / train_test_split monkey-patches in
 * evaluationService.ts covered those specific known failure modes; this
 * fix addresses the root cause so future LLM-correction patterns don't
 * re-surface the same class of bug.
 *
 * When `cellIds` is supplied, only write/edit calls whose resolved cellId
 * belongs to that set contribute to the extracted segments — used by
 * registrationTools to bind the replay to a specific run's cells.
 */
export function extractWorkflowPrepSegmentsFromToolCalls(
  toolCalls: unknown,
  experimentId: string,
  cellIds?: Iterable<string> | null,
): string[] {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const allowedCellIds = cellIds ? new Set(cellIds) : null;
  const resultOutputRecord = (toolCall: unknown): Record<string, unknown> | undefined => {
    const rec = asRecord(toolCall);
    if (!rec) return undefined;
    // Canonical ToolResult shape: toolCall.result.output.cellId
    const result = asRecord(rec.result);
    if (result) {
      const output = asRecord(result.output);
      if (output) return output;
    }
    // Flat shapes some persisted histories use — toolCall.output.cellId
    // OR toolCall.output.output.cellId.
    const topOutput = asRecord(rec.output);
    if (topOutput) {
      const nested = asRecord(topOutput.output);
      if (nested) return nested;
      return topOutput;
    }
    return undefined;
  };

  // Preserve first-written order per cellId. If a cell is re-written, the
  // slot position stays fixed (matching the notebook's visual order) but the
  // content is replaced with the latest revision.
  const orderedCellKeys: string[] = [];
  const latestContentByKey = new Map<string, string>();
  // Fallback for calls that never get back a cellId — keyed by insertion
  // index in the history. Anonymous contents are rare but we don't want to
  // silently drop them.
  let anonymousCounter = 0;

  for (const toolCall of calls) {
    const rec = asRecord(toolCall);
    if (!rec) continue;
    const tool = asString(rec.tool);
    if (tool !== 'write_cell' && tool !== 'edit_cell' && tool !== 'insert_cell') {
      continue;
    }
    const args = asRecord(rec.args);
    const metadata = asRecord(args?.metadata);
    const trainingDraft = asRecord(metadata?.trainingDraft);
    if (trainingDraft?.experimentId !== experimentId) {
      continue;
    }

    const argCellId = asString(args?.cellId);
    const output = resultOutputRecord(toolCall);
    const outputCellId = asString(output?.cellId) ?? asString(asRecord(output?.cell)?.cellId);
    const resolvedCellId = argCellId ?? outputCellId ?? null;

    if (allowedCellIds && resolvedCellId && !allowedCellIds.has(resolvedCellId)) {
      continue;
    }

    const content = asString(args?.content);
    if (!content) {
      // No live content on this call — skip rather than fall back to the
      // frozen plan. Most write/edit tool calls carry `args.content`; the
      // ones that don't are typically metadata-only no-ops.
      continue;
    }

    const key = resolvedCellId ?? `__anon_${anonymousCounter++}`;
    if (!latestContentByKey.has(key)) {
      orderedCellKeys.push(key);
    }
    latestContentByKey.set(key, content);
  }

  // If the live-content walk found nothing (e.g. older stored tool-call
  // history entries that only carried metadata, or a future shape change
  // that drops `args.content`), fall back to the legacy frozen-segments
  // path keyed on the latest tool call with matching experimentId. This
  // intentionally does NOT require `tool` to equal write_cell/edit_cell
  // because older persisted history may not carry that field — matching
  // the pre-gap-1 behaviour of this function.
  if (orderedCellKeys.length === 0) {
    let latestFromSegments: string[] = [];
    for (const toolCall of calls) {
      const rec = asRecord(toolCall);
      if (!rec) continue;
      const args = asRecord(rec.args);
      const metadata = asRecord(args?.metadata);
      const trainingDraft = asRecord(metadata?.trainingDraft);
      if (trainingDraft?.experimentId !== experimentId) continue;
      if (allowedCellIds) {
        const cellId = asString(args?.cellId);
        if (cellId && !allowedCellIds.has(cellId)) continue;
      }
      const extracted = extractWorkflowPrepSegmentsFromSegments(trainingDraft?.segments);
      if (extracted.length > 0) {
        latestFromSegments = extracted;
      }
    }
    return latestFromSegments.map(normalizePrepSegmentCode);
  }

  // Walk the live-content list in notebook order, normalizing and stopping
  // at the first segment that crosses a STOP pattern. The stopping cell
  // itself is excluded — it's the model-fit / save / marker cell, not
  // prep.
  const prepSegments: string[] = [];
  for (const key of orderedCellKeys) {
    const content = latestContentByKey.get(key);
    if (!content) continue;
    if (STOP_SEGMENT_PATTERNS.some((pattern) => pattern.test(content))) {
      break;
    }
    prepSegments.push(normalizePrepSegmentCode(content));
  }
  return prepSegments;
}
