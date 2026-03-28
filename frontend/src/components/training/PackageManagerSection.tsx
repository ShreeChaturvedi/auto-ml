/**
 * PackageManagerSection - Package search, suggestions dropdown, and installed packages list.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AnimatedPlaceholderInput } from '@/components/ui/animated-placeholder-input';
import { cn } from '@/lib/utils';
import { type PackageInfo } from '@/lib/api/execution';
import { Loader2, Package, RefreshCcw, Search } from 'lucide-react';
import { sanitizeDescription } from './packageUtils';

const PACKAGE_PLACEHOLDERS = [
  'numpy', 'pandas', 'scikit-learn', 'matplotlib', 'seaborn',
  'xgboost', 'lightgbm', 'optuna', 'tensorflow', 'pytorch'
];

interface PackageManagerSectionProps {
  packageInput: string;
  setPackageInput: (value: string) => void;
  packageSuggestions: PackageInfo[];
  suggestionsOpen: boolean;
  setSuggestionsOpen: (open: boolean) => void;
  suggestionsLoading: boolean;
  activeSuggestionIndex: number;
  setActiveSuggestionIndex: (index: number) => void;
  suggestionsListId: string;
  handlePackageFocus: () => void;
  handlePackageBlur: () => void;
  handlePackageKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleSuggestionSelect: (pkg: PackageInfo) => void;
  installedPackages: PackageInfo[];
  onInstalledPackageClick: (pkg: PackageInfo) => void;
  refreshingPackages: boolean;
  onRefreshPackages: () => void;
}

export function PackageManagerSection({
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
  handlePackageKeyDown,
  handleSuggestionSelect,
  installedPackages,
  onInstalledPackageClick,
  refreshingPackages,
  onRefreshPackages
}: PackageManagerSectionProps) {
  return (
    <>
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
              className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover p-1 shadow-lg dark:shadow-none max-h-[280px] overflow-y-auto"
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
                    'w-full rounded-sm px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
          onClick={onRefreshPackages}
          disabled={refreshingPackages}
          title="Refresh installed packages"
          className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                  onClick={() => onInstalledPackageClick(pkg)}
                  className="w-full px-3 py-2.5 hover:bg-muted/30 transition-colors text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 group-hover:bg-emerald-500/15 transition-[background-color] duration-150">
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
                    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] font-mono tabular-nums">
                      {pkg.version ?? 'latest'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
