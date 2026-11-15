export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 24 && rest === 0 && hours % 24 === 0) return `${hours / 24} d`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatDate(seconds: number, locale = "es-AR"): string {
  return new Date(seconds * 1000).toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.max(50, Math.round(meters / 50) * 50)} m` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace(".", ",")} km`;
}

export const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

// Hora si fue hoy, "ayer" o la fecha corta si fue antes. `now` en segundos.
export function formatChatTime(seconds: number, now: number = Math.floor(Date.now() / 1000), locale = "es-AR"): string {
  const date = new Date(seconds * 1000);
  const today = new Date(now * 1000);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const day = 24 * 3600 * 1000;
  if (date.getTime() >= startOfToday) return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (date.getTime() >= startOfToday - day) return "Ayer";
  if (date.getTime() >= startOfToday - 6 * day) return date.toLocaleDateString(locale, { weekday: "short" });
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

// Hora de un mensaje, "14:05".
export function formatClock(seconds: number, locale = "es-AR"): string {
  return new Date(seconds * 1000).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

const startOfDay = (seconds: number): number => {
  const date = new Date(seconds * 1000);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

// Día de un mensaje para el separador del chat: "Hoy", "Ayer" o "lun, 16 nov".
export function formatDayLabel(seconds: number, now: number = Math.floor(Date.now() / 1000), locale = "es-AR"): string {
  const diff = Math.round((startOfDay(now) - startOfDay(seconds)) / (24 * 3600 * 1000));
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return new Date(seconds * 1000).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

export const sameDay = (a: number, b: number): boolean => startOfDay(a) === startOfDay(b);

// "noviembre de 2026"
export function formatMonthYear(seconds: number, locale = "es-AR"): string {
  return new Date(seconds * 1000).toLocaleDateString(locale, { month: "long", year: "numeric" });
}
