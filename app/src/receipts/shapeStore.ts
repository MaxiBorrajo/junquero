import { useSyncExternalStore } from "react";
import { DEFAULT_SHAPE, type CardShape } from "./cardSvg";

// La forma de la tarjeta que se está usando en toda la app, para poder compararlas cambiando una sola vez. Temporal: cuando se elige una queda fija.
let current: CardShape = DEFAULT_SHAPE;
const listeners = new Set<() => void>();

export function setReceiptShape(shape: CardShape): void {
  current = shape;
  listeners.forEach((listener) => listener());
}

export function useReceiptShape(): CardShape {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
