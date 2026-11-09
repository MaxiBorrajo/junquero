export type AppRoute = { pathname: string; params?: Record<string, string> };

export function routeForNotification(kind: string, ref: string): AppRoute {
  const id = ref.split(":")[0] ?? "";
  if (!/^\d+$/.test(id)) return { pathname: "/map" };
  if (kind === "jury_drawn" || kind === "jury_deadline") return { pathname: "/jury/[caseId]", params: { caseId: id } };
  switch (kind) {
    case "application_new":
      return { pathname: "/applications/[changaId]", params: { changaId: ref } };
    case "agreement_proposed":
      return { pathname: "/agreement/[orderId]", params: { orderId: ref } };
    case "agreed":
    case "delivered":
    case "settled":
    case "cancelled":
    case "reminder_start":
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
