import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { previewManifest } from '@/components/previews/previewManifest';

const landingRoot = path.resolve(import.meta.dirname, '..');
const dioramaRoot = path.resolve(landingRoot, 'components/how-it-works/dioramas');
const publicRoot = path.resolve(landingRoot, '../public');

function stripPreviewQuery(assetPath: string): string {
  return assetPath.split('?')[0] ?? assetPath;
}

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

  it('mounts the hero preview as a manifest-backed loop instead of a DOM mock', () => {
    const source = readFileSync(
      path.resolve(landingRoot, 'components/AppPreviewFrame.tsx'),
      'utf8',
    );

    expect(source).toContain('PreviewLoop');
    expect(source).toContain('previewId="hero-montage"');
    expect(source).not.toContain('IngestMock');
    expect(source).not.toContain('@frontend/demo/landing');
  });

  it('removes the legacy landing preview clone runtime', () => {
    expect(existsSync(path.resolve(landingRoot, 'preview/PreviewShell.tsx'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'preview/previewStore.ts'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'islands/PreviewIsland.tsx'))).toBe(false);
  });

  it('removes the iframe preview page + messaging shim', () => {
    expect(existsSync(path.resolve(landingRoot, 'pages/workspace-preview.astro'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'components/WorkspacePreviewPage.tsx'))).toBe(false);
    expect(existsSync(path.resolve(landingRoot, 'lib/workspacePreviewMessaging.ts'))).toBe(false);
  });

  it('builds how-it-works cards from manifest-backed media loops (no iframes)', () => {
    const workspaceDiorama = readFileSync(
      path.resolve(dioramaRoot, 'WorkspaceDiorama.tsx'),
      'utf8',
    );

    expect(workspaceDiorama).toContain('PreviewLoop');
    expect(workspaceDiorama).toContain('previewIdByPhase');
    expect(workspaceDiorama).not.toContain('<iframe');
    expect(workspaceDiorama).not.toContain('/workspace-preview');
    expect(workspaceDiorama).not.toContain('postMessage');
    expect(workspaceDiorama).not.toContain('IngestMock');
    expect(workspaceDiorama).not.toContain('ExploreMock');
    expect(workspaceDiorama).not.toContain('PreprocessMock');
    expect(workspaceDiorama).not.toContain('EngineerMock');
    expect(workspaceDiorama).not.toContain('TrainMock');
    expect(workspaceDiorama).not.toContain('ExperimentsMock');
    expect(workspaceDiorama).not.toContain('DeployMock');
  });

  it('checks in the committed preview media assets expected by the manifest', () => {
    for (const asset of Object.values(previewManifest)) {
      const webmPath = stripPreviewQuery(asset.webmSrc);
      const mp4Path = stripPreviewQuery(asset.mp4Src);
      const posterPath = stripPreviewQuery(asset.posterSrc);

      expect(
        existsSync(path.resolve(publicRoot, `.${webmPath}`)),
        `${asset.id} is missing ${webmPath}`,
      ).toBe(true);
      expect(
        existsSync(path.resolve(publicRoot, `.${mp4Path}`)),
        `${asset.id} is missing ${mp4Path}`,
      ).toBe(true);
      expect(
        existsSync(path.resolve(publicRoot, `.${posterPath}`)),
        `${asset.id} is missing ${posterPath}`,
      ).toBe(true);
    }
  });

  it('keeps landing theme tokens compatible with real frontend components', () => {
    const themeSource = readFileSync(
      path.resolve(landingRoot, 'styles/theme.css'),
      'utf8',
    );
    expect(themeSource).toContain('--border: 0 0% 18%;');
    expect(themeSource).not.toContain('--border:        rgba(255, 255, 255, 0.06);');
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
      path.resolve(landingRoot, '../../frontend/src/demo/landing/NotebookDeepDivePreview.tsx'),
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
    // Plan viewer wrapper now mirrors the document theme instead of hardcoding
    // `dark`, so the nested shadcn/prose styles track light-mode toggles.
    expect(planSource).toContain('className={resolvedTheme}');
    expect(planSource).toContain('useHtmlThemeClass');
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

  it('redirects the landing sign-in to the real app login URL', () => {
    // Original intent was a static "Coming Soon" placeholder. The sprint-11
    // demo-ready branch flipped this to a real redirect into the app so demo
    // visitors can sign in on the deployed backend. Assertions updated to
    // match the current behavior (redirect + appLoginUrl) instead of the
    // placeholder (frozen core app on `final-demo` is authoritative).
    expect(existsSync(path.resolve(landingRoot, 'pages/login.astro'))).toBe(true);
    const loginPage = readFileSync(path.resolve(landingRoot, 'pages/login.astro'), 'utf8');
    expect(loginPage).toContain('getAppLoginUrl');
    expect(loginPage).toContain('window.location.replace(appLoginUrl)');
    expect(loginPage).toContain('http-equiv="refresh"');
    expect(loginPage).not.toContain('Coming Soon');
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

  it('pins the landing Vercel CLI flow and keeps preview deploys off the production alias', () => {
    const rootPackage = readFileSync(path.resolve(landingRoot, '../../package.json'), 'utf8');
    const gitlabCi = readFileSync(path.resolve(landingRoot, '../../.gitlab-ci.yml'), 'utf8');

    expect(rootPackage).toContain('vercel@51.2.1');
    expect(rootPackage).toContain('deploy --prebuilt --yes --target=preview');
    expect(rootPackage).toContain('deploy --prebuilt --yes --target=production');

    expect(gitlabCi).toContain('--environment=preview --git-branch="$CI_COMMIT_REF_NAME"');
    expect(gitlabCi).toContain('build --yes --target=preview');
    expect(gitlabCi).toContain('deploy --prebuilt --yes --target=preview');
    expect(gitlabCi).toContain('deploy --prebuilt --yes --target=production');
  });
});
