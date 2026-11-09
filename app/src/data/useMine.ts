import { useQuery } from "@tanstack/react-query";
import type { AgreementRecord, Changa, MyApplication, ReceivedApplication } from "../api/types";
import { useSession } from "../session/SessionProvider";

const REFRESH_MS = 30_000;

export function useMyChangas() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["changas", "mine", address],
    enabled: Boolean(address),
    refetchInterval: REFRESH_MS,
    queryFn: async () => (await api.get<{ changas: Changa[] }>("/me/changas")).changas.filter((item) => item.status !== "draft"),
  });
}

export function useMyApplications() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["applications", "mine", address],
    enabled: Boolean(address),
    refetchInterval: REFRESH_MS,
    queryFn: async () => (await api.get<{ applications: MyApplication[] }>("/me/applications")).applications,
  });
}

export function useMyAgreements() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["agreements", address],
    enabled: Boolean(address),
    refetchInterval: REFRESH_MS,
    queryFn: async () => (await api.get<{ agreements: AgreementRecord[] }>("/me/agreements")).agreements,
  });
}

export function useReceivedApplications(changaId: number) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["applications", "received", changaId],
    refetchInterval: REFRESH_MS,
    queryFn: async () => (await api.get<{ applications: ReceivedApplication[] }>(`/me/changas/${changaId}/applications`)).applications,
  });
}
