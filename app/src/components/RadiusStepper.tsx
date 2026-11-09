import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./Icon";
import { t } from "../i18n";
import { nextRadius, radiusLabel } from "../lib/radius";
import { colors, radius, spacing, text } from "../theme";

export function RadiusStepper({ value, onChange }: { value: number; onChange: (meters: number) => void }) {
  return (
    <View style={styles.row}>
      <Step icon="minus" label={t.profile.radiusLess} onPress={() => onChange(nextRadius(value, -1))} />
      <View style={styles.value}>
        <Text style={text.secondary}>{t.profile.radius}</Text>
        <Text style={text.subtitle}>{radiusLabel(value)}</Text>
      </View>
      <Step icon="plus" label={t.profile.radiusMore} onPress={() => onChange(nextRadius(value, 1))} />
    </View>
  );
}

function Step({ icon, label, onPress }: { icon: "minus" | "plus"; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={colors.brick} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  value: { flex: 1, alignItems: "center" },
  step: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.8 },
});
