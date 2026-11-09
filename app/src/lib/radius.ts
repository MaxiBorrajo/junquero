export const RADII_M = [500, 1000, 2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000, 50000];

export function nextRadius(current: number, direction: 1 | -1): number {
  if (direction === 1) return RADII_M.find((step) => step > current) ?? RADII_M[RADII_M.length - 1]!;
  const lower = [...RADII_M].reverse().find((step) => step < current);
  return lower ?? RADII_M[0]!;
}

export function radiusLabel(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  const km = meters / 1000;
  return `${Number.isInteger(km) ? km : km.toFixed(1).replace(".", ",")} km`;
}
