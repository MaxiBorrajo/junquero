import { describe, expect, it } from "vitest";
import { isVisibleMine, PENDING_WINDOW_SECONDS } from "../src/lib/pending";

describe("changas propias pendientes", () => {
  const now = 1_800_000_000;

  it("muestra las que ya están publicadas sin importar la antigüedad", () => {
    expect(isVisibleMine({ status: "open", createdAt: now - 10 * PENDING_WINDOW_SECONDS }, now)).toBe(true);
  });

  it("muestra un borrador reciente mientras se confirma", () => {
    expect(isVisibleMine({ status: "draft", createdAt: now - 60 }, now)).toBe(true);
  });

  it("oculta un borrador viejo que nunca se confirmó", () => {
    expect(isVisibleMine({ status: "draft", createdAt: now - PENDING_WINDOW_SECONDS - 1 }, now)).toBe(false);
  });
});
