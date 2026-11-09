export interface ServerMessage {
  seq: number;
  sender: string;
  nonce: string;
  body: string;
  clientId: string;
  createdAt: number;
}

export interface ChatMessageView {
  key: string;
  seq: number | null;
  clientId: string;
  mine: boolean;
  text: string | null;
  createdAt: number;
  status: "sent" | "sending" | "failed";
}

export interface ChatState {
  server: Map<number, ChatMessageView>;
  pending: Map<string, ChatMessageView>;
}

export const emptyChat = (): ChatState => ({ server: new Map(), pending: new Map() });

export function applyServer(state: ChatState, messages: ServerMessage[], me: string, decrypt: (message: ServerMessage) => string | null): ChatState {
  const server = new Map(state.server);
  const pending = new Map(state.pending);
  for (const message of messages) {
    if (server.has(message.seq)) continue;
    server.set(message.seq, {
      key: `s${message.seq}`,
      seq: message.seq,
      clientId: message.clientId,
      mine: message.sender.toLowerCase() === me.toLowerCase(),
      text: decrypt(message),
      createdAt: message.createdAt,
      status: "sent",
    });
    pending.delete(message.clientId);
  }
  return { server, pending };
}

export function addPending(state: ChatState, clientId: string, text: string, createdAt: number): ChatState {
  const pending = new Map(state.pending);
  pending.set(clientId, { key: `p${clientId}`, seq: null, clientId, mine: true, text, createdAt, status: "sending" });
  return { ...state, pending };
}

function setPendingStatus(state: ChatState, clientId: string, status: "sending" | "failed"): ChatState {
  const current = state.pending.get(clientId);
  if (!current) return state;
  const pending = new Map(state.pending);
  pending.set(clientId, { ...current, status });
  return { ...state, pending };
}

export const failPending = (state: ChatState, clientId: string): ChatState => setPendingStatus(state, clientId, "failed");
export const retryPending = (state: ChatState, clientId: string): ChatState => setPendingStatus(state, clientId, "sending");

export function dropPending(state: ChatState, clientId: string): ChatState {
  if (!state.pending.has(clientId)) return state;
  const pending = new Map(state.pending);
  pending.delete(clientId);
  return { ...state, pending };
}

export function viewOf(state: ChatState): ChatMessageView[] {
  const sent = [...state.server.values()].sort((a, b) => a.seq! - b.seq!);
  const waiting = [...state.pending.values()].sort((a, b) => a.createdAt - b.createdAt);
  return [...sent, ...waiting];
}

export const lastSeq = (state: ChatState): number => {
  let max = 0;
  for (const seq of state.server.keys()) if (seq > max) max = seq;
  return max;
};

export function newClientId(random: (n: number) => Uint8Array): string {
  return Array.from(random(12), (b) => b.toString(16).padStart(2, "0")).join("");
}
