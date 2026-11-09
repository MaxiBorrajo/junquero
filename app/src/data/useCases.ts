import { useQuery } from "@tanstack/react-query";
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
    refetchInterval: 30_000,
    queryFn: () => api.get<MyCases>("/me/cases"),
  });
}

export function useCaseState(caseId: number) {
  return useQuery({
    queryKey: ["case", caseId],
    refetchInterval: 15_000,
    queryFn: async () => ({ snapshot: await readCase(caseId), jurors: await readJurors(caseId) }),
  });
}
