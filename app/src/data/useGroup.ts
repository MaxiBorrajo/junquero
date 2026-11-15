import { useQuery } from "@tanstack/react-query";
import { readGroup } from "../chain/reader";
import { useFocusedInterval } from "../lib/useFocusedInterval";

// Estado del grupo de una changa grupal. Una sola consulta (misma clave) para las dos pantallas que la usan.
export function useGroup(orderId: number, enabled = true) {
  return useQuery({ queryKey: ["group", orderId], enabled, refetchInterval: useFocusedInterval(30_000), queryFn: () => readGroup(orderId) });
}
