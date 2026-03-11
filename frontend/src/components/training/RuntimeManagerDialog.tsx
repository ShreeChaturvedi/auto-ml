/**
 * RuntimeManagerDialog - Configure Python runtime, packages, and datasets
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExecutionStore } from '@/stores/executionStore';
import { useDataStore } from '@/stores/dataStore';
import { type PackageInfo } from '@/lib/api/execution';
import { toast } from 'sonner';
import { Settings2 } from 'lucide-react';
import { PackageDialog } from './PackageDialog';
import { usePackageSearch } from './hooks/usePackageSearch';
import { ContainerStatusCard } from './ContainerStatusCard';
import { PackageManagerSection } from './PackageManagerSection';

interface RuntimeManagerDialogProps {
  projectId: string;
  trigger?: React.ReactNode;
}

export function RuntimeManagerDialog({ projectId, trigger }: RuntimeManagerDialogProps) {
  const [open, setOpen] = useState(false);
  const [refreshingPackages, setRefreshingPackages] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null);
  const [selectedIsInstalled, setSelectedIsInstalled] = useState(false);

  const pythonVersion = useExecutionStore((state) => state.pythonVersion);
  const setPythonVersion = useExecutionStore((state) => state.setPythonVersion);
  const cloudAvailable = useExecutionStore((state) => state.cloudAvailable);
  const cloudInitializing = useExecutionStore((state) => state.cloudInitializing);
  const sessionId = useExecutionStore((state) => state.sessionId);
  const installedPackages = useExecutionStore((state) => state.installedPackages);
  const refreshPackages = useExecutionStore((state) => state.refreshPackages);
  const initializeCloud = useExecutionStore((state) => state.initializeCloud);

  const files = useDataStore((state) => state.files);
  const projectFiles = useMemo(
    () => files.filter((file) => file.projectId === projectId),
    [files, projectId]
  );
  const datasetFiles = useMemo(
    () => projectFiles.filter((file) => file.metadata?.datasetId),
    [projectFiles]
  );
  const datasetNameCounts = useMemo(
    () =>
      datasetFiles.reduce<Record<string, number>>((acc, file) => {
        acc[file.name] = (acc[file.name] ?? 0) + 1;
        return acc;
      }, {}),
    [datasetFiles]
  );
  const documentFiles = useMemo(
    () => projectFiles.filter((file) => file.metadata?.documentId),
    [projectFiles]
  );

  const handleSuggestionSelect = useCallback((pkg: PackageInfo) => {
    setSelectedPackage(pkg);
    setSelectedIsInstalled(false);
    setPackageDialogOpen(true);
  }, []);

  const {
    packageInput,
    setPackageInput,
    packageSuggestions,
    suggestionsOpen,
    setSuggestionsOpen,
    suggestionsLoading,
    activeSuggestionIndex,
    setActiveSuggestionIndex,
    suggestionsListId,
    handlePackageFocus,
    handlePackageBlur,
    handlePackageKeyDown
  } = usePackageSearch({ enabled: open, onSelect: handleSuggestionSelect });

  // Hydrate packages when dialog opens
  useEffect(() => {
    if (!open) return;
    void refreshPackages();
  }, [open, refreshPackages]);

  const handleInstalledPackageClick = useCallback((pkg: PackageInfo) => {
    setSelectedPackage(pkg);
    setSelectedIsInstalled(true);
    setPackageDialogOpen(true);
  }, []);

  const handleRefreshPackages = useCallback(async () => {
    if (refreshingPackages) return;
    setRefreshingPackages(true);
    try {
      await refreshPackages();
      toast.success('Package list refreshed');
    } catch {
      toast.error('Failed to refresh packages');
    } finally {
      setRefreshingPackages(false);
    }
  }, [refreshPackages, refreshingPackages]);

  const handleInstallComplete = useCallback(() => {
    setSelectedPackage(null);
  }, []);

  const runtimeStatus = useMemo(() => {
    if (cloudInitializing) return 'Connecting';
    if (!cloudAvailable) return 'Unavailable';
    return sessionId ? 'Connected' : 'Ready';
  }, [cloudInitializing, cloudAvailable, sessionId]);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="ghost" size="icon-sm" title="Runtime settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Runtime Manager</DialogTitle>
            <DialogDescription>
              Configure Python runtime, packages, and dataset mounts.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="runtime" className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="runtime">Runtime</TabsTrigger>
              <TabsTrigger value="packages">Packages</TabsTrigger>
              <TabsTrigger value="datasets">Datasets</TabsTrigger>
            </TabsList>

            {/* Runtime Tab */}
            <TabsContent value="runtime" className="flex-1 space-y-4 mt-4">
              <ContainerStatusCard
                cloudAvailable={cloudAvailable}
                cloudInitializing={cloudInitializing}
                sessionId={sessionId}
                runtimeStatus={runtimeStatus}
                pythonVersion={pythonVersion}
                setPythonVersion={setPythonVersion}
                onConnect={() => initializeCloud(projectId)}
              />
            </TabsContent>

            {/* Packages Tab */}
            <TabsContent value="packages" className="flex-1 flex flex-col min-h-0 space-y-4 mt-4">
              <PackageManagerSection
                packageInput={packageInput}
                setPackageInput={setPackageInput}
                packageSuggestions={packageSuggestions}
                suggestionsOpen={suggestionsOpen}
                setSuggestionsOpen={setSuggestionsOpen}
                suggestionsLoading={suggestionsLoading}
                activeSuggestionIndex={activeSuggestionIndex}
                setActiveSuggestionIndex={setActiveSuggestionIndex}
                suggestionsListId={suggestionsListId}
                handlePackageFocus={handlePackageFocus}
                handlePackageBlur={handlePackageBlur}
                handlePackageKeyDown={handlePackageKeyDown}
                handleSuggestionSelect={handleSuggestionSelect}
                installedPackages={installedPackages}
                onInstalledPackageClick={handleInstalledPackageClick}
                refreshingPackages={refreshingPackages}
                onRefreshPackages={handleRefreshPackages}
              />
            </TabsContent>

            {/* Datasets Tab */}
            <TabsContent value="datasets" className="flex-1 flex flex-col min-h-0 space-y-4 mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {datasetFiles.length} dataset{datasetFiles.length === 1 ? '' : 's'}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {documentFiles.length} context doc{documentFiles.length === 1 ? '' : 's'}
                </Badge>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Quick load</p>
                <code className="mt-1 block font-mono text-[11px] bg-background/50 p-2 rounded">
                  df = pd.read_csv(resolve_dataset_path("your_file.csv"))
                </code>
              </div>

              <div className="flex-1 min-h-0">
                <ScrollArea className="h-[180px] rounded-md border">
                  <div className="p-3 space-y-2">
                    {datasetFiles.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        Upload a dataset to see it here.
                      </p>
                    ) : (
                      datasetFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <code className="text-[10px] text-muted-foreground font-mono">
                              {datasetNameCounts[file.name] > 1 && file.metadata?.datasetId
                                ? `resolve_dataset_path("${file.name}", "${file.metadata.datasetId}")`
                                : `resolve_dataset_path("${file.name}")`}
                            </code>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {file.type}
                          </Badge>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Package Dialog */}
      <PackageDialog
        pkg={selectedPackage}
        open={packageDialogOpen}
        onOpenChange={setPackageDialogOpen}
        onInstallComplete={handleInstallComplete}
        projectId={projectId}
        isInstalled={selectedIsInstalled}
      />
    </>
  );
}
