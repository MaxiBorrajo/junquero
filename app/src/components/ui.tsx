import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius, spacing, text } from "../theme";

export function Screen({ children, scroll = true, footer }: { children: ReactNode; scroll?: boolean; footer?: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

type Variant = "primary" | "secondary" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonStyles[variant], inactive && styles.inactive, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? colors.white : colors.brick} /> : <Text style={[styles.buttonLabel, labelStyles[variant]]}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[text.label, selected && styles.chipOnLabel]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={text.title}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[text.body, style]}>{children}</Text>;
}

export function Secondary({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[text.secondary, style]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Text style={styles.errorIcon}>!</Text>
      <Text style={styles.errorText}>{children}</Text>
    </View>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={text.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, error ? styles.inputError : null]} {...input} />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={text.secondary}>{hint}</Text> : null}
    </View>
  );
}

export const gap = (size: keyof typeof spacing): ViewStyle => ({ height: spacing[size] });

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.brick },
  secondary: { backgroundColor: colors.sand },
  ghost: { backgroundColor: "transparent" },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.white },
  secondary: { color: colors.ink },
  ghost: { color: colors.brick },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  footer: { padding: spacing.md, gap: spacing.sm },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  buttonLabel: { ...text.button },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  errorBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.white, borderColor: colors.error, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  errorIcon: { ...text.button, color: colors.white, backgroundColor: colors.error, width: 24, height: 24, borderRadius: 12, textAlign: "center", lineHeight: 24 },
  errorText: { ...text.body, color: colors.error, flex: 1 },
  field: { gap: spacing.xs },
  input: { ...text.body, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52 },
  inputError: { borderColor: colors.error },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.brick, borderColor: colors.brick },
  chipOnLabel: { color: colors.white },
  fieldError: { ...text.secondary, color: colors.error },
});
