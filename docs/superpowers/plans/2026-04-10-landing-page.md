# Agentic AutoML Platform — Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-page dark-mode Astro landing page at `landing/` that showcases the Agentic AutoML Platform with an interactive 7-tab app preview, Factory-style pinned scrollytelling, three feature deep-dives reusing real leaf components, three meta-feature cards, an integrations marquee, and a footer with a giant sunken wordmark.

**Architecture:** New `landing/` workspace sibling to `frontend/` and `backend/`. Astro 5 + React 19 islands + Tailwind 3 + GSAP (lazy-loaded only on the pinned section). Imports EASY-tier leaf components from `frontend/src/components/` via path alias. Rebuilds the 7-tab preview shell fresh in `landing/src/preview/` — never imports phase panels. Zero auth, zero API calls, zero WebSocket connections. Pre-seeded fixtures drive all state.

**Tech Stack:** Astro 5, React 19.1.1, TypeScript 5.8 strict, Tailwind 3.4, GSAP 3.12 + ScrollTrigger, Zustand 5, Inter Variable + Geist Mono Variable (fontsource), simple-icons, Recharts, streamdown, `@axe-core/playwright`, vitest 4.

**Spec:** `docs/superpowers/specs/2026-04-10-landing-page-design.md` (read this before starting — it has critical visual details the plan references)

**Gemini-deferred assets:** GitLab issues #309–#315. Do NOT implement these. Ship placeholders and move on.

**Conventions:**
- All paths are relative to repo root `/home/shree/Documents/CSE449/repo/`.
- Commit messages follow the existing monorepo style: `<scope>(landing): <imperative subject>`.
- Every task ends with a commit step. No task may leave broken state.
- Write tests BEFORE implementation (TDD) for hooks, stores, pure functions, and component smoke tests. UI visual styling is excluded from TDD — visual review happens incrementally.

**Phases:**

| Phase | Scope | Tasks |
|---|---|---|
| 1 | Workspace scaffolding + shared infra | 1–8 |
| 2 | Nav + Hero | 9–14 |
| 3 | Shared hooks + motion tokens | 15–17 |
| 4 | Preview store + context + fixtures | 18–24 |
| 5 | Preview shell structure | 25–28 |
| 6 | Per-tab views (7 tabs) | 29–42 |
| 7 | App preview section + outline glow | 43–46 |
| 8 | How It Works pinned scroll | 47–52 |
| 9 | Feature deep-dives (3 sections) | 53–60 |
| 10 | Meta cards + marquee + footer | 61–68 |
| 11 | Accessibility + testing + Lighthouse | 69–76 |

---

## Phase 1 — Workspace Scaffolding

### Task 1: Create landing/ workspace skeleton

**Files:**
- Create: `landing/package.json`
- Create: `landing/tsconfig.json`
- Create: `landing/astro.config.mjs`
- Create: `landing/.gitignore`
- Create: `landing/README.md`

- [ ] **Step 1: Verify parent directory**

```bash
ls /home/shree/Documents/CSE449/repo/ | grep -E 'frontend|backend'
```
Expected: both `backend` and `frontend` listed.

- [ ] **Step 2: Create landing/package.json**

```json
{
  "name": "landing",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "astro dev --port 4321",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "astro check && tsc --noEmit"
  },
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/react": "^3.6.0",
    "@astrojs/tailwind": "^5.1.0",
    "@astrojs/check": "^0.9.0",
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "gsap": "^3.12.5",
    "zustand": "^5.0.8",
    "@fontsource-variable/inter": "^5.1.0",
    "@fontsource-variable/geist-mono": "^5.1.0",
    "simple-icons": "^13.14.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.3.1",
    "tailwindcss": "^3.4.17",
    "tailwindcss-animate": "^1.0.7",
    "recharts": "^3.5.1",
    "streamdown": "^2.3.0",
    "lucide-react": "^0.544.0"
  },
  "devDependencies": {
    "@axe-core/playwright": "^4.10.0",
    "@playwright/test": "^1.50.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.1",
    "@types/node": "^24.6.0",
    "@types/react": "^19.1.13",
    "@types/react-dom": "^19.1.9",
    "@vitejs/plugin-react": "^5.0.3",
    "autoprefixer": "^10.4.21",
    "eslint": "^9.36.0",
    "jsdom": "^27.3.0",
    "postcss": "^8.5.6",
    "typescript": "~5.8.3",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 3: Create landing/tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@frontend/*": ["../frontend/src/*"]
    },
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "types": ["astro/client", "vitest/globals"]
  },
  "include": ["src/**/*", "*.config.*"],
  "exclude": ["dist/", "node_modules/"]
}
```

- [ ] **Step 4: Create landing/astro.config.mjs**

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }),
  ],
  site: 'https://agentic-automl.dev',
  output: 'static',
  server: { port: 4321 },
  vite: {
    ssr: {
      noExternal: ['@frontend/*', 'recharts', 'streamdown'],
    },
  },
});
```

- [ ] **Step 5: Create landing/.gitignore**

```
node_modules/
dist/
.astro/
.env
.env.local
*.log
coverage/
.DS_Store
playwright-report/
test-results/
```

- [ ] **Step 6: Create landing/README.md**

```markdown
# Landing Page

Public marketing landing page for the Agentic AutoML Platform.

## Dev

```bash
npm run dev --workspace=landing
```

Opens at http://localhost:4321.

## Build

```bash
npm run build --workspace=landing
```

## Test

```bash
npm run test --workspace=landing
```

See `docs/superpowers/specs/2026-04-10-landing-page-design.md` for the design spec and `docs/superpowers/plans/2026-04-10-landing-page.md` for the implementation plan.
```

- [ ] **Step 7: Commit**

```bash
git add landing/package.json landing/tsconfig.json landing/astro.config.mjs landing/.gitignore landing/README.md
git commit -m "feat(landing): scaffold workspace with Astro + React islands config"
```

---

### Task 2: Register landing in root workspaces + install dependencies

**Files:**
- Modify: `package.json` (root) — add `"landing"` to `workspaces`

- [ ] **Step 1: Read current root package.json workspaces**

```bash
grep -A 10 '"workspaces"' package.json
```
Expected: a workspaces array with `"backend"` and `"frontend"`.

- [ ] **Step 2: Add landing to workspaces**

Edit `package.json` so the `workspaces` array becomes:
```json
"workspaces": [
  "backend",
  "frontend",
  "landing"
]
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
```
Expected: `added XXX packages`. No errors.

- [ ] **Step 4: Verify landing/node_modules symlinks exist**

```bash
ls landing/node_modules/astro/package.json && echo "OK"
```
Expected: `OK`.

- [ ] **Step 5: Verify npm scripts work from root**

```bash
npm run --workspace=landing build 2>&1 | head -5
```
Expected: Astro build starts (may fail because `src/pages/` doesn't exist yet — that's fine, just verify the script is wired).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(landing): register workspace + install dependencies"
```

---

### Task 3: Create Tailwind config with shared theme

**Files:**
- Create: `landing/tailwind.config.ts`
- Create: `landing/postcss.config.cjs`

- [ ] **Step 1: Create landing/postcss.config.cjs**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2: Create landing/tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';

export default {
  darkMode: 'class',
  content: [
    './src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}',
    // Scan specific frontend components we import
    '../frontend/src/components/llm/**/*.{ts,tsx}',
    '../frontend/src/components/upload/ComputeAnimation*.{ts,tsx}',
    '../frontend/src/components/upload/QuestionCards.tsx',
    '../frontend/src/components/notebook/NotebookCellOutput.tsx',
    '../frontend/src/components/data/PdfViewer.tsx',
    '../frontend/src/components/ui/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', '"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        'surface-0': 'var(--surface-0)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-dim': 'var(--text-dim)',
      },
      letterSpacing: {
        tighter: '-0.022em',
        tight: '-0.01em',
      },
      transitionTimingFunction: {
        'out-quart': 'var(--ease-out-quart)',
        'out-expo': 'var(--ease-out-expo)',
        'in-out-quint': 'var(--ease-in-out-quint)',
        'in-out-expo': 'var(--ease-in-out-expo)',
        'linear-default': 'var(--ease-linear-default)',
      },
      transitionDuration: {
        fast: '160ms',
        med: '350ms',
        slow: '600ms',
      },
    },
  },
  plugins: [animatePlugin],
} satisfies Config;
```

- [ ] **Step 3: Commit**

```bash
git add landing/tailwind.config.ts landing/postcss.config.cjs
git commit -m "feat(landing): configure Tailwind with shared tokens + scoped frontend imports"
```

---

### Task 4: Create theme.css with tokens + motion system

**Files:**
- Create: `landing/src/styles/theme.css`
- Create: `landing/src/styles/motion-policy.css`
- Create: `landing/src/styles/grain.css`
- Create: `landing/src/styles/globals.css`

- [ ] **Step 1: Create landing/src/styles/theme.css**

```css
/* Agentic AutoML Platform — Landing page theme tokens
 * Grayscale discipline. No accent hue outside the app preview.
 * All surface layering, text hierarchy, borders, and motion curves live here. */

:root {
  color-scheme: dark;

  /* Surfaces */
  --bg:          #0A0A0B;   /* page background */
  --surface-0:   #0F1011;   /* elevated card */
  --surface-1:   #131416;   /* inner panel */
  --surface-2:   #1A1B1D;   /* raised element */

  /* Borders */
  --border:        rgba(255, 255, 255, 0.06);
  --border-strong: rgba(255, 255, 255, 0.10);

  /* Text */
  --text:       #F7F8F8;
  --text-muted: #8A8F98;
  --text-dim:   #62666D;

  /* Motion — easing tokens (single source of truth) */
  --ease-out-quart:      cubic-bezier(0.165, 0.84, 0.44, 1);
  --ease-out-expo:       cubic-bezier(0.19,  1,    0.22, 1);
  --ease-in-out-quint:   cubic-bezier(0.86,  0,    0.07, 1);
  --ease-in-out-expo:    cubic-bezier(1,     0,    0,    1);
  --ease-linear-default: cubic-bezier(0.25,  0.46, 0.45, 0.94);

  /* Motion — durations */
  --dur-fast: 0.16s;
  --dur-med:  0.35s;
  --dur-slow: 0.60s;
}

html {
  background-color: var(--bg);
  color: var(--text);
  font-family: 'Inter Variable', Inter, system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

body {
  margin: 0;
  min-height: 100vh;
  background-color: var(--bg);
  color: var(--text);
}

/* Selection */
::selection {
  background-color: rgba(255, 255, 255, 0.18);
  color: var(--text);
}

/* Focus visibility — used consistently across the page */
:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
  border-radius: 4px;
}
```

- [ ] **Step 2: Create landing/src/styles/motion-policy.css**

```css
/* Reduced-motion fallbacks. Single source of truth. */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* Freeze marquees at 50% position */
  .marquee-row {
    animation: none !important;
    transform: translateX(-25%) !important;
  }

  /* Disable cursor-outline glow; show a static 1px border instead */
  .cursor-outline::before {
    display: none !important;
  }
  .cursor-outline {
    outline: 1px solid var(--border);
  }
}
```

- [ ] **Step 3: Create landing/src/styles/grain.css**

```css
/* Grain overlay — stronger than the app's body grain */

.landing-grain {
  position: relative;
}

.landing-grain::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.08 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  mix-blend-mode: overlay;
  opacity: 0.07;
  z-index: 1;
}

.landing-grain-strong::after {
  opacity: 0.10;
}
```

- [ ] **Step 4: Create landing/src/styles/globals.css**

```css
@import '@fontsource-variable/inter/wght.css';
@import '@fontsource-variable/geist-mono/wght.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@import './theme.css';
@import './motion-policy.css';
@import './grain.css';
```

- [ ] **Step 5: Commit**

```bash
git add landing/src/styles/
git commit -m "feat(landing): add theme tokens + motion policy + grain overlay"
```

---

### Task 5: Create Root layout

**Files:**
- Create: `landing/src/layouts/Root.astro`

- [ ] **Step 1: Create landing/src/layouts/Root.astro**

```astro
---
import '@/styles/globals.css';

interface Props {
  title?: string;
  description?: string;
}

const {
  title = 'Agentic AutoML Platform — The fastest way to build production ML models, agentically.',
  description = 'Upload a CSV. Describe your goal. Walk away. Come back to deployed models, ranked experiments, and a notebook that explains every decision.',
} = Astro.props;
---

<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <meta name="theme-color" content="#0A0A0B" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <title>{title}</title>
    <script is:inline>
      // Mark demo mode so imported components can short-circuit API calls
      window.__AGENTIC_DEMO_MODE__ = true;
    </script>
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/layouts/Root.astro
git commit -m "feat(landing): add Root layout with demo-mode flag + SEO meta"
```

---

### Task 6: Create minimal index.astro and verify dev server

**Files:**
- Create: `landing/src/pages/index.astro`

- [ ] **Step 1: Create landing/src/pages/index.astro**

```astro
---
import Root from '@/layouts/Root.astro';
---

<Root>
  <main class="min-h-screen flex items-center justify-center">
    <div class="text-center">
      <p class="font-mono text-xs text-text-muted uppercase tracking-wider">
        SCAFFOLD READY
      </p>
      <h1 class="mt-4 font-sans text-5xl font-medium tracking-tighter">
        Agentic AutoML Platform
      </h1>
      <p class="mt-4 font-mono text-base text-text-muted">
        Landing page — under construction.
      </p>
    </div>
  </main>
</Root>
```

- [ ] **Step 2: Start dev server and verify**

Run in a terminal:
```bash
npm run dev --workspace=landing
```
Visit http://localhost:4321 in a browser. Expected: dark background, "SCAFFOLD READY" small eyebrow, large white headline, muted subhead. No console errors.

Stop the dev server with Ctrl+C.

- [ ] **Step 3: Run a production build to verify no regressions**

```bash
npm run build --workspace=landing
```
Expected: `[build] X page(s) built`. No errors.

- [ ] **Step 4: Commit**

```bash
git add landing/src/pages/index.astro
git commit -m "feat(landing): add minimal index.astro scaffold page"
```

---

### Task 7: Add vitest config + first smoke test

**Files:**
- Create: `landing/vitest.config.ts`
- Create: `landing/src/tests/setup.ts`
- Create: `landing/src/tests/smoke.test.ts`

- [ ] **Step 1: Create landing/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@frontend': fileURLToPath(new URL('../frontend/src', import.meta.url)),
    },
  },
});
```

- [ ] **Step 2: Create landing/src/tests/setup.ts**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Mock matchMedia for jsdom (needed by prefers-reduced-motion checks)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock demo mode flag
(window as unknown as { __AGENTIC_DEMO_MODE__: boolean }).__AGENTIC_DEMO_MODE__ = true;
```

- [ ] **Step 3: Write failing smoke test**

Create `landing/src/tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('demo mode flag is set on window', () => {
    expect((window as unknown as { __AGENTIC_DEMO_MODE__: boolean }).__AGENTIC_DEMO_MODE__).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npm run test --workspace=landing
```
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add landing/vitest.config.ts landing/src/tests/
git commit -m "feat(landing): add vitest config + smoke test harness"
```

---

### Task 8: Add cn utility helper

**Files:**
- Create: `landing/src/lib/cn.ts`
- Create: `landing/src/lib/cn.test.ts`

- [ ] **Step 1: Write failing test**

Create `landing/src/lib/cn.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('merges class names with tailwind-merge dedup', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('filters falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('handles arrays and objects via clsx', () => {
    expect(cn(['a'], { b: true, c: false })).toBe('a b');
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

```bash
npm run test --workspace=landing -- cn.test
```
Expected: FAIL with `Cannot find module './cn'`.

- [ ] **Step 3: Create landing/src/lib/cn.ts**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run the test (expect pass)**

```bash
npm run test --workspace=landing -- cn.test
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add landing/src/lib/cn.ts landing/src/lib/cn.test.ts
git commit -m "feat(landing): add cn helper + tests"
```

---

## Phase 2 — Nav + Hero

### Task 9: Create Nav component

**Files:**
- Create: `landing/src/components/Nav.astro`

- [ ] **Step 1: Create landing/src/components/Nav.astro**

```astro
---
// Sticky frosted navigation bar.
// Permanent state — no scroll-change, no shrink. Matches Linear's static nav behavior.
---

<header class="nav-root">
  <div class="nav-inner">
    <a href="#top" class="nav-wordmark">Agentic AutoML</a>

    <nav class="nav-links" aria-label="Primary">
      <a href="#product">Product</a>
      <a href="#features">Features</a>
      <a href="#how-it-works">How it works</a>
    </nav>

    <a href="/login" class="nav-cta">
      Sign in
      <span class="nav-cta-arrow" aria-hidden="true">→</span>
    </a>
  </div>
</header>

<style>
  .nav-root {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    height: 72px;
    background-image: linear-gradient(
      rgba(10, 10, 11, 0.80) 0%,
      rgba(10, 10, 11, 0.76) 100%
    );
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 0.8px solid var(--border);
  }

  .nav-inner {
    max-width: 1280px;
    height: 100%;
    margin: 0 auto;
    padding: 0 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 40px;
  }

  .nav-wordmark {
    font-family: 'Inter Variable', sans-serif;
    font-size: 16px;
    font-weight: 590;
    color: var(--text);
    text-decoration: none;
    letter-spacing: -0.01em;
    transition: opacity var(--dur-fast) var(--ease-linear-default);
  }
  .nav-wordmark:hover { opacity: 0.8; }

  .nav-links {
    display: flex;
    gap: 8px;
  }

  .nav-links a {
    font-family: 'Geist Mono Variable', ui-monospace, monospace;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0 12px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    transition: color var(--dur-fast) var(--ease-linear-default);
  }
  .nav-links a:hover { color: var(--text); }

  .nav-cta {
    font-family: 'Inter Variable', sans-serif;
    font-size: 14px;
    font-weight: 510;
    color: #0A0A0B;
    text-decoration: none;
    background: linear-gradient(180deg, #F7F8F8 0%, #E6E6E6 100%);
    padding: 0 16px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 4px;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.2),
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 2px 8px rgba(0, 0, 0, 0.08);
    transition: transform var(--dur-fast) var(--ease-linear-default);
  }
  .nav-cta:hover { transform: translateY(-1px); }
  .nav-cta-arrow {
    transition: transform var(--dur-fast) var(--ease-linear-default);
  }
  .nav-cta:hover .nav-cta-arrow { transform: translateX(2px); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/components/Nav.astro
git commit -m "feat(landing): add sticky frosted Nav with mono links"
```

---

### Task 10: Create Hero component

**Files:**
- Create: `landing/src/components/Hero.astro`

- [ ] **Step 1: Create landing/src/components/Hero.astro**

```astro
---
// Hero — intentionally short so the app preview dominates the fold.
// Pulse-dot announcement + mixed-color two-line H1 + mono subhead + single CTA.
---

<section class="hero" id="top">
  <a href="#product" class="hero-pulse-link">
    <span class="hero-pulse-dot" aria-hidden="true"></span>
    <span class="hero-pulse-text">GPT 5.4 class reasoning, now live</span>
    <span class="hero-pulse-arrow" aria-hidden="true">→</span>
  </a>

  <h1 class="hero-title">
    <span class="hero-title-bright">The fastest way to build production ML models,</span>
    <span class="hero-title-muted">agentically.</span>
  </h1>

  <p class="hero-subhead">
    Upload a CSV. Describe your goal. Walk away. Come back to deployed models,
    ranked experiments, and a notebook that explains every decision.
  </p>

  <div class="hero-cta-row">
    <a href="/login" class="hero-cta">
      Sign in to get started
      <span class="hero-cta-arrow" aria-hidden="true">→</span>
    </a>
  </div>
</section>

<style>
  .hero {
    max-width: 880px;
    margin: 0 auto;
    padding: 184px 32px 0; /* 72 nav + 112 top gap */
    text-align: center;
  }

  /* Pulse-dot announcement */
  .hero-pulse-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: 'Geist Mono Variable', ui-monospace, monospace;
    font-size: 13px;
    color: var(--text-muted);
    text-decoration: none;
    padding: 6px 12px;
    border-radius: 999px;
    border: 0.8px solid var(--border);
    transition: color var(--dur-fast), border-color var(--dur-fast);
  }
  .hero-pulse-link:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .hero-pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text);
    box-shadow: 0 0 0 0 rgba(247, 248, 248, 0.6);
    animation: hero-pulse 2s ease-in-out infinite;
  }
  @keyframes hero-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(247, 248, 248, 0.6); }
    50%      { box-shadow: 0 0 0 4px rgba(247, 248, 248, 0); }
  }

  /* H1 — mixed color cadence */
  .hero-title {
    margin: 32px 0 0;
    font-family: 'Inter Variable', sans-serif;
    font-weight: 510;
    font-size: clamp(40px, 6vw, 72px);
    line-height: 1;
    letter-spacing: -0.022em;
  }
  .hero-title-bright { color: var(--text); display: block; }
  .hero-title-muted  { color: var(--text-muted); display: block; }

  /* Subhead */
  .hero-subhead {
    margin: 24px auto 0;
    max-width: 620px;
    font-family: 'Geist Mono Variable', ui-monospace, monospace;
    font-size: 18px;
    font-weight: 400;
    color: var(--text-muted);
    line-height: 1.55;
  }

  /* CTA */
  .hero-cta-row {
    margin-top: 40px;
    display: flex;
    justify-content: center;
  }
  .hero-cta {
    font-family: 'Inter Variable', sans-serif;
    font-size: 16px;
    font-weight: 510;
    color: #0A0A0B;
    text-decoration: none;
    background: linear-gradient(180deg, #F7F8F8 0%, #E6E6E6 100%);
    padding: 0 40px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 6px;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.2),
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 8px 24px rgba(0, 0, 0, 0.08);
    transition: transform var(--dur-fast) var(--ease-linear-default);
  }
  .hero-cta:hover { transform: translateY(-1px); }
  .hero-cta-arrow {
    transition: transform var(--dur-fast) var(--ease-linear-default);
  }
  .hero-cta:hover .hero-cta-arrow { transform: translateX(2px); }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/components/Hero.astro
git commit -m "feat(landing): add Hero with pulse-dot, mixed-color H1, mono subhead, CTA"
```

---

### Task 11: Wire Nav + Hero into index.astro

**Files:**
- Modify: `landing/src/pages/index.astro`

- [ ] **Step 1: Overwrite landing/src/pages/index.astro**

```astro
---
import Root from '@/layouts/Root.astro';
import Nav from '@/components/Nav.astro';
import Hero from '@/components/Hero.astro';
---

<Root>
  <Nav />
  <main>
    <Hero />
  </main>
</Root>
```

- [ ] **Step 2: Run dev server and visually verify**

```bash
npm run dev --workspace=landing
```
Visit http://localhost:4321. Expected:
- Sticky nav at top with wordmark, 3 mono links, Sign in button
- Below it: pulse-dot link, two-line H1 (first line white, second line muted), mono subhead, white CTA button
- Dark background everywhere
- No console errors

Stop with Ctrl+C.

- [ ] **Step 3: Run build**

```bash
npm run build --workspace=landing
```
Expected: `1 page built`.

- [ ] **Step 4: Commit**

```bash
git add landing/src/pages/index.astro
git commit -m "feat(landing): wire Nav + Hero into index"
```

---

### Task 12: Component snapshot tests for Nav + Hero rendered HTML

**Files:**
- Create: `landing/src/tests/marketing-dom.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read the built HTML from dist/ and assert the marketing strings exist.
// Run `npm run build --workspace=landing` before running tests.

describe('marketing DOM (post-build)', () => {
  const distPath = resolve(__dirname, '../../dist/index.html');

  const readDist = (): string => {
    try {
      return readFileSync(distPath, 'utf-8');
    } catch {
      throw new Error('dist/index.html not found — run `npm run build` first');
    }
  };

  it('contains the hero H1 first line', () => {
    expect(readDist()).toContain('The fastest way to build production ML models,');
  });

  it('contains the hero H1 second line', () => {
    expect(readDist()).toContain('agentically.');
  });

  it('contains the subhead', () => {
    expect(readDist()).toContain('Upload a CSV. Describe your goal.');
  });

  it('contains the pulse announcement', () => {
    expect(readDist()).toContain('GPT 5.4 class reasoning, now live');
  });

  it('contains the primary CTA', () => {
    expect(readDist()).toContain('Sign in to get started');
  });

  it('contains all 3 nav link labels', () => {
    const html = readDist();
    expect(html).toContain('Product');
    expect(html).toContain('Features');
    expect(html).toContain('How it works');
  });
});
```

- [ ] **Step 2: Run tests (expect failure — dist doesn't exist or is stale)**

```bash
npm run test --workspace=landing -- marketing-dom
```
If FAIL: ensure build is fresh with `npm run build --workspace=landing`, then re-run tests.

- [ ] **Step 3: Run build + test**

```bash
npm run build --workspace=landing && npm run test --workspace=landing -- marketing-dom
```
Expected: all 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add landing/src/tests/marketing-dom.test.ts
git commit -m "test(landing): assert hero + nav copy renders in built HTML"
```

---

### Task 13: Add ESLint config for landing

**Files:**
- Create: `landing/eslint.config.js`

- [ ] **Step 1: Create landing/eslint.config.js**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', '.astro', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 2: Run lint**

```bash
npm run lint --workspace=landing
```
Expected: no errors (may have 0 files currently linted if everything is Astro — that's fine).

- [ ] **Step 3: Commit**

```bash
git add landing/eslint.config.js
git commit -m "chore(landing): add eslint config"
```

---

### Task 14: Add CI job stub

**Files:**
- Modify: `.gitlab-ci.yml` (if it exists) or create `landing/.ci-job.yml` as documentation

- [ ] **Step 1: Check if CI config exists**

```bash
ls .gitlab-ci.yml 2>/dev/null && echo "exists" || echo "missing"
```

- [ ] **Step 2: If missing, skip — leave a note in landing/README.md instead. If exists, add a `landing` job**

If CI config exists, read it and add a job following the same pattern as `frontend:test`. Example addition:
```yaml
landing:build:
  stage: build
  image: node:20
  script:
    - npm ci
    - npm run build --workspace=landing
    - npm run test --workspace=landing
    - npm run lint --workspace=landing
  artifacts:
    paths:
      - landing/dist/
    expire_in: 1 week
```

If CI config is missing, append this note to `landing/README.md`:
```markdown

## CI

No CI job wired yet. When the repo's CI config exists, add a `landing:build` job that runs `npm ci && npm run build --workspace=landing && npm run test --workspace=landing && npm run lint --workspace=landing`.
```

- [ ] **Step 3: Commit**

```bash
git add .gitlab-ci.yml landing/README.md 2>/dev/null
git commit -m "ci(landing): add build job (or documentation stub)"
```

---

## Phase 3 — Shared Hooks & Motion Tokens

### Task 15: usePrefersReducedMotion hook

**Files:**
- Create: `landing/src/lib/usePrefersReducedMotion.ts`
- Create: `landing/src/lib/usePrefersReducedMotion.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

describe('usePrefersReducedMotion', () => {
  const setMatch = (matches: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  };

  beforeEach(() => {
    setMatch(false);
  });

  it('returns false when user has no reduced-motion preference', () => {
    setMatch(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when reduced motion is preferred', () => {
    setMatch(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
npm run test --workspace=landing -- usePrefersReducedMotion
```
Expected: FAIL — `Cannot find module './usePrefersReducedMotion'`.

- [ ] **Step 3: Create hook**

```ts
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm run test --workspace=landing -- usePrefersReducedMotion
```
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add landing/src/lib/usePrefersReducedMotion.ts landing/src/lib/usePrefersReducedMotion.test.ts
git commit -m "feat(landing): add usePrefersReducedMotion hook"
```

---

### Task 16: useCursorOutline hook

**Files:**
- Create: `landing/src/lib/useCursorOutline.ts`
- Create: `landing/src/lib/useCursorOutline.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCursorOutline } from './useCursorOutline';

describe('useCursorOutline', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it('returns a ref object', () => {
    const { result } = renderHook(() => useCursorOutline());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
  });

  it('sets initial CSS custom properties on attached element', () => {
    const { result } = renderHook(() => useCursorOutline());
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200 }),
    });
    (result.current.ref as { current: HTMLDivElement | null }).current = el;
    // Force effect re-run by re-rendering
    act(() => {
      // Manually trigger the initial property setup via a mousemove event
      const event = new MouseEvent('mousemove', { clientX: 50, clientY: 50 });
      document.dispatchEvent(event);
    });
    // Opacity should be > 0 when cursor is inside the element
    const opacity = el.style.getPropertyValue('--outline-opacity');
    expect(parseFloat(opacity)).toBeGreaterThan(0);
  });

  it('sets opacity to 0 when cursor is far outside the element', () => {
    const { result } = renderHook(() => useCursorOutline({ proximityThreshold: 100 }));
    const el = document.createElement('div');
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    });
    (result.current.ref as { current: HTMLDivElement | null }).current = el;
    act(() => {
      const event = new MouseEvent('mousemove', { clientX: 500, clientY: 500 });
      document.dispatchEvent(event);
    });
    const opacity = el.style.getPropertyValue('--outline-opacity');
    expect(parseFloat(opacity)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
npm run test --workspace=landing -- useCursorOutline
```

- [ ] **Step 3: Create hook**

```ts
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface UseCursorOutlineOptions {
  /** Distance in pixels from the element's edge at which the glow activates. */
  proximityThreshold?: number;
}

export function useCursorOutline({
  proximityThreshold = 220,
}: UseCursorOutlineOptions = {}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (reducedMotion) return;

    const el = ref.current;
    if (!el) return;

    // Initial values
    el.style.setProperty('--outline-x', '0px');
    el.style.setProperty('--outline-y', '0px');
    el.style.setProperty('--outline-opacity', '0');

    const handleMouseMove = (event: MouseEvent) => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Shortest distance from cursor to element's rectangle
      const clampedX = Math.max(0, Math.min(x, rect.width));
      const clampedY = Math.max(0, Math.min(y, rect.height));
      const isInside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
      const distance = isInside
        ? 0
        : Math.sqrt((x - clampedX) ** 2 + (y - clampedY) ** 2);

      node.style.setProperty('--outline-x', `${x}px`);
      node.style.setProperty('--outline-y', `${y}px`);
      node.style.setProperty(
        '--outline-opacity',
        distance < proximityThreshold
          ? String(1 - distance / proximityThreshold)
          : '0',
      );
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [proximityThreshold, reducedMotion]);

  return { ref };
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm run test --workspace=landing -- useCursorOutline
```
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add landing/src/lib/useCursorOutline.ts landing/src/lib/useCursorOutline.test.ts
git commit -m "feat(landing): add useCursorOutline hook with proximity tracking"
```

---

### Task 17: cursor-outline.css with mask technique

**Files:**
- Create: `landing/src/styles/cursor-outline.css`
- Modify: `landing/src/styles/globals.css` (add import)

- [ ] **Step 1: Create landing/src/styles/cursor-outline.css**

```css
/* Cursor-reactive outline glow.
 * Companion to frontend's metallic-border but thicker and placed
 * outside the element instead of on the 1px border strip.
 *
 * Usage:
 *   <div className="cursor-outline" ref={ref}>...</div>
 *   with useCursorOutline() populating --outline-x/y/opacity.
 */

.cursor-outline {
  --outline-x: 0px;
  --outline-y: 0px;
  --outline-opacity: 0;
  position: relative;
}

.cursor-outline::before {
  content: '';
  position: absolute;
  inset: -24px;               /* extends outside the element bounds */
  border-radius: inherit;
  padding: 24px;              /* ring thickness */
  pointer-events: none;
  z-index: -1;
  background: radial-gradient(
    circle 480px at var(--outline-x) var(--outline-y),
    hsl(0 0% 100% / calc(var(--outline-opacity) * 0.35)) 0%,
    hsl(0 0% 100% / calc(var(--outline-opacity) * 0.12)) 30%,
    transparent 70%
  );
  filter: blur(14px);

  /* Mask-composite trick: carve out the inner rectangle so the gradient
     only appears in the 24px ring outside the element. */
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
          mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
          mask-composite: exclude;
  transition: opacity var(--dur-med) var(--ease-out-quart);
}
```

- [ ] **Step 2: Add import to landing/src/styles/globals.css**

Find the existing imports and add `cursor-outline.css`:
```css
@import './theme.css';
@import './motion-policy.css';
@import './grain.css';
@import './cursor-outline.css';
```

- [ ] **Step 3: Commit**

```bash
git add landing/src/styles/cursor-outline.css landing/src/styles/globals.css
git commit -m "feat(landing): add cursor-outline CSS with mask-composite ring"
```

---

## Phase 4 — Preview Store, Context, and Fixtures

### Task 18: Create preview types

**Files:**
- Create: `landing/src/preview/types.ts`

- [ ] **Step 1: Create landing/src/preview/types.ts**

```ts
// Types shared by the preview store, context provider, and fixtures.

export type WorkflowPhase =
  | 'upload'
  | 'data-viewer'
  | 'preprocessing'
  | 'feature-engineering'
  | 'training'
  | 'experiments'
  | 'deployment';

export interface FakeUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface FakeProject {
  id: string;
  name: string;
  color: 'violet' | 'blue' | 'emerald' | 'amber' | 'rose';
  icon: string;
  createdAt: string;
  phases: Record<WorkflowPhase, 'locked' | 'in-progress' | 'completed'>;
}

export type DeploymentSubTab =
  | 'overview'
  | 'playground'
  | 'api'
  | 'logs'
  | 'monitoring';

export type QueryMode = 'english' | 'sql';

export interface QueryResultFixture {
  english: string;
  sql: string;
  rowCount: number;
  durationMs: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/preview/types.ts
git commit -m "feat(landing): add preview types"
```

---

### Task 19: Create project + user fixtures

**Files:**
- Create: `landing/src/preview/fixtures/project.ts`

- [ ] **Step 1: Create landing/src/preview/fixtures/project.ts**

```ts
import type { FakeProject, FakeUser } from '../types';

export const mockUser: FakeUser = {
  id: 'usr_demo',
  name: 'Demo',
  email: 'demo@agentic-automl.dev',
  avatarUrl: null,
};

export const mockProject: FakeProject = {
  id: 'prj_demo_novacraft',
  name: 'NovaCraft — Customer Churn',
  color: 'violet',
  icon: 'TrendingDown',
  createdAt: '2026-03-12T10:23:00.000Z',
  phases: {
    upload:               'completed',
    'data-viewer':        'completed',
    preprocessing:        'completed',
    'feature-engineering':'completed',
    training:             'completed',
    experiments:          'completed',
    deployment:           'completed',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/preview/fixtures/project.ts
git commit -m "feat(landing): add mock NovaCraft project + user fixtures"
```

---

### Task 20: Create previewStore with Zustand

**Files:**
- Create: `landing/src/preview/previewStore.ts`
- Create: `landing/src/preview/previewStore.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { usePreviewStore } from './previewStore';

describe('previewStore', () => {
  beforeEach(() => {
    usePreviewStore.setState(usePreviewStore.getInitialState());
  });

  it('starts with data-viewer as the active tab', () => {
    expect(usePreviewStore.getState().activeTab).toBe('data-viewer');
  });

  it('setActiveTab updates the active tab', () => {
    usePreviewStore.getState().setActiveTab('training');
    expect(usePreviewStore.getState().activeTab).toBe('training');
  });

  it('setDeploymentSubTab updates the deployment sub-tab only', () => {
    usePreviewStore.getState().setDeploymentSubTab('monitoring');
    expect(usePreviewStore.getState().deployment.activeSubTab).toBe('monitoring');
    expect(usePreviewStore.getState().activeTab).toBe('data-viewer');
  });

  it('selectExperimentModel updates the selected model id', () => {
    usePreviewStore.getState().selectExperimentModel('model_xgb_42');
    expect(usePreviewStore.getState().experiments.selectedModelId).toBe('model_xgb_42');
  });

  it('setDataViewerFileTab updates the file tab', () => {
    usePreviewStore.getState().setDataViewerFileTab('pdf_business_context');
    expect(usePreviewStore.getState().dataViewer.activeFileTabId).toBe('pdf_business_context');
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
npm run test --workspace=landing -- previewStore
```

- [ ] **Step 3: Create the store**

```ts
import { create } from 'zustand';
import type {
  WorkflowPhase,
  FakeUser,
  FakeProject,
  DeploymentSubTab,
  QueryMode,
  QueryResultFixture,
} from './types';
import { mockUser, mockProject } from './fixtures/project';

interface DataViewerState {
  activeFileTabId: string;
  queryMode: QueryMode;
  queryResult: QueryResultFixture;
}

interface PreprocessingState { activeCellId: string | null }
interface FeatureEngineeringState { activeCellId: string | null }
interface TrainingState {
  activeCellId: string | null;
  selectedModelId: string | null;
}
interface ExperimentsState {
  selectedModelId: string | null;
  sortBy: string;
  filters: Record<string, unknown>;
}
interface DeploymentState {
  activeSubTab: DeploymentSubTab;
  playgroundInput: string;
  playgroundOutput: string;
}

interface PreviewStore {
  // Identity (read-only in practice)
  fakeUser: FakeUser;
  fakeProject: FakeProject;

  // Tab navigation
  activeTab: WorkflowPhase;
  setActiveTab: (tab: WorkflowPhase) => void;

  // Per-tab interaction state
  dataViewer: DataViewerState;
  setDataViewerFileTab: (id: string) => void;
  setDataViewerQueryMode: (mode: QueryMode) => void;

  preprocessing: PreprocessingState;
  setPreprocessingActiveCell: (id: string | null) => void;

  featureEngineering: FeatureEngineeringState;
  setFeatureEngineeringActiveCell: (id: string | null) => void;

  training: TrainingState;
  setTrainingActiveCell: (id: string | null) => void;
  setTrainingSelectedModel: (id: string | null) => void;

  experiments: ExperimentsState;
  selectExperimentModel: (id: string | null) => void;
  setExperimentsSortBy: (sortBy: string) => void;

  deployment: DeploymentState;
  setDeploymentSubTab: (tab: DeploymentSubTab) => void;
  setDeploymentPlaygroundInput: (v: string) => void;
}

const initialQueryResult: QueryResultFixture = {
  english: 'which customers churned in Q2?',
  sql: `SELECT c.customer_id, c.company_name, c.plan_tier
FROM customers c
LEFT JOIN subscriptions s ON s.customer_id = c.customer_id
WHERE c.is_active = false
  AND s.end_date BETWEEN '2026-04-01' AND '2026-06-30'
ORDER BY c.annual_revenue_usd DESC;`,
  rowCount: 1249,
  durationMs: 420,
};

export const usePreviewStore = create<PreviewStore>((set) => ({
  fakeUser: mockUser,
  fakeProject: mockProject,

  activeTab: 'data-viewer',
  setActiveTab: (tab) => set({ activeTab: tab }),

  dataViewer: {
    activeFileTabId: 'customers_csv',
    queryMode: 'english',
    queryResult: initialQueryResult,
  },
  setDataViewerFileTab: (id) =>
    set((s) => ({ dataViewer: { ...s.dataViewer, activeFileTabId: id } })),
  setDataViewerQueryMode: (mode) =>
    set((s) => ({ dataViewer: { ...s.dataViewer, queryMode: mode } })),

  preprocessing: { activeCellId: null },
  setPreprocessingActiveCell: (id) =>
    set((s) => ({ preprocessing: { ...s.preprocessing, activeCellId: id } })),

  featureEngineering: { activeCellId: null },
  setFeatureEngineeringActiveCell: (id) =>
    set((s) => ({ featureEngineering: { ...s.featureEngineering, activeCellId: id } })),

  training: { activeCellId: null, selectedModelId: null },
  setTrainingActiveCell: (id) =>
    set((s) => ({ training: { ...s.training, activeCellId: id } })),
  setTrainingSelectedModel: (id) =>
    set((s) => ({ training: { ...s.training, selectedModelId: id } })),

  experiments: { selectedModelId: null, sortBy: 'rank', filters: {} },
  selectExperimentModel: (id) =>
    set((s) => ({ experiments: { ...s.experiments, selectedModelId: id } })),
  setExperimentsSortBy: (sortBy) =>
    set((s) => ({ experiments: { ...s.experiments, sortBy } })),

  deployment: {
    activeSubTab: 'overview',
    playgroundInput: '',
    playgroundOutput: '',
  },
  setDeploymentSubTab: (tab) =>
    set((s) => ({ deployment: { ...s.deployment, activeSubTab: tab } })),
  setDeploymentPlaygroundInput: (v) =>
    set((s) => ({ deployment: { ...s.deployment, playgroundInput: v } })),
}));
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm run test --workspace=landing -- previewStore
```
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add landing/src/preview/previewStore.ts landing/src/preview/previewStore.test.ts
git commit -m "feat(landing): add previewStore zustand with per-tab state"
```

---

### Task 21: Create plan + query fixtures

**Files:**
- Create: `landing/src/preview/fixtures/plan.ts`
- Create: `landing/src/preview/fixtures/query.ts`

- [ ] **Step 1: Create landing/src/preview/fixtures/plan.ts**

```ts
// Hardcoded agent plan shown in the Upload tab after file ingestion completes.

export interface PlanStep {
  id: string;
  label: string;
  description: string;
  status: 'complete';
}

export const mockPlan: { title: string; steps: PlanStep[] } = {
  title: 'Churn prediction plan',
  steps: [
    {
      id: 'p1',
      label: 'Profile 5 datasets',
      description: 'customers, subscriptions, support_tickets, usage_metrics, marketing_campaigns',
      status: 'complete',
    },
    {
      id: 'p2',
      label: 'Join on customer_id',
      description: 'Customer → subscriptions + tickets + usage on customer_id',
      status: 'complete',
    },
    {
      id: 'p3',
      label: 'Impute 5,432 missing values',
      description: 'annual_revenue, resolution_hours, discount_pct, satisfaction_score',
      status: 'complete',
    },
    {
      id: 'p4',
      label: 'Derive 12 features',
      description: 'recency, frequency, monetary value, churn signals',
      status: 'complete',
    },
    {
      id: 'p5',
      label: 'Train 4 classifiers with 5-fold CV',
      description: 'logistic regression, random forest, XGBoost, LightGBM',
      status: 'complete',
    },
  ],
};
```

- [ ] **Step 2: Create landing/src/preview/fixtures/query.ts**

```ts
// Data Viewer file tabs and the completed English→SQL query.

export interface DataViewerFileTab {
  id: string;
  label: string;
  type: 'csv' | 'sql' | 'pdf';
  pinned?: boolean;
}

export const mockFileTabs: DataViewerFileTab[] = [
  { id: 'customers_csv',          label: 'customers.csv',            type: 'csv' },
  { id: 'subscriptions_csv',      label: 'subscriptions.csv',        type: 'csv' },
  { id: 'sql_q2_churn',           label: 'SQL: Q2 churn',            type: 'sql', pinned: true },
  { id: 'pdf_business_context',   label: 'novacraft_business_context.pdf', type: 'pdf' },
];

export interface ColumnDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
}

export const mockCustomersColumns: ColumnDef[] = [
  { key: 'customer_id',   label: 'customer_id',   type: 'string' },
  { key: 'company_name',  label: 'company_name',  type: 'string' },
  { key: 'industry',      label: 'industry',      type: 'string' },
  { key: 'plan_tier',     label: 'plan_tier',     type: 'string' },
  { key: 'annual_revenue',label: 'annual_revenue',type: 'number' },
  { key: 'is_active',     label: 'is_active',     type: 'boolean' },
];

export const mockCustomersRows = Array.from({ length: 12 }).map((_, i) => ({
  customer_id: `NC-0${(1400 + i).toString()}`,
  company_name: [
    'Northlight Systems', 'Veridian Labs', 'Helix & Co.', 'Blueharbor', 'Kite Analytics',
    'Forge Studio', 'Meridian Supply', 'Parallax Health', 'Sundial Media', 'Pivot Freight',
    'Atlas Timber', 'Cobalt Robotics',
  ][i],
  industry: ['SaaS', 'Fintech', 'Healthcare', 'Logistics'][i % 4],
  plan_tier: ['Starter', 'Professional', 'Enterprise'][i % 3],
  annual_revenue: Math.round(80_000 + Math.random() * 920_000),
  is_active: i % 5 !== 0,
}));

export const mockSqlResultRows = mockCustomersRows.slice(0, 8).map((r) => ({
  ...r,
  is_active: false,
}));
```

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/fixtures/plan.ts landing/src/preview/fixtures/query.ts
git commit -m "feat(landing): add plan + query fixtures"
```

---

### Task 22: Create chats fixtures (preprocessing, FE, training)

**Files:**
- Create: `landing/src/preview/fixtures/chats.ts`

- [ ] **Step 1: Create landing/src/preview/fixtures/chats.ts**

```ts
// Pre-rendered chat history for the preprocessing, feature-engineering, and training tabs.
// Each tab reuses <ToolIndicator> and <ToolResultRenderer> from frontend/ so these messages
// must match the shape those components expect.

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallRow[];
  timestamp: string;
}

export interface ToolCallRow {
  id: string;
  name: string;
  label: string;
  status: 'complete';
  hint?: string;
}

export const preprocessingChat: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'Fix the data quality issues you found in the customers table.',
    timestamp: '2026-03-12T10:24:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: "I found 4 issues worth fixing. I'll handle them in order — missing values first, then the constant column, then duplicates.",
    toolCalls: [
      { id: 't1', name: 'profile_column', label: 'Profile annual_revenue_usd', status: 'complete', hint: '8% missing, heavy right-skew' },
      { id: 't2', name: 'impute_median', label: 'Impute with median by industry', status: 'complete', hint: '202 rows filled' },
      { id: 't3', name: 'drop_column', label: 'Drop region_code', status: 'complete', hint: 'constant: all "GLOBAL"' },
      { id: 't4', name: 'deduplicate', label: 'Drop exact duplicates', status: 'complete', hint: '30 rows removed' },
    ],
    timestamp: '2026-03-12T10:24:11Z',
  },
  {
    id: 'm3',
    role: 'assistant',
    content: 'Done. 4 cells added to the notebook — all reversible.',
    timestamp: '2026-03-12T10:24:42Z',
  },
];

export const featureEngineeringChat: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'Derive churn-predictive features from subscription and usage history.',
    timestamp: '2026-03-12T10:32:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'I joined three tables and derived 12 features. Top candidates by mutual information below.',
    toolCalls: [
      { id: 't1', name: 'join_tables', label: 'Join customers ⇐ subscriptions', status: 'complete', hint: 'on customer_id' },
      { id: 't2', name: 'join_tables', label: 'Join customers ⇐ usage_metrics', status: 'complete', hint: 'on customer_id (aggregated)' },
      { id: 't3', name: 'derive_feature', label: 'recency_days', status: 'complete', hint: 'days since last login' },
      { id: 't4', name: 'derive_feature', label: 'mrr_delta_30d', status: 'complete', hint: 'MRR change last 30 days' },
      { id: 't5', name: 'derive_feature', label: 'ticket_escalation_rate', status: 'complete', hint: 'escalated / total tickets' },
      { id: 't6', name: 'mutual_information', label: 'Rank features by MI', status: 'complete', hint: 'top 10 retained' },
    ],
    timestamp: '2026-03-12T10:32:28Z',
  },
];

export const trainingChat: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: 'Train classifiers with 5-fold CV and find the champion.',
    timestamp: '2026-03-12T10:41:00Z',
  },
  {
    id: 'm2',
    role: 'assistant',
    content: 'Training 4 models in parallel. Using Optuna for hyperparameter search with 40 trials each.',
    toolCalls: [
      { id: 't1', name: 'train_model', label: 'LogisticRegression', status: 'complete', hint: 'F1 0.79' },
      { id: 't2', name: 'train_model', label: 'RandomForest', status: 'complete', hint: 'F1 0.86' },
      { id: 't3', name: 'train_model', label: 'XGBoost', status: 'complete', hint: 'F1 0.91 ⭐ champion' },
      { id: 't4', name: 'train_model', label: 'LightGBM', status: 'complete', hint: 'F1 0.90' },
      { id: 't5', name: 'compute_shap', label: 'SHAP values for XGBoost', status: 'complete' },
    ],
    timestamp: '2026-03-12T10:41:35Z',
  },
  {
    id: 'm3',
    role: 'assistant',
    content: 'XGBoost wins with F1 0.91 on the held-out fold. Top features: recency_days, mrr_delta_30d, ticket_escalation_rate.',
    timestamp: '2026-03-12T10:45:12Z',
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/preview/fixtures/chats.ts
git commit -m "feat(landing): add chat history fixtures for 3 agentic phases"
```

---

### Task 23: Create notebook fixtures

**Files:**
- Create: `landing/src/preview/fixtures/notebooks.ts`

- [ ] **Step 1: Create landing/src/preview/fixtures/notebooks.ts**

```ts
// Pre-rendered notebook cells for preprocessing, feature-engineering, and training tabs.
// Format intentionally decoupled from frontend's internal NotebookCell shape so the
// landing preview can render cells with its own lightweight component.

export type NotebookCellKind = 'markdown' | 'code' | 'output';

export interface NotebookCellFixture {
  id: string;
  kind: NotebookCellKind;
  source: string;
  outputs?: NotebookOutputFixture[];
}

export type NotebookOutputFixture =
  | { type: 'text'; text: string }
  | { type: 'table'; columns: string[]; rows: (string | number)[][] }
  | { type: 'chart'; chartType: 'bar' | 'histogram' | 'line'; data: { name: string; value: number }[] };

export const preprocessingNotebook: NotebookCellFixture[] = [
  {
    id: 'pp_md_1',
    kind: 'markdown',
    source: '## Data quality repair — customers.csv',
  },
  {
    id: 'pp_code_1',
    kind: 'code',
    source: `# Profile annual_revenue_usd
profile = df['annual_revenue_usd'].describe()
missing = df['annual_revenue_usd'].isna().sum()
print(f"missing: {missing} ({100 * missing / len(df):.1f}%)")
profile`,
    outputs: [
      { type: 'text', text: 'missing: 202 (8.0%)' },
      {
        type: 'table',
        columns: ['stat', 'value'],
        rows: [
          ['count', 2328],
          ['mean', 4_870_432],
          ['std', 8_120_544],
          ['min', 12_000],
          ['50%', 1_200_000],
          ['max', 124_000_000],
        ],
      },
    ],
  },
  {
    id: 'pp_code_2',
    kind: 'code',
    source: `# Impute by industry median
from sklearn.impute import SimpleImputer
industry_medians = df.groupby('industry')['annual_revenue_usd'].transform('median')
df['annual_revenue_usd'] = df['annual_revenue_usd'].fillna(industry_medians)
df['annual_revenue_usd'].isna().sum()`,
    outputs: [{ type: 'text', text: '0' }],
  },
  {
    id: 'pp_code_3',
    kind: 'code',
    source: `# Drop constant + duplicate rows
df = df.drop(columns=['region_code'])
before = len(df)
df = df.drop_duplicates()
print(f"dropped {before - len(df)} duplicate rows")`,
    outputs: [{ type: 'text', text: 'dropped 30 duplicate rows' }],
  },
];

export const featureEngineeringNotebook: NotebookCellFixture[] = [
  {
    id: 'fe_md_1',
    kind: 'markdown',
    source: '## Feature derivation — joined customer view',
  },
  {
    id: 'fe_code_1',
    kind: 'code',
    source: `# Build the joined customer view
customers_view = (
    customers
    .merge(subscriptions, on='customer_id', how='left')
    .merge(
        usage_metrics.groupby('customer_id').agg(
            active_users_mean=('active_users', 'mean'),
            logins_sum=('total_logins', 'sum'),
            api_calls_p95=('api_calls', lambda s: s.quantile(0.95)),
        ),
        on='customer_id',
        how='left',
    )
)
print(customers_view.shape)`,
    outputs: [{ type: 'text', text: '(2500, 31)' }],
  },
  {
    id: 'fe_code_2',
    kind: 'code',
    source: `# Derive recency, frequency, monetary, engagement
from datetime import datetime
today = datetime(2026, 4, 1)
customers_view['recency_days'] = (today - customers_view['last_login']).dt.days
customers_view['mrr_delta_30d'] = customers_view['mrr_usd'] - customers_view['mrr_usd_30d_ago']
customers_view['ticket_escalation_rate'] = (
    customers_view['escalated_tickets'] / customers_view['total_tickets'].clip(lower=1)
)
customers_view[['recency_days', 'mrr_delta_30d', 'ticket_escalation_rate']].describe()`,
    outputs: [
      {
        type: 'table',
        columns: ['feature', 'mean', 'std'],
        rows: [
          ['recency_days',           42.8,  61.2],
          ['mrr_delta_30d',          -12.1, 84.3],
          ['ticket_escalation_rate', 0.06,  0.14],
        ],
      },
    ],
  },
  {
    id: 'fe_code_3',
    kind: 'code',
    source: `# Rank features by mutual information with is_active
from sklearn.feature_selection import mutual_info_classif
X = customers_view.drop(columns=['is_active'])
y = customers_view['is_active']
mi = mutual_info_classif(X.select_dtypes(include='number').fillna(0), y)
top = pd.Series(mi, index=X.select_dtypes(include='number').columns).sort_values(ascending=False)
top.head(10)`,
    outputs: [
      {
        type: 'chart',
        chartType: 'bar',
        data: [
          { name: 'recency_days',           value: 0.214 },
          { name: 'mrr_delta_30d',          value: 0.198 },
          { name: 'ticket_escalation_rate', value: 0.176 },
          { name: 'plan_tier',              value: 0.145 },
          { name: 'active_users_mean',      value: 0.131 },
          { name: 'api_calls_p95',          value: 0.119 },
          { name: 'logins_sum',             value: 0.104 },
          { name: 'seats_purchased',        value: 0.091 },
          { name: 'avg_session_minutes',    value: 0.082 },
          { name: 'satisfaction_score',     value: 0.074 },
        ],
      },
    ],
  },
];

export const trainingNotebook: NotebookCellFixture[] = [
  {
    id: 'tr_md_1',
    kind: 'markdown',
    source: '## Training — 4 classifiers, 5-fold CV',
  },
  {
    id: 'tr_code_1',
    kind: 'code',
    source: `# Build pipeline + search space
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import StratifiedKFold
import optuna, xgboost as xgb

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

def objective(trial):
    params = {
        'max_depth':        trial.suggest_int('max_depth', 3, 10),
        'learning_rate':    trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
        'n_estimators':     trial.suggest_int('n_estimators', 100, 600),
        'subsample':        trial.suggest_float('subsample', 0.6, 1.0),
        'colsample_bytree': trial.suggest_float('colsample_bytree', 0.6, 1.0),
    }
    model = xgb.XGBClassifier(**params, random_state=42)
    scores = cross_val_score(model, X, y, cv=cv, scoring='f1')
    return scores.mean()

study = optuna.create_study(direction='maximize')
study.optimize(objective, n_trials=40, show_progress_bar=True)
print(f"best F1: {study.best_value:.4f}")
print(f"best params: {study.best_params}")`,
    outputs: [
      { type: 'text', text: 'best F1: 0.9117' },
      { type: 'text', text: "best params: {'max_depth': 7, 'learning_rate': 0.083, 'n_estimators': 420, 'subsample': 0.85, 'colsample_bytree': 0.78}" },
    ],
  },
  {
    id: 'tr_code_2',
    kind: 'code',
    source: `# Fit final champion and compute SHAP
import shap
champion = xgb.XGBClassifier(**study.best_params, random_state=42).fit(X, y)
explainer = shap.TreeExplainer(champion)
shap_values = explainer.shap_values(X)
shap.summary_plot(shap_values, X, plot_type='bar', max_display=8)`,
    outputs: [
      {
        type: 'chart',
        chartType: 'bar',
        data: [
          { name: 'recency_days',           value: 0.82 },
          { name: 'mrr_delta_30d',          value: 0.71 },
          { name: 'ticket_escalation_rate', value: 0.58 },
          { name: 'plan_tier=Starter',      value: 0.44 },
          { name: 'logins_sum',             value: 0.37 },
          { name: 'api_calls_p95',          value: 0.29 },
          { name: 'satisfaction_score',     value: 0.22 },
          { name: 'seats_purchased',        value: 0.18 },
        ],
      },
    ],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/preview/fixtures/notebooks.ts
git commit -m "feat(landing): add notebook fixtures with code cells + outputs"
```

---

### Task 24: Create experiments + deployment fixtures

**Files:**
- Create: `landing/src/preview/fixtures/experiments.ts`
- Create: `landing/src/preview/fixtures/deployment.ts`

- [ ] **Step 1: Create landing/src/preview/fixtures/experiments.ts**

```ts
// Mock ModelRecord entries for the Experiments leaderboard + detail drawer.

export interface ModelFixture {
  id: string;
  name: string;
  family: 'XGBoost' | 'LightGBM' | 'RandomForest' | 'LogisticRegression';
  f1: number;
  precision: number;
  recall: number;
  auc: number;
  trainingSeconds: number;
  trainedAt: string;
  isChampion: boolean;
  topFeatures: { name: string; importance: number }[];
  confusionMatrix: [[number, number], [number, number]];
}

export const mockModels: ModelFixture[] = [
  {
    id: 'model_xgb_42',
    name: 'xgboost_v3',
    family: 'XGBoost',
    f1: 0.9117,
    precision: 0.9042,
    recall: 0.9194,
    auc: 0.9612,
    trainingSeconds: 248,
    trainedAt: '2026-03-12T10:44:18Z',
    isChampion: true,
    topFeatures: [
      { name: 'recency_days',           importance: 0.82 },
      { name: 'mrr_delta_30d',          importance: 0.71 },
      { name: 'ticket_escalation_rate', importance: 0.58 },
      { name: 'plan_tier=Starter',      importance: 0.44 },
    ],
    confusionMatrix: [[1840, 66], [49, 545]],
  },
  {
    id: 'model_lgb_17',
    name: 'lightgbm_v2',
    family: 'LightGBM',
    f1: 0.9002,
    precision: 0.8931,
    recall: 0.9074,
    auc: 0.9544,
    trainingSeconds: 192,
    trainedAt: '2026-03-12T10:42:01Z',
    isChampion: false,
    topFeatures: [
      { name: 'recency_days',           importance: 0.79 },
      { name: 'mrr_delta_30d',          importance: 0.68 },
      { name: 'ticket_escalation_rate', importance: 0.55 },
      { name: 'logins_sum',             importance: 0.38 },
    ],
    confusionMatrix: [[1822, 84], [55, 539]],
  },
  {
    id: 'model_rf_08',
    name: 'rf_v1',
    family: 'RandomForest',
    f1: 0.8611,
    precision: 0.8543,
    recall: 0.8680,
    auc: 0.9289,
    trainingSeconds: 412,
    trainedAt: '2026-03-12T10:39:44Z',
    isChampion: false,
    topFeatures: [
      { name: 'recency_days',          importance: 0.76 },
      { name: 'mrr_delta_30d',         importance: 0.63 },
      { name: 'active_users_mean',     importance: 0.48 },
      { name: 'plan_tier=Starter',     importance: 0.41 },
    ],
    confusionMatrix: [[1780, 126], [78, 516]],
  },
  {
    id: 'model_lr_03',
    name: 'logistic_v1',
    family: 'LogisticRegression',
    f1: 0.7904,
    precision: 0.7812,
    recall: 0.7998,
    auc: 0.8872,
    trainingSeconds: 38,
    trainedAt: '2026-03-12T10:36:12Z',
    isChampion: false,
    topFeatures: [
      { name: 'recency_days',          importance: 0.72 },
      { name: 'plan_tier=Starter',     importance: 0.58 },
      { name: 'ticket_escalation_rate',importance: 0.49 },
      { name: 'mrr_delta_30d',         importance: 0.42 },
    ],
    confusionMatrix: [[1698, 208], [119, 475]],
  },
];
```

- [ ] **Step 2: Create landing/src/preview/fixtures/deployment.ts**

```ts
// Mock deployment overview + logs + monitoring history.

export interface DeploymentOverview {
  id: string;
  modelName: string;
  modelFamily: string;
  endpoint: string;
  status: 'healthy' | 'degraded' | 'error';
  version: string;
  deployedAt: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  rps: number;
  errorRate: number;
}

export const mockDeployment: DeploymentOverview = {
  id: 'dep_churn_prod_v3',
  modelName: 'xgboost_v3',
  modelFamily: 'XGBoost',
  endpoint: 'https://api.agentic-automl.dev/models/novacraft-churn/v3/predict',
  status: 'healthy',
  version: 'v3.2.1',
  deployedAt: '2026-03-12T11:02:44Z',
  p50Ms: 24,
  p95Ms: 58,
  p99Ms: 112,
  rps: 184,
  errorRate: 0.0012,
};

export const mockLogs: { timestamp: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string }[] = [
  { timestamp: '12:41:08', level: 'INFO',  message: 'POST /predict 200 (24ms) customer_id=NC-01492' },
  { timestamp: '12:41:08', level: 'INFO',  message: 'POST /predict 200 (18ms) customer_id=NC-02103' },
  { timestamp: '12:41:08', level: 'INFO',  message: 'POST /predict 200 (31ms) customer_id=NC-00847' },
  { timestamp: '12:41:07', level: 'INFO',  message: 'POST /predict 200 (22ms) customer_id=NC-01736' },
  { timestamp: '12:41:07', level: 'WARN',  message: 'Feature "recency_days" imputed (missing from request)' },
  { timestamp: '12:41:07', level: 'INFO',  message: 'POST /predict 200 (19ms) customer_id=NC-00421' },
  { timestamp: '12:41:06', level: 'INFO',  message: 'POST /predict 200 (28ms) customer_id=NC-02298' },
  { timestamp: '12:41:06', level: 'INFO',  message: 'POST /predict 200 (21ms) customer_id=NC-01175' },
  { timestamp: '12:41:05', level: 'INFO',  message: 'POST /predict 200 (17ms) customer_id=NC-00639' },
  { timestamp: '12:41:05', level: 'INFO',  message: 'POST /predict 200 (34ms) customer_id=NC-02041' },
  { timestamp: '12:41:04', level: 'INFO',  message: 'POST /predict 200 (23ms) customer_id=NC-00512' },
  { timestamp: '12:41:04', level: 'ERROR', message: 'POST /predict 400 missing field "customer_id"' },
  { timestamp: '12:41:03', level: 'INFO',  message: 'POST /predict 200 (26ms) customer_id=NC-01889' },
  { timestamp: '12:41:03', level: 'INFO',  message: 'POST /predict 200 (20ms) customer_id=NC-00284' },
  { timestamp: '12:41:02', level: 'INFO',  message: 'POST /predict 200 (25ms) customer_id=NC-01661' },
  { timestamp: '12:41:02', level: 'INFO',  message: 'Health check OK' },
];

export const mockLatencyHistory = Array.from({ length: 60 }).map((_, i) => ({
  t: i,
  p50: 22 + Math.round(Math.sin(i / 5) * 3 + Math.random() * 2),
  p95: 54 + Math.round(Math.sin(i / 7) * 6 + Math.random() * 4),
}));

export const mockRpsHistory = Array.from({ length: 60 }).map((_, i) => ({
  t: i,
  rps: 180 + Math.round(Math.cos(i / 4) * 18 + Math.random() * 6),
}));

export const mockErrorHistory = Array.from({ length: 60 }).map((_, i) => ({
  t: i,
  rate: Math.max(0, 0.0008 + Math.sin(i / 11) * 0.0005 + Math.random() * 0.0003),
}));
```

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/fixtures/experiments.ts landing/src/preview/fixtures/deployment.ts
git commit -m "feat(landing): add experiments + deployment fixtures"
```

---

## Phase 5 — Preview Shell Structure

### Task 25: PreviewSidebar component

**Files:**
- Create: `landing/src/preview/PreviewSidebar.tsx`

- [ ] **Step 1: Create landing/src/preview/PreviewSidebar.tsx**

```tsx
import {
  Upload, Database, SlidersHorizontal, Sparkles, Brain, LineChart, Rocket,
  ChevronDown, Plus, Check,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreviewStore } from './previewStore';
import type { WorkflowPhase } from './types';

interface PhaseDef {
  id: WorkflowPhase;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const PHASES: PhaseDef[] = [
  { id: 'upload',               label: 'Upload',               icon: Upload },
  { id: 'data-viewer',          label: 'Data Viewer',          icon: Database },
  { id: 'preprocessing',        label: 'Preprocessing',        icon: SlidersHorizontal },
  { id: 'feature-engineering',  label: 'Feature Engineering',  icon: Sparkles },
  { id: 'training',             label: 'Training',             icon: Brain },
  { id: 'experiments',          label: 'Experiments',          icon: LineChart },
  { id: 'deployment',           label: 'Deployment',           icon: Rocket },
];

export function PreviewSidebar() {
  const activeTab = usePreviewStore((s) => s.activeTab);
  const setActiveTab = usePreviewStore((s) => s.setActiveTab);
  const project = usePreviewStore((s) => s.fakeProject);

  return (
    <aside className="preview-sidebar" aria-label="Workspace navigation">
      <div className="preview-sidebar-project">
        <div className="preview-sidebar-project-chip" aria-hidden="true">
          <span className="preview-sidebar-project-dot" />
        </div>
        <div className="preview-sidebar-project-info">
          <span className="preview-sidebar-project-name">{project.name}</span>
          <span className="preview-sidebar-project-meta">active · 7 phases</span>
        </div>
        <ChevronDown size={14} className="preview-sidebar-chevron" aria-hidden="true" />
      </div>

      <div className="preview-sidebar-section-label">Workflow</div>
      <nav className="preview-sidebar-phase-list" role="tablist" aria-orientation="vertical">
        {PHASES.map((phase, idx) => {
          const Icon = phase.icon;
          const isActive = activeTab === phase.id;
          return (
            <button
              key={phase.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`preview-panel-${phase.id}`}
              className={cn('preview-sidebar-phase', isActive && 'is-active')}
              onClick={() => setActiveTab(phase.id)}
            >
              <span className="preview-sidebar-phase-index">{idx + 1}</span>
              <Icon size={14} className="preview-sidebar-phase-icon" aria-hidden="true" />
              <span className="preview-sidebar-phase-label">{phase.label}</span>
              <Check size={12} className="preview-sidebar-phase-check" aria-hidden="true" />
            </button>
          );
        })}
      </nav>

      <div className="preview-sidebar-section-label">Projects</div>
      <button type="button" className="preview-sidebar-new-project">
        <Plus size={14} aria-hidden="true" />
        <span>New project</span>
      </button>
    </aside>
  );
}
```

- [ ] **Step 2: Create companion styles in landing/src/preview/preview.css**

Create `landing/src/preview/preview.css`:
```css
/* Preview shell styles. Scoped to elements inside the interactive app preview. */

.preview-root {
  display: grid;
  grid-template-columns: 260px 1fr;
  grid-template-rows: 48px 1fr;
  height: 100%;
  background: var(--surface-1);
  color: var(--text);
  font-family: 'Inter Variable', sans-serif;
}

/* Sidebar */
.preview-sidebar {
  grid-column: 1;
  grid-row: 1 / span 2;
  background: var(--surface-0);
  border-right: 0.8px solid var(--border);
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.preview-sidebar-project {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 12px;
  margin: 0 6px 8px;
  border-bottom: 0.8px solid var(--border);
}
.preview-sidebar-project-chip {
  width: 28px; height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.5), rgba(139, 92, 246, 0.15));
  border: 0.8px solid rgba(139, 92, 246, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.preview-sidebar-project-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: rgba(139, 92, 246, 0.9);
}
.preview-sidebar-project-info { flex: 1; min-width: 0; }
.preview-sidebar-project-name {
  display: block;
  font-size: 13px;
  font-weight: 510;
  color: var(--text);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.preview-sidebar-project-meta {
  display: block;
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.preview-sidebar-chevron { color: var(--text-dim); }

.preview-sidebar-section-label {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 12px 18px 6px;
}

.preview-sidebar-phase-list {
  display: flex;
  flex-direction: column;
  padding: 0 8px;
  gap: 2px;
}

.preview-sidebar-phase {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  background: transparent;
  border: 0;
  color: var(--text-muted);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-linear-default),
              color var(--dur-fast) var(--ease-linear-default);
}
.preview-sidebar-phase:hover { background: rgba(255, 255, 255, 0.03); color: var(--text); }
.preview-sidebar-phase.is-active {
  background: rgba(139, 92, 246, 0.12);
  color: var(--text);
}
.preview-sidebar-phase.is-active .preview-sidebar-phase-index { color: rgba(139, 92, 246, 0.9); }

.preview-sidebar-phase-index {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  color: var(--text-dim);
  width: 14px;
  text-align: right;
}
.preview-sidebar-phase-icon { color: currentColor; opacity: 0.8; }
.preview-sidebar-phase-label { flex: 1; }
.preview-sidebar-phase-check { color: rgba(139, 92, 246, 0.7); }

.preview-sidebar-new-project {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  margin: 0 8px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  border-radius: 6px;
  transition: background var(--dur-fast);
}
.preview-sidebar-new-project:hover { background: rgba(255, 255, 255, 0.03); color: var(--text); }
```

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/PreviewSidebar.tsx landing/src/preview/preview.css
git commit -m "feat(landing): add PreviewSidebar with 7-phase workflow nav"
```

---

### Task 26: PreviewTopbar component

**Files:**
- Create: `landing/src/preview/PreviewTopbar.tsx`
- Modify: `landing/src/preview/preview.css`

- [ ] **Step 1: Create landing/src/preview/PreviewTopbar.tsx**

```tsx
import { Bell, Settings, Palette } from 'lucide-react';
import { usePreviewStore } from './previewStore';

const PHASE_LABELS: Record<string, string> = {
  'upload':               'Upload',
  'data-viewer':          'Data Viewer',
  'preprocessing':        'Preprocessing',
  'feature-engineering':  'Feature Engineering',
  'training':             'Training',
  'experiments':          'Experiments',
  'deployment':           'Deployment',
};

export function PreviewTopbar() {
  const activeTab = usePreviewStore((s) => s.activeTab);
  const user = usePreviewStore((s) => s.fakeUser);

  return (
    <header className="preview-topbar">
      <div className="preview-topbar-breadcrumb">
        <span className="preview-topbar-phase">{PHASE_LABELS[activeTab]}</span>
      </div>

      <div className="preview-topbar-actions">
        <button type="button" className="preview-topbar-icon" aria-label="Theme">
          <Palette size={14} aria-hidden="true" />
        </button>
        <button type="button" className="preview-topbar-icon" aria-label="Notifications">
          <Bell size={14} aria-hidden="true" />
        </button>
        <button type="button" className="preview-topbar-icon" aria-label="Settings">
          <Settings size={14} aria-hidden="true" />
        </button>
        <div className="preview-topbar-avatar" aria-label={user.name}>
          {user.name.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Append to landing/src/preview/preview.css**

```css
/* Topbar */
.preview-topbar {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--surface-0);
  border-bottom: 0.8px solid var(--border);
}
.preview-topbar-phase {
  font-size: 13px;
  font-weight: 510;
  color: var(--text);
}
.preview-topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview-topbar-icon {
  width: 28px;
  height: 28px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--dur-fast), color var(--dur-fast);
}
.preview-topbar-icon:hover { background: rgba(255, 255, 255, 0.04); color: var(--text); }
.preview-topbar-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #4a4a4a, #2a2a2a);
  color: var(--text);
  font-size: 12px;
  font-weight: 510;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0.8px solid var(--border-strong);
}
```

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/PreviewTopbar.tsx landing/src/preview/preview.css
git commit -m "feat(landing): add PreviewTopbar with phase breadcrumb + fake user"
```

---

### Task 27: PreviewShell router

**Files:**
- Create: `landing/src/preview/PreviewShell.tsx`

- [ ] **Step 1: Create landing/src/preview/PreviewShell.tsx (stub views for now)**

```tsx
import './preview.css';
import { PreviewSidebar } from './PreviewSidebar';
import { PreviewTopbar } from './PreviewTopbar';
import { usePreviewStore } from './previewStore';

// Per-tab view components will be added in Phase 6.
// For now, render a placeholder so the shell compiles.
const PlaceholderView = ({ phase }: { phase: string }) => (
  <div className="preview-placeholder" role="status">
    <p className="preview-placeholder-label">{phase.toUpperCase()}</p>
    <p className="preview-placeholder-text">Tab view scaffolding…</p>
  </div>
);

export function PreviewShell() {
  const activeTab = usePreviewStore((s) => s.activeTab);

  return (
    <div className="preview-root" role="application" aria-label="Agentic AutoML Platform demo">
      <PreviewSidebar />
      <PreviewTopbar />
      <main
        className="preview-content"
        id={`preview-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`preview-tab-${activeTab}`}
      >
        <PlaceholderView phase={activeTab} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Append to landing/src/preview/preview.css**

```css
.preview-content {
  grid-column: 2;
  grid-row: 2;
  overflow: auto;
  background: var(--surface-1);
  position: relative;
}

.preview-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.preview-placeholder-label {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.1em;
}
.preview-placeholder-text {
  font-size: 13px;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/PreviewShell.tsx landing/src/preview/preview.css
git commit -m "feat(landing): add PreviewShell router with placeholder views"
```

---

### Task 28: PreviewIsland wrapper for Astro

**Files:**
- Create: `landing/src/islands/PreviewIsland.tsx`

- [ ] **Step 1: Create landing/src/islands/PreviewIsland.tsx**

```tsx
import { PreviewShell } from '@/preview/PreviewShell';

// Astro island entry point. The outer <div> is what Astro hydrates.
// We keep this thin so the shell can be imported in tests without Astro runtime.
export default function PreviewIsland() {
  return <PreviewShell />;
}
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/islands/PreviewIsland.tsx
git commit -m "feat(landing): add PreviewIsland Astro entry point"
```

---

## Phase 6 — Per-Tab Views

Each task in this phase builds one tab view inside `landing/src/preview/tabs/`. Tasks are ordered by visual complexity (lightest first) so the implementer can stage visual polish incrementally.

### Task 29: UploadView

**Files:**
- Create: `landing/src/preview/tabs/UploadView.tsx`
- Create: `landing/src/preview/tabs/UploadView.module.css`

- [ ] **Step 1: Create landing/src/preview/tabs/UploadView.module.css**

```css
.root {
  padding: 32px 40px;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(360px, 1fr);
  gap: 32px;
  align-content: start;
}

.fileCard {
  padding: 20px;
  background: var(--surface-0);
  border: 0.8px solid var(--border);
  border-radius: 10px;
}
.fileCardHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.fileCardName {
  font-size: 14px;
  font-weight: 510;
  color: var(--text);
}
.fileCardStatus {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11px;
  color: rgba(139, 92, 246, 0.9);
  background: rgba(139, 92, 246, 0.1);
  padding: 2px 8px;
  border-radius: 999px;
  margin-left: auto;
}
.fileMetaRow {
  display: flex;
  gap: 16px;
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  color: var(--text-muted);
}

.planCard {
  padding: 20px;
  background: var(--surface-0);
  border: 0.8px solid var(--border);
  border-radius: 10px;
}
.planTitle {
  font-size: 14px;
  font-weight: 510;
  margin: 0 0 16px;
}
.planStep {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-top: 0.8px solid var(--border);
}
.planStep:first-of-type { border-top: 0; }
.planStepCheck {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(139, 92, 246, 0.15);
  color: rgba(139, 92, 246, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.planStepBody { flex: 1; min-width: 0; }
.planStepLabel {
  font-size: 13px;
  color: var(--text);
}
.planStepDesc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
```

- [ ] **Step 2: Create landing/src/preview/tabs/UploadView.tsx**

```tsx
import { Check, FileText } from 'lucide-react';
import { mockPlan } from '@/preview/fixtures/plan';
import styles from './UploadView.module.css';

export function UploadView() {
  return (
    <div className={styles.root}>
      <div className={styles.fileCard}>
        <div className={styles.fileCardHeader}>
          <FileText size={18} aria-hidden="true" />
          <span className={styles.fileCardName}>customers.csv</span>
          <span className={styles.fileCardStatus}>READY</span>
        </div>
        <div className={styles.fileMetaRow}>
          <span>2,530 rows</span>
          <span>14 columns</span>
          <span>482 KB</span>
        </div>
      </div>

      <div className={styles.planCard}>
        <h3 className={styles.planTitle}>{mockPlan.title}</h3>
        {mockPlan.steps.map((step) => (
          <div key={step.id} className={styles.planStep}>
            <div className={styles.planStepCheck}><Check size={10} aria-hidden="true" /></div>
            <div className={styles.planStepBody}>
              <div className={styles.planStepLabel}>{step.label}</div>
              <div className={styles.planStepDesc}>{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into PreviewShell**

Edit `landing/src/preview/PreviewShell.tsx` — import `UploadView` and add a switch for `activeTab === 'upload'`:

```tsx
import './preview.css';
import { PreviewSidebar } from './PreviewSidebar';
import { PreviewTopbar } from './PreviewTopbar';
import { usePreviewStore } from './previewStore';
import { UploadView } from './tabs/UploadView';

const PlaceholderView = ({ phase }: { phase: string }) => (
  <div className="preview-placeholder" role="status">
    <p className="preview-placeholder-label">{phase.toUpperCase()}</p>
    <p className="preview-placeholder-text">Tab view scaffolding…</p>
  </div>
);

function ActiveView({ phase }: { phase: string }) {
  switch (phase) {
    case 'upload':        return <UploadView />;
    default:              return <PlaceholderView phase={phase} />;
  }
}

export function PreviewShell() {
  const activeTab = usePreviewStore((s) => s.activeTab);
  return (
    <div className="preview-root" role="application" aria-label="Agentic AutoML Platform demo">
      <PreviewSidebar />
      <PreviewTopbar />
      <main className="preview-content" id={`preview-panel-${activeTab}`} role="tabpanel">
        <ActiveView phase={activeTab} />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add landing/src/preview/tabs/UploadView.tsx landing/src/preview/tabs/UploadView.module.css landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): UploadView with file card + completed plan"
```

---

### Task 30: DataViewerView — file tabs + data table

**Files:**
- Create: `landing/src/preview/tabs/DataViewerView.tsx`
- Create: `landing/src/preview/tabs/DataViewerView.module.css`

- [ ] **Step 1: Create landing/src/preview/tabs/DataViewerView.module.css**

```css
.root {
  display: grid;
  grid-template-rows: 40px 1fr;
  height: 100%;
}

.fileTabs {
  display: flex;
  background: var(--surface-0);
  border-bottom: 0.8px solid var(--border);
  padding: 0 8px;
  overflow-x: auto;
}
.fileTab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 40px;
  background: transparent;
  color: var(--text-muted);
  border: 0;
  border-right: 0.8px solid var(--border);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  position: relative;
  transition: color var(--dur-fast), background var(--dur-fast);
}
.fileTab:hover { color: var(--text); }
.fileTabActive {
  color: var(--text);
  background: var(--surface-1);
}
.fileTabActive::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: rgba(139, 92, 246, 0.9);
}

.body {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 0;
  height: 100%;
  overflow: hidden;
}

.mainPanel { padding: 20px; overflow: auto; }
.queryPanel {
  border-left: 0.8px solid var(--border);
  background: var(--surface-0);
  padding: 20px;
  overflow: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.table th {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  padding: 10px 12px;
  border-bottom: 0.8px solid var(--border);
  background: var(--surface-1);
  position: sticky;
  top: 0;
}
.table td {
  padding: 10px 12px;
  border-bottom: 0.8px solid var(--border);
  color: var(--text);
}
.table tr:hover td { background: rgba(255, 255, 255, 0.02); }

.queryLabel {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
}
.queryEnglish {
  font-size: 14px;
  color: var(--text);
  line-height: 1.4;
  margin-bottom: 16px;
}
.querySeparator {
  border: 0;
  border-top: 0.8px solid var(--border);
  margin: 0 0 16px;
}
.querySql {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  color: var(--text);
  background: var(--surface-1);
  border: 0.8px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  white-space: pre-wrap;
  line-height: 1.5;
}
.queryResult {
  margin-top: 16px;
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Create landing/src/preview/tabs/DataViewerView.tsx**

```tsx
import { FileText, FileCode, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreviewStore } from '@/preview/previewStore';
import {
  mockFileTabs,
  mockCustomersColumns,
  mockCustomersRows,
  mockSqlResultRows,
} from '@/preview/fixtures/query';
import styles from './DataViewerView.module.css';

const ICONS = {
  csv: FileSpreadsheet,
  sql: FileCode,
  pdf: FileText,
} as const;

export function DataViewerView() {
  const activeFileTabId = usePreviewStore((s) => s.dataViewer.activeFileTabId);
  const setFileTab = usePreviewStore((s) => s.setDataViewerFileTab);
  const query = usePreviewStore((s) => s.dataViewer.queryResult);

  const rows = activeFileTabId === 'sql_q2_churn' ? mockSqlResultRows : mockCustomersRows;
  const showPdf = activeFileTabId === 'pdf_business_context';

  return (
    <div className={styles.root}>
      <div className={styles.fileTabs} role="tablist" aria-label="Open files">
        {mockFileTabs.map((tab) => {
          const Icon = ICONS[tab.type];
          const isActive = activeFileTabId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={cn(styles.fileTab, isActive && styles.fileTabActive)}
              onClick={() => setFileTab(tab.id)}
            >
              <Icon size={12} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.body}>
        <div className={styles.mainPanel}>
          {showPdf ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13 }}>
              <div style={{ textAlign: 'center' }}>
                <FileText size={32} aria-hidden="true" style={{ opacity: 0.4 }} />
                <p style={{ marginTop: 12 }}>novacraft_business_context.pdf</p>
                <p style={{ fontSize: 11, color: 'var(--text-dim)' }}>PDF viewer loads on interaction</p>
              </div>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  {mockCustomersColumns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.customer_id}</td>
                    <td>{row.company_name}</td>
                    <td>{row.industry}</td>
                    <td>{row.plan_tier}</td>
                    <td>${row.annual_revenue.toLocaleString()}</td>
                    <td>{row.is_active ? 'true' : 'false'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <aside className={styles.queryPanel}>
          <div className={styles.queryLabel}>English query</div>
          <p className={styles.queryEnglish}>{query.english}</p>
          <hr className={styles.querySeparator} />
          <pre className={styles.querySql}>{query.sql}</pre>
          <div className={styles.queryResult}>
            → {query.rowCount.toLocaleString()} rows returned · {(query.durationMs / 1000).toFixed(2)}s
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into PreviewShell.tsx**

Add the import and switch case:
```tsx
import { DataViewerView } from './tabs/DataViewerView';
// ...
case 'data-viewer':   return <DataViewerView />;
```

- [ ] **Step 4: Commit**

```bash
git add landing/src/preview/tabs/DataViewerView.tsx landing/src/preview/tabs/DataViewerView.module.css landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): DataViewerView with file tabs + table + query panel"
```

---

### Task 31: PreprocessingView — agentic shell layout

**Files:**
- Create: `landing/src/preview/tabs/PreprocessingView.tsx`
- Create: `landing/src/preview/tabs/AgenticShell.module.css`
- Create: `landing/src/preview/components/ChatHistory.tsx`
- Create: `landing/src/preview/components/NotebookColumn.tsx`

- [ ] **Step 1: Create landing/src/preview/tabs/AgenticShell.module.css** (shared by preprocessing, FE, training)

```css
.root {
  display: grid;
  grid-template-columns: minmax(360px, 420px) 1fr;
  height: 100%;
  overflow: hidden;
}

.chatColumn {
  display: flex;
  flex-direction: column;
  background: var(--surface-0);
  border-right: 0.8px solid var(--border);
  overflow: hidden;
}
.chatHistory {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.chatComposer {
  padding: 16px 20px;
  border-top: 0.8px solid var(--border);
  background: var(--surface-0);
}
.chatInput {
  width: 100%;
  background: var(--surface-1);
  border: 0.8px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text);
  resize: none;
}

.notebookColumn {
  overflow-y: auto;
  padding: 24px 28px;
  background: var(--surface-1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message { display: flex; gap: 12px; }
.messageAvatar {
  width: 24px; height: 24px;
  flex-shrink: 0;
  border-radius: 6px;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 11px;
  font-family: 'Geist Mono Variable', monospace;
}
.messageBody { flex: 1; min-width: 0; }
.messageContent {
  font-size: 13px;
  color: var(--text);
  line-height: 1.55;
}
.toolRows {
  margin-top: 10px;
  border: 0.8px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--surface-1);
}
.toolRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-top: 0.8px solid var(--border);
  font-size: 12px;
}
.toolRow:first-child { border-top: 0; }
.toolRowCheck {
  width: 12px;
  height: 12px;
  color: rgba(139, 92, 246, 0.9);
  flex-shrink: 0;
}
.toolRowLabel { color: var(--text); flex: 1; }
.toolRowHint { color: var(--text-muted); font-family: 'Geist Mono Variable', monospace; font-size: 11px; }

.notebookCell {
  background: var(--surface-0);
  border: 0.8px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.notebookCellMarkdown { padding: 16px 20px; }
.notebookCellMarkdown h3 { margin: 0; font-size: 14px; font-weight: 590; }
.notebookCellCode {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  padding: 14px 18px;
  color: var(--text);
  background: var(--surface-0);
  white-space: pre;
  overflow-x: auto;
  line-height: 1.55;
}
.notebookCellOutput {
  border-top: 0.8px solid var(--border);
  padding: 12px 18px;
  background: rgba(0, 0, 0, 0.18);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  color: var(--text-muted);
}
```

- [ ] **Step 2: Create landing/src/preview/components/ChatHistory.tsx**

```tsx
import { Check } from 'lucide-react';
import type { ChatMessage } from '@/preview/fixtures/chats';
import styles from '@/preview/tabs/AgenticShell.module.css';

export function ChatHistory({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className={styles.chatHistory}>
      {messages.map((m) => (
        <div key={m.id} className={styles.message}>
          <div className={styles.messageAvatar}>{m.role === 'user' ? 'U' : 'AI'}</div>
          <div className={styles.messageBody}>
            <p className={styles.messageContent}>{m.content}</p>
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className={styles.toolRows}>
                {m.toolCalls.map((t) => (
                  <div key={t.id} className={styles.toolRow}>
                    <Check size={12} className={styles.toolRowCheck} aria-hidden="true" />
                    <span className={styles.toolRowLabel}>{t.label}</span>
                    {t.hint && <span className={styles.toolRowHint}>{t.hint}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create landing/src/preview/components/NotebookColumn.tsx**

```tsx
import type { NotebookCellFixture, NotebookOutputFixture } from '@/preview/fixtures/notebooks';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import styles from '@/preview/tabs/AgenticShell.module.css';

function RenderOutput({ out }: { out: NotebookOutputFixture }) {
  if (out.type === 'text') {
    return <div className={styles.notebookCellOutput}>{out.text}</div>;
  }
  if (out.type === 'table') {
    return (
      <div className={styles.notebookCellOutput} style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {out.columns.map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '8px 16px', color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', borderBottom: '0.8px solid var(--border)' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {out.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '8px 16px', color: 'var(--text)', borderBottom: '0.8px solid var(--border)' }}>
                    {typeof cell === 'number' ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (out.type === 'chart') {
    return (
      <div className={styles.notebookCellOutput} style={{ height: 220, padding: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={out.data} layout="vertical" margin={{ left: 40 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={140} />
            <Bar dataKey="value" fill="#F7F8F8" radius={[0, 2, 2, 0]} />
            <RTooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  return null;
}

export function NotebookColumn({ cells }: { cells: NotebookCellFixture[] }) {
  return (
    <div className={styles.notebookColumn}>
      {cells.map((cell) => (
        <div key={cell.id} className={styles.notebookCell}>
          {cell.kind === 'markdown' && (
            <div className={styles.notebookCellMarkdown}>
              <h3>{cell.source.replace(/^##\s*/, '')}</h3>
            </div>
          )}
          {cell.kind === 'code' && (
            <>
              <pre className={styles.notebookCellCode}>{cell.source}</pre>
              {cell.outputs?.map((out, i) => <RenderOutput key={i} out={out} />)}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create landing/src/preview/tabs/PreprocessingView.tsx**

```tsx
import { preprocessingChat } from '@/preview/fixtures/chats';
import { preprocessingNotebook } from '@/preview/fixtures/notebooks';
import { ChatHistory } from '@/preview/components/ChatHistory';
import { NotebookColumn } from '@/preview/components/NotebookColumn';
import styles from './AgenticShell.module.css';

export function PreprocessingView() {
  return (
    <div className={styles.root}>
      <div className={styles.chatColumn}>
        <ChatHistory messages={preprocessingChat} />
        <div className={styles.chatComposer}>
          <textarea
            className={styles.chatInput}
            placeholder="Ask a follow-up…"
            rows={2}
            readOnly
          />
        </div>
      </div>
      <NotebookColumn cells={preprocessingNotebook} />
    </div>
  );
}
```

- [ ] **Step 5: Wire into PreviewShell.tsx**

Add `import { PreprocessingView } from './tabs/PreprocessingView';` and `case 'preprocessing': return <PreprocessingView />;`.

- [ ] **Step 6: Commit**

```bash
git add landing/src/preview/tabs/PreprocessingView.tsx landing/src/preview/tabs/AgenticShell.module.css landing/src/preview/components/ landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): PreprocessingView with chat + notebook split pane"
```

---

### Task 32: FeatureEngineeringView

**Files:**
- Create: `landing/src/preview/tabs/FeatureEngineeringView.tsx`

- [ ] **Step 1: Create the view (reuses ChatHistory + NotebookColumn from Task 31)**

```tsx
import { featureEngineeringChat } from '@/preview/fixtures/chats';
import { featureEngineeringNotebook } from '@/preview/fixtures/notebooks';
import { ChatHistory } from '@/preview/components/ChatHistory';
import { NotebookColumn } from '@/preview/components/NotebookColumn';
import styles from './AgenticShell.module.css';

export function FeatureEngineeringView() {
  return (
    <div className={styles.root}>
      <div className={styles.chatColumn}>
        <ChatHistory messages={featureEngineeringChat} />
        <div className={styles.chatComposer}>
          <textarea
            className={styles.chatInput}
            placeholder="Ask about a feature…"
            rows={2}
            readOnly
          />
        </div>
      </div>
      <NotebookColumn cells={featureEngineeringNotebook} />
    </div>
  );
}
```

- [ ] **Step 2: Wire into PreviewShell.tsx**

Add import and case `'feature-engineering': return <FeatureEngineeringView />;`.

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/tabs/FeatureEngineeringView.tsx landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): FeatureEngineeringView reusing agentic shell"
```

---

### Task 33: TrainingView

**Files:**
- Create: `landing/src/preview/tabs/TrainingView.tsx`

- [ ] **Step 1: Create the view**

```tsx
import { trainingChat } from '@/preview/fixtures/chats';
import { trainingNotebook } from '@/preview/fixtures/notebooks';
import { ChatHistory } from '@/preview/components/ChatHistory';
import { NotebookColumn } from '@/preview/components/NotebookColumn';
import styles from './AgenticShell.module.css';

export function TrainingView() {
  return (
    <div className={styles.root}>
      <div className={styles.chatColumn}>
        <ChatHistory messages={trainingChat} />
        <div className={styles.chatComposer}>
          <textarea
            className={styles.chatInput}
            placeholder="Ask about training…"
            rows={2}
            readOnly
          />
        </div>
      </div>
      <NotebookColumn cells={trainingNotebook} />
    </div>
  );
}
```

- [ ] **Step 2: Wire into PreviewShell.tsx**

Add import and case `'training': return <TrainingView />;`.

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/tabs/TrainingView.tsx landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): TrainingView reusing agentic shell"
```

---

### Task 34: ExperimentsView — leaderboard + detail drawer

**Files:**
- Create: `landing/src/preview/tabs/ExperimentsView.tsx`
- Create: `landing/src/preview/tabs/ExperimentsView.module.css`

- [ ] **Step 1: Create ExperimentsView.module.css**

```css
.root {
  display: grid;
  grid-template-columns: 1fr 360px;
  height: 100%;
  overflow: hidden;
}

.leaderboard {
  padding: 24px 28px;
  overflow: auto;
}
.leaderboardTitle {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0 0 16px;
}
.table { width: 100%; border-collapse: collapse; }
.table th {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-dim);
  padding: 10px 12px;
  text-align: left;
  border-bottom: 0.8px solid var(--border);
}
.table td {
  padding: 12px;
  border-bottom: 0.8px solid var(--border);
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.table tr.selected td { background: rgba(139, 92, 246, 0.08); }
.rankCell { font-family: 'Geist Mono Variable', monospace; color: var(--text-muted); }
.champion { color: rgba(139, 92, 246, 1); margin-left: 4px; }

.detail {
  border-left: 0.8px solid var(--border);
  background: var(--surface-0);
  padding: 24px;
  overflow: auto;
}
.detailTitle {
  font-size: 15px;
  font-weight: 590;
  margin: 0 0 4px;
}
.detailSubtitle {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11px;
  color: var(--text-muted);
  margin: 0 0 20px;
}
.metricsGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
}
.metric {
  padding: 12px;
  background: var(--surface-1);
  border: 0.8px solid var(--border);
  border-radius: 6px;
}
.metricLabel {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
}
.metricValue {
  font-size: 20px;
  color: var(--text);
  margin-top: 2px;
}

.featureBar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12px;
}
.featureBarName { width: 130px; color: var(--text-muted); font-family: 'Geist Mono Variable', monospace; font-size: 11px; }
.featureBarTrack { flex: 1; height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; }
.featureBarFill { height: 100%; background: rgba(247, 248, 248, 0.8); border-radius: 3px; }
.featureBarValue { width: 40px; text-align: right; color: var(--text-muted); font-family: 'Geist Mono Variable', monospace; font-size: 11px; }
```

- [ ] **Step 2: Create ExperimentsView.tsx**

```tsx
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePreviewStore } from '@/preview/previewStore';
import { mockModels, type ModelFixture } from '@/preview/fixtures/experiments';
import styles from './ExperimentsView.module.css';

export function ExperimentsView() {
  const selectedId = usePreviewStore((s) => s.experiments.selectedModelId);
  const selectModel = usePreviewStore((s) => s.selectExperimentModel);

  const sorted = [...mockModels].sort((a, b) => b.f1 - a.f1);
  const activeModel: ModelFixture | null =
    sorted.find((m) => m.id === selectedId) ?? sorted[0];

  return (
    <div className={styles.root}>
      <section className={styles.leaderboard}>
        <p className={styles.leaderboardTitle}>4 MODELS · SORTED BY F1</p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>#</th>
              <th>model</th>
              <th>F1</th>
              <th>precision</th>
              <th>recall</th>
              <th>AUC</th>
              <th>train time</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr
                key={m.id}
                className={cn(m.id === (activeModel?.id ?? sorted[0].id) && styles.selected)}
                onClick={() => selectModel(m.id)}
              >
                <td className={styles.rankCell}>{i + 1}</td>
                <td>
                  {m.name}
                  {m.isChampion && <Star size={12} fill="currentColor" className={styles.champion} aria-label="champion" />}
                </td>
                <td>{m.f1.toFixed(4)}</td>
                <td>{m.precision.toFixed(4)}</td>
                <td>{m.recall.toFixed(4)}</td>
                <td>{m.auc.toFixed(4)}</td>
                <td>{m.trainingSeconds}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <aside className={styles.detail}>
        <h3 className={styles.detailTitle}>{activeModel.name}</h3>
        <p className={styles.detailSubtitle}>{activeModel.family} · trained {new Date(activeModel.trainedAt).toLocaleTimeString()}</p>

        <div className={styles.metricsGrid}>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>F1</div>
            <div className={styles.metricValue}>{activeModel.f1.toFixed(3)}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>AUC</div>
            <div className={styles.metricValue}>{activeModel.auc.toFixed(3)}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Precision</div>
            <div className={styles.metricValue}>{activeModel.precision.toFixed(3)}</div>
          </div>
          <div className={styles.metric}>
            <div className={styles.metricLabel}>Recall</div>
            <div className={styles.metricValue}>{activeModel.recall.toFixed(3)}</div>
          </div>
        </div>

        <p className={styles.leaderboardTitle}>TOP FEATURES</p>
        {activeModel.topFeatures.map((f) => (
          <div key={f.name} className={styles.featureBar}>
            <span className={styles.featureBarName}>{f.name}</span>
            <span className={styles.featureBarTrack}>
              <span className={styles.featureBarFill} style={{ width: `${f.importance * 100}%` }} />
            </span>
            <span className={styles.featureBarValue}>{f.importance.toFixed(2)}</span>
          </div>
        ))}
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Wire into PreviewShell.tsx**

Add import and case.

- [ ] **Step 4: Commit**

```bash
git add landing/src/preview/tabs/ExperimentsView.tsx landing/src/preview/tabs/ExperimentsView.module.css landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): ExperimentsView with leaderboard + detail drawer"
```

---

### Task 35: DeploymentView — sub-tab navigation + Overview panel

**Files:**
- Create: `landing/src/preview/tabs/DeploymentView.tsx`
- Create: `landing/src/preview/tabs/DeploymentView.module.css`

- [ ] **Step 1: Create DeploymentView.module.css**

```css
.root { display: grid; grid-template-rows: 44px 1fr; height: 100%; }

.subTabs {
  display: flex;
  border-bottom: 0.8px solid var(--border);
  background: var(--surface-0);
  padding: 0 20px;
}
.subTab {
  padding: 0 16px;
  height: 44px;
  background: transparent;
  border: 0;
  color: var(--text-muted);
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  position: relative;
  transition: color var(--dur-fast);
}
.subTab:hover { color: var(--text); }
.subTabActive { color: var(--text); }
.subTabActive::after {
  content: '';
  position: absolute;
  bottom: 0; left: 14px; right: 14px;
  height: 2px;
  background: rgba(139, 92, 246, 0.9);
}

.content { padding: 24px 28px; overflow: auto; }

/* Overview */
.statusRow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}
.statusDot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #4ADE80;
  box-shadow: 0 0 6px rgba(74, 222, 128, 0.6);
}
.statusLabel { font-size: 14px; font-weight: 510; }
.statusVersion { font-family: 'Geist Mono Variable', monospace; font-size: 12px; color: var(--text-muted); }

.overviewGrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.statTile {
  padding: 16px;
  background: var(--surface-0);
  border: 0.8px solid var(--border);
  border-radius: 8px;
}
.statLabel { font-family: 'Geist Mono Variable', monospace; font-size: 10px; color: var(--text-dim); text-transform: uppercase; }
.statValue { font-size: 22px; color: var(--text); margin-top: 4px; }
.statUnit { font-size: 12px; color: var(--text-muted); margin-left: 2px; }

.endpointBlock {
  background: var(--surface-0);
  border: 0.8px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  font-family: 'Geist Mono Variable', monospace;
  font-size: 12px;
  color: var(--text);
  overflow-x: auto;
  white-space: nowrap;
}

/* Logs */
.logsBlock {
  background: #0C0C0D;
  border: 0.8px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11px;
  line-height: 1.6;
}
.logRow { display: grid; grid-template-columns: 80px 60px 1fr; gap: 12px; }
.logTime { color: var(--text-dim); }
.logLevel { font-weight: 510; }
.logLevelINFO  { color: #74AE9C; }
.logLevelWARN  { color: #E5C76B; }
.logLevelERROR { color: #E07B7B; }
.logMsg { color: var(--text); }

/* Monitoring */
.chartsGrid { display: grid; grid-template-columns: 1fr; gap: 20px; }
.chartCard {
  padding: 20px;
  background: var(--surface-0);
  border: 0.8px solid var(--border);
  border-radius: 8px;
}
.chartCardTitle {
  font-family: 'Geist Mono Variable', monospace;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  margin: 0 0 12px;
}
```

- [ ] **Step 2: Create DeploymentView.tsx**

```tsx
import { cn } from '@/lib/cn';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { usePreviewStore } from '@/preview/previewStore';
import {
  mockDeployment, mockLogs, mockLatencyHistory, mockRpsHistory, mockErrorHistory,
} from '@/preview/fixtures/deployment';
import type { DeploymentSubTab } from '@/preview/types';
import styles from './DeploymentView.module.css';

const SUB_TABS: { id: DeploymentSubTab; label: string }[] = [
  { id: 'overview',   label: 'Overview' },
  { id: 'playground', label: 'Playground' },
  { id: 'api',        label: 'API' },
  { id: 'logs',       label: 'Logs' },
  { id: 'monitoring', label: 'Monitoring' },
];

export function DeploymentView() {
  const activeSub = usePreviewStore((s) => s.deployment.activeSubTab);
  const setSub = usePreviewStore((s) => s.setDeploymentSubTab);

  return (
    <div className={styles.root}>
      <nav className={styles.subTabs} role="tablist" aria-label="Deployment sections">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeSub === t.id}
            className={cn(styles.subTab, activeSub === t.id && styles.subTabActive)}
            onClick={() => setSub(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.content}>
        {activeSub === 'overview' && <OverviewPanel />}
        {activeSub === 'playground' && <PlaygroundPanel />}
        {activeSub === 'api' && <ApiPanel />}
        {activeSub === 'logs' && <LogsPanel />}
        {activeSub === 'monitoring' && <MonitoringPanel />}
      </div>
    </div>
  );
}

function OverviewPanel() {
  return (
    <>
      <div className={styles.statusRow}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span className={styles.statusLabel}>Healthy · {mockDeployment.modelName}</span>
        <span className={styles.statusVersion}>{mockDeployment.version}</span>
      </div>

      <div className={styles.overviewGrid}>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>p50</div>
          <div className={styles.statValue}>{mockDeployment.p50Ms}<span className={styles.statUnit}>ms</span></div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>p95</div>
          <div className={styles.statValue}>{mockDeployment.p95Ms}<span className={styles.statUnit}>ms</span></div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>RPS</div>
          <div className={styles.statValue}>{mockDeployment.rps}</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>error rate</div>
          <div className={styles.statValue}>{(mockDeployment.errorRate * 100).toFixed(2)}<span className={styles.statUnit}>%</span></div>
        </div>
      </div>

      <div className={styles.endpointBlock}>
        POST {mockDeployment.endpoint}
      </div>
    </>
  );
}

function PlaygroundPanel() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <div className={styles.statTile}>
        <div className={styles.statLabel}>INPUT (JSON)</div>
        <pre style={{ fontFamily: 'Geist Mono Variable, monospace', fontSize: 12, color: 'var(--text)', margin: 0, marginTop: 8, whiteSpace: 'pre-wrap' }}>{`{
  "customer_id": "NC-01492",
  "recency_days": 34,
  "mrr_delta_30d": -18,
  "ticket_escalation_rate": 0.12
}`}</pre>
      </div>
      <div className={styles.statTile}>
        <div className={styles.statLabel}>OUTPUT</div>
        <pre style={{ fontFamily: 'Geist Mono Variable, monospace', fontSize: 12, color: 'var(--text)', margin: 0, marginTop: 8, whiteSpace: 'pre-wrap' }}>{`{
  "churn_probability": 0.8721,
  "predicted_class": true,
  "latency_ms": 23,
  "model_version": "v3.2.1"
}`}</pre>
      </div>
    </div>
  );
}

function ApiPanel() {
  return (
    <div className={styles.endpointBlock} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
      {`curl -X POST ${mockDeployment.endpoint} \\
  -H "Authorization: Bearer $AGENTIC_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"customer_id": "NC-01492", "recency_days": 34}'`}
    </div>
  );
}

function LogsPanel() {
  return (
    <div className={styles.logsBlock} role="log" aria-live="polite" aria-label="Deployment logs">
      {mockLogs.map((log, i) => (
        <div key={i} className={styles.logRow}>
          <span className={styles.logTime}>{log.timestamp}</span>
          <span className={cn(styles.logLevel, styles[`logLevel${log.level}`])}>{log.level}</span>
          <span className={styles.logMsg}>{log.message}</span>
        </div>
      ))}
    </div>
  );
}

function MonitoringPanel() {
  return (
    <div className={styles.chartsGrid}>
      <div className={styles.chartCard}>
        <h4 className={styles.chartCardTitle}>Latency (ms)</h4>
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={mockLatencyHistory}>
              <XAxis dataKey="t" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="p50" stroke="#F7F8F8" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="p95" stroke="#8A8F98" strokeWidth={1.5} dot={false} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h4 className={styles.chartCardTitle}>Requests per second</h4>
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={mockRpsHistory}>
              <XAxis dataKey="t" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="rps" stroke="#F7F8F8" strokeWidth={1.5} dot={false} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h4 className={styles.chartCardTitle}>Error rate</h4>
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={mockErrorHistory}>
              <XAxis dataKey="t" tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="rate" stroke="#F7F8F8" strokeWidth={1.5} dot={false} />
              <RTooltip contentStyle={{ background: 'var(--surface-2)', border: '0.8px solid var(--border)', fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into PreviewShell.tsx**

Add import and `case 'deployment': return <DeploymentView />;`.

- [ ] **Step 4: Commit**

```bash
git add landing/src/preview/tabs/DeploymentView.tsx landing/src/preview/tabs/DeploymentView.module.css landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): DeploymentView with 5 sub-tabs + monitoring charts"
```

---

### Task 36: Preview tab-switching smoke test

**Files:**
- Create: `landing/src/preview/tabs/PreviewShell.test.tsx`

- [ ] **Step 1: Write test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewShell } from '@/preview/PreviewShell';
import { usePreviewStore } from '@/preview/previewStore';

describe('PreviewShell tab navigation', () => {
  beforeEach(() => {
    usePreviewStore.setState(usePreviewStore.getInitialState());
  });

  it('renders the Data Viewer tab by default', () => {
    render(<PreviewShell />);
    // Data Viewer shows the mock English query in the query panel
    expect(screen.getByText(/which customers churned in Q2/i)).toBeInTheDocument();
  });

  it('switches to Experiments when that sidebar button is clicked', () => {
    render(<PreviewShell />);
    const expButton = screen.getByRole('tab', { name: /experiments/i });
    fireEvent.click(expButton);
    expect(screen.getByText(/4 MODELS · SORTED BY F1/i)).toBeInTheDocument();
  });

  it('Deployment sub-tab navigation works', () => {
    usePreviewStore.getState().setActiveTab('deployment');
    render(<PreviewShell />);
    const logsTab = screen.getByRole('tab', { name: /logs/i });
    fireEvent.click(logsTab);
    // Logs panel renders the deployment logs
    expect(screen.getByRole('log')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm run test --workspace=landing -- PreviewShell
```
Expected: `3 passed`.

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/tabs/PreviewShell.test.tsx
git commit -m "test(landing): preview shell tab + sub-tab navigation"
```

---

### Task 37: Patch frontend ComputeAnimation for durationScale prop

**Files:**
- Modify: `frontend/src/components/upload/computeAnimationSvgStyles.ts`
- Modify: `frontend/src/components/upload/ComputeAnimation.tsx`
- Modify: `frontend/src/types/processing.ts`
- Modify: `frontend/src/lib/animation/flowPulseTokens.ts`

- [ ] **Step 1: Read the existing style module first**

```bash
cat frontend/src/components/upload/computeAnimationSvgStyles.ts | head -40
```

- [ ] **Step 2: Find the hardcoded durations**

Find `12s` for cube rotation (around line 31), `6.4s`, `7.2s`, `8s` for atomic orbits, and `1.25s`, `1.5s`, `1.75s` for electrons. If line numbers differ from the spec, that's fine — use grep.

```bash
grep -n "animation:" frontend/src/components/upload/computeAnimationSvgStyles.ts
```

- [ ] **Step 3: Change buildComputeAnimationStyles to accept a scale factor**

Modify the signature of `buildComputeAnimationStyles(uid: string)` to `buildComputeAnimationStyles(uid: string, durationScale: number = 1)` and multiply every hardcoded duration value by `durationScale`. Example transformation:
```ts
// before:
animation: ca-rotate-cube-${uid} 12s infinite linear;
// after:
animation: ca-rotate-cube-${uid} ${(12 * durationScale).toFixed(2)}s infinite linear;
```
Do this for every `...s infinite...` declaration. Leave non-duration values untouched.

- [ ] **Step 4: Add durationScale to ComputeAnimationProps**

Edit `frontend/src/types/processing.ts` — find `ComputeAnimationProps` and add:
```ts
  /** Multiplier applied to all internal animation durations. Default 1.0. */
  durationScale?: number;
```

- [ ] **Step 5: Pass durationScale through ComputeAnimation.tsx**

Modify `frontend/src/components/upload/ComputeAnimation.tsx`:
```tsx
export function ComputeAnimation({
  files,
  results,
  isComplete,
  accentClassName,
  onSettled,
  durationScale = 1,
}: ComputeAnimationProps) {
  // ... existing code ...
  // Pass durationScale to ComputeAnimationSvg
}
```
And update `ComputeAnimationSvg` to accept + forward `durationScale` to `buildComputeAnimationStyles`.

- [ ] **Step 6: Update flowPulseTokens.ts**

Edit `frontend/src/lib/animation/flowPulseTokens.ts`:
```ts
export const FLOW_PARTICLE_DURATION = '1.5s'; // unchanged — the landing scales at the component level
// Add a helper:
export function scaledFlowParticleDuration(scale: number = 1): string {
  return `${(1.5 * scale).toFixed(2)}s`;
}
```
And use `scaledFlowParticleDuration(durationScale)` in place of `FLOW_PARTICLE_DURATION` wherever the compute animation references it.

- [ ] **Step 7: Run frontend tests to verify no regression**

```bash
npm run test --workspace=frontend -- ComputeAnimation
```
Expected: existing tests pass (no test should reference the old hardcoded `12s`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/upload/ frontend/src/types/processing.ts frontend/src/lib/animation/flowPulseTokens.ts
git commit -m "feat(frontend): add durationScale prop to ComputeAnimation"
```

---

### Task 38: Wire ComputeAnimation into UploadView

**Files:**
- Modify: `landing/src/preview/tabs/UploadView.tsx`

- [ ] **Step 1: Import ComputeAnimation from frontend**

Add the import and mount it beside the file card:
```tsx
import { ComputeAnimation } from '@frontend/components/upload/ComputeAnimation';
// ...
// Inside the component, above the plan card column:
<ComputeAnimation
  files={[{ id: 'customers', name: 'customers.csv', size: 482_000, status: 'ready' }]}
  results={[
    { id: 'r1', label: '2,530 rows' },
    { id: 'r2', label: '14 columns' },
    { id: 'r3', label: '4 data-quality issues' },
  ]}
  isComplete={true}
  durationScale={0.75}
/>
```
Consult `frontend/src/types/processing.ts` for the exact shape of `files` and `results` — the fields above are indicative; match the real types.

- [ ] **Step 2: Run dev server and verify**

Visual check: the compute animation renders in the Upload tab at 75% speed.

- [ ] **Step 3: Commit**

```bash
git add landing/src/preview/tabs/UploadView.tsx
git commit -m "feat(landing): mount ComputeAnimation in UploadView at 75% speed"
```

---

### Task 39: Wire QuestionCards into UploadView

**Files:**
- Modify: `landing/src/preview/tabs/UploadView.tsx`

- [ ] **Step 1: Import and mount**

Add to the imports:
```tsx
import { QuestionCards } from '@frontend/components/upload/QuestionCards';
import type { AskUserQuestion } from '@frontend/types/llmUi';
```

Define a local fixture:
```tsx
const PLAN_QUESTIONS: AskUserQuestion[] = [
  {
    id: 'q1',
    question: "What's your target variable?",
    options: [
      { label: 'is_active', description: 'Customer churn (classification)' },
      { label: 'mrr_usd',    description: 'Recurring revenue (regression)' },
      { label: 'escalated',  description: 'Ticket escalation (classification)' },
    ],
    inputType: 'radio',
  },
  {
    id: 'q2',
    question: 'Which modeling task?',
    options: [
      { label: 'Classification', description: 'Predict a category' },
      { label: 'Regression',     description: 'Predict a number' },
      { label: 'Clustering',     description: 'Find groups' },
      { label: 'Time-series',    description: 'Forecast over time' },
    ],
    inputType: 'radio',
  },
  {
    id: 'q3',
    question: 'How much compute?',
    options: [
      { label: 'Quick (5 min)',     description: 'Fast iteration' },
      { label: 'Standard (15 min)', description: 'Balanced' },
      { label: 'Deep (1h)',         description: 'Thorough search' },
    ],
    inputType: 'radio',
  },
];
```
(Verify the `AskUserQuestion` / `QuestionAnswer` types in `frontend/src/types/llmUi.ts` match this shape — edit as needed.)

Mount below the plan card inside the return:
```tsx
<QuestionCards
  questions={PLAN_QUESTIONS}
  onSubmit={() => {
    /* no-op in demo mode */
  }}
  disabled={false}
/>
```

- [ ] **Step 2: Commit**

```bash
git add landing/src/preview/tabs/UploadView.tsx
git commit -m "feat(landing): mount interactive QuestionCards in UploadView"
```

---

### Task 40: Build + run full preview interaction smoke test

- [ ] **Step 1: Build**

```bash
npm run build --workspace=landing
```
Expected: 1 page built, no errors.

- [ ] **Step 2: Run dev server and manually click through all 7 tabs**

```bash
npm run dev --workspace=landing
```
Visit http://localhost:4321 — manually click Upload / Data Viewer / Preprocessing / Feature Engineering / Training / Experiments / Deployment in the sidebar. Each should render without runtime errors. In Deployment, click each of the 5 sub-tabs.

- [ ] **Step 3: Run all tests**

```bash
npm run test --workspace=landing
```
Expected: all tests pass.

- [ ] **Step 4: Commit any adjustments (none expected)**

If you had to fix anything, commit with a descriptive message. Otherwise move on.

---

### Task 41: PdfViewer integration in DataViewerView (Astro island)

**Files:**
- Modify: `landing/src/preview/tabs/DataViewerView.tsx`
- Copy: `testing/fixtures/mock-business/novacraft_business_context.pdf` → `landing/public/assets/novacraft_business_context.pdf`

- [ ] **Step 1: Copy the PDF into landing/public/assets/**

```bash
mkdir -p landing/public/assets
cp testing/fixtures/mock-business/novacraft_business_context.pdf landing/public/assets/
```

- [ ] **Step 2: Dynamically import PdfViewer only when the PDF tab is active**

Edit `DataViewerView.tsx`:
```tsx
import { lazy, Suspense } from 'react';
const PdfViewer = lazy(() => import('@frontend/components/data/PdfViewer'));
// ...
{showPdf && (
  <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>Loading PDF…</p>}>
    <PdfViewer url="/assets/novacraft_business_context.pdf" />
  </Suspense>
)}
```
Replace the earlier static PDF placeholder block with this Suspense-wrapped import.

- [ ] **Step 3: Verify build**

```bash
npm run build --workspace=landing
```
Expected: build succeeds. If `pdfjs-dist` worker needs a URL adjustment, follow the error message (typically adds `?url` import in `PdfViewer.tsx` — may require a landing-side vite config tweak).

- [ ] **Step 4: Commit**

```bash
git add landing/public/assets/novacraft_business_context.pdf landing/src/preview/tabs/DataViewerView.tsx
git commit -m "feat(landing): lazy-load PdfViewer for NovaCraft PDF tab"
```

---

### Task 42: Staged WAAPI entry animation for PreviewShell

**Files:**
- Modify: `landing/src/preview/PreviewShell.tsx`

- [ ] **Step 1: Add useEffect to play staged entry on mount**

Append to `PreviewShell.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';

// ... inside PreviewShell():
const rootRef = useRef<HTMLDivElement>(null);
const reducedMotion = usePrefersReducedMotion();

useEffect(() => {
  if (reducedMotion || !rootRef.current) return;
  const root = rootRef.current;
  const sidebar = root.querySelector<HTMLElement>('.preview-sidebar');
  const topbar = root.querySelector<HTMLElement>('.preview-topbar');
  const content = root.querySelector<HTMLElement>('.preview-content');

  const options: KeyframeAnimationOptions = {
    duration: 500,
    easing: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
    fill: 'forwards',
  };

  root.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { ...options, duration: 400, delay: 0 },
  );
  if (sidebar) {
    sidebar.animate(
      [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { ...options, delay: 400 },
    );
  }
  if (topbar) {
    topbar.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { ...options, delay: 700 },
    );
  }
  if (content) {
    content.animate(
      [{ opacity: 0, transform: 'translateY(2px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { ...options, delay: 1000, duration: 600 },
    );
  }
}, [reducedMotion]);
```

Attach `ref={rootRef}` to the root `div`.

- [ ] **Step 2: Commit**

```bash
git add landing/src/preview/PreviewShell.tsx
git commit -m "feat(landing): staged WAAPI entry animation for preview shell"
```

---




