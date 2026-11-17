import type { Closing } from "../api/types";

// "202611" → "noviembre de 2026"
export function receiptMonthLabel(month: number, locale = "es-AR"): string {
  const year = Math.floor(month / 100);
  const monthIndex = (month % 100) - 1;
  return new Date(Date.UTC(year, monthIndex, 15)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

// La fecha de la medalla: el día en que se cerró y pagó el trabajo; si no la tenemos, el mes del comprobante.
export function receiptDate(receipt: { closedAt: number | null; month: number }, locale = "es-AR"): string {
  if (receipt.closedAt) return new Date(receipt.closedAt * 1000).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return receiptMonthLabel(receipt.month, locale);
}

export interface RatingLine {
  index: number | null;
  rating: number;
}

// Si el trabajo se pagó de una vez hay una sola calificación; si fue por hitos, una por hito y el promedio.
export function ratingSummary(ratings: Closing["ratings"]): { lines: RatingLine[]; average: number | null } {
  if (ratings.length === 0) return { lines: [], average: null };
  const total = ratings.reduce((sum, item) => sum + item.rating, 0);
  return { lines: ratings, average: Math.round((total / ratings.length) * 10) / 10 };
}

// El nombre del tramo en palabras: "Muy bien" para un 5. Con decimales se redondea.
export const ratingWord = (value: number, labels: readonly string[]): string => labels[Math.min(labels.length, Math.max(1, Math.round(value))) - 1] ?? "";
