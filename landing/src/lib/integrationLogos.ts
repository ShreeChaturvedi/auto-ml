// Integration logo lookups from simple-icons.
// Each entry returns a pre-resolved SVG string at build time.

import * as si from 'simple-icons';

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

export function getLogoSvg(iconKey: string): string | null {
  if (!iconKey) return null;
  // simple-icons exports icons as `siPostgresql` etc.
  const key = `si${iconKey.charAt(0).toUpperCase()}${iconKey.slice(1)}`;
  // @ts-expect-error dynamic key lookup into simple-icons namespace
  const icon = si[key];
  return icon?.svg ?? null;
}
