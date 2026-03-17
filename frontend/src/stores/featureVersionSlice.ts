import type { PipelineVersion, ReadinessReport } from '@/types/feature';

export function buildEmptyReadinessReport(): ReadinessReport {
  return {
    dataSummary: {
      addedColumns: [],
      removedColumns: [],
      renamedColumns: [],
      typeChanges: [],
      nullDeltas: [],
      warnings: []
    },
    steps: []
  };
}

export function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `feature-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDraftVersionRecord(projectId: string, draftCount: number, name?: string): PipelineVersion {
  const generatedName = name?.trim() || `Draft Pipeline v${draftCount + 1}`;
  return {
    id: makeId(),
    projectId,
    name: generatedName,
    status: 'draft',
    createdAt: new Date().toISOString(),
    readinessReport: buildEmptyReadinessReport()
  };
}

export function removeVersionFromList(
  versions: PipelineVersion[],
  versionId: string,
  currentVersionId: string
): { versions: PipelineVersion[]; nextCurrentVersionId: string } {
  const remainingVersions = versions.filter((version) => version.id !== versionId);
  const nextCurrentVersionId = currentVersionId === versionId
    ? (remainingVersions[0]?.id ?? '')
    : (currentVersionId ?? '');
  return { versions: remainingVersions, nextCurrentVersionId };
}

export function renameVersionInList(
  versions: PipelineVersion[],
  versionId: string,
  name: string
): PipelineVersion[] {
  const trimmedName = name.trim();
  if (!trimmedName) return versions;
  return versions.map((version) =>
    version.id === versionId ? { ...version, name: trimmedName } : version
  );
}

export function updateReadinessInList(
  versions: PipelineVersion[],
  versionId: string,
  report: Partial<ReadinessReport>
): PipelineVersion[] {
  return versions.map((version) => {
    if (version.id === versionId) {
      return {
        ...version,
        readinessReport: {
          ...version.readinessReport,
          ...report
        }
      };
    }
    return version;
  });
}

export function approveVersionInList(
  versions: PipelineVersion[],
  versionId: string
): PipelineVersion[] {
  return versions.map((version) => {
    if (version.id === versionId) {
      return { ...version, status: 'approved', approvedAt: new Date().toISOString() };
    }
    if (version.status === 'approved') {
      return { ...version, status: 'deprecated' };
    }
    return version;
  });
}
