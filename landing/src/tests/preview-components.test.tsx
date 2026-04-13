import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const landingRoot = path.resolve(import.meta.dirname, '..');
const frontendRoot = path.resolve(landingRoot, '../../frontend/src');

describe('preview source guardrails', () => {
  it('mounts the frontend demo workspace instead of the landing preview shell', () => {
    const source = readFileSync(
      path.resolve(landingRoot, 'components/AppPreviewFrame.tsx'),
      'utf8',
    );

    expect(source).toContain('@frontend/demo/landing');
    expect(source).not.toContain('PreviewShell');
  });

  it('builds the preview out of real frontend surfaces', () => {
    const source = readFileSync(
      path.resolve(frontendRoot, 'demo/landing/DemoWorkspace.tsx'),
      'utf8',
    );

    expect(source).toContain('TrainingProgressCard');
    expect(source).toContain('ModelRecommendationCard');
    expect(source).toContain('QuestionCards');
    expect(source).toContain('DataTable');
    expect(source).toContain('OverviewColumnCards');
    expect(source).toContain('FeatureSuggestionCard');
    expect(source).toContain('Leaderboard');
    expect(source).toContain('DeploymentDetail');
  });

  it('removes the legacy landing preview clone runtime', () => {
    expect(existsSync(path.resolve(landingRoot, 'preview/PreviewShell.tsx'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'preview/previewStore.ts'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'islands/PreviewIsland.tsx'))).toBe(false);
  });
});
