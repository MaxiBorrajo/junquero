export interface DisputeResult {
  payeeShareBps: number;
  byDefault: boolean;
}

export type DisputeOutcomeKey = "payerWon" | "payeeWon" | "split";

// Quién se quedó con el pago en un reclamo: todo para quien pagó (0), todo para quien trabajó (10000) o repartido.
export function disputeOutcomeKey(result: DisputeResult): DisputeOutcomeKey {
  if (result.payeeShareBps <= 0) return "payerWon";
  if (result.payeeShareBps >= 10000) return "payeeWon";
  return "split";
}

// Texto para quien mira el trabajo, según su rol y cómo quedó el reclamo.
export function disputeOutcomeText(
  result: DisputeResult,
  role: "payer" | "payee",
  texts: {
    mine: Record<DisputeOutcomeKey, string>;
    theirs: Record<DisputeOutcomeKey, string>;
    split: string;
    noReplyMine: string;
    noReplyTheirs: string;
  },
): string {
  const key = disputeOutcomeKey(result);
  if (key === "split") return texts.split.replace("{percent}", String(Math.round(result.payeeShareBps / 100))).replace("{rest}", String(100 - Math.round(result.payeeShareBps / 100)));
  const won = (key === "payerWon") === (role === "payer");
  const base = (won ? texts.mine : texts.theirs)[key];
  if (!result.byDefault) return base;
  return `${base} ${won ? texts.noReplyMine : texts.noReplyTheirs}`;
}
