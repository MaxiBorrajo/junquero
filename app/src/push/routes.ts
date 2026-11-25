export type AppRoute = { pathname: string; params?: Record<string, string> };

export function routeForNotification(kind: string, ref: string): AppRoute {
  if (kind === "case_evidence" && /^\d+$/.test(ref.split(":")[0] ?? "")) return { pathname: "/case/[caseId]", params: { caseId: ref.split(":")[0]! } };
  if (kind === "jury_stake_ready") return { pathname: "/jury-stake" };
  if (kind === "jury_open" || kind === "jury_reveal" || kind === "jury_not_drawn") return { pathname: "/jury-open" };
  const id = ref.split(":")[0] ?? "";
  if (!/^\d+$/.test(id)) return { pathname: "/map" };
  if (kind === "verdict_won" || kind === "verdict_lost") return { pathname: "/case/[caseId]", params: { caseId: id } };
  if (kind === "verdict_jury" || kind === "jury_drawn" || kind === "jury_deadline") return { pathname: "/jury/[caseId]", params: { caseId: id } };
  switch (kind) {
    case "receipt_minted":
      return { pathname: "/receipt/[orderId]", params: { orderId: id } };
    case "application_new":
      return { pathname: "/applications/[changaId]", params: { changaId: ref } };
    case "agreement_proposed":
      return { pathname: "/agreement/[orderId]", params: { orderId: ref } };
    case "agreed":
    case "delivered":
    case "evidence_uploaded":
    case "changes_requested":
    case "checked_in":
    case "settled":
    case "cancelled":
    case "terminated":
    case "reminder_start":
    case "dispute_resolved":
    case "dispute_small":
    case "dispute_opened":
      return { pathname: "/order/[orderId]", params: { orderId: ref } };
    case "chat":
      return { pathname: "/messages" };
    case "selfie_approved":
    case "selfie_rejected":
      return { pathname: "/profile" };
    default:
      return { pathname: "/my-changas" };
  }
}
