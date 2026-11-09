import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import type { Changa } from "../api/types";
import { t } from "../i18n";
import { formatDate, formatDistance } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { statusLabel } from "../lib/status";
import { colors, radius, spacing, text } from "../theme";

const WARN_STATUSES = new Set(["disputed", "cancelled"]);

export function ChangaCard({ changa, distanceM, onPress, status, action, unavailable = false }: { changa: Changa; distanceM?: number; onPress: () => void; status?: string; action?: { label: string; onPress: () => void }; unavailable?: boolean }) {
  const { spec } = changa;
  const where = [t.publish.categories[spec.category], spec.modality === "remote" ? t.map.remoteTag : t.map.onsiteTag, distanceM !== undefined ? `${t.map.away} ${formatDistance(distanceM)}` : null].filter(Boolean).join(" · ");
  const when = spec.startsAt ?? spec.deadline ?? null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
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
            <View style={[styles.badge, WARN_STATUSES.has(status) && styles.badgeWarn]}>
              <Text style={[styles.badgeText, WARN_STATUSES.has(status) && styles.badgeWarnText]}>{statusLabel(status)}</Text>
            </View>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  title: { ...text.subtitle, flex: 1 },
  amount: { ...text.subtitle, color: colors.brick },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  badge: { backgroundColor: colors.sand, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { ...text.label, color: colors.ink },
  badgeWarn: { backgroundColor: colors.error },
  badgeWarnText: { color: colors.white },
  action: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2 },
  actionLabel: { ...text.label, color: colors.brick },
  unavailable: { ...text.label, color: colors.error },
});
