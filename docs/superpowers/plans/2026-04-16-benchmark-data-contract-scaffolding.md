# Benchmark Data Contract Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable slice of the expo benchmark data architecture by adding the `testing/benchmarks/` scaffolding, machine-readable schemas, and a validation command for benchmark catalog files.

**Architecture:** This pass implements the benchmark control plane first and deliberately avoids fake live dataset manifests. The repo will gain a dedicated benchmark root, JSON schemas plus TypeScript validation logic, and tests that validate representative fixture manifests. Real public dataset manifests will come in the next pass once canonical staged bytes and checksums exist.

**Tech Stack:** TypeScript, Node.js built-ins, `tsx`, JSON Schema documents, markdown docs

---

### Task 1: Create Benchmark Root And Repo Wiring

**Files:**
- Create: `testing/benchmarks/README.md`
- Create: `testing/benchmarks/catalog/README.md`
- Create: `testing/benchmarks/data/README.md`
- Create: `testing/benchmarks/runs/README.md`
- Create: `docs/benchmarks/README.md`
- Modify: `testing/.gitignore`
- Modify: `testing/package.json`

- [ ] **Step 1: Add benchmark root documentation**

Create `testing/benchmarks/README.md` with this content:

```md
# Benchmark Assets

This directory contains the benchmark control plane for the expo benchmark suite.

## Subdirectories

- `catalog/`: tracked schemas and manifest files
- `data/`: staged benchmark bytes and repo-native derived data
- `runs/`: ignored run artifacts written by benchmark executions

## Rules

- Do not store benchmark source-of-truth data under `backend/storage/`.
- Do not put benchmark catalog files into `testing/fixtures/`.
- Public staged dataset bytes must stay out of git.
- Repo-native derived and poisoned benchmark data may be committed when modest in size and required for reproducibility.
```

- [ ] **Step 2: Add supporting README files**

Create these files with the exact content shown:

`testing/benchmarks/catalog/README.md`

```md
# Benchmark Catalog

Tracked benchmark metadata lives here.

- `schemas/` contains machine-readable schema files.
- `datasets/` will contain live dataset manifests in a later pass.
- `suites/` will contain benchmark suite manifests in a later pass.

This first implementation slice intentionally adds schemas and validation before adding live manifests with real checksums.
```

`testing/benchmarks/data/README.md`

```md
# Benchmark Data

This directory holds staged benchmark data.

- Public dataset bytes are staged locally and remain gitignored.
- Repo-native derived and poisoned datasets may be committed when reproducibility outweighs regeneration cost.
```

`testing/benchmarks/runs/README.md`

```md
# Benchmark Run Artifacts

Benchmark executions write raw traces and normalized summaries here.

This directory is gitignored. Only curated published summaries belong under `docs/benchmarks/`.
```

`docs/benchmarks/README.md`

```md
# Published Benchmark Snapshots

Only intentional published summaries, charts, and benchmark reports belong here.

Raw run artifacts and transient traces must stay under `testing/benchmarks/runs/`.
```

- [ ] **Step 3: Update `testing/.gitignore` for benchmark artifacts**

Replace the file contents with:

```gitignore
node_modules/
test-results/
playwright-report/
benchmarks/runs/
benchmarks/data/public/
```

- [ ] **Step 4: Add validation script entries to `testing/package.json`**

Modify the `scripts` section to include:

```json
{
  "scripts": {
    "prebenchmark": "npm --prefix ../backend run build && npm --prefix ../frontend run build && npx playwright install --with-deps chromium",
    "benchmark": "playwright test",
    "prebenchmark:headed": "npm --prefix ../backend run build && npm --prefix ../frontend run build && npx playwright install --with-deps chromium",
    "benchmark:headed": "playwright test --headed",
    "eval": "tsx tests/evalRunner.ts",
    "benchmark:validate": "tsx benchmarks/validate.ts",
    "benchmark:test": "node --import tsx --test benchmarks/**/*.test.ts"
  }
}
```

- [ ] **Step 5: Verify the package file still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('testing/package.json','utf8')); console.log('ok')"`

Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add testing/.gitignore testing/package.json testing/benchmarks/README.md testing/benchmarks/catalog/README.md testing/benchmarks/data/README.md testing/benchmarks/runs/README.md docs/benchmarks/README.md
git commit -m "feat(benchmarks): scaffold benchmark data directories"
```

### Task 2: Add Benchmark Schema Documents And Typed Fixtures

**Files:**
- Create: `testing/benchmarks/catalog/schemas/dataset-manifest.schema.json`
- Create: `testing/benchmarks/catalog/schemas/suite-manifest.schema.json`
- Create: `testing/benchmarks/catalog/schemas/run-manifest.schema.json`
- Create: `testing/benchmarks/catalog/schemas/poison-variant.schema.json`
- Create: `testing/benchmarks/__fixtures__/valid-dataset-manifest.json`
- Create: `testing/benchmarks/__fixtures__/valid-suite-manifest.json`
- Create: `testing/benchmarks/__fixtures__/valid-poison-variant.json`
- Create: `testing/benchmarks/__fixtures__/invalid-dataset-manifest.json`

- [ ] **Step 1: Add dataset schema**

Create `testing/benchmarks/catalog/schemas/dataset-manifest.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-automl.local/benchmark/dataset-manifest.schema.json",
  "title": "BenchmarkDatasetManifest",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "id", "kind", "slug", "version", "task", "storage", "integrity", "provenance"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "id": { "type": "string" },
    "kind": { "enum": ["public", "derived", "poison"] },
    "slug": { "type": "string" },
    "version": { "type": "integer", "minimum": 1 },
    "task": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type", "targetColumn", "primaryMetric"],
      "properties": {
        "type": { "enum": ["classification", "regression"] },
        "targetColumn": { "type": "string", "minLength": 1 },
        "primaryMetric": { "type": "string", "minLength": 1 }
      }
    },
    "storage": {
      "type": "object",
      "additionalProperties": false,
      "required": ["root", "canonicalFile"],
      "properties": {
        "root": { "type": "string", "minLength": 1 },
        "canonicalFile": { "const": "canonical/data.csv" }
      }
    },
    "integrity": {
      "type": "object",
      "additionalProperties": false,
      "required": ["canonicalSha256"],
      "properties": {
        "canonicalSha256": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
      }
    },
    "provenance": {
      "type": "object",
      "additionalProperties": false,
      "required": ["acquisition", "license"],
      "properties": {
        "upstreamUrl": { "type": "string" },
        "acquisition": { "enum": ["scripted-open", "manual-stage", "derived"] },
        "license": { "type": "string", "minLength": 1 }
      }
    },
    "splitContract": { "type": "object" },
    "suiteRefs": {
      "type": "array",
      "items": { "type": "string" }
    },
    "lineage": { "type": "object" }
  }
}
```

- [ ] **Step 2: Add the remaining schema files**

Create the remaining schema files with these exact contents:

`testing/benchmarks/catalog/schemas/suite-manifest.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-automl.local/benchmark/suite-manifest.schema.json",
  "title": "BenchmarkSuiteManifest",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "id", "lane", "entries"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "id": { "type": "string" },
    "lane": { "type": "string", "minLength": 1 },
    "entries": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["datasetRef", "repetitions"],
        "properties": {
          "datasetRef": { "type": "string", "minLength": 1 },
          "repetitions": { "type": "integer", "minimum": 1 },
          "qualityGate": { "type": "object" }
        }
      }
    }
  }
}
```

`testing/benchmarks/catalog/schemas/run-manifest.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-automl.local/benchmark/run-manifest.schema.json",
  "title": "BenchmarkRunManifest",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "runId", "suiteId", "git", "artifacts"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "runId": { "type": "string", "minLength": 1 },
    "suiteId": { "type": "string", "minLength": 1 },
    "git": {
      "type": "object",
      "additionalProperties": false,
      "required": ["branch", "commit", "dirty"],
      "properties": {
        "branch": { "type": "string", "minLength": 1 },
        "commit": { "type": "string", "minLength": 1 },
        "dirty": { "type": "boolean" }
      }
    },
    "artifacts": { "type": "object" }
  }
}
```

`testing/benchmarks/catalog/schemas/poison-variant.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://agentic-automl.local/benchmark/poison-variant.schema.json",
  "title": "PoisonVariantManifest",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "variantId", "baseDatasetRef", "issueFamily", "seed", "patches", "scoringContract"],
  "properties": {
    "schemaVersion": { "const": 1 },
    "variantId": { "type": "string", "minLength": 1 },
    "baseDatasetRef": { "type": "string", "minLength": 1 },
    "issueFamily": { "type": "string", "minLength": 1 },
    "seed": { "type": "integer" },
    "patches": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "object" }
    },
    "scoringContract": { "type": "object" }
  }
}
```

- [ ] **Step 3: Add test fixtures**

Create the fixtures with these exact contents:

`testing/benchmarks/__fixtures__/valid-dataset-manifest.json`

```json
{
  "schemaVersion": 1,
  "id": "public.adult-income.v1",
  "kind": "public",
  "slug": "adult-income",
  "version": 1,
  "task": {
    "type": "classification",
    "targetColumn": "income",
    "primaryMetric": "accuracy"
  },
  "storage": {
    "root": "testing/benchmarks/data/public/adult-income/v1",
    "canonicalFile": "canonical/data.csv"
  },
  "integrity": {
    "canonicalSha256": "1111111111111111111111111111111111111111111111111111111111111111"
  },
  "provenance": {
    "upstreamUrl": "https://example.com/adult-income",
    "acquisition": "scripted-open",
    "license": "CC BY 4.0"
  },
  "splitContract": {
    "method": "fixed-holdout",
    "seed": 42
  },
  "suiteRefs": ["expo-p0-v1"]
}
```

`testing/benchmarks/__fixtures__/valid-suite-manifest.json`

```json
{
  "schemaVersion": 1,
  "id": "expo-p0-v1",
  "lane": "agentic-e2e",
  "entries": [
    {
      "datasetRef": "public.adult-income.v1",
      "repetitions": 5,
      "qualityGate": {
        "metric": "accuracy",
        "op": ">=",
        "value": 0.8
      }
    }
  ]
}
```

`testing/benchmarks/__fixtures__/valid-poison-variant.json`

```json
{
  "schemaVersion": 1,
  "variantId": "poison.novacraft-customer-health-clean--hidden-missing.v1",
  "baseDatasetRef": "derived.novacraft-customer-health-clean.v1",
  "issueFamily": "hidden-missing",
  "seed": 101,
  "patches": [
    {
      "op": "rewrite_values",
      "column": "annual_revenue_usd",
      "pattern": "sentinel"
    }
  ],
  "scoringContract": {
    "postconditions": ["sentinel_count_equals"]
  }
}
```

`testing/benchmarks/__fixtures__/invalid-dataset-manifest.json`

```json
{
  "schemaVersion": 1,
  "id": "public.adult-income.v1",
  "kind": "public",
  "slug": "adult-income",
  "version": 1,
  "task": {
    "type": "classification",
    "targetColumn": "income",
    "primaryMetric": "accuracy"
  },
  "storage": {
    "root": "testing/benchmarks/data/public/adult-income/v1",
    "canonicalFile": "wrong.csv"
  },
  "integrity": {
    "canonicalSha256": "not-a-real-hash"
  },
  "provenance": {
    "acquisition": "scripted-open",
    "license": "CC BY 4.0"
  }
}
```

- [ ] **Step 4: Validate the JSON files parse**

Run: `node -e "for (const f of ['testing/benchmarks/catalog/schemas/dataset-manifest.schema.json','testing/benchmarks/catalog/schemas/suite-manifest.schema.json','testing/benchmarks/catalog/schemas/run-manifest.schema.json','testing/benchmarks/catalog/schemas/poison-variant.schema.json','testing/benchmarks/__fixtures__/valid-dataset-manifest.json','testing/benchmarks/__fixtures__/valid-suite-manifest.json','testing/benchmarks/__fixtures__/valid-poison-variant.json','testing/benchmarks/__fixtures__/invalid-dataset-manifest.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('ok')"`

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add testing/benchmarks/catalog/schemas testing/benchmarks/__fixtures__
git commit -m "feat(benchmarks): add benchmark catalog schemas"
```

### Task 3: Implement Manifest Validation Command And Tests

**Files:**
- Create: `testing/benchmarks/validate.ts`
- Create: `testing/benchmarks/validate.test.ts`

- [ ] **Step 1: Implement `testing/benchmarks/validate.ts`**

Create the file with this exact content:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface ValidationIssue {
  file: string;
  message: string;
}

function readJson(filePath: string): JsonValue {
  return JSON.parse(readFileSync(filePath, 'utf8')) as JsonValue;
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

function expectString(record: Record<string, JsonValue>, key: string, file: string, issues: ValidationIssue[]) {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ file, message: `Expected non-empty string at "${key}"` });
  }
}

function validateDatasetManifest(file: string, value: JsonValue, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ file, message: 'Dataset manifest must be an object' });
    return;
  }

  expectString(value, 'id', file, issues);
  expectString(value, 'kind', file, issues);
  expectString(value, 'slug', file, issues);

  if (value.schemaVersion !== 1) {
    issues.push({ file, message: 'schemaVersion must equal 1' });
  }

  if (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1) {
    issues.push({ file, message: 'version must be a positive integer' });
  }

  const expectedId = `${value.kind}.${value.slug}.v${value.version}`;
  if (value.id !== expectedId) {
    issues.push({ file, message: `id must match "${expectedId}"` });
  }

  const storage = value.storage;
  if (!isRecord(storage)) {
    issues.push({ file, message: 'storage must be an object' });
  } else if (storage.canonicalFile !== 'canonical/data.csv') {
    issues.push({ file, message: 'storage.canonicalFile must equal "canonical/data.csv"' });
  }

  const integrity = value.integrity;
  if (!isRecord(integrity) || typeof integrity.canonicalSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(integrity.canonicalSha256)) {
    issues.push({ file, message: 'integrity.canonicalSha256 must be a 64-character lowercase hex string' });
  }

  const provenance = value.provenance;
  if (!isRecord(provenance)) {
    issues.push({ file, message: 'provenance must be an object' });
  } else {
    const acquisition = provenance.acquisition;
    if (!['scripted-open', 'manual-stage', 'derived'].includes(String(acquisition))) {
      issues.push({ file, message: 'provenance.acquisition must be scripted-open, manual-stage, or derived' });
    }
    if (typeof provenance.license !== 'string' || provenance.license.length === 0) {
      issues.push({ file, message: 'provenance.license must be a non-empty string' });
    }
  }
}

function validateSuiteManifest(file: string, value: JsonValue, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ file, message: 'Suite manifest must be an object' });
    return;
  }

  expectString(value, 'id', file, issues);
  expectString(value, 'lane', file, issues);

  if (value.schemaVersion !== 1) {
    issues.push({ file, message: 'schemaVersion must equal 1' });
  }

  const entries = value.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    issues.push({ file, message: 'entries must be a non-empty array' });
    return;
  }

  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) {
      issues.push({ file, message: `entries[${index}] must be an object` });
      continue;
    }
    if (typeof entry.datasetRef !== 'string' || entry.datasetRef.length === 0) {
      issues.push({ file, message: `entries[${index}].datasetRef must be a non-empty string` });
    }
    if (typeof entry.repetitions !== 'number' || !Number.isInteger(entry.repetitions) || entry.repetitions < 1) {
      issues.push({ file, message: `entries[${index}].repetitions must be a positive integer` });
    }
  }
}

function validatePoisonVariant(file: string, value: JsonValue, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push({ file, message: 'Poison variant manifest must be an object' });
    return;
  }

  expectString(value, 'variantId', file, issues);
  expectString(value, 'baseDatasetRef', file, issues);
  expectString(value, 'issueFamily', file, issues);

  if (value.schemaVersion !== 1) {
    issues.push({ file, message: 'schemaVersion must equal 1' });
  }

  if (typeof value.seed !== 'number' || !Number.isInteger(value.seed)) {
    issues.push({ file, message: 'seed must be an integer' });
  }

  if (!Array.isArray(value.patches) || value.patches.length === 0) {
    issues.push({ file, message: 'patches must be a non-empty array' });
  }

  if (!isRecord(value.scoringContract)) {
    issues.push({ file, message: 'scoringContract must be an object' });
  }
}

export function validateBenchmarkFixtures(root = path.resolve('testing/benchmarks/__fixtures__')): ValidationIssue[] {
  if (!statSync(root).isDirectory()) {
    throw new Error(`Fixture root does not exist: ${root}`);
  }

  const issues: ValidationIssue[] = [];
  const files = walkJsonFiles(root);

  for (const file of files) {
    const value = readJson(file);
    if (file.endsWith('valid-dataset-manifest.json') || file.endsWith('invalid-dataset-manifest.json')) {
      validateDatasetManifest(file, value, issues);
      continue;
    }
    if (file.endsWith('valid-suite-manifest.json')) {
      validateSuiteManifest(file, value, issues);
      continue;
    }
    if (file.endsWith('valid-poison-variant.json')) {
      validatePoisonVariant(file, value, issues);
    }
  }

  return issues;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const issues = validateBenchmarkFixtures();
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`${issue.file}: ${issue.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Benchmark fixtures validated successfully.');
  }
}
```

- [ ] **Step 2: Add tests**

Create `testing/benchmarks/validate.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';

import { validateBenchmarkFixtures } from './validate';

test('valid benchmark fixtures only fail for the intentionally invalid dataset fixture', () => {
  const root = path.resolve('testing/benchmarks/__fixtures__');
  const issues = validateBenchmarkFixtures(root);

  assert.equal(issues.length, 2);
  assert.ok(issues.some((issue) => issue.message.includes('storage.canonicalFile')));
  assert.ok(issues.some((issue) => issue.message.includes('integrity.canonicalSha256')));
});
```

- [ ] **Step 3: Run the validator**

Run: `npm --prefix testing run benchmark:validate`

Expected: exit code `1` with messages for the intentionally invalid dataset fixture

- [ ] **Step 4: Run the tests**

Run: `npm --prefix testing run benchmark:test`

Expected: one passing test

- [ ] **Step 5: Commit**

```bash
git add testing/benchmarks/validate.ts testing/benchmarks/validate.test.ts
git commit -m "feat(benchmarks): add benchmark manifest validator"
```
