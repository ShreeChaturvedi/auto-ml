import type { Pool } from 'pg';

type WorkflowTable =
  | 'workflow_events'
  | 'workflow_artifacts'
  | 'workflow_approvals'
  | 'workflow_handoffs'
  | 'workflow_notebook_bindings';

export type WorkflowSchemaVariant = 'canonical' | 'legacy';

export interface WorkflowSchemaProfile {
  events: WorkflowSchemaVariant;
  artifacts: WorkflowSchemaVariant;
  approvals: WorkflowSchemaVariant;
  handoffs: WorkflowSchemaVariant;
  notebookBindings: WorkflowSchemaVariant;
}

let profilePromise: Promise<WorkflowSchemaProfile> | null = null;

function resolveVariant(columns: Set<string>, canonicalColumn: string): WorkflowSchemaVariant {
  return columns.has(canonicalColumn) ? 'canonical' : 'legacy';
}

export async function loadWorkflowSchemaProfile(pool: Pool): Promise<WorkflowSchemaProfile> {
  if (!profilePromise) {
    profilePromise = pool.query<{
      table_name: WorkflowTable;
      column_name: string;
    }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_name = ANY($1::text[])`,
      [[
        'workflow_events',
        'workflow_artifacts',
        'workflow_approvals',
        'workflow_handoffs',
        'workflow_notebook_bindings'
      ]]
    ).then(({ rows }) => {
      const columnsByTable = new Map<WorkflowTable, Set<string>>();

      for (const row of rows) {
        const current = columnsByTable.get(row.table_name) ?? new Set<string>();
        current.add(row.column_name);
        columnsByTable.set(row.table_name, current);
      }

      return {
        events: resolveVariant(columnsByTable.get('workflow_events') ?? new Set(), 'event_type'),
        artifacts: resolveVariant(columnsByTable.get('workflow_artifacts') ?? new Set(), 'artifact_type'),
        approvals: resolveVariant(columnsByTable.get('workflow_approvals') ?? new Set(), 'approval_type'),
        handoffs: resolveVariant(columnsByTable.get('workflow_handoffs') ?? new Set(), 'from_phase'),
        notebookBindings: resolveVariant(columnsByTable.get('workflow_notebook_bindings') ?? new Set(), 'cell_ids')
      };
    }).catch((error) => {
      profilePromise = null;
      throw error;
    });
  }

  return profilePromise;
}
