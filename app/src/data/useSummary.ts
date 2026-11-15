import { useQuery } from "@tanstack/react-query";
import { useSession } from "../session/SessionProvider";
import { useLastSeen } from "./useNotifications";

export interface Summary {
  unreadChats: number;
  unreadNotifications: number;
  pendingAgreements: number;
}

// Los números de los globitos (chats sin leer, notificaciones nuevas, acuerdos por confirmar) en un solo pedido liviano,
// en lugar de mantener al día tres listas enteras solo para contarlas. Se refresca con los avisos push; el intervalo es respaldo.
export function useSummary() {
  const { api, address } = useSession();
  const seen = useLastSeen();
  const seenId = seen.data ?? 0;
  return useQuery({
    queryKey: ["summary", address, seenId],
    enabled: Boolean(address) && seen.isSuccess,
    refetchInterval: 90_000,
    queryFn: () => api.get<Summary>(`/me/summary?seenNotification=${seenId}`),
  });
}
