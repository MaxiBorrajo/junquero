import { MAPTILER_KEY } from "../config";
import { distanceM, type LatLng } from "./geo";

export type Place = { id: string; name: string; detail: string; lat: number; lng: number };

type Feature = { id: string; text?: string; place_name?: string; center: [number, number] };

// Pedimos más resultados de los que mostramos y los ordenamos por cercanía al centro del mapa:
// así la calle del barrio que se está mirando queda arriba de otra con el mismo nombre en otro partido.
export const sortByDistance = (places: Place[], near: LatLng): Place[] =>
  [...places].sort((a, b) => distanceM(near, a) - distanceM(near, b));

export async function searchPlaces(query: string, near: LatLng, limit: number, signal?: AbortSignal): Promise<Place[]> {
  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&language=es&country=ar&limit=${Math.min(limit * 3, 10)}&autocomplete=true&proximity=${near.lng},${near.lat}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`geocoding ${response.status}`);
  const body = (await response.json()) as { features?: Feature[] };
  const places = (body.features ?? []).map((feature) => ({
    id: feature.id,
    name: feature.text ?? feature.place_name ?? query,
    detail: feature.place_name ?? "",
    lat: feature.center[1],
    lng: feature.center[0],
  }));
  return sortByDistance(places, near).slice(0, limit);
}
