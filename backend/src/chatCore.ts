import { recordMessage, resolveChatAccess } from "./chatAccess";
import { ChatStore, HISTORY_DEFAULT, type AppendResult, type ChatMessage, type SendInput } from "./chatStore";

export interface SendOutcome {
  status: number;
  body: { message: ChatMessage; duplicate: boolean } | { error: string };
}

export class ChatRoomCore {
  constructor(
    private readonly store: ChatStore,
    private readonly db: D1Database,
    private readonly broadcast: (payload: string) => void,
    private readonly onNewMessage: (applicationId: number, sender: string) => Promise<void> = async () => {},
  ) {}

  async send(applicationId: number, address: string, input: SendInput, nowSeconds: number): Promise<SendOutcome> {
    const access = await resolveChatAccess(this.db, applicationId, address);
    if (!access.ok) return { status: access.status, body: { error: access.error } };
    if (!access.access.writable) return { status: 403, body: { error: "chat is read-only" } };

    const result: AppendResult = this.store.append(address, input, nowSeconds);
    if (!result.ok) return { status: result.status, body: { error: result.error } };
    if (!result.duplicate) {
      this.broadcast(JSON.stringify({ t: "message", message: result.message }));
      await recordMessage(this.db, applicationId, address, result.message.seq, nowSeconds);
      await this.onNewMessage(applicationId, address);
    }
    return { status: result.duplicate ? 200 : 201, body: { message: result.message, duplicate: result.duplicate } };
  }

  async handleHttp(request: Request, nowSeconds: number): Promise<Response> {
    const url = new URL(request.url);
    const address = request.headers.get("x-address") ?? "";
    const applicationId = Number(request.headers.get("x-application-id"));
    if (!address || !Number.isSafeInteger(applicationId) || applicationId <= 0) {
      return Response.json({ error: "missing identity" }, { status: 400 });
    }

    if (url.pathname === "/history" && request.method === "GET") {
      const after = Number(url.searchParams.get("after") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? HISTORY_DEFAULT);
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit)) {
        return Response.json({ error: "invalid range" }, { status: 400 });
      }
      return Response.json({ messages: this.store.history(after, limit) });
    }

    if (url.pathname === "/send" && request.method === "POST") {
      let input: SendInput;
      try {
        input = (await request.json()) as SendInput;
      } catch {
        return Response.json({ error: "invalid json" }, { status: 400 });
      }
      const outcome = await this.send(applicationId, address, input ?? ({} as SendInput), nowSeconds);
      return Response.json(outcome.body, { status: outcome.status });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  }
}
