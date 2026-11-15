import { describe, expect, it } from "vitest";
import { clearCounterpartKeys, fetchCounterpartKey } from "../src/crypto/keyManager";
import type { Api } from "../src/api/client";

const key = "ab".repeat(32);

describe("clave de la otra persona", () => {
  it("se pide una sola vez aunque varias pantallas la pidan a la vez", async () => {
    clearCounterpartKeys();
    let calls = 0;
    const api = { get: async () => { calls += 1; return { publicKey: key }; } } as unknown as Api;
    const [a, b] = await Promise.all([fetchCounterpartKey(api, "0xAA"), fetchCounterpartKey(api, "0xaa")]);
    await fetchCounterpartKey(api, "0xaa");
    expect(calls).toBe(1);
    expect(a?.[0]).toBe(0xab);
    expect(b).toBe(a);
  });

  it("si todavía no tiene clave no se recuerda el fracaso", async () => {
    clearCounterpartKeys();
    let calls = 0;
    const api = { get: async () => { calls += 1; throw new Error("404"); } } as unknown as Api;
    expect(await fetchCounterpartKey(api, "0xbb")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await fetchCounterpartKey(api, "0xbb")).toBeNull();
    expect(calls).toBe(2);
  });
});
