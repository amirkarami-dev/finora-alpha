import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** URL-synced tab state: validates ?tab=, writes the default in on mount (replace). */
export function useTabParam<T extends string>(validKeys: readonly T[], defaultKey: T) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: T = validKeys.includes(raw as T) ? (raw as T) : defaultKey;
  useEffect(() => {
    if (raw !== tab) {
      const next = new URLSearchParams(params);
      next.set('tab', tab);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, tab]);
  const setTab = useCallback((value: T) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    setParams(next, { replace: true });
  }, [params, setParams]);
  return [tab, setTab] as const;
}
