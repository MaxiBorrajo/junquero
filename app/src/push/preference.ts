import * as SecureStore from "expo-secure-store";

const KEY = "junquero.push.off";

export async function pushEnabledByUser(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(KEY)) !== "1";
  } catch {
    return true;
  }
}

export async function setPushEnabledByUser(enabled: boolean): Promise<void> {
  try {
    if (enabled) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, "1");
  } catch {}
}
