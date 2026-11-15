import { useQuery } from "@tanstack/react-query";
import { useSession } from "../session/SessionProvider";

import type { ChatEvent } from "../chat/events";
export type { ChatEvent, ChatEventKind } from "../chat/events";

// Lo que pasó con el acuerdo y el trabajo, para mostrarlo en el chat como historial.
export function useChatEvents(applicationId: number) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["chat-events", applicationId],
    refetchInterval: 20_000,
    queryFn: async () => (await api.get<{ events: ChatEvent[] }>(`/me/chats/${applicationId}/events`)).events,
  });
}
