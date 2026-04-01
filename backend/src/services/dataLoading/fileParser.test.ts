import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';

import { streamXlsxSinglePass } from './fileParser.js';

const createdDirs: string[] = [];

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'file-parser-'));
  createdDirs.push(dir);
  return dir;
}

describe('streamXlsxSinglePass', () => {
  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the row that fills the sample in the first flushed batch', async () => {
    const dir = createTempDir();
    const filePath = join(dir, 'people.xlsx');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');
    worksheet.addRow(['id', 'name']);
    worksheet.addRow([1, 'Ada']);
    worksheet.addRow([2, 'Grace']);
    worksheet.addRow([3, 'Linus']);
    await workbook.xlsx.writeFile(filePath);

    const sampleCalls: Record<string, unknown>[][] = [];
    const batches: Record<string, unknown>[][] = [];

    const result = await streamXlsxSinglePass(filePath, 'people.xlsx', {
      sampleSize: 2,
      batchSize: 100,
      onSampleReady: async (sample) => {
        sampleCalls.push(structuredClone(sample));
      },
      onBatch: async (batch) => {
        batches.push(structuredClone(batch));
      }
    });

    expect(result.totalRowCount).toBe(3);
    expect(result.sampleRows).toEqual([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' }
    ]);
    expect(sampleCalls).toEqual([
      [
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Grace' }
      ]
    ]);
    expect(batches).toEqual([
      [
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Grace' }
      ],
      [
        { id: 3, name: 'Linus' }
      ]
    ]);
  });
});
