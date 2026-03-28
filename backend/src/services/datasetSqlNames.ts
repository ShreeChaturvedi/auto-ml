import { astMapper, assignChanged, parseFirst, toSql, type Statement } from 'pgsql-ast-parser';

import { env } from '../config.js';
import { createDatasetRepository, type DatasetRepository } from '../repositories/datasetRepository.js';
import type { DatasetProfile } from '../types/dataset.js';

import { sanitizeTableName, resolveDatasetTableName } from './datasetLoader.js';
import { normalizeTableName } from './nlToSql/tableResolution.js';
import { isBlockedSqlTableName } from './sqlTablePolicy.js';

const MAX_SQL_IDENTIFIER_LENGTH = 63;

function normalizeSqlIdentifier(value: string | undefined): string {
  return normalizeTableName(value ?? '').toLowerCase();
}

function truncateSqlIdentifier(value: string): string {
  return value.slice(0, MAX_SQL_IDENTIFIER_LENGTH);
}

function reserveSafeSqlName(value: string): string {
  const normalized = normalizeSqlIdentifier(value);
  if (!normalized) {
    return 'dataset';
  }

  if (!isBlockedSqlTableName(normalized)) {
    return truncateSqlIdentifier(normalized);
  }

  return truncateSqlIdentifier(`dataset_${normalized}`);
}

function appendNumericSuffix(base: string, index: number): string {
  const suffix = `_${index}`;
  const trimmedBase = base.slice(0, Math.max(1, MAX_SQL_IDENTIFIER_LENGTH - suffix.length));
  return `${trimmedBase}${suffix}`;
}

function chooseUniqueSqlName(params: {
  preferred?: string;
  baseName: string;
  takenNames: Set<string>;
}): string {
  const preferred = normalizeSqlIdentifier(params.preferred);
  if (preferred && !isBlockedSqlTableName(preferred) && !params.takenNames.has(preferred)) {
    return preferred;
  }

  const baseName = reserveSafeSqlName(params.baseName);
  if (!params.takenNames.has(baseName)) {
    return baseName;
  }

  let index = 2;
  while (true) {
    const candidate = appendNumericSuffix(baseName, index);
    if (!params.takenNames.has(candidate)) {
      return candidate;
    }
    index += 1;
  }
}

export function buildDatasetSqlName(filename: string, datasetId: string): string {
  return reserveSafeSqlName(sanitizeTableName(filename, datasetId));
}

export function resolveDatasetSqlName(
  dataset: Pick<DatasetProfile, 'datasetId' | 'filename' | 'metadata'>
): string {
  const storedName = typeof dataset.metadata?.sqlName === 'string'
    ? normalizeSqlIdentifier(dataset.metadata.sqlName)
    : '';
  return storedName || buildDatasetSqlName(dataset.filename, dataset.datasetId);
}

export function assignUniqueProjectSqlName(
  datasets: Array<Pick<DatasetProfile, 'datasetId' | 'filename' | 'metadata'>>,
  filename: string,
  datasetId: string
): string {
  const takenNames = new Set(
    datasets
      .filter((dataset) => dataset.datasetId !== datasetId)
      .map((dataset) => resolveDatasetSqlName(dataset))
      .map((sqlName) => sqlName.toLowerCase())
  );

  return chooseUniqueSqlName({
    baseName: buildDatasetSqlName(filename, datasetId),
    takenNames
  });
}

export async function assignDatasetSqlName(params: {
  repository: DatasetRepository;
  projectId?: string;
  filename: string;
  datasetId: string;
}): Promise<string> {
  if (!params.projectId) {
    return buildDatasetSqlName(params.filename, params.datasetId);
  }

  const datasets = await params.repository.listByProject(params.projectId);
  return assignUniqueProjectSqlName(datasets, params.filename, params.datasetId);
}

export async function ensureProjectDatasetSqlNames(
  projectId: string,
  repository: DatasetRepository = createDatasetRepository(env.datasetMetadataPath)
): Promise<DatasetProfile[]> {
  const datasets = await repository.listByProject(projectId);
  const ordered = [...datasets].sort((left, right) => {
    const createdCompare = left.createdAt.localeCompare(right.createdAt);
    if (createdCompare !== 0) {
      return createdCompare;
    }
    return left.datasetId.localeCompare(right.datasetId);
  });

  const takenNames = new Set<string>();
  const updatedDatasets: DatasetProfile[] = [];

  for (const dataset of ordered) {
    const currentSqlName = typeof dataset.metadata?.sqlName === 'string'
      ? normalizeSqlIdentifier(dataset.metadata.sqlName)
      : '';
    const nextSqlName = chooseUniqueSqlName({
      preferred: currentSqlName,
      baseName: buildDatasetSqlName(dataset.filename, dataset.datasetId),
      takenNames
    });
    takenNames.add(nextSqlName);

    if (currentSqlName === nextSqlName) {
      updatedDatasets.push(dataset);
      continue;
    }

    const updated = await repository.update(dataset.datasetId, (current) => ({
      ...current,
      metadata: {
        ...(current.metadata ?? {}),
        sqlName: nextSqlName
      }
    }));

    updatedDatasets.push(
      updated ?? {
        ...dataset,
        metadata: {
          ...(dataset.metadata ?? {}),
          sqlName: nextSqlName
        }
      }
    );
  }

  return updatedDatasets;
}

export interface ProjectSqlRegistry {
  logicalToPhysical: Map<string, string>;
  physicalTables: Set<string>;
  logicalTables: Set<string>;
}

export function buildProjectSqlRegistry(
  datasets: Array<Pick<DatasetProfile, 'datasetId' | 'filename' | 'metadata'>>
): ProjectSqlRegistry {
  const logicalToPhysical = new Map<string, string>();
  const physicalTables = new Set<string>();
  const logicalTables = new Set<string>();

  for (const dataset of datasets) {
    const logicalName = resolveDatasetSqlName(dataset).toLowerCase();
    const physicalName = resolveDatasetTableName(dataset).toLowerCase();

    logicalTables.add(logicalName);
    physicalTables.add(physicalName);
    logicalToPhysical.set(logicalName, physicalName);
  }

  return {
    logicalToPhysical,
    physicalTables,
    logicalTables
  };
}

function isVisibleCte(scopeStack: Set<string>[], name: string): boolean {
  return scopeStack.some((scope) => scope.has(name));
}

export function rewriteProjectSqlToPhysical(sql: string, registry: ProjectSqlRegistry): {
  sql: string;
  referencedTables: string[];
} {
  const statement = parseFirst(sql);
  const referencedTables = new Set<string>();
  const scopeStack: Set<string>[] = [];

  const mapper = astMapper((map) => ({
    with: (value) => {
      const visibleBindings = new Set<string>();
      const bind = value.bind.map((binding) => {
        scopeStack.push(new Set(visibleBindings));
        try {
          const statementNode = map.statement(binding.statement as unknown as Statement);
          if (!statementNode) {
            throw new Error(`Failed to rewrite CTE "${binding.alias.name}"`);
          }

          return assignChanged(binding, {
            statement: statementNode as typeof binding.statement
          });
        } finally {
          scopeStack.pop();
          visibleBindings.add(normalizeSqlIdentifier(binding.alias.name));
        }
      });

      scopeStack.push(new Set(visibleBindings));
      try {
        const innerStatement = map.statement(value.in as unknown as Statement);
        if (!innerStatement) {
          throw new Error('Failed to rewrite SQL statement');
        }

        return assignChanged(value, {
          bind,
          in: innerStatement as typeof value.in
        });
      } finally {
        scopeStack.pop();
      }
    },
    withRecursive: (value) => {
      scopeStack.push(new Set([normalizeSqlIdentifier(value.alias.name)]));
      try {
        return map.super().withRecursive(value);
      } finally {
        scopeStack.pop();
      }
    },
    fromTable: (from) => {
      const mapped = map.super().fromTable(from);
      if (!mapped || mapped.type !== 'table') {
        return mapped;
      }

      const tableName = normalizeSqlIdentifier(mapped.name.name);
      if (!tableName || isVisibleCte(scopeStack, tableName)) {
        return mapped;
      }

      const physicalName = registry.logicalToPhysical.get(tableName)
        ?? (registry.physicalTables.has(tableName) ? tableName : undefined);
      if (!physicalName) {
        return mapped;
      }

      referencedTables.add(physicalName);

      if (mapped.name.name === physicalName) {
        return mapped;
      }

      return assignChanged(mapped, {
        name: assignChanged(mapped.name, {
          name: physicalName
        })
      });
    }
  }));

  const rewritten = mapper.statement(statement);
  if (!rewritten) {
    throw new Error('Failed to rewrite SQL statement');
  }

  return {
    sql: toSql.statement(rewritten),
    referencedTables: [...referencedTables]
  };
}
