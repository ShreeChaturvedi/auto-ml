/**
 * Prompt builder for insight-driven notebook cell code generation.
 *
 * Given an EDA insight (e.g. missing values, outliers, skewness, correlation),
 * this produces LLM messages that generate a single focused Python cell
 * investigating that insight.
 */

import type { LlmMessage } from '../llmClient.js';

export interface InsightCodegenContext {
  columns: string[];
  issueType: string;
  severity: string;
  text: string;
  datasetSchema: Array<{ column: string; dtype: string }>;
  tableName: string;
}

export function buildInsightCodegenPrompt(context: InsightCodegenContext): LlmMessage[] {
  const schemaBlock = context.datasetSchema
    .map((col) => `  - ${col.column}: ${col.dtype}`)
    .join('\n');

  const systemContent = `You are a data scientist writing Python code for a Jupyter notebook cell.

DATASET ACCESS:
Use the resolve_dataset_path() function to load the dataset:
\`\`\`python
dataset_path = resolve_dataset_path("${context.tableName}")
df = pd.read_csv(dataset_path)
\`\`\`
The resolve_dataset_path function is pre-defined in the execution environment. Never use direct file paths.

DATASET SCHEMA:
${schemaBlock}

RULES:
- Output ONLY the Python code. No markdown fences, no explanations, no prose.
- Import all required libraries at the top (pandas, numpy, matplotlib, seaborn as needed).
- Use pandas, matplotlib, and/or seaborn for analysis and visualization.
- Print key results with descriptive labels using print().
- Call plt.show() after every plot.
- Keep the cell focused on the single insight described by the user.
- Do not define functions unless necessary for clarity; prefer a linear script style.
- Ensure all referenced columns exist in the schema above.`;

  const focusedColumns = context.columns.length > 0
    ? `Focused columns: ${context.columns.join(', ')}`
    : '';

  const userContent = `Generate a single focused Python cell that investigates the following insight.

Issue type: ${context.issueType}
Severity: ${context.severity}
${focusedColumns}

Insight: ${context.text}

Produce only the Python code for the cell. No markdown, no explanation.`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent }
  ];
}
