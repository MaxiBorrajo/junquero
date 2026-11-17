import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import type { ReceiptItem } from "../api/types";
import { Icon } from "../components/Icon";
import { Screen, Secondary, Title } from "../components/ui";
import { t } from "../i18n";
import { receiptDate } from "../lib/closing";
import { useSession } from "../session/SessionProvider";
import { colors, radius, spacing, text } from "../theme";

// Los comprobantes de una persona como medallas: nombre del trabajo, rubro y fecha de cierre. Lo ve ella y quien mire su perfil.
export default function ReceiptsScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { api, address: me } = useSession();
  const mine = Boolean(me) && String(me).toLowerCase() === String(address).toLowerCase();
  const receipts = useQuery({ queryKey: ["receipts", address], queryFn: async () => (await api.get<{ receipts: ReceiptItem[] }>(`/profiles/${address}/receipts`)).receipts });
  const list = receipts.data ?? [];

  return (
    <Screen>
      <Title>{t.medals.title}</Title>
      <Secondary>{t.medals.intro}</Secondary>
      {receipts.isLoading ? <Secondary>{t.common.loading}</Secondary> : null}
      {receipts.data && list.length === 0 ? <Secondary>{mine ? t.medals.emptyMine : t.medals.empty}</Secondary> : null}
      <View style={styles.grid}>
        {list.map((item) => (
          <Medal key={item.orderId} item={item} />
        ))}
      </View>
    </Screen>
  );
}

function Medal({ item }: { item: ReceiptItem }) {
  const title = item.title || t.medals.untitled;
  const category = t.publish.categories[item.category] ?? "";
  return (
    <View style={styles.medal} accessible accessibilityLabel={`${title}. ${category}. ${receiptDate(item)}`}>
      <View style={styles.ring}>
        <View style={styles.disc}>
          <Icon name="shield" size={30} color={colors.white} />
        </View>
      </View>
      <Text style={[text.subtitle, styles.center]} numberOfLines={2}>{title}</Text>
      {category ? <Text style={[text.label, styles.center, { color: colors.brick }]}>{category}</Text> : null}
      <Text style={[text.secondary, styles.center]}>{receiptDate(item)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  medal: { width: "47%", alignItems: "center", gap: spacing.xs, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md },
  ring: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: colors.brick, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  disc: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brick, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
});
