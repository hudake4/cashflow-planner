"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api-client";

export interface ApiState<T> {
  data: T | undefined;
  error: string | null;
  /** True only while there is no data yet (initial load or after a key change). */
  loading: boolean;
  /** True while any request is in flight, including background refetches. */
  refreshing: boolean;
  /** The key whose response is currently in `data`. */
  dataKey: string | null;
  reload: () => Promise<void>;
}

/**
 * Minimal data-fetching hook. `key` identifies the request; when it changes the
 * fetcher runs again. Stale responses from older keys are ignored.
 */
export function useApi<T>(key: string | null, fetcher: () => Promise<T>): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const fetcherRef = useRef(fetcher);
  const latestKey = useRef(key);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const run = useCallback(async (forKey: string | null) => {
    if (forKey === null) return;
    setInFlight((n) => n + 1);
    try {
      const result = await fetcherRef.current();
      if (latestKey.current === forKey) {
        setData(result);
        setDataKey(forKey);
        setError(null);
      }
    } catch (err) {
      if (latestKey.current === forKey) setError(errorMessage(err));
    } finally {
      setInFlight((n) => n - 1);
    }
  }, []);

  useEffect(() => {
    latestKey.current = key;
    setError(null);
    void run(key);
  }, [key, run]);

  const reload = useCallback(() => run(latestKey.current), [run]);

  return {
    data,
    error,
    loading: data === undefined && error === null,
    refreshing: inFlight > 0 || (key !== null && dataKey !== key && error === null),
    dataKey,
    reload,
  };
}
