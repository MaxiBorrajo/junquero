import type { CaseRef } from "../data/useCases";

export interface DisputeInfo {
  orderId: number;
  open: boolean;
  // Si el reclamo lo abrió quien mira (true) o se lo abrieron (false).
  byMe: boolean;
}

// Un trabajo puede tener varios reclamos (uno por hito): se queda con uno solo, abierto si hay alguno abierto.
export function disputesByOrder(cases: CaseRef[], address: string | null): Map<number, DisputeInfo> {
  const result = new Map<number, DisputeInfo>();
  const me = (address ?? "").toLowerCase();
  for (const item of [...cases].sort((a, b) => a.caseId - b.caseId)) {
    const open = !item.resolved;
    const previous = result.get(item.orderId);
    if (previous && previous.open && !open) continue;
    result.set(item.orderId, { orderId: item.orderId, open, byMe: Boolean(item.claimant) && item.claimant!.toLowerCase() === me });
  }
  return result;
}

export type DisputeFilter = "all" | "open" | "byMe" | "byThem";

export const matchesDisputeFilter = (info: DisputeInfo, filter: DisputeFilter): boolean =>
  filter === "all" || (filter === "open" && info.open) || (filter === "byMe" && info.byMe) || (filter === "byThem" && !info.byMe);
