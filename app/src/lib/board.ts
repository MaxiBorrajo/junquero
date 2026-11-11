import { MilestoneStatus } from "../chain/milestones";

export type BoardAction = "deliver" | "wait-review" | "review" | "wait-delivery" | "none";

export interface BoardState {
  next: number;
  count: number;
  milestones: { status: number }[];
}

export function boardAction(state: BoardState, role: "payer" | "payee" | "viewer"): BoardAction {
  if (state.next >= state.count) return "none";
  const current = state.milestones[state.next]?.status;
  if (role === "payee") {
    if (current === MilestoneStatus.Pending) return "deliver";
    if (current === MilestoneStatus.Delivered) return "wait-review";
  }
  if (role === "payer") {
    if (current === MilestoneStatus.Delivered) return "review";
    if (current === MilestoneStatus.Pending) return "wait-delivery";
  }
  return "none";
}

export const paidCount = (milestones: { status: number }[]): number => milestones.filter((item) => item.status === MilestoneStatus.Paid).length;

export const allPaid = (milestones: { status: number }[]): boolean => milestones.length > 0 && paidCount(milestones) === milestones.length;
