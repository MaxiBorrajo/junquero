import { router } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { t } from "../i18n";
import { colors, radius, spacing, text } from "../theme";
import type { PullRefresh } from "../lib/useManualRefresh";
import { Icon, type IconName } from "./Icon";
import { usePullGesture } from "../lib/usePullGesture";
import { PullSpinner } from "./PullSpinner";

const NO_REFRESH: PullRefresh = { refreshing: false, onRefresh: () => undefined };

export function BackButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t.common.back} hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.back}>
      <Icon name="back" size={22} color={colors.ink} />
    </Pressable>
  );
}

export function Screen({ children, scroll = true, footer, back = true, refresh }: { children: ReactNode; scroll?: boolean; footer?: ReactNode; back?: boolean; refresh?: PullRefresh }) {
  const pull = usePullGesture(refresh ?? NO_REFRESH);
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {back ? <BackButton /> : null}
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" {...(refresh ? pull : {})}>
            <PullSpinner active={refresh?.refreshing ?? false} />
            {children}
          </ScrollView>
        ) : (
          <View style={styles.content}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
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
      {loading ? (
        <View style={styles.busy}>
          <ActivityIndicator color={variant === "primary" ? colors.white : colors.brick} />
          {label ? <Text style={[styles.buttonLabel, labelStyles[variant]]}>{label}</Text> : null}
        </View>
      ) : (
        <View style={styles.busy}>
          {icon ? <Icon name={icon} size={20} color={labelStyles[variant].color} /> : null}
          <Text style={[styles.buttonLabel, labelStyles[variant]]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[text.label, styles.chipLabel, selected && styles.chipOnLabel]}>{label}</Text>
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
      <TextInput placeholderTextColor={colors.muted} style={[styles.input, input.multiline ? styles.multiline : null, error ? styles.inputError : null]} {...input} />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={text.secondary}>{hint}</Text> : null}
    </View>
  );
}

export const gap = (size: keyof typeof spacing): ViewStyle => ({ height: spacing[size] });

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.brick },
  secondary: { backgroundColor: colors.sand },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.error },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.white },
  secondary: { color: colors.ink },
  ghost: { color: colors.brick },
  danger: { color: colors.error },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  back: { width: 44, height: 44, marginLeft: spacing.sm, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  footer: { padding: spacing.md, gap: spacing.sm },
  button: { minHeight: 52, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  buttonLabel: { ...text.button },
  busy: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  errorBox: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.white, borderColor: colors.error, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, alignItems: "center" },
  errorIcon: { ...text.button, color: colors.white, backgroundColor: colors.error, width: 24, height: 24, borderRadius: 12, textAlign: "center", lineHeight: 24 },
  errorText: { ...text.body, color: colors.error, flex: 1 },
  field: { gap: spacing.xs },
  input: { ...text.body, backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 52 },
  multiline: { minHeight: 132, paddingTop: spacing.md, textAlignVertical: "top" },
  inputError: { borderColor: colors.error },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.brick, borderColor: colors.brick },
  chipLabel: { includeFontPadding: false },
  chipOnLabel: { color: colors.white },
  fieldError: { ...text.secondary, color: colors.error },
});
