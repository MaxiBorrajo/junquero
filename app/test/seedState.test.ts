import { describe, expect, it } from "vitest";
import { CasePhase } from "../src/chain/arbitrationAbi";
import { seedNeedsAction } from "../src/jury/seedAction";
import type { SeedState } from "../src/jury/seedState";

const base = (patch: Partial<SeedState>, commitEnd = 1000, revealEnd = 2000): SeedState =>
  ({ snapshot: { phase: CasePhase.Seed, commitEnd, revealEnd } as SeedState["snapshot"], eligible: true, committed: false, revealed: false, hasSecret: true, ...patch });

describe("reclamos con algo para hacer", () => {
  it("cuenta el que se puede anotar mientras el plazo sigue abierto", () => {
    expect(seedNeedsAction(base({}), 500)).toBe(true);
    expect(seedNeedsAction(base({}), 1500)).toBe(false);
  });

  it("no cuenta el que no cumple los requisitos ni el que ya no está buscando jurados", () => {
    expect(seedNeedsAction(base({ eligible: false }), 500)).toBe(false);
    expect(seedNeedsAction(null, 500)).toBe(false);
  });

  it("cuenta el aporte por revelar solo si se guardó el secreto", () => {
    expect(seedNeedsAction(base({ committed: true }), 1500)).toBe(true);
    expect(seedNeedsAction(base({ committed: true, hasSecret: false }), 1500)).toBe(false);
    expect(seedNeedsAction(base({ committed: true, revealed: true }), 1500)).toBe(false);
  });
});
