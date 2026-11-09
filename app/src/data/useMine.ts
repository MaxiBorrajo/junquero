import { useQuery } from "@tanstack/react-query";
import { isVisibleMine } from "../lib/pending";
import type { AgreementRecord, Changa, MyApplication, ReceivedApplication } from "../api/types";
import { useSession } from "../session/SessionProvider";

const REFRESH_MS = 30_000;
const PENDING_REFRESH_MS = 8_000;

export function useMyChangas() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["changas", "mine", address],
    enabled: Boolean(address),
    refetchInterval: (query) => (query.state.data?.some((item) => item.status === "draft") ? PENDING_REFRESH_MS : REFRESH_MS),
    queryFn: async () => {
      const now = Math.floor(Date.now() / 1000);
      return (await api.get<{ changas: Changa[] }>("/me/changas")).changas.filter((item) => isVisibleMine(item, now));
    },
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

export interface Contribution {
  orderId: number;
  changaId: number | null;
  specHash: string | null;
  status: string | null;
  title: string | null;
}

export function useMyContributions() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["contributions", address],
    enabled: Boolean(address),
    refetchInterval: REFRESH_MS,
    queryFn: async () => (await api.get<{ contributions: Contribution[] }>("/me/contributions")).contributions,
  });
}
