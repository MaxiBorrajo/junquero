import * as SecureStore from "expo-secure-store";

const KEY = "junquero.session";

export interface StoredSession {
  token: string;
  expiresAt: number;
  address: string;
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return typeof parsed.token === "string" && typeof parsed.expiresAt === "number" && typeof parsed.address === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {}
}
