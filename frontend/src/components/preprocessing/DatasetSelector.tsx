import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DatasetChooserDialog } from './PreprocessingDialogs';
import type { AvailableTable } from '@/types/preprocessing';

interface DatasetSelectorProps {
  tables: AvailableTable[];
  selectedDatasetId: string | null;
  onSelectDataset: (datasetId: string) => void;
  /** Controlled open state — parent can force-open from external triggers */
  forceOpen?: boolean;
  /** When true, tab persistence has finished hydrating — safe to auto-open */
  tabsReady?: boolean;
}

export function DatasetSelector({
  tables,
  selectedDatasetId,
  onSelectDataset,
  forceOpen,
  tabsReady = true
}: DatasetSelectorProps) {
  const [isDatasetModalOpen, setDatasetModalOpen] = useState(false);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [candidateDatasetId, setCandidateDatasetId] = useState<string | null>(null);
  const autoOpenFiredRef = useRef(false);

  // Auto-open once when no dataset is selected and tables are available.
  // Guarded by tabsReady (wait for persistence) and autoOpenFiredRef (don't re-open after dismiss).
  useEffect(() => {
    if (!tabsReady || autoOpenFiredRef.current) return;
    if (!selectedDatasetId && tables.length > 0) {
      autoOpenFiredRef.current = true;
      setDatasetModalOpen(true);
      if (!candidateDatasetId || !tables.some((table) => table.datasetId === candidateDatasetId)) {
        setCandidateDatasetId(tables[0].datasetId);
      }
    }
  }, [candidateDatasetId, selectedDatasetId, tables, tabsReady]);

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
