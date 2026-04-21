import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBenchmarkCatalog, validateManifestFile } from './validate.ts';

const BENCHMARKS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(BENCHMARKS_ROOT, '__fixtures__');

test('benchmark catalog validates cleanly with tracked manifests', () => {
  const issues = validateBenchmarkCatalog(path.join(BENCHMARKS_ROOT, 'catalog'));
  assert.deepEqual(issues, []);
});

test('valid manifest fixtures validate cleanly', () => {
  const validFiles = [
    path.join(FIXTURES_ROOT, 'valid-dataset-manifest.json'),
    path.join(FIXTURES_ROOT, 'valid-pending-dataset-manifest.json'),
    path.join(FIXTURES_ROOT, 'valid-suite-manifest.json'),
    path.join(FIXTURES_ROOT, 'valid-poison-variant.json'),
  ];

  for (const file of validFiles) {
    assert.deepEqual(validateManifestFile(file), []);
  }
});

test('invalid dataset fixture reports the expected issues', () => {
  const issues = validateManifestFile(path.join(FIXTURES_ROOT, 'invalid-dataset-manifest.json'));

  assert.equal(issues.length, 2);
  assert.ok(issues.some((issue) => issue.message.includes('storage.canonicalFile')));
  assert.ok(issues.some((issue) => issue.message.includes('integrity.canonicalSha256')));
});

test('missing required dataset structure is rejected', () => {
  const issues = validateManifestFile(path.join(FIXTURES_ROOT, 'missing-required-dataset-manifest.json'));

  assert.equal(issues.length, 4);
  assert.ok(issues.some((issue) => issue.message.includes('Expected non-empty string at "status"')));
  assert.ok(issues.some((issue) => issue.message.includes('task must be an object')));
  assert.ok(issues.some((issue) => issue.message.includes('storage.root must start')));
  assert.ok(issues.some((issue) => issue.message.includes('storage.root must equal')));
});

test('invalid JSON fixture reports a structured parse issue', () => {
  const issues = validateManifestFile(path.join(FIXTURES_ROOT, 'malformed-dataset-manifest.json'));

  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.message.startsWith('Invalid JSON:'));
});

test('run manifest fixture validates cleanly', () => {
  const issues = validateManifestFile(path.join(FIXTURES_ROOT, 'valid-run-manifest.json'));
  assert.deepEqual(issues, []);
});

test('unknown manifest shapes are rejected', () => {
  const issues = validateManifestFile(path.join(FIXTURES_ROOT, 'unknown-shape-manifest.json'));

  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.message.includes('Unrecognized manifest shape'));
});

test('dataset identity must match storage root', () => {
  const issues = validateManifestFile(path.join(FIXTURES_ROOT, 'wrong-storage-root-dataset-manifest.json'));

  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.message.includes('storage.root must equal'));
});

test('pending datasets require a null checksum', () => {
  const issues = validateManifestFile(path.join(FIXTURES_ROOT, 'pending-dataset-with-hash.json'));

  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.message.includes('must be null when status is pending'));
});

function makeCatalogRoot(name: string): string {
  const root = path.join(os.tmpdir(), `benchmark-catalog-${name}-${Date.now()}`);
  mkdirSync(path.join(root, 'datasets', 'public'), { recursive: true });
  mkdirSync(path.join(root, 'datasets', 'derived'), { recursive: true });
  mkdirSync(path.join(root, 'datasets', 'poison'), { recursive: true });
  mkdirSync(path.join(root, 'suites'), { recursive: true });
  return root;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('catalog rejects suite entries that reference unknown datasets', () => {
  const root = makeCatalogRoot('missing-dataset-ref');

  writeJson(path.join(root, 'suites', 'expo-public-p0.v1.json'), {
    schemaVersion: 1,
    id: 'expo-public-p0.v1',
    lane: 'public-p0',
    entries: [
      {
        datasetRef: 'public.titanic.v1',
        repetitions: 3,
        qualityGate: { metric: 'accuracy' },
      },
    ],
  });

  const issues = validateBenchmarkCatalog(root);
  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.message.includes('unknown dataset "public.titanic.v1"'));
});

test('catalog requires reciprocal dataset suiteRefs', () => {
  const root = makeCatalogRoot('missing-reciprocal-suite-ref');

  writeJson(path.join(root, 'datasets', 'public', 'adult-income.v1.json'), {
    schemaVersion: 1,
    id: 'public.adult-income.v1',
    kind: 'public',
    slug: 'adult-income',
    version: 1,
    status: 'pending',
    task: {
      type: 'classification',
      targetColumn: 'income',
      primaryMetric: 'accuracy',
    },
    storage: {
      root: 'testing/benchmarks/data/public/adult-income/v1',
      canonicalFile: 'canonical/data.csv',
    },
    integrity: {
      canonicalSha256: null,
    },
    provenance: {
      upstreamUrl: 'https://example.com/adult-income',
      acquisition: 'scripted-open',
      license: 'See upstream terms',
    },
  });

  writeJson(path.join(root, 'suites', 'expo-public-p0.v1.json'), {
    schemaVersion: 1,
    id: 'expo-public-p0.v1',
    lane: 'public-p0',
    entries: [
      {
        datasetRef: 'public.adult-income.v1',
        repetitions: 3,
        qualityGate: { metric: 'accuracy' },
      },
    ],
  });

  const issues = validateBenchmarkCatalog(root);
  assert.equal(issues.length, 1);
  assert.ok(issues[0]?.message.includes('reciprocal suiteRef "expo-public-p0.v1"'));
});
