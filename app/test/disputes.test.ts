import { describe, expect, it } from "vitest";
import { disputesByOrder, matchesDisputeFilter } from "../src/lib/disputes";

const me = "0xAaaa000000000000000000000000000000000001";
const other = "0xbbbb000000000000000000000000000000000002";

describe("reclamos por trabajo", () => {
  it("distingue los que abrí yo de los que me abrieron", () => {
    const map = disputesByOrder([{ caseId: 1, orderId: 10, claimant: me.toLowerCase(), resolved: false }, { caseId: 2, orderId: 11, claimant: other, resolved: true }], me);
    expect(map.get(10)).toEqual({ orderId: 10, open: true, byMe: true });
    expect(map.get(11)).toEqual({ orderId: 11, open: false, byMe: false });
  });

  it("si un trabajo tuvo varios reclamos, manda el que sigue abierto", () => {
    const map = disputesByOrder([{ caseId: 1, orderId: 10, claimant: other, resolved: false }, { caseId: 2, orderId: 10, claimant: me, resolved: true }], me);
    expect(map.get(10)).toMatchObject({ open: true, byMe: false });
  });

  it("filtra por abiertos, los míos y los de la otra parte", () => {
    const mine = { orderId: 1, open: true, byMe: true };
    const theirs = { orderId: 2, open: false, byMe: false };
    expect(matchesDisputeFilter(mine, "all") && matchesDisputeFilter(theirs, "all")).toBe(true);
    expect([matchesDisputeFilter(mine, "open"), matchesDisputeFilter(theirs, "open")]).toEqual([true, false]);
    expect([matchesDisputeFilter(mine, "byMe"), matchesDisputeFilter(theirs, "byMe")]).toEqual([true, false]);
    expect([matchesDisputeFilter(mine, "byThem"), matchesDisputeFilter(theirs, "byThem")]).toEqual([false, true]);
  });
});
