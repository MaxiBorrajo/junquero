import { describe, expect, it } from "vitest";
import { RELAYER_EMPTY_WEI, RELAYER_LOW_WEI, readRelayerHealth, relayerLevel } from "../src/relayerHealth";

const KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6";

describe("estado del relayer", () => {
  it("clasifica el saldo en ok, bajo y vacío", () => {
    expect(relayerLevel(RELAYER_LOW_WEI)).toBe("ok");
    expect(relayerLevel(RELAYER_LOW_WEI - 1n)).toBe("low");
    expect(relayerLevel(RELAYER_EMPTY_WEI)).toBe("low");
    expect(relayerLevel(RELAYER_EMPTY_WEI - 1n)).toBe("empty");
    expect(relayerLevel(0n)).toBe("empty");
  });

  it("devuelve la dirección, el saldo y el nivel", async () => {
    const health = await readRelayerHealth("http://unused", KEY, async () => 0n);
    expect(health.level).toBe("empty");
    expect(health.balanceWei).toBe("0");
    expect(health.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("si no puede leer el saldo lo dice y no inventa un nivel", async () => {
    const health = await readRelayerHealth("http://unused", KEY, async () => {
      throw new Error("rpc caído");
    });
    expect(health.level).toBe("unknown");
    expect(health.balanceWei).toBeNull();
  });
});
