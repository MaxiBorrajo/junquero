import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./lib/api";

export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader.current());
    } catch (failure) {
      setError(failure instanceof ApiError && failure.status === 403 ? "Esta billetera no tiene acceso al panel." : "No pudimos cargar los datos. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}
