const DECIMALS = 6;

export function formatAmount(raw: string | null, decimals = DECIMALS): string {
  if (raw === null || !/^\d+$/.test(raw)) return "-";
  const value = BigInt(raw);
  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals, "0").slice(0, 2).replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${grouped},${fraction}` : grouped;
}

export const formatUsdc = (raw: string | null): string => `${formatAmount(raw)} USDC`;

export function toMicro(amount: string, decimals = DECIMALS): bigint {
  const [whole = "0", fraction = ""] = amount.replace(",", ".").split(".");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0").slice(0, decimals));
}
