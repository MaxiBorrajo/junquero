import { useQuery } from "@tanstack/react-query";
import { Text } from "react-native";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { text } from "../theme";
import { Card } from "./Card";
import { Body } from "./ui";

export interface ExitReason {
  kind: "abandoned" | "terminated";
  actor: string;
  reason: string;
  createdAt: number;
}

// Motivos que dieron quien dejó el trabajo o quien lo terminó. Los ven las dos partes y quienes se postularon.
export function ExitReasons({ orderId }: { orderId: number | null }) {
  const { api, address } = useSession();
  const reasons = useQuery({
    queryKey: ["exit-reasons", orderId, address],
    enabled: orderId !== null && Boolean(address),
    queryFn: async () => (await api.get<{ reasons: ExitReason[] }>(`/me/orders/${orderId}/exit-reasons`)).reasons,
  });
  const latest = (reasons.data ?? []).slice(0, 2);
  if (latest.length === 0) return null;
  return (
    <Card gap="xs">
      <Text style={text.label}>{t.exitReasons.title}</Text>
      {latest.map((item) => (
        <Body key={`${item.kind}-${item.createdAt}`}>{`${item.kind === "abandoned" ? t.exitReasons.abandoned : t.exitReasons.terminated} ${item.reason}`}</Body>
      ))}
    </Card>
  );
}
