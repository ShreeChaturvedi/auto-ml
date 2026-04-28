import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(SUPPORT_DIR, '../fixtures');
const BASE_FIXTURE_PATH = path.resolve(FIXTURE_DIR, 'mock_customer_churn_clean.csv');

function readBaseCsvText() {
  return readFileSync(BASE_FIXTURE_PATH, 'utf8').trimEnd();
}

function parseSimpleCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  return { headers, rows };
}

function stringifyDelimited(headers, rows, delimiter = ',') {
  return [
    headers.join(delimiter),
    ...rows.map((row) => headers.map((header) => row[header] ?? '').join(delimiter))
  ].join('\n');
}

function stringifyJsonl(rows) {
  return rows.map((row) => JSON.stringify(row)).join('\n');
}

function withRowMutations(rows, mutator) {
  return rows.map((row, index) => ({ ...row, ...mutator({ ...row }, index) }));
}

function makeBomVariant(baseText) {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(baseText, 'utf8')]);
}

function makeLatin1Variant(headers, rows) {
  const mutatedRows = rows.map((row, index) => (
    index === 0 ? { ...row, region: 'Québec', payment_method: 'débit' } : row
  ));
  return Buffer.from(stringifyDelimited(headers, mutatedRows), 'latin1');
}

function makeTsvVariant(headers, rows) {
  return Buffer.from(stringifyDelimited(headers, rows, '\t'), 'utf8');
}

function makeJsonlVariant(rows) {
  return Buffer.from(stringifyJsonl(rows), 'utf8');
}

function makeRaggedRowsVariant(baseText) {
  const lines = baseText.split(/\r?\n/);
  const ragged = [...lines];
  ragged[2] = ragged[2].split(',').slice(0, -2).join(',');
  ragged[3] = `${ragged[3]},unexpected_tail`;
  return Buffer.from(ragged.join('\n'), 'utf8');
}

function makeStringInNumericVariant(headers, rows) {
  const mutatedRows = withRowMutations(rows, (row, index) => {
    if (index === 1) {
      return { monthly_spend: 'unknown', avg_session_min: 'oops' };
    }
    return {};
  });
  return Buffer.from(stringifyDelimited(headers, mutatedRows), 'utf8');
}

function makeHeavyNanVariant(headers, rows) {
  const mutatedRows = withRowMutations(rows, (_row, index) => {
    if (index < 5) {
      return {
        monthly_spend: '',
        support_tickets: '',
        last_login_days: '',
        feature_adoption_score: ''
      };
    }
    return {};
  });
  return Buffer.from(stringifyDelimited(headers, mutatedRows), 'utf8');
}

function makeSchemaDriftVariant(headers, rows) {
  const nextHeaders = [...headers, 'campaign_tag'];
  const mutatedRows = rows.map((row, index) => ({
    ...row,
    campaign_tag: `campaign_${index + 1}`
  }));
  return Buffer.from(stringifyDelimited(nextHeaders, mutatedRows), 'utf8');
}

export function buildPreprocessingMockDatasetVariants() {
  const baseText = readBaseCsvText();
  const { headers, rows } = parseSimpleCsv(baseText);

  return [
    {
      name: 'clean',
      fileName: 'mock_customer_churn_clean.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(baseText, 'utf8')
    },
    {
      name: 'bom',
      fileName: 'mock_customer_churn_bom.csv',
      mimeType: 'text/csv',
      buffer: makeBomVariant(baseText)
    },
    {
      name: 'latin1',
      fileName: 'mock_customer_churn_latin1.csv',
      mimeType: 'text/csv',
      buffer: makeLatin1Variant(headers, rows)
    },
    {
      name: 'tsv',
      fileName: 'mock_customer_churn.tsv',
      mimeType: 'text/tab-separated-values',
      buffer: makeTsvVariant(headers, rows)
    },
    {
      name: 'jsonl',
      fileName: 'mock_customer_churn.jsonl',
      mimeType: 'application/x-ndjson',
      buffer: makeJsonlVariant(rows)
    },
    {
      name: 'ragged_rows',
      fileName: 'mock_customer_churn_ragged.csv',
      mimeType: 'text/csv',
      buffer: makeRaggedRowsVariant(baseText)
    },
    {
      name: 'string_in_numeric',
      fileName: 'mock_customer_churn_string_in_numeric.csv',
      mimeType: 'text/csv',
      buffer: makeStringInNumericVariant(headers, rows)
    },
    {
      name: 'heavy_nan',
      fileName: 'mock_customer_churn_heavy_nan.csv',
      mimeType: 'text/csv',
      buffer: makeHeavyNanVariant(headers, rows)
    },
    {
      name: 'schema_drift',
      fileName: 'mock_customer_churn_schema_drift.csv',
      mimeType: 'text/csv',
      buffer: makeSchemaDriftVariant(headers, rows)
    }
  ];
}
