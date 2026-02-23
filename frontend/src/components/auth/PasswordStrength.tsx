/**
 * PasswordStrength - Visual password strength indicator
 *
 * Shows a 5-segment bar that fills from red to green based on password strength
 * Strength is calculated based on length, character variety, and complexity
 */

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' };

    let score = 0;

    // Length checks
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++; // Mixed case
    if (/\d/.test(password)) score++; // Numbers
    if (/[^a-zA-Z0-9]/.test(password)) score++; // Special characters

    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];

    return {
      score,
      label: labels[score],
      color: colors[score]
    };
  }, [password]);

  if (!password) return null;

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full transition-all',
            i <= strength.score ? strength.color : 'bg-neutral-700'
          )}
        />
      ))}
    </div>
  );
}
