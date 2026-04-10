import { Equal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Splits a pip-style `name==version` string into `{ name, version }`.
 * Falls back to `{ name: pkg }` when no `==` separator is present so
 * packages installed from a VCS / editable install still render cleanly.
 */
function splitPackage(pkg: string): { name: string; version?: string } {
  const idx = pkg.indexOf('==');
  if (idx === -1) return { name: pkg };
  return { name: pkg.slice(0, idx), version: pkg.slice(idx + 2) };
}

export function ListPackagesResult({ output }: { output: unknown }) {
  const pkgs = (output as { packages?: string[] }).packages;
  if (Array.isArray(pkgs) && pkgs.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {pkgs.slice(0, 30).map((pkg, i) => {
          const { name, version } = splitPackage(pkg);
          return (
            <Badge
              key={i}
              variant="outline"
              className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border-border/70 bg-muted/30 text-muted-foreground"
            >
              <span>{name}</span>
              {version && (
                <>
                  <Equal className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
                  <span>{version}</span>
                </>
              )}
            </Badge>
          );
        })}
        {pkgs.length > 30 && (
          <span className="text-[10px] text-muted-foreground">+{pkgs.length - 30} more</span>
        )}
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground italic">No packages installed.</p>;
}
