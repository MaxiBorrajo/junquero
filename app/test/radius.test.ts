import { describe, expect, it } from "vitest";
import { nextRadius, radiusLabel, RADII_M } from "../src/lib/radius";

describe("radius", () => {
  it("sube y baja por los pasos y se frena en los extremos", () => {
    expect(nextRadius(5000, 1)).toBe(8000);
    expect(nextRadius(5000, -1)).toBe(3000);
    expect(nextRadius(RADII_M[RADII_M.length - 1]!, 1)).toBe(50000);
    expect(nextRadius(500, -1)).toBe(500);
  });

  it("desde un valor intermedio salta al paso siguiente", () => {
    expect(nextRadius(4200, 1)).toBe(5000);
    expect(nextRadius(4200, -1)).toBe(3000);
  });

  it("muestra metros o kilómetros", () => {
    expect(radiusLabel(500)).toBe("500 m");
    expect(radiusLabel(2000)).toBe("2 km");
    expect(radiusLabel(1500)).toBe("1,5 km");
  });
});
