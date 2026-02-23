/**
 * Logo - AutoML brand logo component
 *
 * Abstract geometric mark representing data transformation and AI.
 * Three flowing layers converging to a central point - suggesting
 * data being processed and refined into intelligence.
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
        {/* Abstract flowing layers converging - represents data → intelligence */}

        {/* Outer arc - raw data layer */}
        <path
          d="M4 24C4 24 8 20 16 20C24 20 28 24 28 24"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.4"
        />

        {/* Middle arc - processing layer */}
        <path
          d="M7 18C7 18 10 14 16 14C22 14 25 18 25 18"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Inner arc - refined layer */}
        <path
          d="M10 12C10 12 12 9 16 9C20 9 22 12 22 12"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* Apex point - the intelligence/output */}
        <circle cx="16" cy="5" r="2.5" fill="currentColor" />

        {/* Rising lines connecting to apex - convergence */}
        <path
          d="M13 9L15 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M19 9L17 6"
          stroke="currentColor"
          strokeWidth="2"
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
