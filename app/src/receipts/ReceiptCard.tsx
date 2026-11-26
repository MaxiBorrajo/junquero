import { SvgXml } from "react-native-svg";
import type { ReceiptItem } from "../api/types";
import { t } from "../i18n";
import { fonts } from "../theme";
import { CARD_HEIGHT, CARD_WIDTH, cornerRadius, receiptCardSvg } from "./cardSvg";

// La imagen del comprobante: la misma que ve quien abra el NFT en una billetera (la dibuja el mismo código que el servidor).
// `compact` (la grilla) muestra solo el título, más grande, junto al número y los juncos; la tarjeta completa es la del detalle.
export function ReceiptCard({ item, width, compact = false }: { item: ReceiptItem; width: number; compact?: boolean }) {
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
    compact,
  );
  return <SvgXml xml={xml} width={width} height={(width * CARD_HEIGHT) / CARD_WIDTH} style={{ borderRadius: cornerRadius(width), overflow: "hidden" }} />;
}

