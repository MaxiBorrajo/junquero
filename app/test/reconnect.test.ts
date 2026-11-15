import { describe, expect, it } from "vitest";
import { reconnectDelay } from "../src/chat/reconnect";

describe("reconexión del chat", () => {
  it("espera cada vez más y se detiene en 30 segundos", () => {
    expect([0, 1, 2, 3].map(reconnectDelay)).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(reconnectDelay(10)).toBe(30_000);
    expect(reconnectDelay(-3)).toBe(1_000);
  });
});
