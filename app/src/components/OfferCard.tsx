import { StyleSheet, Text, View } from "react-native";
import type { Milestone } from "../api/types";
import { t } from "../i18n";
import { formatUsdc } from "../lib/money";
import { Button } from "./ui";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { colors, spacing, text } from "../theme";

interface Props {
  role: "owner" | "applicant";
  name: string;
  plan: { milestones: Milestone[] } | null | undefined;
  total: bigint;
  published: string | null;
  onAccept?: () => void;
  onReject?: () => void;
  busy?: boolean;
}

// La propuesta de una persona postulada (otro plan o otro monto), dentro del chat. Quien publica la acepta (eso la elige) o la rechaza (sigue postulada); quien la mandó ve que está esperando.
export function OfferCard({ role, name, plan, total, published, onAccept, onReject, busy = false }: Props) {
  const card = t.offer.card;
  const diff = published !== null && /^\d+$/.test(published) ? total - BigInt(published) : null;
  const note = diff === null || diff === 0n ? null : (diff > 0n ? (role === "owner" ? card.higherOwner : card.higherMine) : card.lower).replace("{diff}", formatUsdc((diff > 0n ? diff : -diff).toString()));
  return (
    <Card gap="sm" style={styles.card}>
      <View style={styles.head}>
        <Icon name="edit" size={20} color={colors.brick} />
        <Text style={text.label}>{role === "owner" ? card.titleOwner.replace("{name}", name) : card.titleMine}</Text>
      </View>
      <Text style={text.subtitle}>{card.total.replace("{total}", formatUsdc(total.toString()))}</Text>
      {note ? <Text style={text.secondary}>{note}</Text> : null}
      {plan && plan.milestones.length > 0 ? (
        <View style={{ gap: 2 }}>
          {plan.milestones.map((item, index) => (
            <Text key={index} style={text.secondary}>{`${index + 1}. ${item.name} · ${formatUsdc(item.amount)} · ${item.criteria}`}</Text>
          ))}
        </View>
      ) : null}
      {role === "owner" ? (
        <>
          <Text style={text.secondary}>{busy ? (diff !== null && diff > 0n ? card.working : card.workingSame) : card.ownerHint.replace("{name}", name)}</Text>
          <View style={styles.actions}>
            <View style={{ flex: 1 }}>
              <Button label={card.reject} icon="close" variant="outline" disabled={busy} onPress={() => onReject?.()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={card.accept} icon="check" loading={busy} onPress={() => onAccept?.()} />
            </View>
          </View>
        </>
      ) : (
        <Text style={text.secondary}>{card.waiting}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.sand },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
});
