import { useSyncExternalStore } from "react";
import { noFilters, type Filters } from "../lib/filters";

let current: Filters = noFilters();
const listeners = new Set<() => void>();

export const getFilters = (): Filters => current;

export function setFilters(next: Filters): void {
  current = next;
  listeners.forEach((listener) => listener());
}

export function useFilters(): Filters {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
