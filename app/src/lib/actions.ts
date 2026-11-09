import { OrderStatus } from "../chain/orderAbi";

export type Role = "payer" | "payee" | "viewer";

export type OrderView =
  | "worker-working"
  | "worker-waiting-review"
  | "payer-waiting-work"
  | "payer-reviewing"
  | "disputed"
  | "settled"
  | "cancelled"
  | "other";

export function roleOf(order: { payer: string; payee: string }, address: string | null): Role {
  if (!address) return "viewer";
  const me = address.toLowerCase();
  if (order.payee.toLowerCase() === me) return "payee";
  if (order.payer.toLowerCase() === me) return "payer";
  return "viewer";
}

export function viewFor(status: number, role: Role): OrderView {
  switch (status) {
    case OrderStatus.Agreed:
      return role === "payee" ? "worker-working" : role === "payer" ? "payer-waiting-work" : "other";
    case OrderStatus.Delivered:
      return role === "payee" ? "worker-waiting-review" : role === "payer" ? "payer-reviewing" : "other";
    case OrderStatus.Disputed:
      return "disputed";
    case OrderStatus.Settled:
      return "settled";
    case OrderStatus.Cancelled:
      return "cancelled";
    default:
      return "other";
  }
}

export function canFinish(evidenceCount: number, hasMilestones: boolean, isGroup: boolean): boolean {
  return evidenceCount > 0 && !hasMilestones && !isGroup;
}

export function autoReleaseAt(deliveredAt: number, windowSeconds = 24 * 3600): number {
  return deliveredAt + windowSeconds;
}
