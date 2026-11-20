import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

// Con qué "cara" se usa la app: como Junquero (mapa, trabajos, mensajes) o como jurado (reclamos, casos y garantía).
// La elección se guarda por cuenta: una cuenta que nunca la cambió arranca en Junquero, y cada una recuerda la suya.
export type ViewMode = "junquero" | "jury";

const keyFor = (address: string): string => `junquero.viewMode.${address.toLowerCase()}`;

let mode: ViewMode = "junquero";
let account: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const getViewMode = (): ViewMode => mode;

// `remember: false` cambia la vista solo por ahora (por ejemplo al tocar una notificación de jurado) sin cambiar lo que la persona eligió.
export function setViewMode(next: ViewMode, remember = true): void {
  if (next !== mode) {
    mode = next;
    emit();
  }
  if (remember && account) void SecureStore.setItemAsync(keyFor(account), next).catch(() => {});
}

// Al entrar o cambiar de cuenta: vuelve a Junquero y, si esa cuenta había elegido otra cosa, la recupera.
export async function loadViewMode(address: string | null | undefined): Promise<void> {
  const next = address ? address.toLowerCase() : null;
  if (next === account) return;
  account = next;
  if (mode !== "junquero") {
    mode = "junquero";
    emit();
  }
  if (!next) return;
  try {
    const stored = await SecureStore.getItemAsync(keyFor(next));
    if (account === next && stored === "jury") {
      mode = "jury";
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
