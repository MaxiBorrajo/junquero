import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors, spacing } from "../theme";

export function PullSpinner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <View style={styles.box}>
      <ActivityIndicator color={colors.brick} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", paddingVertical: spacing.sm },
});
