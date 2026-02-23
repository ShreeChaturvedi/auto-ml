/**
 * Package Index Service
 *
 * Provides PyPI-backed package search with caching and fallbacks.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { PackageInfo } from '../types/execution.js';

const PYPI_INDEX_URL = 'https://pypi.org/simple/';
const PYPI_JSON_URL = 'https://pypi.org/pypi';
const CACHE_DIR = resolve(process.cwd(), 'storage/cache');
const INDEX_CACHE_PATH = resolve(CACHE_DIR, 'pypi-index.json');
const INDEX_TTL_MS = 12 * 60 * 60 * 1000;
const METADATA_TTL_MS = 2 * 60 * 60 * 1000;

const FALLBACK_PACKAGES: PackageInfo[] = [
  { name: 'numpy', summary: 'Fast array and numerical computing.' },
  { name: 'pandas', summary: 'Data structures and analysis tools.' },
  { name: 'scikit-learn', summary: 'Machine learning algorithms and utilities.' },
  { name: 'matplotlib', summary: 'Plotting and visualization library.' },
  { name: 'seaborn', summary: 'Statistical data visualization.' },
  { name: 'scipy', summary: 'Scientific computing and optimization.' },
  { name: 'plotly', summary: 'Interactive visualization library.' },
  { name: 'xgboost', summary: 'Gradient boosting library for ML.' },
  { name: 'lightgbm', summary: 'Gradient boosting framework from Microsoft.' },
  { name: 'catboost', summary: 'Gradient boosting with categorical features.' },
  { name: 'optuna', summary: 'Hyperparameter optimization framework.' },
  { name: 'statsmodels', summary: 'Statistical models and tests.' },
  { name: 'imbalanced-learn', summary: 'Tools for imbalanced datasets.' },
  { name: 'feature-engine', summary: 'Feature engineering utilities.' },
  { name: 'category-encoders', summary: 'Encoding techniques for categorical variables.' },
  { name: 'shap', summary: 'Model explainability with SHAP values.' },
  { name: 'lime', summary: 'Local model explainability.' },
  { name: 'mlflow', summary: 'ML lifecycle tracking and deployment.' },
  { name: 'polars', summary: 'Fast DataFrame library.' },
  { name: 'duckdb', summary: 'In-process analytical database.' },
  { name: 'pyarrow', summary: 'Apache Arrow Python bindings.' },
  { name: 'sqlalchemy', summary: 'SQL toolkit and ORM.' }
];

type IndexCache = {
  names: string[];
  fetchedAt: number;
  etag?: string;
  lastModified?: string;
};

let indexCache: IndexCache | null = null;
let indexPromise: Promise<IndexCache> | null = null;
const metadataCache = new Map<string, { info: PackageInfo; fetchedAt: number }>();

export async function searchPackages(query: string, limit = 8): Promise<PackageInfo[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return FALLBACK_PACKAGES.slice(0, limit);
  }

  const names = await loadPackageIndex().catch(() => FALLBACK_PACKAGES.map((pkg) => pkg.name));

  const prefixMatches: string[] = [];
  const containsMatches: string[] = [];

  for (const name of names) {
    const lower = name.toLowerCase();
    if (lower.startsWith(trimmed)) {
      prefixMatches.push(name);
    } else if (lower.includes(trimmed)) {
      containsMatches.push(name);
    }
  }

  const candidates = [...prefixMatches, ...containsMatches].slice(0, limit);
  const suggestions = await Promise.all(
    candidates.map(async (name) => getPackageMetadata(name))
  );

  return suggestions;
}

async function loadPackageIndex(): Promise<string[]> {
  const now = Date.now();
  if (indexCache && now - indexCache.fetchedAt < INDEX_TTL_MS) {
    return indexCache.names;
  }

  if (!indexPromise) {
    indexPromise = (async () => {
      const diskCache = indexCache ?? (await readIndexCache());
      if (diskCache && now - diskCache.fetchedAt < INDEX_TTL_MS) {
        indexCache = diskCache;
        return diskCache;
      }

      const fetched = await fetchIndex(diskCache ?? undefined);
      indexCache = fetched;
      await writeIndexCache(fetched);
      return fetched;
    })().finally(() => {
      indexPromise = null;
    });
  }

  const cache = await indexPromise;
  return cache.names;
}

async function fetchIndex(previous?: IndexCache): Promise<IndexCache> {
  const headers: Record<string, string> = {
    'User-Agent': 'auto-ml-toolchain'
  };
  if (previous?.etag) {
    headers['If-None-Match'] = previous.etag;
  }
  if (previous?.lastModified) {
    headers['If-Modified-Since'] = previous.lastModified;
  }

  const response = await fetch(PYPI_INDEX_URL, { headers });
  if (response.status === 304 && previous) {
    return { ...previous, fetchedAt: Date.now() };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch PyPI index: ${response.status}`);
  }

  const html = await response.text();
  const names = parseIndex(html);
  const etag = response.headers.get('etag') ?? previous?.etag;
  const lastModified = response.headers.get('last-modified') ?? previous?.lastModified;

  return {
    names,
    fetchedAt: Date.now(),
    etag: etag ?? undefined,
    lastModified: lastModified ?? undefined
  };
}

function parseIndex(html: string): string[] {
  const names: string[] = [];
  const regex = /<a[^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1]?.trim();
    if (name) {
      names.push(name);
    }
  }
  return Array.from(new Set(names));
}

async function readIndexCache(): Promise<IndexCache | null> {
  if (!existsSync(INDEX_CACHE_PATH)) {
    return null;
  }

  try {
    const raw = await readFile(INDEX_CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as IndexCache;
    if (Array.isArray(parsed.names)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeIndexCache(cache: IndexCache): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(INDEX_CACHE_PATH, JSON.stringify(cache), 'utf-8');
}

async function getPackageMetadata(name: string): Promise<PackageInfo> {
  const key = name.toLowerCase();
  const cached = metadataCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < METADATA_TTL_MS) {
    return cached.info;
  }

  const fallback = FALLBACK_PACKAGES.find((pkg) => pkg.name.toLowerCase() === key);

  try {
    const response = await fetch(`${PYPI_JSON_URL}/${encodeURIComponent(name)}/json`);
    if (!response.ok) {
      return fallback ?? { name };
    }
    const payload = await response.json();
    const info = payload?.info ?? {};
    const homepage =
      info.project_url ||
      info.home_page ||
      info.project_urls?.Homepage ||
      info.project_urls?.homepage;

    const result: PackageInfo = {
      name: info.name ?? name,
      version: info.version,
      summary: info.summary || fallback?.summary,
      homepage: homepage || fallback?.homepage
    };

    metadataCache.set(key, { info: result, fetchedAt: Date.now() });
    return result;
  } catch {
    return fallback ?? { name };
  }
}
