import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBenchmarkCatalog, validateManifestFile } from './validate.ts';

const BENCHMARKS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(BENCHMARKS_ROOT, '__fixtures__');

test('benchmark catalog validates cleanly with schema-only scaffolding', () => {
  const issues = validateBenchmarkCatalog(path.join(BENCHMARKS_ROOT, 'catalog'));
  assert.deepEqual(issues, []);
});

test('valid manifest fixtures validate cleanly', () => {
  const validFiles = [
    path.join(FIXTURES_ROOT, 'valid-dataset-manifest.json'),
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

  assert.equal(issues.length, 3);
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
