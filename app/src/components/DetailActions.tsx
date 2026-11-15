import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, fonts, radius, spacing } from "../theme";

export interface DetailAction {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
  // Acción que destruye algo (cancelar): se muestra en rojo.
  danger?: boolean;
}

// Las acciones secundarias de la pantalla de una changa (compartir, reportar, cancelar) en una tarjeta, una por fila.
export function DetailActions({ actions }: { actions: DetailAction[] }) {
  if (actions.length === 0) return null;
  return (
    <View style={styles.card}>
      {actions.map((action, index) => (
        <Pressable key={action.key} accessibilityRole="button" onPress={action.onPress} style={[styles.row, index > 0 && styles.divider]}>
          <Icon name={action.icon} size={20} color={action.danger ? colors.error : colors.brick} />
          <Text style={[styles.label, { color: action.danger ? colors.error : colors.ink }]}>{action.label}</Text>
          <Icon name="chevron" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm + 4, paddingVertical: spacing.sm + 6, paddingHorizontal: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: 15 },
});
