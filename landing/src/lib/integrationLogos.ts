// Integration logo lookups from simple-icons.
// Each entry returns a pre-resolved SVG path at build time.
//
// CURATION: Every entry here is justified by actual usage in the codebase:
//   Python      – sandboxed runtime language (Dockerfile.python-runtime)
//   Pandas      – data manipulation in runtime (pip install pandas==2.2.2)
//   NumPy       – computation library in runtime (pip install numpy==1.26.4)
//   scikit-learn – ML training in runtime (pip install scikit-learn==1.5.1)
//   Plotly       – interactive visualization in runtime (pip install plotly==5.23.0)
//   Jupyter      – kernel gateway for notebook execution (jupyter_kernel_gateway)
//   Postgres     – metadata store + dataset storage (db.ts, datasetLoader.ts)
//   Docker       – container-based sandboxed execution (executionService.ts)
//   OpenAI       – LLM provider for AI agent (embeddingService.ts, llm/*)
//   LangGraph    – agentic preprocessing state machine (@langchain/langgraph)

import type { SimpleIcon } from 'simple-icons';
import {
  siPython,
  siNumpy,
  siPandas,
  siScikitlearn,
  siPlotly,
  siJupyter,
  siPostgresql,
  siDocker,
  siOpenai,
  siLangchain,
} from 'simple-icons';

interface LogoEntry { name: string; iconKey: string }

export const LOGOS: LogoEntry[] = [
  { name: 'Python',       iconKey: 'python' },
  { name: 'Pandas',       iconKey: 'pandas' },
  { name: 'NumPy',        iconKey: 'numpy' },
  { name: 'scikit-learn',  iconKey: 'scikitlearn' },
  { name: 'Plotly',       iconKey: 'plotly' },
  { name: 'Jupyter',      iconKey: 'jupyter' },
  { name: 'Postgres',     iconKey: 'postgresql' },
  { name: 'Docker',       iconKey: 'docker' },
  { name: 'OpenAI',       iconKey: 'openai' },
  { name: 'LangGraph',    iconKey: 'langchain' },
];

// Backward compat
export const ROW_1 = LOGOS;
export const ROW_2: LogoEntry[] = [];

const ICON_MAP: Record<string, SimpleIcon> = {
  python: siPython,
  numpy: siNumpy,
  pandas: siPandas,
  scikitlearn: siScikitlearn,
  plotly: siPlotly,
  jupyter: siJupyter,
  postgresql: siPostgresql,
  docker: siDocker,
  openai: siOpenai,
  langchain: siLangchain,
};

/** Returns the full SimpleIcon entry (svg path, viewBox is always 0 0 24 24). */
export function getLogoIcon(iconKey: string): SimpleIcon | null {
  if (!iconKey) return null;
  return ICON_MAP[iconKey] ?? null;
}

/** Legacy: returns raw SVG string. */
export function getLogoSvg(iconKey: string): string | null {
  if (!iconKey) return null;
  return ICON_MAP[iconKey]?.svg ?? null;
}
