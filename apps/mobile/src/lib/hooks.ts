import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";
import { useSession } from "./session";

type State<T> = { data: T | null; error: string | null; loading: boolean; refreshing: boolean };

/**
 * Fetch a tenant resource. Re-fetches when the business changes and when the screen regains focus,
 * and exposes `refresh` for pull-to-refresh.
 */
export function useApi<T>(path: string | null, query?: Record<string, string | undefined | null>) {
  const { business } = useSession();
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true, refreshing: false });
  const key = path ? `${business?.id}|${path}|${JSON.stringify(query ?? {})}` : null;
  const keyRef = useRef(key);
  keyRef.current = key;
  const queryRef = useRef(query);
  queryRef.current = query;

  const load = useCallback(
    async (mode: "initial" | "refresh" | "silent") => {
      if (!path) return;
      const requestKey = keyRef.current;
      setState((s) => ({ ...s, loading: mode === "initial" && !s.data, refreshing: mode === "refresh", error: mode === "silent" ? s.error : null }));
      try {
        const data = await api<T>(path, { query: queryRef.current });
        if (keyRef.current === requestKey) setState({ data, error: null, loading: false, refreshing: false });
      } catch (e) {
        if (keyRef.current === requestKey) setState((s) => ({ ...s, error: errorMessage(e), loading: false, refreshing: false }));
      }
    },
    [path],
  );

  useEffect(() => {
    setState({ data: null, error: null, loading: true, refreshing: false });
    void load("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      void load("silent");
    }, [load]),
  );

  return {
    ...state,
    refresh: useCallback(() => load("refresh"), [load]),
    reload: useCallback(() => load("silent"), [load]),
    setData: useCallback((updater: (d: T | null) => T | null) => setState((s) => ({ ...s, data: updater(s.data) })), []),
  };
}

/** Run a mutation with a busy flag and an error message. */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
