export type CancelCase = "cash" | "early" | "late";

// Lo que cuesta cancelar un trabajo ya acordado (misma regla que el contrato): en efectivo no se cobra; con tiempo de aviso
// (faltan al menos `notice` segundos para el inicio, o sin fecha de inicio, dentro de ese período desde el acuerdo) es el 2%
// para el tesoro; si no, el 10%, con la mayor parte para quien iba a trabajar.
export function cancelCase(order: { startsAt: number; agreedAt: number; cash: boolean }, now: number, notice: number): CancelCase {
  if (order.cash) return "cash";
  const early = order.startsAt !== 0 ? now + notice <= order.startsAt : now <= order.agreedAt + notice;
  return early ? "early" : "late";
}

export interface CancelRulesInput {
  applicantBps: bigint;
  agreedBps: bigint;
  payeeShareBps: bigint;
  minFee: bigint;
  maxFee: bigint;
}

export interface CancelAmounts {
  toPayee: bigint;
  toTreasury: bigint;
  refund: bigint;
}

// Cómo se mueve la plata al cancelar (misma cuenta que el contrato): con aviso el cobro (porcentaje con mínimo y tope) va entero al tesoro;
// si no, el porcentaje del precio se reparte entre quien iba a trabajar y el tesoro. Lo demás vuelve a quien publicó.
export function cancelAmounts(kind: CancelCase, order: { price: bigint; deposited: bigint }, rules: CancelRulesInput): CancelAmounts {
  if (kind === "cash") return { toPayee: 0n, toTreasury: 0n, refund: order.deposited };
  if (kind === "early") {
    if (rules.applicantBps === 0n) return { toPayee: 0n, toTreasury: 0n, refund: order.deposited };
    let fee = (order.price * rules.applicantBps) / 10_000n;
    if (fee < rules.minFee) fee = rules.minFee;
    if (rules.maxFee !== 0n && fee > rules.maxFee) fee = rules.maxFee;
    if (fee > order.price) fee = order.price;
    return { toPayee: 0n, toTreasury: fee, refund: order.deposited - fee };
  }
  const total = (order.price * rules.agreedBps) / 10_000n;
  const toPayee = (total * rules.payeeShareBps) / 10_000n;
  return { toPayee, toTreasury: total - toPayee, refund: order.deposited - total };
}
