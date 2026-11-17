import { describe, expect, it } from "vitest";
import { releaseValidity } from "../src/chain/orderActions";

describe("duración del QR de liberación", () => {
  it("dura un día salvo que se configure otra cosa", () => {
    expect(releaseValidity(undefined)).toBe(24 * 3600);
    expect(releaseValidity("")).toBe(24 * 3600);
  });

  it("se puede acortar para probar un QR vencido", () => {
    expect(releaseValidity("90")).toBe(90);
    expect(releaseValidity("3600")).toBe(3600);
  });

  it("ignora valores que el servidor no aceptaría o que alargan el plazo", () => {
    expect(releaseValidity("10")).toBe(24 * 3600);
    expect(releaseValidity("abc")).toBe(24 * 3600);
    expect(releaseValidity("-5")).toBe(24 * 3600);
    expect(releaseValidity(String(30 * 24 * 3600))).toBe(24 * 3600);
  });
});
