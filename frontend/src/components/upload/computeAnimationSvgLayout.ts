export const MAX_VISIBLE_FILE_SLOTS = 6;

export const COMPUTE_CUBE_FACES = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;

export function getDistributedSlotY(index: number, totalCount: number) {
  const count = Math.max(totalCount, 1);

  if (count === 1) {
    return 230;
  }

  const gap = 300 / (count - 1);
  return 80 + index * gap;
}

export function getFileSlotY(index: number, fileCount: number) {
  return getDistributedSlotY(index, Math.min(fileCount, MAX_VISIBLE_FILE_SLOTS));
}

export function getResultSlotY(index: number, resultCount: number) {
  return getDistributedSlotY(index, resultCount);
}

export function getLeftFlowPath(y: number) {
  return `M 200 ${y} C 280 ${y}, 270 230, 350 230`;
}

export function getRightFlowPath(y: number) {
  return `M 550 230 C 630 230, 620 ${y}, 700 ${y}`;
}
