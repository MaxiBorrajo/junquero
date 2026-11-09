import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "../session/SessionProvider";

export interface NotificationItem {
  id: number;
  kind: string;
  ref: string;
  createdAt: number;
}

const seenKey = (address: string): string => `junquero.notifications.seen.${address.toLowerCase()}`;

export function useNotifications() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["notifications", address],
    enabled: Boolean(address),
    refetchInterval: 60_000,
    queryFn: async () => (await api.get<{ notifications: NotificationItem[] }>("/me/notifications")).notifications,
  });
}

export function useLastSeen() {
  const { address } = useSession();
  return useQuery({
    queryKey: ["notifications-seen", address],
    enabled: Boolean(address),
    queryFn: async () => {
      try {
        return Number((await AsyncStorage.getItem(seenKey(address as string))) ?? 0) || 0;
      } catch {
        return 0;
      }
    },
  });
}

export function useMarkSeen() {
  const { address } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (seconds: number) => {
      try {
        await AsyncStorage.setItem(seenKey(address as string), String(seconds));
      } catch {}
      return seconds;
    },
    onSuccess: (seconds) => queryClient.setQueryData(["notifications-seen", address], seconds),
  });
}

export const countUnread = (items: NotificationItem[], lastSeen: number): number => items.filter((item) => item.createdAt > lastSeen).length;
