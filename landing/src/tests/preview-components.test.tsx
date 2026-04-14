import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const landingRoot = path.resolve(import.meta.dirname, '..');
const frontendRoot = path.resolve(landingRoot, '../../frontend/src');
const dioramaRoot = path.resolve(landingRoot, 'components/how-it-works/dioramas');

describe('preview source guardrails', () => {
  it('mounts the frontend demo workspace instead of the landing preview shell', () => {
    const source = readFileSync(
      path.resolve(landingRoot, 'components/AppPreviewFrame.tsx'),
      'utf8',
    );

    expect(source).toContain('@frontend/demo/landing');
    expect(source).toContain('<DemoWorkspaceComponent initialPhase="upload" />');
    expect(source).not.toContain('PreviewShell');
  });

  it('builds the preview out of real frontend surfaces', () => {
    const source = readFileSync(
      path.resolve(frontendRoot, 'demo/landing/DemoWorkspace.tsx'),
      'utf8',
    );

    expect(source).toContain('AppShell');
    expect(source).toContain('ProjectWorkspace');
    expect(source).toContain('path="/project/:projectId/:phase"');
    expect(source).toContain('element={<ProjectWorkspace />}');
    expect(source).toContain('data-testid="landing-demo-workspace"');
    expect(source).toContain("pointerEvents: 'none'");
    expect(source).not.toContain('DemoSidebar');
    expect(source).not.toContain('TrainingProgressCard');
    expect(source).not.toContain('OverviewColumnCards');
    expect(source).not.toContain('FeatureSuggestionCard');
  });

  it('removes the legacy landing preview clone runtime', () => {
    expect(existsSync(path.resolve(landingRoot, 'preview/PreviewShell.tsx'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'preview/previewStore.ts'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'islands/PreviewIsland.tsx'))).toBe(false);
  });

  it('builds how-it-works cards from real workspace previews', () => {
    const workspaceDiorama = readFileSync(path.resolve(dioramaRoot, 'WorkspaceDiorama.tsx'), 'utf8');
    expect(workspaceDiorama).toContain('/workspace-preview?phase=');
    expect(workspaceDiorama).toContain('<iframe');
    expect(workspaceDiorama).toContain('pointer-events-none');

    const previewPage = readFileSync(path.resolve(landingRoot, 'components/WorkspacePreviewPage.tsx'), 'utf8');
    expect(previewPage).toContain('DemoWorkspace');
    expect(previewPage).toContain('enableDemoMode');
    expect(previewPage).toContain("return 'upload'");

    const sceneFiles = [
      'IngestDiorama.tsx',
      'ExploreDiorama.tsx',
      'PreprocessDiorama.tsx',
      'EngineerDiorama.tsx',
      'TrainDiorama.tsx',
      'ExperimentsDiorama.tsx',
      'DeployDiorama.tsx',
    ];

    for (const fileName of sceneFiles) {
      const source = readFileSync(path.resolve(dioramaRoot, fileName), 'utf8');
      expect(source).toContain('WorkspaceDiorama');
      expect(source).not.toContain('LineChart');
      expect(source).not.toContain('barFill');
    }
  });
});
