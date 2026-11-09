import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Api } from "../api/client";

export type PushOutcome = "registered" | "denied" | "unsupported" | "no-project";

export async function registerForPush(api: Api): Promise<PushOutcome> {
  if (!Device.isDevice) return "unsupported";
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return "no-project";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Avisos", importance: Notifications.AndroidImportance.HIGH });
  }
  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return "denied";

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.send("PUT", "/me/push-token", { token: data, platform: Platform.OS === "ios" ? "ios" : "android" });
  return "registered";
}

export async function unregisterPush(api: Api): Promise<void> {
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.send("DELETE", "/me/push-token", { token: data });
  } catch {}
}
