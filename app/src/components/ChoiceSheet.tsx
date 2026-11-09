import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { colors, radius, spacing, text } from "../theme";

export interface Choice {
  key: string;
  label: string;
  icon: IconName;
  onPress: () => void;
}

export function ChoiceSheet({ visible, choices, onClose }: { visible: boolean; choices: Choice[]; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          {choices.map((choice) => (
            <Pressable
              key={choice.key}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                choice.onPress();
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Icon name={choice.icon} size={24} color={colors.brick} />
              <Text style={text.subtitle}>{choice.label}</Text>
            </Pressable>
          ))}
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(35,24,21,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  pressed: { backgroundColor: colors.sand },
});
