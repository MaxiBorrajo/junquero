import { Text, View } from "react-native";
import type { EvidenceItem } from "../data/useOrder";
import { t } from "../i18n";
import { spacing, text } from "../theme";
import { Secondary } from "../components/ui";
import { EvidenceThumbnails, useEvidenceNames } from "./EvidenceSection";

const STATEMENT = "relato.txt";
// Los archivos del pedido se suben junto con el texto; se deja un margen por si alguno quedó un instante antes.
const MARGIN_SECONDS = 30;

// Lo último que pidió quien publicó: el texto y los archivos del pedido de cambios más reciente (lo que subió desde su último relato).
export function ChangeRequest({ orderId, items, payer }: { orderId: number; items: EvidenceItem[]; payer: string }) {
  const mine = items.filter((item) => item.uploader.toLowerCase() === payer.toLowerCase());
  const names = useEvidenceNames(orderId, mine);
  const statements = mine.filter((item) => names[item.hash] === STATEMENT);
  const since = statements.length > 0 ? Math.max(...statements.map((item) => item.createdAt)) - MARGIN_SECONDS : null;
  const request = since === null ? [] : mine.filter((item) => item.createdAt >= since);
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={text.subtitle}>{t.order.changesAskedTitle}</Text>
      <Secondary>{t.order.changesAskedHint}</Secondary>
      {request.length > 0 ? <EvidenceThumbnails orderId={orderId} items={request} /> : <Secondary>{t.common.loading}</Secondary>}
    </View>
  );
}
