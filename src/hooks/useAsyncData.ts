import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = {
  data: T | null;
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  refetch: () => void;
  onRefresh: () => void;
};

function sameDeps(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Fetches `fetcher()` on mount and whenever `deps` change.
 *
 * `deps` must only contain primitive values (ids, ranges, flags): they are
 * compared element-wise, so callers may safely pass a fresh inline array on
 * every render.
 */
export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [prevDeps, setPrevDeps] = useState(deps);
  const mounted = useRef(true);

  // Reset to the loading state when the caller's deps change. Done during
  // render (the React-endorsed "adjust state when props change" pattern)
  // instead of an effect, so no stale frame is painted and no setState fires
  // synchronously inside an effect.
  if (!sameDeps(prevDeps, deps)) {
    setPrevDeps(deps);
    setLoading(true);
    setError(false);
    setAttempt((a) => a + 1);
  }

  // Always call the latest fetcher without listing it as an effect dependency
  // (callers pass a fresh inline closure on every render).
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    fetcherRef.current()
      .then((result) => {
        if (!cancelled && mounted.current) setData(result);
      })
      .catch(() => {
        if (!cancelled && mounted.current) setError(true);
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const refetch = useCallback(() => {
    setError(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetcherRef
      .current()
      .then((result) => setData(result))
      .catch(() => setError(true))
      .finally(() => setRefreshing(false));
  }, []);

  return { data, loading, error, refreshing, refetch, onRefresh };
}

export function useTimer(intervalMs = 1000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick;
}
