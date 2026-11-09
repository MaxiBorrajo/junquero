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
