export type PreviewLoopId =
  | 'hero-montage'
  | 'ingest'
  | 'explore'
  | 'preprocess'
  | 'engineer'
  | 'train'
  | 'experiments'
  | 'deploy';

export type PreviewSlotKind = 'hero' | 'phase';

export type PreviewPreloadStrategy = 'auto' | 'metadata' | 'none';

export interface PreviewLoopAsset {
  id: PreviewLoopId;
  slotKind: PreviewSlotKind;
  webmSrc: string;
  mp4Src: string;
  posterSrc: string;
  ariaLabel: string;
  preloadStrategy: PreviewPreloadStrategy;
}
