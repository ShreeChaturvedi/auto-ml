/**
 * DevToolsShowcase - Dev-only page for visual audit of preprocessing components
 *
 * Renders all lifecycle cards and tool result renderers at chat-pane width
 * with realistic mock data. Navigate to /dev/tools (dev server only).
 */

import { FlaskConical, RotateCw, Sparkles } from 'lucide-react';
import { StepProposalCard } from '@/components/agentic/cards/StepProposalCard';
import { CodeGenerationCard } from '@/components/agentic/cards/CodeGenerationCard';
import { ExecutionCard } from '@/components/agentic/cards/ExecutionCard';
import { ValidationCard } from '@/components/agentic/cards/ValidationCard';
import { CommitBadge } from '@/components/agentic/cards/CommitBadge';
import { ErrorCard } from '@/components/agentic/cards/ErrorCard';
import { ApprovalCard } from '@/components/agentic/cards/ApprovalCard';
import { ToolIndicator } from '@/components/llm/ToolIndicator';
import {
  SearchDocumentsResult,
  DatasetProfileResult,
  DatasetSampleResult,
  ProjectFilesResult,
  ListCellsResult,
  EditCellDiff,
  ReadCellResult,
  PreprocessingActionResult,
  ListPackagesResult,
} from '@/components/llm/toolRenderers/index';
import {
  StatusPill,
  type StatusKind,
  ToolCardShell,
  CodeBlock,
  Ring,
  PercentRing,
  ProposalActionButton,
} from '@/components/llm/shared';
import { Button } from '@/components/ui/button';
import type { ToolCall, ToolResult } from '@/types/llmUi';
import { Badge } from '@/components/ui/badge';

// ─── Helpers ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold tracking-tight border-b border-border/50 pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Specimen({
  name,
  variant,
  tools,
  children,
}: {
  name: string;
  variant: string;
  tools?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-xs font-mono text-muted-foreground">{name}</code>
        <span className="text-xs text-muted-foreground/70">{variant}</span>
        {tools?.map((t) => (
          <Badge key={t} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
            {t}
          </Badge>
        ))}
      </div>
      {children}
    </div>
  );
}

// ─── Mock data: tool calls & results ────────────────────────────

function tc(id: string, tool: ToolCall['tool'], args?: Record<string, unknown>): ToolCall {
  return { id, tool, args };
}

function tr(id: string, tool: ToolResult['tool'], output?: unknown, error?: string): ToolResult {
  return { id, tool, output, error };
}

const ALL_STATUSES: readonly StatusKind[] = [
  'accepted',
  'success',
  'rejected',
  'failed',
  'running',
  'pending',
  'awaiting',
  'selected',
  'skipped',
  'warning',
  'info',
  'neutral',
] as const;

const SHORT_PY = `import pandas as pd
df = pd.read_csv("data.csv")
print(df.shape)
print(df.head())
print(df.dtypes)`;

const LONG_PY = `import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer

# Load and inspect
df = pd.read_csv("/data/companies_2024.csv")
print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

# Drop columns with >60% missing values
null_ratios = df.isnull().mean()
cols_to_drop = null_ratios[null_ratios > 0.6].index.tolist()
df = df.drop(columns=cols_to_drop)
print(f"Dropped {len(cols_to_drop)} high-null columns")

# Impute remaining numeric nulls with median
numeric_cols = df.select_dtypes(include=[np.number]).columns
imputer = SimpleImputer(strategy="median")
df[numeric_cols] = imputer.fit_transform(df[numeric_cols])

# Standard-scale numeric features
scaler = StandardScaler()
df[numeric_cols] = scaler.fit_transform(df[numeric_cols])
print(f"Final shape: {df.shape}")`;

// ─── Page ───────────────────────────────────────────────────────

export function DevToolsShowcase() {
  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-2xl space-y-12">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dev Tools Showcase</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preprocessing components at chat-pane width with realistic mock data.
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* SHARED PRIMITIVES                                      */}
        {/* ═══════════════════════════════════════════════════════ */}

        <Section title="Shared Primitives">
          {/* StatusPill — xs */}
          <Specimen name="StatusPill" variant="xs (default)">
            <div className="flex flex-wrap items-center gap-1.5">
              {ALL_STATUSES.map((s) => (
                <StatusPill key={s} status={s} />
              ))}
            </div>
          </Specimen>

          {/* StatusPill — sm */}
          <Specimen name="StatusPill" variant="sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {ALL_STATUSES.map((s) => (
                <StatusPill key={s} status={s} size="sm" />
              ))}
            </div>
          </Specimen>

          {/* ToolCardShell — expandable default */}
          <Specimen name="ToolCardShell" variant="expandable (hover for chevron)">
            <ToolCardShell
              icon={FlaskConical}
              title="Sample experiment"
              subtitle="3 metrics tracked"
              status="success"
              expandable
              defaultExpanded
            >
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Body content lives here. Hover the header to swap the icon for a
                chevron; click to collapse.
              </p>
            </ToolCardShell>
          </Specimen>

          {/* ToolCardShell — error variant + retry action */}
          <Specimen name="ToolCardShell" variant="error variant + retry action">
            <ToolCardShell
              icon={Sparkles}
              iconClassName="text-metric-negative"
              title="Something broke"
              subtitle="exit code 1"
              status="failed"
              variant="error"
              actions={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  aria-label="Retry"
                >
                  <RotateCw className="h-3 w-3" />
                </Button>
              }
            >
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Error body. The shell adds a destructive border and tinted background.
              </p>
            </ToolCardShell>
          </Specimen>

          {/* PercentRing — sweep */}
          <Specimen name="PercentRing" variant="value sweep 0 → 1">
            <div className="flex items-center gap-4">
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <div key={v} className="flex flex-col items-center gap-1">
                  <PercentRing value={v} size={28} />
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {Math.round(v * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </Specimen>

          {/* Ring — currentColor override */}
          <Specimen name="Ring" variant="currentColor override (negative tint)">
            <Ring value={0.6} className="text-metric-negative" />
          </Specimen>

          {/* ProposalActionButton — all 4 states */}
          <Specimen name="ProposalActionButton" variant="accept / reject × idle / selected">
            <div className="flex flex-wrap items-center gap-2">
              <ProposalActionButton variant="accept" />
              <ProposalActionButton variant="accept" selected />
              <ProposalActionButton variant="reject" />
              <ProposalActionButton variant="reject" selected label="Skip" />
            </div>
          </Specimen>

          {/* CodeBlock — short */}
          <Specimen name="CodeBlock" variant="short snippet (maxHeight=200)">
            <CodeBlock code={SHORT_PY} language="python" maxHeight={200} />
          </Specimen>

          {/* CodeBlock — long with scroll containment */}
          <Specimen name="CodeBlock" variant="long snippet (maxHeight=400, scrolls)">
            <CodeBlock code={LONG_PY} language="python" maxHeight={400} />
          </Specimen>
        </Section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* LIFECYCLE CARDS                                        */}
        {/* ═══════════════════════════════════════════════════════ */}

        <Section title="Lifecycle Cards">
          {/* StepProposalCard */}
          <Specimen
            name="StepProposalCard"
            variant="pending (preprocessing)"
            tools={['propose_transformation_step']}
          >
            <StepProposalCard
              stepId="step-1"
              title="Drop columns with >60% missing values"
              rationale="Columns 'middle_name', 'fax_number', and 'legacy_code' have 72-89% null rates. Retaining them would degrade imputation quality and inflate dimensionality without adding predictive signal."
              phase="preprocessing"
              status="pending"
              onToggleSelect={undefined}
            />
          </Specimen>

          <Specimen
            name="StepProposalCard"
            variant="accepted (feature_engineering)"
            tools={['propose_transformation_step']}
          >
            <StepProposalCard
              stepId="step-2"
              title="One-hot encode categorical region column"
              rationale="The 'region' column has 5 unique categories with no ordinal relationship. One-hot encoding preserves all category information for downstream models."
              phase="feature_engineering"
              status="accepted"
            />
          </Specimen>

          <Specimen
            name="StepProposalCard"
            variant="rejected (training)"
            tools={['propose_transformation_step']}
          >
            <StepProposalCard
              stepId="step-3"
              title="Apply log transform to skewed revenue column"
              rationale="Revenue distribution has skewness of 4.2 which may violate normality assumptions for linear models."
              phase="training"
              status="rejected"
            />
          </Specimen>

          {/* CodeGenerationCard */}
          <Specimen
            name="CodeGenerationCard"
            variant="collapsed"
            tools={['materialize_step_code', 'write_cell', 'edit_cell']}
          >
            <CodeGenerationCard
              code={`import pandas as pd
import numpy as np

# Drop columns with >60% missing values
threshold = 0.6
null_ratios = df.isnull().mean()
cols_to_drop = null_ratios[null_ratios > threshold].index.tolist()

print(f"Dropping {len(cols_to_drop)} columns: {cols_to_drop}")
df = df.drop(columns=cols_to_drop)
print(f"Remaining shape: {df.shape}")`}
            />
          </Specimen>

          <Specimen
            name="CodeGenerationCard"
            variant="expanded"
            tools={['materialize_step_code']}
          >
            <CodeGenerationCard
              code={`from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
numeric_cols = df.select_dtypes(include=[np.number]).columns
df[numeric_cols] = scaler.fit_transform(df[numeric_cols])
print(f"Scaled {len(numeric_cols)} numeric columns")`}
              expanded
            />
          </Specimen>

          {/* ExecutionCard */}
          <Specimen
            name="ExecutionCard"
            variant="running (shimmer title, spinner, no bottom bar)"
            tools={['execute_transformation_step', 'run_cell']}
          >
            <ExecutionCard status="running" />
          </Specimen>

          <Specimen
            name="ExecutionCard"
            variant="success (with stdout)"
            tools={['execute_transformation_step']}
          >
            <ExecutionCard
              status="success"
              stdout={`Dropping 3 columns: ['middle_name', 'fax_number', 'legacy_code']
Remaining shape: (12847, 23)
Null ratio reduced from 0.34 to 0.08`}
              duration={2340}
            />
          </Specimen>

          <Specimen
            name="ExecutionCard"
            variant="failed (with stderr, error border)"
            tools={['run_cell']}
          >
            <ExecutionCard
              status="failed"
              stderr={`KeyError: 'revenue_usd'
The column was already dropped in a previous step.`}
              duration={890}
            />
          </Specimen>

          {/* ValidationCard */}
          <Specimen
            name="ValidationCard"
            variant="passed"
            tools={['validate_step_result']}
          >
            <ValidationCard
              passed
              metrics={[
                { name: 'Null ratio', before: 0.34, after: 0.08 },
                { name: 'Column count', before: 26, after: 23 },
                { name: 'Row count', before: 12847, after: 12847 },
              ]}
              notes="Row count preserved. All remaining columns have <10% nulls."
            />
          </Specimen>

          <Specimen
            name="ValidationCard"
            variant="failed"
            tools={['validate_step_result']}
          >
            <ValidationCard
              passed={false}
              metrics={[
                { name: 'Row count', before: 12847, after: 9102 },
                { name: 'Null ratio', before: 0.08, after: 0.03 },
              ]}
              notes="Unexpected row loss of 29%. The dropna() removed rows that could have been imputed instead."
            />
          </Specimen>

          {/* CommitBadge */}
          <Specimen
            name="CommitBadge"
            variant="with details"
            tools={['commit_transformation_step']}
          >
            <CommitBadge
              title="Committed: Drop high-null columns"
              details={`Step ID: step-1
Columns removed: middle_name, fax_number, legacy_code
Dataset shape: (12847, 23)
Checkpoint: chk_a1b2c3`}
            />
          </Specimen>

          <Specimen
            name="CommitBadge"
            variant="without details"
            tools={['commit_transformation_step']}
          >
            <CommitBadge title="Committed: Standardize numeric features" />
          </Specimen>

          {/* ErrorCard */}
          <Specimen
            name="ErrorCard"
            variant="warning (inline amber strip, square edges, no chrome)"
            tools={['execute_transformation_step']}
          >
            <ErrorCard
              severity="warning"
              message="Column 'zip_code' was cast to string but contains numeric-only values. Consider keeping as numeric if used for distance calculations."
            />
          </Specimen>

          <Specimen
            name="ErrorCard"
            variant="warning (short message)"
            tools={['execute_transformation_step']}
          >
            <ErrorCard
              severity="warning"
              message="Schema drift detected: 2 columns renamed."
            />
          </Specimen>

          <Specimen
            name="ErrorCard"
            variant="error (icon-only retry in top-right, expandable traceback)"
            tools={['run_cell']}
          >
            <ErrorCard
              severity="error"
              message="Cell execution failed with MemoryError"
              traceback={`Traceback (most recent call last):
  File "cell_3.py", line 14, in <module>
    result = df.explode('tags').reset_index(drop=True)
  File "/opt/conda/lib/python3.11/site-packages/pandas/core/frame.py", line 8982, in explode
    result = DataFrame({col: rep(d[col], counts) for col in result.columns})
MemoryError: Unable to allocate 4.2 GiB for array`}
              onRetry={() => {}}
            />
          </Specimen>

          {/* ApprovalCard — DO NOT TOUCH (deferred) */}
          <Specimen name="ApprovalCard" variant="pending">
            <ApprovalCard
              stepId="step-4"
              title="Drop 3,745 duplicate rows (29% of dataset)"
              status="pending"
              onApprove={() => {}}
              onReject={() => {}}
            />
          </Specimen>

          <Specimen name="ApprovalCard" variant="approved">
            <ApprovalCard
              stepId="step-5"
              title="Impute missing ages with median"
              status="approved"
            />
          </Specimen>

          <Specimen name="ApprovalCard" variant="rejected">
            <ApprovalCard
              stepId="step-6"
              title="Remove outliers beyond 3 standard deviations"
              status="rejected"
            />
          </Specimen>
        </Section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TOOL RESULT RENDERERS                                  */}
        {/* ═══════════════════════════════════════════════════════ */}

        <Section title="Tool Result Renderers">
          {/* SearchDocumentsResult */}
          <Specimen
            name="SearchDocumentsResult"
            variant="3 hits at varying scores"
            tools={['search_documents']}
          >
            <SearchDocumentsResult
              items={[
                {
                  chunkId: 'c1',
                  documentId: 'doc-1',
                  filename: 'data_dictionary.pdf',
                  score: 0.92,
                  snippet: 'The revenue_usd column represents annualized revenue in US dollars, calculated from quarterly reports. Missing values indicate the company was private during that period.',
                  span: { start: 1240, end: 1480 },
                },
                {
                  chunkId: 'c2',
                  documentId: 'doc-1',
                  filename: 'data_dictionary.pdf',
                  score: 0.54,
                  snippet: 'Region codes follow ISO 3166-1 alpha-2 standard. The "XX" code is used for records with unknown or disputed territories.',
                  span: { start: 3200, end: 3380 },
                },
                {
                  chunkId: 'c3',
                  documentId: 'doc-2',
                  filename: 'cleaning_notes.md',
                  score: 0.31,
                  snippet: 'Previous analysts removed rows where employee_count < 0, which were data entry errors from the 2019 migration.',
                },
              ]}
            />
          </Specimen>

          {/* DatasetProfileResult */}
          <Specimen
            name="DatasetProfileResult"
            variant="4 columns (numeric/text/date)"
            tools={['get_dataset_profile']}
          >
            <DatasetProfileResult
              data={{
                datasetId: 'ds-001',
                filename: 'companies_2024.csv',
                fileType: 'csv',
                nRows: 12847,
                nCols: 26,
                columns: [
                  { name: 'revenue_usd', dtype: 'float64', nullCount: 892, uniqueCount: 11203, min: 0, max: 98400000, mean: 2450000, median: 870000, stdDev: 5200000 },
                  { name: 'company_name', dtype: 'object', nullCount: 0, uniqueCount: 12501 },
                  { name: 'founded_date', dtype: 'datetime64', nullCount: 1204, uniqueCount: 3842 },
                  { name: 'employee_count', dtype: 'int64', nullCount: 341, uniqueCount: 876, min: 1, max: 450000, mean: 2840, median: 120, stdDev: 14200 },
                ],
              }}
            />
          </Specimen>

          {/* DatasetSampleResult */}
          <Specimen
            name="DatasetSampleResult"
            variant="5 rows x 6 columns"
            tools={['get_dataset_sample']}
          >
            <DatasetSampleResult
              data={{
                datasetId: 'ds-001',
                filename: 'companies_2024.csv',
                sample: [
                  { company_name: 'Acme Corp', revenue_usd: 4520000, employee_count: 340, region: 'US', founded_date: '2008-03-15', sector: 'Technology' },
                  { company_name: 'Globex Inc', revenue_usd: 890000, employee_count: 52, region: 'GB', founded_date: '2015-11-02', sector: 'Finance' },
                  { company_name: 'Initech', revenue_usd: null, employee_count: 18, region: 'US', founded_date: '2019-07-20', sector: 'Technology' },
                  { company_name: 'Umbrella Ltd', revenue_usd: 23100000, employee_count: 4200, region: 'JP', founded_date: '1996-01-08', sector: 'Healthcare' },
                  { company_name: 'Soylent Co', revenue_usd: 150000, employee_count: 7, region: 'DE', founded_date: null, sector: 'Food' },
                ],
              }}
            />
          </Specimen>

          {/* ProjectFilesResult */}
          <Specimen
            name="ProjectFilesResult"
            variant="2 datasets + 2 documents"
            tools={['list_project_files']}
          >
            <ProjectFilesResult
              data={{
                datasets: [
                  { datasetId: 'ds-001', filename: 'companies_2024.csv', nRows: 12847, nCols: 26, columns: ['company_name', 'revenue_usd', 'employee_count', 'region'] },
                  { datasetId: 'ds-002', filename: 'survey_responses.parquet', nRows: 5430, nCols: 14, columns: ['respondent_id', 'satisfaction', 'nps_score'] },
                ],
                documents: [
                  { documentId: 'doc-1', filename: 'data_dictionary.pdf', mimeType: 'application/pdf' },
                  { documentId: 'doc-2', filename: 'cleaning_notes.md', mimeType: 'text/markdown' },
                ],
              }}
            />
          </Specimen>

          {/* PreprocessingActionResult - checkpoint variant (only remaining variant) */}
          <Specimen
            name="PreprocessingActionResult"
            variant="checkpoint variant"
            tools={['checkpoint_dataset']}
          >
            <PreprocessingActionResult
              call={tc('pa-2', 'checkpoint_dataset')}
              output={{
                checkpointId: 'chk_a1b2c3d4e5',
                compatible: true,
              }}
            />
          </Specimen>

          {/* ListCellsResult */}
          <Specimen
            name="ListCellsResult"
            variant="4 cells with mixed statuses"
            tools={['list_cells']}
          >
            <ListCellsResult
              data={{
                notebookId: 'nb-001',
                cells: [
                  { cellId: 'cell-1', title: 'Import & Load Data', cellType: 'code', status: 'success', position: 0 },
                  { cellId: 'cell-2', title: 'Drop High-Null Columns', cellType: 'code', status: 'success', position: 1 },
                  { cellId: 'cell-3', title: 'Explode Tags Column', cellType: 'code', status: 'error', position: 2 },
                  { cellId: 'cell-4', title: 'Normalize Revenue', cellType: 'code', status: 'running', position: 3 },
                ],
              }}
            />
          </Specimen>

          {/* EditCellDiff - diff-populated path */}
          <Specimen
            name="EditCellDiff"
            variant="diff-populated path"
            tools={['edit_cell']}
          >
            <EditCellDiff
              call={tc('ec-1', 'edit_cell', {
                cellId: 'cell-2',
                startLine: 3,
                endLine: 4,
                newContent: 'threshold = 0.5\ncols_to_drop = null_ratios[null_ratios > threshold].index.tolist()',
              })}
              output={{
                diff: {
                  linesRemoved: [
                    'threshold = 0.6',
                    'cols_to_drop = null_ratios[null_ratios > threshold].index',
                  ],
                  linesAdded: [
                    'threshold = 0.5',
                    'cols_to_drop = null_ratios[null_ratios > threshold].index.tolist()',
                  ],
                },
              }}
            />
          </Specimen>

          {/* EditCellDiff - args fallback path */}
          <Specimen
            name="EditCellDiff"
            variant="args-fallback path"
            tools={['edit_cell']}
          >
            <EditCellDiff
              call={tc('ec-2', 'edit_cell', {
                cellId: 'cell-3',
                startLine: 5,
                endLine: 5,
                newContent: 'result = df.explode("tags", ignore_index=True)',
              })}
              output={{
                oldContent: '# cell 3\nimport pandas as pd\ndf = pd.read_csv("data.csv")\n\nresult = df.explode("tags").reset_index(drop=True)\nprint(result.shape)',
              }}
            />
          </Specimen>

          {/* ReadCellResult */}
          <Specimen
            name="ReadCellResult"
            variant="code + output"
            tools={['read_cell']}
          >
            <ReadCellResult
              data={{
                cellId: 'cell-1',
                title: 'Import & Load Data',
                cellType: 'code',
                content: `import pandas as pd
import numpy as np

df = pd.read_csv('/data/companies_2024.csv')
print(f"Loaded {len(df)} rows, {len(df.columns)} columns")
print(f"Memory usage: {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")`,
                output: `Loaded 12847 rows, 26 columns
Memory usage: 48.3 MB`,
              }}
            />
          </Specimen>

          {/* ListPackagesResult */}
          <Specimen
            name="ListPackagesResult"
            variant="8 packages"
            tools={['list_packages']}
          >
            <ListPackagesResult
              output={{
                packages: [
                  'pandas==2.2.1',
                  'numpy==1.26.4',
                  'scikit-learn==1.4.1',
                  'matplotlib==3.8.3',
                  'seaborn==0.13.2',
                  'scipy==1.12.0',
                  'xgboost==2.0.3',
                  'lightgbm==4.3.0',
                ],
              }}
            />
          </Specimen>
        </Section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TOOL INDICATOR                                         */}
        {/* ═══════════════════════════════════════════════════════ */}

        <Section title="ToolIndicator">
          {/* Single tool running */}
          <Specimen name="ToolIndicator" variant="single tool running (shimmer)">
            <ToolIndicator
              toolCalls={[tc('ti-1', 'execute_transformation_step', { stepId: 'step-1' })]}
              results={[]}
              isRunning
            />
          </Specimen>

          {/* Single tool completed with expandable dropdown */}
          <Specimen name="ToolIndicator" variant="single tool completed (expandable)">
            <ToolIndicator
              toolCalls={[tc('ti-2', 'get_dataset_profile', { datasetId: 'ds-001' })]}
              results={[
                tr('ti-2', 'get_dataset_profile', {
                  filename: 'companies_2024.csv',
                  nRows: 12847,
                  nCols: 26,
                  columns: [
                    { name: 'revenue_usd', dtype: 'float64', nullCount: 892, min: 0, max: 98400000 },
                    { name: 'company_name', dtype: 'object', nullCount: 0, uniqueCount: 12501 },
                  ],
                }),
              ]}
              isRunning={false}
            />
          </Specimen>

          {/* Multiple tools in mixed states */}
          <Specimen name="ToolIndicator" variant="multiple tools, mixed states">
            <ToolIndicator
              toolCalls={[
                tc('ti-3a', 'search_documents', { query: 'revenue column definition' }),
                tc('ti-3b', 'get_dataset_sample', { datasetId: 'ds-001', nRows: 5 }),
                tc('ti-3c', 'list_cells'),
              ]}
              results={[
                tr('ti-3a', 'search_documents', [
                  { chunkId: 'c1', filename: 'data_dictionary.pdf', score: 0.88, snippet: 'Revenue is annualized...' },
                ]),
                tr('ti-3b', 'get_dataset_sample', {
                  filename: 'companies_2024.csv',
                  sample: [
                    { company_name: 'Acme', revenue_usd: 4520000 },
                  ],
                }),
              ]}
              isRunning
            />
          </Specimen>

          {/* Tool with error */}
          <Specimen name="ToolIndicator" variant="tool with error">
            <ToolIndicator
              toolCalls={[tc('ti-4', 'execute_transformation_step', { stepId: 'step-99' })]}
              results={[
                tr('ti-4', 'execute_transformation_step', undefined, 'Step step-99 not found in transformation plan'),
              ]}
              isRunning={false}
            />
          </Specimen>
        </Section>

        <div className="h-20" />
      </div>
    </div>
  );
}
