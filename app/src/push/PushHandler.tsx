import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { useSession } from "../session/SessionProvider";
import { pushEnabledByUser } from "./preference";
import { registerForPush } from "./register";
import { routeForNotification } from "./routes";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

function open(data: Record<string, unknown> | undefined) {
  const kind = typeof data?.kind === "string" ? data.kind : "";
  const ref = typeof data?.ref === "string" || typeof data?.ref === "number" ? String(data.ref) : "";
  router.push(routeForNotification(kind, ref) as never);
}

export function PushHandler() {
  const { status, api, address, refresh } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== "ready" || !address) return;
    void pushEnabledByUser()
      .then((on) => (on ? registerForPush(api) : undefined))
      .catch(() => {});
  }, [status, api, address]);

  useEffect(() => {
    if (status !== "ready") return;
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void refresh().catch(() => {});
      for (const key of ["notifications", "chats", "applications", "agreements", "changas"]) void queryClient.invalidateQueries({ queryKey: [key] });
    });
    return () => subscription.remove();
  }, [status, refresh, queryClient]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification.request.content.data));
    Notifications.getLastNotificationResponseAsync()
      .then((response) => response && open(response.notification.request.content.data))
      .catch(() => {});
    return () => subscription.remove();
  }, []);

  return null;
}
