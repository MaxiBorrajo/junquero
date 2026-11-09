export function formatAmount(raw: string | number | null, decimals = 6): string {
  if (raw === null || !/^\d+$/.test(String(raw))) return "-";
  const value = BigInt(raw);
  const unit = 10n ** BigInt(decimals);
  const whole = (value / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const fraction = (value % unit).toString().padStart(decimals, "0").slice(0, 2).replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : whole;
}

export const formatDate = (seconds: number | null): string =>
  seconds ? new Date(seconds * 1000).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

export const shortAddress = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  reserved: "Reservada",
  agreed: "Acordada",
  delivered: "Entregada",
  settled: "Cerrada",
  cancelled: "Cancelada",
  disputed: "En reclamo",
};

export const SELFIE_LABELS: Record<string, string> = {
  none: "Sin selfie",
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
};
