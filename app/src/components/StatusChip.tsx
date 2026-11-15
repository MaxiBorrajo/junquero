import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, text } from "../theme";

// Estado de algo (un trabajo, un grupo, una postulación) en una pastilla; va al lado del título, nunca como texto suelto.
export function StatusChip({ label, warn = false }: { label: string; warn?: boolean }) {
  return (
    <View style={[styles.chip, warn && styles.warn]}>
      <Text style={[text.label, { color: warn ? colors.white : colors.ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { backgroundColor: colors.sand, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: "flex-start" },
  warn: { backgroundColor: colors.error },
});
