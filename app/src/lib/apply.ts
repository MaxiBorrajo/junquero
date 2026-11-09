import type { Changa, SelfieStatus } from "../api/types";

export type ApplyBlock = "anonymous" | "no-profile" | "selfie" | "own" | "closed";

export interface ApplyContext {
  address: string | null;
  hasProfile: boolean;
  selfieStatus: SelfieStatus | null;
}

export function applyBlock(changa: Pick<Changa, "owner" | "status">, context: ApplyContext): ApplyBlock | null {
  if (!context.address) return "anonymous";
  if (changa.owner.toLowerCase() === context.address.toLowerCase()) return "own";
  if (changa.status !== "open") return "closed";
  if (!context.hasProfile) return "no-profile";
  if (context.selfieStatus !== "approved") return "selfie";
  return null;
}
