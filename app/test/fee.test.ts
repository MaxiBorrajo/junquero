import { describe, expect, it } from "vitest";
import { protocolFee } from "../src/chain/fee";

describe("comisión", () => {
  it("aplica porcentaje, piso y tope como el contrato", () => {
    expect(protocolFee(100_000_000n, 100n, 0n, 0n)).toBe(1_000_000n);
    expect(protocolFee(1_000_000n, 100n, 500_000n, 0n)).toBe(500_000n);
    expect(protocolFee(1_000_000_000n, 100n, 0n, 2_000_000n)).toBe(2_000_000n);
    expect(protocolFee(300_000n, 100n, 500_000n, 0n)).toBe(300_000n);
    expect(protocolFee(10n, 0n, 5n, 0n)).toBe(0n);
  });
});
