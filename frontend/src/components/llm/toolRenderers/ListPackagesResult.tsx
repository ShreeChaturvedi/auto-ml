import { Badge } from '@/components/ui/badge';

export function ListPackagesResult({ output }: { output: unknown }) {
  const pkgs = (output as { packages?: string[] }).packages;
  if (Array.isArray(pkgs) && pkgs.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {pkgs.slice(0, 30).map((pkg, i) => (
          <Badge key={i} variant="outline" className="text-[10px] font-mono px-2 py-0.5 rounded-full border-border/70 bg-muted/30 text-muted-foreground">
            {pkg}
          </Badge>
        ))}
        {pkgs.length > 30 && (
          <span className="text-[10px] text-muted-foreground">+{pkgs.length - 30} more</span>
        )}
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground italic">No packages installed.</p>;
}
