/**
 * RuntimeManagerDialog - Configure Python runtime and packages
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
import { Button } from '@/components/ui/button';
import { useExecutionStore } from '@/stores/executionStore';
import { type PackageInfo } from '@/lib/api/execution';
import { toast } from 'sonner';
import { Package, Server, Settings2 } from 'lucide-react';
import { IconModeToggle } from '@/components/data/IconModeToggle';
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
  const [activeTab, setActiveTab] = useState<'runtime' | 'packages'>('runtime');
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
          <DialogHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <DialogTitle>Runtime Manager</DialogTitle>
              <DialogDescription>
                Manage your cloud runtime environment.
              </DialogDescription>
            </div>
            <IconModeToggle
              value={activeTab}
              onValueChange={(val) => { if (val) setActiveTab(val as 'runtime' | 'packages'); }}
              options={[
                { value: 'runtime', ariaLabel: 'Runtime', icon: Server, tooltip: 'Runtime' },
                { value: 'packages', ariaLabel: 'Packages', icon: Package, tooltip: 'Packages' },
              ]}
              selectedIconClassName="text-foreground"
            />
          </DialogHeader>

          {activeTab === 'runtime' && (
            <div className="flex-1 space-y-4 mt-4">
              <ContainerStatusCard
                cloudAvailable={cloudAvailable}
                cloudInitializing={cloudInitializing}
                sessionId={sessionId}
                runtimeStatus={runtimeStatus}
                pythonVersion={pythonVersion}
                setPythonVersion={setPythonVersion}
                onConnect={() => initializeCloud(projectId)}
              />
            </div>
          )}

          {activeTab === 'packages' && (
            <div className="flex-1 flex flex-col min-h-0 space-y-4 mt-4">
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
            </div>
          )}
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
