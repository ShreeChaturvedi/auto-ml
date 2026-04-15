import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { executeNlQuery, executeSqlQuery, streamNlQuery } from '@/lib/api/query';
import type { NlGenerationResult, NlQueryStreamEvent } from '@/types/nlQuery';
import type { QueryMode } from '@/types/file';
import type { Project } from '@/types/project';

import type { TabType } from '@/types/dataViewer';

import { toNlGenerationResult } from '../queryUtils';
import { withSqlIdentifierHint } from '../sqlIdentifiers';
import {
  buildDataPreviewFromQuery,
  buildQueryArtifactMeta,
  extractApiErrorMessage,
} from './useColumnOperations';

interface UseDataViewerQueryHandlersOptions {
  activeProject?: Project;
  createArtifact: (
    query: string,
    mode: QueryMode,
    result: ReturnType<typeof buildDataPreviewFromQuery>,
    projectId: string,
    metadata?: Record<string, unknown>,
  ) => string;
  setActiveFileTab: (id: string | null, type: TabType | 'plan' | null) => void;
  tableNames: string[];
}

export function useDataViewerQueryHandlers({
  activeProject,
  createArtifact,
  setActiveFileTab,
  tableNames,
}: UseDataViewerQueryHandlersOptions) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>('english');

  const handleExecuteQuery = useCallback(
    async (query: string, mode: QueryMode) => {
      if (!activeProject) {
        return;
      }

      setIsExecuting(true);

      try {
        const result = await executeSqlQuery({ projectId: activeProject.id, sql: query });
        const dataPreview = buildDataPreviewFromQuery(result.query);
        const artifactId = createArtifact(
          query,
          mode,
          dataPreview,
          activeProject.id,
          buildQueryArtifactMeta(result.query),
        );

        setActiveFileTab(artifactId, 'artifact');
      } catch (error) {
        console.error('Query execution failed:', error);
        const errorMessage = extractApiErrorMessage(error) || 'Unknown error occurred';

        toast.error('Query failed', {
          description: withSqlIdentifierHint(errorMessage, mode, tableNames[0]),
        });
      } finally {
        setIsExecuting(false);
      }
    },
    [activeProject, createArtifact, setActiveFileTab, tableNames],
  );

  const handleNlGenerate = useCallback(
    async (
      query: string,
      onStreamEvent?: (event: NlQueryStreamEvent) => void,
      signal?: AbortSignal,
    ): Promise<NlGenerationResult> => {
      if (!activeProject) {
        throw new Error('No active project');
      }

      const requestPayload = {
        projectId: activeProject.id,
        query,
        tableName: tableNames[0],
      };

      let nl: Awaited<ReturnType<typeof executeNlQuery>>['nl'];
      if (onStreamEvent) {
        let streamedNl: Awaited<ReturnType<typeof executeNlQuery>>['nl'] | null = null;
        let streamFailure: string | null = null;
        await streamNlQuery(
          requestPayload,
          (event) => {
            onStreamEvent(event);
            if (event.type === 'result') {
              streamedNl = event.nl;
            } else if (
              event.type === 'phase_failed' &&
              event.phaseId === 'done'
            ) {
              streamFailure = event.summary;
            }
          },
          signal,
        );

        if (!streamedNl) {
          throw new Error(
            streamFailure ?? 'NL stream completed without a final result payload.',
          );
        }

        nl = streamedNl;
      } else {
        const response = await executeNlQuery(requestPayload);
        nl = response.nl;
      }

      if (nl.queryExecutionError) {
        toast.warning('Generated SQL needs review', {
          description: `Initial execution hit a database error: ${nl.queryExecutionError}`,
        });
      }

      return toNlGenerationResult(nl);
    },
    [activeProject, tableNames],
  );

  const handleNlApprove = useCallback(
    async (result: NlGenerationResult, approvedSql: string) => {
      if (!activeProject) {
        return;
      }

      setIsExecuting(true);

      try {
        let queryResult = result.queryResult;

        if (!queryResult || approvedSql.trim() !== result.sql.trim()) {
          const freshResult = await executeSqlQuery({
            projectId: activeProject.id,
            sql: approvedSql,
          });
          queryResult = freshResult.query;
        }

        if (!queryResult) {
          throw new Error(
            'Generated SQL has no executable result payload. Please retry.',
          );
        }

        const dataPreview = buildDataPreviewFromQuery(queryResult);
        const artifactId = createArtifact(approvedSql, 'english', dataPreview, activeProject.id, {
          ...buildQueryArtifactMeta(queryResult),
          generatedSql: result.sql,
          rationale: result.rationale,
          explanation: result.explanation,
        });

        setActiveFileTab(artifactId, 'artifact');
      } catch (error) {
        console.error('NL query approval failed:', error);
        const errorMessage = extractApiErrorMessage(error) || 'Unknown error occurred';

        toast.error('Query failed', {
          description: withSqlIdentifierHint(errorMessage, 'english', tableNames[0]),
        });
      } finally {
        setIsExecuting(false);
      }
    },
    [activeProject, createArtifact, setActiveFileTab, tableNames],
  );

  return {
    handleExecuteQuery,
    handleNlApprove,
    handleNlGenerate,
    isExecuting,
    queryMode,
    setQueryMode,
  };
}
