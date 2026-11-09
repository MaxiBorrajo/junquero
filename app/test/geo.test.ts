import { describe, expect, it } from "vitest";
import { approximateCenter, circlePolygon, distanceM } from "../src/lib/geo";
import { fromHex, toHex } from "../src/lib/hex";
import { isValidName, normalizeName } from "../src/lib/validation";

const origin = { lat: -34.6037, lng: -58.3816 };

describe("geo", () => {
  it("distanceM mide metros", () => {
    expect(distanceM(origin, { lat: origin.lat + 0.001, lng: origin.lng })).toBeGreaterThan(110);
    expect(distanceM(origin, { lat: origin.lat + 0.001, lng: origin.lng })).toBeLessThan(112);
    expect(distanceM(origin, origin)).toBe(0);
  });

  it("el polígono cierra y todos sus puntos están al radio pedido", () => {
    const ring = circlePolygon(origin, 1000).geometry.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lng, lat] of ring) expect(Math.abs(distanceM(origin, { lat: lat!, lng: lng! }) - 1000)).toBeLessThan(1);
  });

  it("el centro aproximado queda desplazado dentro del rango y no coincide con el real", () => {
    for (const seed of [0, 0.25, 0.5, 0.99]) {
      const values = [seed, 1 - seed];
      let i = 0;
      const moved = approximateCenter(origin, () => values[i++ % 2]!);
      const d = distanceM(origin, moved);
      expect(d).toBeGreaterThanOrEqual(39);
      expect(d).toBeLessThanOrEqual(151);
    }
  });
});

describe("hex", () => {
  it("ida y vuelta", () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(toHex(bytes)).toBe("0001feff");
    expect(Array.from(fromHex("0x0001feff"))).toEqual([0, 1, 254, 255]);
  });
  it("rechaza hex inválido", () => {
    expect(() => fromHex("abc")).toThrow();
    expect(() => fromHex("zz")).toThrow();
  });
});

describe("validation", () => {
  it("normaliza espacios y valida largo", () => {
    expect(normalizeName("  Ana   María ")).toBe("Ana María");
    expect(isValidName("A")).toBe(false);
    expect(isValidName("  ")).toBe(false);
    expect(isValidName("Ana")).toBe(true);
    expect(isValidName("x".repeat(41))).toBe(false);
  });
});
