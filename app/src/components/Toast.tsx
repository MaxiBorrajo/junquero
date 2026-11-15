import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";
import { colors, fonts, radius, spacing } from "../theme";

type Tone = "success" | "error" | "info";
interface ToastOptions {
  text: string;
  tone?: Tone;
  icon?: IconName;
  durationMs?: number;
}

// Una confirmación tiene que alcanzar para leerse con calma; los errores se quedan un poco más.
export const DEFAULT_DURATION_MS = 7000;
export const ERROR_DURATION_MS = 9000;
const TONE_COLOR = { success: colors.success, error: colors.error, info: colors.info } as const;
const TONE_ICON: Record<Tone, IconName> = { success: "check", error: "alert", info: "info" };

const ToastContext = createContext<(options: ToastOptions) => void>(() => {});

export const useToast = () => useContext(ToastContext);

// Aviso que se mantiene visible aunque se cambie de pantalla (por ejemplo al volver a "Mis trabajos").
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { key: number }) | null>(null);
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [progress]);

  const show = useCallback(
    (options: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      counter.current += 1;
      setToast({ ...options, key: counter.current });
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
      timer.current = setTimeout(hide, options.durationMs ?? (options.tone === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS));
    },
    [hide, progress],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const value = useMemo(() => show, [show]);
  const tone = toast?.tone ?? "success";

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + 92, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}
        >
          <Pressable accessibilityRole="alert" onPress={hide} style={styles.card}>
            <View style={[styles.badge, { backgroundColor: TONE_COLOR[tone] }]}>
              <Icon name={toast.icon ?? TONE_ICON[tone]} size={20} color={colors.white} />
            </View>
            <Text style={styles.text}>{toast.text}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.md, right: spacing.md, alignItems: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 4,
    maxWidth: 520,
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 4,
    paddingLeft: spacing.sm + 4,
    paddingRight: spacing.md,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  text: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.white },
});
