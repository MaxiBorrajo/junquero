import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "../theme";

// Tarjeta blanca con borde: la forma única de agrupar información en la app. Con `onPress` se vuelve tocable.
export function Card({ children, gap = "sm", onPress, style }: { children: ReactNode; gap?: keyof typeof spacing; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const base = [styles.card, { gap: spacing[gap] }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  pressed: { opacity: 0.85 },
});
