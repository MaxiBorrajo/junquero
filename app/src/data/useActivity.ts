import { useQuery } from "@tanstack/react-query";
import { useSession } from "../session/SessionProvider";

export interface Activity {
  earned: string;
  spent: string;
  toCollect: string;
  inEscrow: string;
  settledAsPayee: number;
  settledAsPayer: number;
}

export function useActivity() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["activity", address],
    enabled: Boolean(address),
    staleTime: 30_000,
    queryFn: () => api.get<Activity>("/me/activity"),
  });
}
