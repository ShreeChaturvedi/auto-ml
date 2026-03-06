/**
 * Logo - AutoML brand logo component
 *
 * A modern, polished 'A' brand mark representing ML intelligence.
 * Features clean geometry, an apex data node, and balanced negative
 * space to convey an advanced and intentional technical toolchain.
 */

import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const sizeClasses = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const textSizeClasses = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
};

export function Logo({ className, size = 'md', showText = true }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(sizeClasses[size], 'text-current')}
      >
        {/* Abstract "A" brand mark - clean geometry representing ML intelligence */}

        {/* Apex data node */}
        <circle cx="16" cy="4" r="3" fill="currentColor" />

        {/* Left structural leg */}
        <path
          d="M14 8L5 26"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Right structural leg - lower opacity for depth/modernity */}
        <path
          d="M18 8L27 26"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Crossbar connection - stops before right leg for negative space accent */}
        <path
          d="M9 18H19.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>

      {showText && (
        <span className={cn('font-semibold', textSizeClasses[size])}>
          AutoML
        </span>
      )}
    </div>
  );
}
