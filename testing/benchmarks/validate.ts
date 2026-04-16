import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ValidationIssue {
  file: string;
  message: string;
}

const BENCHMARKS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CATALOG_ROOT = path.join(BENCHMARKS_ROOT, 'catalog');
const DATA_ROOT_PREFIX = 'testing/benchmarks/data/';

function readJson(filePath: string): JsonValue {
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonValue;
}

function tryReadRecord(filePath: string): Record<string, JsonValue> | null {
  try {
    const value = readJson(filePath);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walkJsonFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function expectExactKeys(
  record: Record<string, JsonValue>,
  allowedKeys: string[],
  file: string,
  label: string,
  issues: ValidationIssue[],
) {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      issues.push({ file, message: `${label} contains unexpected key "${key}"` });
    }
  }
}

function expectNonEmptyString(
  record: Record<string, JsonValue>,
  key: string,
  file: string,
  issues: ValidationIssue[],
) {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ file, message: `Expected non-empty string at "${key}"` });
  }
}

function expectedDatasetStorageRoot(
  kind: string,
  slug: string,
  version: number,
): string | null {
  if (kind === 'public' || kind === 'derived') {
    return `${DATA_ROOT_PREFIX}${kind}/${slug}/v${version}`;
  }
  if (kind === 'poison') {
    const [baseSlug, variantSlug] = slug.split('--');
    if (!baseSlug || !variantSlug) {
      return null;
    }
    return `${DATA_ROOT_PREFIX}poison/${baseSlug}/v${version}/${variantSlug}`;
  }
  return null;
}

function validateDatasetManifest(file: string, value: JsonValue): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ file, message: 'Dataset manifest must be an object' }];
  }

  expectExactKeys(
    value,
    ['schemaVersion', 'id', 'kind', 'slug', 'version', 'status', 'task', 'storage', 'integrity', 'provenance', 'splitContract', 'suiteRefs', 'lineage'],
    file,
    'dataset manifest',
    issues,
  );

  if (value.schemaVersion !== 1) {
    issues.push({ file, message: 'schemaVersion must equal 1' });
  }

  if (typeof value.kind === 'string' && !['public', 'derived', 'poison'].includes(value.kind)) {
    issues.push({ file, message: 'kind must be public, derived, or poison' });
  }

  expectNonEmptyString(value, 'id', file, issues);
  expectNonEmptyString(value, 'kind', file, issues);
  expectNonEmptyString(value, 'slug', file, issues);
  expectNonEmptyString(value, 'status', file, issues);

  if (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1) {
    issues.push({ file, message: 'version must be a positive integer' });
  }

  if (typeof value.status === 'string' && !['pending', 'staged'].includes(value.status)) {
    issues.push({ file, message: 'status must be pending or staged' });
  }

  const kind = typeof value.kind === 'string' ? value.kind : '<kind>';
  const slug = typeof value.slug === 'string' ? value.slug : '<slug>';
  const version = typeof value.version === 'number' ? value.version : '<version>';
  const status = typeof value.status === 'string' ? value.status : '<status>';
  const expectedId = `${kind}.${slug}.v${version}`;
  if (value.id !== expectedId) {
    issues.push({ file, message: `id must match "${expectedId}"` });
  }

  const task = value.task;
  if (!isRecord(task)) {
    issues.push({ file, message: 'task must be an object' });
  } else {
    expectExactKeys(task, ['type', 'targetColumn', 'primaryMetric'], file, 'task', issues);
    if (typeof task.type === 'string' && !['classification', 'regression'].includes(task.type)) {
      issues.push({ file, message: 'task.type must be classification or regression' });
    }
    expectNonEmptyString(task, 'targetColumn', file, issues);
    expectNonEmptyString(task, 'primaryMetric', file, issues);
  }

  const storage = value.storage;
  if (!isRecord(storage)) {
    issues.push({ file, message: 'storage must be an object' });
  } else {
    expectExactKeys(storage, ['root', 'canonicalFile'], file, 'storage', issues);
    expectNonEmptyString(storage, 'root', file, issues);
    if (typeof storage.root === 'string' && !storage.root.startsWith(DATA_ROOT_PREFIX)) {
      issues.push({ file, message: `storage.root must start with "${DATA_ROOT_PREFIX}"` });
    }
    const expectedRoot = expectedDatasetStorageRoot(kind, slug, typeof value.version === 'number' ? value.version : Number.NaN);
    if (typeof storage.root === 'string' && expectedRoot && storage.root !== expectedRoot) {
      issues.push({ file, message: `storage.root must equal "${expectedRoot}"` });
    }
    if (kind === 'poison' && expectedRoot === null) {
      issues.push({ file, message: 'poison dataset slug must use "<base>--<variant>" format' });
    }
    if (storage.canonicalFile !== 'canonical/data.csv') {
      issues.push({ file, message: 'storage.canonicalFile must equal "canonical/data.csv"' });
    }
  }

  const integrity = value.integrity;
  if (!isRecord(integrity)) {
    issues.push({ file, message: 'integrity must be an object' });
  } else {
    expectExactKeys(integrity, ['canonicalSha256'], file, 'integrity', issues);
    if (status === 'pending') {
      if (integrity.canonicalSha256 !== null) {
        issues.push({
          file,
          message: 'integrity.canonicalSha256 must be null when status is pending',
        });
      }
    } else if (
      status === 'staged'
      && (
        typeof integrity.canonicalSha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(integrity.canonicalSha256)
      )
    ) {
      issues.push({
        file,
        message: 'integrity.canonicalSha256 must be a 64-character lowercase hex string when status is staged',
      });
    }
  }

  const provenance = value.provenance;
  if (!isRecord(provenance)) {
    issues.push({ file, message: 'provenance must be an object' });
  } else {
    expectExactKeys(provenance, ['upstreamUrl', 'acquisition', 'license'], file, 'provenance', issues);
    if (
      typeof provenance.acquisition === 'string'
      && !['scripted-open', 'manual-stage', 'derived'].includes(provenance.acquisition)
    ) {
      issues.push({
        file,
        message: 'provenance.acquisition must be scripted-open, manual-stage, or derived',
      });
    }
    if (typeof provenance.license !== 'string' || provenance.license.length === 0) {
      issues.push({ file, message: 'provenance.license must be a non-empty string' });
    }
  }

  if (value.splitContract !== undefined && !isRecord(value.splitContract)) {
    issues.push({ file, message: 'splitContract must be an object when present' });
  }

  if (value.suiteRefs !== undefined) {
    if (!Array.isArray(value.suiteRefs) || value.suiteRefs.some((item) => typeof item !== 'string' || item.length === 0)) {
      issues.push({ file, message: 'suiteRefs must be an array of non-empty strings when present' });
    }
  }

  if (value.lineage !== undefined && !isRecord(value.lineage)) {
    issues.push({ file, message: 'lineage must be an object when present' });
  }

  return issues;
}

function validateSuiteManifest(file: string, value: JsonValue): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ file, message: 'Suite manifest must be an object' }];
  }

  expectExactKeys(value, ['schemaVersion', 'id', 'lane', 'entries'], file, 'suite manifest', issues);

  if (value.schemaVersion !== 1) {
    issues.push({ file, message: 'schemaVersion must equal 1' });
  }

  expectNonEmptyString(value, 'id', file, issues);
  expectNonEmptyString(value, 'lane', file, issues);

  const entries = value.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    issues.push({ file, message: 'entries must be a non-empty array' });
    return issues;
  }

  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) {
      issues.push({ file, message: `entries[${index}] must be an object` });
      continue;
    }

    expectExactKeys(entry, ['datasetRef', 'repetitions', 'qualityGate'], file, `entries[${index}]`, issues);

    if (typeof entry.datasetRef !== 'string' || entry.datasetRef.length === 0) {
      issues.push({ file, message: `entries[${index}].datasetRef must be a non-empty string` });
    }
    if (
      typeof entry.repetitions !== 'number'
      || !Number.isInteger(entry.repetitions)
      || entry.repetitions < 1
    ) {
      issues.push({ file, message: `entries[${index}].repetitions must be a positive integer` });
    }
    if (entry.qualityGate !== undefined && !isRecord(entry.qualityGate)) {
      issues.push({ file, message: `entries[${index}].qualityGate must be an object when present` });
    }
  }

  return issues;
}

function validateRunManifest(file: string, value: JsonValue): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ file, message: 'Run manifest must be an object' }];
  }

  expectExactKeys(value, ['schemaVersion', 'runId', 'suiteId', 'git', 'artifacts'], file, 'run manifest', issues);

  if (value.schemaVersion !== 1) {
    issues.push({ file, message: 'schemaVersion must equal 1' });
  }

  expectNonEmptyString(value, 'runId', file, issues);
  expectNonEmptyString(value, 'suiteId', file, issues);

  if (!isRecord(value.git)) {
    issues.push({ file, message: 'git must be an object' });
  } else {
    expectExactKeys(value.git, ['branch', 'commit', 'dirty'], file, 'git', issues);
    expectNonEmptyString(value.git, 'branch', file, issues);
    expectNonEmptyString(value.git, 'commit', file, issues);
    if (typeof value.git.dirty !== 'boolean') {
      issues.push({ file, message: 'git.dirty must be a boolean' });
    }
  }

  if (!isRecord(value.artifacts)) {
    issues.push({ file, message: 'artifacts must be an object' });
  }

  return issues;
}

function validatePoisonVariant(file: string, value: JsonValue): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return [{ file, message: 'Poison variant manifest must be an object' }];
  }

  expectExactKeys(
    value,
    ['schemaVersion', 'variantId', 'baseDatasetRef', 'issueFamily', 'seed', 'patches', 'scoringContract'],
    file,
    'poison variant',
    issues,
  );

  if (value.schemaVersion !== 1) {
    issues.push({ file, message: 'schemaVersion must equal 1' });
  }

  expectNonEmptyString(value, 'variantId', file, issues);
  expectNonEmptyString(value, 'baseDatasetRef', file, issues);
  expectNonEmptyString(value, 'issueFamily', file, issues);

  if (typeof value.seed !== 'number' || !Number.isInteger(value.seed)) {
    issues.push({ file, message: 'seed must be an integer' });
  }

  if (!Array.isArray(value.patches) || value.patches.length === 0) {
    issues.push({ file, message: 'patches must be a non-empty array' });
  } else if (value.patches.some((patch) => !isRecord(patch))) {
    issues.push({ file, message: 'each patch must be an object' });
  }

  if (!isRecord(value.scoringContract)) {
    issues.push({ file, message: 'scoringContract must be an object' });
  }

  return issues;
}

function detectManifestKind(value: JsonValue): 'dataset' | 'suite' | 'run' | 'poison' | null {
  if (!isRecord(value)) {
    return null;
  }
  if ('variantId' in value || 'baseDatasetRef' in value || 'patches' in value) {
    return 'poison';
  }
  if ('runId' in value || 'suiteId' in value || 'git' in value) {
    return 'run';
  }
  if ('entries' in value || 'lane' in value) {
    return 'suite';
  }
  if ('kind' in value || 'task' in value || 'storage' in value) {
    return 'dataset';
  }
  return null;
}

export function validateManifestFile(filePath: string): ValidationIssue[] {
  let value: JsonValue;
  try {
    value = readJson(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{ file: filePath, message: `Invalid JSON: ${message}` }];
  }

  const kind = detectManifestKind(value);

  if (kind === 'dataset') {
    return validateDatasetManifest(filePath, value);
  }
  if (kind === 'suite') {
    return validateSuiteManifest(filePath, value);
  }
  if (kind === 'run') {
    return validateRunManifest(filePath, value);
  }
  if (kind === 'poison') {
    return validatePoisonVariant(filePath, value);
  }

  return [{ file: filePath, message: 'Unrecognized manifest shape' }];
}

export function validateBenchmarkCatalog(root = CATALOG_ROOT): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const datasetRoot = path.join(root, 'datasets');
  const suiteRoot = path.join(root, 'suites');

  let datasetFiles: string[] = [];
  let suiteFiles: string[] = [];

  try {
    datasetFiles = walkJsonFiles(datasetRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({ file: datasetRoot, message: `Catalog root unreadable: ${message}` });
  }

  try {
    suiteFiles = walkJsonFiles(suiteRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({ file: suiteRoot, message: `Catalog root unreadable: ${message}` });
  }

  const datasets = new Map<string, { file: string; value: Record<string, JsonValue> }>();
  for (const file of datasetFiles) {
    const fileIssues = validateManifestFile(file);
    issues.push(...fileIssues);
    if (fileIssues.length > 0) {
      continue;
    }

    const value = tryReadRecord(file);
    if (value && typeof value.id === 'string') {
      datasets.set(value.id, { file, value });
    }
  }

  const suites = new Map<string, { file: string; value: Record<string, JsonValue> }>();
  for (const file of suiteFiles) {
    const fileIssues = validateManifestFile(file);
    issues.push(...fileIssues);
    if (fileIssues.length > 0) {
      continue;
    }

    const value = tryReadRecord(file);
    if (value && typeof value.id === 'string') {
      suites.set(value.id, { file, value });
    }
  }

  for (const [suiteId, suite] of suites.entries()) {
    const entries = Array.isArray(suite.value.entries) ? suite.value.entries : [];
    for (const [index, entry] of entries.entries()) {
      if (!isRecord(entry) || typeof entry.datasetRef !== 'string') {
        continue;
      }

      const dataset = datasets.get(entry.datasetRef);
      if (!dataset) {
        issues.push({
          file: suite.file,
          message: `entries[${index}].datasetRef refers to unknown dataset "${entry.datasetRef}"`,
        });
        continue;
      }

      const suiteRefs = Array.isArray(dataset.value.suiteRefs) ? dataset.value.suiteRefs : [];
      if (!suiteRefs.includes(suiteId)) {
        issues.push({
          file: suite.file,
          message: `entries[${index}].datasetRef must declare reciprocal suiteRef "${suiteId}"`,
        });
      }
    }
  }

  for (const [datasetId, dataset] of datasets.entries()) {
    const suiteRefs = Array.isArray(dataset.value.suiteRefs) ? dataset.value.suiteRefs : [];
    for (const suiteRef of suiteRefs) {
      if (typeof suiteRef !== 'string') {
        continue;
      }

      const suite = suites.get(suiteRef);
      if (!suite) {
        issues.push({
          file: dataset.file,
          message: `suiteRefs includes unknown suite "${suiteRef}"`,
        });
        continue;
      }

      const entries = Array.isArray(suite.value.entries) ? suite.value.entries : [];
      const suiteIncludesDataset = entries.some(
        (entry) => isRecord(entry) && entry.datasetRef === datasetId,
      );
      if (!suiteIncludesDataset) {
        issues.push({
          file: dataset.file,
          message: `suiteRefs includes "${suiteRef}" but that suite does not reference dataset "${datasetId}"`,
        });
      }
    }
  }

  return issues;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const issues = validateBenchmarkCatalog();
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Benchmark catalog validated successfully.');
  }
}
