import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emptyDraft, type Draft } from "./draft";

const KEY = "junquero.publishDraft";

interface DraftValue {
  draft: Draft;
  loaded: boolean;
  update: (patch: Partial<Draft> | ((draft: Draft) => Draft)) => void;
  reset: () => void;
}

const DraftContext = createContext<DraftValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (alive && raw) setDraft({ ...emptyDraft(), ...(JSON.parse(raw) as Partial<Draft>) });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((value: Draft | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      (value ? AsyncStorage.setItem(KEY, JSON.stringify(value)) : AsyncStorage.removeItem(KEY)).catch(() => {});
    }, 400);
  }, []);

  const update = useCallback(
    (patch: Partial<Draft> | ((draft: Draft) => Draft)) => {
      setDraft((current) => {
        const next = typeof patch === "function" ? patch(current) : { ...current, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setDraft(emptyDraft());
    persist(null);
  }, [persist]);

  const value = useMemo(() => ({ draft, loaded, update, reset }), [draft, loaded, update, reset]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error("DraftProvider ausente");
  return value;
}
