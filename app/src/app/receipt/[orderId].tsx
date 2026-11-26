import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { ReceiptItem } from "../../api/types";
import { Card } from "../../components/Card";
import { Screen, Secondary, Title } from "../../components/ui";
import { t } from "../../i18n";
import { receiptMonthLabel } from "../../lib/closing";
import { ReceiptShowcase } from "../../receipts/Showcase";
import { useSession } from "../../session/SessionProvider";
import { colors, spacing, text } from "../../theme";

// Un comprobante en grande: la imagen y todos sus datos. Se llega desde la grilla de Comprobantes o desde el aviso de que se emitió.
export default function ReceiptDetail() {
  const { orderId, address } = useLocalSearchParams<{ orderId: string; address?: string }>();
  const { api, address: me } = useSession();
  const owner = (address || me || "").toString();
  const { width } = useWindowDimensions();
  const receipts = useQuery({
    queryKey: ["receipts", owner],
    enabled: Boolean(owner),
    queryFn: async () => (await api.get<{ receipts: ReceiptItem[] }>(`/profiles/${owner}/receipts`)).receipts,
  });
  const item = receipts.data?.find((entry) => entry.orderId === Number(orderId));
  const categories = t.publish.categories as readonly string[];

  return (
    <Screen>
      <Title>{t.receiptDetail.title}</Title>
      {receipts.isLoading ? <Secondary>{t.common.loading}</Secondary> : null}
      {receipts.data && !item ? <Secondary>{t.receiptDetail.notFound}</Secondary> : null}
      {item ? (
        <>
          {item.rated ? (
            <View style={styles.cardWrap}>
              <ReceiptShowcase item={item} width={Math.min(width - spacing.md * 2, 340)} />
            </View>
          ) : null}
          <Card gap="sm">
            <Fact label={t.receiptDetail.job} value={item.title || t.medals.untitled} />
            <Fact label={t.receiptDetail.category} value={categories[item.category] ?? ""} />
            {item.remote !== undefined ? <Fact label={t.receiptDetail.modality} value={item.remote ? t.receiptDetail.remote : t.receiptDetail.onsite} /> : null}
            <Fact label={t.receiptDetail.month} value={receiptMonthLabel(item.month)} />
            {item.rating ? <Fact label={t.receiptDetail.rating} value={`${item.rating} ${t.receiptDetail.outOf}`} /> : null}
            {item.payerName ? <Fact label={t.receiptDetail.ratedBy} value={item.payerName} /> : null}
            {item.comment ? (
              <View style={styles.quote}>
                <Text style={text.label}>{t.receiptDetail.comment}</Text>
                <Text style={text.body}>{`“${item.comment}”`}</Text>
              </View>
            ) : null}
            <Secondary>{item.rated ? t.receiptDetail.noteRated : t.receiptDetail.noteClaimed}</Secondary>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={text.secondary}>{label}</Text>
      <Text style={[text.body, { flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: { alignItems: "center", marginVertical: spacing.lg },
  fact: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  quote: { gap: spacing.xs, borderLeftWidth: 3, borderLeftColor: colors.brick, paddingLeft: spacing.md },
});
