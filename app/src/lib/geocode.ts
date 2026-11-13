import { MAPTILER_KEY } from "../config";
import type { LatLng } from "./geo";

export type Place = { id: string; name: string; detail: string; lat: number; lng: number };

type Feature = { id: string; text?: string; place_name?: string; center: [number, number] };

export async function searchPlaces(query: string, near: LatLng, limit: number, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&language=es&country=ar&limit=${limit}&autocomplete=true&proximity=${near.lng},${near.lat}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`geocoding ${response.status}`);
  const body = (await response.json()) as { features?: Feature[] };
  return (body.features ?? []).map((feature) => ({
    id: feature.id,
    name: feature.text ?? feature.place_name ?? query,
    detail: feature.place_name ?? "",
    lat: feature.center[1],
    lng: feature.center[0],
  }));
}
