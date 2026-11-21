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

import { seedGroups, voteNeedsAction } from "../src/jury/seedAction";

describe("filtros de reclamos para jurados", () => {
  it("separa los que puedo anotar, los que tengo que revelar, los anotados y los no anotados", () => {
    expect(seedGroups(base({}), 500)).toEqual(["notJoined", "toJoin"]);
    expect(seedGroups(base({ eligible: false }), 500)).toEqual(["notJoined"]);
    expect(seedGroups(base({ committed: true }), 1500)).toEqual(["joined", "toReveal"]);
    expect(seedGroups(base({ committed: true, revealed: true }), 1500)).toEqual(["joined"]);
    expect(seedGroups(null, 500)).toEqual([]);
  });

  it("detecta si me toca votar o mostrar mi voto", () => {
    const zero = `0x${"0".repeat(64)}`;
    const sealed = `0x${"1".repeat(64)}`;
    expect(voteNeedsAction("vote-commit", { voteCommit: zero, vote: 0 })).toBe(true);
    expect(voteNeedsAction("vote-commit", { voteCommit: sealed, vote: 0 })).toBe(false);
    expect(voteNeedsAction("vote-reveal", { voteCommit: sealed, vote: 0 })).toBe(true);
    expect(voteNeedsAction("vote-reveal", { voteCommit: sealed, vote: 1 })).toBe(false);
    expect(voteNeedsAction("verdict-final", { voteCommit: sealed, vote: 1 })).toBe(false);
  });
});

import { jurorStage } from "../src/jury/seedAction";

describe("etapa de un caso para el jurado elegido", () => {
  const zero = `0x${"0".repeat(64)}`;
  const sealed = `0x${"1".repeat(64)}`;
  it("dice qué le toca hacer y de cuál plazo hay que avisarle", () => {
    expect(jurorStage("vote-commit", { voteCommit: zero, vote: 0 })).toEqual({ tag: "toVote", deadline: "commit" });
    expect(jurorStage("vote-commit", { voteCommit: sealed, vote: 0 })).toEqual({ tag: "voteSaved", deadline: "commit" });
    expect(jurorStage("vote-reveal", { voteCommit: sealed, vote: 0 })).toEqual({ tag: "toReveal", deadline: "reveal" });
    expect(jurorStage("vote-reveal", { voteCommit: sealed, vote: 2 })).toEqual({ tag: "revealed", deadline: "count" });
    expect(jurorStage("vote-reveal", { voteCommit: zero, vote: 0 })).toEqual({ tag: "missed", deadline: null });
    expect(jurorStage("verdict-final")).toEqual({ tag: "done", deadline: null });
    expect(jurorStage("seed-reveal")).toEqual({ tag: "seed", deadline: null });
  });
});
