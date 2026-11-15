import { describe, expect, it } from "vitest";
import { formatClock, formatDayLabel, sameDay } from "../src/lib/format";
describe("hora y día de los mensajes", () => {
  const at = (d: number, h: number, m = 0) => Math.floor(new Date(2026, 10, d, h, m).getTime() / 1000);
  it("muestra la hora y el día", () => {
    expect(formatClock(at(15, 16, 5))).toBe("16:05");
    expect(formatDayLabel(at(15, 9), at(15, 20))).toBe("Hoy");
    expect(formatDayLabel(at(14, 23), at(15, 1))).toBe("Ayer");
    expect(formatDayLabel(at(10, 9), at(15, 20))).toMatch(/10/);
    expect(sameDay(at(15, 0, 1), at(15, 23, 59))).toBe(true);
    expect(sameDay(at(14, 23), at(15, 0))).toBe(false);
  });
});
