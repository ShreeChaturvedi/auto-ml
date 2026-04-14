import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const landingRoot = path.resolve(import.meta.dirname, '..');
const frontendRoot = path.resolve(landingRoot, '../../frontend/src');
const dioramaRoot = path.resolve(landingRoot, 'components/how-it-works/dioramas');

describe('preview source guardrails', () => {
  it('mounts the hero preview and how-it-works separately from the page shell', () => {
    const pageSource = readFileSync(
      path.resolve(landingRoot, 'pages/index.astro'),
      'utf8',
    );
    expect(pageSource).toContain('<AppPreviewFrame client:load />');
    expect(pageSource).toContain('<HowItWorks client:visible />');
    expect(pageSource).not.toContain('LandingPreviewExperience');
  });

  it('mounts the hero preview as a real frontend demo workspace in normal document flow', () => {
    const source = readFileSync(
      path.resolve(landingRoot, 'components/AppPreviewFrame.tsx'),
      'utf8',
    );

    expect(source).toContain('@frontend/demo/landing');
    expect(source).toContain('<DemoWorkspaceComponent initialPhase="upload" />');
    expect(source).not.toContain('SharedWorkspacePreviewHost');
    expect(source).not.toContain('PreviewShell');
  });

  it('builds the hero preview out of real frontend surfaces without fixed overlay runtime', () => {
    const source = readFileSync(
      path.resolve(frontendRoot, 'demo/landing/DemoWorkspace.tsx'),
      'utf8',
    );

    expect(source).toContain('AppShell');
    expect(source).toContain('ProjectWorkspace');
    expect(source).toContain('path="/project/:projectId/:phase"');
    expect(source).toContain('element={<ProjectWorkspace />}');
    expect(source).toContain('data-testid="landing-demo-workspace"');
    expect(source).not.toContain("pointerEvents: 'none'");
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
    expect(workspaceDiorama).toContain('WORKSPACE_PREVIEW_MESSAGE_TYPE');
    expect(workspaceDiorama).toContain("postMessage(message, '*')");
    expect(workspaceDiorama).toContain("loading={preloadAll ? 'eager' : 'lazy'}");
    expect(workspaceDiorama).not.toContain('SharedWorkspacePreviewHost');

    const howItWorksSource = readFileSync(
      path.resolve(landingRoot, 'components/how-it-works/HowItWorks.tsx'),
      'utf8',
    );
    expect(howItWorksSource).toContain('preloadAllDioramaPhases={false}');

    const previewPage = readFileSync(path.resolve(landingRoot, 'components/WorkspacePreviewPage.tsx'), 'utf8');
    expect(previewPage).toContain('DemoWorkspace');
    expect(previewPage).toContain('enableDemoMode');
    expect(previewPage).toContain('preloadProjectWorkspacePhase');
    expect(previewPage).toContain('WORKSPACE_PREVIEW_READY_MESSAGE_TYPE');
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

  it('does not use a fixed shared overlay provider for landing previews', () => {
    expect(existsSync(path.resolve(landingRoot, 'components/LandingPreviewExperience.tsx'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'components/preview/SharedWorkspacePreviewProvider.tsx'))).toBe(false);
  });

  it('keeps landing theme tokens compatible with real frontend components', () => {
    const themeSource = readFileSync(path.resolve(landingRoot, 'styles/theme.css'), 'utf8');
    expect(themeSource).toContain('--border: 0 0% 18%;');
    expect(themeSource).not.toContain('--border:        rgba(255, 255, 255, 0.06);');
  });

  it('suppresses overlay primitives in demo mode instead of freezing the whole workspace', () => {
    const dialogSource = readFileSync(
      path.resolve(frontendRoot, 'components/ui/dialog.tsx'),
      'utf8',
    );
    expect(dialogSource).toContain('isDemoMode');

    const popoverSource = readFileSync(
      path.resolve(frontendRoot, 'components/ui/popover.tsx'),
      'utf8',
    );
    expect(popoverSource).toContain('isDemoMode');

    const dropdownSource = readFileSync(
      path.resolve(frontendRoot, 'components/ui/dropdown-menu.tsx'),
      'utf8',
    );
    expect(dropdownSource).toContain('isDemoMode');
  });

  it('keeps notebook deep-dive Monaco-free while reusing notebook output chrome', () => {
    const notebookSource = readFileSync(
      path.resolve(landingRoot, 'components/deep-dives/NotebookDeepDive.tsx'),
      'utf8',
    );
    const notebookStyles = readFileSync(
      path.resolve(landingRoot, 'components/deep-dives/NotebookDeepDive.module.css'),
      'utf8',
    );
    expect(notebookSource).toContain('@frontend/demo/landing');
    expect(notebookSource).not.toContain('ResponsiveContainer');
    expect(notebookSource).not.toContain('BarChart');

    const frontendNotebookSource = readFileSync(
      path.resolve(frontendRoot, 'demo/landing/NotebookDeepDivePreview.tsx'),
      'utf8',
    );
    expect(frontendNotebookSource).toContain('computeSyntaxPalette');
    expect(frontendNotebookSource).toContain('setSynVarsFromPalette');
    expect(frontendNotebookSource).toContain('NOTEBOOK_SYNTAX_HUE');
    expect(frontendNotebookSource).toContain('renderPythonLine');
    expect(frontendNotebookSource).toContain('aria-label="Run cell"');
    expect(frontendNotebookSource).toContain('CellOutputRenderer');
    expect(frontendNotebookSource).not.toContain('NotebookCellComponent');
    expect(frontendNotebookSource).not.toContain('NotebookCellOutput');
    expect(frontendNotebookSource).not.toContain('LazyMonacoEditor');
    expect(frontendNotebookSource).not.toContain('setAdaptiveSyntaxPref');
    expect(frontendNotebookSource).not.toContain('useProjectThemeColor');
    expect(frontendNotebookSource).not.toContain('useProjectStore');
    expect(notebookStyles).toContain('.root');
    expect(notebookStyles).toContain('height: 560px;');
    expect(notebookStyles).toContain('overflow: hidden;');
  });

  it('renders plan deep-dive markdown through the app plan viewer pipeline with landing-safe title and stable question sizing', () => {
    const planSource = readFileSync(
      path.resolve(landingRoot, 'components/deep-dives/PlanDeepDive.tsx'),
      'utf8',
    );
    const planStyles = readFileSync(
      path.resolve(landingRoot, 'components/deep-dives/PlanDeepDive.module.css'),
      'utf8',
    );

    expect(planSource).toContain('PlanViewerPane');
    expect(planSource).toContain('className="dark"');
    expect(planSource).toContain('name: \'Retention Recovery\'');
    expect(planSource).not.toContain('Project Plan: Retention Recovery');
    expect(planSource).toContain('className={styles.questionStage}');
    expect(planSource).not.toContain('PlanMarkdownMock');
    expect(planStyles).toContain('.questionStage');
    expect(planStyles).toContain('.root');
    expect(planStyles).toContain('min-height: 420px;');
    expect(planStyles).not.toContain('height: 100%;');
  });

  it('keeps landing workspace CSP dependency patches aligned with frontend', () => {
    const landingPackage = readFileSync(
      path.resolve(landingRoot, '../package.json'),
      'utf8',
    );
    const patchScript = readFileSync(
      path.resolve(landingRoot, '../../scripts/patch-csp-deps.mjs'),
      'utf8',
    );
    const landingZodUtil = readFileSync(
      path.resolve(landingRoot, '../node_modules/zod/v4/core/util.js'),
      'utf8',
    );

    expect(landingPackage).toContain('"postinstall": "node ../scripts/patch-csp-deps.mjs"');
    expect(patchScript).toContain('landing');
    expect(landingZodUtil).toContain('export const allowsEval = cached(() => false);');
    expect(landingZodUtil).not.toContain('new F("");');
  });

  it('routes landing sign-in links to a static coming-soon page instead of the real app', () => {
    expect(existsSync(path.resolve(landingRoot, 'pages/login.astro'))).toBe(true);
    const loginPage = readFileSync(path.resolve(landingRoot, 'pages/login.astro'), 'utf8');
    expect(loginPage).toContain('Coming Soon');
    expect(loginPage).not.toContain('PUBLIC_APP_LOGIN_URL');
    expect(loginPage).not.toContain('window.location.replace');
  });

  it('checks in Vercel project config for the landing workspace', () => {
    expect(existsSync(path.resolve(landingRoot, '../../vercel.json'))).toBe(true);
    const vercelConfig = readFileSync(path.resolve(landingRoot, '../../vercel.json'), 'utf8');
    expect(vercelConfig).toContain('"outputDirectory": "landing/dist"');
    expect(vercelConfig).toContain('"buildCommand": "npm run build:landing"');
    expect(vercelConfig).toContain('"installCommand": "npm ci --prefix frontend && npm ci --prefix landing"');
    expect(vercelConfig).toContain('X-Frame-Options');
    expect(vercelConfig).toContain('SAMEORIGIN');
  });
});
