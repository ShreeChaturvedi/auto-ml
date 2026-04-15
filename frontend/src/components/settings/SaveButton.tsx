import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';

export type ButtonState = 'idle' | 'loading' | 'success' | 'error';

export function SaveButton({
  state,
  idleText,
  loadingText
}: {
  state: ButtonState;
  idleText: string;
  loadingText: string;
}) {
  return (
    <Button
      type="submit"
      variant="secondary"
      disabled={state === 'loading'}
      className="min-w-[120px] h-9 px-4 text-sm transition-colors duration-200"
    >
      {state === 'loading' && (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      )}
      {state === 'success' && (
        <>
          <Check className="mr-2 h-4 w-4 text-emerald-500" />
          <span>Saved</span>
        </>
      )}
      {state === 'idle' && idleText}
      {state === 'error' && idleText}
    </Button>
  );
}
