import { describe, expect, it } from "vitest";
import { lastPickableDay, startOfDay, withDay, withTime } from "../src/lib/datetime";

const parts = (seconds: number): number[] => {
  const d = new Date(seconds * 1000);
  return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()];
};

describe("datetime", () => {
  it("al elegir el día sin hora previa usa las 9", () => {
    expect(parts(withDay(null, new Date(2026, 11, 3)))).toEqual([2026, 11, 3, 9, 0]);
  });

  it("al cambiar el día conserva la hora elegida", () => {
    const first = withTime(null, new Date(2026, 0, 1, 17, 45), new Date(2026, 10, 9));
    expect(parts(withDay(first, new Date(2027, 1, 20)))).toEqual([2027, 1, 20, 17, 45]);
  });

  it("al elegir la hora sin día previo usa hoy", () => {
    expect(parts(withTime(null, new Date(2026, 0, 1, 8, 5), new Date(2026, 10, 9, 22, 0)))).toEqual([2026, 10, 9, 8, 5]);
  });

  it("al cambiar la hora conserva el día elegido", () => {
    const day = withDay(null, new Date(2026, 11, 24));
    expect(parts(withTime(day, new Date(2026, 0, 1, 20, 30), new Date(2026, 10, 9)))).toEqual([2026, 11, 24, 20, 30]);
  });

  it("permite elegir hasta un año adelante sin quedar atado al mes actual", () => {
    const today = new Date(2026, 10, 9, 15, 0);
    expect(startOfDay(today).getHours()).toBe(0);
    expect(lastPickableDay(today).getTime()).toBeGreaterThan(new Date(2027, 9, 1).getTime());
  });
});
