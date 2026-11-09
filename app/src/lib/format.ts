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
