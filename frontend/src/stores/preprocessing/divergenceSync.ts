import type { NotebookCell } from '@/types/notebook';
import type { StepCellBinding, TransformationEvent } from '@/types/preprocessing';

import { hashTextAuthoritative } from './eventBuilders';

// ---------------------------------------------------------------------------
// syncDivergence — compares notebook cell hashes to step bindings and marks
// timeline events as 'diverged' or restores them when content matches again.
// ---------------------------------------------------------------------------

interface DivergenceSyncInput {
  cells: NotebookCell[];
  stepBindings: Record<string, StepCellBinding>;
}

/**
 * Builds a map of cellId → authoritative hash for every cell that is
 * referenced by at least one step binding with a known codeHash.
 */
async function buildBoundCellHashMap(
  cells: NotebookCell[],
  stepBindings: Record<string, StepCellBinding>
): Promise<Map<string, string>> {
  const contentByCellId = new Map(cells.map((cell) => [cell.cellId, cell.content]));
  const boundCellIdsToHash = new Set<string>();

  Object.values(stepBindings).forEach((binding) => {
    if (!binding?.codeHash || binding.cellIds.length === 0) {
      return;
    }
    binding.cellIds.forEach((cellId) => {
      const content = contentByCellId.get(cellId);
      if (typeof content === 'string') {
        boundCellIdsToHash.add(cellId);
      }
    });
  });

  if (boundCellIdsToHash.size === 0) {
    return new Map();
  }

  const hashedEntries = await Promise.all(
    [...boundCellIdsToHash].map(async (cellId) => {
      const content = contentByCellId.get(cellId);
      if (typeof content !== 'string') {
        return [cellId, null] as const;
      }
      const hash = await hashTextAuthoritative(content);
      return [cellId, hash] as const;
    })
  );

  return new Map(hashedEntries.filter((entry): entry is [string, string] => Boolean(entry[1])));
}

/**
 * Given a timeline and step bindings, returns an updated timeline where events
 * are marked 'diverged' (or restored) based on whether their bound cells still
 * match the expected code hash.
 */
export function applyDivergence(
  timeline: TransformationEvent[],
  stepBindings: Record<string, StepCellBinding>,
  hashByCellId: Map<string, string>
): TransformationEvent[] {
  return timeline.map((event) => {
    const binding = stepBindings[event.stepId];
    if (!binding?.codeHash || binding.cellIds.length === 0) {
      return event;
    }

    let comparedAnyBoundCell = false;
    const hasDiverged = binding.cellIds.some((cellId) => {
      const actualHash = hashByCellId.get(cellId);
      if (!actualHash) {
        return false;
      }
      comparedAnyBoundCell = true;
      return actualHash !== binding.codeHash;
    });

    if (!comparedAnyBoundCell) {
      return event;
    }

    if (hasDiverged && event.status !== 'diverged') {
      return { ...event, status: 'diverged', updatedAt: Date.now() };
    }

    if (!hasDiverged && event.status === 'diverged') {
      return {
        ...event,
        status: event.requiresApproval ? 'awaiting_approval' : 'applied',
        updatedAt: Date.now()
      };
    }

    return event;
  });
}

/**
 * Full divergence sync: hashes relevant notebook cells, then returns updated
 * timeline (or `null` if no update is needed).
 */
export async function computeDivergenceUpdate(
  input: DivergenceSyncInput
): Promise<Map<string, string> | null> {
  if (input.cells.length === 0) {
    return null;
  }

  const hashByCellId = await buildBoundCellHashMap(input.cells, input.stepBindings);
  if (hashByCellId.size === 0) {
    return null;
  }

  return hashByCellId;
}
