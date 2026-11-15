import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { StatusChip } from "./StatusChip";
import { StatusStrip, type StripData } from "./StatusStrip";
import { Icon } from "./Icon";
import type { Changa } from "../api/types";
import { t } from "../i18n";
import { formatDate, formatDistance } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { statusLabel } from "../lib/status";
import { colors, spacing, text } from "../theme";

const WARN_STATUSES = new Set(["disputed", "cancelled", "cancelling"]);

export function ChangaCard({ changa, distanceM, onPress, status, action, unavailable = false, strip }: { changa: Changa; distanceM?: number; onPress: () => void; status?: string; action?: { label: string; onPress: () => void }; unavailable?: boolean; strip?: StripData }) {
  const { spec } = changa;
  const where = [t.publish.categories[spec.category], spec.modality === "remote" ? t.map.remoteTag : t.map.onsiteTag, distanceM !== undefined ? `${t.map.away} ${formatDistance(distanceM)}` : null].filter(Boolean).join(" · ");
  const when = spec.startsAt ?? spec.deadline ?? null;
  return (
    <Card gap="xs" onPress={onPress}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={2}>
          {spec.title}
        </Text>
        <Text style={styles.amount}>{formatUsdc(changa.amount)}</Text>
      </View>
      <Text style={text.secondary}>{where}</Text>
      {when ? <Text style={text.secondary}>{`${spec.modality === "remote" ? `${t.publish.deadlineLabel} ` : ""}${formatDate(when)}`}</Text> : null}
      {status || unavailable || action ? (
        <View style={styles.footer}>
          {status ? (
            <StatusChip label={statusLabel(status)} warn={WARN_STATUSES.has(status)} />
          ) : null}
          {unavailable ? <Text style={styles.unavailable}>{t.map.unavailable}</Text> : null}
          {action ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={action.onPress} style={styles.action}>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Icon name="chevron" size={18} color={colors.brick} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {strip ? <StatusStrip data={strip} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  title: { ...text.subtitle, flex: 1 },
  amount: { ...text.subtitle, color: colors.brick },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  action: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2 },
  actionLabel: { ...text.label, color: colors.brick },
  unavailable: { ...text.label, color: colors.error },
});
