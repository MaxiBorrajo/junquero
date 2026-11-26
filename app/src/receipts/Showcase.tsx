import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import type { ReceiptItem } from "../api/types";
import { t } from "../i18n";
import { receiptMonthLabel } from "../lib/closing";
import { colors, fonts, radius, spacing } from "../theme";
import { CARD_HEIGHT, CARD_WIDTH, paletteOf } from "./cardSvg";
import { ReceiptCard } from "./ReceiptCard";

export type ShowcaseMode = "estatica" | "dorso" | "inclinable" | "flotante";
export const SHOWCASE_MODES: { key: ShowcaseMode; label: string }[] = [
  { key: "estatica", label: "Estática" },
  { key: "dorso", label: "Dorso" },
  { key: "inclinable", label: "Inclinable" },
  { key: "flotante", label: "Flotante" },
];

const SAND = "#E7C98B";
const CREAM = "#F4EEE6";
const MUTED = "#D9CDBE";
const MAX_TILT = 16;

// Cómo se presenta el comprobante en su detalle: quieto, con dorso que se da vuelta, inclinable con el dedo (con brillo) o flotando solo.
export function ReceiptShowcase({ item, width, mode }: { item: ReceiptItem; width: number; mode: ShowcaseMode }) {
  const height = (width * CARD_HEIGHT) / CARD_WIDTH;
  if (mode === "dorso") return <Flip item={item} width={width} height={height} />;
  if (mode === "inclinable") return <Tilt item={item} width={width} height={height} />;
  if (mode === "flotante") return <Float item={item} width={width} height={height} />;
  return (
    <View style={[styles.shadow, { width, height }]}>
      <ReceiptCard item={item} width={width} />
    </View>
  );
}

// Un destello diagonal que se desliza sobre la tarjeta. `position` va de -1 (afuera a la izquierda) a 1 (afuera a la derecha).
function Shine({ width, height, position }: { width: number; height: number; position: Animated.AnimatedInterpolation<number> | Animated.Value }) {
  const band = width * 0.7;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: "hidden", borderRadius: radius.lg }]}
    >
      <Animated.View style={{ position: "absolute", top: -height * 0.2, width: band, height: height * 1.4, transform: [{ translateX: Animated.multiply(position, width * 0.9) }, { rotate: "18deg" }] }}>
        <Svg width={band} height={height * 1.4}>
          <Defs>
            <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.34" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width={band} height={height * 1.4} fill="url(#shine)" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

// Se inclina siguiendo el dedo, con perspectiva, y un brillo que se mueve con la inclinación. Al soltar vuelve a su lugar.
function Tilt({ item, width, height }: { item: ReceiptItem; width: number; height: number }) {
  const x = useRef(new Animated.Value(0)).current; // -1 a 1
  const y = useRef(new Animated.Value(0)).current;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_event, gesture) => {
          x.setValue(Math.max(-1, Math.min(1, gesture.dx / (width * 0.6))));
          y.setValue(Math.max(-1, Math.min(1, gesture.dy / (height * 0.6))));
        },
        onPanResponderRelease: () => {
          Animated.spring(x, { toValue: 0, useNativeDriver: false, friction: 5 }).start();
          Animated.spring(y, { toValue: 0, useNativeDriver: false, friction: 5 }).start();
        },
      }),
    [x, y, width, height],
  );
  const rotateY = x.interpolate({ inputRange: [-1, 1], outputRange: [`-${MAX_TILT}deg`, `${MAX_TILT}deg`] });
  const rotateX = y.interpolate({ inputRange: [-1, 1], outputRange: [`${MAX_TILT}deg`, `-${MAX_TILT}deg`] });
  return (
    <View {...pan.panHandlers} style={{ width, height }}>
      <Animated.View style={[styles.shadow, { width, height, transform: [{ perspective: 900 }, { rotateX }, { rotateY }] }]}>
        <ReceiptCard item={item} width={width} />
        <Shine width={width} height={height} position={x} />
      </Animated.View>
    </View>
  );
}

// Flota sola: sube y baja suave, se mece y el brillo pasa de a ratos.
function Float({ item, width, height }: { item: ReceiptItem; width: number; height: number }) {
  const t1 = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const floating = Animated.loop(Animated.sequence([Animated.timing(t1, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }), Animated.timing(t1, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false })]));
    const shining = Animated.loop(Animated.sequence([Animated.delay(1400), Animated.timing(sweep, { toValue: 1.3, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: false }), Animated.timing(sweep, { toValue: -1, duration: 0, useNativeDriver: false })]));
    floating.start();
    shining.start();
    return () => {
      floating.stop();
      shining.stop();
    };
  }, [t1, sweep]);
  const translateY = t1.interpolate({ inputRange: [0, 1], outputRange: [-6, 8] });
  const rotateY = t1.interpolate({ inputRange: [0, 1], outputRange: ["-7deg", "7deg"] });
  const rotateX = t1.interpolate({ inputRange: [0, 1], outputRange: ["3deg", "-3deg"] });
  return (
    <View style={{ width, height: height + 24, justifyContent: "center" }}>
      <Animated.View style={[styles.shadow, { width, height, transform: [{ perspective: 900 }, { translateY }, { rotateX }, { rotateY }] }]}>
        <ReceiptCard item={item} width={width} />
        <Shine width={width} height={height} position={sweep} />
      </Animated.View>
    </View>
  );
}

// Se da vuelta al tocarla: el frente es la tarjeta y el dorso trae todos los datos y el comentario.
function Flip({ item, width, height }: { item: ReceiptItem; width: number; height: number }) {
  const turn = useRef(new Animated.Value(0)).current;
  const [back, setBack] = useState(false);
  const flip = () => {
    Animated.spring(turn, { toValue: back ? 0 : 1, friction: 7, tension: 40, useNativeDriver: true }).start();
    setBack(!back);
  };
  const front = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const rear = turn.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  return (
    <Pressable onPress={flip} accessibilityRole="button" accessibilityLabel={back ? "Ver el frente del comprobante" : "Ver el dorso del comprobante"} style={{ width, height }}>
      <Animated.View style={[styles.face, styles.shadow, { width, height, transform: [{ perspective: 1000 }, { rotateY: front }] }]}>
        <ReceiptCard item={item} width={width} />
      </Animated.View>
      <Animated.View style={[styles.face, styles.shadow, { width, height, transform: [{ perspective: 1000 }, { rotateY: rear }] }]}>
        <Back item={item} />
      </Animated.View>
    </Pressable>
  );
}

function Back({ item }: { item: ReceiptItem }) {
  const c = paletteOf(item.category);
  const categories = t.publish.categories as readonly string[];
  const rows: [string, string][] = [
    [t.receiptDetail.category, categories[item.category] ?? ""],
    [t.receiptDetail.modality, item.remote ? t.receiptDetail.remote : t.receiptDetail.onsite],
    [t.receiptDetail.month, receiptMonthLabel(item.month)],
    [t.receiptDetail.rating, item.rating ? `${item.rating} ${t.receiptDetail.outOf}` : "-"],
    ...(item.payerName ? ([[t.receiptDetail.ratedBy, item.payerName]] as [string, string][]) : []),
  ];
  return (
    <View style={[styles.back, { backgroundColor: c.deep }]}>
      <View style={styles.backBar} />
      <Text style={styles.backTitle} numberOfLines={2}>{item.title || t.medals.untitled}</Text>
      <View style={{ gap: spacing.sm }}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.backRow}>
            <Text style={styles.backLabel}>{label}</Text>
            <Text style={styles.backValue} numberOfLines={1}>{value}</Text>
          </View>
        ))}
      </View>
      {item.comment ? <Text style={styles.backComment} numberOfLines={5}>{`“${item.comment}”`}</Text> : null}
      <Text style={styles.backFoot}>{`Intransferible · #${item.orderId}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.lg,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  face: { position: "absolute", backfaceVisibility: "hidden" },
  back: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, paddingLeft: spacing.xl, gap: spacing.md, overflow: "hidden", justifyContent: "space-between" },
  backBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 8, backgroundColor: SAND },
  backTitle: { fontFamily: fonts.bold, fontSize: 22, color: CREAM },
  backRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  backLabel: { fontFamily: fonts.regular, fontSize: 14, color: MUTED },
  backValue: { fontFamily: fonts.medium, fontSize: 14, color: CREAM, flexShrink: 1, textAlign: "right" },
  backComment: { fontFamily: fonts.regular, fontStyle: "italic", fontSize: 14, color: CREAM, borderLeftWidth: 3, borderLeftColor: SAND, paddingLeft: spacing.md },
  backFoot: { fontFamily: fonts.regular, fontSize: 12, color: colors.line },
});
