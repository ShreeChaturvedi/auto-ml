import type { Phase } from '@/types/phase';

import { DEMO_PROJECT_ID } from './demoState';

export type LandingPreviewCapturePreset =
  | 'ingest'
  | 'explore'
  | 'preprocess'
  | 'engineer'
  | 'train'
  | 'experiments'
  | 'deploy'
  | 'hero-upload'
  | 'hero-explore'
  | 'hero-preprocess'
  | 'hero-train'
  | 'hero-deploy';

export interface LandingPreviewCaptureConfig {
  preset: LandingPreviewCapturePreset;
  phase: Phase;
  initialEntry: string;
  sidebarCollapsed: boolean;
}

const routeForPhase = (phase: Phase, search: string = '') =>
  `/project/${DEMO_PROJECT_ID}/${phase}${search}`;

export const landingPreviewCapturePresets: Record<
  LandingPreviewCapturePreset,
  LandingPreviewCaptureConfig
> = {
  ingest: {
    preset: 'ingest',
    phase: 'upload',
    initialEntry: routeForPhase('upload'),
    sidebarCollapsed: false,
  },
  explore: {
    preset: 'explore',
    phase: 'data-viewer',
    initialEntry: routeForPhase('data-viewer'),
    sidebarCollapsed: false,
  },
  preprocess: {
    preset: 'preprocess',
    phase: 'preprocessing',
    initialEntry: routeForPhase('preprocessing'),
    sidebarCollapsed: false,
  },
  engineer: {
    preset: 'engineer',
    phase: 'feature-engineering',
    initialEntry: routeForPhase('feature-engineering'),
    sidebarCollapsed: false,
  },
  train: {
    preset: 'train',
    phase: 'training',
    initialEntry: routeForPhase('training'),
    sidebarCollapsed: false,
  },
  experiments: {
    preset: 'experiments',
    phase: 'experiments',
    initialEntry: routeForPhase('experiments'),
    sidebarCollapsed: false,
  },
  deploy: {
    preset: 'deploy',
    phase: 'deployment',
    initialEntry: routeForPhase('deployment'),
    sidebarCollapsed: false,
  },
  'hero-upload': {
    preset: 'hero-upload',
    phase: 'upload',
    initialEntry: routeForPhase('upload'),
    sidebarCollapsed: false,
  },
  'hero-explore': {
    preset: 'hero-explore',
    phase: 'data-viewer',
    initialEntry: routeForPhase('data-viewer'),
    sidebarCollapsed: false,
  },
  'hero-preprocess': {
    preset: 'hero-preprocess',
    phase: 'preprocessing',
    initialEntry: routeForPhase('preprocessing'),
    sidebarCollapsed: false,
  },
  'hero-train': {
    preset: 'hero-train',
    phase: 'training',
    initialEntry: routeForPhase('training'),
    sidebarCollapsed: false,
  },
  'hero-deploy': {
    preset: 'hero-deploy',
    phase: 'deployment',
    initialEntry: routeForPhase('deployment'),
    sidebarCollapsed: false,
  },
};

export function resolveLandingPreviewCapturePreset(
  rawPreset: string | null | undefined,
): LandingPreviewCapturePreset {
  if (!rawPreset) return 'ingest';
  return rawPreset in landingPreviewCapturePresets
    ? (rawPreset as LandingPreviewCapturePreset)
    : 'ingest';
}

export function getLandingPreviewCaptureConfig(
  rawPreset: string | null | undefined,
): LandingPreviewCaptureConfig {
  return landingPreviewCapturePresets[resolveLandingPreviewCapturePreset(rawPreset)];
}
