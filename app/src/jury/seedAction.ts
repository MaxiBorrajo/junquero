import { phaseView } from "../chain/jury";
import type { SeedState } from "./seedState";

// ¿Hay algo para hacer ahora en este reclamo? Anotarse (si puede y el plazo sigue abierto) o revelar su aporte (si ya se anotó).
export function seedNeedsAction(state: SeedState | null | undefined, nowSeconds: number): boolean {
  if (!state) return false;
  const view = phaseView(state.snapshot, nowSeconds);
  if (state.eligible && !state.committed && view === "seed-commit") return true;
  return state.committed && !state.revealed && view === "seed-reveal" && state.hasSecret;
}
