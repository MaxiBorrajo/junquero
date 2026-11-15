import { useQuery } from "@tanstack/react-query";
import type { PublicProfile } from "../api/types";
import { useSession } from "../session/SessionProvider";

// Perfil público de otra persona (nombre, foto, verificación e historial).
export function usePublicProfile(address: string | null | undefined) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["profile", address],
    enabled: Boolean(address),
    staleTime: 60_000,
    queryFn: async () => (await api.get<{ profile: PublicProfile }>(`/profiles/${address}`)).profile,
  });
}
