import { CasePhase } from "../chain/arbitrationAbi";
import { readCommitters, readIsEligible, readRevealers } from "../chain/reader";
import { fetchCase } from "../chain/serverReads";
import type { Api } from "../api/client";
import { loadSeed } from "./secrets";
import { secureSecretStorage } from "./secureStorage";

export interface SeedState {
  snapshot: Awaited<ReturnType<typeof fetchCase>>["snapshot"];
  eligible: boolean;
  committed: boolean;
  revealed: boolean;
  hasSecret: boolean;
}

// El estado de un reclamo que busca jurados, para una persona: si puede anotarse, si ya se anotó y si le toca revelar. Lo comparten
// la tarjeta de cada reclamo y el número de la pestaña, así que los dos ven lo mismo.
export const seedQueryOptions = (api: Api, juror: `0x${string}`, caseId: number) => ({
  queryKey: ["seed", caseId, juror] as const,
  queryFn: async (): Promise<SeedState | null> => {
    const { snapshot } = await fetchCase(api, caseId);
    if (snapshot.phase !== CasePhase.Seed) return null;
    const [eligible, committers, revealers, secret] = await Promise.all([
      readIsEligible(caseId, juror),
      readCommitters(caseId, snapshot.round),
      readRevealers(caseId, snapshot.round),
      loadSeed(secureSecretStorage, juror, caseId, snapshot.round),
    ]);
    const lower = (list: readonly string[]) => list.map((a) => a.toLowerCase());
    return { snapshot, eligible, committed: lower(committers).includes(juror.toLowerCase()), revealed: lower(revealers).includes(juror.toLowerCase()), hasSecret: secret !== null };
  },
});
