// Integration logo registry. Each entry inlines its SVG via Vite's ?raw import
// so the markup ships with the page HTML (matches MetaCardRow.astro's pattern).
//
// CURATION — every entry justified by actual codebase usage:
//   Python       – sandboxed runtime language (Dockerfile.python-runtime)
//   Pandas       – data manipulation (pip install pandas==2.2.2)
//   NumPy        – computation (pip install numpy==1.26.4)
//   scikit-learn – ML training (pip install scikit-learn==1.5.1)
//   Plotly       – interactive visualization (pip install plotly==5.23.0)
//   Jupyter      – notebook kernel gateway (jupyter_kernel_gateway)
//   Postgres     – metadata + dataset storage (db.ts, datasetLoader.ts)
//   Docker       – sandboxed execution (executionService.ts)
//   OpenAI       – LLM provider (embeddingService.ts, llm/*)
//   LangChain    – agentic preprocessing via @langchain/langgraph

import pythonSvg      from '@/assets/logos/python.svg?raw';
import pandasSvg      from '@/assets/logos/pandas.svg?raw';
import numpySvg       from '@/assets/logos/numpy.svg?raw';
import scikitLearnSvg from '@/assets/logos/scikit-learn.svg?raw';
import plotlySvg      from '@/assets/logos/plotly.svg?raw';
import jupyterSvg     from '@/assets/logos/jupyter.svg?raw';
import postgresqlSvg  from '@/assets/logos/postgresql.svg?raw';
import dockerSvg      from '@/assets/logos/docker.svg?raw';
import openaiSvg      from '@/assets/logos/openai.svg?raw';
import langchainSvg   from '@/assets/logos/langchain.svg?raw';

export interface LogoEntry {
  /** Display / accessible name. */
  name: string;
  /** Pre-resolved inline SVG markup. */
  svg: string;
  /** Pixel height override (default 32). */
  height?: number;
}

export const LOGOS: LogoEntry[] = [
  { name: 'Python',       svg: pythonSvg },
  { name: 'Pandas',       svg: pandasSvg },
  { name: 'NumPy',        svg: numpySvg },
  { name: 'scikit-learn', svg: scikitLearnSvg, height: 44 },
  { name: 'Plotly',       svg: plotlySvg },
  { name: 'Jupyter',      svg: jupyterSvg },
  { name: 'Postgres',     svg: postgresqlSvg },
  { name: 'Docker',       svg: dockerSvg },
  { name: 'OpenAI',       svg: openaiSvg },
  { name: 'LangChain',    svg: langchainSvg },
];
