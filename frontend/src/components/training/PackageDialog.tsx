/**
 * PackageDialog - Shows PyPI package details with install/info actions
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatFileSize } from '@/lib/fileUtils';
import { useExecutionStore } from '@/stores/executionStore';
import { fetchPyPIPackageDetails, type PackageInfo, type PyPIPackageDetails } from '@/lib/api/execution';
import { Markdown } from '@/components/ui/Markdown';
import { toast } from 'sonner';
import {
  Check,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Package,
  Scale,
  User
} from 'lucide-react';
import { sanitizeDescription } from './packageUtils';

export interface PackageDialogProps {
  pkg: PackageInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstallComplete?: () => void;
  projectId: string;
  isInstalled?: boolean;
}

export function PackageDialog({
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
  const closeTimeoutRef = useRef<number | null>(null);

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
    if (!open) {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      return;
    }

    setInstalling(false);
    setProgress(0);
    setStage(null);
    setCompleted(false);
    installRef.current = false;
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleInstall = async () => {
    if (!pkg || installing || installRef.current) return;
    installRef.current = true;

    setInstalling(true);
    setCompleted(false);
    setProgress(5);
    setStage('Preparing');

    try {
      const result = await installPackage(pkg.name, projectId, {
        onEvent: (event) => {
          if (event.type === 'progress') {
            if (typeof event.progress === 'number') {
              setProgress((prev) => Math.max(prev, event.progress ?? prev));
            }
            if (event.stage) {
              setStage(event.stage);
              console.info(`[runtime-manager] install phase -> ${event.stage}${typeof event.progress === 'number' ? ` (${event.progress}%)` : ''}`);
            }
          }
          if (event.type === 'done') {
            setStage(event.success ? 'Completed' : 'Failed');
            setProgress((prev) => (event.success ? 100 : prev));
            console.info(`[runtime-manager] install done -> ${event.success ? 'success' : 'failure'} (${pkg.name})`);
          }
        }
      });

      if (result.success) {
        setCompleted(true);
        // Fallback in case the stream misses a terminal progress event.
        setStage('Completed');
        setProgress(100);
        toast.success(`Installed ${pkg.name}`);
        closeTimeoutRef.current = window.setTimeout(() => {
          onOpenChange(false);
          onInstallComplete?.();
          closeTimeoutRef.current = null;
        }, 600);
      } else {
        setCompleted(false);
        setStage('Failed');
        installRef.current = false;
        toast.error(`Failed to install ${pkg.name}`, { description: result.message });
      }
    } catch (error) {
      setCompleted(false);
      setStage('Failed');
      installRef.current = false;
      toast.error(`Failed to install ${pkg.name}`, {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setInstalling(false);
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
                  <span>{formatFileSize(displaySize)}</span>
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
                <Markdown
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
                </Markdown>
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
