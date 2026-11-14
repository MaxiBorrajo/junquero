import { useSyncExternalStore } from "react";
import type { Changa } from "../api/types";

// Trabajos que cancelé y el indexador todavía no reflejó: se muestran como "Cancelando" en toda la app.
const EXPIRES_MS = 15 * 60 * 1000;
const marked = new Map<number, number>();
let snapshot: ReadonlySet<number> = new Set();
const listeners = new Set<() => void>();

const rebuild = () => {
  const now = Date.now();
  for (const [id, at] of marked) if (now - at > EXPIRES_MS) marked.delete(id);
  snapshot = new Set(marked.keys());
  listeners.forEach((listener) => listener());
};

export function markCancelling(changaId: number): void {
  marked.set(changaId, Date.now());
  rebuild();
}

export function useCancelling(): ReadonlySet<number> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

// "cancelling" mientras el servidor siga diciendo "abierta"; si ya cambió de estado, vale el del servidor.
export const effectiveStatus = (changa: Pick<Changa, "id" | "status">, cancelling: ReadonlySet<number>): string => (cancelling.has(changa.id) && changa.status === "open" ? "cancelling" : changa.status);
