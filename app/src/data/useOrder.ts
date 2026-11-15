import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { fetchOrder } from "../chain/serverReads";
import { useSession } from "../session/SessionProvider";

export function useOrder(orderId: number) {
  const { api } = useSession();
  return useQuery({ queryKey: ["order", orderId], refetchInterval: useFocusedInterval(60_000), queryFn: () => fetchOrder(api, orderId) });
}

export interface EvidenceItem {
  hash: string;
  uploader: string;
  kind: string;
  meta: string;
  size: number;
  createdAt: number;
  wrappedKey: string | null;
}
