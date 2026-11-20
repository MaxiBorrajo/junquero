import { phaseView } from "../chain/jury";
import type { SeedState } from "./seedState";

// ¿Hay algo para hacer ahora en este reclamo? Anotarse (si puede y el plazo sigue abierto) o revelar su número del sorteo (si ya se anotó).
export function seedNeedsAction(state: SeedState | null | undefined, nowSeconds: number): boolean {
  if (!state) return false;
  const view = phaseView(state.snapshot, nowSeconds);
  if (state.eligible && !state.committed && view === "seed-commit") return true;
  return state.committed && !state.revealed && view === "seed-reveal" && state.hasSecret;
}

export type SeedFilter = "all" | "toJoin" | "toReveal" | "joined" | "notJoined";

// En qué filtro cae un reclamo para esta persona: puede anotarse, tiene que revelar, ya se anotó (revele o no) o no se anotó.
export function seedGroups(state: SeedState | null | undefined, nowSeconds: number): SeedFilter[] {
  if (!state) return [];
  const groups: SeedFilter[] = [];
  if (state.committed) groups.push("joined");
  else groups.push("notJoined");
  if (seedNeedsAction(state, nowSeconds)) groups.push(state.committed ? "toReveal" : "toJoin");
  return groups;
}

const ZERO_HASH = `0x${"0".repeat(64)}`;

// En un caso donde ya me sortearon: ¿me toca votar o mostrar mi voto ahora?
export function voteNeedsAction(view: string, juror: { voteCommit: string; vote: number }): boolean {
  if (view === "vote-commit") return juror.voteCommit === ZERO_HASH;
  if (view === "vote-reveal") return juror.voteCommit !== ZERO_HASH && juror.vote === 0;
  return false;
}

export type JurorTag = "waiting" | "seed" | "toVote" | "voteSaved" | "toReveal" | "revealed" | "missed" | "counting" | "emergency" | "done";

// En qué etapa está un caso para el jurado que fue elegido y de cuál plazo hay que avisarle ("commit" para votar, "reveal" para mostrar).
export function jurorStage(view: string, juror?: { voteCommit: string; vote: number }): { tag: JurorTag; deadline: "commit" | "reveal" | null } {
  const sealed = juror !== undefined && juror.voteCommit !== ZERO_HASH;
  switch (view) {
    case "waiting-response":
      return { tag: "waiting", deadline: null };
    case "seed-commit":
    case "seed-reveal":
    case "seed-draw":
      return { tag: "seed", deadline: null };
    case "vote-commit":
      return { tag: sealed ? "voteSaved" : "toVote", deadline: "commit" };
    case "vote-reveal":
      if (!sealed) return { tag: "missed", deadline: null };
      return juror!.vote !== 0 ? { tag: "revealed", deadline: null } : { tag: "toReveal", deadline: "reveal" };
    case "vote-wait":
      return { tag: sealed ? "counting" : "missed", deadline: null };
    case "emergency":
      return { tag: "emergency", deadline: null };
    default:
      return { tag: "done", deadline: null };
  }
}
