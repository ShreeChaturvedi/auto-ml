/**
 * Preview strategy map — composes all handler groups into a single dispatch map.
 */

import type { FeatureMethod } from '@/types/feature';
import type { PreviewFn } from './types';
import { numericHandlers } from './numericHandlers';
import { scalingHandlers } from './scalingHandlers';
import { encodingHandlers } from './encodingHandlers';
import { interactionHandlers } from './interactionHandlers';
import { binningHandlers } from './binningHandlers';
import { temporalHandlers } from './temporalHandlers';
import { textHandlers } from './textHandlers';

export const previewStrategyMap = new Map<FeatureMethod, PreviewFn>();

// Merge all handler groups into the unified strategy map
const handlerGroups: Map<FeatureMethod, PreviewFn>[] = [
  numericHandlers,
  scalingHandlers,
  encodingHandlers,
  interactionHandlers,
  binningHandlers,
  temporalHandlers,
  textHandlers,
];

for (const group of handlerGroups) {
  for (const [method, handler] of group) {
    previewStrategyMap.set(method, handler);
  }
}

// Re-export types for convenience
export type { PreviewContext, PreviewFn, Row, FeatureLike, FeaturePreviewResult } from './types';
