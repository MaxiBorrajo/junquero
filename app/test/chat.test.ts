import { describe, expect, it, vi } from "vitest";
import { createApi } from "../src/api/client";
import { keyPairFromSeed, open, publicKeyHex, secretKeyHex } from "../src/crypto/chat";
import { fetchCounterpartKey, loadChatKey, type KeyStorage } from "../src/crypto/keyManager";
import { addPending, applyServer, dropPending, emptyChat, failPending, lastSeq, newClientId, retryPending, viewOf, type ServerMessage } from "../src/chat/state";

const message = (seq: number, sender: string, clientId = `client-${seq}`): ServerMessage => ({ seq, sender, nonce: "n", body: "b", clientId, createdAt: 100 + seq });
const decrypt = (m: ServerMessage) => `texto ${m.seq}`;

describe("estado del chat", () => {
  it("ordena por secuencia, ignora repetidos y marca los propios", () => {
    let state = applyServer(emptyChat(), [message(2, "0xB"), message(1, "0xa")], "0xA", decrypt);
    state = applyServer(state, [message(1, "0xa"), message(3, "0xb")], "0xa", decrypt);
    const view = viewOf(state);
    expect(view.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(view.map((m) => m.mine)).toEqual([true, false, false]);
    expect(lastSeq(state)).toBe(3);
  });

  it("un mensaje en espera se reemplaza por el del servidor con el mismo clientId", () => {
    let state = addPending(emptyChat(), "abc12345", "hola", 50);
    expect(viewOf(state)).toMatchObject([{ status: "sending", seq: null, text: "hola", mine: true }]);
    state = applyServer(state, [message(1, "0xa", "abc12345")], "0xa", () => "hola");
    expect(viewOf(state)).toHaveLength(1);
    expect(viewOf(state)[0]).toMatchObject({ seq: 1, status: "sent" });
  });

  it("falla, reintenta y descarta", () => {
    let state = addPending(emptyChat(), "abc12345", "hola", 50);
    state = failPending(state, "abc12345");
    expect(viewOf(state)[0]?.status).toBe("failed");
    state = retryPending(state, "abc12345");
    expect(viewOf(state)[0]?.status).toBe("sending");
    state = dropPending(dropPending(state, "abc12345"), "nope");
    expect(viewOf(state)).toHaveLength(0);
  });

  it("los pendientes van al final, por orden de creación", () => {
    let state = applyServer(emptyChat(), [message(1, "0xb")], "0xa", decrypt);
    state = addPending(addPending(state, "second00", "2", 60), "first000", "1", 55);
    expect(viewOf(state).map((m) => m.text)).toEqual(["texto 1", "1", "2"]);
  });

  it("los mensajes que no se pueden descifrar quedan con texto nulo", () => {
    const state = applyServer(emptyChat(), [message(1, "0xb")], "0xa", () => null);
    expect(viewOf(state)[0]?.text).toBeNull();
  });

  it("genera ids válidos para el servidor", () => {
    const id = newClientId((n) => new Uint8Array(n).fill(171));
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

function memoryStorage(): KeyStorage & { secrets: Map<string, string>; registered: Set<string> } {
  const secrets = new Map<string, string>();
  const registered = new Set<string>();
  return {
    secrets,
    registered,
    getSecret: async (a) => secrets.get(a) ?? null,
    setSecret: async (a, s) => void secrets.set(a, s),
    isRegistered: async (a, p) => registered.has(`${a}:${p}`),
    markRegistered: async (a, p) => void registered.add(`${a}:${p}`),
  };
}

describe("gestor de claves", () => {
  const address = "0xAbC0000000000000000000000000000000000001";
  const make = () => {
    const calls: { path: string; body: unknown }[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ path: url.replace("https://x", ""), body: init?.body ? JSON.parse(init.body as string) : undefined });
      return new Response("{}", { status: 200 });
    });
    return { calls, api: createApi({ baseUrl: "https://x", fetcher, getToken: () => "t" }) };
  };
  const sign = vi.fn(async (m: string) => ("0x" + (m.length % 2 ? "ab" : "cd").repeat(65)) as `0x${string}`);

  it("la primera vez deriva la clave, la guarda y registra la pública", async () => {
    const { api, calls } = make();
    const storage = memoryStorage();
    sign.mockClear();
    const pair = await loadChatKey({ api, storage, address, signMessage: sign });
    expect(sign).toHaveBeenCalledTimes(2);
    expect(storage.secrets.get(address.toLowerCase())).toBe(secretKeyHex(pair));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ path: "/me/chat-key", body: { publicKey: publicKeyHex(pair) } });
  });

  it("después no vuelve a pedir firmas ni a registrar", async () => {
    const { api, calls } = make();
    const storage = memoryStorage();
    const first = await loadChatKey({ api, storage, address, signMessage: sign });
    sign.mockClear();
    const second = await loadChatKey({ api, storage, address, signMessage: sign });
    expect(sign).not.toHaveBeenCalled();
    expect(publicKeyHex(second)).toBe(publicKeyHex(first));
    expect(calls).toHaveLength(1);
  });

  it("si cambia la clave guardada, se vuelve a registrar", async () => {
    const { api, calls } = make();
    const storage = memoryStorage();
    await loadChatKey({ api, storage, address, signMessage: sign });
    storage.secrets.set(address.toLowerCase(), secretKeyHex(keyPairFromSeed(new Uint8Array(32).fill(9))));
    await loadChatKey({ api, storage, address, signMessage: sign });
    expect(calls).toHaveLength(2);
  });

  it("lee la clave pública del otro y devuelve null si no tiene", async () => {
    const pair = keyPairFromSeed(new Uint8Array(32).fill(4));
    const ok = createApi({ baseUrl: "https://x", fetcher: async () => new Response(JSON.stringify({ publicKey: publicKeyHex(pair) }), { status: 200 }), getToken: () => "t" });
    expect(Array.from((await fetchCounterpartKey(ok, "0xAB"))!)).toEqual(Array.from(pair.publicKey));
    const none = createApi({ baseUrl: "https://x", fetcher: async () => new Response("{}", { status: 404 }), getToken: () => "t" });
    expect(await fetchCounterpartKey(none, "0xAB")).toBeNull();
    expect(open).toBeDefined();
  });
});
