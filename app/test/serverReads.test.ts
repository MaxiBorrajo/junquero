import { describe, expect, it } from "vitest";
import { freshSuffix, markFresh, caseFromServer, groupFromServer, milestonesFromServer, orderFromServer } from "../src/chain/serverReads";

describe("lecturas que llegan del servidor", () => {
  it("la orden vuelve a tener bigint y números", () => {
    const order = orderFromServer({ payer: "0xa", payee: "0xb", status: 3, price: "5000000", deposited: "5000000", evidenceHash: "0x1", startsAt: 10, deadline: 0, deliveredAt: 0, checkedInAt: 7, arrivalConfirmed: false, hasMilestones: false, isGroup: true, modality: 0, sizeClass: 1, specHash: "0x2" });
    expect(order.price).toBe(5_000_000n);
    expect(order.checkedInAt).toBe(7);
    expect(order.isGroup).toBe(true);
  });

  it("el grupo suma a quienes aportaron como bigint", () => {
    const group = groupFromServer({ info: { target: "100", totalContributed: "40", fundingDeadline: 9, proposedPayee: "0x0", proposedAt: 0, vetoMoney: "0", vetoCount: 0, objectionMoney: "5", objectionCount: 1 }, contributors: [{ address: "0xa", amount: "40" }] });
    expect(group.target).toBe(100n);
    expect(group.contributors[0]).toEqual({ address: "0xa", amount: 40n });
  });

  it("los hitos y el caso mantienen sus tipos", () => {
    const board = milestonesFromServer({ milestones: [{ amount: "3", status: 1, deliveredAt: 2, evidenceHash: "0x3" }], plan: { next: 0, count: 1, paidTotal: "0" } });
    expect(board.milestones[0]).toMatchObject({ amount: 3n, status: 1 });
    const c = caseFromServer({ case: { orderId: "4", payer: "0xa", payee: "0xb", claimant: "0xa", token: "0xc", fee: "9", jurors: 3, phase: 3, round: 1, revealedVotes: 0, payeeVotes: 0, payerVotes: 0, commitEnd: 1, revealEnd: 2, appealed: false, verdictPayee: false, appealEnd: 0, appellant: "0x0", appealFee: "0" }, jurors: ["0x1"] });
    expect(c.snapshot.orderId).toBe(4);
    expect(c.snapshot.fee).toBe(9n);
    expect(c.jurors).toEqual(["0x1"]);
  });
});

describe("lecturas recién actualizadas", () => {
  it("después de una acción se pide al servidor que no use su copia por unos segundos", () => {
    expect(freshSuffix(1_000)).toBe("");
    markFresh(1_000);
    expect(freshSuffix(2_000)).toBe("?fresh=1");
    expect(freshSuffix(1_000 + 15_001)).toBe("");
  });
});
