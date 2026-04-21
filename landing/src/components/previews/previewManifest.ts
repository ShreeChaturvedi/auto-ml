import { previewAssetVersion } from './generatedPreviewVersion';
import type { PreviewLoopAsset, PreviewLoopId } from './types';

const PREVIEW_ROOT = '/previews';

function versionedPreviewPath(fileName: string): string {
  return `${PREVIEW_ROOT}/${fileName}?v=${previewAssetVersion}`;
}

function asset(
  id: PreviewLoopId,
  slotKind: PreviewLoopAsset['slotKind'],
  ariaLabel: string,
  preloadStrategy: PreviewLoopAsset['preloadStrategy'],
): PreviewLoopAsset {
  return {
    id,
    slotKind,
    webmSrc: versionedPreviewPath(`${id}.webm`),
    mp4Src: versionedPreviewPath(`${id}.mp4`),
    posterSrc: versionedPreviewPath(`${id}.webp`),
    ariaLabel,
    preloadStrategy,
  };
}

export const previewManifest = {
  'hero-montage': asset(
    'hero-montage',
    'hero',
    'Product workflow montage showing upload, exploration, preprocessing, training, and deployment.',
    // 'metadata' keeps LCP clean: browser fetches moov + a few seconds of
    // frames (~1-2 MB) during page load instead of the full body. Autoplay
    // streams the rest on demand. 'auto' was fine for the 352 KB Remotion
    // montage but would block LCP with the 15 MB long-form walkthrough.
    'metadata',
  ),
  ingest: asset(
    'ingest',
    'phase',
    'Upload workflow preview showing dataset ingest and planning.',
    'metadata',
  ),
  explore: asset(
    'explore',
    'phase',
    'Explore workflow preview showing a natural-language query producing results.',
    'metadata',
  ),
  preprocess: asset(
    'preprocess',
    'phase',
    'Preprocess workflow preview showing notebook-driven data cleanup.',
    'metadata',
  ),
  engineer: asset(
    'engineer',
    'phase',
    'Feature engineering workflow preview showing derived features and rankings.',
    'metadata',
  ),
  train: asset(
    'train',
    'phase',
    'Training workflow preview showing models progressing to a champion.',
    'metadata',
  ),
  experiments: asset(
    'experiments',
    'phase',
    'Experiments workflow preview showing ranked runs and model explanation.',
    'metadata',
  ),
  deploy: asset(
    'deploy',
    'phase',
    'Deployment workflow preview showing a model becoming live.',
    'metadata',
  ),
} satisfies Record<PreviewLoopId, PreviewLoopAsset>;

export function getPreviewAsset(id: PreviewLoopId): PreviewLoopAsset {
  return previewManifest[id];
}
