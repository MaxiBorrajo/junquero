import { DurableObject } from "cloudflare:workers";
import { ChatRoomCore } from "./chatCore";
import { ChatStore } from "./chatStore";
import type { Env } from "./env";
import { queueNotification } from "./notifications";

interface SocketIdentity {
  address: string;
  applicationId: number;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

export class ChatRoom extends DurableObject<Env> {
  private readonly core: ChatRoomCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const store = new ChatStore(ctx.storage.sql);
    this.core = new ChatRoomCore(
      store,
      env.DB,
      (payload) => {
        for (const socket of ctx.getWebSockets()) socket.send(payload);
      },
      async (applicationId, _sender, counterpart) => {
        const online = ctx
          .getWebSockets()
          .some((socket) => (socket.deserializeAttachment() as SocketIdentity | null)?.address === counterpart);
        if (!online) await queueNotification(env.DB, counterpart, "chat", String(applicationId)).run();
      },
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== "/ws") return this.core.handleHttp(request, nowSeconds());

    const address = request.headers.get("x-address");
    const applicationId = Number(request.headers.get("x-application-id"));
    if (request.headers.get("upgrade") !== "websocket" || !address || !Number.isSafeInteger(applicationId)) {
      return new Response("expected a websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ address, applicationId } satisfies SocketIdentity);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const identity = socket.deserializeAttachment() as SocketIdentity | null;
    if (!identity || typeof raw !== "string" || raw.length > 12_000) return;
    let message: { t?: string; id?: unknown; nonce?: unknown; body?: unknown };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.t === "ping") {
      socket.send(JSON.stringify({ t: "pong" }));
      return;
    }
    if (message.t !== "send") return;
    const outcome = await this.core.send(
      identity.applicationId,
      identity.address,
      { nonce: message.nonce, body: message.body, clientId: message.id },
      nowSeconds(),
    );
    if ("error" in outcome.body) socket.send(JSON.stringify({ t: "error", id: message.id, status: outcome.status, error: outcome.body.error }));
    else socket.send(JSON.stringify({ t: "ack", id: message.id, seq: outcome.body.message.seq }));
  }

  async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    socket.close(code === 1005 ? 1000 : code);
  }
}
