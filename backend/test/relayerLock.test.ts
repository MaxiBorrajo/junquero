import { describe, expect, it } from "vitest";
import { LeaseMutex } from "../src/mutex";
import { noLock, relayerLock } from "../src/relayerLock";

describe("fila única del relayer", () => {
  it("atiende de a uno y en orden", async () => {
    const mutex = new LeaseMutex(5_000);
    const order: string[] = [];
    const run = async (name: string, ms: number) => {
      await mutex.acquire(name);
      order.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      order.push(`${name}:end`);
      mutex.release(name);
    };
    await Promise.all([run("a", 20), run("b", 5), run("c", 1)]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("si quien lo tiene no lo devuelve, el turno se libera solo al vencer el préstamo", async () => {
    let now = 0;
    const mutex = new LeaseMutex(50, () => now);
    await mutex.acquire("colgado");
    const waiting = mutex.acquire("siguiente").then(() => "ok");
    now = 100;
    expect(await waiting).toBe("ok");
    expect(mutex.release("colgado")).toBe(false);
    expect(mutex.release("siguiente")).toBe(true);
  });

  it("envuelve el trabajo con pedir y devolver el turno, también si falla", async () => {
    const calls: string[] = [];
    const gate = {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (url: string) => {
          calls.push(url.split("/").pop() as string);
          return Response.json({ token: "t1" });
        },
      }),
    } as unknown as DurableObjectNamespace;
    const lock = relayerLock({ RELAYER_GATE: gate });
    expect(await lock(async () => { calls.push("work"); return 7; })).toBe(7);
    await expect(lock(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(calls).toEqual(["acquire", "work", "release", "acquire", "release"]);
  });

  it("sin fila configurada ejecuta directo", async () => {
    expect(await relayerLock({})(async () => 3)).toBe(3);
    expect(await noLock(async () => 4)).toBe(4);
  });
});
