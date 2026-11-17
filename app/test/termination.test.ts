import { describe, expect, it } from "vitest";
import { terminationPreview } from "../src/chain/termination";

const fee = { bps: 100n, floor: 0n, cap: 0n };

describe("terminar sin causa: vista previa", () => {
  it("sin avance, la compensación sale de lo que queda en garantía", () => {
    const r = terminationPreview({ deposited: 40_000_000n, currentAmount: 40_000_000n, progressBps: 0, compBps: 1000n, payeeShareBps: 5000n, fee });
    expect(r.progress).toBe(0n);
    expect(r.compensation).toBe(4_000_000n);
    expect(r.toPayee).toBe(2_000_000n);
    expect(r.refund).toBe(36_000_000n);
  });

  it("con avance paga el proporcional menos la comisión y la parte de la compensación", () => {
    const r = terminationPreview({ deposited: 40_000_000n, currentAmount: 40_000_000n, progressBps: 5000, compBps: 1000n, payeeShareBps: 5000n, fee });
    expect(r.progress).toBe(20_000_000n);
    expect(r.compensation).toBe(2_000_000n);
    expect(r.toPayee).toBe(20_000_000n - 200_000n + 1_000_000n);
    expect(r.refund).toBe(18_000_000n);
  });
});
