// Integration logo lookups from simple-icons.
// Each entry returns a pre-resolved SVG string at build time.
//
// IMPORTANT: imports are explicit (named) rather than `import * as si` so
// Vite/esbuild can tree-shake and we don't load all ~3k icon modules at
// build time just to resolve ~25 of them. Saves several seconds per build.

import type { SimpleIcon } from 'simple-icons';
import {
  siPostgresql,
  siMysql,
  siSqlite,
  siAmazons3,
  siGooglecloudstorage,
  siGooglebigquery,
  siSnowflake,
  siDatabricks,
  siApacheparquet,
  siJson,
  siDuckdb,
  siDocker,
  siKubernetes,
  siPytorch,
  siScikitlearn,
  siHuggingface,
  siLangchain,
  siOpenai,
  siAnthropic,
  siGooglegemini,
} from 'simple-icons';

interface LogoEntry { name: string; iconKey: string }

// Row 1: data sources + compute
export const ROW_1: LogoEntry[] = [
  { name: 'Postgres',   iconKey: 'postgresql' },
  { name: 'MySQL',      iconKey: 'mysql' },
  { name: 'SQLite',     iconKey: 'sqlite' },
  { name: 'Amazon S3',  iconKey: 'amazons3' },
  { name: 'GCS',        iconKey: 'googlecloudstorage' },
  { name: 'Azure Blob', iconKey: 'microsoftazure' },
  { name: 'BigQuery',   iconKey: 'googlebigquery' },
  { name: 'Snowflake',  iconKey: 'snowflake' },
  { name: 'Databricks', iconKey: 'databricks' },
  { name: 'Parquet',    iconKey: 'apacheparquet' },
  { name: 'CSV',        iconKey: '' },
  { name: 'JSON',       iconKey: 'json' },
  { name: 'DuckDB',     iconKey: 'duckdb' },
  { name: 'Docker',     iconKey: 'docker' },
  { name: 'Kubernetes', iconKey: 'kubernetes' },
];

// Row 2: ML frameworks + LLM providers
export const ROW_2: LogoEntry[] = [
  { name: 'PyTorch',       iconKey: 'pytorch' },
  { name: 'scikit-learn',  iconKey: 'scikitlearn' },
  { name: 'XGBoost',       iconKey: '' },
  { name: 'LightGBM',      iconKey: '' },
  { name: 'Optuna',        iconKey: '' },
  { name: 'Hugging Face',  iconKey: 'huggingface' },
  { name: 'LangGraph',     iconKey: 'langchain' },
  { name: 'OpenAI',        iconKey: 'openai' },
  { name: 'Anthropic',     iconKey: 'anthropic' },
  { name: 'Google DeepMind', iconKey: 'googlegemini' },
  { name: 'Mistral AI',    iconKey: 'mistralai' },
  { name: 'Together AI',   iconKey: '' },
  { name: 'Groq',          iconKey: '' },
];

// Static lookup map from iconKey -> simple-icons entry. Keys that aren't
// present in simple-icons v13 (e.g. `microsoftazure`, `mistralai`) simply
// aren't in the map and fall through to the `null` placeholder branch.
const ICON_MAP: Record<string, SimpleIcon> = {
  postgresql: siPostgresql,
  mysql: siMysql,
  sqlite: siSqlite,
  amazons3: siAmazons3,
  googlecloudstorage: siGooglecloudstorage,
  googlebigquery: siGooglebigquery,
  snowflake: siSnowflake,
  databricks: siDatabricks,
  apacheparquet: siApacheparquet,
  json: siJson,
  duckdb: siDuckdb,
  docker: siDocker,
  kubernetes: siKubernetes,
  pytorch: siPytorch,
  scikitlearn: siScikitlearn,
  huggingface: siHuggingface,
  langchain: siLangchain,
  openai: siOpenai,
  anthropic: siAnthropic,
  googlegemini: siGooglegemini,
};

export function getLogoSvg(iconKey: string): string | null {
  if (!iconKey) return null;
  return ICON_MAP[iconKey]?.svg ?? null;
}
