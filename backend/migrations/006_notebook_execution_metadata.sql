-- Migration: Notebook execution metadata for Jupyter-style behavior
-- Adds global execution order, execution timestamp, and dirty tracking.

ALTER TABLE notebooks
  ADD COLUMN IF NOT EXISTS execution_counter INTEGER NOT NULL DEFAULT 0;

ALTER TABLE cells
  ADD COLUMN IF NOT EXISTS execution_order INTEGER,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_dirty BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill legacy rows:
-- - executed cells receive deterministic execution_order within each notebook
-- - executed_at defaults to updated_at when missing
-- - cells with execution history are considered clean at migration time
WITH ordered_cells AS (
  SELECT
    cell_id,
    ROW_NUMBER() OVER (
      PARTITION BY notebook_id
      ORDER BY COALESCE(updated_at, created_at), position, cell_id
    ) AS inferred_execution_order
  FROM cells
  WHERE execution_count > 0
)
UPDATE cells AS c
SET
  execution_order = oc.inferred_execution_order,
  executed_at = COALESCE(c.executed_at, c.updated_at),
  is_dirty = FALSE
FROM ordered_cells AS oc
WHERE c.cell_id = oc.cell_id
  AND c.execution_order IS NULL;

-- Keep notebook execution counter aligned with latest known execution order.
UPDATE notebooks AS n
SET execution_counter = COALESCE(counter.max_execution_order, 0)
FROM (
  SELECT notebook_id, MAX(execution_order) AS max_execution_order
  FROM cells
  GROUP BY notebook_id
) AS counter
WHERE n.notebook_id = counter.notebook_id;

CREATE INDEX IF NOT EXISTS idx_cells_execution_order
  ON cells(notebook_id, execution_order)
  WHERE execution_order IS NOT NULL;
