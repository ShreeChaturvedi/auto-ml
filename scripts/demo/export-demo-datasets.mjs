import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildPreprocessingMockDatasetVariants } from '../../testing/support/preprocessingMockDatasets.mjs';

const downloadDir = process.env.DEMO_DOWNLOAD_DIR ?? '/Users/ayush/Downloads/AutoML Expo Demo Datasets';

const datasetNameMap = new Map([
  ['clean', 'Northstar_Customer_Churn_Standard.csv'],
  ['bom', 'Northstar_Customer_Churn_UTF8_BOM.csv'],
  ['latin1', 'Northstar_Customer_Churn_Regional_Latin1.csv'],
  ['tsv', 'Northstar_Customer_Churn_Tab_Delimited.tsv'],
  ['jsonl', 'Northstar_Customer_Churn_Line_Delimited.jsonl']
]);

async function main() {
  const variants = buildPreprocessingMockDatasetVariants();
  const selected = variants.filter((variant) => datasetNameMap.has(variant.name));

  await mkdir(downloadDir, { recursive: true });

  for (const variant of selected) {
    const targetName = datasetNameMap.get(variant.name);
    const targetPath = path.join(downloadDir, targetName);
    await writeFile(targetPath, variant.buffer);
    console.log(`[demo-datasets] wrote ${targetPath}`);
  }
}

main().catch((error) => {
  console.error(`[demo-datasets] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
