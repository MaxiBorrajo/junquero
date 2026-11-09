import type { Changa } from "../api/types";
import { formatAmount } from "./money";

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const MAX_SPAN_DEGREES = 2;

export function clampBounds(bounds: Bounds): Bounds {
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;
  const halfLat = Math.min((bounds.north - bounds.south) / 2, MAX_SPAN_DEGREES / 2);
  const halfLng = Math.min((bounds.east - bounds.west) / 2, MAX_SPAN_DEGREES / 2);
  return { south: centerLat - halfLat, north: centerLat + halfLat, west: centerLng - halfLng, east: centerLng + halfLng };
}

export function boundsQuery(bounds: Bounds): string {
  const b = clampBounds(bounds);
  return `minLat=${b.south.toFixed(4)}&maxLat=${b.north.toFixed(4)}&minLng=${b.west.toFixed(4)}&maxLng=${b.east.toFixed(4)}`;
}

export function roundBounds(bounds: Bounds, stepMilli = 20): Bounds {
  const milli = (value: number): number => Math.round(value * 1000);
  const down = (value: number): number => (Math.floor(milli(value) / stepMilli) * stepMilli) / 1000;
  const up = (value: number): number => (Math.ceil(milli(value) / stepMilli) * stepMilli) / 1000;
  return { south: down(bounds.south), north: up(bounds.north), west: down(bounds.west), east: up(bounds.east) };
}

export function toFeatures(changas: Changa[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const changa of changas) {
    const area = changa.spec.area;
    if (!area) continue;
    features.push({
      type: "Feature",
      id: changa.id,
      properties: { id: changa.id, specHash: changa.specHash, category: changa.spec.category, label: `US$ ${formatAmount(changa.amount)}` },
      geometry: { type: "Point", coordinates: [area.lng, area.lat] },
    });
  }
  return { type: "FeatureCollection", features };
}
