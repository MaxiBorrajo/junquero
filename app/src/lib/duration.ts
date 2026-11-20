// "30 minutos", "6 horas", "3 días": un plazo en segundos, dicho como lo diría una persona.
export function spokenDuration(seconds: number): string {
  const unit = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  if (seconds % 86400 === 0 && seconds >= 86400) return unit(seconds / 86400, "día", "días");
  if (seconds % 3600 === 0 && seconds >= 3600) return unit(seconds / 3600, "hora", "horas");
  if (seconds >= 3600) return `${unit(Math.floor(seconds / 3600), "hora", "horas")} y ${unit(Math.round((seconds % 3600) / 60), "minuto", "minutos")}`;
  return unit(Math.max(1, Math.round(seconds / 60)), "minuto", "minutos");
}
