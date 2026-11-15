import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, radius, spacing, text } from "../theme";

export type StripTone = "success" | "neutral" | "info";

export interface StripData {
  tone: StripTone;
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}

const TONE: Record<StripTone, { color: string; tint: string }> = {
  success: { color: colors.success, tint: colors.successTint },
  neutral: { color: colors.muted, tint: colors.background },
  info: { color: colors.brick, tint: colors.sand },
};

// Estado de una postulación dentro de su tarjeta: círculo con ícono, estado y ayuda; si hay acción, toda la fila es tocable.
export function StatusStrip({ data }: { data: StripData }) {
  const { color, tint } = TONE[data.tone];
  const content = (
    <>
      <View style={[styles.badge, { backgroundColor: color }]}>
        <Icon name={data.icon} size={18} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={text.body}>{data.title}</Text>
        <Text style={text.secondary}>{data.body}</Text>
      </View>
      {data.action ? <Icon name="chevron" size={20} color={color} /> : null}
    </>
  );
  return data.action ? (
    <Pressable accessibilityRole="button" accessibilityLabel={data.action.label} onPress={data.action.onPress} style={[styles.row, { backgroundColor: tint }]}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, { backgroundColor: tint }]}>{content}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderRadius: radius.md, padding: spacing.sm },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
