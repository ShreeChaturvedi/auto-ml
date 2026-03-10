/**
 * RuntimeManagerDialog - Configure Python runtime, packages, and datasets
 */

import React, {
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedPlaceholderInput } from '@/components/ui/animated-placeholder-input';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/executionStore';
import { useDataStore } from '@/stores/dataStore';
import { type PackageInfo } from '@/lib/api/execution';
import { toast } from 'sonner';
import {
  Database,
  Info,
  Loader2,
  Package,
  RefreshCcw,
  Search,
  Settings2
} from 'lucide-react';
import { PackageDialog } from './PackageDialog';
import { sanitizeDescription } from './packageUtils';
import { usePackageSearch } from './hooks/usePackageSearch';

const PACKAGE_PLACEHOLDERS = [
  'numpy', 'pandas', 'scikit-learn', 'matplotlib', 'seaborn',
  'xgboost', 'lightgbm', 'optuna', 'tensorflow', 'pytorch'
];

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
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">Cloud Runtime</h3>
                  <p className="text-xs text-muted-foreground">
                    Server-side Python with full library support (NumPy, Pandas, Scikit-learn, PyTorch, etc.)
                  </p>
                </div>
                <Badge variant={cloudAvailable ? 'default' : 'secondary'} className="text-xs">
                  {cloudAvailable ? 'Available' : 'Unavailable'}
                </Badge>
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        runtimeStatus === 'Ready' || runtimeStatus === 'Connected'
                          ? 'bg-emerald-500'
                          : runtimeStatus === 'Connecting'
                            ? 'bg-amber-500 animate-pulse'
                            : runtimeStatus === 'Unavailable'
                              ? 'bg-destructive'
                              : 'bg-muted-foreground/60'
                      )}
                    />
                    <span className="text-muted-foreground">{runtimeStatus}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Python</span>
                    <Select value={pythonVersion} onValueChange={setPythonVersion}>
                      <SelectTrigger className="h-7 w-[84px] text-xs">
                        <SelectValue placeholder="Version" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3.11">3.11</SelectItem>
                        <SelectItem value="3.10">3.10</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => initializeCloud(projectId)}
                      disabled={!cloudAvailable || cloudInitializing}
                    >
                      {cloudInitializing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      {sessionId ? 'Reconnect' : 'Connect'}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dashed p-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {sessionId
                      ? 'Cloud session keeps packages and data cached for faster runs.'
                      : 'Cloud runtime will create a session on first run.'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 shrink-0" />
                  <span>Datasets mount at `/workspace/datasets` and resolve via `resolve_dataset_path()`.</span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 shrink-0" />
                  <span>Install packages per session using pip.</span>
                </div>
              </div>
            </TabsContent>

            {/* Packages Tab */}
            <TabsContent value="packages" className="flex-1 flex flex-col min-h-0 space-y-4 mt-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
                  <AnimatedPlaceholderInput
                    placeholders={PACKAGE_PLACEHOLDERS}
                    interval={2500}
                    leftPadding={2.25}
                    value={packageInput}
                    onChange={(e) => {
                      setPackageInput(e.target.value);
                      setSuggestionsOpen(true);
                    }}
                    onFocus={handlePackageFocus}
                    onBlur={handlePackageBlur}
                    onKeyDown={handlePackageKeyDown}
                    className="pl-9"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={suggestionsOpen}
                    aria-controls={suggestionsOpen ? suggestionsListId : undefined}
                    aria-activedescendant={
                      activeSuggestionIndex >= 0
                        ? `${suggestionsListId}-option-${activeSuggestionIndex}`
                        : undefined
                    }
                    autoComplete="off"
                  />
                  {suggestionsOpen && (
                    <div
                      id={suggestionsListId}
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-1 shadow-lg max-h-[280px] overflow-y-auto"
                    >
                      {suggestionsLoading && (
                        <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching packages...
                        </div>
                      )}
                      {!suggestionsLoading && packageSuggestions.length === 0 && (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          No packages found.
                        </div>
                      )}
                      {!suggestionsLoading && packageInput.trim().length === 0 && packageSuggestions.length > 0 && (
                        <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Suggested
                        </div>
                      )}
                      {packageSuggestions.map((pkg, index) => (
                        <button
                          key={`${pkg.name}-${pkg.version ?? 'latest'}`}
                          type="button"
                          id={`${suggestionsListId}-option-${index}`}
                          role="option"
                          aria-selected={index === activeSuggestionIndex}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActiveSuggestionIndex(index)}
                          onClick={() => handleSuggestionSelect(pkg)}
                          className={cn(
                            'w-full rounded-sm px-2 py-2 text-left text-sm transition-colors',
                            index === activeSuggestionIndex
                              ? 'bg-accent text-accent-foreground'
                              : 'hover:bg-muted'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">{pkg.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {pkg.version && (
                                <span className="text-[11px] text-muted-foreground">{pkg.version}</span>
                              )}
                            </div>
                          </div>
                          {pkg.summary && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1 pl-5">
                              {pkg.summary}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefreshPackages}
                  disabled={refreshingPackages}
                  title="Refresh installed packages"
                >
                  <RefreshCcw className={cn('h-4 w-4', refreshingPackages && 'animate-spin')} />
                </Button>
              </div>


              <div className="flex-1 min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Installed Packages
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {installedPackages.length}
                  </Badge>
                </div>
                <ScrollArea className="h-[200px] rounded-md border bg-muted/5">
                  <div className="divide-y divide-border/50">
                    {installedPackages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">
                          No packages installed yet
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          Search above to install packages
                        </p>
                      </div>
                    ) : (
                      installedPackages.map((pkg) => (
                        <button
                          key={`${pkg.name}-${pkg.version ?? 'latest'}`}
                          type="button"
                          onClick={() => handleInstalledPackageClick(pkg)}
                          className="w-full px-3 py-2.5 hover:bg-muted/30 transition-colors text-left group"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 group-hover:bg-emerald-500/15 transition-colors">
                                <Package className="h-3.5 w-3.5 text-emerald-500" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm font-medium block truncate">{pkg.name}</span>
                                {pkg.summary && (
                                  <span className="text-[11px] text-muted-foreground line-clamp-1">
                                    {sanitizeDescription(pkg.summary)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                              {pkg.version ?? 'latest'}
                            </Badge>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
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
