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
