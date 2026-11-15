import { useQuery } from "@tanstack/react-query";
import { useSession } from "../session/SessionProvider";

export interface ChatEvent {
  id: number;
  kind: "proposed" | "accepted" | "rejected" | "cancelled" | "agreed" | "checkedin" | "delivered" | "settled";
  actor: string;
  createdAt: number;
}

// Lo que pasó con el acuerdo y el trabajo, para mostrarlo en el chat como historial.
export function useChatEvents(applicationId: number) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["chat-events", applicationId],
    refetchInterval: 20_000,
    queryFn: async () => (await api.get<{ events: ChatEvent[] }>(`/me/chats/${applicationId}/events`)).events,
  });
}
