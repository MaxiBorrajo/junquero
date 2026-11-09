const DEFAULT_HOUR = 9;
const MAX_DAYS_AHEAD = 365;

export function withDay(valueSeconds: number | null, day: Date): number {
  const base = valueSeconds === null ? null : new Date(valueSeconds * 1000);
  const hour = base?.getHours() ?? DEFAULT_HOUR;
  const minute = base?.getMinutes() ?? 0;
  return Math.floor(new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime() / 1000);
}

export function withTime(valueSeconds: number | null, time: Date, today: Date): number {
  const base = valueSeconds === null ? today : new Date(valueSeconds * 1000);
  return Math.floor(new Date(base.getFullYear(), base.getMonth(), base.getDate(), time.getHours(), time.getMinutes()).getTime() / 1000);
}

export const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const lastPickableDay = (today: Date): Date => new Date(today.getFullYear(), today.getMonth(), today.getDate() + MAX_DAYS_AHEAD);
