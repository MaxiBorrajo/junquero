import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { app } from "../src/app";
import { buildLoginMessage } from "../src/auth";
import type { Env } from "../src/env";
import { createFakeD1 } from "./fakeD1";

export const open = { limit: async () => ({ success: true }) };
export const owner = privateKeyToAccount(generatePrivateKey());
export const stranger = privateKeyToAccount(generatePrivateKey());
export const TOKEN = "0x057Dc87344bB1f7B213433C959B23bAACc711EEA";

export function setup(limiter = open) {
  const { db, raw } = createFakeD1();
  const env = {
    DB: db,
    AUTH_SECRET: "test-secret",
    RELAY_LIMITER: limiter,
    READ_LIMITER: limiter,
    AUTH_LIMITER: limiter,
    WRITE_LIMITER: limiter,
  } as unknown as Env;
  const call = (path: string, init?: RequestInit) => app.request(path, init, env);
  return { db, raw, env, call };
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
