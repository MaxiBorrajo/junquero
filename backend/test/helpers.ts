import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { app } from "../src/app";
import { buildLoginMessage } from "../src/auth";
import type { Env } from "../src/env";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { ChatRoomCore } from "../src/chatCore";
import { ChatStore, type SqlLike } from "../src/chatStore";
import { createFakeD1 } from "./fakeD1";

function nodeSql(): SqlLike {
  const db = new DatabaseSync(":memory:");
  return {
    exec(query, ...bindings) {
      const statement = db.prepare(query);
      if (/^\s*SELECT/i.test(query)) return { toArray: () => statement.all(...bindings) };
      statement.run(...bindings);
      return { toArray: () => [] };
    },
  };
}

export class FakeChatNamespace {
  rooms = new Map<string, ChatRoomCore>();
  broadcasts: string[] = [];
  constructor(private readonly db: D1Database) {}
  idFromName(name: string) {
    return name;
  }
  get(id: string) {
    if (!this.rooms.has(id)) {
      this.rooms.set(id, new ChatRoomCore(new ChatStore(nodeSql()), this.db, (payload) => this.broadcasts.push(payload)));
    }
    const room = this.rooms.get(id)!;
    return { fetch: (request: Request) => room.handleHttp(request, Math.floor(Date.now() / 1000)) };
  }
}

export class FakeBucket {
  objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();

  async put(key: string, body: ReadableStream, options?: { sha256?: string; httpMetadata?: { contentType?: string } }) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (options?.sha256 && options.sha256 !== digest) throw new Error("checksum mismatch");
    this.objects.set(key, { bytes, contentType: options?.httpMetadata?.contentType });
  }

  async get(key: string) {
    const stored = this.objects.get(key);
    return stored ? { body: new Response(stored.bytes).body } : null;
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const admin = privateKeyToAccount(generatePrivateKey());

export const open = { limit: async () => ({ success: true }) };
export const owner = privateKeyToAccount(generatePrivateKey());
export const stranger = privateKeyToAccount(generatePrivateKey());
export const TOKEN = "0x057Dc87344bB1f7B213433C959B23bAACc711EEA";

export function setup(limiter = open) {
  const { db, raw } = createFakeD1();
  const env = {
    DB: db,
    FILES: new FakeBucket(),
    CHAT: new FakeChatNamespace(db),
    ADMIN_ADDRESSES: admin.address,
    FILE_LIMITER: limiter,
    AUTH_SECRET: "test-secret",
    RELAY_LIMITER: limiter,
    READ_LIMITER: limiter,
    AUTH_LIMITER: limiter,
    WRITE_LIMITER: limiter,
  } as unknown as Env;
  const call = (path: string, init?: RequestInit) => app.request(path, init, env);
  return { db, raw, env, call, bucket: env.FILES as unknown as FakeBucket, chat: env.CHAT as unknown as FakeChatNamespace };
}

export async function tokenFor(call: ReturnType<typeof setup>["call"], account = owner) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({ message: buildLoginMessage(account.address, issuedAt) });
  const response = await call("/auth/login", {
    method: "POST",
    body: JSON.stringify({ address: account.address, issuedAt, signature }),
  });
  return { response, body: (await response.json()) as { token: string; address: string } };
}

export const authed = (token: string, method: string, body?: unknown): RequestInit => ({
  method,
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const futureSpec = (nonce = "nonce-0001", overrides: Record<string, unknown> = {}) => ({
  v: 1,
  title: "Cambiar una canilla",
  description: "Pierde agua",
  category: 2,
  modality: "onsite",
  nonce,
  area: { lat: -34.6037, lng: -58.3816, radiusM: 300 },
  ...overrides,
});


export function createdEvent(raw: ReturnType<typeof setup>["raw"], orderId: number, specHash: string, payer: string, amount = "10000000", block = orderId + 100) {
  raw.prepare(
    `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
     VALUES (?, 0, 1, '0x1', 'escrow', '0x', 'OrderCreated', ?, ?)`,
  ).run(block, orderId, JSON.stringify({ orderId: String(orderId), payer, token: TOKEN, amount, specHash }));
}

export function plainEvent(raw: ReturnType<typeof setup>["raw"], name: string, orderId: number, block: number, args: object = {}) {
  raw.prepare(
    `INSERT INTO events (block_number, log_index, block_timestamp, tx_hash, contract, address, name, order_id, args)
     VALUES (?, 1, 1, '0x2', 'escrow', '0x', ?, ?, ?)`,
  ).run(block, name, orderId, JSON.stringify(args));
}
