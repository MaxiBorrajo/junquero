import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Changa } from "../api/types";
import { boundsQuery, type Bounds } from "../lib/changaMap";
import { filtersQuery, type Filters } from "../lib/filters";
import { useSession } from "../session/SessionProvider";
import { useCancelling } from "./cancelling";

function useWithoutCancelling<T extends { data: Changa[] | undefined }>(result: T): T {
  const cancelling = useCancelling();
  const data = useMemo(() => result.data?.filter((item) => !cancelling.has(item.id)), [result.data, cancelling]);
  return { ...result, data };
}

export function useChangasInBounds(bounds: Bounds | null, filters: Filters) {
  const { api } = useSession();
  const extra = filtersQuery(filters);
  return useWithoutCancelling(useQuery({
    queryKey: ["changas", bounds ? boundsQuery(bounds) : null, extra],
    enabled: bounds !== null,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    queryFn: async () => (await api.get<{ changas: Changa[] }>(`/changas?${boundsQuery(bounds as Bounds)}&limit=50${extra ? `&${extra}` : ""}`)).changas,
  }));
}

export function useRemoteChangas(filters: Filters) {
  const { api } = useSession();
  const extra = filtersQuery(filters);
  return useWithoutCancelling(useQuery({
    queryKey: ["changas", "remote", extra],
    staleTime: 15_000,
    queryFn: async () => (await api.get<{ changas: Changa[] }>(`/changas?modality=remote&limit=50${extra ? `&${extra}` : ""}`)).changas,
  }));
}

export function useChangaBySpec(specHash: string) {
  const { api } = useSession();
  return useQuery({
    queryKey: ["changa", specHash],
    staleTime: 15_000,
    queryFn: async () => (await api.get<{ changas: Changa[] }>(`/changas/${specHash}`)).changas[0] ?? null,
  });
}
