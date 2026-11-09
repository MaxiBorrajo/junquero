import { describe, expect, it } from "vitest";
import { allowed, clientKey } from "../src/guard";
import { TtlCache } from "../src/ttlCache";

describe("guard", () => {
  it("uses the connecting ip as key", () => {
    expect(clientKey(new Headers({ "cf-connecting-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientKey(new Headers())).toBe("unknown");
  });

  it("blocks when the limiter refuses and allows when it is absent", async () => {
    const seen: string[] = [];
    const limiter = {
      limit: async ({ key }: { key: string }) => {
        seen.push(key);
        return { success: false };
      },
    };
    expect(await allowed(limiter, "a")).toBe(false);
    expect(seen).toEqual(["a"]);
    expect(await allowed(undefined, "a")).toBe(true);
  });
});

describe("TtlCache", () => {
  it("returns a value until it expires", () => {
    const cache = new TtlCache<string>(1000, 10);
    cache.set("k", "v", 0);
    expect(cache.get("k", 999)).toBe("v");
    expect(cache.get("k", 1000)).toBeUndefined();
  });

  it("never grows past its limit and drops the oldest entry first", () => {
    const cache = new TtlCache<number>(10_000, 3);
    for (let i = 0; i < 6; i++) cache.set(`k${i}`, i, i);
    expect(cache.get("k0", 10)).toBeUndefined();
    expect(cache.get("k5", 10)).toBe(5);
    let present = 0;
    for (let i = 0; i < 6; i++) if (cache.get(`k${i}`, 10) !== undefined) present += 1;
    expect(present).toBe(3);
  });

  it("replaces an existing key without evicting others", () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("a", 3, 1);
    expect(cache.get("a", 2)).toBe(3);
    expect(cache.get("b", 2)).toBe(2);
  });
});
