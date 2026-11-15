import { useQuery } from "@tanstack/react-query";
import { useFocusedInterval } from "../lib/useFocusedInterval";
import { isVisibleMine } from "../lib/pending";
import type { AgreementRecord, Changa, MyApplication, ReceivedApplication } from "../api/types";
import { useSession } from "../session/SessionProvider";

const REFRESH_MS = 60_000;
const PENDING_REFRESH_MS = 8_000;

export function useMyChangas() {
  const { api, address } = useSession();
  const focused = useFocusedInterval(1);
  return useQuery({
    queryKey: ["changas", "mine", address],
    enabled: Boolean(address),
    refetchInterval: (query) => (focused === false ? false : query.state.data?.some((item) => item.status === "draft") ? PENDING_REFRESH_MS : REFRESH_MS),
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
    refetchInterval: useFocusedInterval(REFRESH_MS),
    queryFn: async () => (await api.get<{ applications: MyApplication[] }>("/me/applications")).applications,
  });
}

export function useMyAgreements() {
  const { api, address } = useSession();
  return useQuery({
    queryKey: ["agreements", address],
    enabled: Boolean(address),
    refetchInterval: useFocusedInterval(REFRESH_MS),
    queryFn: async () => (await api.get<{ agreements: AgreementRecord[] }>("/me/agreements")).agreements,
  });
}

export function useReceivedApplications(changaId: number, enabled = true) {
  const { api } = useSession();
  return useQuery({
    enabled,
    queryKey: ["applications", "received", changaId],
    refetchInterval: useFocusedInterval(REFRESH_MS),
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
    refetchInterval: useFocusedInterval(REFRESH_MS),
    queryFn: async () => (await api.get<{ contributions: Contribution[] }>("/me/contributions")).contributions,
  });
}
