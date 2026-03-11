import { useCallback, useEffect, useMemo, useState } from 'react';
import { DatasetChooserDialog } from './PreprocessingDialogs';
import type { AvailableTable } from '@/types/preprocessing';

interface DatasetSelectorProps {
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  onSelectDataset: (datasetId: string) => void;
  /** Controlled open state — parent can force-open from external triggers */
  forceOpen?: boolean;
}

export function DatasetSelector({
  tables,
  selectedDatasetId,
  onSelectDataset,
  forceOpen
}: DatasetSelectorProps) {
  const [isDatasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [candidateDatasetId, setCandidateDatasetId] = useState<string | null>(null);

  // Auto-open when no dataset is selected and tables are available
  useEffect(() => {
    if (!selectedDatasetId && tables.length > 0) {
      setDatasetModalOpen(true);
      const candidateStillExists = candidateDatasetId
        ? tables.some((table) => table.datasetId === candidateDatasetId)
        : false;
      if (!candidateStillExists) {
        setCandidateDatasetId(tables[0].datasetId);
      }
    }
  }, [candidateDatasetId, selectedDatasetId, tables]);

  // Respond to parent forcing the dialog open
  useEffect(() => {
    if (forceOpen) {
      setDatasetModalOpen(true);
    }
  }, [forceOpen]);

  const filteredTables = useMemo(() => {
    const query = datasetSearch.trim().toLowerCase();
    if (!query) return tables;
    return tables.filter((table) => {
      return table.filename.toLowerCase().includes(query)
        || table.name.toLowerCase().includes(query)
        || table.datasetId.toLowerCase().includes(query);
    });
  }, [datasetSearch, tables]);

  const handleDatasetStart = useCallback(() => {
    if (!candidateDatasetId) return;
    onSelectDataset(candidateDatasetId);
    setDatasetModalOpen(false);
  }, [candidateDatasetId, onSelectDataset]);

  return (
    <DatasetChooserDialog
      open={isDatasetModalOpen}
      onOpenChange={setDatasetModalOpen}
      datasetSearch={datasetSearch}
      onDatasetSearchChange={setDatasetSearch}
      allTables={tables}
      filteredTables={filteredTables}
      candidateDatasetId={candidateDatasetId}
      onCandidateDatasetChange={setCandidateDatasetId}
      onStart={handleDatasetStart}
    />
  );
}
