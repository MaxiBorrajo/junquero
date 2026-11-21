import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { fetchCase } from "../chain/serverReads";
import { useSession } from "../session/SessionProvider";

export interface CaseRef {
  caseId: number;
  orderId: number;
  // Solo en los reclamos propios: quién lo abrió y si ya se resolvió.
  claimant?: string | null;
  resolved?: boolean;
}

export interface MyCases {
  asParty: CaseRef[];
  asJuror: CaseRef[];
  openForJury: CaseRef[];
}

export function useMyCases() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["cases", address],
    enabled: Boolean(address),
    refetchInterval: useFocusedInterval(60_000),
    queryFn: () => api.get<MyCases>("/me/cases"),
  });
}

export function useCaseState(caseId: number) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["case", caseId],
    refetchInterval: useFocusedInterval(30_000),
    queryFn: () => fetchCase(api, caseId),
  });
}

export interface JuryResults {
  // Por caso: garantía perdida y recompensa ganada, en micro-USDC como texto.
  cases: Record<string, { slashed: string; earned: string }>;
  totals: { deposited: string; slashed: string; earned: string };
}

export function useJuryResults() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["juryResults", address],
    enabled: Boolean(address),
    refetchInterval: useFocusedInterval(60_000),
    queryFn: () => api.get<JuryResults>("/me/jury/results"),
  });
}
