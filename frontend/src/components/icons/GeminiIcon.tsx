import { useId } from 'react';

import { cn } from '@/lib/utils';

interface GeminiIconProps {
  className?: string;
}

/**
 * Gemini sparkle icon — matches Google's official Gemini branding.
 * Four-pointed star with blue-to-indigo gradient.
 */
export function GeminiIcon({ className }: GeminiIconProps) {
  const gradientId = useId();

  return (
    <svg
      className={cn('h-4 w-4', className)}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#6C5CE7" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <path
        d="M14 0C14 7.732 7.732 14 0 14c7.732 0 14 6.268 14 14 0-7.732 6.268-14 14-14-7.732 0-14-6.268-14-14Z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
