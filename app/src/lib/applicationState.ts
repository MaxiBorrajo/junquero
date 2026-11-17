import type { ApplicationStatus, ChangaStatus } from "../api/types";

export type ApplicationView = "waiting" | "chosen" | "inProgress" | "delivered" | "settled" | "cancelled" | "disputed" | "closed" | "dismissed" | "withdrawn";

// Qué mostrarle a quien se postuló. Si lo eligieron, depende de cómo va el trabajo: no se le dice "ya podés empezar" a quien ya cobró.
export function applicationView(status: ApplicationStatus, job: ChangaStatus): ApplicationView {
  if (status === "chosen") {
    if (job === "agreed") return "inProgress";
    if (job === "delivered") return "delivered";
    if (job === "settled") return "settled";
    if (job === "disputed") return "disputed";
    if (job === "cancelled") return "cancelled";
    return "chosen";
  }
  if (status === "active") return "waiting";
  if (status === "dismissed" || status === "withdrawn") return status;
  return "closed";
}
