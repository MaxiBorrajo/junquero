import { describe, expect, it } from "vitest";
import { OrderStatus } from "../src/chain/orderAbi";
import { autoReleaseAt, canFinish, roleOf, viewFor } from "../src/lib/actions";

const order = { payer: "0xAaa0000000000000000000000000000000000001", payee: "0xBbb0000000000000000000000000000000000002" };

describe("acciones de la changa", () => {
  it("detecta el rol sin importar mayúsculas", () => {
    expect(roleOf(order, order.payer.toLowerCase())).toBe("payer");
    expect(roleOf(order, order.payee.toUpperCase().replace("0X", "0x"))).toBe("payee");
    expect(roleOf(order, "0xccc")).toBe("viewer");
    expect(roleOf(order, null)).toBe("viewer");
  });

  it("elige la vista según estado y rol", () => {
    expect(viewFor(OrderStatus.Agreed, "payee")).toBe("worker-working");
    expect(viewFor(OrderStatus.Agreed, "payer")).toBe("payer-waiting-work");
    expect(viewFor(OrderStatus.Delivered, "payee")).toBe("worker-waiting-review");
    expect(viewFor(OrderStatus.Delivered, "payer")).toBe("payer-reviewing");
    expect(viewFor(OrderStatus.Delivered, "viewer")).toBe("other");
    expect(viewFor(OrderStatus.Disputed, "payer")).toBe("disputed");
    expect(viewFor(OrderStatus.Settled, "payee")).toBe("settled");
    expect(viewFor(OrderStatus.Cancelled, "payer")).toBe("cancelled");
    expect(viewFor(OrderStatus.Open, "payer")).toBe("other");
  });

  it("solo deja terminar con evidencia y sin hitos ni grupo", () => {
    expect(canFinish(0, false, false)).toBe(false);
    expect(canFinish(1, false, false)).toBe(true);
    expect(canFinish(2, true, false)).toBe(false);
    expect(canFinish(2, false, true)).toBe(false);
  });

  it("calcula el plazo de liberación automática", () => {
    expect(autoReleaseAt(1000)).toBe(1000 + 86400);
  });
});

import { allPaid, boardAction, paidCount } from "../src/lib/board";

describe("tablero de hitos", () => {
  const board = (statuses: number[], next: number, firstIsAdvance = false) => ({ next, count: statuses.length, firstIsAdvance, milestones: statuses.map((status) => ({ status })) });
  it("elige la acción según rol y estado del hito actual", () => {
    expect(boardAction(board([0, 0], 0), "payee")).toBe("deliver");
    expect(boardAction(board([0, 0], 0, true), "payee")).toBe("claim-advance");
    expect(boardAction(board([2, 0], 1, true), "payee")).toBe("deliver");
    expect(boardAction(board([1, 0], 0), "payee")).toBe("wait-review");
    expect(boardAction(board([1, 0], 0), "payer")).toBe("review");
    expect(boardAction(board([0, 0], 0), "payer")).toBe("wait-delivery");
    expect(boardAction(board([2, 2], 2), "payer")).toBe("none");
    expect(boardAction(board([0, 0], 0), "viewer")).toBe("none");
  });
  it("cuenta los hitos pagados", () => {
    expect(paidCount([{ status: 2 }, { status: 0 }, { status: 2 }])).toBe(2);
    expect(allPaid([{ status: 2 }, { status: 2 }])).toBe(true);
    expect(allPaid([{ status: 2 }, { status: 1 }])).toBe(false);
    expect(allPaid([])).toBe(false);
  });
});

import { extendedRole } from "../src/lib/actions";

describe("rol de aportante", () => {
  it("un aportante de una changa grupal ve la revisión aunque no sea parte", () => {
    expect(extendedRole("viewer", true, 5n)).toBe("contributor");
    expect(extendedRole("viewer", true, 0n)).toBe("viewer");
    expect(extendedRole("viewer", false, 5n)).toBe("viewer");
    expect(extendedRole("payer", true, 5n)).toBe("payer");
  });
});

import { readFileSync } from "node:fs";
import { decodeFunctionData, type Hex } from "viem";
import { createApi } from "../src/api/client";
import { approveRemotely, releaseCall } from "../src/chain/remoteRelease";
import { orderAbi } from "../src/chain/orderAbi";
import { milestoneAbi } from "../src/chain/milestones";

describe("aprobación a distancia", () => {
  const deployment = { chainId: 1, token: "0x0000000000000000000000000000000000000001" as const, forwarder: "0x0000000000000000000000000000000000000002" as const, escrow: "0x0000000000000000000000000000000000000003" as const, tokenName: "USDC", tokenPermitVersion: "1" };
  const payee = "0xd9B0025F32f8d1b5010e81E77754bF35839Aa1BD" as const;
  const evidenceHash = ("0x" + "ab".repeat(32)) as Hex;
  const sig = ("0x" + "22".repeat(65)) as Hex;

  const run = async (index: number | null) => {
    const calls: { path: string; body: any }[] = [];
    const api = createApi({ baseUrl: "https://x", getToken: () => "t", fetcher: async (url, init) => (calls.push({ path: url.replace("https://x", ""), body: JSON.parse(init!.body as string) }), new Response("{}", { status: 201 })) });
    let typed: any;
    await approveRemotely({ api, deployment, orderId: 7, payee, index, amount: 5_000_000n, rating: 4, evidenceHash, now: 1000, sign: async (t) => ((typed = t), sig) });
    return { calls, typed };
  };

  it("firma el pago completo y lo manda al servidor", async () => {
    const { calls, typed } = await run(null);
    expect(typed.primaryType).toBe("Release");
    expect(typed.message).toMatchObject({ orderId: 7n, payee, amount: 5_000_000n, rating: 4 });
    expect(calls[0]).toMatchObject({ path: "/me/orders/7/release", body: { amount: "5000000", rating: 4, evidenceHash, signature: sig } });
    expect(calls[0]!.body.index).toBeUndefined();
    expect(calls[0]!.body.expiry).toBe(1000 + 24 * 3600);
  });

  it("firma un hito con su índice", async () => {
    const { calls, typed } = await run(2);
    expect(typed.primaryType).toBe("MilestoneRelease");
    expect(typed.message).toMatchObject({ index: 2 });
    expect(calls[0]!.body.index).toBe(2);
  });

  it("quien cobra arma la llamada correcta según sea pago completo o hito", () => {
    const plain = decodeFunctionData({ abi: orderAbi, data: releaseCall(7, { index: null, payee, amount: "5000000", rating: 4, evidenceHash, expiry: 9999, signature: sig }) });
    expect(plain.functionName).toBe("release");
    const milestone = decodeFunctionData({ abi: milestoneAbi, data: releaseCall(7, { index: 1, payee, amount: "5000000", rating: 4, evidenceHash, expiry: 9999, signature: sig }) });
    expect(milestone.functionName).toBe("releaseMilestone");
  });
});
void readFileSync;
