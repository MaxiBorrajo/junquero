import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

export function Stars({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.row} accessibilityRole="adjustable">
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} accessibilityLabel={`${star}`} onPress={() => onChange(star)} hitSlop={8}>
          <Text style={[styles.star, star <= value && styles.on]}>{star <= value ? "★" : "☆"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  star: { fontSize: 40, color: colors.line },
  on: { color: colors.brick },
});
