import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Changa } from "../api/types";
import { t } from "../i18n";
import { formatDistance } from "../lib/format";
import { formatUsdc } from "../lib/money";
import { colors, radius, spacing, text } from "../theme";

export function ChangaCard({ changa, distanceM, onPress, unavailable = false }: { changa: Changa; distanceM?: number; onPress: () => void; unavailable?: boolean }) {
  const remote = changa.spec.modality === "remote";
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={2}>
          {changa.spec.title}
        </Text>
        <Text style={styles.amount}>{formatUsdc(changa.amount)}</Text>
      </View>
      <Text style={text.secondary}>
        {remote ? t.map.remoteTag : t.map.onsiteTag}
        {distanceM !== undefined ? ` · ${t.map.away} ${formatDistance(distanceM)}` : ""}
      </Text>
      {unavailable ? <Text style={styles.unavailable}>{t.map.unavailable}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.85 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  title: { ...text.subtitle, flex: 1 },
  amount: { ...text.subtitle, color: colors.brick },
  unavailable: { ...text.label, color: colors.error },
});
