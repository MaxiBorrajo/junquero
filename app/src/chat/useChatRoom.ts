import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config";
import { open, seal, type ChatKeyPair } from "../crypto/chat";
import { fetchCounterpartKey } from "../crypto/keyManager";
import { useSession } from "../session/SessionProvider";
import { useChatKey } from "./ChatKeyProvider";
import { addPending, applyServer, dropPending, emptyChat, failPending, lastSeq, newClientId, retryPending, viewOf, type ChatMessageView, type ChatState, type ServerMessage } from "./state";

export type RoomStatus = "loading" | "ready" | "no-counterpart-key" | "key-denied" | "error";

const POLL_MS = 12_000;
const WS_URL = API_URL.replace(/^http/, "ws");

export function useChatRoom(applicationId: number, counterpart: string) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [state, setState] = useState<ChatState>(emptyChat);
  const [writable, setWritable] = useState(true);
  const keys = useRef<{ mine: ChatKeyPair; theirs: Uint8Array } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const socket = useRef<WebSocket | null>(null);

  const decrypt = useCallback((message: ServerMessage): string | null => {
    const k = keys.current;
    return k ? open({ nonce: message.nonce, body: message.body }, k.theirs, k.mine) : null;
  }, []);

  const merge = useCallback(
    (messages: ServerMessage[]) => {
      if (!address || messages.length === 0) return;
      setState((current) => applyServer(current, messages, address, decrypt));
    },
    [address, decrypt],
  );

  const markRead = useCallback(
    (seq: number) => {
      if (seq > 0) void api.send("POST", `/me/chats/${applicationId}/read`, { seq }).catch(() => {});
    },
    [api, applicationId],
  );

  const pull = useCallback(async () => {
    const result = await api.get<{ messages: ServerMessage[]; writable: boolean }>(`/me/chats/${applicationId}/messages?after=${lastSeq(stateRef.current)}&limit=200`);
    setWritable(result.writable);
    merge(result.messages);
  }, [api, applicationId, merge]);

  const start = useCallback(async () => {
    setStatus("loading");
    try {
      const mine = await ensure().catch(() => null);
      if (!mine) {
        setStatus("key-denied");
        return;
      }
      const theirs = await fetchCounterpartKey(api, counterpart);
      if (!theirs) {
        setStatus("no-counterpart-key");
        return;
      }
      keys.current = { mine, theirs };
      await pull();
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [api, counterpart, ensure, pull]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (status !== "ready") return;
    let closed = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      if (timer === null) timer = setInterval(() => void pull().catch(() => {}), POLL_MS);
    };

    (async () => {
      try {
        const { ticket } = await api.send<{ ticket: string }>("POST", `/me/chats/${applicationId}/ticket`);
        if (closed) return;
        const ws = new WebSocket(`${WS_URL}/chat/${applicationId}/ws?ticket=${encodeURIComponent(ticket)}`);
        socket.current = ws;
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as { t: string; message?: ServerMessage };
            if (data.t === "message" && data.message) merge([data.message]);
          } catch {}
        };
        ws.onclose = poll;
        ws.onerror = poll;
      } catch {
        poll();
      }
    })();

    return () => {
      closed = true;
      if (timer) clearInterval(timer);
      socket.current?.close();
      socket.current = null;
    };
  }, [status, api, applicationId, merge, pull]);

  const view = viewOf(state);
  const newest = lastSeq(state);
  const lastFromOther = view.filter((m) => m.seq !== null && !m.mine).at(-1)?.seq ?? 0;
  useEffect(() => {
    if (status === "ready" && lastFromOther > 0) markRead(newest);
  }, [status, newest, lastFromOther, markRead]);

  const deliver = useCallback(
    async (clientId: string, text: string) => {
      const k = keys.current;
      if (!k) return;
      const sealed = seal(text, k.theirs, k.mine);
      try {
        const result = await api.send<{ message: ServerMessage }>("POST", `/me/chats/${applicationId}/messages`, { ...sealed, clientId });
        merge([result.message]);
      } catch {
        setState((current) => failPending(current, clientId));
      }
    },
    [api, applicationId, merge],
  );

  const send = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const clientId = newClientId((n) => crypto.getRandomValues(new Uint8Array(n)));
      setState((current) => addPending(current, clientId, clean, Math.floor(Date.now() / 1000)));
      void deliver(clientId, clean);
    },
    [deliver],
  );

  const retry = useCallback(
    (message: ChatMessageView) => {
      if (message.text === null) return;
      setState((current) => retryPending(current, message.clientId));
      void deliver(message.clientId, message.text);
    },
    [deliver],
  );

  const discard = useCallback((message: ChatMessageView) => setState((current) => dropPending(current, message.clientId)), []);

  return { status, view, writable, send, retry, discard, reload: start };
}
