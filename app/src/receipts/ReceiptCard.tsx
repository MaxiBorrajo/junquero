import { StyleSheet } from "react-native";
import { SvgXml } from "react-native-svg";
import type { ReceiptItem } from "../api/types";
import { t } from "../i18n";
import { fonts, radius } from "../theme";
import { CARD_HEIGHT, CARD_WIDTH, receiptCardSvg } from "./cardSvg";
import { useReceiptShape } from "./shapeStore";

// La imagen del comprobante: la misma que ve quien abra el NFT en una billetera (la dibuja el mismo código que el servidor).
export function ReceiptCard({ item, width }: { item: ReceiptItem; width: number }) {
  const shape = useReceiptShape();
  const categories = t.publish.categories as readonly string[];
  const xml = receiptCardSvg(
    {
      orderId: item.orderId,
      title: item.title || t.medals.untitled,
      category: item.category,
      categoryName: categories[item.category] ?? "",
      remote: Boolean(item.remote),
      rating: item.rating ?? 0,
      month: item.month,
      payerName: item.payerName,
    },
    { regular: fonts.regular, bold: fonts.bold },
    shape,
  );
  return <SvgXml xml={xml} width={width} height={(width * CARD_HEIGHT) / CARD_WIDTH} style={styles.card} />;
}

const styles = StyleSheet.create({ card: { borderRadius: radius.lg, overflow: "hidden" } });
