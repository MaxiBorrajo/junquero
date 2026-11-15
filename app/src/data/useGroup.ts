import { useQuery } from "@tanstack/react-query";
import { fetchGroup } from "../chain/serverReads";
import { useSession } from "../session/SessionProvider";
import { useFocusedInterval } from "../lib/useFocusedInterval";

// Estado del grupo de una changa grupal. Una sola consulta (misma clave) para las dos pantallas que la usan.
export function useGroup(orderId: number, enabled = true) {
  const { api } = useSession();
  return useQuery({ queryKey: ["group", orderId], enabled, refetchInterval: useFocusedInterval(30_000), queryFn: () => fetchGroup(api, orderId) });
}
