/**
 * AuthCard - Card container for auth forms with frosted glass effect
 *
 * Features:
 * - Frosted glass effect (backdrop-blur shows page background)
 * - Proper sizing for different form types
 */

import { cn } from '@/lib/utils';

interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl',
        // Frosted glass effect - semi-transparent with strong blur
        'bg-white/[0.03] backdrop-blur-2xl',
        // Border with subtle glow
        'border border-white/[0.08]',
        // Shadow
        'shadow-[0_8px_32px_rgba(0,0,0,0.4)]',
        // Consistent size for all auth forms - explicit 400px width
        'w-[400px] max-w-[calc(100vw-3rem)] p-8',
        className
      )}
    >
      {/* Inner glow at top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * AuthPageWrapper - Simple wrapper for auth card content
 * Background elements are now in AuthLayout for persistence across navigation
 */
interface AuthPageWrapperProps {
  children: React.ReactNode;
}

export function AuthPageWrapper({ children }: AuthPageWrapperProps) {
  return <>{children}</>;
}
