import { useCallback, useEffect, useState } from 'react';
import { CallError } from './call';

const codeOf = (e: unknown) => {
  if (e instanceof CallError) return e.code;
  console.error(e);
  return 'generic';
};

/** Runs an async action, tracking busy state and a translatable error code. */
export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

/** Loads data when `deps` change; `reload()` fetches again. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    load().then(
      (d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      },
      (e) => alive && setError(codeOf(e)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return { data, error, reload, setData };
}
