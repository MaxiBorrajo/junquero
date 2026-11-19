import { describe, expect, it } from "vitest";
import { cancelAmounts, cancelCase } from "../src/lib/cancelCost";

const DAY = 24 * 3600;

describe("costo de cancelar un trabajo acordado", () => {
  it("con 24 horas o más antes del inicio cuesta el 2%", () => {
    expect(cancelCase({ startsAt: 1000 + DAY, agreedAt: 0, cash: false }, 1000, DAY)).toBe("early");
  });
  it("con menos de 24 horas o ya comenzado es tardía", () => {
    expect(cancelCase({ startsAt: 1000 + DAY - 1, agreedAt: 0, cash: false }, 1000, DAY)).toBe("late");
    expect(cancelCase({ startsAt: 500, agreedAt: 0, cash: false }, 1000, DAY)).toBe("late");
  });
  it("sin fecha de inicio cuenta desde el acuerdo", () => {
    expect(cancelCase({ startsAt: 0, agreedAt: 1000, cash: false }, 1000 + DAY, DAY)).toBe("early");
    expect(cancelCase({ startsAt: 0, agreedAt: 1000, cash: false }, 1001 + DAY, DAY)).toBe("late");
  });
  it("en efectivo no se cobra", () => {
    expect(cancelCase({ startsAt: 0, agreedAt: 0, cash: true }, 99999999, DAY)).toBe("cash");
  });
});

describe("cómo se mueve la plata al cancelar", () => {
  const rules = { applicantBps: 200n, agreedBps: 1000n, payeeShareBps: 8000n, minFee: 500_000n, maxFee: 10_000_000n };
  const order = (price: bigint) => ({ price, deposited: price });

  it("tardía: el 10% se reparte 80/20 y lo demás vuelve", () => {
    expect(cancelAmounts("late", order(150_000_000n), rules)).toEqual({ toPayee: 12_000_000n, toTreasury: 3_000_000n, refund: 135_000_000n });
  });
  it("con aviso: el 2% va entero al tesoro", () => {
    expect(cancelAmounts("early", order(100_000_000n), rules)).toEqual({ toPayee: 0n, toTreasury: 2_000_000n, refund: 98_000_000n });
  });
  it("con aviso respeta el mínimo y el tope", () => {
    expect(cancelAmounts("early", order(5_000_000n), rules).toTreasury).toBe(500_000n);
    expect(cancelAmounts("early", order(1_000_000_000n), rules).toTreasury).toBe(10_000_000n);
  });
  it("con el cobro apagado o en efectivo todo vuelve", () => {
    expect(cancelAmounts("early", order(100_000_000n), { ...rules, applicantBps: 0n }).refund).toBe(100_000_000n);
    expect(cancelAmounts("cash", order(100_000_000n), rules).refund).toBe(100_000_000n);
  });
});
