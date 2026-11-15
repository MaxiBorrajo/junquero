import { describe, expect, it, vi } from "vitest";
import { isContributionRunning, runInitialContribution, type InitialContributionJob } from "../src/chain/initialContribution";

function job(overrides: Partial<InitialContributionJob> = {}): InitialContributionJob & { calls: string[] } {
  const calls: string[] = [];
  return {
    key: "spec-1",
    waitForGroup: async () => 7,
    contribute: async (orderId) => void calls.push(`contribute:${orderId}`),
    onSuccess: () => void calls.push("success"),
    onFailure: () => void calls.push("failure"),
    ...overrides,
    calls,
  };
}

describe("aporte inicial en segundo plano", () => {
  it("espera al grupo, suma el aporte y avisa", async () => {
    const j = job();
    expect(await runInitialContribution(j)).toBe(true);
    expect(j.calls).toEqual(["contribute:7", "success"]);
    expect(isContributionRunning("spec-1")).toBe(false);
  });

  it("avisa que falló si el grupo no aparece a tiempo, sin intentar aportar", async () => {
    const j = job({ waitForGroup: async () => null });
    expect(await runInitialContribution(j)).toBe(false);
    expect(j.calls).toEqual(["failure"]);
  });

  it("avisa que falló si el aporte falla (firma cancelada o falta de saldo)", async () => {
    const j = job({ contribute: async () => Promise.reject(new Error("User rejected")) });
    expect(await runInitialContribution(j)).toBe(false);
    expect(j.calls).toEqual(["failure"]);
    expect(isContributionRunning("spec-1")).toBe(false);
  });

  it("no corre dos veces el mismo grupo a la vez", async () => {
    let release: (id: number) => void = () => {};
    const slow = job({ waitForGroup: () => new Promise<number>((resolve) => (release = resolve)) });
    const first = runInitialContribution(slow);
    expect(isContributionRunning("spec-1")).toBe(true);
    const second = job();
    expect(await runInitialContribution(second)).toBe(false);
    expect(second.calls).toEqual([]);
    release(9);
    expect(await first).toBe(true);
    expect(slow.calls).toEqual(["contribute:9", "success"]);
  });

  it("deja correr a otro grupo en paralelo", async () => {
    const a = job({ key: "a" });
    const b = job({ key: "b" });
    const results = await Promise.all([runInitialContribution(a), runInitialContribution(b)]);
    expect(results).toEqual([true, true]);
  });
});
