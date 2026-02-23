/**
 * AuthSubmitButton - Professional submit button for auth forms
 *
 * Features:
 * - Slide-in arrow animation on hover
 * - Loading spinner during submission
 * - Success checkmark
 * - Glowing border effect that follows mouse
 */

import { Loader2, Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { cn } from '@/lib/utils';

export type AuthButtonState = 'idle' | 'loading' | 'success';

interface AuthSubmitButtonProps {
  state?: AuthButtonState;
  idleText: string;
  loadingText: string;
  successText?: string;
  className?: string;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
}

export function AuthSubmitButton({
  state = 'idle',
  idleText,
  loadingText,
  successText = 'Success',
  className,
  disabled,
  type = 'submit',
  onClick
}: AuthSubmitButtonProps) {
  return (
    <GlowingEffect
      borderWidth={1}
      className="rounded-lg"
    >
      <Button
        type={type}
        variant="secondary"
        disabled={state === 'loading' || disabled}
        onClick={onClick}
        className={cn(
          'relative w-full h-11 text-sm font-medium transition-all duration-200',
          'bg-neutral-800 hover:bg-neutral-700 border-neutral-700',
          'group',
          className
        )}
      >
        {state === 'loading' && (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span>{loadingText}</span>
          </>
        )}
        {state === 'success' && (
          <>
            <Check className="h-4 w-4 text-emerald-500 mr-2" />
            <span>{successText}</span>
          </>
        )}
        {state === 'idle' && (
          <span className="relative inline-flex items-center">
            <span className="transition-transform duration-200 group-hover:-translate-x-2">
              {idleText}
            </span>
            <ArrowRight className="absolute -right-6 h-4 w-4 opacity-0 translate-x-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-1" />
          </span>
        )}
      </Button>
    </GlowingEffect>
  );
}
