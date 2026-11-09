import { describe, expect, it } from "vitest";
import { shouldRefresh } from "../src/lib/usePullGesture";

describe("tirar para actualizar", () => {
  it("actualiza si se tira hacia abajo lo suficiente desde arriba de todo", () => {
    expect(shouldRefresh(100, 220, 0, false)).toBe(true);
  });

  it("no actualiza si el gesto es corto o va hacia arriba", () => {
    expect(shouldRefresh(100, 150, 0, false)).toBe(false);
    expect(shouldRefresh(300, 100, 0, false)).toBe(false);
  });

  it("no actualiza si la lista no estaba arriba de todo ni si ya está actualizando", () => {
    expect(shouldRefresh(null, 400, 0, false)).toBe(false);
    expect(shouldRefresh(100, 400, 40, false)).toBe(false);
    expect(shouldRefresh(100, 400, 0, true)).toBe(false);
  });
});
