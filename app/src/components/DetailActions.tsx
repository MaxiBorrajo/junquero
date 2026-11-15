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
  // Número que se muestra antes de la flecha (por ejemplo, notificaciones sin leer).
  badge?: number;
  // Texto chico debajo del nombre de la acción.
  hint?: string;
}

// Las acciones secundarias de la pantalla de una changa (compartir, reportar, cancelar) en una tarjeta, una por fila.
export function DetailActions({ actions }: { actions: DetailAction[] }) {
  if (actions.length === 0) return null;
  return (
    <View style={styles.card}>
      {actions.map((action, index) => (
        <Pressable key={action.key} accessibilityRole="button" onPress={action.onPress} style={[styles.row, index > 0 && styles.divider]}>
          <Icon name={action.icon} size={20} color={action.danger ? colors.error : colors.brick} />
          <View style={styles.texts}>
            <Text style={[styles.label, { color: action.danger ? colors.error : colors.ink }]}>{action.label}</Text>
            {action.hint ? <Text style={styles.hint}>{action.hint}</Text> : null}
          </View>
          {action.badge ? (
            <View style={styles.badge} accessibilityLabel={String(action.badge)}>
              <Text style={styles.badgeText}>{action.badge > 99 ? "99+" : action.badge}</Text>
            </View>
          ) : null}
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
  texts: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.medium, fontSize: 15 },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brick, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
});
