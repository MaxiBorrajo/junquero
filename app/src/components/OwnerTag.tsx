import { StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { colors, fonts, spacing } from "../theme";

// Línea chica sobre el título que avisa que el trabajo lo publicó quien lo está mirando.
// Va arriba del título (y no al lado) para que no se rompa con títulos largos.
export function OwnerTag({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <Icon name="user" size={14} color={colors.brick} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs + 2 },
  text: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: colors.brick },
});
