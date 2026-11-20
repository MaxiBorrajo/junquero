import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

// Con qué "cara" se usa la app: como Junquero (mapa, trabajos, mensajes) o como jurado (reclamos, casos y garantía).
export type ViewMode = "junquero" | "jury";

const KEY = "junquero.viewMode";
let mode: ViewMode = "junquero";
let loaded = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const getViewMode = (): ViewMode => mode;

export function setViewMode(next: ViewMode): void {
  if (next === mode) return;
  mode = next;
  emit();
  void SecureStore.setItemAsync(KEY, next).catch(() => {});
}

// Recupera la elección guardada la primera vez que se abre la app.
export async function loadViewMode(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored === "jury" || stored === "junquero") {
      mode = stored;
      emit();
    }
  } catch {}
}

export function useViewMode(): ViewMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getViewMode,
    getViewMode,
  );
}
