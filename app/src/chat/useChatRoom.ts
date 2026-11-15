import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../config";
import { open, pairFromSecretHex, publicKeyHex, seal, type ChatKeyPair } from "../crypto/chat";
import { decryptFile, encryptFile } from "../crypto/chatFile";
import { readBytes, uploadBytes } from "../lib/files";
import type { PickedFile } from "../lib/pick";
import { encodeEnvelope, type ChatFile } from "./envelope";
import { fetchCounterpartKey } from "../crypto/keyManager";
import { secureKeyStorage } from "../crypto/secureKeyStorage";
import { useSession } from "../session/SessionProvider";
import { useChatKey } from "./ChatKeyProvider";
import { addPending, applyServer, dropPending, emptyChat, failPending, lastSeq, newClientId, retryPending, viewOf, type ChatMessageView, type ChatState, type ServerMessage } from "./state";

export type RoomStatus = "loading" | "needs-activation" | "ready" | "no-counterpart-key" | "key-denied" | "error";

export interface RoomAccess {
  role: "owner" | "applicant";
  waitingForOwner: boolean;
  contactsAllowed: boolean;
  applicationMessage: string;
  changaId: number;
  specHash: string;
}

const NO_ACCESS: RoomAccess = { role: "owner", waitingForOwner: false, contactsAllowed: false, applicationMessage: "", changaId: 0, specHash: "" };

// ¿Este celular ya tiene la clave de chat creada y registrada? Si no, hay que explicarle al usuario antes de pedirle la firma.
async function hasActiveKey(address: string): Promise<boolean> {
  try {
    const secret = await secureKeyStorage.getSecret(address.toLowerCase());
    if (!secret) return false;
    return await secureKeyStorage.isRegistered(address.toLowerCase(), publicKeyHex(pairFromSecretHex(secret)));
  } catch {
    return false;
  }
}

const POLL_MS = 12_000;
const WS_URL = API_URL.replace(/^http/, "ws");

export function useChatRoom(applicationId: number, counterpart: string) {
  const { api, address } = useSession();
  const { ensure } = useChatKey();
  const [status, setStatus] = useState<RoomStatus>("loading");
  const [state, setState] = useState<ChatState>(emptyChat);
  const [writable, setWritable] = useState(true);
  const [access, setAccess] = useState<RoomAccess>(NO_ACCESS);
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
    const result = await api.get<{ messages: ServerMessage[]; writable: boolean } & RoomAccess>(`/me/chats/${applicationId}/messages?after=${lastSeq(stateRef.current)}&limit=200`);
    setWritable(result.writable);
    setAccess({ role: result.role, waitingForOwner: result.waitingForOwner, contactsAllowed: result.contactsAllowed, applicationMessage: result.applicationMessage, changaId: result.changaId, specHash: result.specHash });
    merge(result.messages);
  }, [api, applicationId, merge]);

  const start = useCallback(async (confirmed = false) => {
    setStatus("loading");
    try {
      if (!confirmed && address && !(await hasActiveKey(address))) {
        setStatus("needs-activation");
        return;
      }
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
  }, [api, address, counterpart, ensure, pull]);

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
            if (data.t === "message" && data.message) {
              merge([data.message]);
              // Si contestó la otra persona puede haberse abierto el chat: se vuelve a leer el estado.
              if (data.message.sender.toLowerCase() !== address?.toLowerCase()) void pull().catch(() => {});
            }
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
  }, [status, api, applicationId, address, merge, pull]);

  const view = viewOf(state);
  const newest = lastSeq(state);
  const lastFromOther = view.filter((m) => m.seq !== null && !m.mine).at(-1)?.seq ?? 0;
  useEffect(() => {
    if (status === "ready" && lastFromOther > 0) markRead(newest);
  }, [status, newest, lastFromOther, markRead]);

  // Lo que hace falta para reintentar un mensaje que no salió (con sus adjuntos).
  const outbox = useRef(new Map<string, { text: string; picks: PickedFile[] }>());

  const deliver = useCallback(
    async (clientId: string, text: string, picks: PickedFile[]) => {
      const k = keys.current;
      if (!k) return;
      try {
        const files: ChatFile[] = [];
        for (const pick of picks) {
          const bytes = await readBytes(pick.uri);
          const encrypted = encryptFile(bytes);
          const uploaded = await uploadBytes(api, `/me/chats/${applicationId}/files`, encrypted.cipher, "application/octet-stream");
          files.push({ hash: uploaded.hash, name: pick.name, mime: pick.mime, size: bytes.byteLength, key: encrypted.key, nonce: encrypted.nonce });
        }
        const sealed = seal(encodeEnvelope(text, files), k.theirs, k.mine);
        const result = await api.send<{ message: ServerMessage }>("POST", `/me/chats/${applicationId}/messages`, { ...sealed, clientId });
        outbox.current.delete(clientId);
        merge([result.message]);
      } catch {
        setState((current) => failPending(current, clientId));
      }
    },
    [api, applicationId, merge],
  );

  const send = useCallback(
    function send(text: string, picks: PickedFile[] = []): void {
      const clean = text.trim();
      if (!clean && picks.length === 0) return;
      // Como en las apps de mensajes: un mensaje por archivo, y el texto va aparte.
      if (picks.length > 1 || (picks.length === 1 && clean)) {
        if (clean) send(clean, []);
        for (const pick of picks) send("", [pick]);
        return;
      }
      const clientId = newClientId((n) => crypto.getRandomValues(new Uint8Array(n)));
      const placeholders: ChatFile[] = picks.map((pick) => ({ hash: "", name: pick.name, mime: pick.mime, size: 0, key: "", nonce: "" }));
      outbox.current.set(clientId, { text: clean, picks });
      setState((current) => addPending(current, clientId, clean, Math.floor(Date.now() / 1000), placeholders));
      void deliver(clientId, clean, picks);
    },
    [deliver],
  );

  const retry = useCallback(
    (message: ChatMessageView) => {
      const saved = outbox.current.get(message.clientId);
      if (!saved && message.text === null) return;
      setState((current) => retryPending(current, message.clientId));
      void deliver(message.clientId, saved?.text ?? message.text ?? "", saved?.picks ?? []);
    },
    [deliver],
  );

  // Baja el adjunto cifrado, lo descifra en el celular y lo deja en un archivo temporal para mostrarlo.
  const fetchAttachment = useCallback(
    async (file: ChatFile): Promise<Uint8Array | null> => {
      const cipher = await api.bytes(`/me/chats/${applicationId}/files/${file.hash}`);
      return decryptFile(cipher, file.key, file.nonce);
    },
    [api, applicationId],
  );

  const discard = useCallback((message: ChatMessageView) => {
    outbox.current.delete(message.clientId);
    setState((current) => dropPending(current, message.clientId));
  }, []);

  const reload = useCallback(() => start(true), [start]);
  return { status, view, writable, access, send, retry, discard, reload, activate: reload, fetchAttachment };
}
