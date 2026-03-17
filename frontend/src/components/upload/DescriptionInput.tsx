import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

interface DescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const SAVE_DEBOUNCE_MS = 500;

export function DescriptionInput({ value, onChange, disabled }: DescriptionInputProps) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleSave = (next: string) => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      onChange(next.trim());
      timerRef.current = null;
    }, SAVE_DEBOUNCE_MS);
  };

  const flush = (current: string) => {
    clearTimer();
    onChange(current.trim());
  };

  return (
    <Input
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        scheduleSave(e.target.value);
      }}
      onBlur={() => flush(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          flush(draft);
        }
        if (e.key === 'Escape') {
          setDraft(value);
          clearTimer();
        }
      }}
      placeholder="Add a description"
      disabled={disabled}
      className="h-9 border-0 bg-transparent px-0 text-sm text-foreground placeholder:text-muted-foreground shadow-none focus-visible:ring-0"
    />
  );
}
