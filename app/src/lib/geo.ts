const EARTH_RADIUS_M = 6371008.8;
const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
const toDeg = (radians: number): number => (radians * 180) / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

export function circlePolygon(center: LatLng, radiusM: number, steps = 48): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (2 * Math.PI * (i % steps)) / steps;
    ring.push(destination(center, radiusM, bearing));
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function destination(from: LatLng, distanceM: number, bearingRad: number): [number, number] {
  const angular = distanceM / EARTH_RADIUS_M;
  const lat1 = toRad(from.lat);
  const lng1 = toRad(from.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearingRad));
  const lng2 = lng1 + Math.atan2(Math.sin(bearingRad) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lng2), toDeg(lat2)];
}

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function approximateCenter(real: LatLng, random: () => number, maxOffsetM = 150, minOffsetM = 40): LatLng {
  const distance = minOffsetM + random() * (maxOffsetM - minOffsetM);
  const [lng, lat] = destination(real, distance, random() * 2 * Math.PI);
  return { lat, lng };
}
