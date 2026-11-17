import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { colors, radius, spacing, text } from "../theme";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { Secondary } from "./ui";

// Una sola tarjeta con la cantidad de comprobantes: con el tiempo van a ser muchos, así que se ven en su propia pantalla, como medallas.
export function ReceiptsCard({ address, count, mine = false }: { address: string; count: number; mine?: boolean }) {
  const summary = count === 0 ? (mine ? t.publicProfile.receiptsEmptyMine : t.publicProfile.receiptsEmpty) : count === 1 ? t.publicProfile.receiptsOne : t.publicProfile.receiptsMany.replace("{n}", String(count));
  return (
    <Card gap="xs" onPress={() => router.push({ pathname: "/receipts", params: { address } })}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Icon name="shield" size={18} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.label}>{t.publicProfile.receipts}</Text>
          <Text style={text.body}>{summary}</Text>
        </View>
        <Icon name="chevron" size={18} color={colors.muted} />
      </View>
      {count > 0 ? <Secondary>{t.publicProfile.receiptsHint}</Secondary> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  badge: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.brick, alignItems: "center", justifyContent: "center" },
});
