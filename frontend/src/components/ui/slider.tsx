import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Tailwind bg class for the filled range (e.g. bg-accent-fill). Falls back to bg-primary. */
  rangeClassName?: string;
  /** Tailwind bg class for the unfilled track background (e.g. bg-accent-bg). Falls back to bg-secondary. */
  trackClassName?: string;
  /** Tailwind border class for the thumb (e.g. border-accent-fill). Falls back to border-primary. */
  thumbClassName?: string;
}

const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, rangeClassName, trackClassName, thumbClassName, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none select-none items-center',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className={cn('relative h-2 w-full grow overflow-hidden rounded-full', trackClassName || 'bg-secondary')}>
      <SliderPrimitive.Range
        className={cn('absolute h-full rounded-full', rangeClassName || 'bg-primary')}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        'block h-5 w-5 rounded-full border-2 bg-background ring-offset-background transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        thumbClassName || 'border-primary',
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
