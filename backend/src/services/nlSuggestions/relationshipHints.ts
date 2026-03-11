import type { RelationshipHint, SchemaTableSummary } from './types.js';

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function inferRelationshipHints(tables: SchemaTableSummary[]): RelationshipHint[] {
  const hints: RelationshipHint[] = [];

  for (let leftIndex = 0; leftIndex < tables.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < tables.length; rightIndex += 1) {
      if (leftIndex === rightIndex) {
        continue;
      }

      const leftTable = tables[leftIndex];
      const rightTable = tables[rightIndex];
      const rightColumns = new Map(
        rightTable.columns.map((column) => [normalizeToken(column.name), column.name])
      );
      const rightTableToken = normalizeToken(rightTable.tableName).replace(/s$/, '');
      const rightId = rightColumns.get('id');

      for (const leftColumn of leftTable.columns) {
        const leftToken = normalizeToken(leftColumn.name);

        if (leftToken.endsWith('_id') && rightId) {
          const targetToken = leftToken.slice(0, -3);
          if (
            targetToken === rightTableToken
            || targetToken === normalizeToken(rightTable.tableName)
            || normalizeToken(rightTable.tableName).includes(targetToken)
          ) {
            hints.push({
              fromTable: leftTable.tableName,
              fromColumn: leftColumn.name,
              toTable: rightTable.tableName,
              toColumn: rightId,
              strength: 0.86,
              reason: `Foreign-key style match from ${leftColumn.name} to ${rightTable.tableName}.id`
            });
          }
        }

        const exactRightColumn = rightColumns.get(leftToken);
        if (exactRightColumn && leftToken !== 'id' && leftToken.endsWith('_id')) {
          hints.push({
            fromTable: leftTable.tableName,
            fromColumn: leftColumn.name,
            toTable: rightTable.tableName,
            toColumn: exactRightColumn,
            strength: 0.7,
            reason: `Both tables expose ${leftColumn.name}, suggesting a shared entity key.`
          });
        }
      }
    }
  }

  const deduped = new Map<string, RelationshipHint>();
  for (const hint of hints) {
    const key = `${hint.fromTable}|${hint.fromColumn}|${hint.toTable}|${hint.toColumn}`;
    const existing = deduped.get(key);
    if (!existing || hint.strength > existing.strength) {
      deduped.set(key, hint);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => right.strength - left.strength)
    .slice(0, 16);
}
