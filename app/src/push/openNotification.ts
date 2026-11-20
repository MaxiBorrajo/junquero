import { router } from "expo-router";
import { setViewMode } from "../session/viewMode";
import { routeForNotification } from "./routes";

// Las notificaciones de jurado se abren en la vista de jurado, aunque la persona esté usando la app como Junquero.
export const isJuryKind = (kind: string): boolean => kind.startsWith("jury_");

export function openNotification(kind: string, ref: string): void {
  if (isJuryKind(kind)) setViewMode("jury", false);
  router.push(routeForNotification(kind, ref) as never);
}
