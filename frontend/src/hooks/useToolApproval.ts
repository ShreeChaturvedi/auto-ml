import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'tool-approval';

export function useToolApproval() {
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setApproved(stored === 'true');
  }, []);

  const approve = useCallback(() => {
    setApproved(true);
    window.localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  return { approved, approve };
}
