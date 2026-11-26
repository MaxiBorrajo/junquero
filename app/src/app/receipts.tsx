import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import type { ReceiptItem } from "../api/types";
import { Icon } from "../components/Icon";
import { Chip, Screen, Secondary, Title } from "../components/ui";
import { t } from "../i18n";
import { receiptDate, receiptMonthLabel } from "../lib/closing";
import { paletteOf } from "../receipts/cardSvg";
import { ReceiptCard } from "../receipts/ReceiptCard";
import { useSession } from "../session/SessionProvider";
import { colors, fonts, radius, spacing, text } from "../theme";

type View_ = "grilla" | "carrusel" | "lista" | "pila";
const VIEWS: { key: View_; label: string }[] = [
  { key: "grilla", label: "Grilla" },
  { key: "carrusel", label: "Carrusel" },
  { key: "lista", label: "Lista" },
  { key: "pila", label: "Pila" },
];

// Los comprobantes de una persona. Lo ve ella y quien mire su perfil. Cuatro formas de verlos, para elegir la que mejor se siente.
export default function ReceiptsScreen() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { api, address: me } = useSession();
  const mine = Boolean(me) && String(me).toLowerCase() === String(address).toLowerCase();
  const receipts = useQuery({ queryKey: ["receipts", address], queryFn: async () => (await api.get<{ receipts: ReceiptItem[] }>(`/profiles/${address}/receipts`)).receipts });
  const [examples, setExamples] = useState(false);
  const list = [...(receipts.data ?? []), ...(examples ? SAMPLES : [])];
  const [view, setView] = useState<View_>("carrusel");
  // Los ejemplos no existen en el servidor: no abren detalle.
  const open = (item: ReceiptItem) => item.orderId >= 9000 ? undefined : router.push({ pathname: "/receipt/[orderId]", params: { orderId: String(item.orderId), address: String(address) } });

  return (
    <Screen>
      <Title>{t.medals.title}</Title>
      <Secondary>{t.medals.intro}</Secondary>
      {list.length > 0 || receipts.data ? (
        <View style={styles.chips}>
          {VIEWS.map((item) => (
            <Chip key={item.key} label={item.label} selected={view === item.key} onPress={() => setView(item.key)} />
          ))}
          <Chip label="Ejemplos (temporal)" selected={examples} onPress={() => setExamples((on) => !on)} />
        </View>
      ) : null}
      {receipts.isLoading ? <Secondary>{t.common.loading}</Secondary> : null}
      {receipts.data && list.length === 0 ? <Secondary>{mine ? t.medals.emptyMine : t.medals.empty}</Secondary> : null}
      {view === "grilla" ? <Grid list={list} open={open} /> : null}
      {view === "carrusel" ? <Carousel list={list} open={open} /> : null}
      {view === "lista" ? <List list={list} open={open} /> : null}
      {view === "pila" ? <Stack list={list} open={open} /> : null}
    </Screen>
  );
}

// Comprobantes de mentira para comparar las formas de mostrarlos. Temporal.
const SAMPLES: ReceiptItem[] = [
  { orderId: 9001, category: 1, month: 202611, title: "Poda de árboles y arreglo del jardín", closedAt: null, rating: 5, comment: "Dejó todo impecable y se llevó los residuos. Muy amable.", payerName: "Carlos R.", remote: false, rated: true },
  { orderId: 9002, category: 6, month: 202611, title: "Logo para una panadería", closedAt: null, rating: 4, comment: "Entregó rápido y aceptó los cambios que le pedí.", payerName: "Ana M.", remote: true, rated: true },
  { orderId: 9003, category: 2, month: 202610, title: "Mudanza de un departamento de dos ambientes", closedAt: null, rating: 5, comment: null, payerName: "Lucía P.", remote: false, rated: true },
  { orderId: 9004, category: 3, month: 202610, title: "Limpieza profunda", closedAt: null, rating: 3, comment: "Estuvo bien, aunque llegó un poco tarde.", payerName: null, remote: false, rated: true },
  { orderId: 9005, category: 5, month: 202609, title: "Configurar la red del local", closedAt: null, rating: 5, comment: "Explicó todo con paciencia. Lo recomiendo.", payerName: "Martín G.", remote: true, rated: true },
];

type Views = { list: ReceiptItem[]; open: (item: ReceiptItem) => void };
const label = (item: ReceiptItem) => t.medals.open.replace("{title}", item.title || t.medals.untitled);
const categoryOf = (item: ReceiptItem) => (t.publish.categories as readonly string[])[item.category] ?? "";

function Grid({ list, open }: Views) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - spacing.md * 3) / 2;
  return (
    <View style={styles.grid}>
      {list.map((item) => (
        <Pressable key={item.orderId} accessibilityRole="button" accessibilityLabel={label(item)} onPress={() => open(item)} style={{ width: item.rated ? cardWidth : "47%" }}>
          {item.rated ? <ReceiptCard item={item} width={cardWidth} compact /> : <Medal item={item} />}
        </Pressable>
      ))}
    </View>
  );
}

// Una tarjeta completa por vez, que se desliza de costado y deja asomar la siguiente.
function Carousel({ list, open }: Views) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width * 0.74, 320);
  const step = cardWidth + spacing.md;
  const [index, setIndex] = useState(0);
  const onEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(event.nativeEvent.contentOffset.x / step));
  return (
    <View style={{ gap: spacing.md, marginHorizontal: -spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={step} decelerationRate="fast" onMomentumScrollEnd={onEnd} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.md }}>
        {list.map((item) => (
          <Pressable key={item.orderId} accessibilityRole="button" accessibilityLabel={label(item)} onPress={() => open(item)} style={{ width: cardWidth }}>
            {item.rated ? <ReceiptCard item={item} width={cardWidth} /> : <Medal item={item} />}
          </Pressable>
        ))}
      </ScrollView>
      {list.length > 1 ? <Text style={[text.label, styles.center]}>{`${Math.min(index + 1, list.length)} de ${list.length}`}</Text> : null}
    </View>
  );
}

// Una fila por comprobante, con la nota, el título, los datos y el comienzo del comentario.
function List({ list, open }: Views) {
  return (
    <View style={{ gap: spacing.sm }}>
      {list.map((item) => {
        const deep = paletteOf(item.category).deep;
        return (
          <Pressable key={item.orderId} accessibilityRole="button" accessibilityLabel={label(item)} onPress={() => open(item)} style={styles.row}>
            <View style={[styles.badge, { backgroundColor: deep }]}>
              <Text style={styles.badgeNumber}>{item.rating ?? "–"}</Text>
              <Text style={styles.badgeOf}>/ 5</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={text.subtitle} numberOfLines={1}>{item.title || t.medals.untitled}</Text>
              <Text style={text.secondary} numberOfLines={1}>{[categoryOf(item), receiptMonthLabel(item.month), item.payerName ? `Calificó ${item.payerName}` : ""].filter(Boolean).join(" · ")}</Text>
              {item.comment ? <Text style={[text.body, styles.quote]} numberOfLines={2}>{`“${item.comment}”`}</Text> : null}
            </View>
            <Icon name="chevron" size={18} color={colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

// Como las tarjetas de una billetera: una arriba de otra, cada una deja ver su franja con el título y la nota; la última se ve entera.
const STACK_HEIGHT = 168;
const STACK_VISIBLE = 66;
function Stack({ list, open }: Views) {
  return (
    <View style={{ paddingBottom: spacing.md }}>
      {list.map((item, i) => {
        const c = paletteOf(item.category);
        return (
          <Pressable
            key={item.orderId}
            accessibilityRole="button"
            accessibilityLabel={label(item)}
            onPress={() => open(item)}
            style={[styles.stackCard, { backgroundColor: c.deep, height: STACK_HEIGHT, marginTop: i === 0 ? 0 : STACK_VISIBLE - STACK_HEIGHT, zIndex: i }]}
          >
            <View style={[styles.stackBar, { backgroundColor: "#E7C98B" }]} />
            <View style={styles.stackTop}>
              <Text style={styles.stackTitle} numberOfLines={1}>{item.title || t.medals.untitled}</Text>
              <Text style={styles.stackRating}>{item.rating ? `${item.rating}/5` : ""}</Text>
            </View>
            <Text style={styles.stackMeta} numberOfLines={1}>{[categoryOf(item), receiptMonthLabel(item.month)].filter(Boolean).join(" · ")}</Text>
            {item.comment ? <Text style={styles.stackQuote} numberOfLines={2}>{`“${item.comment}”`}</Text> : null}
          </Pressable>
        );
      })}
    </View>
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
  medal: { width: "100%", alignItems: "center", gap: spacing.xs, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md },
  ring: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: colors.brick, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  disc: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brick, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.md },
  badge: { width: 64, height: 64, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  badgeNumber: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 32, color: "#E7C98B" },
  badgeOf: { fontFamily: fonts.regular, fontSize: 11, color: "#E7C98B" },
  quote: { fontStyle: "italic", color: colors.muted, fontSize: 14 },
  stackCard: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, paddingVertical: spacing.md, paddingLeft: spacing.lg, paddingRight: spacing.md, overflow: "hidden", gap: spacing.xs, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  stackBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 8 },
  stackTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md },
  stackTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 20, color: "#F4EEE6" },
  stackRating: { fontFamily: fonts.extrabold, fontSize: 22, color: "#E7C98B" },
  stackMeta: { fontFamily: fonts.regular, fontSize: 14, color: "#D9CDBE" },
  stackQuote: { fontFamily: fonts.regular, fontStyle: "italic", fontSize: 14, color: "#F4EEE6", marginTop: spacing.xs },
});
