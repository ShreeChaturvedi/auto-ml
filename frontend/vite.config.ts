import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const INTENTIONAL_LAZY_CHUNK_WARNING_LIMIT_KB = 5000

const VENDOR_CHUNK_RULES = [
  { name: 'monaco', patterns: ['@monaco-editor', 'monaco-editor'] },
  { name: 'plotly', patterns: ['plotly.js-dist-min', 'react-plotly.js'] },
  { name: 'pdf', patterns: ['react-pdf', 'pdfjs-dist'] },
  { name: 'duckdb', patterns: ['@duckdb/duckdb-wasm'] },
  { name: 'cytoscape', patterns: ['cytoscape'] },
  {
    name: 'markdown',
    patterns: ['mermaid', '@streamdown', 'streamdown', 'katex', 'react-markdown', 'remark-', 'rehype-']
  },
  { name: 'react-core', patterns: ['react-router', 'react-dom', 'react', 'zustand'] }
] as const

function getVendorChunkName(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined
  }

  for (const rule of VENDOR_CHUNK_RULES) {
    if (rule.patterns.some((pattern) => id.includes(pattern))) {
      return rule.name
    }
  }

  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'plotly.js/dist/plotly': 'plotly.js-dist-min',
    },
    // Ensure React is deduplicated to prevent multiple instances
    dedupe: ['react', 'react-dom'],
  },
  server: {},
  build: {
    // Large Monaco/Plotly/PDF/WebAssembly bundles are intentionally lazy-loaded.
    // Split them explicitly so the primary app chunk stays smaller and warning
    // thresholds reflect the architecture we actually ship.
    chunkSizeWarningLimit: INTENTIONAL_LAZY_CHUNK_WARNING_LIMIT_KB,
    rollupOptions: {
      output: {
        manualChunks: getVendorChunkName
      }
    }
  }
})
