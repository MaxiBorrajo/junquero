import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import type { ChatSummary } from "../api/types";
import { useSession } from "../session/SessionProvider";

export function useChats() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["chats", address],
    enabled: Boolean(address),
    refetchInterval: 120_000,
    queryFn: async () => (await api.get<{ chats: ChatSummary[] }>("/me/chats")).chats,
  });
}
