import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors, fonts, radius, spacing, text } from "../theme";

export type BannerTone = "sand" | "info" | "success" | "warning" | "error";

const TONES: Record<BannerTone, { background: string; border: string; icon: string; defaultIcon: IconName }> = {
  sand: { background: colors.sand, border: colors.sand, icon: colors.brick, defaultIcon: "info" },
  info: { background: colors.white, border: colors.info, icon: colors.info, defaultIcon: "info" },
  success: { background: colors.white, border: colors.success, icon: colors.success, defaultIcon: "check" },
  warning: { background: colors.white, border: colors.warning, icon: colors.warning, defaultIcon: "alert" },
  error: { background: colors.white, border: colors.error, icon: colors.error, defaultIcon: "alert" },
};

// Aviso que se queda en la pantalla (una invitación, una advertencia, un estado). Nunca se usa para confirmar una acción: eso es un toast.
export function Banner({ tone = "sand", icon, children, action }: { tone?: BannerTone; icon?: IconName; children: ReactNode; action?: { label: string; onPress: () => void } }) {
  const look = TONES[tone];
  return (
    <View style={[styles.banner, { backgroundColor: look.background, borderColor: look.border }]} accessibilityRole={tone === "error" || tone === "warning" ? "alert" : undefined}>
      <Icon name={icon ?? look.defaultIcon} size={20} color={look.icon} />
      <View style={styles.body}>
        <Text style={[text.body, { fontSize: 15 }]}>{children}</Text>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
            <Text style={[styles.action, { color: look.icon }]}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm + 4, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  body: { flex: 1, gap: spacing.xs },
  action: { fontFamily: fonts.semibold, fontSize: 14, textDecorationLine: "underline" },
});
