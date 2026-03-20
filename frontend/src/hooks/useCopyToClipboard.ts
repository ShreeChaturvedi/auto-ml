import { useState, useCallback, useEffect, useRef } from 'react';

export function useCopyToClipboard(resetMs = 1500): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(async (text: string): Promise<void> => {
    const markCopied = () => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, resetMs);
    };

    try {
      await navigator.clipboard.writeText(text);
      markCopied();
      return;
    } catch {
      // Fall through to execCommand fallback.
    }

    if (typeof document === 'undefined') return;

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (ok) markCopied();
  }, [resetMs]);

  return [copied, copy];
}
