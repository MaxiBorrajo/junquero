import { describe, expect, it } from "vitest";
import { disputeOutcomeKey, disputeOutcomeText } from "../src/lib/disputeOutcome";

const texts = {
  mine: { payerWon: "gané y me devolvieron", payeeWon: "gané y cobré", split: "" },
  theirs: { payerWon: "perdí, no cobré", payeeWon: "perdí, cobró el otro", split: "" },
  split: "{percent}% y {rest}%",
  noReplyMine: "No contestó.",
  noReplyTheirs: "No contesté.",
};

describe("resultado de un reclamo", () => {
  it("dice quién se quedó con el pago", () => {
    expect(disputeOutcomeKey({ payeeShareBps: 0, byDefault: false })).toBe("payerWon");
    expect(disputeOutcomeKey({ payeeShareBps: 10000, byDefault: false })).toBe("payeeWon");
    expect(disputeOutcomeKey({ payeeShareBps: 5000, byDefault: false })).toBe("split");
  });

  it("lo cuenta según el rol de quien mira y aclara si fue por falta de respuesta", () => {
    const lost = { payeeShareBps: 0, byDefault: true };
    expect(disputeOutcomeText(lost, "payer", texts)).toBe("gané y me devolvieron No contestó.");
    expect(disputeOutcomeText(lost, "payee", texts)).toBe("perdí, no cobré No contesté.");
    expect(disputeOutcomeText({ payeeShareBps: 10000, byDefault: false }, "payee", texts)).toBe("gané y cobré");
    expect(disputeOutcomeText({ payeeShareBps: 7000, byDefault: false }, "payer", texts)).toBe("70% y 30%");
  });
});
