import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { useSession } from "../session/SessionProvider";

// Hitos que se cerraron por un reclamo (el contrato igual los marca como pagados) y qué parte cobró quien trabajó, en puntos básicos.
export function useDisputedMilestones(orderId: number): Map<number, number> {
  const { api, address } = useSession();
  const query = useQuery({
    queryKey: ["disputed-milestones", orderId, address],
    enabled: Boolean(address),
    refetchInterval: useFocusedInterval(60_000),
    queryFn: async () => (await api.get<{ disputed: { index: number; payeeShareBps: number }[] }>(`/me/orders/${orderId}/disputed-milestones`)).disputed,
  });
  return new Map((query.data ?? []).map((item) => [item.index, item.payeeShareBps]));
}
