import { useQuery } from "@tanstack/react-query";
import { readOrder } from "../chain/reader";

export function useOrder(orderId: number) {
  return useQuery({ queryKey: ["order", orderId], refetchInterval: 15_000, queryFn: () => readOrder(orderId) });
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
