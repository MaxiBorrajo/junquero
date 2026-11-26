import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import type { ReceiptItem } from "../api/types";
import { radius } from "../theme";
import { CARD_HEIGHT, CARD_WIDTH } from "./cardSvg";
import { ReceiptCard } from "./ReceiptCard";
import { useReceiptShape } from "./shapeStore";

// Un destello diagonal que se desliza sobre la tarjeta. `position` va de -1 (afuera a la izquierda) a 1,3 (afuera a la derecha).
function Shine({ width, height, position }: { width: number; height: number; position: Animated.Value }) {
  const band = width * 0.7;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden", borderRadius: radius.lg }]}>
      <Animated.View style={{ position: "absolute", top: -height * 0.2, width: band, height: height * 1.4, transform: [{ translateX: Animated.multiply(position, width * 0.9) }, { rotate: "18deg" }] }}>
        <Svg width={band} height={height * 1.4}>
          <Defs>
            <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.26" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect width={band} height={height * 1.4} fill="url(#shine)" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

// El comprobante en su detalle: flota solo (sube y baja suave, se mece) y cada tanto pasa un destello.
export function ReceiptShowcase({ item, width }: { item: ReceiptItem; width: number }) {
  const height = (width * CARD_HEIGHT) / CARD_WIDTH;
  const shape = useReceiptShape();
  const breath = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const floating = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(breath, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    const shining = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(sweep, { toValue: 1.3, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(sweep, { toValue: -1, duration: 0, useNativeDriver: false }),
      ]),
    );
    floating.start();
    shining.start();
    return () => {
      floating.stop();
      shining.stop();
    };
  }, [breath, sweep]);
  const translateY = breath.interpolate({ inputRange: [0, 1], outputRange: [-6, 8] });
  const rotateY = breath.interpolate({ inputRange: [0, 1], outputRange: ["-7deg", "7deg"] });
  const rotateX = breath.interpolate({ inputRange: [0, 1], outputRange: ["3deg", "-3deg"] });
  // La carta de colección tiene las esquinas transparentes: ahí no van ni la sombra ni el destello rectangulares.
  const rect = shape !== "coleccion";
  return (
    <View style={{ width, height: height + 24, justifyContent: "center" }}>
      <Animated.View style={[rect ? styles.shadow : undefined, { width, height, transform: [{ perspective: 900 }, { translateY }, { rotateX }, { rotateY }] }]}>
        <ReceiptCard item={item} width={width} />
        {rect ? <Shine width={width} height={height} position={sweep} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.lg, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
});
