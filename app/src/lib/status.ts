import { t } from "../i18n";

export function statusLabel(status: string): string {
  const labels = t.mine.status as Record<string, string>;
  return labels[status] ?? status;
}
