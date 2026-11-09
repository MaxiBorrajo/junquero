export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_BATCH = 100;
const TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,60}\]$/;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { kind: string; ref: string };
  priority: "default" | "high";
  sound: "default";
  channelId: "default";
}

export interface PushTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export const isExpoToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);

export async function sendBatch(fetcher: Fetcher, messages: PushMessage[]): Promise<PushTicket[] | null> {
  try {
    const response = await fetcher(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as { data?: PushTicket[] };
    return Array.isArray(parsed.data) && parsed.data.length === messages.length ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function sendAll(fetcher: Fetcher, messages: PushMessage[]): Promise<(PushTicket | null)[]> {
  const tickets: (PushTicket | null)[] = [];
  for (let start = 0; start < messages.length; start += EXPO_BATCH) {
    const chunk = messages.slice(start, start + EXPO_BATCH);
    const answered = await sendBatch(fetcher, chunk);
    tickets.push(...(answered ?? chunk.map(() => null)));
  }
  return tickets;
}
