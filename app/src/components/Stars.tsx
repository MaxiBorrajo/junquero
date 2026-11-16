import { Pressable, StyleSheet, Text, View } from "react-native";
import { t } from "../i18n";
import { colors, spacing, text } from "../theme";

// Rating block: title, stars (dimmed until picked) and a word for the current value.
export function Stars({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={text.subtitle}>{t.order.rating}</Text>
        <Text style={[text.label, styles.current]}>{t.order.ratingLabels[value - 1]}</Text>
      </View>
      <View style={styles.row} accessibilityRole="adjustable">
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} accessibilityLabel={`${star}`} onPress={() => onChange(star)} hitSlop={8}>
            <Text style={[styles.star, star <= value ? styles.on : styles.off]}>★</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.ends}>
        <Text style={text.label}>{t.order.ratingLow}</Text>
        <Text style={text.label}>{t.order.ratingHigh}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: "row", justifyContent: "space-between" },
  star: { fontSize: 44 },
  on: { color: colors.brick },
  off: { color: colors.brick, opacity: 0.25 },
  ends: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  current: { color: colors.brick, fontSize: 14 },
});
