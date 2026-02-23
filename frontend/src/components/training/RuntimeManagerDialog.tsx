/**
 * RuntimeManagerDialog - Configure Python runtime, packages, and datasets
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
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
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedPlaceholderInput } from '@/components/ui/animated-placeholder-input';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/executionStore';
import { useDataStore } from '@/stores/dataStore';
import { searchPackages, fetchPyPIPackageDetails, type PyPIPackageDetails, type PackageInfo } from '@/lib/api/execution';
import { toast } from 'sonner';
import {
  Check,
  Database,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Package,
  RefreshCcw,
  Scale,
  Search,
  Settings2,
  User
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const PACKAGE_PLACEHOLDERS = [
  'numpy', 'pandas', 'scikit-learn', 'matplotlib', 'seaborn',
  'xgboost', 'lightgbm', 'optuna', 'tensorflow', 'pytorch'
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Clean up PyPI descriptions for rendering as markdown.
 * Converts RST to markdown and cleans up formatting.
 */
function sanitizeDescription(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Decode common HTML entities first
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Remove inline HTML tags but preserve content
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove badge images (common in READMEs) - lines with multiple [![...](...)]
  cleaned = cleaned.replace(/^\[!\[.*?\]\(.*?\)\]\(.*?\)\s*$/gm, '');
  cleaned = cleaned.replace(/!\[.*?\]\(https:\/\/[^\)]+\)/g, '');

  // Convert RST-style headers to markdown
  // Pattern: line of text followed by a line of only = or - chars
  const lines = cleaned.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    // Check if next line is RST underline
    if (nextLine && /^[=]{3,}$/.test(nextLine.trim())) {
      processedLines.push('# ' + line.trim());
      i++; // Skip the underline
    } else if (nextLine && /^[-]{3,}$/.test(nextLine.trim())) {
      processedLines.push('## ' + line.trim());
      i++; // Skip the underline
    } else if (/^[-]{3,}$/.test(line.trim()) || /^[=]{3,}$/.test(line.trim())) {
      // Skip standalone separator lines
      continue;
    } else {
      processedLines.push(line);
    }
  }

  cleaned = processedLines.join('\n');

  // Convert RST code blocks (:: at end of line followed by indented block)
  cleaned = cleaned.replace(/::\s*\n\n((?:    .+\n?)+)/g, (_, code) => {
    const unindented = code.split('\n').map((l: string) => l.replace(/^    /, '')).join('\n');
    return '\n```\n' + unindented.trim() + '\n```\n';
  });

  // Convert RST inline literals ``code`` to markdown `code`
  cleaned = cleaned.replace(/``([^`]+)``/g, '`$1`');

  // Convert RST links `text <url>`_ to markdown [text](url)
  cleaned = cleaned.replace(/`([^<]+)\s*<([^>]+)>`_/g, '[$1]($2)');

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

interface RuntimeManagerDialogProps {
  projectId: string;
}

/**
 * Package Dialog - Shows package details with install/info actions
 */
interface PackageDialogProps {
  pkg: PackageInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstallComplete?: () => void;
  projectId: string;
  isInstalled?: boolean;
}

function PackageDialog({
  pkg,
  open,
  onOpenChange,
  onInstallComplete,
  projectId,
  isInstalled = false
}: PackageDialogProps) {
  const [details, setDetails] = useState<PyPIPackageDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const installPackage = useExecutionStore((state) => state.installPackage);
  const installRef = useRef(false);

  // Fetch package details when dialog opens
  useEffect(() => {
    if (!open || !pkg) {
      setDetails(null);
      return;
    }

    setLoadingDetails(true);
    fetchPyPIPackageDetails(pkg.name, pkg.version)
      .then((d) => setDetails(d))
      .finally(() => setLoadingDetails(false));
  }, [open, pkg]);

  // Reset install state when dialog opens
  useEffect(() => {
    if (open) {
      setInstalling(false);
      setProgress(0);
      setStage(null);
      setCompleted(false);
      installRef.current = false;
    }
  }, [open]);

  const handleInstall = async () => {
    if (!pkg || installing || installRef.current) return;
    installRef.current = true;

    setInstalling(true);
    setProgress(5);
    setStage('Preparing');

    const result = await installPackage(pkg.name, projectId, {
      onEvent: (event) => {
        if (event.type === 'progress') {
          if (typeof event.progress === 'number') setProgress(event.progress);
          if (event.stage) setStage(event.stage);
        }
        if (event.type === 'done') {
          setStage(event.success ? 'Completed' : 'Failed');
          setProgress(event.success ? 100 : progress);
        }
      }
    });

    setInstalling(false);
    setCompleted(true);

    if (result.success) {
      toast.success(`Installed ${pkg.name}`);
      setTimeout(() => {
        onOpenChange(false);
        onInstallComplete?.();
      }, 600);
    } else {
      toast.error(`Failed to install ${pkg.name}`, { description: result.message });
    }
  };

  if (!pkg) return null;

  const displayName = details?.name || pkg.name;
  const displayVersion = details?.version || pkg.version || 'latest';
  const displaySummary = details?.summary || pkg.summary || '';
  const displayDescription = sanitizeDescription(details?.description || '');
  const displayAuthor = details?.author || '';
  const displayLicenseName = details?.licenseName || '';
  const displaySize = details?.size || 0;
  const displayHomepage = details?.homepage || pkg.homepage || '';
  const displayPypiUrl = details?.packageUrl || `https://pypi.org/project/${pkg.name}/`;
  const displayPythonVersions = details?.pythonVersions || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-w-[90vw] max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              isInstalled ? 'bg-emerald-500/10' : 'bg-primary/10'
            )}>
              <Package className={cn('h-5 w-5', isInstalled ? 'text-emerald-500' : 'text-primary')} />
            </div>
            <div>
              <span className="text-lg">{displayName}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-[10px] font-normal">
                  v{displayVersion}
                </Badge>
                {isInstalled && (
                  <Badge variant="outline" className="text-[10px] font-normal text-emerald-500 border-emerald-500/30">
                    Installed
                  </Badge>
                )}
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {/* Summary */}
            {displaySummary && (
              <p className="text-sm text-muted-foreground">{displaySummary}</p>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {displayAuthor && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{displayAuthor}</span>
                </div>
              )}
              {displayLicenseName && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Scale className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-sm">{displayLicenseName}</span>
                </div>
              )}
              {displaySize > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatBytes(displaySize)}</span>
                </div>
              )}
            </div>

            {/* Python Versions Badge */}
            {displayPythonVersions.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Works with</span>
                <div className="inline-flex items-center rounded-md overflow-hidden border border-border text-xs font-mono">
                  <span className="bg-emerald-600 text-white px-2 py-0.5">Python</span>
                  {displayPythonVersions.map((version, idx) => (
                    <span
                      key={version}
                      className={cn(
                        'px-2 py-0.5 text-muted-foreground',
                        idx > 0 && 'border-l border-border'
                      )}
                    >
                      {version}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            <div className="flex flex-wrap gap-2">
              {displayHomepage && (
                <a
                  href={displayHomepage}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Homepage
                </a>
              )}
              <a
                href={displayPypiUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                PyPI
              </a>
            </div>

            {/* Description */}
            {loadingDetails ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading package details...
              </div>
            ) : displayDescription ? (
              <div className="text-sm text-foreground max-h-[250px] overflow-y-auto border-t pt-3">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Remove badges/images that won't render well
                    img: () => null,
                    // Compact headings
                    h1: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>,
                    h2: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1.5">{children}</h4>,
                    h3: ({ children }) => <h5 className="text-sm font-medium mt-2 mb-1">{children}</h5>,
                    // Compact paragraphs
                    p: ({ children }) => <p className="text-sm text-muted-foreground mb-2 last:mb-0 leading-relaxed">{children}</p>,
                    // Compact lists
                    ul: ({ children }) => <ul className="list-disc pl-4 text-sm text-muted-foreground mb-2 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 text-sm text-muted-foreground mb-2 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li className="text-sm">{children}</li>,
                    // Styled code
                    code: ({ className, children }) => {
                      const isBlock = className?.includes('language-');
                      if (isBlock) {
                        return (
                          <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-2 rounded text-xs font-mono overflow-x-auto my-2">
                            <code>{children}</code>
                          </pre>
                        );
                      }
                      return (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      );
                    },
                    // Styled links
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {children}
                      </a>
                    ),
                    // Horizontal rules
                    hr: () => <hr className="my-2 border-border" />
                  }}
                >
                  {displayDescription.length > 2500
                    ? displayDescription.slice(0, 2500) + '\n\n...'
                    : displayDescription}
                </ReactMarkdown>
              </div>
            ) : null}

            {/* Progress Section */}
            {(installing || completed) && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{stage ?? 'Installing'}</span>
                  <span className="text-muted-foreground">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}

            {/* Info for installed packages */}
            {isInstalled && (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Cloud packages persist for the duration of your session.</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Install Action */}
        {!isInstalled && (
          <div className="pt-4 border-t">
            <Button
              onClick={handleInstall}
              disabled={installing || completed}
              className={cn(
                'w-full h-11',
                completed && 'bg-emerald-600 hover:bg-emerald-600'
              )}
            >
              {installing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : completed ? (
                <>
                  <Check className="h-4 w-4" />
                  Installed
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Install Package
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RuntimeManagerDialog({ projectId }: RuntimeManagerDialogProps) {
  const [open, setOpen] = useState(false);
  const [packageInput, setPackageInput] = useState('');
  const [packageSuggestions, setPackageSuggestions] = useState<PackageInfo[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [refreshingPackages, setRefreshingPackages] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PackageInfo | null>(null);
  const [selectedIsInstalled, setSelectedIsInstalled] = useState(false);
  const suggestionsListId = useId();
  const blurTimeoutRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const {
    pythonVersion,
    setPythonVersion,
    cloudAvailable,
    cloudInitializing,
    sessionId,
    installedPackages,
    refreshPackages,
    initializeCloud
  } = useExecutionStore();

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

  // Hydrate packages when dialog opens
  useEffect(() => {
    if (!open) return;
    void refreshPackages();
  }, [open, refreshPackages]);

  // Reset suggestions when dialog closes
  useEffect(() => {
    if (!open) {
      setSuggestionsOpen(false);
      setPackageSuggestions([]);
      setActiveSuggestionIndex(-1);
      setPackageInput('');
    }
  }, [open]);

  // Search packages
  useEffect(() => {
    if (!open || !suggestionsOpen) return;

    const currentRequestId = ++requestIdRef.current;
    const query = packageInput.trim();

    const timeout = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const suggestions = await searchPackages(query, 8);
        if (currentRequestId !== requestIdRef.current) return;
        setPackageSuggestions(suggestions);
        setActiveSuggestionIndex(-1);
      } catch {
        if (currentRequestId !== requestIdRef.current) return;
        setPackageSuggestions([]);
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setSuggestionsLoading(false);
        }
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [open, packageInput, suggestionsOpen]);

  const handleSuggestionSelect = useCallback((pkg: PackageInfo) => {
    setPackageInput(pkg.name);
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
    setSelectedPackage(pkg);
    setSelectedIsInstalled(false);
    setPackageDialogOpen(true);
  }, []);

  const handleInstalledPackageClick = useCallback((pkg: PackageInfo) => {
    setSelectedPackage(pkg);
    setSelectedIsInstalled(true);
    setPackageDialogOpen(true);
  }, []);

  const handlePackageFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setSuggestionsOpen(true);
  }, []);

  const handlePackageBlur = useCallback(() => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setSuggestionsOpen(false);
      setActiveSuggestionIndex(-1);
    }, 150);
  }, []);

  const handlePackageKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!suggestionsOpen || packageSuggestions.length === 0) {
        if (event.key === 'ArrowDown') setSuggestionsOpen(true);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => Math.min(prev + 1, packageSuggestions.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
        event.preventDefault();
        const selection = packageSuggestions[activeSuggestionIndex];
        if (selection) handleSuggestionSelect(selection);
      }

      if (event.key === 'Escape') {
        setSuggestionsOpen(false);
        setActiveSuggestionIndex(-1);
      }
    },
    [activeSuggestionIndex, handleSuggestionSelect, packageSuggestions, suggestionsOpen]
  );

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
    setPackageInput('');
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
          <Button variant="ghost" size="icon-sm" title="Runtime settings">
            <Settings2 className="h-4 w-4" />
          </Button>
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
