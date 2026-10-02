import { useCallback, useEffect, useRef, useState } from 'react';

type State<T> = {
  data: T | null;
  loading: boolean;
  error: boolean;
  refreshing: boolean;
  refetch: () => void;
  onRefresh: () => void;
};

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetcher()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const refetch = useCallback(() => {
    setError(false);
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetcher()
      .then((result) => setData(result))
      .catch(() => setError(true))
      .finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

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