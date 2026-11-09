import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Icon } from "./Icon";
import { t } from "../i18n";
import { colors, radius, spacing, text } from "../theme";

export function SearchField({ value, onChange, placeholder = t.common.search }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <View style={styles.box}>
      <Icon name="search" size={20} color={colors.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} returnKeyType="search" autoCorrect={false} />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t.common.clear} hitSlop={10} onPress={() => onChange("")}>
          <Icon name="close" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, minHeight: 46 },
  input: { ...text.body, flex: 1, paddingVertical: 0 },
});
