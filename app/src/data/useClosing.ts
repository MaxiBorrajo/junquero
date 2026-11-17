import { useQuery } from "@tanstack/react-query";
import type { Closing } from "../api/types";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { useSession } from "../session/SessionProvider";

// Cómo se cerró un trabajo, para las dos partes: calificación y comprobante. Mientras el comprobante no figure se vuelve a mirar cada tanto.
export function useClosing(orderId: number, enabled: boolean) {
  const { api, address } = useSession();
  const focused = useFocusedInterval(30_000);
  return useQuery({
    queryKey: ["closing", orderId, address],
    enabled: enabled && Boolean(address),
    refetchInterval: (query) => (query.state.data?.receipt ? false : focused),
    queryFn: () => api.get<Closing>(`/me/orders/${orderId}/closing`),
  });
}
