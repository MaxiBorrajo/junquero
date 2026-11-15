import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { readCase, readJurors } from "../chain/reader";
import { useSession } from "../session/SessionProvider";

export interface CaseRef {
  caseId: number;
  orderId: number;
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
  return useQuery({
    queryKey: ["case", caseId],
    refetchInterval: useFocusedInterval(30_000),
    queryFn: async () => {
      const [snapshot, jurors] = await Promise.all([readCase(caseId), readJurors(caseId)]);
      return { snapshot, jurors };
    },
  });
}
