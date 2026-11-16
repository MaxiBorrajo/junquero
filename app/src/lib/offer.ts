import { toMicro } from "./money";

export type Offer = { ok: true; value: string | null } | { ok: false };

export function parseCounterOffer(input: string, maxMicro?: bigint): Offer {
  const clean = input.trim().replace(",", ".");
  if (clean === "") return { ok: true, value: null };
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(clean)) return { ok: false };
  const micro = toMicro(clean);
  if (micro <= 0n) return { ok: false };
  if (maxMicro !== undefined && micro > maxMicro) return { ok: false };
  return { ok: true, value: micro.toString() };
}

// Una postulación trae una propuesta cuando cambia el plan de hitos o pide un monto distinto al publicado.
export function offerTotal(plan: { milestones: { amount: string }[] } | null | undefined, amount: string | null, published: string | null): bigint | null {
  if (plan && plan.milestones.length > 0) return plan.milestones.reduce((sum, item) => sum + BigInt(item.amount), 0n);
  if (amount !== null && /^\d+$/.test(amount) && amount !== published) return BigInt(amount);
  return null;
}
