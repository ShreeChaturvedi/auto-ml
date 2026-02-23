import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useFeatureStore } from '@/stores/featureStore';
import type { FeatureSpec } from '@/types/feature';
import { MoreVertical, Trash2 } from 'lucide-react';

interface FeatureCardProps {
  feature: FeatureSpec;
}

export function FeatureCard({ feature }: FeatureCardProps) {
  const toggleFeature = useFeatureStore((state) => state.toggleFeature);
  const removeFeature = useFeatureStore((state) => state.removeFeature);

  return (
    <Card className={cn(!feature.enabled && 'opacity-70')}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-sm">{feature.featureName}</CardTitle>
            <CardDescription className="text-xs">{feature.description}</CardDescription>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-mono">
                {feature.method}
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                from {feature.sourceColumn}
                {feature.secondaryColumn ? ` + ${feature.secondaryColumn}` : ''}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={feature.enabled}
              onCheckedChange={() => toggleFeature(feature.id)}
              aria-label="Toggle feature"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={() => removeFeature(feature.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {Object.entries(feature.params).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-muted-foreground">{key}</span>
            <span className="font-mono">{String(value)}</span>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">
          Created {new Date(feature.createdAt).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}
