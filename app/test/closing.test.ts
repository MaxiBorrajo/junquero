import { describe, expect, it } from "vitest";
import { ratingSummary, ratingWord, receiptDate, receiptMonthLabel } from "../src/lib/closing";
import { encodeClaimReceipt } from "../src/chain/receipt";
import { t } from "../src/i18n";

describe("cierre de un trabajo", () => {
  it("el mes del comprobante se lee en español", () => {
    const label = receiptMonthLabel(202611);
    expect(label).toContain("noviembre");
    expect(label).toContain("2026");
    expect(receiptMonthLabel(202601)).toContain("enero");
  });

  it("la medalla muestra el día de cierre y, si falta, el mes", () => {
    expect(receiptDate({ closedAt: Date.UTC(2026, 10, 16, 15) / 1000, month: 202611 })).toMatch(/16.*nov.*2026/);
    expect(receiptDate({ closedAt: null, month: 202611 })).toContain("noviembre");
  });

  it("una calificación única o el promedio de los hitos", () => {
    expect(ratingSummary([])).toEqual({ lines: [], average: null });
    expect(ratingSummary([{ index: null, rating: 4 }]).average).toBe(4);
    expect(ratingSummary([{ index: 0, rating: 5 }, { index: 1, rating: 4 }]).average).toBe(4.5);
  });

  it("la calificación tiene su palabra", () => {
    expect(ratingWord(5, t.order.ratingLabels)).toBe("Muy bien");
    expect(ratingWord(1, t.order.ratingLabels)).toBe("Muy mal");
    expect(ratingWord(4.5, t.order.ratingLabels)).toBe("Muy bien");
  });

  it("reclamar el comprobante llama a claim con el número de pedido", () => {
    const data = encodeClaimReceipt(7n);
    expect(data.startsWith("0x379607f5")).toBe(true);
    expect(data.endsWith("7".padStart(64, "0"))).toBe(true);
  });
});
