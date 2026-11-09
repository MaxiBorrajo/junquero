import * as SecureStore from "expo-secure-store";
import type { SecretStorage } from "./secrets";

const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export const secureSecretStorage: SecretStorage = {
  get: (key) => SecureStore.getItemAsync(safe(key)),
  set: (key, value) => SecureStore.setItemAsync(safe(key), value),
};
