/**
 * PasswordMatch - Visual password match indicator
 *
 * Shows a smooth animated indicator when passwords match or don't match.
 * Only appears when confirmPassword has content.
 */

import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordMatchProps {
  password: string;
  confirmPassword: string;
}

export function PasswordMatch({ password, confirmPassword }: PasswordMatchProps) {
  const matchStatus = useMemo(() => {
    if (!confirmPassword) return null;
    if (!password) return { matches: false, label: 'Enter password first' };

    const matches = password === confirmPassword;
    return {
      matches,
      label: matches ? 'Passwords match' : "Passwords don't match"
    };
  }, [password, confirmPassword]);

  if (!matchStatus) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs transition-all duration-300 ease-out',
        'animate-in fade-in-0 slide-in-from-top-1'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center w-4 h-4 rounded-full transition-colors duration-200',
          matchStatus.matches
            ? 'bg-emerald-500/20 text-emerald-500'
            : 'bg-destructive/20 text-destructive'
        )}
      >
        {matchStatus.matches ? (
          <Check className="h-3 w-3" />
        ) : (
          <X className="h-3 w-3" />
        )}
      </div>
      <span
        className={cn(
          'font-medium transition-colors duration-200',
          matchStatus.matches ? 'text-emerald-500' : 'text-destructive'
        )}
      >
        {matchStatus.label}
      </span>
    </div>
  );
}
