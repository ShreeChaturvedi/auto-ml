import { cn } from '@/lib/utils';

interface SkeletonBlockProps {
  height?: number;
  delay?: number;
  className?: string;
}

export function SkeletonBlock({ height = 200, delay = 0, className }: SkeletonBlockProps) {
  return (
    <div
      className={cn('card-enter timeline-skeleton rounded-md', className)}
      style={{ height, animationDelay: `${delay}ms` }}
    />
  );
}
