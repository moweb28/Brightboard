import { useState } from 'react';
import { AppError } from '../api';
import type { ErrorKey } from '../i18n';

/** Runs an async action, tracking busy state and a translatable error. */
export function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof AppError ? e.key : 'generic');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
